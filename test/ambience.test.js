import test from 'node:test';import assert from 'node:assert/strict';
import {LOOPS,SILENT,loopLevels,shoreNear,SURF_FAR,SURF_NEAR,creakRate,gullRate,GULL_RANGE,chance,shotFiles} from '../src/ambience-mix.js';

const sea=o=>loopLevels({scene:'sea',...o});
test('every loop gets a level between 0 and 1 in every scene',()=>{
 for(const scene of ['sea','island','intro'])for(const speed of [-.3,0,.5,1,2])for(const storm of [0,.5,1])for(const shore of [0,50,1e9]){
  const l=loopLevels({scene,speed,sails:1,storm,shore});assert.deepEqual(Object.keys(l).sort(),[...LOOPS].sort());
  for(const [k,v] of Object.entries(l))assert.ok(v>=0&&v<=1,`${scene} ${k}=${v}`);
 }
 assert.deepEqual(loopLevels({scene:'intro',speed:1,storm:1}),SILENT);
});
test('the bow wave grows with speed and is silent at rest in calm weather',()=>{
 assert.equal(sea({speed:0}).bow,0);assert.ok(sea({speed:.3}).bow<sea({speed:.7}).bow);assert.ok(sea({speed:1}).bow>.9);
 assert.equal(sea({speed:-.5}).bow,sea({speed:.5}).bow,'going astern still pushes water');
});
test('the surf is heard only near a shore',()=>{
 assert.equal(shoreNear(SURF_FAR),0);assert.equal(shoreNear(SURF_NEAR),1);assert.equal(sea({shore:Infinity}).surf,0);
 assert.ok(sea({shore:30}).surf>sea({shore:90}).surf);
});
test('rigging rattles in a light air and whistles as the wind freshens',()=>{
 const calm=sea({speed:0}),fast=sea({speed:1,storm:.6});
 assert.ok(calm.rigging>calm['rigging-strong']);assert.ok(fast['rigging-strong']>fast.rigging);
 assert.equal(sea({sails:0}).sails,0);assert.ok(sea({sails:1,speed:1}).sails>sea({sails:1/3,speed:1}).sails);
});
test('storm layer follows the storm',()=>{assert.equal(sea({storm:0}).storm,0);assert.equal(sea({storm:1}).storm,1);});
test('the hull creaks more when worked',()=>{
 const still=creakRate({}),rolling=creakRate({rollRate:.2}),turning=creakRate({helmRate:1,speed:1});
 assert.ok(still.perSecond>0&&still.perSecond<.1);assert.ok(rolling.perSecond>still.perSecond*5);assert.ok(turning.perSecond>still.perSecond);
 assert.ok(rolling.volume>still.volume&&rolling.volume<=1);
 assert.equal(creakRate({helmRate:1,speed:0}).perSecond,still.perSecond,'a rudder at rest does not strain the hull');
});
test('gulls call by day near the camera, never at night, in a storm or far away',()=>{
 assert.ok(gullRate({distance:20})>0);assert.equal(gullRate({night:1,distance:20}),0);assert.equal(gullRate({storm:1,distance:20}),0);
 assert.equal(gullRate({distance:GULL_RANGE+1}),0);assert.equal(gullRate({}),0);
});
test('chance per frame matches the rate and never breaks on a bad frame',()=>{
 assert.ok(Math.abs(chance(1,1/60)-1/60)<1e-3);assert.equal(chance(1,-1),0);assert.equal(chance(-1,1),0);assert.ok(chance(1e9,1)<=1);
});
test('one-shot recordings are numbered from 1',()=>assert.deepEqual(shotFiles('gull'),['gull-1','gull-2','gull-3','gull-4']));
