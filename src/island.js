import * as THREE from 'three';
import { pbr } from './materials.js';
import { part, hasKit } from './kit.js';
import { flatten, mergeStatic } from './merge.js';
import { ISLE_SCALE } from './islands.js';

const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .95, flatShading: true, ...extra });

// Seeded noise so the same island looks the same every visit.
function rng(seed) { return () => (seed = (seed * 9301 + 49297) % 233280) / 233280; }

function palm(rand) {
  const g = new THREE.Group();
  const h = 4 + rand() * 2.5, lean = (rand() - .5) * .5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .32, h, 7), pbr('hemp_rope', { repeat: [1, 5], color: '#a07850' }));
  trunk.position.y = h / 2;
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);
  const top = new THREE.Vector3(-Math.sin(lean) * h, Math.cos(lean) * h, 0);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(.55, 3.4, 4), mat(i % 2 ? '#3f9a3a' : '#4fae45'));
    leaf.scale.z = .35;
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
export function buildIsland({ radius = 18, seed = 1, hill = '#a6e07c', sand = '#ffffff', palms = 7, chest = true } = {}) {
  const rand = rng(seed);
  const g = new THREE.Group();
  const beach = new THREE.CylinderGeometry(radius, radius * 1.25, 3, 28, 1);
  const bp = beach.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i)), w = 1 + .12 * Math.sin(a * 3 + seed) + .06 * Math.sin(a * 7 + seed * 2);
    bp.setX(i, bp.getX(i) * w); bp.setZ(i, bp.getZ(i) * w);
  }
  beach.computeVertexNormals();
  const b = new THREE.Mesh(beach, pbr('dune_sand', { repeat: Math.max(2, Math.round(radius / 4)), color: sand }));
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
  const hl = new THREE.Mesh(hillGeo, pbr('swamp_moss', { repeat: [Math.round(radius / 2.5), 3], color: hill, normal: .6 }));
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
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.8 + rand() * 1.4, 0), pbr('ruin_stone', { repeat: .5, color: '#bdb6aa', flatShading: true }));
    rock.position.set(Math.cos(a) * r, .2, Math.sin(a) * r);
    rock.rotation.set(rand() * 3, rand() * 3, 0);
    rock.castShadow = true;
    g.add(rock);
  }
  if (chest) {
    // The X that marks the treasure, visible from the sea.
    const x = new THREE.Group();
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(5, .25, .9), pbr('crimson_sailcloth', { repeat: [3, .5], emissive: '#7a1a12', emissiveIntensity: .5 }));
      bar.rotation.y = s * Math.PI / 4;
      x.add(bar);
    }
    x.position.set(0, radius * .72 * .55 + 1.1, 0);
    g.add(x);
  }
  g.userData.radius = radius * 1.3;
  g.userData.shore = radius * 1.15; // where the beach meets the water, for the lagoon and surf in the sea shader
  return g;
}

// Piers run out from the beach along local +X. DOCK_SCALE sizes Артем's dock segments (2 units wide, 4 long) for our ships.
export const DOCK_SCALE = 2.4, DOCK_PITCH = 4 * DOCK_SCALE;
export const PIER_WIDTH = 2 * DOCK_SCALE, PIER_LENGTH = 3 * DOCK_PITCH;

// Артем's island model in place of the built-in one, sized so its beach meets the water at the island's shore.
// The ground stretches to fit (hills rise by only the square root of ISLE_SCALE); palms, rocks and the lighthouse
// keep the size they had on the small islands and sit where they stood, and more of Артем's palms, rocks, barrels and
// wreckage are scattered over the extra ground.
// dir: which way our pier leaves the island; the model is turned so its own dock spot faces that way and its dock is hidden.
// Without dir (scenery) it just takes a turn from the seed. Returns how far from the centre the beach ends along the dock's line.
const PROP = /^(PalmTree_\d+|RockCluster_\d+|Old_Lighthouse)/;
export function dressIsland(isl, name, dir, seed = 1) {
  const src = part(name);
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert();
  // Every part baked into the model's own space, sorted into ground, props (by the node they belong to) and dock.
  const ground = [], props = new Map(), dock = new THREE.Box3();
  src.traverse(o => {
    if (!o.isMesh) return;
    const geo = flatten(o, inv);
    let key = null;
    for (let p = o; p && p !== src && !key; p = p.parent) key = PROP.exec(p.name)?.[1];
    if (/_Dock_/.test(o.name)) { geo.computeBoundingBox(); dock.union(geo.boundingBox); return; }
    const m = new THREE.Mesh(geo, o.material);
    m.name = o.name;
    if (key) { if (!props.has(key)) props.set(key, []); props.get(key).push(m); } else ground.push(m);
  });
  const beach = new THREE.Box3();
  for (const m of ground) if (/_Beach$/.test(m.name)) { m.geometry.computeBoundingBox(); beach.union(m.geometry.boundingBox); }
  const c = beach.getCenter(new THREE.Vector3()), size = beach.getSize(new THREE.Vector3());
  const s = isl.userData.shore / (Math.max(size.x, size.z) / 2), sy = s / Math.sqrt(ISLE_SCALE), sp = s / ISLE_SCALE;
  const model = new THREE.Group();
  for (const m of ground) { m.geometry.translate(-c.x, 0, -c.z).scale(s, sy, s); model.add(m); }
  // A prop stands on the lowest points of its geometry; that foot moves with the ground, the rest keeps its size.
  const foot = list => {
    const box = new THREE.Box3();
    for (const m of list) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
    const f = new THREE.Vector3(), v = new THREE.Vector3();
    let n = 0;
    for (const m of list) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) if (v.fromBufferAttribute(pos, i).y < box.min.y + .15) { f.add(v); n++; }
    }
    return f.divideScalar(n);
  };
  const taken = [];
  for (const list of props.values()) {
    const f = foot(list), at = new THREE.Vector3((f.x - c.x) * s, f.y * sy, (f.z - c.z) * s);
    for (const m of list) { m.geometry.translate(-f.x, -f.y, -f.z).scale(sp, sp, sp); m.position.copy(at); model.add(m); }
    taken.push(at);
  }

  // Scatter on the new ground: drop a ray from above and keep the spot if it lands on the right kind of ground,
  // away from the dock and from what already stands there.
  const rand = rng(seed * 7 + 3), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const land = ground.filter(m => !/Underwater/.test(m.name));
  model.updateMatrixWorld(true);
  const shore = isl.userData.shore;
  const dockAt = dock.isEmpty() ? null : dock.getCenter(new THREE.Vector3()).sub(c).multiplyScalar(s).setY(0);
  const dockAng = dockAt && Math.atan2(dockAt.z, dockAt.x);
  const spot = (test, gap, rMin = .1, rMax = 1) => {
    for (let k = 0; k < 40; k++) {
      const a = rand() * Math.PI * 2, r = shore * (rMin + rand() * (rMax - rMin));
      if (dockAt && Math.abs(Math.atan2(Math.sin(a - dockAng), Math.cos(a - dockAng))) < .35) continue;
      ray.set(new THREE.Vector3(Math.cos(a) * r, 500, Math.sin(a) * r), down);
      const hit = ray.intersectObjects(land, false)[0];
      if (!hit || hit.point.y < .2 || !test.test(hit.object.name)) continue;
      if (taken.some(t => t.distanceTo(hit.point) < gap)) continue;
      taken.push(hit.point.clone());
      return hit.point;
    }
    return null;
  };
  const place = (kind, at, k) => {
    if (!at || !hasKit(kind)) return;
    const m = part(kind);
    m.scale.setScalar(k);
    m.rotation.y = rand() * Math.PI * 2;
    m.position.copy(at).y -= /palm|rock/.test(kind) ? .1 * k : 0;
    model.add(m);
  };
  const area = ISLE_SCALE * ISLE_SCALE, palms = [...props.keys()].filter(k => /Palm/.test(k)).length;
  for (let i = 0; i < Math.round(palms * (area - 1) * .35); i++) place('palm_tree', spot(/Meadow|Hilltop|Beach/, 7), sp * (1.05 + rand() * .35));
  for (let i = 0; i < Math.round(4 * area); i++) place('rock_cluster', spot(/Beach|Rock_Slope|Meadow_Outer|Summit/, 5), sp * (.7 + rand() * 1.1));
  // Where the sand meets the sea along the dock's line: our pier starts a few metres up the beach from there.
  const groundAt = (x, z) => { ray.set(new THREE.Vector3(x, 500, z), down); const h = ray.intersectObjects(land, false)[0]; return h ? h.point : null; };
  let coast = 0;
  if (dockAt) for (let r = shore * .3; r < shore * 1.5; r += .5) {
    const g = groundAt(Math.cos(dockAng) * r, Math.sin(dockAng) * r);
    if (!g || g.y < -.2) { coast = r; break; }
  }
  // Cargo stacked on the sand either side of the pier's foot.
  if (coast && dir) for (let i = 0; i < 5; i++) {
    const along = coast - 5 - rand() * 6, across = (i % 2 ? 1 : -1) * (5 + rand() * 4);
    const g = groundAt(Math.cos(dockAng) * along - Math.sin(dockAng) * across, Math.sin(dockAng) * along + Math.cos(dockAng) * across);
    if (g && g.y > .2) place(i % 3 ? 'barrel_intact' : 'barrel_damaged', g, 1.3);
  }
  // Each kind of cargo and wreckage is half a dozen more draw calls, so only the islands you land on get them.
  if (dir) for (const kind of ['floating_plank_cluster', 'broken_mast_section', 'wrecked_hull_chunk'])
    place(kind, spot(/Beach/, 6, .75, 1.05), 1.8);
  mergeStatic(model, /(?!)/);

  model.position.y = .35;
  const wrap = new THREE.Group();
  wrap.add(model);
  if (dir && dockAt) wrap.rotation.y = Math.atan2(-dir.z, dir.x) - Math.atan2(-dockAt.z, dockAt.x);
  else wrap.rotation.y = seed * 2.39;
  for (const ch of isl.children) ch.visible = false;
  isl.add(wrap);
  isl.userData.model = wrap;
  return coast || null;
}

// A pier of Артем's dock segments laid end to end along +X.
export function buildKitPier(name, segments = 3) {
  const g = new THREE.Group();
  for (let i = 0; i < segments; i++) {
    const seg = part(name);
    seg.scale.setScalar(DOCK_SCALE);
    seg.rotation.y = Math.PI / 2; // the segment's +Z becomes the pier's +X
    seg.position.set(.3 * DOCK_SCALE + i * DOCK_PITCH, .3, 0);
    g.add(seg);
  }
  return g;
}

// Built-in pier, used until the kit has loaded: a plank deck on posts.
export function buildPier(length) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, .3, PIER_WIDTH), pbr('deck_oak', { repeat: [length / 4, 1] }));
  deck.position.set(length / 2, 1.45, 0);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  const postMat = pbr('weathered_hull', { repeat: [1, 2], color: '#9a8270' });
  const postGeo = new THREE.CylinderGeometry(.24, .28, 5, 7);
  for (let x = 1; x <= length; x += 3.4) for (const z of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(Math.min(x, length - .3), -.8, z * (PIER_WIDTH / 2 - .1));
    post.castShadow = true;
    g.add(post);
  }
  // Bollards to tie up to, and a lantern at the end so the pier reads from far off.
  const iron = pbr('worn_iron', { color: '#6f747c' });
  for (let x = 4; x < length; x += 7) for (const z of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .6, 8), iron);
    b.position.set(x, 1.9, z * (PIER_WIDTH / 2 - .35));
    g.add(b);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 3.2, 6), postMat);
  pole.position.set(length - .4, 3.2, PIER_WIDTH / 2 - .3);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb300', emissiveIntensity: 1.6 }));
  lamp.position.set(length - .4, 4.9, PIER_WIDTH / 2 - .3);
  g.add(pole, lamp);
  return g;
}

// The berth: a ship-shaped outline on the water showing exactly where to stop. Bow to -Z, like the ships.
export function buildBerth(length, width) {
  const L = length / 2, W = width;
  const s = new THREE.Shape();
  s.moveTo(0, L);
  s.quadraticCurveTo(W * .55, L * .55, W / 2, L * .1);
  s.lineTo(W / 2, -L * .8);
  s.quadraticCurveTo(W / 2, -L, W * .3, -L);
  s.lineTo(-W * .3, -L);
  s.quadraticCurveTo(-W / 2, -L, -W / 2, -L * .8);
  s.lineTo(-W / 2, L * .1);
  s.quadraticCurveTo(-W * .55, L * .55, 0, L);
  const g = new THREE.Group();
  const fillMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide });
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(s, 12).rotateX(-Math.PI / 2), fillMat);
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffd24a', transparent: true, opacity: .95 });
  const pts = s.getPoints(12).map(p => new THREE.Vector3(p.x, 0, -p.y));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  // Bow arrow so it is clear which end is which; either way round is fine for mooring.
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.6, 1.6, 3).rotateX(-Math.PI / 2), fillMat.clone());
  arrow.position.set(0, .05, -L * .45);
  arrow.material.opacity = .5;
  g.add(fill, line, arrow);
  g.userData.setColor = c => { fillMat.color.set(c); lineMat.color.set(c); arrow.material.color.set(c); };
  return g;
}

// Goal marker: a soft beam of light from the sky and a spinning arrow pointing down at the target.
export function buildMarker() {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 4.5, 140, 16, 1, true), beamMat);
  beam.position.y = 60;
  g.add(beam);
  const arrowMat = new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ff9d00', emissiveIntensity: 1.2, flatShading: true, fog: false });
  const arrow = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(3, 4.5, 4), arrowMat);
  head.rotation.x = Math.PI;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4, 1.6), arrowMat);
  shaft.position.y = 4;
  arrow.add(head, shaft);
  g.add(arrow);
  g.userData = {
    beam, arrow,
    setColor(c) {
      if (g.userData.color === c) return;
      g.userData.color = c;
      beamMat.color.set(c); arrowMat.color.set(c); arrowMat.emissive.set(c).multiplyScalar(.7);
    },
  };
  return g;
}
