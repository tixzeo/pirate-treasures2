import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planBerth} from '../src/berth-layout.js';
test('full 32m hull stays beside the visible pier, including a blocked shore',()=>{
  for(const blockedUntil of [0,25,48]){
    const plan=planBerth({length:38.4,shipLength:32,pitch:9.6,blocked:along=>along<blockedUntil});
    assert.ok(plan.along>=blockedUntil);assert.ok(plan.along>=16.5);
    assert.ok(plan.along+16.5<=plan.length);assert.equal(plan.segments*9.6,plan.length);
  }
});
test('future larger hulls extend by whole segments and no-clear-berth fails explicitly',()=>{
  const plan=planBerth({length:28.8,shipLength:46,pitch:9.6});
  assert.equal(plan.length,48);assert.ok(plan.along+23.5<=plan.length);
  assert.throws(()=>planBerth({length:38.4,shipLength:32,pitch:9.6,blocked:()=>true}),/No clear berth/);
});
