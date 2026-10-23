import * as THREE from 'three';
import { waveHeight } from './sea.js';

// Low-poly sailing ship built from code, so colours can be changed like the skins in part one.
// The bow points to -Z in the ship's own space.
export function buildShip({ hull = '#7a4a28', trim = '#f2c14e', sail = '#f4ead6', flag = '#1b1b1b', masts = 2, length = 14 } = {}) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: .8, flatShading: true });
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
  const hullMesh = new THREE.Mesh(geo, mat(hull));
  hullMesh.castShadow = true;
  g.add(hullMesh);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * .9, .2, length * .82), mat('#b98a55'));
  deck.position.set(0, H * .5, length * .05);
  g.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, .25, length * .78), mat(trim));
  rail.position.set(0, H * .58, length * .06);
  rail.scale.set(1, 1, 1);
  g.add(rail);
  // Stern castle.
  const castle = new THREE.Mesh(new THREE.BoxGeometry(W * .88, H * .55, length * .2), mat(hull));
  castle.position.set(0, H * .78, L * .78);
  castle.castShadow = true;
  g.add(castle);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb300', emissiveIntensity: 1.5 }));
  lamp.position.set(0, H * 1.25, L * .92);
  g.add(lamp);

  // Cannons along both sides; their muzzles are where broadsides start.
  g.userData.muzzles = { left: [], right: [] };
  const cannonGeo = new THREE.CylinderGeometry(.16, .2, 1, 8).rotateZ(Math.PI / 2);
  const cannonMat = mat('#2b2d33');
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
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.14, .22, h, 6), mat('#5e3a1f'));
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
      const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: sail, roughness: .9, side: THREE.DoubleSide, flatShading: true }));
      sm.position.set(0, H * .5 + h * y, z - .3);
      sm.castShadow = true;
      g.add(sm);
      g.userData.sails.push(sm);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, sw * 1.05, 5).rotateZ(Math.PI / 2), mat('#5e3a1f'));
      yard.position.set(0, H * .5 + h * y + sh / 2, z - .15);
      g.add(yard);
    }
    if (i === 0) {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1, 4, 1), new THREE.MeshStandardMaterial({ color: flag, side: THREE.DoubleSide }));
      fl.geometry.translate(.8, 0, 0);
      fl.rotation.y = Math.PI / 2;
      fl.position.set(0, H * .5 + h + .3, z);
      g.add(fl);
      g.userData.flag = fl;
    }
  }
  // Bowsprit.
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, length * .3, 5), mat('#5e3a1f'));
  bs.rotation.x = Math.PI / 2 - .35;
  bs.position.set(0, H * .75, -L - length * .1);
  g.add(bs);

  g.userData.length = length;
  g.userData.width = W;
  return g;
}

// Moves a ship on the sea: heading, speed, bob and roll from the waves.
export class Vessel {
  constructor(mesh, { maxSpeed = 14, turnRate = .9, hp = 100 } = {}) {
    this.mesh = mesh;
    this.heading = 0;   // radians, 0 means bow to -Z
    this.speed = 0;
    this.throttle = 0;  // -0.3..1
    this.rudder = 0;    // -1..1
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
    this.speed += (target - this.speed) * Math.min(1, dt * .8);
    const steer = this.rudder * this.turnRate * THREE.MathUtils.clamp(Math.abs(this.speed) / 4, .25, 1) * Math.sign(this.speed || 1);
    this.heading += steer * dt;
    this.pos.addScaledVector(this.forward(), this.speed * dt);
    this.heel += (-steer * .25 - this.heel) * Math.min(1, dt * 2);

    // Sample the waves at bow, stern and both sides for pitch and roll.
    const f = this.forward(), r = this.side('right');
    const len = this.mesh.userData.length * .4, wid = this.mesh.userData.width * .5;
    const x = this.pos.x, z = this.pos.z;
    const hb = waveHeight(x + f.x * len, z + f.z * len, t), hs = waveHeight(x - f.x * len, z - f.z * len, t);
    const hr = waveHeight(x + r.x * wid, z + r.z * wid, t), hl = waveHeight(x - r.x * wid, z - r.z * wid, t);
    const sink = this.sinking;
    this.pos.y = (hb + hs + hr + hl) / 4 - .3 - sink * 6;
    this.mesh.rotation.set(Math.atan2(hb - hs, len * 2) + sink * .5, this.heading, Math.atan2(hr - hl, wid * 2) * .8 + this.heel + sink * .3, 'YXZ');

    for (const s of this.mesh.userData.sails) s.scale.z = .8 + .2 * Math.abs(this.throttle) + .05 * Math.sin(t * 3 + s.id);
    const fl = this.mesh.userData.flag;
    if (fl) fl.rotation.y = Math.PI / 2 + Math.sin(t * 4) * .25;
  }
}
