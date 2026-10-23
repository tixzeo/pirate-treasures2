import * as THREE from 'three';
import { Sea, addSky, addClouds, waveHeight } from './sea.js';
import { buildShip, Vessel } from './ship.js';
import { buildIsland, buildBeacon, buildMarker } from './island.js';
import { ISLANDS, BOSS_HOME, SCENERY } from './islands.js';
import { Effects } from './fx.js';
import { sfx } from './sound.js';

const RELOAD = 3.2;            // seconds between broadsides of one side
const BALL_SPEED_H = 42;       // horizontal speed of a cannonball, m/s
const G = 9.8;

// The open sea: the player's ship, the treasure islands in order, and the boss that patrols nearby.
export class World {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, .5, 5000);
    const { light, sun } = addSky(this.scene, renderer);
    this.light = light;
    this.sea = new Sea(this.scene, sun);
    addClouds(this.scene);
    this.fx = new Effects(this.scene);

    // Player: the brigantine from part one's shipyard.
    this.player = new Vessel(buildShip({ hull: 'polished_oak', trim: 'pirate_gold', sail: 'sail_canvas', flag: 'black_sailcloth', masts: 2, length: 14 }), { hp: 100 });
    this.scene.add(this.player.mesh);
    this.reload = { left: 0, right: 0 };

    // Treasure islands, each with a ring on the water where you can land.
    this.isles = ISLANDS.map(def => {
      const isl = buildIsland({ radius: def.radius, seed: def.seed });
      isl.position.set(def.x, 0, def.z);
      isl.userData.def = def;
      isl.userData.done = false;
      const ring = buildBeacon(isl.userData.radius + 9);
      ring.position.copy(isl.position).setY(.6);
      isl.userData.ring = ring;
      this.scene.add(isl, ring);
      return isl;
    });
    const scenery = SCENERY.map(([x, z, r, seed]) => {
      const isl = buildIsland({ radius: r, seed, chest: false, palms: 4 });
      isl.position.set(x, 0, z);
      this.scene.add(isl);
      return isl;
    });
    this.sea.setIslands([...this.isles, ...scenery]);
    // A beam of light and a golden arrow hang over whatever you should sail to next.
    this.marker = buildMarker();
    this.scene.add(this.marker);

    // Boss: «Каракатица», captain Scar's schooner from island 12.
    this.boss = new Vessel(buildShip({ hull: 'weathered_hull', hullTint: '#8a7f99', trim: 'worn_iron', sail: 'black_sailcloth', sailTint: '#9a8fb0', flag: 'crimson_sailcloth', masts: 2, length: 15 }), { hp: 150, maxSpeed: 9, turnRate: .55 });
    this.bossHome = new THREE.Vector3(BOSS_HOME.x, 0, BOSS_HOME.z);
    this.boss.pos.copy(this.bossHome).add(new THREE.Vector3(40, 0, 0));
    this.boss.throttle = .5;
    this.boss.reload = 2;
    this.scene.add(this.boss.mesh);
    this.bossBeaten = false;

    this.state = 'sail';
    this.camYaw = 0;
    this.camPos = new THREE.Vector3(0, 12, 30);
    this.time = 0;
    this.queue = [];
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // An unvisited treasure island close enough to land on, or null.
  nearIsland() {
    return this.isles.find(isl => !isl.userData.done && this.player.pos.distanceTo(isl.position) < isl.userData.radius + 12) || null;
  }

  // What to sail to next: the first unvisited island, then Scar, then nothing.
  target() {
    const isl = this.isles.find(i => !i.userData.done);
    if (isl) return { kind: 'isle', name: isl.userData.def.name, pos: isl.position, isle: isl };
    if (!this.bossBeaten) return { kind: 'boss', name: '«Каракатица»', pos: this.boss.pos };
    return null;
  }

  // Bearing of a point relative to the bow, in radians (positive is to the left).
  bearing(pos) {
    const to = pos.clone().sub(this.player.pos);
    return THREE.MathUtils.euclideanModulo(Math.atan2(-to.x, -to.z) - this.player.heading + Math.PI, Math.PI * 2) - Math.PI;
  }

  // Broadside from one side of a ship. Aims at `target` when it is on that side, else fires at a default range.
  broadside(ship, side, target, spread = .04) {
    const dir = ship.side(side);
    let range = 55;
    if (target) {
      const to = target.pos.clone().sub(ship.pos); to.y = 0;
      const ang = dir.angleTo(to.clone().normalize());
      // Lead a moving target by where it will be when the ball lands.
      const lead = target.forward().multiplyScalar(target.speed * to.length() / BALL_SPEED_H);
      if (ang < .6) range = THREE.MathUtils.clamp(to.add(lead).length(), 15, 110);
    }
    // The guns go off one after another; update() fires them when their time comes.
    ship.mesh.userData.muzzles[side].forEach((m, i) => {
      this.queue.push({ at: this.time + i * .11 + Math.random() * .06, ship, side, m, range, spread });
    });
    sfx('cannon');
  }

  shot({ ship, side, m, range, spread }) {
    if (ship.hp <= 0) return;
    ship.mesh.updateMatrixWorld();
    const from = m.getWorldPosition(new THREE.Vector3());
    const r = range * (1 + (Math.random() - .5) * spread * 2);
    const t = r / BALL_SPEED_H;
    const d = ship.side(side).applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - .5) * spread);
    const vel = d.multiplyScalar(BALL_SPEED_H).add(ship.forward().multiplyScalar(ship.speed));
    vel.y = .5 * G * t - (from.y - .5) / t;
    this.fx.shoot(from, vel, ship);
    this.fx.puff('smoke', from.clone().addScaledVector(ship.side(side), 1.5), { size: .9, vel: ship.side(side).multiplyScalar(3).setY(1) });
    this.fx.puff('fire', from, { size: .5 });
  }

  fire(side) {
    if (this.state !== 'battle' && this.state !== 'sail') return;
    if (this.reload[side] > 0 || this.player.hp <= 0) return;
    this.reload[side] = RELOAD;
    this.broadside(this.player, side, this.state === 'battle' ? this.boss : null, .03);
  }

  // Whether a ball is inside a ship's hull box.
  hits(ball, ship) {
    if (ball.owner === ship || ship.hp <= 0) return false;
    const p = ship.mesh.worldToLocal(ball.m.position.clone());
    const L = ship.mesh.userData.length / 2 + .4, W = ship.mesh.userData.width / 2 + .5;
    return Math.abs(p.x) < W && Math.abs(p.z) < L && p.y > -2 && p.y < 4;
  }

  onBall(ball) {
    for (const ship of [this.player, this.boss]) {
      if (!this.hits(ball, ship)) continue;
      const dmg = ship === this.boss ? 6 : this.immortal ? 0 : 5;
      ship.hp = Math.max(0, ship.hp - dmg);
      this.fx.burst('fire', ball.m.position, 4, .6, 3);
      this.fx.burst('debris', ball.m.position, 5, 1, 5);
      this.fx.puff('smoke', ball.m.position, { size: 1.6 });
      sfx('hit');
      if (ship === this.player) this.shake = .5;
      this.ui.battleHud(this.player, this.boss);
      return true;
    }
    return false;
  }

  startBattle() {
    this.state = 'battle';
    this.boss.throttle = .8;
    this.boss.reload = 3;
    this.ui.banner('«Каракатица» идёт на абордаж!', 'Шхуна капитана Шрама. Ставьте корабль бортом и давайте залп: Q — левый борт, E — правый.');
    this.ui.battleHud(this.player, this.boss);
  }

  // Scar keeps about 45 m away and turns his side to you before firing.
  bossAI(dt) {
    const b = this.boss, to = this.player.pos.clone().sub(b.pos); to.y = 0;
    const dist = to.length();
    const toDir = to.clone().normalize();
    // Which side faces the player, and the heading that would put that side square on.
    const side = b.side('right').dot(toDir) > 0 ? 'right' : 'left';
    const want = Math.atan2(-toDir.x, -toDir.z) + (side === 'right' ? Math.PI / 2 : -Math.PI / 2);
    let goal = want;
    if (dist > 70) goal = Math.atan2(-toDir.x, -toDir.z);          // close in
    else if (dist < 28) goal = Math.atan2(toDir.x, toDir.z);       // open the range
    let diff = THREE.MathUtils.euclideanModulo(goal - b.heading + Math.PI, Math.PI * 2) - Math.PI;
    b.rudder = THREE.MathUtils.clamp(diff * 2, -1, 1);
    b.throttle = dist > 70 ? 1 : .55;
    b.reload -= dt;
    const aim = b.side(side).angleTo(toDir);
    if (b.reload <= 0 && aim < .35 && dist < 100) {
      b.reload = 4.2;
      this.broadside(b, side, this.player, .09);
    }
  }

  bossPatrol(dt) {
    const b = this.boss, to = this.bossHome.clone().sub(b.pos); to.y = 0;
    // Circle round the home point.
    const tangent = new THREE.Vector3(-to.z, 0, to.x).normalize().add(to.clone().normalize().multiplyScalar((to.length() - 40) / 40));
    const goal = Math.atan2(-tangent.x, -tangent.z);
    const diff = THREE.MathUtils.euclideanModulo(goal - b.heading + Math.PI, Math.PI * 2) - Math.PI;
    b.rudder = THREE.MathUtils.clamp(diff * 2, -1, 1);
    b.throttle = .45;
  }

  update(dt, input) {
    this.time += dt;
    const t = this.time, p = this.player;
    if (this.state === 'sail' || this.state === 'battle') {
      if (p.hp > 0) {
        p.throttle = input.throttle;
        p.rudder = input.rudder;
      } else { p.throttle = 0; p.rudder = 0; }
    }
    for (const s of ['left', 'right']) this.reload[s] = Math.max(0, this.reload[s] - dt);

    if (!this.bossBeaten) {
      if (this.state === 'battle') this.bossAI(dt);
      else this.bossPatrol(dt);
      if (this.state === 'sail' && p.pos.distanceTo(this.boss.pos) < 85 && p.hp > 0) this.startBattle();
    }
    p.update(dt, t);
    if (!this.bossGone) this.boss.update(dt, t);
    this.updateFloaters(dt, t);
    // Ships cannot sail through the islands.
    for (const isl of this.scene.children.filter(o => o.userData.radius)) {
      for (const v of [p, this.boss]) {
        const d = v.pos.clone().sub(isl.position); d.y = 0;
        const min = isl.userData.radius + 3;
        if (d.length() < min) { v.pos.addScaledVector(d.normalize(), min - d.length()); v.speed *= .5; }
      }
    }

    if (this.state === 'battle') {
      if (this.boss.hp <= 0 && !this.bossBeaten) this.winBattle();
      else if (p.hp <= 0 && !this.lost) this.loseBattle();
    }
    if (this.boss.hp <= 0 && !this.bossGone) this.sinkBoss(dt);
    if (p.hp <= 0) p.sinking = Math.min(.35, p.sinking + dt * .15);
    // Burning ships smoke.
    for (const v of [p, this.boss]) if (v.hp < v.maxHp * .5 && v.sinking < .6 && Math.random() < dt * (v.hp <= 0 ? 12 : 4))
      this.fx.puff('smoke', v.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 4, 3, (Math.random() - .5) * 6)), { size: 1.2 });

    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].at <= t) this.shot(this.queue.splice(i, 1)[0]);
    this.fx.update(dt, t, b => this.onBall(b));
    this.sea.update(t, p.pos);
    this.sea.addWake(dt, [p, this.boss]);
    const goal = this.target();
    for (const isl of this.isles) {
      const ring = isl.userData.ring, cur = goal && goal.isle === isl;
      ring.visible = !isl.userData.done;
      ring.scale.setScalar(1 + Math.sin(t * 2) * .03);
      ring.material.opacity = (cur ? .6 : .25) + Math.sin(t * 3) * (cur ? .3 : .1);
      ring.position.y = waveHeight(ring.position.x, ring.position.z, t) * .3 + .5;
    }
    this.marker.visible = !!goal && this.state !== 'battle';
    if (goal) {
      const h = goal.kind === 'isle' ? goal.isle.userData.radius * .6 + 14 : 26;
      this.marker.position.set(goal.pos.x, h + Math.sin(t * 2) * 1.2, goal.pos.z);
      this.marker.userData.arrow.rotation.y = t * 1.5;
      this.marker.userData.beam.material.opacity = .22 + Math.sin(t * 2.5) * .06;
      this.marker.userData.setColor(goal.kind === 'boss' ? '#ff5a4a' : '#ffd24a');
    }

    this.updateCamera(dt);
    this.light.position.copy(p.pos).add(new THREE.Vector3(25, 80, 60));
    this.light.target.position.copy(p.pos);

    this.ui.sailHud({
      speed: Math.abs(p.speed), throttle: p.throttle, reload: this.reload, reloadMax: RELOAD,
      canDock: this.state === 'sail' && !!this.nearIsland(), battle: this.state === 'battle',
      marks: this.marks(),
      goal: goal && { name: goal.name, kind: goal.kind, dist: Math.round(goal.pos.distanceTo(p.pos)), ang: this.bearing(goal.pos) },
    });
  }

  // Compass bar markers: angle relative to the bow and distance.
  marks() {
    const goal = this.target();
    const out = this.isles.filter(i => !i.userData.done).map(i => ({
      ang: this.bearing(i.position), icon: '✕', label: i.userData.def.name, dist: Math.round(i.position.distanceTo(this.player.pos)), goal: goal && goal.isle === i,
    }));
    if (!this.bossBeaten) out.push({ ang: this.bearing(this.boss.pos), icon: '☠', label: 'Шрам', dist: Math.round(this.boss.pos.distanceTo(this.player.pos)), goal: goal && goal.kind === 'boss', foe: true });
    return out;
  }

  updateCamera(dt) {
    const p = this.player, f = p.forward();
    // A tall phone screen sees less to the sides, so the camera stands further back.
    const k = THREE.MathUtils.clamp(1.25 / this.camera.aspect, 1, 2.1);
    const back = (this.state === 'battle' ? 34 : 26) * k, up = (this.state === 'battle' ? 15 : 10) * (1 + (k - 1) * .6);
    const want = p.pos.clone().addScaledVector(f, -back).add(new THREE.Vector3(0, up, 0));
    want.y = Math.max(want.y, 4);
    this.camPos.lerp(want, Math.min(1, dt * 2.2));
    this.camera.position.copy(this.camPos);
    this.shake = Math.max(0, (this.shake || 0) - dt);
    if (this.shake) this.camera.position.add(new THREE.Vector3((Math.random() - .5), (Math.random() - .5), 0).multiplyScalar(this.shake));
    const look = p.pos.clone().addScaledVector(f, 10).add(new THREE.Vector3(0, 2, 0));
    if ((this.state === 'battle' && this.boss.hp > 0) || (this.boss.hp <= 0 && !this.bossGone)) look.lerp(this.boss.pos, .25);
    this.camera.lookAt(look);
  }

  // About twelve seconds from the last hit to the last bubble; then the wreck is gone for good.
  sinkBoss(dt) {
    const b = this.boss, before = b.sinking;
    b.throttle = 0; b.rudder = 0;
    b.speed *= 1 - dt * .8;
    b.sinking = Math.min(1, b.sinking + dt / 12);
    if (before === 0) {
      this.fx.burst('debris', b.pos.clone().setY(1.5), 14, 1.2, 7);
      this.spawnFloaters(b.pos, 9);
    }
    // Air and water churn where the hull goes down.
    if (Math.random() < dt * (b.sinking < .9 ? 14 : 4)) {
      const at = b.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 8, 0, (Math.random() - .5) * 12));
      at.y = waveHeight(at.x, at.z, this.time) + .2;
      this.fx.puff('splash', at, { size: .5 + Math.random() * .6 });
    }
    if (before < .35 && b.sinking >= .35) { sfx('splash'); this.fx.burst('splash', b.pos.clone().setY(.5), 10, 1, 4); }
    if (b.sinking >= 1) {
      this.bossGone = true;
      this.scene.remove(b.mesh);
      this.fx.burst('splash', b.pos.clone().setY(.3), 6, .8, 2);
      this.onBossGone && this.onBossGone();
    }
  }

  // Barrels and planks left floating where a ship went down; they drift and fade after a while.
  spawnFloaters(at, n) {
    this.floaters = this.floaters || [];
    const wood = new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: .9, flatShading: true, transparent: true });
    for (let i = 0; i < n; i++) {
      const barrel = i % 3 === 0;
      const m = new THREE.Mesh(barrel ? new THREE.CylinderGeometry(.5, .5, 1.1, 8) : new THREE.BoxGeometry(2.4 + Math.random() * 1.5, .25, .6), wood);
      if (barrel) m.rotation.z = Math.PI / 2;
      m.position.set(at.x + (Math.random() - .5) * 14, 0, at.z + (Math.random() - .5) * 18);
      m.castShadow = true;
      this.scene.add(m);
      this.floaters.push({ m, life: 25 + Math.random() * 8, spin: (Math.random() - .5) * .4, drift: new THREE.Vector3((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2), yaw: Math.random() * 6 });
    }
  }

  updateFloaters(dt, t) {
    if (!this.floaters) return;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.yaw += f.spin * dt;
      f.m.position.addScaledVector(f.drift, dt);
      f.m.position.y = waveHeight(f.m.position.x, f.m.position.z, t) - .05 - Math.max(0, 3 - f.life) * .4;
      f.m.rotation.y = f.yaw;
      if (f.life <= 0) { this.scene.remove(f.m); f.m.geometry.dispose(); this.floaters.splice(i, 1); }
    }
  }

  winBattle() {
    this.bossBeaten = true;
    this.state = 'sail';
    this.onBossBeaten && this.onBossBeaten();
    sfx('win');
    this.ui.battleHud(null);
    this.ui.banner('«Каракатица» идёт ко дну!', 'Шрам прыгает в шлюпку. Смотрите, как шхуна уходит под воду.', 5000, false);
    this.onGold && this.onGold(500);
  }

  loseBattle() {
    this.lost = true;
    sfx('lose');
    setTimeout(() => this.ui.dialog({
      title: 'Корабль пробит',
      icon: 'shield',
      text: 'Шрам оказался сильнее. Плотники залатают пробоины, а в следующий раз держитесь к нему бортом и не подставляйте корму.',
      buttons: [['Починиться и снова в бой', () => { this.ui.closeDialog(); this.repair(); }]],
    }), 1200);
  }

  repair() {
    const p = this.player;
    p.hp = p.maxHp; p.sinking = 0; p.speed = 0;
    this.lost = false;
    this.fx.clearBalls();
    this.queue = [];
    // Back off to where Scar is out of sight, he regains his crew too.
    const away = p.pos.clone().sub(this.boss.pos); away.y = 0; away.normalize();
    p.pos.copy(this.boss.pos).addScaledVector(away, 120);
    p.heading = Math.atan2(-away.x, -away.z);
    this.boss.hp = this.boss.maxHp;
    this.state = 'sail';
    this.ui.battleHud(null);
  }

  // Saved progress: which islands are done and whether Scar is already at the bottom.
  applySave(save) {
    for (const isl of this.isles) isl.userData.done = save.done.includes(isl.userData.def.name);
    if (save.bossBeaten && !this.bossGone) {
      this.bossBeaten = this.bossGone = true;
      this.boss.hp = 0;
      this.scene.remove(this.boss.mesh);
    }
  }

  // Back to a fresh voyage: islands open, Scar afloat, the ship at the start.
  resetProgress() {
    for (const isl of this.isles) isl.userData.done = false;
    const b = this.boss;
    b.hp = b.maxHp; b.sinking = 0; b.speed = 0;
    b.pos.copy(this.bossHome).add(new THREE.Vector3(40, 0, 0));
    if (this.bossGone) this.scene.add(b.mesh);
    this.bossBeaten = this.bossGone = false;
    this.fx.clearBalls();
    this.queue = [];
    const p = this.player;
    p.hp = p.maxHp; p.sinking = 0; p.speed = 0; p.heading = 0;
    p.pos.set(0, 0, 0);
    this.camPos.set(0, 12, 30);
    this.lost = false;
    this.state = 'sail';
    this.ui.battleHud(null);
  }

  // Put the ship next to a place, bow toward it.
  teleport(to, dist) {
    const p = this.player, from = to.clone().add(new THREE.Vector3(0, 0, dist));
    from.y = 0;
    p.pos.copy(from);
    p.heading = 0;
    p.speed = 0;
    this.camPos.copy(from).add(new THREE.Vector3(0, 12, 28));
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
