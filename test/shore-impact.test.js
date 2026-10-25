import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shoreDamage, ShoreImpact, SHORE_IMPACT } from '../src/shore-impact.js';

test('shore damage has a speed threshold, reverse symmetry and a bounded severity',()=>{
  for(const speed of [0,.5,2,NaN,Infinity])assert.equal(shoreDamage(speed),0);
  assert.equal(shoreDamage(2.1),4);assert.equal(shoreDamage(6),12);assert.equal(shoreDamage(-6),12);
  assert.equal(shoreDamage(100),SHORE_IMPACT.maxDamage);
});

test('sustained coast contact is charged once per cooldown, not once per frame',()=>{
  const hit=new ShoreImpact();assert.equal(hit.sample(1,0),null);
  assert.equal(hit.sample(6,.1).damage,12);
  for(let i=1;i<60;i++)assert.equal(hit.sample(14,.1+i/60),null);
  assert.equal(hit.sample(14,.1+SHORE_IMPACT.cooldown+.001).damage,25);
});

test('immortality preserves hit feedback and repair/reset clears the old cooldown',()=>{
  const hit=new ShoreImpact();assert.equal(hit.sample(8,10,true).damage,0);
  assert.equal(hit.sample(8,10.1),null);hit.reset();assert.equal(hit.sample(8,10.1).damage,16);
  assert.equal(hit.sample(8,NaN),null);
});
