import * as THREE from 'three';
import { Sea, addSky, waveHeight } from './sea.js';
import { buildShip, Vessel } from './ship.js';
import { buildIsland, buildBeacon } from './island.js';
import { Effects } from './fx.js';
import { sfx } from './sound.js';

const RELOAD = 3.2;            // seconds between broadsides of one side
const BALL_SPEED_H = 42;       // horizontal speed of a cannonball, m/s
const G = 9.8;

// The open sea: the player's ship, the treasure island and the boss that patrols nearby.
export class World {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, .5, 5000);
    addSky(this.scene, renderer);
    this.light = this.scene.children.find(o => o.isDirectionalLight);
    this.sea = new Sea(this.scene);
    this.fx = new Effects(this.scene);

    // Player: the brigantine from part one's shipyard.
    this.player = new Vessel(buildShip({ hull: '#5e3a1f', trim: '#f2c14e', sail: '#f4ead6', flag: '#1b1b1b', masts: 2, length: 14 }), { hp: 100 });
    this.scene.add(this.player.mesh);
    this.reload = { left: 0, right: 0 };

    this.island = buildIsland({ radius: 20, seed: 7 });
    this.island.position.set(30, 0, -190);
    this.scene.add(this.island);
    this.beacon = buildBeacon(this.island.userData.radius + 9);
    this.beacon.position.copy(this.island.position).setY(.6);
    this.scene.add(this.beacon);
    this.islandDone = false;
    // A couple of empty islands so the sea is not bare.
    for (const [x, z, r, s] of [[-140, -120, 12, 3], [190, -260, 16, 11], [-90, 140, 9, 5], [120, 120, 11, 13]]) {
      const isl = buildIsland({ radius: r, seed: s, chest: false, palms: 4 });
      isl.position.set(x, 0, z);
      this.scene.add(isl);
    }

    // Boss: «Каракатица», captain Scar's schooner from island 12.
    this.boss = new Vessel(buildShip({ hull: '#2b2433', trim: '#8a8a8a', sail: '#4a4054', flag: '#b3322b', masts: 2, length: 15 }), { hp: 150, maxSpeed: 9, turnRate: .55 });
    this.bossHome = new THREE.Vector3(190, 0, -40);
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

  nearIsland() {
    if (this.islandDone) return false;
    const d = this.player.pos.distanceTo(this.island.position);
    return d < this.island.userData.radius + 12;
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
      const dmg = ship === this.boss ? 6 : 5;
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
    this.boss.update(dt, t);
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
    if (this.boss.hp <= 0) this.boss.sinking = Math.min(1, this.boss.sinking + dt * .12);
    if (p.hp <= 0) p.sinking = Math.min(.35, p.sinking + dt * .15);
    // Burning ships smoke.
    for (const v of [p, this.boss]) if (v.hp < v.maxHp * .5 && v.sinking < 1 && Math.random() < dt * (v.hp <= 0 ? 12 : 4))
      this.fx.puff('smoke', v.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 4, 3, (Math.random() - .5) * 6)), { size: 1.2 });

    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].at <= t) this.shot(this.queue.splice(i, 1)[0]);
    this.fx.update(dt, t, b => this.onBall(b));
    this.sea.update(t, p.pos);
    this.beacon.visible = !this.islandDone;
    this.beacon.scale.setScalar(1 + Math.sin(t * 2) * .03);
    this.beacon.material.opacity = .5 + Math.sin(t * 3) * .3;
    this.beacon.position.y = waveHeight(this.beacon.position.x, this.beacon.position.z, t) * .3 + .5;

    this.updateCamera(dt);
    this.light.position.copy(p.pos).add(new THREE.Vector3(25, 80, 60));
    this.light.target.position.copy(p.pos);

    this.ui.sailHud({
      speed: Math.abs(p.speed), throttle: p.throttle, reload: this.reload, reloadMax: RELOAD,
      canDock: this.state === 'sail' && this.nearIsland(), battle: this.state === 'battle',
      marks: this.marks(),
    });
  }

  // Compass bar markers: angle relative to the bow and distance.
  marks() {
    const out = [];
    const add = (pos, icon, label) => {
      const to = pos.clone().sub(this.player.pos);
      const ang = THREE.MathUtils.euclideanModulo(Math.atan2(-to.x, -to.z) - this.player.heading + Math.PI, Math.PI * 2) - Math.PI;
      out.push({ ang, icon, label, dist: Math.round(to.length()) });
    };
    if (!this.islandDone) add(this.island.position, '✕', 'Клад');
    if (!this.bossBeaten) add(this.boss.pos, '☠', 'Шрам');
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
    if (this.state === 'battle' && this.boss.hp > 0) look.lerp(this.boss.pos, .25);
    this.camera.lookAt(look);
  }

  winBattle() {
    this.bossBeaten = true;
    this.state = 'sail';
    sfx('win');
    this.ui.battleHud(null);
    setTimeout(() => this.ui.dialog({
      title: '«Каракатица» идёт ко дну!',
      text: 'Шрам уплывает на шлюпке, грозя кулаком. А с тонущей шхуны к вам карабкается мальчишка: «Я больше не служу Шраму! Возьмите меня юнгой, я знаю все его хитрости». Юнга Тим теперь в команде.',
      gold: 500,
      buttons: [['Йо-хо-хо!', () => this.ui.closeDialog()]],
    }), 1200);
    this.onGold && this.onGold(500);
  }

  loseBattle() {
    this.lost = true;
    sfx('lose');
    setTimeout(() => this.ui.dialog({
      title: 'Корабль пробит',
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

  render() { this.renderer.render(this.scene, this.camera); }
}
