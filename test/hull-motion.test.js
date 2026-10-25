import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HullMotion } from '../src/hull-motion.js';
import { waveHeight, swell } from '../src/sea.js';
import { sampleHullWater } from '../src/hull-water.js';

test('heavy hull filters actual waves at full speed, including storm', () => {
  const before = swell.k;
  try {
    swell.k = 1.9;
    const motion = new HullMotion(); let last, rawRate = 0, smoothRate = 0;
    for (let i = 0; i < 1800; i++) {
      const t = i / 60, z = -14 * t;
      const hb = waveHeight(0, z - 12.8, t), hs = waveHeight(0, z + 12.8, t);
      const hr = waveHeight(3.6, z, t), hl = waveHeight(-3.6, z, t);
      const raw = { heave: (hb + hs + hr + hl) / 4 - .3, pitch: Math.atan2(hb - hs, 25.6), roll: Math.atan2(hr - hl, 7.2) * .8, heel: 0 };
      const pose = motion.update(1 / 60, raw, 32);
      if (last) { rawRate += Math.abs(raw.roll - last.raw) * 60; smoothRate += Math.abs(pose.roll - last.smooth) * 60; }
      last = { raw: raw.roll, smooth: pose.roll };
      assert.ok(Math.abs(pose.roll) <= .16 && Math.abs(pose.pitch) <= .1);
    }
    assert.ok(smoothRate < rawRate * .55, `${smoothRate} / ${rawRate}`);
  } finally { swell.k = before; }
});

test('response is independent of frame partition and shorter hulls respond sooner', () => {
  const sample = { heave: 0, pitch: 0, roll: 0, heel: 0 }, next = { ...sample, heave: 1, pitch: .2, roll: .8, heel: -.9 };
  const run = (hz, length) => { const m = new HullMotion(); m.update(0, sample, length); for (let i = 0; i < hz; i++) m.update(1 / hz, next, length); return m; };
  const a = run(10, 32), b = run(120, 32), small = run(60, 15);
  for (const k of ['heave', 'pitch', 'roll']) assert.ok(Math.abs(a[k] - b[k]) < 1e-10);
  assert.equal(a.heave, next.heave); assert.equal(small.heave, a.heave);
  assert.ok(small.pitch > a.pitch);
});

test('spatial water fit follows a moving plane exactly at every heading without heave delay', () => {
  const motion = new HullMotion();
  for (const heading of [0,.7,Math.PI/2,Math.PI]) for (const time of [0,.1,1,4]) {
    const x=12,z=-25,height=(x,z,t)=>.03*x-.02*z+Math.sin(t*2);
    const pose=sampleHullWater(height,{x,z,heading,length:32,width:6.5},time);
    assert.ok(Math.abs(pose.heave-(height(x,z,time)-.3))<1e-10);
    assert.ok(Math.abs(pose.pitch-Math.atan(-.03*Math.sin(heading)+.02*Math.cos(heading)))<1e-10);
    assert.ok(Math.abs(pose.roll-Math.atan(.03*Math.cos(heading)+.02*Math.sin(heading))*.8)<1e-10);
    assert.equal(motion.update(1/60,{...pose,heel:0},32).heave,pose.heave);
  }
});
