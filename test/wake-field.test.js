import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wakePulse,bowPressure,wakeHeight,wakeSurface} from '../src/wake-field.js';
import {WakeTrail,WAKE} from '../src/wake.js';
import {waveHeight} from '../src/waves.js';
const pulse={x:100,z:200,fx:0,fz:-1,width:3,strength:1,age:.25};
const ship={x:100,z:200,heading:0,speed:12,width:7,length:32,active:true};
test('wake fronts expand away from the travelled course and decay',()=>{
  for(const age of [.1,.25,.5,.8]){
    const p={...pulse,age},radius=p.width*.75+age*WAKE.lifetime*4;
    const x=p.x+Math.sqrt(radius*radius-1);
    assert.ok(wakePulse(p,x,p.z).height>.001);
    assert.equal(wakePulse(p,x,p.z).height,wakePulse(p,2*p.x-x,p.z).height);
    assert.equal(wakePulse(p,p.x+radius+10,p.z).height,0);
  }
  assert.equal(wakePulse({...pulse,age:1},110,200).height,0);
  assert.ok(wakePulse({...pulse,strength:.2},110,200).height===wakePulse(pulse,110,200).height*.2);
});
test('wake and bow analytic normals follow the displaced surface, including source centres',()=>{
  for(const sample of [(x,z)=>wakePulse(pulse,x,z),(x,z)=>bowPressure(ship,x,z)]){
    for(let i=0;i<250;i++){
      const x=100+Math.sin(i*1.3)*25,z=200+Math.cos(i*.7)*25,e=.0001,f=sample(x,z);
      assert.ok(Math.abs(f.dx-(sample(x+e,z).height-sample(x-e,z).height)/(2*e))<1e-7);
      assert.ok(Math.abs(f.dz-(sample(x,z+e).height-sample(x,z-e).height)/(2*e))<1e-7);
    }
    assert.ok(Object.values(sample(100,200)).every(Number.isFinite));
  }
});
test('bow pressure follows actual speed, including stern-first travel and a stopped hull',()=>{
  assert.ok(bowPressure(ship,100,200-32*.45).height>.1);
  assert.equal(bowPressure({...ship,speed:0},100,200-32*.45).height,0);
  assert.ok(bowPressure({...ship,speed:-12},100,200+32*.45).height>.1);
  assert.equal(bowPressure({...ship,active:false},100,200-32*.45).height,0);
});
test('world-space wave history survives turns and expires after a stop',()=>{
  const trail=new WakeTrail();trail.update(0,[ship]);
  const original={...trail.points[0]},x=original.x+7,z=original.z;
  const h=wakeHeight(x,z,[original],[]);
  trail.update(.1,[{...ship,heading:Math.PI/2}]);
  assert.equal(wakeHeight(x,z,[{...trail.points[0],age:original.age}],[]),h);
  trail.update(6,[{...ship,speed:0}]);
  assert.equal(wakeHeight(x,z,trail.points,[]),0);
});
test('flotation includes the same local wave displacement instead of ignoring ship waves',()=>{
  const old={...wakeSurface};
  try{
    wakeSurface.points=[];wakeSurface.ships=[];const before=waveHeight(107,200,12);
    wakeSurface.points=[pulse];wakeSurface.ships=[ship];
    assert.ok(Math.abs(waveHeight(107,200,12)-before-wakeHeight(107,200))<1e-12);
  }finally{Object.assign(wakeSurface,old)}
});
