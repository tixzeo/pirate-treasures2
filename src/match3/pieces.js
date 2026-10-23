import * as THREE from 'three';
import { CANNON_ROW, CANNON_COL, BARREL, COMPASS } from './board.js';

// 3D versions of the part-one treasures. Each builder returns a group about one cell wide.
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .35, metalness: .2, flatShading: true, ...o });
const gold = M('#f2c14e', { metalness: .8, roughness: .25 });
const dark = M('#3a2615');

function coin() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .12, 20).rotateX(Math.PI / 2), gold);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.33, .04, 6, 20), M('#c8901f', { metalness: .8 }));
  rim.position.z = .07;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(.14, 0), M('#c8901f', { metalness: .8 }));
  star.scale.set(1, 1, .3); star.position.z = .07;
  g.add(body, rim, star);
  return g;
}
function ruby() {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), M('#e3394f', { roughness: .15, metalness: .1, emissive: '#5a0010', emissiveIntensity: .3 }));
  m.scale.set(.85, 1, .6);
  return m;
}
function emerald() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .26, 8).rotateX(Math.PI / 2), M('#2fbf71', { roughness: .15, emissive: '#053a1c', emissiveIntensity: .3 }));
  m.rotation.z = Math.PI / 8;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, .08, 8).rotateX(Math.PI / 2), M('#6fe8a6', { roughness: .1 }));
  top.position.z = .16; top.rotation.z = Math.PI / 8;
  const g = new THREE.Group(); g.add(m, top);
  return g;
}
// Scallop: a fan of ribs spreading up from a small hinge.
function shell() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -.32);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (.12 + .76 * i / 10), r = .44 + (i % 2 ? .04 : 0);
    s.lineTo(Math.cos(a) * r, -.32 + Math.sin(a) * r * .95);
  }
  s.lineTo(0, -.32);
  const fan = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .1, bevelEnabled: true, bevelThickness: .06, bevelSize: .03, bevelSegments: 1 }), M('#ff8f70'));
  fan.position.z = -.05;
  g.add(fan);
  const rib = M('#c4553b');
  for (let i = 1; i < 10; i += 2) {
    const a = Math.PI * (.12 + .76 * i / 10);
    const r = new THREE.Mesh(new THREE.BoxGeometry(.035, .4, .04), rib);
    r.position.set(Math.cos(a) * .2, -.32 + Math.sin(a) * .2, .12);
    r.rotation.z = a - Math.PI / 2;
    g.add(r);
  }
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(.22, .1, .16), M('#ffb59f'));
  hinge.position.set(0, -.34, .03);
  g.add(hinge);
  g.position.y = .06;
  return g;
}
function compass() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .14, 20).rotateX(Math.PI / 2), M('#3a8fd9', { metalness: .4 })));
  const face = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), M('#eaf3fb'));
  face.position.z = .075;
  const needle = new THREE.Mesh(new THREE.OctahedronGeometry(.25, 0), M('#e3394f'));
  needle.scale.set(.25, 1, .1); needle.position.z = .1;
  g.add(face, needle);
  return g;
}
function anchor() {
  const g = new THREE.Group();
  const m = M('#59c9c0', { metalness: .5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.09, .035, 6, 12), m); ring.position.y = .36;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(.08, .6, .08), m);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(.4, .07, .08), m); bar.position.y = .2;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(.3, .05, 6, 16, Math.PI), m); arc.rotation.z = Math.PI; arc.position.y = -.05;
  g.add(ring, shaft, bar, arc);
  return g;
}
function skull() {
  const g = new THREE.Group();
  const bone = M('#f1ead8', { roughness: .6 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(.34, 14, 10), bone); head.position.y = .05; head.scale.set(1, .95, .85);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(.32, .16, .25), bone); jaw.position.y = -.26;
  g.add(head, jaw);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), dark); eye.position.set(s * .13, .04, .26);
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.05, .1, 3), dark); nose.position.set(0, -.08, .29); nose.rotation.x = Math.PI;
  g.add(nose);
  return g;
}
function cannonball(row) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 12), M('#2b2d33', { metalness: .6 })));
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.1, .2, 4), gold);
    if (row) { tip.rotation.z = -s * Math.PI / 2; tip.position.x = s * .44; }
    else { tip.rotation.z = s < 0 ? Math.PI : 0; tip.position.y = s * .44; }
    g.add(tip);
  }
  return g;
}
function barrel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .62, 12), M('#9a5a2c'));
  body.geometry.attributes.position.array.forEach((v, i, a) => { if (i % 3 === 0) { const y = a[i + 1]; a[i] *= 1 + .18 * (1 - (y / .31) ** 2); a[i + 2] *= 1 + .18 * (1 - (y / .31) ** 2); } });
  body.geometry.computeVertexNormals();
  g.add(body);
  for (const y of [-.18, .18]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.34, .03, 5, 16), M('#3a3f47', { metalness: .6 }));
    band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
  }
  const label = new THREE.Mesh(new THREE.BoxGeometry(.24, .14, .05), M('#efdcb3')); label.position.z = .34;
  g.add(label);
  return g;
}
function compassBomb() {
  const g = new THREE.Group();
  const m = M('#f2c14e', { metalness: .9, roughness: .2, emissive: '#ff9d00', emissiveIntensity: .5 });
  const a = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), m); a.scale.set(1, 1, .35);
  const b = a.clone(); b.rotation.z = Math.PI / 4; b.scale.set(.7, .7, .3);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), M('#173a4d'));
  core.position.z = .13;
  g.add(a, b, core);
  return g;
}

const BUILD = [coin, ruby, emerald, shell, compass, anchor, skull, null,
  () => cannonball(true), () => cannonball(false), barrel, compassBomb];

export function buildPiece(t) {
  const g = new THREE.Group();
  const inner = BUILD[t]();
  inner.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(inner);
  g.userData.inner = inner;
  g.userData.t = t;
  return g;
}

export const SPECIAL_WORDS = { [CANNON_ROW]: 'Пушечное ядро!', [CANNON_COL]: 'Пушечное ядро!', [BARREL]: 'Бочка пороха!', [COMPASS]: 'Компас-бомба!' };
