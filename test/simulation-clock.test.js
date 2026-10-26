import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationClock,SIMULATION} from '../src/simulation-clock.js';
test('5, 30, 60 and 144 FPS advance identical game time in bounded steps',()=>{
 for(const fps of [5,30,60,144]){const clock=new SimulationClock();let steps=0;for(let i=0;i<fps*10;i++)clock.advance(1/fps,dt=>{assert.equal(dt,1/60);steps++});assert.equal(steps,600);assert.ok(Math.abs(clock.time-10)<1e-10);}
});
test('catch-up, debug speed and resumed tabs have a finite work budget',()=>{
 const clock=new SimulationClock(),tick=()=>{};
 assert.equal(clock.advance(.2,tick),12);assert.equal(clock.advance(.9,tick),15);
 assert.equal(clock.advance(.25,tick,3),45);assert.equal(clock.advance(300,tick),0);
 assert.equal(clock.advance(SIMULATION.step,tick),1);
 for(const dt of [NaN,Infinity,-1])assert.equal(clock.advance(dt,tick),0);
});
test('remainder carries small frames and reset discards stale elapsed time',()=>{
 const clock=new SimulationClock();assert.equal(clock.advance(1/120,()=>{}),0);assert.equal(clock.advance(1/120,()=>{}),1);
 clock.advance(1/120,()=>{});clock.reset();assert.equal(clock.time,0);assert.equal(clock.advance(1/120,()=>{}),0);
});
