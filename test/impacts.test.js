import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Vessel} from '../src/ship.js';
import {HullMotion} from '../src/hull-motion.js';
import {contactTurn,RAM,IMPACT} from '../src/ship-contact.js';
const vessel=()=>{const mesh=new THREE.Group();mesh.userData={length:32,width:6.5,sails:[]};return new Vessel(mesh);};

test('a broadside sways the hull slowly, a degree or two, and the sway dies away',()=>{
 const m=new HullMotion(),flat={heave:0,pitch:0,roll:0,heel:0};m.update(0,flat,32);
 let peak=0,peakAt=0,rate=0,last=0;
 for(let i=0;i<60*25;i++){if(i<4*7&&i%7===0)m.kick(0,IMPACT.gunRoll);m.update(1/60,flat,32);
  if(m.roll>peak){peak=m.roll;peakAt=i/60;}rate=Math.max(rate,Math.abs(m.roll-last)*60);last=m.roll;}
 const deg=peak*180/Math.PI;assert.ok(deg>.8&&deg<3,`${deg.toFixed(2)}°`);
 assert.ok(peakAt>.8,`peaks after ${peakAt}s, not at once`);assert.ok(rate*180/Math.PI<3,`at most ${(rate*180/Math.PI).toFixed(2)}°/s`);
 assert.ok(Math.abs(m.roll)<.002&&Math.abs(m.sway.rollVelocity)<.002);
 m.kick(NaN,NaN);assert.ok(Number.isFinite(m.sway.rollVelocity)&&Number.isFinite(m.sway.pitchVelocity));
 m.reset();assert.equal(m.sway.roll,0);
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
