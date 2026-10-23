import * as THREE from 'three';
import { waveHeight } from './sea.js';
import { pbr } from './materials.js';

// Sailing ship built from code and dressed in the texture pack, so hulls and sails can be swapped like the skins in part one.
// hull/sail/flag name a material from the pack; the *Tint colours shade it. The bow points to -Z in the ship's own space.
export function buildShip({ hull = 'polished_oak', hullTint = '#ffffff', trim = 'pirate_gold', sail = 'sail_canvas', sailTint = '#ffffff',
  flag = 'black_sailcloth', masts = 2, length = 14 } = {}) {
  const g = new THREE.Group();
  const wood = pbr('polished_oak', { repeat: [1, 3], color: '#b98d6a' });
  const W = length * .32, H = length * .18;

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
  hullMesh.castShadow = true;
  g.add(hullMesh);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * .9, .2, length * .82), pbr('deck_oak', { repeat: [1, 3] }));
  deck.receiveShadow = true;
  deck.position.set(0, H * .5, length * .05);
  g.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, .25, length * .78), pbr(trim, { repeat: [1, 4] }));
  rail.position.set(0, H * .58, length * .06);
  rail.scale.set(1, 1, 1);
  g.add(rail);
  // Stern castle.
  const castle = new THREE.Mesh(new THREE.BoxGeometry(W * .88, H * .55, length * .2), hullMat);
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
      cn.position.set(side * W * .5, H * .4, z);
      g.add(cn);
      const m = new THREE.Object3D();
      m.position.set(side * (W * .5 + .6), H * .4, z);
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
  g.userData.deckY = H * .5 + .1;
  g.userData.castle = { y: H * 1.055, z: L * .72 };
  return g;
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

    // Sample the waves at bow, stern and both sides for pitch and roll.
    const f = this.forward(), r = this.side('right');
    const len = this.mesh.userData.length * .4, wid = this.mesh.userData.width * .5;
    const x = this.pos.x, z = this.pos.z;
    const hb = waveHeight(x + f.x * len, z + f.z * len, t), hs = waveHeight(x - f.x * len, z - f.z * len, t);
    const hr = waveHeight(x + r.x * wid, z + r.z * wid, t), hl = waveHeight(x - r.x * wid, z - r.z * wid, t);
    // Sinking goes in stages: the hull settles and lists, then the bow lifts and the stern drags her under.
    const s = this.sinking, ss = THREE.MathUtils.smoothstep;
    const settle = ss(s, 0, .3) * 2.2, plunge = ss(s, .35, 1) ** 1.6 * 26;
    const list = ss(s, 0, .4) * .5, lift = ss(s, .3, .8) * .95;
    const calm = 1 - ss(s, 0, .5);
    this.pos.y = ((hb + hs + hr + hl) / 4 - .3) * calm - settle - plunge;
    this.mesh.rotation.set(Math.atan2(hb - hs, len * 2) * calm + lift, this.heading, (Math.atan2(hr - hl, wid * 2) * .8 + this.heel) * calm + list, 'YXZ');

    for (const s of this.mesh.userData.sails) s.scale.z = .8 + .2 * Math.abs(this.throttle) + .05 * Math.sin(t * 3 + s.id);
    const fl = this.mesh.userData.flag;
    if (fl) fl.rotation.y = Math.PI / 2 + Math.sin(t * 4) * .25;
  }
}
