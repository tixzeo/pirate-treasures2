import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';import {Vessel} from '../src/ship.js';
import {SINK_SECONDS,VICTORY_AT,advanceSinking,crossed} from '../src/boss-finish.js';

test('victory story starts once, about five seconds after the last hit, before the wreck is gone',()=>{
 let s=0,t=0,victory=[];const dt=1/60;
 while(s<1){const before=s;s=advanceSinking(s,dt);t+=dt;if(crossed(before,s,VICTORY_AT))victory.push(t);}
 assert.equal(victory.length,1);assert.ok(victory[0]>4.5&&victory[0]<5.5,`victory at ${victory[0]}`);
 assert.ok(Math.abs(t-SINK_SECONDS)<dt*2);assert.ok(victory[0]<t-3);
});

test('a long frame cannot skip the victory moment',()=>{
 const before=.5,after=advanceSinking(before,.25*SINK_SECONDS);assert.equal(after,.75);assert.ok(crossed(before,after,VICTORY_AT));
 assert.equal(advanceSinking(.99,5),1);assert.ok(!crossed(VICTORY_AT,.7,VICTORY_AT));
});

test('at the victory moment the schooner hull is already under the surface',()=>{
 const mesh=new THREE.Group();mesh.userData={length:15,width:4,sails:[]};const boss=new Vessel(mesh);boss.hp=0;
 boss.sinking=VICTORY_AT;boss.update(1/60,10);assert.ok(boss.pos.y< -4,`hull at ${boss.pos.y}`);
});
