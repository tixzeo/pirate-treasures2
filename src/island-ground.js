import * as THREE from 'three';

// Downward probes only hit physical terrain, never palm crowns, water or props.
// Kept transient during fitting; no scene objects are retained in terrain data.
export function groundProbe(meshes) {
  let top = 0;
  for (const mesh of meshes) { mesh.geometry.computeBoundingBox(); top = Math.max(top, mesh.geometry.boundingBox.max.y); mesh.updateMatrixWorld(true); }
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  return (x, z) => {
    ray.ray.origin.set(x, top + 10, z);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit && { x, y: hit.point.y, z, slope: Math.abs(hit.face.normal.y) };
  };
}

export function groundedAnchor(probe, x, z, minimum = .2, reach = 16) {
  const direct = probe(x, z);
  if (direct?.y >= minimum) return direct;
  // Some source props overhang their low shore. Move only those to the nearest
  // dry support; otherwise a horizontal stretch would strand the root offshore.
  const step = Math.max(.5, reach / 64);
  for (let radius = step; radius <= reach; radius += step) for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, hit = probe(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
    if (hit?.y >= minimum && hit.slope >= .55) return hit;
  }
  throw Error(`Island prop has no dry ground near ${x.toFixed(2)},${z.toFixed(2)}`);
}
