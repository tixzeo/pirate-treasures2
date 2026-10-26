import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';import {Vessel} from '../src/ship.js';
import {SimulationClock} from '../src/simulation-clock.js';
export function vessel(length=32,width=6.5){const mesh=new THREE.Group();mesh.userData={length,width,sails:[]};return new Vessel(mesh);}
test('reset clears stored angular energy, controls and forward speed at a new location',()=>{
 const ship=vessel();ship.throttle=1;ship.rudder=1;for(let i=0;i<120;i++)ship.update(1/60,i/60);
 ship.pos.set(1000,0,-2000);ship.heading=2;ship.resetDynamics();
 for(const key of ['speed','yaw','helm','heel','rudder','throttle'])assert.equal(ship[key],0);
 assert.equal(ship.motion.ready,false);assert.equal(ship.motion.rollVelocity,0);
 ship.update(0,20);assert.ok(ship.mesh.rotation.toArray().slice(0,3).every(Number.isFinite));
 assert.equal(ship.pos.x,1000);assert.equal(ship.pos.z,-2000);
});
test('contact dissipates normal approach energy and preserves a glancing escape',()=>{
 const head=vessel();head.speed=14;head.yaw=.5;assert.equal(head.resolveContact({x:0,z:2},.5),14);assert.equal(head.speed,7);assert.equal(head.yaw,.25);assert.equal(head.pos.z,2);
 const glance=vessel();glance.speed=14;const impact=glance.resolveContact({x:1,z:.1},.5);assert.ok(impact<2);assert.ok(glance.speed>13.8);
 const away=vessel();away.speed=-4;away.yaw=.2;assert.equal(away.resolveContact({x:0,z:1},.5),0);assert.equal(away.speed,-4);assert.equal(away.yaw,.2);
 assert.equal(away.resolveContact({x:NaN,z:0}),0);assert.equal(away.resolveContact({x:0,z:0}),0);
});
test('dead or flooding ships cannot generate sail thrust and retain staged sinking',()=>{
 for(const state of [{hp:0,sinking:0},{hp:100,sinking:.5}]){
  const ship=vessel();Object.assign(ship,state,{throttle:1,rudder:1});ship.update(1/60,0);assert.equal(ship.speed,0);assert.equal(ship.yaw,0);
  ship.speed=10;for(let i=0;i<300;i++)ship.update(1/60,i/60);assert.ok(ship.speed<.1);
  ship.sinking=1;ship.update(1/60,5);assert.ok(ship.pos.y< -20);assert.ok(ship.mesh.rotation.x>.8);
 }
});
test('real vessel path, heading and wave pose agree across 5..144 render FPS',()=>{
 const run=fps=>{const ship=vessel(),clock=new SimulationClock();for(let i=0;i<fps*20;i++)clock.advance(1/fps,(dt,t)=>{
  ship.throttle=t<12?1:0;ship.rudder=t>4&&t<10?.6:0;ship.update(dt,t);
 });return {position:ship.pos.toArray(),heading:ship.heading,speed:ship.speed,roll:ship.mesh.rotation.z,pitch:ship.mesh.rotation.x};};
 const expected=run(60);for(const fps of [5,30,144]){const actual=run(fps);actual.position.forEach((v,i)=>assert.ok(Math.abs(v-expected.position[i])<1e-8));for(const k of ['heading','speed','roll','pitch'])assert.ok(Math.abs(actual[k]-expected[k])<1e-8);}
});
