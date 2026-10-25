import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ISLAND_V3,prepareIslandV3,fitIslandV3} from '../src/island-v3.js';
import {ISLANDS,SCENERY,BOSS_HOME,ISLE_SCALE} from '../src/islands.js';
import {coastAtlas} from '../src/island-shape.js';
const radii=[ISLANDS[1].radius,ISLANDS[0].radius,ISLANDS[2].radius,...SCENERY.map(s=>s[2])];
const rows=[],shapes=[];let assetBytes=0;
for(let i=0;i<ISLAND_V3.length;i++){
 const name=ISLAND_V3[i],b=fs.readFileSync('public/models/islands/'+name+'.glb');assetBytes+=b.length;
 const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');prepareIslandV3(scene);
 const start=performance.now(),fit=fitIslandV3(scene,radii[i]*1.15,null,1,ISLE_SCALE);let triangles=0,geometryBytes=0,meshes=0;
 fit.wrap.traverse(m=>{if(!m.isMesh)return;meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;
 geometryBytes+=(m.geometry.index?.array.byteLength??0)+Object.values(m.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0)});
 rows.push({name,diameter:radii[i]*2.3,scale:fit.scale,vertical:fit.vertical,propScale:fit.propScale,meshes,triangles,geometryBytes,fieldBytes:fit.terrain.field.byteLength,oceanFieldBytes:fit.terrain.oceanField?.byteLength??0,closedCells:fit.terrain.closedWater?.reduce((a,v)=>a+v,0),pondCells:fit.terrain.ponds?.reduce((a,p)=>a+p.cellCount,0),cell:fit.terrain.cell,fitMs:performance.now()-start});shapes.push(fit.terrain);
}
const atlas=coastAtlas(shapes,8);const points=[{x:0,z:0},...ISLANDS,BOSS_HOME];
const legs=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
const result={assetBytes,rows,atlasBytes:atlas.data.byteLength,legsMetres:legs,legsSecondsAt14:legs.map(n=>n/14)};
console.log(JSON.stringify(result,null,2));
