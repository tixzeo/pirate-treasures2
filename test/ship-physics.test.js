import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSurge,waterDrag,advanceSteering,advanceHeel} from '../src/ship-physics.js';
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
test('rudder needs flow, reverses astern and cannot pivot a long hull inside itself',()=>{
 const atRest=advanceSteering({helm:0,yaw:0},1,0,14,.9,32,1);assert.equal(atRest.yaw,0);
 for(const length of [15,32,46])for(const sign of [-1,1]){
  let state={helm:0,yaw:0};for(let i=0;i<600;i++)state=advanceSteering(state,1,sign*14,14,.9,length,1/60);
  assert.equal(Math.sign(state.yaw),sign);assert.ok(Math.abs(14/state.yaw)>=length*.85);
 }
});
test('angular inertia is time-partition independent with a settled wheel',()=>{
 const run=hz=>{let s={helm:1,yaw:0},angle=0;for(let i=0;i<hz*2;i++){s=advanceSteering(s,1,14,14,.9,32,1/hz);angle+=s.angle;}return {...s,angle};};
 const a=run(5),b=run(120);assert.ok(Math.abs(a.yaw-b.yaw)<1e-10);assert.ok(Math.abs(a.angle-b.angle)<1e-10);
 const small=advanceSteering({helm:1,yaw:0},1,14,14,.9,15,.1),large=advanceSteering({helm:1,yaw:0},1,14,14,.9,46,.1);assert.ok(small.yaw>large.yaw);
});
test('turning heel depends on acceleration, settles at rest and is symmetric astern',()=>{
 assert.equal(advanceHeel(0,0,1,1),0);
 assert.ok(Math.abs(advanceHeel(0,14,.5,1))>Math.abs(advanceHeel(0,2,.5,1)));
 assert.equal(advanceHeel(0,14,.5,1),advanceHeel(0,-14,-.5,1));
 const run=hz=>{let h=0;for(let i=0;i<hz;i++)h=advanceHeel(h,14,.5,1/hz);return h};assert.ok(Math.abs(run(5)-run(120))<1e-10);
 let heel=.1;for(let i=0;i<600;i++)heel=advanceHeel(heel,0,0,1/60);assert.ok(Math.abs(heel)<1e-6);
});
