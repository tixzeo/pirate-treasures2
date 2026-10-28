import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Vessel} from '../src/ship.js';
import {advanceDrift,HULL_PHYSICS} from '../src/ship-physics.js';
import {leeway,WIND} from '../src/wind.js';
import {SimulationClock} from '../src/simulation-clock.js';
const vessel=()=>{const mesh=new THREE.Group();mesh.userData={length:32,width:6.5,sails:[]};return new Vessel(mesh);};

test('drift relaxes to the slip target exactly, whatever the step, and survives bad input',()=>{
 const a=advanceDrift(0,10,.3,.4,32,1),b=(()=>{let d=0;for(let i=0;i<120;i++)d=advanceDrift(d,10,.3,.4,32,1/120);return d;})();
 assert.ok(Math.abs(a-b)<1e-12);
 let d=2;for(let i=0;i<600;i++)d=advanceDrift(d,0,0,0,32,1/60);assert.ok(Math.abs(d)<1e-3,'the keel takes the slip out');
 assert.equal(advanceDrift(NaN,1,1,0,32,.1),0);assert.equal(advanceDrift(1,1,1,0,32,-1),1);
 assert.ok(Math.abs(advanceDrift(0,10,.5,NaN,32,100)-10*.5*HULL_PHYSICS.skid)<1e-9);
});
test('leeway: to leeward, none head to wind or running, none with sails furled',()=>{
 const wind={toward:Math.PI/2,speed:WIND.calm};                 // blowing towards port of heading 0
 assert.ok(leeway(0,wind,1)<0);assert.ok(Math.abs(leeway(Math.PI/2,wind,1))<1e-12);assert.equal(leeway(0,wind,0),-0);
 assert.ok(Math.abs(leeway(0,wind,1)+WIND.calm*WIND.leeway)<1e-12);
});
test('a turning ship skids outward, a reaching ship crabs to leeward, a stopped one stays put',()=>{
 const turn=vessel();turn.throttle=1;for(let i=0;i<900;i++)turn.update(1/60,i/60);
 turn.rudder=1;for(let i=0;i<240;i++)turn.update(1/60,15+i/60);
 assert.ok(turn.yaw>0&&turn.drift>.3,'port turn, slip to starboard');
 const v=turn.velocity();assert.ok(Math.abs(v.length()-Math.hypot(turn.speed,turn.drift))<1e-9);
 const reach=vessel();reach.wind={toward:Math.PI/2,speed:WIND.calm};reach.heading=0;reach.throttle=1;
 const start=reach.pos.clone();for(let i=0;i<1200;i++)reach.update(1/60,i/60);
 const side=reach.pos.clone().sub(start).dot(new THREE.Vector3(-1,0,0));assert.ok(side>4,`made ${side} m to leeward`);
 const still=vessel();still.wind={toward:Math.PI/2,speed:WIND.storm};for(let i=0;i<600;i++)still.update(1/60,i/60);
 assert.equal(still.pos.x,0);assert.equal(still.pos.z,0);
});
test('contact also stops the sideways slip into an obstacle and keeps a slip away from it',()=>{
 const s=vessel();s.drift=2;assert.equal(s.resolveContact({x:-1,z:0},.5),2);assert.equal(s.drift,1);
 const away=vessel();away.drift=-2;assert.equal(away.resolveContact({x:-1,z:0},.5),0);assert.equal(away.drift,-2);
});
test('drifting paths agree across frame rates',()=>{
 const run=fps=>{const s=vessel(),c=new SimulationClock();s.wind={toward:1,speed:12};
  for(let i=0;i<fps*15;i++)c.advance(1/fps,dt=>{s.throttle=1;s.rudder=c.time>5?.7:0;s.update(dt,c.time);});return s;};
 const a=run(30),b=run(144);assert.ok(a.pos.distanceTo(b.pos)<1e-8&&Math.abs(a.drift-b.drift)<1e-10);
});
