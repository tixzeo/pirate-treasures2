import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Board, N, isSpecial, VALUE, COMPASS } from './board.js';
import { buildPiece, SPECIAL_WORDS } from './pieces.js';
import { tween, wait, ease } from '../tween.js';
import { Effects } from '../fx.js';
import { sfx } from '../sound.js';

const COMBO_WORDS = ['', '', 'Йо-хо-хо!', 'Тысяча чертей!', 'На абордаж!'];

// The island treasure hunt: an 8x8 board of 3D treasures on a wooden deck.
export class Match3 {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#123447');
    // Soft studio light for reflections, so gold and gems shine instead of going black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .6;
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    this.scene.add(new THREE.HemisphereLight('#fff4dd', '#2a4a5a', 1.4));
    const key = new THREE.DirectionalLight('#fff1d6', 2.4);
    key.position.set(-4, 8, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
    this.scene.add(key);

    // Board tilted back a little so the treasures read as 3D.
    this.boardGroup = new THREE.Group();
    this.boardGroup.rotation.x = -.42;
    this.scene.add(this.boardGroup);
    const plank = new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: .9, flatShading: true });
    for (let i = 0; i < N; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(N + .6, .96, .3), plank.clone());
      p.material.color.offsetHSL(0, 0, (i % 2 ? .03 : -.02) + Math.random() * .02);
      p.position.set(0, 3.5 - i, -.45);
      p.receiveShadow = true;
      this.boardGroup.add(p);
    }
    const frameMat = new THREE.MeshStandardMaterial({ color: '#4a2c16', roughness: .8, flatShading: true });
    for (const [w, h, x, y] of [[N + 1.2, .4, 0, 4.3], [N + 1.2, .4, 0, -4.3], [.4, N + .2, -4.4, 0], [.4, N + .2, 4.4, 0]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, .7), frameMat);
      f.position.set(x, y, -.3);
      f.castShadow = true;
      this.boardGroup.add(f);
    }
    this.hitPlane = new THREE.Mesh(new THREE.PlaneGeometry(N, N), new THREE.MeshBasicMaterial({ visible: false }));
    this.boardGroup.add(this.hitPlane);
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(.46, .05, 6, 24), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
    this.selRing.visible = false;
    this.boardGroup.add(this.selRing);

    this.fx = new Effects(this.boardGroup);
    this.meshes = new Map();
    this.ray = new THREE.Raycaster();
    this.active = false;
    this.bindInput();
  }

  cellPos(r, c) { return new THREE.Vector3(c - 3.5, 3.5 - r, 0); }

  // level: { moves, types, score, name }; onEnd(result) gets { win, gold, score }.
  start(level, onEnd) {
    this.level = level;
    this.onEnd = onEnd;
    this.board = new Board({ types: level.types });
    this.moves = level.moves;
    this.busy = false;
    this.over = false;
    this.sel = null;
    this.idle = 0;
    this.meshes.forEach(m => this.boardGroup.remove(m));
    this.meshes.clear();
    for (const t of this.board.tiles()) this.addMesh(t.id, t.t, t.r, t.c, -6 - (N - t.r) * .4);
    // Opening drop, row by row.
    this.busy = true;
    Promise.all(this.board.tiles().map(t => {
      const m = this.meshes.get(t.id);
      return wait(t.c * 30 + (N - t.r) * 40).then(() => tween(m.position, { y: this.cellPos(t.r, t.c).y }, 450, ease.bounce));
    })).then(() => { this.busy = false; });
    this.active = true;
    this.hud();
  }

  addMesh(id, t, r, c, yFrom) {
    const m = buildPiece(t);
    const p = this.cellPos(r, c);
    m.position.set(p.x, yFrom ?? p.y, 0);
    m.userData.spin = Math.random() * 6;
    this.boardGroup.add(m);
    this.meshes.set(id, m);
    return m;
  }

  hud() {
    this.ui.matchHud({
      name: this.level.name, moves: this.moves, score: this.board.score, need: this.level.score,
      gold: this.gold(),
    });
  }

  gold() {
    let g = 0;
    for (const t in this.board.collected) g += (VALUE[t] || 0) * this.board.collected[t];
    return g;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // Fit the board (about 9.6 units square) with room for the HUD above.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needH = 11.5, needW = 9.8;
    const dist = Math.max(needH / 2 / Math.tan(fov / 2), needW / 2 / (Math.tan(fov / 2) * this.camera.aspect));
    this.camera.position.set(0, -.4, dist);
    this.camera.lookAt(0, -.4, 0);
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    const el = this.renderer.domElement;
    let down = null;
    const cellAt = e => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      const hit = this.ray.intersectObject(this.hitPlane)[0];
      if (!hit) return null;
      const p = this.boardGroup.worldToLocal(hit.point.clone());
      const c = Math.floor(p.x + 4), row = Math.floor(4 - p.y);
      return c >= 0 && c < N && row >= 0 && row < N ? { r: row, c, x: e.clientX, y: e.clientY } : null;
    };
    el.addEventListener('pointerdown', e => {
      if (!this.active || this.busy || this.over) return;
      const cell = cellAt(e);
      if (!cell) return;
      down = cell;
      if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) {
        const a = this.sel; this.select(null); down = null;
        this.swap(a, cell);
      } else this.select(cell);
    });
    el.addEventListener('pointermove', e => {
      if (!down || !this.active || this.busy) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) < 18) return;
      const b = Math.abs(dx) > Math.abs(dy) ? { r: down.r, c: down.c + Math.sign(dx) } : { r: down.r + Math.sign(dy), c: down.c };
      const a = down; down = null; this.select(null);
      if (b.r >= 0 && b.c >= 0 && b.r < N && b.c < N) this.swap(a, b);
    });
    addEventListener('pointerup', () => { down = null; });
  }

  select(cell) {
    this.sel = cell;
    this.selRing.visible = !!cell;
    if (cell) { const p = this.cellPos(cell.r, cell.c); this.selRing.position.set(p.x, p.y, .1); sfx('tick'); }
  }

  async swap(a, b) {
    this.busy = true;
    this.idle = 0;
    const ma = this.meshes.get(this.board.at(a.r, a.c).id), mb = this.meshes.get(this.board.at(b.r, b.c).id);
    const pa = this.cellPos(a.r, a.c), pb = this.cellPos(b.r, b.c);
    sfx('swap');
    await Promise.all([tween(ma.position, { x: pb.x, y: pb.y }, 180), tween(mb.position, { x: pa.x, y: pa.y }, 180)]);
    const steps = this.board.trySwap(a, b);
    if (!steps) {
      sfx('wrong');
      await Promise.all([tween(ma.position, { x: pa.x, y: pa.y }, 180), tween(mb.position, { x: pb.x, y: pb.y }, 180)]);
      this.busy = false;
      return;
    }
    this.moves--;
    this.hud();
    for (const s of steps) await this.play(s);
    this.hud();
    this.busy = false;
    this.checkEnd();
  }

  async play(step) {
    if (step.kind === 'clear') {
      for (const f of step.fired) {
        const m = this.meshes.get(f.id);
        this.ui.flash(f.t === COMPASS ? 'Курс на сокровища!' : f.t === 10 ? 'Бабах!' : 'Пли!');
        sfx(f.t === 10 ? 'boom' : 'cannon');
        if (m) await tween(m.scale, { x: 1.6, y: 1.6, z: 1.6 }, 160);
        for (const id of f.hits) { const h = this.meshes.get(id); if (h) this.fx.burst('fire', h.position, 3, .25, 2); }
        this.shake = .35;
      }
      for (const mk of step.made) {
        const old = this.meshes.get(mk.id);
        const p = old.position.clone();
        this.boardGroup.remove(old);
        const m = this.addMesh(mk.id, mk.t, 0, 0);
        m.position.copy(p);
        m.scale.setScalar(.2);
        tween(m.scale, { x: 1, y: 1, z: 1 }, 380, ease.back);
        this.ui.flash(SPECIAL_WORDS[mk.t]);
        sfx('forge');
      }
      if (!step.fired.length && !step.made.length && step.combo > 1) this.ui.flash(COMBO_WORDS[step.combo] || `Комбо ×${step.combo}`);
      if (!step.fired.length) sfx('match', step.combo);
      await Promise.all(step.cleared.map(id => {
        const m = this.meshes.get(id);
        if (!m) return null;
        this.fx.burst('spark', m.position, 3, .25, 3);
        return tween(m.scale, { x: 0, y: 0, z: 0 }, 220, ease.inOut).then(() => { this.boardGroup.remove(m); this.meshes.delete(id); });
      }));
      this.hud();
    } else if (step.kind === 'drop') {
      const moves = [];
      for (const f of step.fell) {
        const m = this.meshes.get(f.id);
        moves.push(tween(m.position, { y: this.cellPos(f.r, f.c).y }, 300, ease.bounce));
      }
      for (const s of step.spawned) {
        const m = this.addMesh(s.id, s.t, s.r, s.c, this.cellPos(s.from, s.c).y);
        moves.push(tween(m.position, { y: this.cellPos(s.r, s.c).y }, 340, ease.bounce));
      }
      await Promise.all(moves);
    } else if (step.kind === 'shuffle') {
      this.ui.flash('Перемешиваем!');
      for (const s of step.tiles) {
        const old = this.meshes.get(s.id);
        if (old.userData.t === s.t) continue;
        const p = old.position.clone();
        this.boardGroup.remove(old);
        this.addMesh(s.id, s.t, 0, 0).position.copy(p);
      }
      await wait(300);
    }
  }

  checkEnd() {
    if (this.board.score >= this.level.score) return this.finish(true);
    if (this.moves <= 0) return this.finish(false);
  }

  finish(win) {
    this.over = true;
    const gold = win ? this.gold() + this.moves * 5 : Math.floor(this.gold() / 2);
    sfx(win ? 'win' : 'lose');
    setTimeout(() => this.onEnd({ win, gold, score: this.board.score, movesLeft: this.moves }), 500);
  }

  update(dt, t) {
    if (!this.active) return;
    for (const m of this.meshes.values()) {
      const inner = m.userData.inner;
      inner.rotation.y = Math.sin(t * 1.2 + m.userData.spin) * .35;
      if (isSpecial(m.userData.t)) inner.rotation.z = Math.sin(t * 3 + m.userData.spin) * .15;
    }
    this.selRing.rotation.z = t * 2;
    this.selRing.scale.setScalar(1 + Math.sin(t * 6) * .05);
    // A hint wiggles a possible move after a few quiet seconds.
    if (!this.busy && !this.over) {
      this.idle += dt;
      if (this.idle > 6) {
        const mv = this.board.findMove();
        if (mv) for (const c of mv) { const m = this.meshes.get(this.board.at(c.r, c.c).id); if (m) m.userData.inner.position.z = Math.abs(Math.sin(t * 8)) * .25; }
      }
    } else this.idle = 0;
    if (this.idle <= 6) for (const m of this.meshes.values()) m.userData.inner.position.z = 0;
    this.shake = Math.max(0, (this.shake || 0) - dt);
    this.boardGroup.position.x = this.shake ? (Math.random() - .5) * this.shake * .4 : 0;
    this.fx.update(dt, t);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

