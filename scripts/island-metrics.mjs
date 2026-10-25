import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ISLAND_V3, prepareIslandV3, fitIslandV3 } from '../src/island-v3.js';
import { ISLANDS, SCENERY, ISLE_SCALE } from '../src/islands.js';

const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load=async path=>{const b=fs.readFileSync(path);return (await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;};
const library={palm:await load('public/models/kit/palm_tree.glb'),rock:await load('public/models/kit/rock_cluster.glb')};
const radii=[ISLANDS[1].radius,ISLANDS[0].radius,ISLANDS[2].radius,...SCENERY.map(s=>s[2])],rows=[];
for(let i=0;i<ISLAND_V3.length;i++){
  const name=ISLAND_V3[i],src=await load(`public/models/islands/${name}.glb`);prepareIslandV3(src);
  const start=performance.now(),fit=fitIslandV3(src,radii[i]*1.15,null,1,ISLE_SCALE,library),geometries=new Set();
  let triangles=0,geometryBytes=0,instanceBytes=0,meshes=0;
  fit.wrap.traverse(m=>{
    if(!m.isMesh)return;meshes++;const g=m.geometry;
    triangles+=(g.index?.count??g.attributes.position.count)/3*(m.isInstancedMesh?m.count:1);
    if(!geometries.has(g)){geometries.add(g);geometryBytes+=(g.index?.array.byteLength??0)+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0);}
    if(m.isInstancedMesh)instanceBytes+=m.instanceMatrix.array.byteLength;
  });
  rows.push({name,diameter:radii[i]*2.3,meshes,triangles,geometryBytes,instanceBytes,foundation:fit.terrain.foundation,
    extraProps:fit.terrain.scatter.props.reduce((o,p)=>(o[p.kind]=(o[p.kind]||0)+1,o),{}),extraTriangles:fit.terrain.scatter.triangles,fitMs:performance.now()-start});
}
const textures=[];
for(const name of ['dune_sand','swamp_moss','ruin_stone'])for(const kind of ['basecolor','normal']){
  const file=`public/textures/materials/${name}_${kind}.png`,b=fs.readFileSync(file);
  textures.push({file,bytes:b.length,width:b.readUInt32BE(16),height:b.readUInt32BE(20)});
}
console.log(JSON.stringify({note:'One Node run; geometry and instance buffers only, not process/GPU memory or FPS. Uses already present kit props.',rows,textures},null,2));
