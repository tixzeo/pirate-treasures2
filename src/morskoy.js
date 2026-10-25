import * as THREE from 'three';
import { boundsOf } from './ship-layout.js';
import { mergeStatic } from './merge.js';

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

// Adapter for the original, byte-identical review asset. No edits to the boss or
// generic kit naming conventions; sail groups and physical metadata are built once.
export function prepareMorskoy(root) {
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
    const solid = /^(mast_\d+_main|mizzen_mast|cannon_carriages|cannon_barrel|cabin_side_wall|cabin_front_bulkhead|cabin_door_header|cabin_chart_table|cabin_chest|wheel_pedestal|capstan_base|capstan_handles|hatch_panels)_/.test(n);
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
      captain: [wheel.x, quarterY, wheel.z + .85],
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
