import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {prepareWaterModel} from '../src/water-models.js';

for(const name of ['barrel_intact','barrel_damaged'])test(`${name} shell occludes rays from outside without filling the damaged gaps`, async()=>{
  const b=await readFile(new URL(`../public/models/water/${name}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  const shell=scene.getObjectByName('Barrel_Stave_Body'),source=shell.geometry;
  const count=source.index?.count??source.attributes.position.count;
  prepareWaterModel(scene,name);scene.updateMatrixWorld(true);
  assert.notEqual(shell.geometry,source);assert.equal(shell.geometry.index.count,count);
  let hits=0;
  for(let i=0;i<48;i++){
    const a=i*Math.PI/24,from=new THREE.Vector3(Math.cos(a)*2,0,Math.sin(a)*2);
    const hit=new THREE.Raycaster(from,from.clone().negate().normalize()).intersectObject(shell)[0];
    if(hit){hits++;assert.ok(hit.distance<2,'near wall, not far inner face');}
  }
  if(name==='barrel_intact')assert.equal(hits,48);else assert.ok(hits>=40&&hits<48,`damaged shell still has a real gap: ${hits}`);
  const fixed=shell.geometry;prepareWaterModel(scene,name);assert.equal(shell.geometry,fixed,'already outward shell is not flipped a second time');
});
