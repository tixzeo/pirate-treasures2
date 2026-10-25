// DOM layer over the 3D view: HUD, compass strip, battle bars, banners and dialogs.
import { SAILS, sailIndex } from './ship.js';
import { MOOR } from './world.js';

const $ = id => document.getElementById(id);
const knots = ms => Math.round(ms * 1.94);

export class UI {
  constructor() {
    this.compass = $('compass');
    this.marks = new Map();
  }

  setGold(g) { $('gold').textContent = g; }

  mode(m) {
    $('hud').hidden = m !== 'sea';
    $('matchHud').hidden = m !== 'match';
  }

  deckHud(mode, available) {
    const walking = mode === 'deck', button = $('deckToggle');
    button.disabled = !available && !walking;
    if (this.controlMode === mode) return;
    this.controlMode = mode;
    $('hud').dataset.control = mode;
    button.textContent = walking ? 'Штурвал' : 'Палуба';
    button.setAttribute('aria-pressed', String(walking));
    $('deckStatus').hidden = !walking;
    $('fireL').disabled = $('fireR').disabled = walking;
    $('keys').textContent = walking ? 'WASD — относительно камеры, перетаскивание — обзор, F — штурвал' : 'W/S — паруса на шаг, A/D — руль, Q/E — залп, Enter — швартовка, F — на палубу';
  }

  sailHud({ speed, throttle, reload, reloadMax, dock, battle, marks, goal }) {
    // The next place to sail to, with an arrow that turns as the ship turns.
    $('goal').hidden = !goal || battle;
    if (goal) {
      $('goal').classList.toggle('foe', goal.kind === 'boss');
      $('goalKind').textContent = goal.kind === 'boss' ? 'Бой с' : 'Плыть к';
      const ic = `./textures/icons/icon_${goal.kind === 'boss' ? 'skull' : 'treasure_chest'}.png`;
      if (!$('goalIcon').src.endsWith(ic.slice(1))) $('goalIcon').src = ic;
      $('goalName').textContent = goal.name;
      $('goalDist').textContent = `${goal.dist} м`;
      $('goalArrow').style.transform = `rotate(${-goal.ang}rad)`;
    }
    $('speed').textContent = `${SAILS[sailIndex(throttle)].name} · ${knots(speed)} уз.`;
    // Mooring checklist: each line turns green once it is within the limit.
    const near = !!dock && dock.dist < 45;
    $('berth').hidden = !near;
    if (near) {
      const line = (id, ok, text) => { const el = $(id); el.textContent = text; el.className = ok ? 'ok' : ''; };
      line('bDist', dock.ok.dist, `До места ${dock.dist.toFixed(1)} м (нужно < ${MOOR.dist})`);
      line('bAng', dock.ok.ang, `Вдоль причала: ${Math.round(dock.ang * 180 / Math.PI)}° (нужно < ${Math.round(MOOR.ang * 180 / Math.PI)}°)`);
      line('bSpeed', dock.ok.speed, `Скорость ${(dock.speed * 1.94).toFixed(1)} уз. (нужно < ${(MOOR.speed * 1.94).toFixed(1)})`);
    }
    $('dock').hidden = !(dock && dock.ready);
    for (const [side, id] of [['left', 'fireL'], ['right', 'fireR']]) {
      const b = $(id);
      b.classList.toggle('wait', reload[side] > 0);
      b.querySelector('i').style.width = (reload[side] > 0 ? (1 - reload[side] / reloadMax) * 100 : 0) + '%';
    }
    $('fireL').parentElement.style.opacity = battle ? 1 : .6;
    // Marks across the strip: ±90° from the bow fills the width.
    const seen = new Set();
    for (const m of marks) {
      seen.add(m.label);
      let el = this.marks.get(m.label);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mark ' + (m.foe ? 'foe' : 'isle');
        this.compass.appendChild(el);
        this.marks.set(m.label, el);
      }
      const x = Math.max(-1, Math.min(1, -m.ang / (Math.PI / 2)));
      el.classList.toggle('next', !!m.goal);
      el.innerHTML = `${m.icon} <span>${m.label}</span><small>${m.dist} м</small>`;
      // Pinned to an edge, the whole label stays on the strip.
      const W = this.compass.clientWidth, half = el.offsetWidth / 2 + 6;
      el.style.left = `${Math.max(half, Math.min(W - half, (50 + x * 46) / 100 * W))}px`;
    }
    for (const [k, el] of this.marks) if (!seen.has(k)) { el.remove(); this.marks.delete(k); }
    // A mark that runs into the next-island mark keeps only its icon.
    const next = [...this.marks.values()].find(el => el.classList.contains('next'));
    const nr = next && next.getBoundingClientRect();
    for (const el of this.marks.values()) {
      el.classList.remove('quiet');
      if (el === next) continue;
      if (!nr) continue;
      const r = el.getBoundingClientRect();
      el.classList.toggle('quiet', r.right > nr.left - 6 && r.left < nr.right + 6);
    }
  }

  battleHud(me, foe) {
    $('bars').hidden = !me;
    if (!me) return;
    $('myHp').style.width = (me.hp / me.maxHp * 100) + '%';
    $('foeHp').style.width = (foe.hp / foe.maxHp * 100) + '%';
  }

  matchHud({ name, moves, score, gold, goals }) {
    $('isleName').textContent = name;
    $('mMoves').textContent = moves;
    $('mScore').textContent = score;
    $('mGold').textContent = gold;
    const box = $('mGoals');
    box.innerHTML = goals.map(g => `<div class="mgoal${g.have >= g.need ? ' done' : ''}"><span>${g.label}</span><b>${Math.min(g.have, g.need)} / ${g.need}</b><i style="width:${Math.min(100, g.have / g.need * 100)}%"></i></div>`).join('');
  }

  flash(text) {
    const f = $('flash');
    f.textContent = text;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  banner(title, text, ms = 4500, danger = true) {
    const b = $('banner');
    b.classList.toggle('calm', !danger);
    b.querySelector('h2').textContent = title;
    b.querySelector('p').textContent = text;
    b.hidden = false;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.hidden = true; }, ms);
  }

  // who: a character id; their portrait replaces the icon once it is drawn (this.portrait is set by main.js).
  dialog({ title, text, gold, buttons, icon = 'treasure_chest', who }) {
    const d = $('dialog');
    const img = d.querySelector('.dicon');
    img.src = `./textures/icons/icon_${icon}.png`;
    img.classList.remove('face');
    const ticket = this.dialogTicket = (this.dialogTicket || 0) + 1;
    if (who && this.portrait) this.portrait(who).then(url => {
      if (ticket !== this.dialogTicket) return;
      img.src = url;
      img.classList.add('face');
    }, () => {});
    d.querySelector('h2').textContent = title;
    d.querySelector('p').textContent = text;
    d.querySelector('.haul').textContent = gold ? `+${gold} золота` : '';
    const box = d.querySelector('.btns');
    box.innerHTML = '';
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
    }
    d.hidden = false;
    this.open = true;
  }

  closeDialog() { $('dialog').hidden = true; this.open = false; }
}
