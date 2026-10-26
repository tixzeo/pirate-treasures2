import * as THREE from 'three';
import { World } from './world.js';
import { createMatch3Activity } from './match3/activity.js';
import { registerIslandActivity, islandActivity } from './island-activity.js';
import { UI } from './ui.js';
import { updateTweens } from './tween.js';
import { sfx, setMuted, muted } from './sound.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { setupGod } from './god.js';
import { portrait } from './characters.js';
import { SAILS, sailIndex } from './ship.js';
import { seaIntent } from './deck-walk.js';
import { SimulationClock } from './simulation-clock.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ui = new UI();
ui.portrait = id => portrait(renderer, id);
ui.portrait('captain').then(url => { $('introFace').src = url; }, () => {});
const world = new World(renderer, ui);
registerIslandActivity(createMatch3Activity,{fallback:true});
const activity=islandActivity();
let mode = 'intro';
let speed = 1;
const save = loadSave();
const persist = () => {
  save.done = world.isles.filter(i => i.userData.done).map(i => i.userData.def.name);
  save.bossBeaten = world.bossBeaten;
  writeSave(save);
};
const addGold = g => { save.gold += g; ui.setGold(save.gold); persist(); };
ui.setGold(save.gold);
world.applySave(save);
world.onGold = addGold;
world.onBossBeaten = persist;
// The victory story waits until the schooner has gone under.
world.onBossGone = () => ui.dialog({
  title: 'Победа!',
  icon: 'crown',
  who: 'tim_cabin_boy',
  text: 'Шрам уплывает на шлюпке, грозя кулаком. А из воды к вам карабкается мальчишка: «Я больше не служу Шраму! Возьмите меня юнгой, я знаю все его хитрости». Юнга Тим теперь в команде.',
  gold: 500,
  buttons: [['Йо-хо-хо!', () => ui.closeDialog()]],
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  world.resize(w, h);
  activity.resize(w, h);
}
addEventListener('resize', resize);
resize();

// Input: keys on a computer, a stick and buttons on a phone.
const input = { throttle: 0, rudder: 0 };
const keys = new Set();
addEventListener('keydown', e => {
  if (mode !== 'sea' || ui.open || e.target.matches?.('input, textarea, [contenteditable="true"]')) return;
  if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); toggleDeck(); return; }
  keys.add(e.code);
  if (world.seaControlMode === 'deck') return;
  // W/S set the sails one step at a time.
  const step = (e.code === 'KeyW' || e.code === 'ArrowUp') ? 1 : (e.code === 'KeyS' || e.code === 'ArrowDown') ? -1 : 0;
  if (step && !e.repeat) setSails(sailIndex(input.throttle) + step);
  if (e.code === 'KeyQ') world.fire('left');
  if (e.code === 'KeyE') world.fire('right');
  if ((e.code === 'Enter' || e.code === 'Space') && world.nearIsland()) land();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => clearControlInput());

function setSails(i) {
  input.throttle = SAILS[THREE.MathUtils.clamp(i, 0, SAILS.length - 1)].v;
  if (stickId === null) knob.style.transform = `translate(0, ${-input.throttle * 38}px)`;
}

// Dragging on the sea turns the view around the ship; the wheel zooms.
let dragId = null, dragX = 0, dragY = 0;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', e => {
  if (mode !== 'sea' || dragId !== null) return;
  dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId) return;
  world.orbit(e.clientX - dragX, e.clientY - dragY);
  dragX = e.clientX; dragY = e.clientY;
});
const dragEnd = e => { if (e.pointerId === dragId) dragId = null; };
canvas.addEventListener('pointerup', dragEnd);
canvas.addEventListener('pointercancel', dragEnd);
canvas.addEventListener('wheel', e => { if (mode === 'sea') { e.preventDefault(); world.zoom(e.deltaY); } }, { passive: false });

const stick = $('stick'), knob = stick.querySelector('i');
let stickId = null, stickX = 0, stickY = 0;
function stickMove(e) {
  if (mode !== 'sea' || ui.open) return;
  const r = stick.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  knob.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
  stickX = x; stickY = y;
  // Pushing up sets the sails, snapping to the nearest setting; they stay set after the finger lifts.
  if (world.seaControlMode === 'helm') input.throttle = SAILS[sailIndex(-y * 1.15)].v;
}
stick.addEventListener('pointerdown', e => { if (mode !== 'sea' || ui.open || stickId !== null) return; stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
const knobRest = () => { knob.style.transform = `translate(0, ${world.seaControlMode === 'deck' ? 0 : -input.throttle * 38}px)`; };
const stickUp = e => { if (e.pointerId !== stickId) return; stickId = null; stickX = stickY = 0; knobRest(); };
stick.addEventListener('pointerup', stickUp);
stick.addEventListener('pointercancel', stickUp);
stick.addEventListener('lostpointercapture', stickUp);

function clearControlInput() {
  keys.clear(); input.rudder = input.walkX = input.walkZ = 0;
  if (stickId !== null && stick.hasPointerCapture(stickId)) stick.releasePointerCapture(stickId);
  if (dragId !== null && canvas.hasPointerCapture(dragId)) canvas.releasePointerCapture(dragId);
  stickId = dragId = null; stickX = stickY = 0; knobRest();
}
world.onControlMode = () => { clearControlInput(); ui.deckHud(world.seaControlMode, world.canDeckWalk()); };
world.onRepair = () => { clearControlInput(); setSails(1); };
function toggleDeck() {
  if (mode !== 'sea' || ui.open) return;
  if (!world.setSeaControlMode(world.seaControlMode === 'deck' ? 'helm' : 'deck')) ui.flash(world.state === 'battle' ? 'В бою нужен штурвал' : 'Палуба пока недоступна');
}
$('deckToggle').addEventListener('click', toggleDeck);

function readKeys() {
  Object.assign(input, seaIntent(world.seaControlMode, keys, stickId === null ? null : { x: stickX, y: stickY }, input.throttle));
}

$('fireL').addEventListener('click', () => world.fire('left'));
$('fireR').addEventListener('click', () => world.fire('right'));
$('dock').addEventListener('click', () => land());
$('soundBtn').addEventListener('click', e => { setMuted(!muted); e.target.setAttribute('aria-pressed', String(!muted)); e.target.textContent = muted ? 'Без звука' : 'Звук'; });

// Landing: the ship drops anchor and the treasure hunt starts on the island.
function land() {
  const isle = world.nearIsland();
  if (mode !== 'sea' || ui.open || !isle) return;
  world.moor(isle);
  const def = isle.userData.def;
  const level = { ...def.level, name: def.name };
  mode = 'island';
  clearControlInput();
  setSails(1);
  world.player.throttle = 0;
  world.player.speed = 0;
  ui.mode('island');
  const ctx={isle,def,level,world,renderer,ui};
  const onEnd = ({ win, gold: g }) => {
    ui.dialog(win ? {
      title: 'Клад добыт!',
      who: def.who,
      text: def.story,
      gold: g,
      buttons: [['На корабль', () => {
        ui.closeDialog(); isle.userData.done = true; addGold(g); backToSea();
        const next = world.target();
        if (next) ui.banner(next.kind === 'boss' ? 'Следующая цель: «Каракатица»' : `Следующая цель: ${next.name}`,
          next.kind === 'boss' ? 'Плывите за золотой стрелкой. Шхуна Шрама ждёт.' : 'Плывите туда, куда показывает стрелка вверху экрана.', 4000, next.kind === 'boss');
      }]],
    } : {
      title: 'Ходы кончились',
      icon: 'hook',
      who: 'bosun',
      text: 'Клад так и не нашли, но кое-что команда всё же подобрала. Можно попробовать снова.',
      gold: g,
      buttons: [['Ещё раз', () => { ui.closeDialog(); addGold(g); activity.start(ctx, onEnd); }],
        ['На корабль', () => { ui.closeDialog(); addGold(g); backToSea(); }]],
    });
  };
  activity.start(ctx, onEnd);
}
function backToSea() {
  world.setSeaControlMode('helm'); clearControlInput();
  activity.stop();
  mode = 'sea';
  ui.mode('sea');
}
$('leave').addEventListener('click', () => { if (!ui.open) backToSea(); });

$('go').addEventListener('click', () => {
  $('intro').hidden = true;
  mode = 'sea';
  ui.mode('sea');
  setSails(3); // half sail to start
  sfx('win');
  const first = world.target();
  if (first) ui.banner(`${save.done.length ? 'Цель' : 'Первая цель'}: ${first.name}`, 'Стрелка вверху показывает, куда плыть. Встаньте вдоль причала в золотой контур и сбавьте ход.', 4500, false);
});
ui.mode('intro');

const clock = new THREE.Clock();
const simulation = new SimulationClock();
document.addEventListener('visibilitychange',()=>{simulation.remainder=0;clock.getDelta();});
renderer.setAnimationLoop(() => {
  const elapsed=clock.getDelta();
  if(document.hidden){simulation.remainder=0;return;}
  simulation.advance(elapsed,(dt,t)=>{
  updateTweens(dt * 1000);
  if (mode === 'island') {
    activity.update(dt, t);
  } else {
    if (mode === 'sea' && !ui.open) readKeys();
    // Dialogs hold the helm but the sea keeps moving.
    world.update(dt, mode === 'sea' && !ui.open ? input : { throttle: world.player.throttle * .98, rudder: 0 });
  }
  },speed);
  if(mode==='island')activity.render();else world.render();
});

// God menu: testing tools for the prototype.
const matchAvailable=()=>mode==='island'&&activity.kind==='match3';
const matchCommand=(command,...args)=>{if(matchAvailable())return activity.debug(command,...args)};
setupGod({
  mode: () => mode,
  matchAvailable,
  isles: () => world.isles.map(i => ({ name: i.userData.def.name, done: i.userData.done })),
  reset() {
    clearSave();
    Object.assign(save, loadSave());
    ui.setGold(save.gold);
    ui.closeDialog();
    if (mode === 'island') backToSea();
    world.resetProgress();
    setSails(1);
    ui.banner('Прогресс сброшен', `Первая цель: ${world.target().name}`, 3000, false);
  },
  addGold,
  teleport(i) {
    if (mode === 'island') backToSea();
    if (i === 'start') world.teleport(new THREE.Vector3(0, 0, -30), 30);
    else if (i === 'boss') world.teleport(world.boss.pos, 95);
    else world.teleportBerth(world.isles[i]);
  },
  toggleIsle(i) { const d = world.isles[i].userData; d.done = !d.done; persist(); },
  matchWin(){matchCommand('win')},
  matchMoves(n){matchCommand('moves',n)},
  matchSpecial(t){matchCommand('special',t)},
  matchShuffle(){matchCommand('shuffle')},
  sinkBoss() {
    if (world.bossBeaten) return;
    world.boss.hp = 0;
    world.winBattle();
  },
  heal() { const p = world.player; p.hp = p.maxHp; p.sinking = 0; world.lost = false; world.ui.battleHud(world.state === 'battle' ? p : null, world.boss); },
  atmo: () => world.atmo,
  post: () => world.post,
  immortal: () => !!world.immortal,
  setImmortal(v) { world.immortal = v; },
  speed: () => speed,
  setSpeed(v) { speed = v; },
  state: () => ({
    version: '0.2.0', mode, gfx: { quality: world.post.quality, hour: +world.atmo.hour.toFixed(1), storm: +world.atmo.storm.toFixed(2) }, save: { ...save }, state: world.state,
    pos: world.player.pos.toArray().map(v => Math.round(v)), heading: +world.player.heading.toFixed(2),
    seaControlMode: world.seaControlMode,
    hp: world.player.hp, boss: { hp: world.boss.hp, sinking: +world.boss.sinking.toFixed(2), gone: !!world.bossGone },
    target: world.target() && world.target().name,
    activity:mode==='island'?{kind:activity.kind}:null,
    match:matchCommand('state')??null,
  }),
});

// Handy for checks from the console.
window.game = { world, land, input, readInput: readKeys, registerIslandActivity,
  get match(){return matchCommand('view')??null},get activity(){return activity},get mode(){return mode} };
