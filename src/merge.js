import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The kit's ships and islands come as a hundred or more small meshes each, one draw call apiece (twice with shadows).
// Parts that never move on their own are welded into one mesh per material. Parts the game finds by name or moves
// (`keep`) stay as they are, along with everything under them.

// Plain float copy in the root's space: the kit's attributes are quantized and laid out per node.
function flatten(mesh, toRoot) {
  const src = mesh.geometry, g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = a.getComponent(i, j);
    g.setAttribute(name, new THREE.BufferAttribute(out, k));
  }
  const count = src.attributes.position.count;
  g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: count }, (_, i) => i));
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
  return g;
}

export function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const kept = o => { for (let p = o; p && p !== root; p = p.parent) if (keep.test(p.name)) return true; return false; };
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.visible || kept(o) || Array.isArray(o.material) || o.geometry.morphAttributes.position) return;
    const key = `${o.material.uuid}|${Object.keys(o.geometry.attributes).sort().join(',')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after++; continue; }
    const geo = mergeGeometries(list.map(m => flatten(m, toRoot)));
    if (!geo) { after += list.length; continue; }
    const m = new THREE.Mesh(geo, list[0].material);
    m.name = `Welded_${list[0].material.name || list[0].name}`;
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    for (const o of list) o.removeFromParent();
    after++;
  }
  return { before, after };
}
