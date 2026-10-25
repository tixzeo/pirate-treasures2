import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSeaBackdrop,addSky} from '../src/sea.js';
import * as THREE from 'three';
import {ISLANDS,SCENERY} from '../src/islands.js';
test('distant ocean supports the enlarged voyage with only two triangles below storm troughs',()=>{
  const backdrop=makeSeaBackdrop();backdrop.geometry.computeBoundingBox();
  const b=backdrop.geometry.boundingBox;
  assert.equal(backdrop.geometry.index.count/3,2);assert.ok(backdrop.position.y < -1.05*1.9);
  assert.equal(backdrop.material.fog,false);assert.equal(backdrop.frustumCulled,false);
  for(const p of [...ISLANDS,...SCENERY.map(([x,z])=>({x,z}))])assert.ok(Math.abs(p.x)<b.max.x-500&&Math.abs(p.z)<b.max.z-500);
  backdrop.geometry.dispose();backdrop.material.dispose();
});
test('clear atmosphere leaves the full enlarged island readable from the approach',()=>{
  const scene=new THREE.Scene();addSky(scene,{});
  const diameter=Math.max(...ISLANDS.map(d=>d.radius*2.3));
  assert.ok(scene.fog.far>diameter+400);
  assert.ok(scene.fog.near>=100&&scene.fog.near<scene.fog.far);
});
