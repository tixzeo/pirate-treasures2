import test from 'node:test';
import assert from 'node:assert/strict';
import { WakeTrail, WAKE } from '../src/wake.js';
const ship = (extra={}) => ({ x:0,z:0,heading:0,speed:12,length:32,width:6,active:true,...extra });
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);

test('wake stays in world space after the vessel turns',()=>{
 const wake=new WakeTrail();wake.update(0,[ship()]);const first={...wake.points[0]};
 wake.update(.5,[ship({x:-1,z:-6,heading:.4})]);
 near(wake.points[0].x,first.x);near(wake.points[0].z,first.z);near(wake.points[0].fx,first.fx);
 assert.ok(wake.points.at(-1).fx<0);
});
test('wake uses the trailing end in forward and reverse travel',()=>{
 const ahead=new WakeTrail(),astern=new WakeTrail();ahead.update(0,[ship()]);astern.update(0,[ship({speed:-5})]);
 assert.ok(ahead.points[0].z>0);assert.ok(astern.points[0].z<0);
 assert.equal(ahead.points[0].fz,-1);assert.equal(astern.points[0].fz,1);
});
test('5 FPS and 60 FPS emit the same patch positions, ages and spacing',()=>{
 function run(fps){const wake=new WakeTrail();wake.update(0,[ship()]);for(let i=1;i<=fps*4;i++)wake.update(1/fps,[ship({z:-12*i/fps})]);return wake.points;}
 const slow=run(5),fast=run(60);assert.equal(slow.length,fast.length);
 slow.forEach((p,i)=>{near(p.z,fast[i].z);near(p.age,fast[i].age);near(p.strength,fast[i].strength);});
});
test('stopping and removing ships let old foam expire without creating more',()=>{
 const wake=new WakeTrail();wake.update(0,[ship()]);wake.update(1,[ship({speed:0})]);assert.equal(wake.points.length,1);
 wake.update(WAKE.lifetime,[]);assert.equal(wake.points.length,0);assert.equal(wake.tracks.size,0);
});
test('two active ships retain six seconds of history within the uniform budget',()=>{
 const wake=new WakeTrail();
 for(let i=0;i<900;i++)wake.update(1/60,[ship({id:'player',z:-i*.2}),ship({id:'boss',x:90,z:-i*.15,speed:9,length:15,width:4})]);
 assert.ok(wake.points.length<=WAKE.capacity);
 for(const id of ['player','boss']){const points=wake.points.filter(p=>p.key===id);assert.ok(points.length>=13);assert.ok(points[0].age>.85);}
});
test('teleport and resumed tabs do not draw connecting streaks',()=>{
 const wake=new WakeTrail();wake.update(0,[ship()]);wake.update(.5,[ship({x:500,z:900})]);
 assert.equal(wake.points.length,2);assert.equal(wake.points.at(-1).x,500);
 wake.update(300,[ship({x:800,z:900})]);assert.equal(wake.points.length,1);assert.equal(wake.points[0].age,0);
});
test('sinking, detached, slow and malformed sources do not emit',()=>{
 const wake=new WakeTrail();for(const data of [{active:false},{speed:1},{speed:0},{x:NaN},{length:0},{width:0}])wake.update(.5,[ship(data)]);
 assert.equal(wake.points.length,0);assert.equal(wake.tracks.size,0);
});
test('invalid dt and clearing cannot leave invalid shader values',()=>{
 const wake=new WakeTrail();wake.update(0,[ship()]);wake.update(NaN,[ship()]);wake.update(-1,[ship()]);
 assert.equal(wake.points.length,1);near(wake.time,0);wake.clear();assert.equal(wake.points.length,0);assert.equal(wake.tracks.size,0);
});
