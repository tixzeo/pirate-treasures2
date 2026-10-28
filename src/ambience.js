// The sea around the ship, from real recordings: loops that swell and fade with the ship and the weather,
// creaks when the hull is worked, gulls calling from where they actually fly. Levels come from ambience-mix.js.
// A recording that is missing or fails to decode is simply not heard.
import { LOOPS, SHOTS, SILENT, shotFiles, loopLevels, creakRate, CREAK_GAP, gullRate, GULL_GAP, MAX_GULLS, chance } from './ambience-mix.js';
import { audioOut, loadSound, muted, volumes } from './sound.js';

// Loudness of each recording in the mix once it is levelled, so loopLevels can speak in plain 0..1.
const TRIM = { hull: .5, bow: .7, surf: .9, rigging: .35, 'rigging-strong': .45, sails: .35, storm: .6, creak: .45, gull: .35 };
const FADE = .4; // seconds for a loop to follow a change

const place = (node, x, y, z) => {
  if (node.positionX) { node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z; }
  else node.setPosition(x, y, z);
};

export class Ambience {
  constructor() {
    this.loops = {};
    this.shots = Object.fromEntries(Object.keys(SHOTS).map(n => [n, []]));
    this.levels = { ...SILENT };
    this.voices = new Set();
    this.time = 0; // seconds of game played, for the gaps between calls
    this.creakAt = -Infinity;
    this.last = null;
  }

  // Needs a click or a key press first, like any sound in the browser.
  start() {
    if (this.bus) return;
    const out = audioOut(); if (!out) return;
    const ctx = this.ctx = out.ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0; this.bus.connect(out.master);
    for (const name of LOOPS) loadSound(ctx, name).then(buf => buf && this.addLoop(name, buf));
    for (const name of Object.keys(SHOTS)) for (const f of shotFiles(name)) loadSound(ctx, f).then(buf => buf && this.shots[name].push(buf));
    // The game stops while the tab is hidden; so does the sea.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.bus.gain.setTargetAtTime(0, ctx.currentTime, .05); });
  }

  panner(rolloff, ref = 12) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff;
    p.connect(this.bus);
    return p;
  }

  addLoop(name, buf) {
    const src = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    src.buffer = buf; src.loop = true; gain.gain.value = 0;
    // The surf comes from the nearest shore; its loudness is set by distance in loopLevels, not by the panner.
    if (name === 'surf') gain.connect(this.surfPan = this.panner(0)); else gain.connect(this.bus);
    src.connect(gain);
    src.start(0, Math.random() * buf.duration); // every loop from its own point, so the mix never repeats the same way
    this.loops[name] = gain;
  }

  // One call from a point in the world. follow, if given, is re-read every frame (a gull keeps flying while it calls).
  shot(name, at, follow, rate = 1) {
    const list = this.shots[name]; if (!list.length) return null;
    const src = this.ctx.createBufferSource(), gain = this.ctx.createGain(), pan = this.panner(1, name === 'gull' ? 15 : 6);
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (.92 + Math.random() * .16);
    gain.gain.value = TRIM[name];
    place(pan, at.x, at.y, at.z);
    src.connect(gain).connect(pan);
    const voice = { name, pan, follow, gain };
    this.voices.add(voice);
    src.onended = () => { this.voices.delete(voice); pan.disconnect(); };
    src.start();
    return voice;
  }

  listen(camera) {
    const l = this.ctx.listener, e = camera.matrixWorld.elements, p = camera.position;
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
      l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]); }
  }

  // The nearest bit of shore to the ship: how far, and the point on the waterline.
  shore(world) {
    const p = world.player.pos;
    let best = { distance: Infinity, x: 0, z: 0 };
    for (const isl of [...world.isles, ...(world.scenery || [])]) {
      const r = isl.userData.radius || 0, dx = p.x - isl.position.x, dz = p.z - isl.position.z, d = Math.hypot(dx, dz) || 1;
      const distance = Math.max(0, d - r);
      if (distance < best.distance) best = { distance, x: isl.position.x + dx / d * r, z: isl.position.z + dz / d * r };
    }
    return best;
  }

  // scene: 'sea', 'island' or anything else for quiet. dt in real seconds. Paused: the sea goes on, quieter, and nothing calls.
  update(dt, world, scene, paused = false) {
    if (!this.bus || !(dt > 0)) return;
    const ctx = this.ctx, now = ctx.currentTime, p = world.player, atmo = world.atmo || {};
    this.time += dt;
    this.bus.gain.setTargetAtTime(muted || document.hidden ? 0 : volumes.ambience * (paused ? .5 : 1), now, .15);
    world.camera.updateMatrixWorld();
    this.listen(world.camera);

    const storm = atmo.storm || 0, night = atmo.night || 0, shore = this.shore(world);
    const speed = p.speed / (p.maxSpeed || 1);
    this.levels = loopLevels({ scene, speed, sails: Math.max(0, p.throttle), storm, shore: shore.distance });
    for (const [name, gain] of Object.entries(this.loops)) gain.gain.setTargetAtTime(this.levels[name] * TRIM[name], now, FADE);
    if (this.surfPan) {
      if (scene === 'sea') place(this.surfPan, shore.x, 0, shore.z);
      else { const c = world.camera.position, e = world.camera.matrixWorld.elements; place(this.surfPan, c.x - e[8] * 10, c.y, c.z - e[10] * 10); }
    }

    const m = p.mesh.rotation, last = this.last || { roll: m.z, pitch: m.x, helm: p.helm };
    const motion = { rollRate: (m.z - last.roll) / dt, pitchRate: (m.x - last.pitch) / dt, helmRate: (p.helm - last.helm) / dt, speed, storm };
    this.last = { roll: m.z, pitch: m.x, helm: p.helm };
    if (scene !== 'sea' || paused) return;

    const creak = creakRate(motion);
    if (this.time - this.creakAt > CREAK_GAP && Math.random() < chance(creak.perSecond, dt)) {
      const along = (Math.random() - .5) * (p.mesh.userData.length || 20);
      const v = this.shot('creak', { x: p.pos.x + Math.sin(p.heading) * along, y: 2, z: p.pos.z + Math.cos(p.heading) * along });
      if (v) { v.gain.gain.value = TRIM.creak * creak.volume; this.creakAt = this.time; }
    }

    const cam = world.camera.position;
    for (const g of world.life?.gulls || []) {
      const at = g.m.position, distance = at.distanceTo(cam), busy = [...this.voices].filter(v => v.name === 'gull');
      if (busy.length >= MAX_GULLS || busy.some(v => v.follow === at)) continue;
      if (this.time - (g.calledAt ?? -Infinity) < GULL_GAP || Math.random() >= chance(gullRate({ night, storm, distance }), dt)) continue;
      if (this.shot('gull', at, at)) g.calledAt = this.time;
    }
    for (const v of this.voices) if (v.follow) place(v.pan, v.follow.x, v.follow.y, v.follow.z);
  }
}
