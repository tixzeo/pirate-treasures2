import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Vessel} from '../src/ship.js';
import {PLAYER_SHIP} from '../src/ship-config.js';
import {advanceSails,HULL_PHYSICS} from '../src/ship-physics.js';
import {WIND} from '../src/wind.js';
import {SimulationClock} from '../src/simulation-clock.js';
const brig=()=>{const mesh=new THREE.Group();mesh.userData={length:32,width:6.5,sails:[]};return new Vessel(mesh,PLAYER_SHIP.handling);};
const knots=ms=>ms*1.94;

test('captain 28.10.2026: about 20 knots at most, whatever the wind (a little more running down a sea)',()=>{
 let best=0;
 for(const speed of [WIND.calm,12,WIND.storm*1.3])for(let h=0;h<Math.PI*2;h+=.2){
  const s=brig();s.wind={toward:0,speed};s.heading=h;s.throttle=1;for(let i=0;i<60*60;i++)s.update(1/60,i/60);best=Math.max(best,knots(s.speed));
 }
 assert.ok(best<=20.3&&best>19,`${best.toFixed(2)} knots`);
});
test('she gathers way slowly: sails take ten seconds to set, full speed takes most of twenty',()=>{
 const s=brig();s.throttle=1;let t90=null,t50=null;
 for(let i=1;i<=60*60;i++){s.update(1/60,i/60);const f=s.speed/s.maxSpeed;if(t50===null&&f>=.5)t50=i/60;if(t90===null&&f>=.9)t90=i/60;}
 assert.ok(t50>6&&t90>12&&t90<25,`half way ${t50}s, 90% ${t90}s`);
 let sail=0;for(let i=0;i<600;i++)sail=advanceSails(sail,1,1/60);assert.ok(Math.abs(sail-HULL_PHYSICS.sailUp*10)<1e-9);
 assert.equal(advanceSails(.5,0,1),.5-HULL_PHYSICS.sailDown);assert.equal(advanceSails(NaN,1,1),0);assert.equal(advanceSails(.3,1,-1),.3);
});
test('a slow, heavy turn: the wheel takes time, the rate builds, a full circle takes the better part of half a minute',()=>{
 const s=brig();s.throttle=1;for(let i=0;i<60*40;i++)s.update(1/60,i/60);
 s.rudder=1;let quarter=null,turned=0,last=s.heading,maxRate=0;
 for(let i=1;i<=60*60;i++){s.update(1/60,40+i/60);turned+=s.heading-last;last=s.heading;maxRate=Math.max(maxRate,s.yaw);if(i===60)quarter=s.yaw;if(turned>=Math.PI*2)break;}
 assert.ok(maxRate<=PLAYER_SHIP.handling.turnRate+1e-9&&quarter<maxRate*.6,`after 1 s ${quarter}, top ${maxRate}`);
 const c=new SimulationClock();const a=brig();a.throttle=1;a.rudder=1;for(let i=0;i<60*30;i++)c.advance(1/60,dt=>a.update(dt,c.time));
 assert.ok(a.heading<Math.PI*2,'not a whole circle in 30 s from rest');
});
