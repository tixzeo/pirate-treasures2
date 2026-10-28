import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WIND,Wind,windAt,offWind,sailDrive,windSpeedFactor,windHeel,pointOfSail,tackFor} from '../src/wind.js';
import {advanceHeel} from '../src/ship-physics.js';
import {Vessel} from '../src/ship.js';
import {SimulationClock} from '../src/simulation-clock.js';
import {ISLANDS,BOSS_HOME} from '../src/islands.js';
const D=Math.PI/180,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const vessel=()=>{const mesh=new THREE.Group();mesh.userData={length:32,width:6.5,sails:[]};return new Vessel(mesh);};

test('the polar: no-go floor upwind, fastest on a broad reach, tuned speed running, never a jump',()=>{
 assert.equal(sailDrive(0),WIND.noGo);assert.equal(sailDrive(40*D),WIND.noGo);
 assert.equal(sailDrive(Math.PI),1);assert.ok(sailDrive(130*D)>sailDrive(90*D)&&sailDrive(90*D)>sailDrive(62*D));
 assert.equal(sailDrive(-90*D),sailDrive(90*D));assert.equal(sailDrive(NaN),WIND.noGo);
 let last=sailDrive(0);for(let d=.5;d<=180;d+=.5){const v=sailDrive(d*D);assert.ok(Math.abs(v-last)<.02,`${d}°`);last=v;}
});
test('off-wind angle and the names sailors use',()=>{
 assert.ok(Math.abs(offWind(1,1)-Math.PI)<1e-12);assert.ok(Math.abs(offWind(1+Math.PI,1))<1e-12);
 assert.ok(Math.abs(offWind(.3,.3+Math.PI/2)-Math.PI/2)<1e-12);
 assert.deepEqual([20,70,95,140,175].map(d=>pointOfSail(d*D)),['Левентик','Бейдевинд','Галфвинд','Бакштаг','Фордевинд']);
});
test('wind is deterministic, gusts within limits, storm stronger and veering bounded',()=>{
 assert.deepEqual(windAt(123.4,.3,1),windAt(123.4,.3,1));
 for(let t=0;t<900;t+=.7){
  const calm=windAt(t,0,WIND.base),storm=windAt(t,1,WIND.base);
  assert.ok(calm.speed>=WIND.calm*(1-WIND.gust)-1e-9&&calm.speed<=WIND.calm*(1+WIND.gust)+1e-9);
  assert.ok(storm.speed>calm.speed*2);
  assert.ok(Math.abs(wrap(calm.toward-WIND.base))<=WIND.veer+1e-9);
 }
 const w=new Wind();w.update(5,0);assert.deepEqual({toward:w.toward,speed:w.speed},windAt(5,0,WIND.base));
 w.update(NaN,NaN);assert.equal(w.time,5);assert.ok(Number.isFinite(w.speed));
});
test('wind speed factor stays inside the hull limits',()=>{
 assert.equal(windSpeedFactor(WIND.calm),1);assert.equal(windSpeedFactor(0),.6);assert.equal(windSpeedFactor(100),1.25);
});
test('wind heel leans away from the wind, none running or with sails furled',()=>{
 const wind={toward:Math.PI/2,speed:WIND.storm};          // blows towards port of a ship heading 0
 assert.ok(windHeel(0,wind,1)>0);assert.ok(windHeel(Math.PI,wind,1)<0);
 assert.ok(Math.abs(windHeel(Math.PI/2,wind,1))<1e-12);assert.equal(windHeel(0,wind,0),0);
 assert.ok(windHeel(0,{...wind,speed:WIND.calm},1)<windHeel(0,wind,1));
 let heel=0;for(let i=0;i<600;i++)heel=advanceHeel(heel,0,0,1/60,windHeel(0,wind,1));
 assert.ok(Math.abs(heel-.1)<1e-6,'clamped to the hull limit');
});
test('the captain tacks: never inside 60° of the wind, the nearer tack, free courses unchanged',()=>{
 const toward=.4,from=toward+Math.PI;
 for(let g=-Math.PI;g<Math.PI;g+=.05){
  const h=tackFor(g,toward);assert.ok(offWind(h,toward)>=WIND.tack-1e-9);
  if(offWind(g,toward)>=WIND.tack)assert.equal(h,g);
  else assert.ok(Math.abs(wrap(h-g))<=WIND.tack+1e-9);
 }
 assert.ok(wrap(tackFor(from+.1,toward)-from)>0&&wrap(tackFor(from-.1,toward)-from)<0);
});
test('the prevailing wind lets every leg of the voyage out be sailed off the wind',()=>{
 const stops=[{x:0,z:0},...ISLANDS,BOSS_HOME];
 for(let i=1;i<stops.length;i++){
  const h=Math.atan2(-(stops[i].x-stops[i-1].x),-(stops[i].z-stops[i-1].z));
  for(let t=0;t<600;t+=5)assert.ok(sailDrive(offWind(h,windAt(t,0,WIND.base).toward))>=.85,`leg ${i}`);
 }
});
test('a ship in the wind: slower close-hauled than reaching, heels to leeward, steady across frame rates',()=>{
 const run=(heading,fps=60)=>{const ship=vessel(),clock=new SimulationClock();ship.heading=heading;ship.wind={toward:0,speed:WIND.calm};ship.throttle=1;
  for(let i=0;i<fps*40;i++)clock.advance(1/fps,dt=>ship.update(dt,clock.time));return ship;};
 const close=run(Math.PI+20*D),reach=run(50*D),run180=run(0);
 assert.ok(close.speed<14*.4,`${close.speed}`);assert.ok(reach.speed>run180.speed&&run180.speed>13.5);
 const beam=run(-Math.PI/2);assert.ok(beam.heel>.02,'wind from starboard leans her to port');
 const a=run(.7,30),b=run(.7,144);assert.ok(a.pos.distanceTo(b.pos)<1e-8);
 const none=vessel();none.throttle=1;for(let i=0;i<2400;i++)none.update(1/60,i/60);assert.ok(Math.abs(none.speed-14)<.05,'no wind: unchanged');
});
