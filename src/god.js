// God menu for testing: reset progress, jump around, win or lose on demand, and copy the game state for a bug report.
// Turn GOD_MENU off before publishing to Yandex Games.
import { CANNON_ROW, BARREL, COMPASS, N } from './match3/board.js';

export const GOD_MENU = true;

const errors = [];
addEventListener('error', e => errors.push(`${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));

export function setupGod(api) {
  if (!GOD_MENU) return;
  const btn = document.createElement('button');
  btn.className = 'ghost godbtn';
  btn.type = 'button';
  btn.textContent = 'God';
  btn.title = 'Меню разработчика (клавиша `)';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'god';
  panel.hidden = true;
  document.body.appendChild(panel);

  const fps = document.createElement('div');
  fps.className = 'godfps';
  fps.hidden = true;
  document.body.appendChild(fps);
  let frames = 0, last = performance.now();
  (function tick() {
    frames++;
    const now = performance.now();
    if (now - last > 500) { fps.textContent = `${Math.round(frames * 1000 / (now - last))} fps · ${api.mode()}`; frames = 0; last = now; }
    requestAnimationFrame(tick);
  })();

  const toggle = () => { panel.hidden = !panel.hidden; if (!panel.hidden) render(); };
  btn.addEventListener('click', toggle);
  addEventListener('keydown', e => { if (e.code === 'Backquote') toggle(); });

  let armed = false; // reset asks twice
  const act = {
    reset() {
      if (!armed) { armed = true; render(); return; }
      armed = false; api.reset(); render();
    },
    gold() { api.addGold(1000); },
    tp(i) { api.teleport(i); },
    toggleIsle(i) { api.toggleIsle(i); render(); },
    win() { api.matchWin(); },
    moves() { api.matchMoves(5); },
    special(t) { api.matchSpecial(t); },
    shuffle() { api.matchShuffle(); },
    sink() { api.sinkBoss(); },
    heal() { api.heal(); },
    god() { api.setImmortal(!api.immortal()); render(); },
    speed() { api.setSpeed(api.speed() === 1 ? 3 : 1); render(); },
    fps() { fps.hidden = !fps.hidden; render(); },
    time(h) { const a = api.atmo(); if (h === 'auto') a.auto = true; else { a.auto = false; a.setTime(h); } render(); },
    weather(w) { api.atmo().setWeather(w); render(); },
    quality(q) { api.post().setQuality(q); render(); },
    async copy() {
      const text = JSON.stringify({ ...api.state(), errors: errors.slice(-10), agent: navigator.userAgent, at: new Date().toISOString() }, null, 2);
      const out = panel.querySelector('#godOut');
      try { await navigator.clipboard.writeText(text); out.value = text; out.hidden = false; panel.querySelector('#godNote').textContent = 'Скопировано. Вставьте в чат.'; }
      catch (e) { out.value = text; out.hidden = false; out.select(); panel.querySelector('#godNote').textContent = 'Выделите текст ниже и скопируйте вручную.'; }
    },
  };

  function render() {
    const isles = api.isles();
    const inMatch = api.mode() === 'match';
    panel.innerHTML = `
      <header><b>God-меню</b><button type="button" class="ghost" data-a="close">✕</button></header>
      <section>
        <h3>Прогресс</h3>
        <div class="row">
          <button type="button" data-a="reset" class="${armed ? 'danger' : ''}">${armed ? 'Точно сбросить? Нажмите ещё раз' : 'Сбросить прогресс'}</button>
          <button type="button" data-a="gold">+1000 золота</button>
        </div>
        ${isles.map((i, k) => `<label class="chk"><input type="checkbox" id="godIsle${k}" data-a="toggleIsle" data-i="${k}" ${i.done ? 'checked' : ''}> ${i.name} пройден</label>`).join('')}
      </section>
      <section>
        <h3>Телепорт</h3>
        <div class="row">
          <button type="button" data-a="tp" data-i="start">Старт</button>
          ${isles.map((i, k) => `<button type="button" data-a="tp" data-i="${k}">${i.name}</button>`).join('')}
          <button type="button" data-a="tp" data-i="boss">«Каракатица»</button>
        </div>
      </section>
      <section${inMatch ? '' : ' class="off"'}>
        <h3>«Три в ряд»${inMatch ? '' : ' (откройте остров)'}</h3>
        <div class="row">
          <button type="button" data-a="win">Выиграть</button>
          <button type="button" data-a="moves">+5 ходов</button>
          <button type="button" data-a="special" data-i="${CANNON_ROW}">Ядро</button>
          <button type="button" data-a="special" data-i="${BARREL}">Бочка</button>
          <button type="button" data-a="special" data-i="${COMPASS}">Компас-бомба</button>
          <button type="button" data-a="shuffle">Перемешать</button>
        </div>
      </section>
      <section>
        <h3>Море и бой</h3>
        <div class="row">
          <button type="button" data-a="sink">Утопить «Каракатицу»</button>
          <button type="button" data-a="heal">Починить корабль</button>
          <button type="button" data-a="god" class="${api.immortal() ? 'on' : ''}">Бессмертие: ${api.immortal() ? 'вкл' : 'выкл'}</button>
          <button type="button" data-a="speed" class="${api.speed() > 1 ? 'on' : ''}">Скорость ×${api.speed()}</button>
          <button type="button" data-a="fps" class="${fps.hidden ? '' : 'on'}">FPS</button>
        </div>
      </section>
      <section>
        <h3>Графика</h3>
        ${(() => {
          const a = api.atmo(), q = api.post().quality, w = a.weatherAuto ? 'auto' : a.stormGoal >= 1 ? 'storm' : a.stormGoal > 0 ? 'cloudy' : 'clear';
          const b = (act, i, label, on) => `<button type="button" data-a="${act}" data-i="${i}" class="${on ? 'on' : ''}">${label}</button>`;
          return `
        <p class="note">Время: ${String(Math.floor(a.hour)).padStart(2, '0')}:${String(Math.floor(a.hour % 1 * 60)).padStart(2, '0')}</p>
        <div class="row">${b('time', 'auto', 'Сутки идут', a.auto)}${b('time', 6.3, 'Рассвет', false)}${b('time', 13, 'День', false)}${b('time', 18.1, 'Закат', false)}${b('time', 23, 'Ночь', false)}</div>
        <div class="row">${b('weather', 'auto', 'Погода сама', w === 'auto')}${b('weather', 'clear', 'Ясно', w === 'clear')}${b('weather', 'cloudy', 'Пасмурно', w === 'cloudy')}${b('weather', 'storm', 'Шторм', w === 'storm')}</div>
        <div class="row">${b('quality', 'low', 'Качество: низкое', q === 'low')}${b('quality', 'medium', 'среднее', q === 'medium')}${b('quality', 'high', 'высокое', q === 'high')}</div>`;
        })()}
      </section>
      <section>
        <h3>Для багрепорта</h3>
        <div class="row"><button type="button" data-a="copy">Скопировать состояние игры</button></div>
        <p class="note" id="godNote">Скопируйте и пришлите в чат вместе с описанием, что пошло не так.</p>
        <textarea id="godOut" rows="6" readonly hidden></textarea>
      </section>`;
  }

  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a, i = b.dataset.i;
    if (a === 'close') { panel.hidden = true; return; }
    if (a !== 'reset') armed = false;
    if (!act[a]) return;
    act[a](i === undefined ? undefined : isNaN(+i) ? i : +i);
  });
}

// Helpers for the match-3 board used by the menu.
export function putSpecial(match, t) {
  const b = match.board;
  const r = Math.floor(Math.random() * N), c = Math.floor(Math.random() * N);
  const tile = b.grid[r][c];
  const old = match.meshes.get(tile.id);
  match.boardGroup.remove(old);
  tile.t = t;
  match.addMesh(tile.id, t, r, c);
}
