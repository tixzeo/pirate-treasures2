import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Vessel} from '../src/ship.js';
import {slopeSurge,HULL_PHYSICS} from '../src/ship-physics.js';
const vessel=()=>{const mesh=new THREE.Group();mesh.userData={length:32,width:6.5,sails:[]};return new Vessel(mesh);};

test('slope surge: faster down a wave, slower up it, either way of going, nothing at rest',()=>{
 assert.ok(slopeSurge(10,-.05,1)>10);assert.ok(slopeSurge(10,.05,1)<10);
 assert.ok(slopeSurge(-4,.05,1)< -4,'going astern, bow up: she runs back faster');
 assert.equal(slopeSurge(0,.1,1),0);assert.ok(Math.abs(slopeSurge(1.5,.1,1)-1.5)<9.81*Math.sin(.1)*HULL_PHYSICS.slope*.5+1e-9);
 assert.equal(slopeSurge(NaN,.1,1),0);assert.equal(slopeSurge(3,NaN,1),3);assert.equal(slopeSurge(3,.1,-1),3);
});
test('a ship on a sloping sea gathers way running downhill and loses it climbing',()=>{
 const run=grade=>{const s=vessel();s.waterHeight=(x,z)=>grade*z;s.throttle=1;for(let i=0;i<1800;i++)s.update(1/60,i/60);return s.speed;};
 const flat=run(0),climb=run(-.03),descend=run(.03);     // bow to -Z: grade>0 means the water falls ahead
 assert.ok(climb<flat&&descend>flat,`${climb} ${flat} ${descend}`);
 assert.ok(descend-flat>.3&&flat-climb>.3);
});
test('a ship stopped on a slope stays stopped',()=>{
 const s=vessel();s.waterHeight=(x,z)=>.05*z;for(let i=0;i<600;i++)s.update(1/60,i/60);
 assert.equal(s.speed,0);assert.equal(s.pos.z,0);
});
