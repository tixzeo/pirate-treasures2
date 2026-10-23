// DOM layer over the 3D view: HUD, compass strip, battle bars, banners and dialogs.
const $ = id => document.getElementById(id);

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

  sailHud({ speed, reload, reloadMax, canDock, battle, marks }) {
    $('speed').textContent = `${Math.round(speed * 1.94)} узлов`;
    $('dock').hidden = !canDock;
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
        el.className = 'mark ' + (m.icon === '☠' ? 'foe' : 'isle');
        this.compass.appendChild(el);
        this.marks.set(m.label, el);
      }
      const x = Math.max(-1, Math.min(1, -m.ang / (Math.PI / 2)));
      el.style.left = `${50 + x * 46}%`;
      el.innerHTML = `${m.icon} ${m.label}<small>${m.dist} м</small>`;
    }
    for (const [k, el] of this.marks) if (!seen.has(k)) { el.remove(); this.marks.delete(k); }
  }

  battleHud(me, foe) {
    $('bars').hidden = !me;
    if (!me) return;
    $('myHp').style.width = (me.hp / me.maxHp * 100) + '%';
    $('foeHp').style.width = (foe.hp / foe.maxHp * 100) + '%';
  }

  matchHud({ name, moves, score, need, gold }) {
    $('isleName').textContent = name;
    $('mMoves').textContent = moves;
    $('mScore').textContent = score;
    $('mNeed').textContent = ` / ${need}`;
    $('mGold').textContent = gold;
    $('mGoal').style.width = Math.min(100, score / need * 100) + '%';
  }

  flash(text) {
    const f = $('flash');
    f.textContent = text;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  banner(title, text, ms = 4500) {
    const b = $('banner');
    b.querySelector('h2').textContent = title;
    b.querySelector('p').textContent = text;
    b.hidden = false;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.hidden = true; }, ms);
  }

  dialog({ title, text, gold, buttons }) {
    const d = $('dialog');
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
