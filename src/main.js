import * as THREE from 'three';
import { World } from './world.js';
import { Match3 } from './match3/view.js';
import { UI } from './ui.js';
import { updateTweens } from './tween.js';
import { sfx, setMuted, muted } from './sound.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ui = new UI();
const world = new World(renderer, ui);
const match = new Match3(renderer, ui);
let mode = 'intro';
let gold = 0;
const addGold = g => { gold += g; ui.setGold(gold); };
world.onGold = addGold;

// The first island from part one: 20 moves, five kinds of treasure, 800 points.
const ISLAND = { name: 'Остров Креста', moves: 20, types: 5, score: 800 };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  world.resize(w, h);
  match.resize(w, h);
}
addEventListener('resize', resize);
resize();

// Input: keys on a computer, a stick and buttons on a phone.
const input = { throttle: 0, rudder: 0 };
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (mode !== 'sea' || ui.open) return;
  if (e.code === 'KeyQ') world.fire('left');
  if (e.code === 'KeyE') world.fire('right');
  if ((e.code === 'Enter' || e.code === 'Space') && world.nearIsland()) land();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const stick = $('stick'), knob = stick.querySelector('i');
let stickId = null, stickX = 0;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  knob.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
  stickX = x;
  // Pushing up sets the sails; they stay set after the finger lifts.
  input.throttle = THREE.MathUtils.clamp(-y * 1.15, -.3, 1);
}
stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
const stickUp = e => { if (e.pointerId !== stickId) return; stickId = null; stickX = 0; knob.style.transform = `translate(0, ${-input.throttle / 1.15 * 38}px)`; };
stick.addEventListener('pointerup', stickUp);
stick.addEventListener('pointercancel', stickUp);

function readKeys(dt) {
  const up = keys.has('KeyW') || keys.has('ArrowUp'), down = keys.has('KeyS') || keys.has('ArrowDown');
  if (up) input.throttle = Math.min(1, input.throttle + dt * .8);
  if (down) input.throttle = Math.max(-.3, input.throttle - dt * .8);
  const left = keys.has('KeyA') || keys.has('ArrowLeft'), right = keys.has('KeyD') || keys.has('ArrowRight');
  input.rudder = left ? 1 : right ? -1 : stickId !== null ? -stickX : 0;
}

$('fireL').addEventListener('click', () => world.fire('left'));
$('fireR').addEventListener('click', () => world.fire('right'));
$('dock').addEventListener('click', () => land());
$('soundBtn').addEventListener('click', e => { setMuted(!muted); e.target.setAttribute('aria-pressed', String(!muted)); e.target.textContent = muted ? 'Без звука' : 'Звук'; });

// Landing: the ship drops anchor and the treasure hunt starts on the island.
function land() {
  if (mode !== 'sea' || ui.open) return;
  mode = 'match';
  world.player.throttle = input.throttle = 0;
  world.player.speed = 0;
  ui.mode('match');
  match.start(ISLAND, ({ win, gold: g }) => {
    ui.dialog(win ? {
      title: 'Клад добыт!',
      text: 'Под крестом был зарыт сундук с дублонами. Команда грузит добычу в трюм. Пора поднимать паруса!',
      gold: g,
      buttons: [['На корабль', () => { ui.closeDialog(); addGold(g); world.islandDone = true; backToSea(); }]],
    } : {
      title: 'Ходы кончились',
      text: 'Клад так и не нашли, но кое-что команда всё же подобрала. Можно попробовать снова.',
      gold: g,
      buttons: [['Ещё раз', () => { ui.closeDialog(); addGold(g); match.start(ISLAND, match.onEnd); }],
        ['На корабль', () => { ui.closeDialog(); addGold(g); backToSea(); }]],
    });
  });
}
function backToSea() {
  match.active = false;
  mode = 'sea';
  ui.mode('sea');
}
$('leave').addEventListener('click', () => { if (!ui.open) backToSea(); });

$('go').addEventListener('click', () => {
  $('intro').hidden = true;
  mode = 'sea';
  ui.mode('sea');
  input.throttle = .6;
  sfx('win');
});
ui.mode('intro');

const clock = new THREE.Clock();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  updateTweens(dt * 1000);
  if (mode === 'match') {
    match.update(dt, t);
    match.render();
  } else {
    if (mode === 'sea' && !ui.open) readKeys(dt);
    world.update(mode === 'sea' && !ui.open ? dt : dt * .2, input);
    world.render();
  }
});

// Handy for checks from the console.
window.game = { world, match, land, get mode() { return mode; } };
