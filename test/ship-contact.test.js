import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Vessel} from '../src/ship.js';
import {hullContact,collideHulls,applyImpulse,ramDamage,hullMass,RAM} from '../src/ship-contact.js';
const vessel=(length=32,width=6.5)=>{const mesh=new THREE.Group();mesh.userData={length,width,sails:[]};return new Vessel(mesh);};
const body=(x,z,heading,o={})=>({pos:{x,z},heading,length:32,width:6.5,mass:hullMass(32,6.5),speed:0,drift:0,yaw:0,...o});
const momentum=(...bs)=>bs.reduce((m,b)=>{const f={x:-Math.sin(b.heading),z:-Math.cos(b.heading)},r={x:Math.cos(b.heading),z:-Math.sin(b.heading)};
 return {x:m.x+b.mass*(f.x*b.speed+r.x*b.drift),z:m.z+b.mass*(f.z*b.speed+r.z*b.drift)}},{x:0,z:0});

test('capsule contact: clear, side by side, end to end, crossed, any heading',()=>{
 assert.equal(hullContact(body(0,0,0),body(7,0,0)),null);
 const side=hullContact(body(0,0,0),body(6,0,0));assert.ok(Math.abs(side.depth-.5)<1e-9&&Math.abs(side.nx+1)<1e-9&&Math.abs(side.z)<1e-9,'a scrape touches mid-length');
 const ends=hullContact(body(0,0,0),body(0,31,0));assert.ok(Math.abs(ends.depth-1)<1e-9&&Math.abs(ends.nz+1)<1e-9);
 const cross=hullContact(body(0,0,0),body(0,0,Math.PI/2));assert.ok(cross.depth>6&&Math.abs(Math.hypot(cross.nx,cross.nz)-1)<1e-9);
 for(let h=0;h<6.3;h+=.3){const c=hullContact(body(0,0,h),body(0,0,h+.2));assert.ok(c&&Number.isFinite(c.nx+c.nz+c.depth));}
});
test('a collision parts the hulls by mass, bounces them, and conserves momentum',()=>{
 const a=body(0,0,-Math.PI/2,{speed:10}),b=body(14,0,0,{length:15,width:4,mass:hullMass(15,4)});   // a runs +X into b's side
 const before=momentum(a,b),hit=collideHulls(a,b);
 assert.ok(hit.closing>9&&hit.ramA&&!hit.ramB);
 const after=momentum(a,b);assert.ok(Math.abs(after.x-before.x)<1e-6&&Math.abs(after.z-before.z)<1e-6);
 assert.ok(a.speed<10&&b.drift>0,'the schooner is shoved along +X: towards her starboard');
 assert.equal(hullContact(a,b),null,'no longer overlapping');
 const again=collideHulls(a,b);assert.equal(again,null);
});
test('an off-centre blow turns the struck ship; a centred one only pushes it',()=>{
 const centre=body(0,0,Math.PI/2);applyImpulse(centre,{x:0,z:0},0,-100);assert.equal(centre.yaw,0);assert.ok(Math.abs(centre.speed)<1e-12&&centre.drift>0);
 const bow=body(0,0,0);applyImpulse(bow,{x:0,z:-12},hullMass(32,6.5)*2,0);   // bow pushed to starboard
 assert.ok(bow.yaw<0,'bow to starboard: heading decreases');assert.ok(Math.abs(bow.drift-2)<1e-9);
 const huge=body(0,0,0);applyImpulse(huge,{x:0,z:-16},1e9,0);assert.equal(huge.yaw,-RAM.maxYaw);
});
test('ram damage: the rammed ship takes it all, the rammer a share, a slow scrape nothing',()=>{
 assert.deepEqual(ramDamage({closing:1,ramA:true,ramB:false}),{a:0,b:0});
 const ram=ramDamage({closing:14,ramA:true,ramB:false});assert.ok(ram.b>25&&Math.abs(ram.a-ram.b*RAM.rammer)<1e-9);
 const back=ramDamage({closing:14,ramA:false,ramB:true});assert.equal(back.a,ram.b);
 const scrape=ramDamage({closing:5,ramA:false,ramB:false});assert.equal(scrape.a,scrape.b);
});
test('real vessels: the brig shoves the schooner ahead instead of sailing through, an off-centre blow spins her',()=>{
 const run=offset=>{const p=vessel(),boss=vessel(15,4);p.pos.set(offset,0,40);boss.heading=Math.PI/2;p.throttle=1;p.speed=12;
  let first=null;for(let i=0;i<600;i++){p.update(1/60,i/60);boss.update(1/60,i/60);const h=collideHulls(p,boss);
   if(h&&!first)first={...h,yaw:boss.yaw};assert.ok(!hullContact(p,boss),'parted every step');}
  return {p,boss,first};};
 const square=run(0);assert.ok(square.p.pos.z-square.boss.pos.z>17.9,'never through');assert.ok(square.boss.pos.z< -10&&square.first.ramA);
 assert.ok(Math.abs(square.first.yaw)<1e-9);
 const off=run(5);assert.ok(Math.abs(off.first.yaw)>.05,'struck near her end she turns');
});
