import * as THREE from 'three';
import { hasKit, part, boundsOf } from './kit.js';
import { waveHeight } from './sea.js';
import { Vessel } from './ship.js';
import { PIER_WIDTH, PIER_LENGTH } from './island.js';
import { driftFloater } from './floaters.js';

// Life on the water from Артем's Water Life Pack: buoys at the piers, gulls overhead, fish jumping by the ship,
// flotsam drifting about, wreckage where a ship went down, and Scar's rowboat when his schooner sinks.
const BUOY_SCALE = 1.7, BUOY_RADIUS = 1.3;
let seed = 31;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Sit an object on the waves and tilt it with the slope under it.
function ride(o, t, draft = 0, give = 1) {
  const { x, z } = o.position, e = .9;
  const hx = waveHeight(x + e, z, t) - waveHeight(x - e, z, t), hz = waveHeight(x, z + e, t) - waveHeight(x, z - e, t);
  o.position.y = waveHeight(x, z, t) + draft;
  o.rotation.x = Math.atan2(-hz, e * 2) * give;
  o.rotation.z = Math.atan2(hx, e * 2) * give;
}

// The pack's moving parts come as loose siblings: hang the pieces that should follow onto the part that moves.
function hang(root, name, test) {
  const p = root.getObjectByName(name);
  if (!p) return null;
  root.updateMatrixWorld(true);
  const kids = [];
  root.traverse(o => { if (o !== p && o.isMesh && test(o.name)) kids.push(o); });
  for (const k of kids) p.attach(k);
  return p;
}

// Sails and flags sway; their resting pose is kept to sway around.
function swayable(root, names) {
  const out = [];
  root.traverse(o => {
    if (!names.test(o.name)) return;
    o.userData.rest = o.rotation.clone();
    o.userData.phase = rnd() * 6;
    o.userData.flag = /Flag/.test(o.name);
    out.push(o);
  });
  return out;
}

export class SeaLife {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.buoys = [];
    this.gulls = [];
    this.fish = [];
    this.flotsam = [];
    this.wreck = [];
    this.boat = null;
    this.fishIn = 3;
  }

  // Called once the models are in.
  build() {
    if (hasKit('buoy_red_white') && hasKit('buoy_lantern')) this.layBuoys();
    if (hasKit('seagull')) this.addGulls();
    if (hasKit('fish_silver')) for (const kind of ['fish_silver', 'fish_silver', 'fish_tropical']) {
      if (!hasKit(kind)) continue;
      const m = part(kind);
      m.scale.setScalar(.55);
      m.visible = false;
      m.userData.tail = m.getObjectByName('Tail_Fin_Swim_Pivot');
      m.rotation.order = 'YXZ';
      this.scene.add(m);
      this.fish.push({ m, t: -1 });
    }
    this.scatterFlotsam();
  }

  // A gate at each pier: the lantern buoy just off the pier head, the red one further out on the berth side.
  // The approach to the berth runs between them.
  layBuoys() {
    const w = this.world.player.mesh.userData.width;
    for (const isl of this.world.isles) {
      const b = isl.userData.pier;
      const out = b.root.clone().addScaledVector(b.dir, (b.length ?? PIER_LENGTH) + 5);
      for (const [kind, across] of [['buoy_lantern', 0], ['buoy_red_white', PIER_WIDTH / 2 + w + 9]]) {
        const m = part(kind);
        m.scale.setScalar(BUOY_SCALE);
        m.rotation.order = 'YXZ';
        m.position.copy(out).addScaledVector(b.side, across);
        m.userData.home = m.position.clone();
        m.userData.ph = rnd() * 6;
        this.scene.add(m);
        this.buoys.push(m);
      }
    }
  }

  // Two gulls over each treasure island and two that follow the ship.
  addGulls() {
    const make = (center, follow) => {
      const m = part('seagull');
      m.scale.setScalar(1.5);
      m.rotation.order = 'YXZ';
      m.userData.wings = [hang(m, 'Wing_Left_Flap_Pivot', n => n === 'Wingtip_Left'), hang(m, 'Wing_Right_Flap_Pivot', n => n === 'Wingtip_Right')];
      this.scene.add(m);
      this.gulls.push({ m, center, follow, r: (follow ? 14 : 22) + rnd() * 16, h: (follow ? 15 : 17) + rnd() * 8, w: (.25 + rnd() * .15) * (rnd() < .5 ? -1 : 1), ph: rnd() * 6 });
    };
    for (const isl of this.world.isles) { make(isl.position, false); make(isl.position, false); }
    make(null, true); make(null, true);
  }

  // Barrels and wreckage drifting here and there in open water, clear of the islands.
  scatterFlotsam() {
    const kinds = ['barrel_intact', 'floating_plank_cluster', 'barrel_damaged', 'broken_mast_section', 'barrel_intact', 'wrecked_hull_chunk'].filter(hasKit);
    if (!kinds.length) return;
    const lands = this.scene.children.filter(o => o.userData.radius);
    let placed = 0;
    for (let tries = 0; placed < 10 && tries < 200; tries++) {
      const a = rnd() * Math.PI * 2, r = 50 + rnd() * 330;
      const at = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (lands.some(l => l.position.distanceTo(at) < l.userData.radius + 20)) continue;
      if (this.buoys.some(bu => bu.position.distanceTo(at) < 40)) continue;
      this.flotsam.push(this.piece(kinds[placed % kinds.length], at, Infinity));
      placed++;
    }
  }

  piece(kind, at, life) {
    const m = part(kind);
    m.scale.setScalar(/barrel/.test(kind) ? 1.3 : 1.8);
    m.rotation.order = 'YXZ';
    m.position.copy(at);
    this.scene.add(m);
    return { m, life, yaw: rnd() * 6, spin: (rnd() - .5) * .25, drift: new THREE.Vector3((rnd() - .5) * .8, 0, (rnd() - .5) * .8), draft: /barrel/.test(kind) ? .05 : .02 };
  }

  // What is left floating where a ship went down. Returns false if there are no models to do it with.
  spawnWreck(at, n) {
    const kinds = ['floating_plank_cluster', 'barrel_intact', 'broken_mast_section', 'barrel_damaged', 'wrecked_hull_chunk', 'floating_plank_cluster'].filter(hasKit);
    if (!kinds.length) return false;
    for (let i = 0; i < n; i++) {
      const p = this.piece(kinds[i % kinds.length], new THREE.Vector3(at.x + (rnd() - .5) * 16, 0, at.z + (rnd() - .5) * 20), 30 + rnd() * 10);
      p.drift.multiplyScalar(1.5);
      this.wreck.push(p);
    }
    return true;
  }

  // Scar rows off from his sinking schooner, away from the player. Returns the boat, or null without the model.
  launchBoat(boss, from) {
    if (!hasKit('scar_rowboat')) return null;
    this.clearBoat();
    const g = new THREE.Group(), model = part('scar_rowboat');
    model.scale.setScalar(1.2);
    model.position.y = .32; // Vessel floats hulls .3 m down
    g.add(model);
    hang(model, 'Sail_Scarlet_Tattered', n => n === 'Sail_Patch_01');
    hang(model, 'Flag_Scar_Skull', n => /^(Flag_Skull|Crossbone)/.test(n));
    g.userData = { length: 4.9 * 1.2, width: 2 * 1.2, deckY: .5, sails: [], sway: swayable(model, /^(Sail_Scarlet_Tattered|Flag_Scar_Skull)$/) };
    // Each oar swings in its oarlock: a pivot there carries shaft and blade.
    g.userData.oars = [1, -1].map(s => {
      const shaft = model.getObjectByName(`Oar_Shaft_${s}`);
      if (!shaft) return null;
      const mid = boundsOf(model, n => n === `Oar_Shaft_${s}`).getCenter(new THREE.Vector3());
      const locks = [];
      model.traverse(o => { if (o.isMesh && o.name.startsWith(`Oarlock_${s}_`)) locks.push(boundsOf(model, n => n === o.name).getCenter(new THREE.Vector3())); });
      const o = new THREE.Group();
      o.position.copy(locks.sort((a, b) => a.distanceTo(mid) - b.distanceTo(mid))[0] || mid);
      model.add(o);
      model.updateMatrixWorld(true);
      o.attach(shaft);
      const blade = model.getObjectByName(`Oar_Blade_${s}`);
      if (blade) o.attach(blade);
      o.userData.rest = o.rotation.clone();
      return { o, s };
    }).filter(Boolean);
    const boat = new Vessel(g, { maxSpeed: 3.6, turnRate: .7, hp: 1 });
    const away = boss.pos.clone().sub(from).setY(0).normalize();
    boat.pos.copy(boss.pos).addScaledVector(boss.side('right'), boss.mesh.userData.width / 2 + 4).setY(0);
    boat.heading = boat.goal = Math.atan2(-away.x, -away.z);
    boat.throttle = 1;
    boat.age = 0;
    this.scene.add(g);
    this.boat = boat;
    return boat;
  }

  clearBoat() {
    if (!this.boat) return;
    this.scene.remove(this.boat.mesh);
    this.boat = null;
  }

  // A fish leaps out of the water somewhere ahead of the ship now and then.
  jump(fish, p) {
    const a = p.heading + (rnd() - .5) * 2.4, d = 16 + rnd() * 28;
    const from = p.pos.clone().add(new THREE.Vector3(-Math.sin(a) * d, 0, -Math.cos(a) * d));
    const dir = rnd() * Math.PI * 2;
    Object.assign(fish, { t: 0, dur: .9 + rnd() * .4, from, dir, len: 3 + rnd() * 3, h: 1.4 + rnd() * 1.2 });
    fish.m.visible = true;
    fish.m.rotation.y = dir;
    this.world.fx.puff('splash', from.clone().setY(waveHeight(from.x, from.z, this.world.time) + .2), { size: .5 });
  }

  update(dt, t) {
    const w = this.world, p = w.player;
    for (const m of this.buoys) {
      m.position.x = m.userData.home.x + Math.sin(t * .5 + m.userData.ph) * .3;
      m.position.z = m.userData.home.z + Math.cos(t * .4 + m.userData.ph) * .3;
      ride(m, t, -.15, .8);
      m.rotation.y = Math.sin(t * .3 + m.userData.ph) * .4;
      // The ship shoulders a buoy aside rather than sailing through it.
      const d = p.pos.clone().sub(m.position).setY(0), clear = BUOY_RADIUS + p.mesh.userData.width / 2;
      const along = Math.abs(d.dot(p.forward())), across = Math.abs(d.dot(p.side('right')));
      if (along < p.mesh.userData.length / 2 && across < clear) {
        m.userData.home.addScaledVector(p.side('right'), Math.sign(-d.dot(p.side('right'))) * (clear - across) * .5);
        p.speed *= 1 - Math.min(1, dt * 1.5);
      }
    }

    for (const g of this.gulls) {
      const c = g.follow ? p.pos : g.center, a = t * g.w + g.ph;
      const r = g.r + Math.sin(t * .3 + g.ph) * 4;
      g.m.position.set(c.x + Math.cos(a) * r, g.h + Math.sin(t * .5 + g.ph) * 1.5, c.z + Math.sin(a) * r);
      const vx = -Math.sin(a) * Math.sign(g.w), vz = Math.cos(a) * Math.sign(g.w);
      g.m.rotation.y = Math.atan2(-vx, -vz);
      g.m.rotation.z = -Math.sign(g.w) * .35; // banked into the turn
      // A few beats, then a long glide.
      const beat = Math.max(0, Math.sin(t * .8 + g.ph * 3) - .2) / .8;
      const flap = Math.sin(t * 9 + g.ph) * .55 * beat + (1 - beat) * .12;
      const [l, rt] = g.m.userData.wings;
      if (l) l.rotation.z = -flap;
      if (rt) rt.rotation.z = flap;
    }

    // Fish only show off while the ship is out at sea and moving.
    this.fishIn -= dt;
    if (this.fishIn <= 0 && w.state === 'sail' && Math.abs(p.speed) > 1) {
      const fish = this.fish.find(f => f.t < 0);
      if (fish) this.jump(fish, p);
      this.fishIn = 2.5 + rnd() * 4;
    }
    for (const f of this.fish) {
      if (f.t < 0) continue;
      f.t += dt / f.dur;
      const s = Math.min(f.t, 1), dx = -Math.sin(f.dir), dz = -Math.cos(f.dir);
      const x = f.from.x + dx * f.len * s, z = f.from.z + dz * f.len * s;
      f.m.position.set(x, waveHeight(x, z, t) - .3 + f.h * 4 * s * (1 - s), z);
      f.m.rotation.x = Math.atan2(f.h * 4 * (1 - 2 * s), f.len) * .9;
      if (f.m.userData.tail) f.m.userData.tail.rotation.y = Math.sin(t * 22) * .35;
      if (f.t >= 1) {
        f.t = -1; f.m.visible = false;
        w.fx.puff('splash', f.m.position.clone().setY(waveHeight(x, z, t) + .2), { size: .6 });
      }
    }

    const ships = [p, ...(w.bossGone ? [] : [w.boss])];
    for (const list of [this.flotsam, this.wreck]) for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.life -= dt;
      driftFloater(f, dt, w.wind, ships);
      f.yaw += f.spin * dt;
      ride(f.m, t, f.draft - Math.max(0, 3 - f.life) * .5, .9);
      f.m.rotation.y = f.yaw;
      if (f.life <= 0) { this.scene.remove(f.m); list.splice(i, 1); }
    }
    // Drifting flotsam that wanders too far from the middle of the map turns back.
    // The pull back is stronger than the wind can carry a barrel, even in a gale.
    for (const f of this.flotsam) if (f.m.position.length() > 420) f.drift.copy(f.m.position).setY(0).normalize().multiplyScalar(-1);

    const b = this.boat;
    if (b) {
      b.age += dt;
      // Rowing: steady strokes, the boat checking forward on each one.
      const stroke = Math.sin(b.age * 2.6);
      b.throttle = .75 + stroke * .25;
      b.rudder = THREE.MathUtils.clamp((b.goal - b.heading) * 2, -1, 1);
      b.update(dt, t);
      for (const { o, s } of b.mesh.userData.oars) {
        o.rotation.y = o.userData.rest.y + stroke * .45 * s;
        o.rotation.z = o.userData.rest.z + Math.cos(b.age * 2.6) * .12 * s;
      }
      // Gone over the horizon: off the board for good.
      if (b.age > 50 || b.pos.distanceTo(p.pos) > 300) {
        this.clearBoat();
        w.syncCrew(); // Scar goes back aboard his (sunken) schooner, out of sight
      }
    }
  }
}
