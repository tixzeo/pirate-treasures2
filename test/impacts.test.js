import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Vessel} from '../src/ship.js';
import {HullMotion} from '../src/hull-motion.js';
import {contactTurn,RAM,IMPACT} from '../src/ship-contact.js';
const vessel=()=>{const mesh=new THREE.Group();mesh.userData={length:32,width:6.5,sails:[]};return new Vessel(mesh);};

test('a kick sets the hull rocking and the damping takes it out again',()=>{
 const m=new HullMotion(),flat={heave:0,pitch:0,roll:0,heel:0};m.update(0,flat,32);
 m.kick(0,6*IMPACT.gunRoll);let peak=0;for(let i=0;i<600;i++){m.update(1/60,flat,32);peak=Math.max(peak,m.roll);}
 assert.ok(peak>.02,`a broadside rolls her about ${(peak*57.3).toFixed(1)}°`);assert.ok(Math.abs(m.roll)<1e-3&&Math.abs(m.rollVelocity)<1e-3);
 m.kick(NaN,NaN);assert.ok(Number.isFinite(m.rollVelocity)&&Number.isFinite(m.pitchVelocity));
});
test('running into the shore at an angle turns her along it; square on or alongside does not',()=>{
 const glance=vessel();glance.speed=10;glance.resolveContact({x:.5,z:.5},.5);assert.ok(glance.yaw<-.05,'pushed to starboard at the bow: bow swings right');
 const square=vessel();square.speed=10;square.resolveContact({x:0,z:1},.5);assert.equal(square.yaw,0);
 const along=vessel();along.drift=-3;along.resolveContact({x:1,z:0},.5);assert.ok(Math.abs(along.yaw)<1e-12);
 const astern=vessel();astern.speed=-4;astern.resolveContact({x:.5,z:-.5},.5);assert.ok(astern.yaw>0,'the stern leads going astern');
 const left=vessel();left.speed=10;left.resolveContact({x:-.5,z:.5},.5);assert.ok(left.yaw>.05);
});
test('the turn from one blow is bounded and needs a blow',()=>{
 const b={heading:0,length:32,yaw:0};assert.equal(contactTurn(b,{x:1,z:1},1000,0),-RAM.maxYaw);
 assert.equal(contactTurn(b,{x:1,z:1},0,0),0);assert.equal(contactTurn(b,{x:0,z:0},5,0),0);
});
test('a ship sliding along a straight coast ends up running parallel to it',()=>{
 const s=vessel();s.heading=-.6;s.throttle=1;s.speed=12;                     // bow 34° towards a wall at x = 30
 for(let i=0;i<900;i++){s.update(1/60,i/60);const over=s.pos.x+Math.abs(Math.sin(s.heading))*16+3.25-30;if(over>0)s.resolveContact({x:-over,z:0},.5);}
 assert.ok(Math.abs(Math.sin(s.heading))<.2,`heading ${s.heading}`);
});
