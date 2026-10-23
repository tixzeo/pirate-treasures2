import * as THREE from 'three';

const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .95, flatShading: true, ...extra });

// Seeded noise so the same island looks the same every visit.
function rng(seed) { return () => (seed = (seed * 9301 + 49297) % 233280) / 233280; }

function palm(rand) {
  const g = new THREE.Group();
  const h = 4 + rand() * 2.5, lean = (rand() - .5) * .5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .32, h, 6), mat('#8a5a34'));
  trunk.position.y = h / 2;
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);
  const top = new THREE.Vector3(-Math.sin(lean) * h, Math.cos(lean) * h, 0);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(.5, 3.2, 4), mat('#3f8f3a'));
    leaf.geometry.translate(0, 1.6, 0);
    leaf.position.copy(top);
    leaf.rotation.set(0, i * Math.PI / 3 + rand() * .4, 0, 'YXZ');
    leaf.rotateX(1.9 + rand() * .3);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Round island with a beach, grassy hill, palms and rocks. radius in metres.
export function buildIsland({ radius = 18, seed = 1, hill = '#5aa04a', sand = '#e8d29a', palms = 7, chest = true } = {}) {
  const rand = rng(seed);
  const g = new THREE.Group();
  const beach = new THREE.CylinderGeometry(radius, radius * 1.25, 3, 28, 1);
  const bp = beach.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i)), w = 1 + .12 * Math.sin(a * 3 + seed) + .06 * Math.sin(a * 7 + seed * 2);
    bp.setX(i, bp.getX(i) * w); bp.setZ(i, bp.getZ(i) * w);
  }
  beach.computeVertexNormals();
  const b = new THREE.Mesh(beach, mat(sand));
  b.position.y = -.4;
  b.receiveShadow = true;
  g.add(b);

  const hillGeo = new THREE.SphereGeometry(radius * .72, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = hillGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i);
    const n = 1 + .18 * Math.sin(hp.getX(i) * .4 + seed) * Math.cos(hp.getZ(i) * .35 + seed);
    hp.setY(i, y * .55 * n);
  }
  hillGeo.computeVertexNormals();
  const hl = new THREE.Mesh(hillGeo, mat(hill));
  hl.position.y = 1;
  hl.receiveShadow = hl.castShadow = true;
  g.add(hl);

  for (let i = 0; i < palms; i++) {
    const a = rand() * Math.PI * 2, r = radius * (.55 + rand() * .3);
    const p = palm(rand);
    p.position.set(Math.cos(a) * r, .9 + (1 - r / radius) * 2.5, Math.sin(a) * r);
    p.rotation.y = rand() * 6;
    g.add(p);
  }
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2, r = radius * (.95 + rand() * .3);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.8 + rand() * 1.4, 0), mat('#7d7a74'));
    rock.position.set(Math.cos(a) * r, .2, Math.sin(a) * r);
    rock.rotation.set(rand() * 3, rand() * 3, 0);
    rock.castShadow = true;
    g.add(rock);
  }
  if (chest) {
    // The X that marks the treasure, visible from the sea.
    const x = new THREE.Group();
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(5, .25, .9), mat('#b3322b', { emissive: '#7a1a12', emissiveIntensity: .6 }));
      bar.rotation.y = s * Math.PI / 4;
      x.add(bar);
    }
    x.position.set(0, radius * .72 * .55 + 1.1, 0);
    g.add(x);
  }
  g.userData.radius = radius * 1.3;
  return g;
}

// A ring of light on the water: sail into it to land.
export function buildBeacon(radius) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .35, 6, 48),
    new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffb300', emissiveIntensity: 1.2, transparent: true, opacity: .8 }));
  ring.rotation.x = Math.PI / 2;
  return ring;
}
