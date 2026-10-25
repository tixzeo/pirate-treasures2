import * as THREE from 'three';
import { waveHeight } from './sea.js';
import { HullMotion } from './hull-motion.js';
import { sampleHullWater } from './hull-water.js';
import { pbr } from './materials.js';
import { part, boundsOf } from './kit.js';
import { captureShipParts, fitShipLayout } from './ship-layout.js';
import { shipMetrics, SHIP_RULES } from './ship-config.js';

// Sailing ship built from code and dressed in the texture pack, so hulls and sails can be swapped like the skins in part one.
// hull/sail/flag name a material from the pack; the *Tint colours shade it. The bow points to -Z in the ship's own space.
export function buildShip({ hull = 'polished_oak', hullTint = '#ffffff', trim = 'pirate_gold', sail = 'sail_canvas', sailTint = '#ffffff',
  flag = 'black_sailcloth', masts = 2, length = 14, deckWidth, referenceLength = length } = {}) {
  const g = new THREE.Group();
  const wood = pbr('polished_oak', { repeat: [1, 3], color: '#b98d6a' });
  const W = deckWidth === undefined ? length * .32 : deckWidth / .9, H = length * .18;

  // Hull: a pointed outline from above, extruded upward and narrowed toward the keel.
  const s = new THREE.Shape();
  const L = length / 2;
  s.moveTo(0, -L);
  s.quadraticCurveTo(W * .55, -L * .55, W / 2, -L * .1);
  s.lineTo(W / 2, L * .8);
  s.quadraticCurveTo(W / 2, L, W * .3, L);
  s.lineTo(-W * .3, L);
  s.quadraticCurveTo(-W / 2, L, -W / 2, L * .8);
  s.lineTo(-W / 2, -L * .1);
  s.quadraticCurveTo(-W * .55, -L * .55, 0, -L);
  const geo = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(Math.PI / 2); // shape Y becomes Z, extrusion goes down
  geo.translate(0, H * .55, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = THREE.MathUtils.clamp((H * .55 - y) / H, 0, 1);
    p.setX(i, p.getX(i) * (1 - .45 * k * k));
    p.setZ(i, p.getZ(i) * (1 - .12 * k));
  }
  geo.computeVertexNormals();
  const hullMat = pbr(hull, { repeat: .25, color: hullTint });
  const hullMesh = new THREE.Mesh(geo, hullMat);
  hullMesh.name = 'Fallback_CarvedHull';
  hullMesh.castShadow = true;
  g.add(hullMesh);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * .9, .2, length * .82), pbr('deck_oak', { repeat: [1, 3] }));
  deck.name = 'Fallback_Deck';
  deck.receiveShadow = true;
  deck.position.set(0, H * .5, length * .05);
  g.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, .25, length * .78), pbr(trim, { repeat: [1, 4] }));
  rail.position.set(0, H * .58, length * .06);
  rail.scale.set(1, 1, 1);
  g.add(rail);
  // Stern castle.
  const castle = new THREE.Mesh(new THREE.BoxGeometry(W * .88, H * .55, length * .2), hullMat);
  castle.name = 'Fallback_Quarterdeck';
  // Dark band along each side where the gun ports sit.
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(.06, H * .28, length * .7), pbr('dark_leather', { repeat: [1, 3], color: '#6b4a3a' }));
    band.position.set(side * W * .49, H * .38, length * .03);
    g.add(band);
  }
  castle.position.set(0, H * .78, L * .78);
  castle.castShadow = true;
  g.add(castle);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb300', emissiveIntensity: 1.5 }));
  lamp.position.set(0, H * 1.25, L * .92);
  g.add(lamp);

  // Cannons along both sides; their muzzles are where broadsides start.
  g.userData.muzzles = { left: [], right: [] };
  const cannonGeo = new THREE.CylinderGeometry(.16, .2, 1, 8).rotateZ(Math.PI / 2);
  const cannonMat = pbr('worn_iron', { color: '#8a8f98' });
  for (let i = 0; i < 4; i++) {
    const z = -L * .35 + i * (L * 1.1 / 3);
    for (const side of [-1, 1]) {
      const cn = new THREE.Mesh(cannonGeo, cannonMat);
      cn.name = `Fallback_CannonBarrel_${side}_${i}`;
      cn.position.set(side * W * .5, H * .4, z);
      g.add(cn);
      const m = new THREE.Object3D();
      m.position.set(side * (W * .5 + SHIP_RULES.muzzleGap), H * .4, z);
      g.add(m);
      g.userData.muzzles[side < 0 ? 'left' : 'right'].push(m);
    }
  }

  // Masts with square sails that puff out a little.
  g.userData.sails = [];
  const mastH = length * .85;
  for (let i = 0; i < masts; i++) {
    const z = masts === 1 ? -L * .15 : -L * .45 + i * (L * 1.0 / (masts - 1));
    const h = mastH * (i === masts - 1 && masts > 1 ? .85 : 1);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.14, .22, h, 8), wood);
    mast.name = `Fallback_Mast_${i}`;
    mast.position.set(0, H * .5 + h / 2, z);
    mast.castShadow = true;
    g.add(mast);
    for (const [k, y] of [[1, .42], [.75, .75]]) {
      const sw = W * 1.5 * k, sh = h * .28 * k;
      const sg = new THREE.PlaneGeometry(sw, sh, 6, 4);
      const sp = sg.attributes.position;
      for (let j = 0; j < sp.count; j++) {
        const u = sp.getX(j) / (sw / 2), v = sp.getY(j) / (sh / 2);
        sp.setZ(j, -(1 - u * u) * (1 - .4 * v * v) * sw * .14);
      }
      sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, pbr(sail, { repeat: [1.5, 1], color: sailTint, side: THREE.DoubleSide }));
      sm.position.set(0, H * .5 + h * y, z - .3);
      sm.castShadow = true;
      g.add(sm);
      g.userData.sails.push(sm);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, sw * 1.05, 6).rotateZ(Math.PI / 2), wood);
      yard.position.set(0, H * .5 + h * y + sh / 2, z - .15);
      g.add(yard);
    }
    if (i === 0) {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1, 4, 1), pbr(flag, { side: THREE.DoubleSide }));
      fl.geometry.translate(.8, 0, 0);
      fl.rotation.y = Math.PI / 2;
      fl.position.set(0, H * .5 + h + .3, z);
      g.add(fl);
      g.userData.flag = fl;
    }
  }
  // Bowsprit.
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, length * .3, 6), wood);
  bs.rotation.x = Math.PI / 2 - .35;
  bs.position.set(0, H * .75, -L - length * .1);
  g.add(bs);

  // Rigging: stays from the mast tops to the bow and stern.
  const rope = pbr('hemp_rope', { repeat: [1, 8], color: '#c9a77a' });
  const line = (a, b) => {
    const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, d.length(), 4), rope);
    m.position.copy(a).addScaledVector(d, .5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(m);
  };
  const tops = g.children.filter(o => o.geometry && o.geometry.type === 'CylinderGeometry' && o.material === wood && o.geometry.parameters.height > length * .6)
    .map(o => new THREE.Vector3(0, o.position.y + o.geometry.parameters.height / 2 - .2, o.position.z));
  if (tops.length) {
    line(tops[0], new THREE.Vector3(0, H * .9, -L - length * .22));
    line(tops[tops.length - 1], new THREE.Vector3(0, H * 1.1, L * .95));
    for (const t of tops) for (const sd of [-1, 1]) line(t, new THREE.Vector3(sd * W * .5, H * .6, t.z + 1));
  }

  g.userData.length = length;
  g.userData.width = W;
  g.userData.deckWidth = deckWidth;
  g.userData.referenceLength = referenceLength;
  g.userData.deckY = H * .5 + .1;
  g.userData.castle = { y: H * 1.055, z: L * .72 };
  const parts = captureShipParts(g);
  parts.obstacles.push({ name: 'Fallback_CaptainCabin', bounds: parts.surfaces.find(s => s.kind === 'quarterdeck').bounds });
  g.userData.navigation = { space: 'ship-local', approximate: true, source: 'fallback', surfaces: parts.surfaces, obstacles: parts.obstacles };
  g.userData.metrics = shipMetrics(g.userData);
  return g;
}

// Swap the built-in hull for Артем's model (kit name), scaled to the ship's length. The model brings its own
// deck heights, cannon muzzles and swaying sails and flags; the built-in shapes stay hidden as a fallback.
export function dressShip(g, name) {
  const model = part(name);
  const u = g.userData;
  const layout = fitShipLayout(model.userData.shipParts || captureShipParts(model), u);
  const { scale, offsetZ: oz } = layout;
  const deck = layout.surfaces.find(p => p.kind === 'deck').bounds;
  const quarter = layout.surfaces.find(p => p.kind === 'quarterdeck')?.bounds || deck;
  // Leave the helmsman in front of the cabin instead of inside its enlarged box.
  const cabin = layout.obstacles.find(p => /_CaptainCabin$/.test(p.name))?.bounds;
  let helmZ = (quarter.min[2] + quarter.max[2]) / 2;
  if (cabin && helmZ > cabin.min[2] - .4 && helmZ < cabin.max[2] + .4)
    helmZ = Math.max(quarter.min[2] + .35, cabin.min[2] - .4);
  // Muzzles are named <Ship>_CannonMuzzle_<side>_<z>; side 1 is starboard (+X). Shots start a little outboard.
  const muzzles = { left: [], right: [] };
  model.traverse(o => {
    const m = /_CannonMuzzle_(-?1)_/.exec(o.name);
    if (!m) return;
    const c = boundsOf(model, n => n === o.name).getCenter(new THREE.Vector3());
    const at = new THREE.Object3D();
    at.position.set(c.x * scale.x + Math.sign(c.x) * SHIP_RULES.muzzleGap, c.y * scale.y, c.z * scale.z + oz);
    g.add(at);
    muzzles[m[1] === '1' ? 'right' : 'left'].push(at);
  });
  // Seams belong to their sail so they sway with it.
  const sway = [];
  model.traverse(o => { if (/_(Sail_\d+_\d+|Flag_\d+)$/.test(o.name)) sway.push(o); });
  for (const sail of sway) {
    const key = /_Sail_(\d+_\d+)$/.exec(sail.name);
    if (!key) continue;
    model.getObjectsByProperty('isMesh', true).filter(o => o.name.includes(`_SailSeam_${key[1]}_`)).forEach(seam => sail.attach(seam));
  }
  sway.forEach((o, i) => { o.userData.rest = o.rotation.clone(); o.userData.phase = i * .7; o.userData.flag = /_Flag_/.test(o.name); });
  model.scale.set(scale.x, scale.y, scale.z);
  model.position.z = oz;
  for (const c of g.children) if (c.isMesh) c.visible = false;
  g.add(model);
  Object.assign(u, {
    model, sway, muzzles: muzzles.left.length ? muzzles : u.muzzles, sails: [], flag: null,
    width: layout.hull.max[0] - layout.hull.min[0],
    deckY: deck.max[1],
    castle: { y: quarter.max[1], z: layout.anchors.captain?.[2] ?? helmZ },
    navigation: { ...layout, source: name },
  });
  u.metrics = shipMetrics(u);
}

// Sail settings, from going astern to full sail: a share of top speed and a name for the HUD.
export const SAILS = [
  { v: -.25, name: 'Задний ход' }, { v: 0, name: 'Паруса убраны' }, { v: 1 / 3, name: 'Малый ход' },
  { v: 2 / 3, name: 'Половина парусов' }, { v: 1, name: 'Полный ход' },
];
export const sailIndex = throttle => SAILS.reduce((best, s, i) => Math.abs(s.v - throttle) < Math.abs(SAILS[best].v - throttle) ? i : best, 0);

// Moves a ship on the sea: heading, speed, bob and roll from the waves.
// A ship has weight: the sails take a few seconds to drive her up to speed, she coasts a long way,
// the wheel takes time to turn, and the rudder only bites while water flows past it.
export class Vessel {
  constructor(mesh, { maxSpeed = 14, turnRate = .9, hp = 100 } = {}) {
    this.mesh = mesh;
    this.heading = 0;   // radians, 0 means bow to -Z
    this.speed = 0;
    this.throttle = 0;  // -0.25..1, the sail setting
    this.rudder = 0;    // -1..1, where the helmsman wants the wheel
    this.helm = 0;      // -1..1, where the wheel actually is
    this.yaw = 0;       // current rate of turn, rad/s
    this.maxSpeed = maxSpeed;
    this.turnRate = turnRate;
    this.hp = this.maxHp = hp;
    this.heel = 0;
    this.sinking = 0;
    this.motion = new HullMotion();
  }

  get pos() { return this.mesh.position; }
  forward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  // Unit vector out of the left (port) or right (starboard) side.
  side(which) {
    const s = which === 'left' ? -1 : 1;
    return new THREE.Vector3(Math.cos(this.heading) * s, 0, -Math.sin(this.heading) * s);
  }

  update(dt, t) {
    const target = this.throttle * this.maxSpeed;
    // Sails drive her up to speed steadily; the water brakes her hard at speed and gently near a stop, so she coasts a long way.
    const rate = target * Math.sign(this.speed || target) > Math.abs(this.speed) ? this.maxSpeed * .2 : .25 + Math.abs(this.speed) * .18;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -rate * dt, rate * dt);
    this.helm += THREE.MathUtils.clamp(this.rudder - this.helm, -1.8 * dt, 1.8 * dt);
    const bite = THREE.MathUtils.clamp(Math.abs(this.speed) / (this.maxSpeed * .4), 0, 1);
    const want = this.helm * this.turnRate * bite * Math.sign(this.speed);
    this.yaw += (want - this.yaw) * Math.min(1, dt * 1.6);
    this.heading += this.yaw * dt;
    this.pos.addScaledVector(this.forward(), this.speed * dt);
    this.heel += (-this.yaw * .3 - this.heel) * Math.min(1, dt * 2);

    const water = sampleHullWater(waveHeight, { x: this.pos.x, z: this.pos.z, heading: this.heading,
      length: this.mesh.userData.length, width: this.mesh.userData.width }, t);
    const motion = this.motion.update(dt, { ...water, heel: this.heel }, this.mesh.userData.length);
    // Sinking goes in stages: the hull settles and lists, then the bow lifts and the stern drags her under.
    const s = this.sinking, ss = THREE.MathUtils.smoothstep;
    const settle = ss(s, 0, .3) * 2.2, plunge = ss(s, .35, 1) ** 1.6 * 26;
    const list = ss(s, 0, .4) * .5, lift = ss(s, .3, .8) * .95;
    const calm = 1 - ss(s, 0, .5);
    this.pos.y = motion.heave * calm - settle - plunge;
    this.mesh.rotation.set(motion.pitch * calm + lift, this.heading, motion.roll * calm + list, 'YXZ');

    for (const s of this.mesh.userData.sails) s.scale.z = .8 + .2 * Math.abs(this.throttle) + .05 * Math.sin(t * 3 + s.id);
    // Model sails breathe and flags flutter, harder with more sail set.
    const set = .5 + Math.abs(this.throttle) * .5;
    for (const o of this.mesh.userData.sway || []) {
      const r = o.userData.rest, ph = t * (o.userData.flag ? 2.4 : 1.2) + o.userData.phase;
      o.rotation.y = r.y + Math.sin(ph) * (o.userData.flag ? .13 : .055 * set);
      o.rotation.z = r.z + Math.sin(ph * .75) * (o.userData.flag ? .04 : .025 * set);
    }
    const fl = this.mesh.userData.flag;
    if (fl) fl.rotation.y = Math.PI / 2 + Math.sin(t * 4) * .25;
  }
}
