import * as THREE from 'three';

// Bounds of named meshes in root-local space. Also used by the kit's islands.
export function boundsOf(root, test) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), box = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || !test(o.name)) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
  });
  return box;
}

const plain = box => ({ min: box.min.toArray(), max: box.max.toArray() });
const boxOf = b => new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
const OBSTACLE = /_(CaptainCabin|Mast_\d+|MastCollar_\d+|CannonCarriage_.+|CannonBarrel_.+|Crate_\d+|Barrel_\d+)$/;

// Capture before mergeStatic removes names. Plain data survives Object3D.clone()
// and adds no retained meshes or draw calls. These are candidate AABBs, not a navmesh.
export function captureShipParts(root) {
  const hull = boundsOf(root, n => /_CarvedHull$/.test(n));
  const surfaces = [], obstacles = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (/_Deck$|_Quarterdeck$/.test(o.name)) surfaces.push({
      name: o.name, kind: /_Quarterdeck$/.test(o.name) ? 'quarterdeck' : 'deck',
      bounds: plain(boundsOf(root, n => n === o.name)),
    });
    if (OBSTACLE.test(o.name)) obstacles.push({ name: o.name, bounds: plain(boundsOf(root, n => n === o.name)) });
  });
  return { hull: plain(hull), surfaces, obstacles };
}

// All dimensions, surfaces, obstacles and gun centres use this same transform.
// Y/Z retain proportions; X is fitted independently only when deckWidth is supplied.
export function fitShipLayout(parts, { length, deckWidth }) {
  const hull = boxOf(parts.hull), deck = parts.surfaces.find(s => s.kind === 'deck');
  if (hull.isEmpty() || !deck || !Number.isFinite(length) || !(length > 0) ||
      (deckWidth !== undefined && (!Number.isFinite(deckWidth) || !(deckWidth > 0))))
    throw new Error('Ship needs a valid hull, deck and positive dimensions');
  const size = hull.getSize(new THREE.Vector3()), d = boxOf(deck.bounds).getSize(new THREE.Vector3());
  if (!(size.z > 0 && d.x > 0)) throw new Error('Ship hull/deck has zero extent');
  const s = length / size.z;
  const scale = { x: deckWidth === undefined ? s : deckWidth / d.x, y: s, z: s };
  const offsetZ = -(hull.min.z + hull.max.z) / 2 * s;
  const transform = b => ({
    min: [b.min[0] * scale.x, b.min[1] * s, b.min[2] * s + offsetZ],
    max: [b.max[0] * scale.x, b.max[1] * s, b.max[2] * s + offsetZ],
  });
  return {
    space: 'ship-local', approximate: true, scale, offsetZ,
    hull: transform(parts.hull),
    surfaces: parts.surfaces.map(p => ({ ...p, bounds: transform(p.bounds) })),
    obstacles: parts.obstacles.map(p => ({ ...p, bounds: transform(p.bounds) })),
    anchors: Object.fromEntries(Object.entries(parts.anchors || {}).map(([name, p]) =>
      [name, [p[0] * scale.x, p[1] * s, p[2] * s + offsetZ]])),
  };
}
