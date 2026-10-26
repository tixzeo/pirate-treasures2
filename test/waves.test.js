import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SWELLS,swell,swellHeight,waveHeight} from '../src/waves.js';
test('a single crest changes height along its front instead of repeating one amplitude',()=>{
  for(const s of SWELLS){
    const along=(Math.PI/2-s.phase)/s.k,values=[];
    for(let cross=0;cross<500;cross+=3){
      const x=s.dir[0]*along-s.dir[1]*cross,z=s.dir[1]*along+s.dir[0]*cross;
      values.push(swellHeight(s,x,z,0));
    }
    assert.ok(Math.max(...values)-Math.min(...values)>s.amp*.35);
    assert.ok(values.every(v=>v>0&&v<=s.amp+1e-10));
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
