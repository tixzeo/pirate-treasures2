import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSurge,waterDrag} from '../src/ship-physics.js';
test('sail thrust and water drag converge to each existing sail setting',()=>{
 for(const max of [9,14])for(const throttle of [-.25,0,1/3,2/3,1]){
  let v=0;for(let i=0;i<60*90;i++)v=advanceSurge(v,throttle,max,1/60);
  assert.ok(Math.abs(v-throttle*max)<.0001,`${max},${throttle}: ${v}`);
 }
});
test('water braking dissipates energy in both directions without a reversal',()=>{
 for(const start of [-14,14]){let v=start;for(let i=0;i<3600;i++){const next=advanceSurge(v,0,14,1/60);assert.ok(Math.abs(next)<=Math.abs(v));assert.ok(next===0||Math.sign(next)===Math.sign(start));v=next;}assert.equal(v,0);}
 assert.equal(waterDrag(-10),-waterDrag(10));
});
test('reverse sails brake through zero smoothly instead of snapping the hull',()=>{
 let v=14,min=14;for(let i=0;i<1800;i++){const next=advanceSurge(v,-.25,14,1/60);assert.ok(Math.abs(next-v)<.08);min=Math.min(min,next);v=next;}
 assert.ok(v<0&&min>=-3.5);
});
test('surge is stable with small and coarse time partitions and invalid input',()=>{
 const run=hz=>{let v=0;for(let i=0;i<hz*10;i++)v=advanceSurge(v,1,14,1/hz);return v;};
 assert.ok(Math.abs(run(5)-run(120))<1e-8);
 assert.equal(advanceSurge(3,1,14,NaN),3);assert.equal(advanceSurge(NaN,1,14,.1),0);
});
