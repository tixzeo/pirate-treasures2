import * as THREE from 'three';
import { boundsOf } from './ship-layout.js';
import { captureMorskoyLayout, groupMorskoySails } from './morskoy.js';
import { mergeStatic } from './merge.js';
import { makeDeckZone, findDeckSpawn } from './deck-walk.js';

// V6 has its own UVs, PBR materials and native 32m hull. V2's stern deformation,
// replacement wall and material buckets must never be applied to this asset.
export function prepareMorskoyV6(root) {
  const quarter = boundsOf(root, n => /_Quarterdeck$/.test(n)).max.y;
  const rim = boundsOf(root, n => /^captains_wheel_rim_/.test(n));
  const pedestal = boundsOf(root, n => /^wheel_pedestal_/.test(n));
  if (rim.isEmpty() || pedestal.isEmpty() || !Number.isFinite(quarter)) throw Error('V6 helm/deck contract missing');
  const pivot = pedestal.getCenter(new THREE.Vector3()); pivot.y = quarter;
  const scale = 1.3 / (rim.max.x - rim.min.x);
  const materials = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    // Uniform helm adjustment about the measured floor, retaining a round wheel.
    if (/^(wheel_|captains_wheel_)/.test(mesh.name)) {
      const matrix = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
      const inverse = matrix.clone().invert(), p = mesh.geometry.attributes.position, v = new THREE.Vector3();
      mesh.geometry = mesh.geometry.clone();
      const out = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix).sub(pivot).multiplyScalar(scale).add(pivot).applyMatrix4(inverse);
        out.setXYZ(i, v.x, v.y, v.z);
      }
      out.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    }
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    const mat = mesh.material;
    if (!materials.has(mat)) {
      materials.add(mat);
      // Unassigned vertex-painted parts inherit glTF's metallic default.
      if (!mat.name) { mat.metalness = 0; mat.roughness = .85; }
      if (/window|glass/.test(mat.name)) mat.userData.glowColor = '#ffbd68';
    }
  });
  captureMorskoyLayout(root, { extraSolids: /_Mast_[01]$|^V4_(central_capstan_vertical|capstan_crossbar|oak_barrels)_/ });
  const navigation = { space: 'ship-local', ...root.userData.shipParts };
  const zone = makeDeckZone(navigation);
  const occupied = [];
  for (const [role, preferred] of [['bosun', { x: -1.15, z: -3 }], ['tim_cabin_boy', { x: 1.15, z: -10 }]]) {
    const spawn = findDeckSpawn({ ...zone, obstacles: [...zone.obstacles, ...occupied] }, preferred);
    if (!spawn) throw Error(`V6 has no safe ${role} station`);
    root.userData.shipParts.anchors[role] = [spawn.x, spawn.y, spawn.z];
    occupied.push({ min: [spawn.x - .35, spawn.y, spawn.z - .35], max: [spawn.x + .35, spawn.y + 1.75, spawn.z + .35] });
  }
  // Flat contract floors otherwise cover the authored textured planks.
  root.traverse(mesh => { if (/_CannonMuzzle_|_Deck$|_Quarterdeck$/.test(mesh.name)) mesh.visible = false; });
  const sails = groupMorskoySails(root);
  for (const { group } of sails) mergeStatic(group, /$a/);
  root.userData.assetVersion = 6;
  root.userData.helm = { diameter: 1.3, scale, pivot: pivot.toArray() };
}
