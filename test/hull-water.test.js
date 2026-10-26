import test from 'node:test';import assert from 'node:assert/strict';
import {hullProbes,sampleHullWater} from '../src/hull-water.js';
test('distributed hull support is cached, symmetric and area-weighted with 15 samples',()=>{
 const p=hullProbes(32,6.5);assert.equal(p,hullProbes(32,6.5));assert.equal(p.length,15);
 for(const axis of ['along','across'])assert.ok(Math.abs(p.reduce((v,a)=>v+a[axis]*a.weight,0))<1e-10);
 const centre=p.filter(p=>p.along===0).reduce((s,p)=>s+p.weight,0),tip=p.filter(p=>p.along===12.8).reduce((s,p)=>s+p.weight,0);assert.ok(centre>tip);
 assert.throws(()=>hullProbes(0,6));assert.throws(()=>hullProbes(32,NaN));
});
test('draft is an explicit hull parameter while support rejects a short wave at the bow',()=>{
 const dims={x:0,z:0,heading:0,length:32,width:6.5};
 assert.equal(sampleHullWater(()=>1,{...dims,draft:.5},0).heave,.5);
 const flat=sampleHullWater(()=>0,dims,0),spike=sampleHullWater((x,z)=>z< -12?1:0,dims,0);
 assert.ok(spike.heave-flat.heave<.15);
});
