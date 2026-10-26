import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';import {Vessel} from '../src/ship.js';
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
