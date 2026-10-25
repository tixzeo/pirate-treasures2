import * as THREE from 'three';
import { boundsOf } from './ship-layout.js';
import { mergeStatic } from './merge.js';
import { PLAYER_SHIP, MORSKOY_STERN } from './ship-config.js';

const plain = b => ({ min: b.min.toArray(), max: b.max.toArray() });

// The supplied GLB batches separate guns, walls and steps into meshes. Recover
// connected solids for metadata; a single box around all eight guns would block
// the entire deck. Vertices duplicated at face seams are joined by position.
function components(geometry) {
  const p = geometry.attributes.position, parent = Array.from({ length: p.count }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { parent[find(a)] = find(b); };
  const positions = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e5)).join(',');
    if (positions.has(key)) join(i, positions.get(key)); else positions.set(key, i);
  }
  const index = geometry.index, count = index?.count ?? p.count;
  const at = i => index ? index.getX(i) : i;
  for (let i = 0; i < count; i += 3) { join(at(i), at(i + 1)); join(at(i), at(i + 2)); }
  const out = new Map();
  for (let i = 0; i < count; i += 3) {
    const key = find(at(i));
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(at(i), at(i + 1), at(i + 2));
  }
  return [...out.values()];
}

function componentBox(mesh, indices, toRoot) {
  const box = new THREE.Box3(), p = mesh.geometry.attributes.position;
  for (const i of indices) box.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(toRoot));
  return box;
}

function subset(mesh, indices) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(mesh.geometry.attributes)) {
    const values = new Float32Array(indices.length * a.itemSize);
    indices.forEach((i, k) => { for (let j = 0; j < a.itemSize; j++) values[k * a.itemSize + j] = a.getComponent(i, j); });
    geometry.setAttribute(name, new THREE.BufferAttribute(values, a.itemSize));
  }
  const m = new THREE.Mesh(geometry, mesh.material);
  m.name = mesh.name;
  mesh.updateWorldMatrix(true, false);
  m.applyMatrix4(mesh.matrixWorld);
  return m;
}

function finishMaterials(root) {
  const materials = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.name;
    const kind = /lantern.*glass/i.test(n) ? 'lantern' : /window.*glass|transom_glass/i.test(n) ? 'window' :
      /Sail|headsail|canvas|mizzen_sail/i.test(n) ? 'canvas' :
      /cannon_barrel|iron_cannonballs|lantern_iron/i.test(n) ? 'iron' :
      /gold|brass|scroll|stud|bell|compass_rose|windrose/i.test(n) ? 'brass' : 'wood';
    if (!materials.has(kind)) {
      const mat = o.material.clone();
      mat.name = `morskoy_${kind}`;
      mat.metalness = kind === 'iron' || kind === 'brass' ? .55 : 0;
      mat.roughness = kind === 'iron' || kind === 'brass' ? .4 : .8;
      mat.side = kind === 'canvas' ? THREE.DoubleSide : THREE.FrontSide;
      if (kind === 'lantern' || kind === 'window') mat.userData.glowColor = kind === 'lantern' ? '#ffb347' : '#74cbd1';
      materials.set(kind, mat);
    }
    o.material = materials.get(kind);
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    // Contract markers are measured by dressShip, not drawn as coloured dots.
    if (/_CannonMuzzle_/.test(n)) o.visible = false;
  });
}

// Adapter for the original, byte-identical review file. No edits to the boss or
// generic kit naming conventions; sail groups and physical metadata are built once.
export function prepareMorskoy(root) {
  fitStern(root);
  addBackWall(root);
  root.updateMatrixWorld(true);
  const meshes = root.getObjectsByProperty('isMesh', true);
  const hull = boundsOf(root, n => /_CarvedHull$/.test(n));
  const surfaces = [], obstacles = [];
  const inv = root.matrixWorld.clone().invert();
  for (const mesh of meshes) {
    const n = mesh.name;
    if (/_Deck(?:_\d+)?$|_Quarterdeck(?:_\d+)?$/.test(n)) surfaces.push({
      name: n, kind: /Quarterdeck/.test(n) ? 'quarterdeck' : 'deck', bounds: plain(boundsOf(root, name => name === n)),
    });
    const step = /^quarterdeck_stairs_/.test(n);
    const solid = /^(mast_\d+_main|mizzen_mast|cannon_carriages|cannon_barrel|cabin_side_wall|cabin_back_wall|cabin_front_bulkhead|cabin_door_header|cabin_chart_table|cabin_chest|wheel_pedestal|capstan_base|capstan_handles|hatch_panels)_/.test(n);
    if (!step && !solid) continue;
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    components(mesh.geometry).forEach((indices, i) => {
      const bounds = plain(componentBox(mesh, indices, toRoot));
      if (step) surfaces.push({ name: `${n}_${i}`, kind: 'step', bounds });
      else obstacles.push({ name: `${n}_${i}`, bounds });
    });
  }
  const deckY = Math.max(...surfaces.filter(s => s.kind === 'deck').map(s => s.bounds.max[1]));
  const quarterY = Math.max(...surfaces.filter(s => s.kind === 'quarterdeck').map(s => s.bounds.max[1]));
  const wheel = boundsOf(root, n => /^wheel_pedestal_/.test(n)).getCenter(new THREE.Vector3());
  root.userData.shipParts = {
    hull: plain(hull), surfaces, obstacles,
    anchors: {
      captain: [wheel.x, quarterY, wheel.z + MORSKOY_STERN.standGap / (PLAYER_SHIP.length / 22)],
      bosun: [-.85, deckY, -2.7],
      tim_cabin_boy: [-1, deckY, -8.2],
    },
  };

  // Keep each striped canvas intact and give it a yard-height pivot. One welded
  // mesh per sail, rather than independently moving each of its eight stripes.
  const groups = new Map();
  for (const mesh of meshes) {
    const strip = /^_Sail_(\d+)_(\d+)_\d+_\d+$/.exec(mesh.name);
    const head = /^headsail_(\d+)_/.exec(mesh.name);
    if (!strip && !head) continue;
    const key = strip ? `${strip[1]}_${strip[2]}` : `3_${head[1]}`;
    if (!groups.has(key)) {
      const group = new THREE.Group(); group.name = `MorskoyStrannik_Sail_${key}`;
      root.add(group); groups.set(key, group);
    }
    groups.get(key).attach(mesh);
  }
  const sails = [...groups.values()].map(group => ({ group, box: new THREE.Box3().setFromObject(group) }));
  // Seams, clews and the painted emblem follow their own sail. These meshes batch
  // decorations from several sails, so partition them by connected component.
  for (const mesh of meshes.filter(o => /^(canvas_seams|sail_footrope|sail_clews|windrose_emblem)_/.test(o.name))) {
    const buckets = new Map();
    for (const indices of components(mesh.geometry)) {
      const centre = componentBox(mesh, indices, mesh.matrixWorld).getCenter(new THREE.Vector3());
      const nearest = sails.reduce((a, b) => a.box.distanceToPoint(centre) < b.box.distanceToPoint(centre) ? a : b);
      if (!buckets.has(nearest.group)) buckets.set(nearest.group, []);
      buckets.get(nearest.group).push(...indices);
    }
    for (const [group, indices] of buckets) group.attach(subset(mesh, indices));
    mesh.removeFromParent();
  }
  for (const { group, box } of sails) {
    const pivot = box.getCenter(new THREE.Vector3()); pivot.y = box.max.y;
    const children = [...group.children];
    children.forEach(child => root.attach(child));
    group.position.copy(pivot);
    children.forEach(child => group.attach(child));
  }
  finishMaterials(root);
  // Welding here shares canvas materials but retains one independently moving group.
  for (const { group } of sails) mergeStatic(group, /$a/);
}

// Lower the cabin/quarterdeck together, retaining headroom, connected stairs and
// railings. Keep the hull, main deck and forward masts unchanged. The helm is a
// separate uniformly resized assembly, so its round wheel stays round.
function fitStern(root) {
  const deck = boundsOf(root, n => /_Deck(?:_\d+)?$/.test(n)).max.y;
  const quarter = boundsOf(root, n => /_Quarterdeck(?:_\d+)?$/.test(n)).max.y;
  const scale = PLAYER_SHIP.length / 22, rise = MORSKOY_STERN.rise / scale;
  const ratio = rise / (quarter - deck), drop = quarter - deck - rise;
  const wheel = boundsOf(root, n => /^wheel_pedestal_/.test(n)).getCenter(new THREE.Vector3());
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.name, helm = /^(wheel_|captains_wheel_)/.test(n);
    const cabin = /^(cabin_|stern_transom|stern_window|stern_compass|MorskoyStrannik_Quarterdeck|_Quarterdeck|quarterdeck_stairs|stair_stringers|stern_underdeck|stern_gallery|transom_)/.test(n);
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), fromRoot = toRoot.clone().invert();
    const geo = o.geometry = o.geometry.clone(), p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(toRoot);
      if (helm) {
        v.x = wheel.x + (v.x - wheel.x) * MORSKOY_STERN.helmScale;
        v.z = wheel.z + (v.z - wheel.z) * MORSKOY_STERN.helmScale;
        v.y = quarter - drop + (v.y - quarter) * MORSKOY_STERN.helmScale;
      } else if (cabin) {
        if (v.y > deck) v.y = v.y < quarter ? deck + (v.y - deck) * ratio : v.y - drop;
      } else if (v.z >= 6.25 && v.y >= quarter - .05) v.y -= drop;
      if (/^stern_(transom|window|compass)/.test(n)) v.z -= .4;
      v.applyMatrix4(fromRoot); p.setXYZ(i, v.x, v.y, v.z);
    }
    p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  });
}

function addBackWall(root) {
  const windows = root.getObjectsByProperty('isMesh', true).find(o => /^stern_transom_glass_/.test(o.name));
  const floor = boundsOf(root, n => /^cabin_floorboards_/.test(n)).max.y;
  const roof = boundsOf(root, n => /_Quarterdeck(?:_\d+)?$/.test(n)).min.y;
  const shape = new THREE.Shape();
  shape.moveTo(-2.14, floor); shape.lineTo(2.14, floor); shape.lineTo(2.14, roof); shape.lineTo(-2.14, roof); shape.closePath();
  for (const indices of components(windows.geometry)) {
    const b = componentBox(windows, indices, windows.matrixWorld), hole = new THREE.Path();
    hole.moveTo(b.min.x - .02, b.min.y - .02); hole.lineTo(b.max.x + .02, b.min.y - .02);
    hole.lineTo(b.max.x + .02, b.max.y + .02); hole.lineTo(b.min.x - .02, b.max.y + .02); hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .10, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, 10.47);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([.43, .25, .13], i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const wall = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
  wall.name = 'cabin_back_wall_0'; root.add(wall);
}
