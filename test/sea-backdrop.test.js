import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSeaBackdrop} from '../src/sea.js';
import {ISLANDS,SCENERY} from '../src/islands.js';
test('distant ocean supports the enlarged voyage with only two triangles below storm troughs',()=>{
  const backdrop=makeSeaBackdrop();backdrop.geometry.computeBoundingBox();
  const b=backdrop.geometry.boundingBox;
  assert.equal(backdrop.geometry.index.count/3,2);assert.ok(backdrop.position.y < -1.05*1.9);
  assert.equal(backdrop.material.fog,true);assert.equal(backdrop.frustumCulled,false);
  for(const p of [...ISLANDS,...SCENERY.map(([x,z])=>({x,z}))])assert.ok(Math.abs(p.x)<b.max.x-500&&Math.abs(p.z)<b.max.z-500);
  backdrop.geometry.dispose();backdrop.material.dispose();
});
