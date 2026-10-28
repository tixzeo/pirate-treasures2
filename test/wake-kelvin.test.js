import test from 'node:test';import assert from 'node:assert/strict';
import {wakePulse} from '../src/wake-field.js';
import {WAKE} from '../src/wake.js';
const fast={x:0,z:0,fx:0,fz:-1,width:2.6,strength:1,age:.4,extent:12*WAKE.interval*1.2};   // a hull at 12 m/s towards -Z
const ring=p=>{const seconds=p.age*WAKE.lifetime;return p.width*.75+seconds*4;};
const at=(p,deg)=>{const r=ring(p),a=deg*Math.PI/180;return [p.x+Math.sin(a)*Math.sqrt(r*r-1),p.z-Math.cos(a)*Math.sqrt(r*r-1)];};
const peak=(p,deg)=>{let m=0;for(let dr=-3;dr<=3;dr+=.1){const r=ring(p)+dr,a=deg*Math.PI/180;m=Math.max(m,Math.abs(wakePulse(p,p.x+Math.sin(a)*r,p.z-Math.cos(a)*r).height));}return m;};

test('a fast hull leaves the arms of a V, not a ring welling up behind the stern',()=>{
 const arm=Math.acos(4/12)*180/Math.PI;                      // where the ring touches the V
 assert.ok(peak(fast,arm)>.05&&peak(fast,-arm)>.05,'both arms');
 assert.ok(peak(fast,180)<peak(fast,arm)*.05,'nothing straight astern');
 assert.ok(Math.abs(peak(fast,arm)-peak(fast,-arm))<1e-12);
 const slow={...fast,extent:3*WAKE.interval*1.2};assert.ok(peak(slow,180)>.05,'a slow hull keeps its half ring');
});
test('a ring swells in instead of appearing at full height',()=>{
 const arm=Math.acos(4/12)*180/Math.PI;
 const born=peak({...fast,age:0},arm),young=peak({...fast,age:.04},arm),grown=peak({...fast,age:.1},arm);
 assert.equal(born,0);assert.ok(young>0&&young<grown*.7);
});
test('Kelvin arms keep exact analytic slopes',()=>{
 for(const p of [fast,{...fast,extent:6*WAKE.interval*1.2},{...fast,age:.05}])for(let i=0;i<300;i++){
  const x=Math.sin(i*1.3)*25,z=Math.cos(i*.7)*25,e=1e-4,f=wakePulse(p,x,z);
  assert.ok(Math.abs(f.dx-(wakePulse(p,x+e,z).height-wakePulse(p,x-e,z).height)/(2*e))<1e-7);
  assert.ok(Math.abs(f.dz-(wakePulse(p,x,z+e).height-wakePulse(p,x,z-e).height)/(2*e))<1e-7);
 }
});
