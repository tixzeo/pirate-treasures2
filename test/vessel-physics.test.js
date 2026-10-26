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
