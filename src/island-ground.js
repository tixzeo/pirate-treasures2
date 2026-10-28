import * as THREE from 'three';

// Downward probes only hit physical terrain, never palm crowns, water or props.
// Kept transient during fitting; no scene objects are retained in terrain data.
export function groundProbe(meshes) {
  let top = 0;
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();mesh.updateMatrixWorld(true);
    top=Math.max(top,mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).max.y);
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  return (x, z) => {
    ray.ray.origin.set(x, top + 10, z);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit && { x, y: hit.point.y, z, slope: Math.abs(hit.face.normal.y) };
  };
}

const surfaces=new WeakMap();
const queryMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});

// Internal asset adapter: capture physical terrain before draw-call welding.
// Share only immutable position/index buffers, not props, water, UVs or a live
// mesh transform that mergeStatic may detach and the renderer may later change.
export function makeGroundSurface(meshes){
  const queries=meshes.map(mesh=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',mesh.geometry.attributes.position);
    if(mesh.geometry.index)geometry.setIndex(mesh.geometry.index);
    const query=new THREE.Mesh(geometry,queryMaterial);mesh.updateMatrixWorld(true);
    query.matrixAutoUpdate=false;query.matrix.copy(mesh.matrixWorld);query.updateMatrixWorld(true);
    return query;
  });
  const bounds=new THREE.Box3();
  for(const q of queries){q.geometry.computeBoundingBox();bounds.union(q.geometry.boundingBox.clone().applyMatrix4(q.matrixWorld))}
  const probe=groundProbe(queries);
  return {bounds,heightAt(x,z){return probe(x,z)?.y??null}};
}

export function bindIslandGround(isle,surface,frame){surfaces.set(isle,{surface,frame})}

// Public read-only queries in WORLD metres. Islands are upright (yaw, scale and
// translation); bounds are a coarse AABB, not a walkable outline. null means no
// fitted terrain/no hit; negative heights are seabed, not dry walking surface.
export function groundHeightAt(isle,x,z){
  const entry=surfaces.get(isle);
  if(!entry||!Number.isFinite(x)||!Number.isFinite(z))return null;
  const {surface,frame}=entry;frame.updateWorldMatrix(true,false);
  const local=new THREE.Vector3(x,0,z).applyMatrix4(frame.matrixWorld.clone().invert());
  const y=surface.heightAt(local.x,local.z);
  return y===null?null:new THREE.Vector3(local.x,y,local.z).applyMatrix4(frame.matrixWorld).y;
}

export function islandBounds(isle){
  const entry=surfaces.get(isle);if(!entry)return null;
  entry.frame.updateWorldMatrix(true,false);
  const b=entry.surface.bounds.clone().applyMatrix4(entry.frame.matrixWorld);
  return Object.freeze({minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z});
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
