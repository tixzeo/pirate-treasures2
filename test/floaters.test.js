import test from 'node:test';import assert from 'node:assert/strict';
import {driftFloater,FLOAT} from '../src/floaters.js';
const thing=(x,z,dx=0,dz=0)=>({m:{position:{x,z}},drift:{x:dx,z:dz}});
const ship=(o={})=>({pos:{x:0,z:0},heading:0,length:32,width:6.5,speed:0,...o});

test('a barrel drifts with its own set plus a share of the wind, and gets there smoothly',()=>{
 const f=thing(0,0,.2,0),wind={toward:0,speed:10};          // the wind blows towards -Z
 for(let i=0;i<1200;i++)driftFloater(f,1/60,wind);
 assert.ok(Math.abs(f.vel.x-.2)<1e-3&&Math.abs(f.vel.z+10*FLOAT.windage)<1e-3);
 const calm=thing(0,0,.2,0);driftFloater(calm,1,null);assert.ok(Math.abs(calm.m.position.x-.2)<1e-12);
 const still=thing(5,5);driftFloater(still,0,wind);driftFloater(still,NaN,wind);assert.equal(still.m.position.x,5);assert.equal(still.vel,undefined);
});
test('the hull shoulders a barrel clear to the side it lies on, harder at the bow and at speed',()=>{
 const bow=thing(1,-12),slowBow=thing(1,-12),stern=thing(1,12),port=thing(-1,-12);
 driftFloater(bow,1/60,null,[ship({speed:12})]);driftFloater(slowBow,1/60,null,[ship({speed:2})]);
 driftFloater(stern,1/60,null,[ship({speed:12})]);driftFloater(port,1/60,null,[ship({speed:12})]);
 assert.ok(bow.m.position.x>=6.5/2+FLOAT.margin,'out beyond her side');assert.ok(port.m.position.x<=-(6.5/2+FLOAT.margin));
 assert.ok(bow.vel.x>slowBow.vel.x&&bow.vel.x>stern.vel.x&&bow.vel.z<0,'the bow throws it out and ahead');
 const clear=thing(20,0);driftFloater(clear,1/60,null,[ship({speed:12})]);assert.equal(clear.vel.x,0);
});
test('the wake pushes things out to the sides behind her and fades with distance',()=>{
 const near=thing(1,20),far=thing(1,90),still=thing(1,20);
 for(let i=0;i<60;i++){driftFloater(near,1/60,null,[ship({speed:12})]);driftFloater(far,1/60,null,[ship({speed:12})]);driftFloater(still,1/60,null,[ship()]);}
 assert.ok(near.m.position.x>1.5&&near.m.position.x-1>far.m.position.x-1,'out to starboard, less far astern');
 assert.equal(still.m.position.x,1);
});
test('a ship ploughing through a field of wreckage leaves none inside her hull',()=>{
 const field=[];for(let x=-6;x<=6;x+=1.5)for(let z=-40;z<=-5;z+=2.5)field.push(thing(x,z));
 const s=ship({speed:10});
 for(let i=0;i<240;i++){s.pos.z-=10/60;for(const f of field)driftFloater(f,1/60,null,[s]);
  for(const f of field){const a=s.pos.z-f.m.position.z,c=f.m.position.x;assert.ok(!(Math.abs(a)<16&&Math.abs(c)<3.25),'inside the hull');}}
});
