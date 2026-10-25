import * as THREE from 'three';
import { boundsOf } from './ship-layout.js';
import { flatten, mergeStatic } from './merge.js';
import { makeIslandShape, shoreDistance } from './island-shape.js';

export const ISLAND_V3 = ['island_cove_small', 'island_lagoon', 'island_volcanic', 'island_crescent_bay', 'island_jungle_ruins', 'island_fortress_rock'];
export const isIslandV3 = name => ISLAND_V3.includes(name);
const TERRAIN = /(?:submerged_rock_rim|sand_and_grass|shore_shelf|kidney_terrain|basalt_shore|outer_black_sand|crater_cone|curved_terrain|outer_rock_wall|inner_rock_wall|headland_\d+|basal_cliffs|_terrain|jagged_rock_shelf|base_terrain|crag_\d+)$/;
const PIER = /_pier_|_landing_/;
const STILL_WATER = /spring$|inner_pool$|cenote$/;
export const POND_LEVEL = .12;

export function prepareIslandV3(root) {
  const materials = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.name;
    const type = /_lava_(?:lake|core|fissure)/.test(n) ? 'lava' : /spring$|inner_pool$|inner_lagoon$|cenote$|waterfall_strip/.test(n) ? 'water' :
      /frond|crown|grass_|fern_|reeds_|flag$/.test(n) ? 'foliage' : /pier|hut|barrel|table|fence|plank/.test(n) ? 'wood' : 'ground';
    if (!materials.has(type)) {
      const mat = o.material.clone(); mat.name = `island_v3_${type}`;
      mat.metalness = 0; mat.roughness = type === 'water' ? .3 : .9;
      // The supplied cone faces inward, and several terrain fans mix winding.
      // Two-sided opaque ground keeps the authored surface visible from above.
      if (type === 'ground' || type === 'foliage' || type === 'water') mat.side = THREE.DoubleSide;
      if (type === 'water') { mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
        mat.vertexColors = false; mat.color.set('#347d78'); mat.roughness = .4; }
      if (type === 'lava') { mat.emissive.set('#fa4a04'); mat.emissiveIntensity = .6; }
      materials.set(type, mat);
    }
    o.material = materials.get(type);
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
  });
}

function propKey(name) {
  const direct = /^(.*_palm_\d+)_|^(.*_(?:fishers?_hut|stilt_hut_[ab]|guard_hut))_|^(.*_(?:supply|cargo)_barrel_[ab])(?:_|$)|^(.*_(?:beach_rock|cove_rock|basalt_boulder|boulder)_\d+)$/.exec(name);
  if (direct) return direct.slice(1).find(Boolean);
  if (/^Jungle_ruins_(?:temple|capital|intact_lintel|fallen_lintel|marker)/.test(name)) return 'JungleTemple';
  if (/^Fortress_rock_(?:keep|merlon|wall|battery|arrow_slit|flagpole|red_flag)/.test(name)) return 'FortressKeep';
  return null;
}

// Ground footprint retains the game's established island sizes. Palms, huts and
// landmarks keep their authored proportions at a smaller prop scale; no old random
// foliage is scattered over the new artwork. Lift the asset 35 cm, as for the
// legacy islands, so its low beaches do not sit exactly on the sea plane.
export function fitIslandV3(src, shore, dir, seed = 1, isleScale = 2.5) {
  const native = boundsOf(src, n => TERRAIN.test(n));
  if (native.isEmpty()) throw new Error('V3 island is missing terrain');
  const centre = native.getCenter(new THREE.Vector3()), size = native.getSize(new THREE.Vector3());
  const scale = shore / (Math.max(size.x, size.z) / 2), vertical = scale / Math.sqrt(isleScale), propScale = Math.min(2, scale / isleScale);
  src.updateMatrixWorld(true); const inv = src.matrixWorld.clone().invert();
  const model = new THREE.Group(), ground = [], props = new Map(), piers = [], still = [], dock = new THREE.Box3();
  src.traverse(o => {
    if (!o.isMesh) return;
    const geo = flatten(o, inv), m = new THREE.Mesh(geo, o.material); m.name = o.name;
    if (PIER.test(o.name)) { geo.computeBoundingBox(); dock.union(geo.boundingBox); piers.push(m); return; }
    const key = propKey(o.name);
    if (key) { if (!props.has(key)) props.set(key, []); props.get(key).push(m); return; }
    geo.translate(-centre.x, 0, -centre.z).scale(scale, vertical, scale).translate(0, .35, 0);
    if (STILL_WATER.test(o.name)) { geo.computeBoundingBox(); still.push({ bounds: geo.boundingBox.clone(), material: m.material }); geo.dispose(); return; }
    // This authored flat disk lies inside a bay open to the sea. The ocean alone
    // renders that bay; overlapping flat surfaces made its triangles visible.
    if (/inner_lagoon$/.test(o.name)) { geo.dispose(); return; }
    model.add(m); if (TERRAIN.test(o.name)) ground.push(m);
  });
  for (const list of props.values()) {
    const box = new THREE.Box3();
    for (const m of list) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
    const at = new THREE.Vector3(), v = new THREE.Vector3(); let count = 0;
    for (const m of list) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (v.fromBufferAttribute(p, i).y < box.min.y + .1) { at.add(v); count++; }
    }
    at.divideScalar(count); at.y = box.min.y;
    for (const m of list) {
      m.geometry.translate(-at.x, -at.y, -at.z).scale(propScale, propScale, propScale);
      m.position.set((at.x - centre.x) * scale, at.y * vertical + .35, (at.z - centre.z) * scale); model.add(m);
    }
  }
  const terrain = makeIslandShape(ground);
  const ponds = [];
  for (const basin of terrain.basins) {
    const cells = basin.map(i => ({ x: terrain.minX + (i % terrain.size + .5) * terrain.cell,
      z: terrain.minZ + (Math.floor(i / terrain.size) + .5) * terrain.cell }));
    const source = still.find(s => cells.some(p => p.x >= s.bounds.min.x && p.x <= s.bounds.max.x && p.z >= s.bounds.min.z && p.z <= s.bounds.max.z));
    if (!source) continue;
    const selected = new Set(basin);
    for (const i of basin) for (const n of [i - 1, i + 1, i - terrain.size, i + terrain.size]) if (n >= 0 && n < terrain.size ** 2) selected.add(n);
    const positions = [], indices = [];
    for (const i of selected) {
      const x = terrain.minX + (i % terrain.size) * terrain.cell, z = terrain.minZ + Math.floor(i / terrain.size) * terrain.cell, c = terrain.cell, at = positions.length / 3;
      positions.push(x,POND_LEVEL,z, x+c,POND_LEVEL,z, x+c,POND_LEVEL,z+c, x,POND_LEVEL,z+c);
      indices.push(at,at+2,at+1, at,at+3,at+2);
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const pond = new THREE.Mesh(geometry,source.material); pond.name = 'Still_inland_water'; model.add(pond);
    ponds.push({ cellCount: basin.length, center: [cells.reduce((a,p)=>a+p.x,0)/cells.length, POND_LEVEL, cells.reduce((a,p)=>a+p.z,0)/cells.length] });
  }
  if (still.length && !ponds.length) throw new Error('Authored inland water has no enclosed terrain basin');
  terrain.ponds = ponds; delete terrain.basins;
  const nativeDir = dock.isEmpty() ? new THREE.Vector3(0, 0, 1) : dock.getCenter(new THREE.Vector3()).sub(centre).setY(0).normalize();
  let coast = 0;
  for (let r = terrain.radius; r >= 0; r -= .25) if (shoreDistance(terrain, nativeDir.x * r, nativeDir.z * r) < 0) { coast = r; break; }
  if (!coast) throw new Error('V3 island pier has no land at its root');
  if (!dir) for (const m of piers) {
    m.geometry.translate(-centre.x - nativeDir.x * coast / scale, 0, -centre.z - nativeDir.z * coast / scale).scale(propScale, propScale, propScale);
    m.position.set(nativeDir.x * coast, .35, nativeDir.z * coast); model.add(m);
  }
  model.traverse(o => { if (o.isMesh) { o.castShadow = o.material.name !== 'island_v3_water'; o.receiveShadow = true; } });
  mergeStatic(model, /(?!)/);
  const wrap = new THREE.Group(); wrap.add(model);
  wrap.rotation.y = dir ? Math.atan2(dir.x, dir.z) - Math.atan2(nativeDir.x, nativeDir.z) : seed * 2.39;
  terrain.yaw = wrap.rotation.y;
  return { wrap, terrain, coast, scale, vertical, propScale };
}
