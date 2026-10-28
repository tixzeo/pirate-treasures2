import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SWELLS,swell,swellHeight,swellSample,waveHeight} from '../src/waves.js';
test('a single crest changes height along its front instead of repeating one amplitude',()=>{
  for(const s of SWELLS){
    const along=(Math.PI/2-s.phase)/s.k,values=[];
    for(let cross=0;cross<500;cross+=3){
      const x=s.dir[0]*along-s.dir[1]*cross,z=s.dir[1]*along+s.dir[0]*cross;
      values.push(swellHeight(s,x,z,0));
    }
    assert.ok(Math.max(...values)-Math.min(...values)>s.amp*.35);
    assert.ok(values.every(v=>Math.abs(v)<=s.amp+1e-10));
  }
});
test('fronts bend and analytic slopes follow the height used by flotation',()=>{
  for(const s of SWELLS)for(let i=0;i<80;i++){
    const x=Math.sin(i)*350,z=Math.cos(i*.31)*600,t=i*.9,epsilon=.001;
    const sample=swellSample(s,x,z,t);
    assert.equal(sample.height,swellHeight(s,x,z,t));
    assert.ok(Math.abs(sample.dx-(swellHeight(s,x+epsilon,z,t)-swellHeight(s,x-epsilon,z,t))/(2*epsilon))<1e-7);
    assert.ok(Math.abs(sample.dz-(swellHeight(s,x,z+epsilon,t)-swellHeight(s,x,z-epsilon,t))/(2*epsilon))<1e-7);
  }
});
test('no dominant swell carries a repeating straight train across the whole sea',()=>{
  const energy=SWELLS.reduce((sum,s)=>sum+s.amp*s.amp,0);
  assert.ok(Math.max(...SWELLS.map(s=>s.amp*s.amp))/energy<.4);
  // A carrier wavelength is no longer a translation period of its wave group.
  for(const s of SWELLS){
    let error=0;
    for(let i=0;i<100;i++){
      const x=i*3.7,z=i*1.3;
      error+=Math.abs(swellHeight(s,x,z,12)-swellHeight(s,x+s.dir[0]*s.len,z+s.dir[1]*s.len,12));
    }
    assert.ok(error/100>s.amp*.05);
  }
});
test('wave packets remain deterministic, continuous and within the existing storm envelope',()=>{
  const before=swell.k;swell.k=1.9;
  try{
    const limit=SWELLS.reduce((h,s)=>h+s.amp,0)*swell.k;
    for(let i=0;i<1000;i++){
      const x=Math.sin(i)*700,z=Math.cos(i*.7)*700,t=i*.2,h=waveHeight(x,z,t);
      assert.equal(h,waveHeight(x,z,t));assert.ok(Math.abs(h)<=limit);
      assert.ok(Math.abs(waveHeight(x,z,t+.001)-h)<.006,'no jumps on the following frame');
    }
  }finally{swell.k=before;}
});
