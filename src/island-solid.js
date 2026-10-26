import * as THREE from 'three';

// Close authored terrain sheets below the waterline. Project the actual triangles
// to a lower floor and skirt every open edge (including pond/bay boundaries).
// No enclosing disk: the open crescent bay retains its original outline.
export function makeIslandFoundation(ground) {
  const bounds = new THREE.Box3();
  for (const m of ground) { m.geometry.computeBoundingBox(); bounds.union(m.geometry.boundingBox); }
  const floor = Math.min(-4, bounds.min.y - 1), positions = [], edges = new Map(), caps = new Set();
  const key = v => v.map(n => Math.round(n * 1e4)).join(',');
  const triangle = (a,b,c) => positions.push(...a,...b,...c);
  let topTriangles = 0;
  for (const mesh of ground) {
    const g=mesh.geometry,p=g.attributes.position,count=g.index?.count??p.count;
    for(let i=0;i<count;i+=3){
      const vertices=[0,1,2].map(k=>{const j=g.index?g.index.getX(i+k):i+k;return [p.getX(j),p.getY(j),p.getZ(j)];});
      topTriangles++;
      const [a,b,c]=vertices, area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
      if(Math.abs(area)>1e-7){
        const at=vertices.map(v=>[v[0],floor,v[2]]),capKey=at.map(key).sort().join('|');
        if(!caps.has(capKey)){caps.add(capKey);triangle(at[0],at[area>0?1:2],at[area>0?2:1]);}
      }
      for(let k=0;k<3;k++){
        const a=vertices[k],b=vertices[(k+1)%3],id=[key(a),key(b)].sort().join('|');
        if(!edges.has(id))edges.set(id,{a,b,count:0});edges.get(id).count++;
      }
    }
  }
  let skirts=0;
  for(const {a,b,count} of edges.values())if(count===1){
    const lowA=[a[0],floor,a[2]],lowB=[b[0],floor,b[2]];
    triangle(a,b,lowB);triangle(a,lowB,lowA);skirts++;
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({name:'island_v3_foundation',color:'#594c3c',roughness:.98,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Island_solid_foundation';mesh.receiveShadow=true;
  mesh.userData.foundation={floor,skirts,caps:caps.size,triangles:positions.length/9,topTriangles};
  return mesh;
}
