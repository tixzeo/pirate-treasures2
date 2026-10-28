import test from 'node:test';import assert from 'node:assert/strict';
import {SETTINGS,SETTINGS_KEY,defaults,sanitize,loadSettings,saveSettings} from '../src/settings.js';

const memory=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};};
test('defaults are valid and complete',()=>{const d=defaults();assert.deepEqual(sanitize(d),d);assert.deepEqual(Object.keys(d).sort(),Object.keys(SETTINGS).sort());});
test('garbage and old saves fall back to defaults field by field',()=>{
 for(const raw of [null,undefined,42,'x',[],{}])assert.deepEqual(sanitize(raw),defaults());
 const s=sanitize({master:.3,effects:'loud',fpsCap:45,muted:'yes',fov:NaN,extra:1});
 assert.equal(s.master,.3);assert.equal(s.effects,1);assert.equal(s.fpsCap,0);assert.equal(s.muted,false);assert.equal(s.fov,55);assert.ok(!('extra' in s));
});
test('numbers are clamped and snapped to their step',()=>{
 const s=sanitize({master:1.7,ambience:-1,sharpness:.2,camSpeed:1.234,fov:200});
 assert.equal(s.master,1);assert.equal(s.ambience,0);assert.equal(s.sharpness,.5);assert.equal(s.camSpeed,1.25);assert.equal(s.fov,75);
});
test('settings survive a save and a load, apart from the game save',()=>{
 const st=memory({'pirates2-save':'{"gold":500}'});const s={...defaults(),master:.4,shadows:false,fpsCap:30,invertY:true};
 saveSettings(s,st);assert.deepEqual(loadSettings(st),s);assert.equal(st.m.get('pirates2-save'),'{"gold":500}');assert.ok(st.m.has(SETTINGS_KEY));
});
test('broken or blocked storage never throws',()=>{
 assert.deepEqual(loadSettings(memory({[SETTINGS_KEY]:'{oops'})),defaults());
 const blocked={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
 assert.deepEqual(loadSettings(blocked),defaults());assert.doesNotThrow(()=>saveSettings(defaults(),blocked));
});
