import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Board, N, isSpecial, VALUE, COMPASS, BARREL, NAMES } from './board.js';
import { buildPiece, SPECIAL_WORDS, SPECIAL_GLOW } from './pieces.js';
import { tween, wait, ease } from '../tween.js';
import { Effects } from '../fx.js';
import { pbr } from '../materials.js';
import { sfx } from '../sound.js';

const COMBO_WORDS = ['', '', 'Йо-хо-хо!', 'Тысяча чертей!', 'На абордаж!'];
const CELL_A = '#e7c58c', CELL_B = '#d3a86a';

// Soft round glow drawn once on a canvas; tinted per special piece.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(.35, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Deep sea behind the board: a vertical gradient with a lighter middle.
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0b2333');
  grad.addColorStop(.45, '#1a5068');
  grad.addColorStop(1, '#081a26');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundedTile(size, radius, depth) {
  const s = new THREE.Shape(), h = size / 2, r = radius;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 2, curveSegments: 4 });
}

// The island treasure hunt: an 8x8 board of 3D treasures on a wooden deck.
export class Match3 {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.scene.background = backdropTexture();
    // Soft studio light for reflections, so gold and gems shine instead of going black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .7;
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    this.scene.add(new THREE.HemisphereLight('#fff4dd', '#2a4a5a', 1.3));
    const key = new THREE.DirectionalLight('#fff1d6', 2.6);
    key.position.set(-4, 8, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -.001;
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
    this.scene.add(key);

    // Board tilted back a little so the treasures read as 3D.
    this.boardGroup = new THREE.Group();
    this.boardGroup.rotation.x = -.42;
    this.scene.add(this.boardGroup);
    const plank = pbr('deck_oak', { repeat: [4, .5], color: '#c89a78' });
    for (let i = 0; i < N + 1; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(N + .9, .98, .3), plank);
      p.position.set(0, 4 - i, -.5);
      p.receiveShadow = true;
      this.boardGroup.add(p);
    }
    // Dark frame with brass corners, like a sea chest.
    const frameMat = pbr('weathered_hull', { repeat: [4, .4], color: '#a08a78' });
    for (const [w, h, x, y] of [[N + 1.4, .5, 0, 4.45], [N + 1.4, .5, 0, -4.45], [.5, N + .4, -4.45, 0], [.5, N + .4, 4.45, 0]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, .8), frameMat);
      f.position.set(x, y, -.3);
      f.castShadow = true;
      this.boardGroup.add(f);
    }
    const brass = pbr('aged_bronze', { color: '#ffd28a' });
    for (const [x, y] of [[-4.45, 4.45], [4.45, 4.45], [-4.45, -4.45], [4.45, -4.45]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(.75, .75, .9), brass);
      c.position.set(x, y, -.28);
      this.boardGroup.add(c);
    }

    // Cells: a checkerboard of raised tiles so every square reads on its own.
    const tileGeo = roundedTile(.88, .14, .08);
    const cellMat = pbr('sail_canvas', { repeat: 1.2, normal: .5 });
    this.cells = [];
    for (let r = 0; r < N; r++) {
      this.cells.push([]);
      for (let c = 0; c < N; c++) {
        const mat = cellMat.clone();
        mat.color.set((r + c) % 2 ? CELL_B : CELL_A);
        mat.emissive.set('#000000');
        const m = new THREE.Mesh(tileGeo, mat);
        const p = this.cellPos(r, c);
        m.position.set(p.x, p.y, -.4);
        m.receiveShadow = true;
        this.boardGroup.add(m);
        this.cells[r].push(m);
      }
    }

    this.hitPlane = new THREE.Mesh(new THREE.PlaneGeometry(N, N), new THREE.MeshBasicMaterial({ visible: false }));
    this.boardGroup.add(this.hitPlane);
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(.47, .055, 8, 32), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
    this.selRing.visible = false;
    this.boardGroup.add(this.selRing);

    this.glow = glowTexture();
    this.fx = new Effects(this.boardGroup);
    this.meshes = new Map();
    this.ray = new THREE.Raycaster();
    this.active = false;
    this.hover = null;
    this.bindInput();
  }

  cellPos(r, c) { return new THREE.Vector3(c - 3.5, 3.5 - r, 0); }

  // level: { moves, types, name, score?, collect? }; onEnd(result) gets { win, gold, score }.
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
    if (isSpecial(t)) {
      // Specials glow and have a spinning ring so they stand out on a full board.
      const color = SPECIAL_GLOW[t];
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      halo.scale.setScalar(1.9);
      halo.position.z = -.2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.48, .035, 6, 28, Math.PI * 1.6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 }));
      ring.position.z = .05;
      m.add(halo, ring);
      m.userData.halo = halo;
      m.userData.ring = ring;
      m.userData.inner.scale.setScalar(1.15);
    }
    this.boardGroup.add(m);
    this.meshes.set(id, m);
    return m;
  }

  // Goals in the HUD: points, or treasures of one kind to collect.
  goals() {
    const out = [];
    if (this.level.score) out.push({ label: 'Очки', have: this.board.score, need: this.level.score });
    for (const t in this.level.collect || {}) out.push({ label: NAMES[t][0].toUpperCase() + NAMES[t].slice(1), have: this.board.collected[t] || 0, need: this.level.collect[t] });
    return out;
  }

  hud() {
    this.ui.matchHud({ name: this.level.name, moves: this.moves, score: this.board.score, gold: this.gold(), goals: this.goals() });
  }

  gold() {
    let g = 0;
    for (const t in this.board.collected) g += (VALUE[t] || 0) * this.board.collected[t];
    return g;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // Fit the board (about 10 units square) with room for the HUD above.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needH = 12.6, needW = 10.2;
    const dist = Math.max(needH / 2 / Math.tan(fov / 2), needW / 2 / (Math.tan(fov / 2) * this.camera.aspect));
    this.camera.position.set(0, -1.1, dist);
    this.camera.lookAt(0, -1.1, 0);
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
      if (!cell) { this.select(null); return; }
      down = cell;
      if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) {
        const a = this.sel; this.select(null); down = null;
        this.swap(a, cell);
      } else this.select(cell);
    });
    el.addEventListener('pointermove', e => {
      if (!this.active) return;
      if (e.pointerType === 'mouse') this.hover = cellAt(e);
      if (!down || this.busy) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) < 18) return;
      const b = Math.abs(dx) > Math.abs(dy) ? { r: down.r, c: down.c + Math.sign(dx) } : { r: down.r + Math.sign(dy), c: down.c };
      const a = down; down = null; this.select(null);
      if (b.r >= 0 && b.c >= 0 && b.r < N && b.c < N) this.swap(a, b);
    });
    el.addEventListener('pointerleave', () => { this.hover = null; });
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

  // Lights up the cells a blast reaches for a moment.
  flashCells(ids, color) {
    for (const id of ids) {
      const m = this.meshes.get(id);
      if (!m) continue;
      const r = Math.round(3.5 - m.position.y), c = Math.round(m.position.x + 3.5);
      const cell = this.cells[r] && this.cells[r][c];
      if (cell) { cell.userData.flash = 1; cell.userData.flashColor = color; }
    }
  }

  async play(step) {
    if (step.kind === 'clear') {
      for (const f of step.fired) {
        const m = this.meshes.get(f.id);
        this.ui.flash(f.t === COMPASS ? 'Курс на сокровища!' : f.t === BARREL ? 'Бабах!' : 'Пли!');
        sfx(f.t === BARREL ? 'boom' : 'cannon');
        if (m) await tween(m.scale, { x: 1.7, y: 1.7, z: 1.7 }, 160);
        this.flashCells([f.id, ...f.hits], SPECIAL_GLOW[f.t]);
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
        this.fx.burst('spark', p, 10, .35, 5);
        this.ui.flash(SPECIAL_WORDS[mk.t]);
        sfx('forge');
      }
      if (!step.fired.length && !step.made.length && step.combo > 1) this.ui.flash(COMBO_WORDS[step.combo] || `Комбо ×${step.combo}`);
      if (!step.fired.length) sfx('match', step.combo);
      this.flashCells(step.cleared, '#fff1b8');
      await Promise.all(step.cleared.map(id => {
        const m = this.meshes.get(id);
        if (!m) return null;
        this.fx.burst('spark', m.position, 4, .3, 3);
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
    if (this.goals().every(g => g.have >= g.need)) return this.finish(true);
    if (this.moves <= 0) return this.finish(false);
  }

  finish(win) {
    this.over = true;
    this.select(null);
    const gold = win ? this.gold() + this.moves * 5 : Math.floor(this.gold() / 2);
    sfx(win ? 'win' : 'lose');
    setTimeout(() => this.onEnd({ win, gold, score: this.board.score, movesLeft: this.moves }), 500);
  }

  update(dt, t) {
    if (!this.active) return;
    for (const m of this.meshes.values()) {
      const inner = m.userData.inner;
      inner.rotation.y = Math.sin(t * 1.2 + m.userData.spin) * .35;
      if (m.userData.halo) {
        const k = .5 + .5 * Math.sin(t * 5 + m.userData.spin);
        m.userData.halo.scale.setScalar(1.6 + k * .6);
        m.userData.halo.material.opacity = .55 + k * .45;
        m.userData.ring.rotation.z = -t * 3;
        inner.rotation.z = Math.sin(t * 3 + m.userData.spin) * .15;
      }
    }
    this.selRing.rotation.z = t * 2;
    this.selRing.scale.setScalar(1 + Math.sin(t * 6) * .05);

    // Cell highlights: the chosen cell, the cells it can swap with, the hover cell, the hint and blast flashes.
    let hint = null;
    if (!this.busy && !this.over) {
      this.idle += dt;
      if (this.idle > 5) hint = this.board.findMove();
    } else this.idle = 0;
    const pulse = .5 + .5 * Math.sin(t * 6);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const cell = this.cells[r][c], mat = cell.material;
      let glow = 0, color = '#ffd24a';
      if (this.sel) {
        const d = Math.abs(this.sel.r - r) + Math.abs(this.sel.c - c);
        if (d === 0) glow = .55;
        else if (d === 1) glow = .18 + pulse * .12;
      }
      if (this.hover && this.hover.r === r && this.hover.c === c && !this.busy) glow = Math.max(glow, .22);
      if (hint && hint.some(h => h.r === r && h.c === c)) { glow = Math.max(glow, .2 + pulse * .35); color = '#7fe0ff'; }
      if (cell.userData.flash > 0) {
        cell.userData.flash = Math.max(0, cell.userData.flash - dt * 2.5);
        if (cell.userData.flash > glow) { glow = cell.userData.flash; color = cell.userData.flashColor; }
      }
      mat.emissive.set(color);
      mat.emissiveIntensity = glow;
      cell.position.z = -.4 + glow * .08;
    }
    for (const m of this.meshes.values()) m.userData.inner.position.z = 0;
    if (hint) for (const h of hint) {
      const m = this.meshes.get(this.board.at(h.r, h.c).id);
      if (m) m.userData.inner.position.z = Math.abs(Math.sin(t * 8)) * .25;
    }
    this.shake = Math.max(0, (this.shake || 0) - dt);
    this.boardGroup.position.x = this.shake ? (Math.random() - .5) * this.shake * .4 : 0;
    this.fx.update(dt, t);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
