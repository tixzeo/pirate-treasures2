// Sounds made on the fly with WebAudio, like in part one. Where a real recording exists (public/sounds)
// it plays instead, once loaded; the made-up sound stays as the fallback.
let ctx = null, master = null;
export let muted = false;
// Captain request, 26.10.2026: temporarily silence thunder during playtesting.
export const THUNDER_ENABLED = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = .5;
    master.connect(ctx.destination);
    loadRecordings();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) { muted = v; }

// For sounds that live longer than one call, like the sea in ambience.js.
export function audioOut() { const a = ac(); return a && { ctx: a, master }; }

const base = import.meta.env ? import.meta.env.BASE_URL : './';
export const loadSound = (a, name) => fetch(`${base}sounds/${name}.ogg`)
  .then(r => r.ok ? r.arrayBuffer() : null)
  .then(b => b && a.decodeAudioData(b))
  .catch(() => null);

// Takes of each recorded sound (cannon-1.ogg, cannon-2.ogg...) and how loud they sit in the mix.
const RECORDED = { cannon: [2, .9], hit: [1, .7], splash: [1, .6] };
const recordings = {};
function loadRecordings() {
  for (const [name, [takes]] of Object.entries(RECORDED)) for (let i = 1; i <= takes; i++)
    loadSound(ctx, `${name}-${i}`).then(buf => buf && (recordings[name] ||= []).push(buf));
}
function playRecording(name) {
  const takes = recordings[name]; if (!takes) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = takes[Math.floor(Math.random() * takes.length)];
  src.playbackRate.value = .94 + Math.random() * .12; // no two shots quite alike
  g.gain.value = RECORDED[name][1];
  src.connect(g).connect(master);
  src.start();
  return true;
}

function tone(freq, dur, { type = 'sine', vol = .3, slide = 0, delay = 0 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + .05);
}

function noise(dur, { vol = .5, freq = 800, delay = 0 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const SOUNDS = {
  tick: () => tone(660, .06, { type: 'triangle', vol: .15 }),
  swap: () => tone(420, .12, { type: 'triangle', vol: .2, slide: 1.5 }),
  wrong: () => tone(180, .2, { type: 'square', vol: .12, slide: .7 }),
  match: combo => { const f = 520 * 2 ** ((Math.min(combo, 6) - 1) / 6); tone(f, .18, { type: 'triangle', vol: .25 }); tone(f * 1.5, .2, { type: 'sine', vol: .15, delay: .05 }); },
  forge: () => { tone(880, .3, { type: 'triangle', vol: .2 }); tone(1320, .3, { vol: .15, delay: .08 }); },
  cannon: () => { noise(.5, { vol: .8, freq: 500 }); tone(90, .4, { type: 'sine', vol: .5, slide: .5 }); },
  boom: () => { noise(.9, { vol: 1, freq: 350 }); tone(60, .6, { vol: .6, slide: .5 }); },
  thunder: () => { noise(2.4, { vol: .9, freq: 200 }); tone(48, 1.6, { vol: .5, slide: .6 }); },
  splash: () => noise(.4, { vol: .25, freq: 1800 }),
  hit: () => { noise(.35, { vol: .6, freq: 1200 }); tone(140, .25, { type: 'square', vol: .15, slide: .6 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, { type: 'triangle', vol: .25, delay: i * .12 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, .35, { type: 'triangle', vol: .25, delay: i * .18 })),
};

export function sfx(name, arg) {
  if (muted || !SOUNDS[name] || (name === 'thunder' && !THUNDER_ENABLED)) return;
  try { if (!(ac() && playRecording(name))) SOUNDS[name](arg); } catch (e) { /* audio is optional */ }
}
