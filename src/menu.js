// The pause menu: Esc or the «Меню» button. Continue, settings, the key list, start over.
// It only draws and reports: main.js decides what pausing, a setting or a restart means for the game.
import './menu.css';
import { SETTINGS } from './settings.js';

const TABS = [
  ['sound', 'Звук', [
    ['master', 'Общая громкость', 'percent'],
    ['effects', 'Пушки и всплески', 'percent'],
    ['ambience', 'Море и ветер', 'percent'],
    ['muted', 'Звук', 'toggle', ['Включён', 'Выключен']],
  ]],
  ['picture', 'Графика', [
    ['quality', 'Качество', 'choice', [['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое']]],
    ['sharpness', 'Чёткость', 'percent'],
    ['shadows', 'Тени', 'toggle', ['Есть', 'Нет']],
    ['fpsCap', 'Ограничение кадров', 'choice', [[30, '30'], [60, '60'], [0, 'Нет']]],
    ['showFps', 'Счётчик кадров', 'toggle', ['Скрыт', 'Показан']],
  ]],
  ['camera', 'Камера', [
    ['camSpeed', 'Чувствительность', 'times'],
    ['invertY', 'Вертикаль', 'toggle', ['Обычная', 'Инверсия']],
    ['fov', 'Угол обзора', 'degrees'],
  ]],
  ['hud', 'Интерфейс', [
    ['hints', 'Подсказки клавиш', 'toggle', ['Показаны', 'Скрыты']],
  ]],
];

const KEYS = [
  ['W / S или ↑ / ↓', 'Паруса на шаг больше / меньше'],
  ['A / D или ← / →', 'Руль'],
  ['Q / E', 'Залп левым / правым бортом'],
  ['Enter или пробел', 'Швартовка у острова'],
  ['F', 'Пройтись по палубе / вернуться к штурвалу'],
  ['Мышь: тянуть', 'Повернуть камеру'],
  ['Колесо мыши', 'Приблизить / отдалить'],
  ['Esc', 'Пауза и это меню'],
];

const shown = {
  percent: v => `${Math.round(v * 100)}%`,
  times: v => `×${v.toFixed(2).replace(/0$/, '')}`,
  degrees: v => `${v}°`,
};

// opts: settings (current values), quality() and the callbacks onChange(key, value), onOpen(), onClose(), onRestart().
export function createMenu(opts) {
  const root = document.createElement('div');
  root.className = 'pause';
  root.hidden = true;
  root.innerHTML = `
    <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
      <section data-page="main">
        <h1 id="pauseTitle">Пауза</h1>
        <div class="pause-list">
          <button type="button" data-go="resume">Продолжить</button>
          <button type="button" data-go="settings">Настройки</button>
          <button type="button" data-go="keys">Управление</button>
          <button type="button" data-go="restart" class="pause-danger">Начать заново</button>
        </div>
      </section>
      <section data-page="settings" hidden>
        <h1>Настройки</h1>
        <div class="pause-tabs" role="tablist">${TABS.map(([id, name]) => `<button type="button" role="tab" data-tab="${id}">${name}</button>`).join('')}</div>
        ${TABS.map(([id, , rows]) => `<div class="pause-rows" data-panel="${id}" hidden>${rows.map(row).join('')}</div>`).join('')}
        <div class="pause-foot"><button type="button" class="ghost" data-go="defaults">Сбросить настройки</button><button type="button" data-go="main">Назад</button></div>
      </section>
      <section data-page="keys" hidden>
        <h1>Управление</h1>
        <dl class="pause-keys">${KEYS.map(([k, what]) => `<dt>${k}</dt><dd>${what}</dd>`).join('')}</dl>
        <div class="pause-foot"><button type="button" data-go="main">Назад</button></div>
      </section>
      <section data-page="restart" hidden>
        <h1>Начать заново?</h1>
        <p>Пропадут золото, пройденные острова и победа над Шрамом. Настройки останутся.</p>
        <div class="pause-foot"><button type="button" class="ghost" data-go="main">Отмена</button><button type="button" class="pause-danger" data-go="restart-yes">Начать заново</button></div>
      </section>
    </div>`;
  document.body.appendChild(root);

  const fps = document.createElement('div');
  fps.className = 'pause-fps';
  fps.hidden = true;
  document.body.appendChild(fps);

  function row([key, label, kind, extra]) {
    if (kind === 'toggle' || kind === 'choice') {
      const choices = kind === 'toggle' ? SETTINGS[key].choices.map((v, i) => [v, extra[i]]) : extra;
      return `<div class="pause-row"><span>${label}</span><div class="pause-seg" data-key="${key}">${
        choices.map(([v, name]) => `<button type="button" data-value='${JSON.stringify(v)}'>${name}</button>`).join('')}</div></div>`;
    }
    const s = SETTINGS[key];
    return `<label class="pause-row"><span>${label}</span><input type="range" data-key="${key}" data-kind="${kind}" min="${s.min}" max="${s.max}" step="${s.step}"><output></output></label>`;
  }

  const values = () => ({ ...opts.settings, quality: opts.quality() });
  function refresh() {
    const v = values();
    for (const input of root.querySelectorAll('input[type=range]')) {
      input.value = v[input.dataset.key];
      input.nextElementSibling.textContent = shown[input.dataset.kind](+input.value);
    }
    for (const seg of root.querySelectorAll('.pause-seg'))
      for (const b of seg.children) b.setAttribute('aria-pressed', String(JSON.parse(b.dataset.value) === v[seg.dataset.key]));
  }

  let tab = 'sound';
  function page(name) {
    for (const s of root.querySelectorAll('[data-page]')) s.hidden = s.dataset.page !== name;
    if (name === 'settings') pickTab(tab);
    root.querySelector(`[data-page="${name}"] button`)?.focus({ preventScroll: true });
  }
  function pickTab(id) {
    tab = id;
    for (const b of root.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
    for (const p of root.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== id;
    refresh();
  }

  root.addEventListener('input', e => {
    const input = e.target.closest('input[type=range]'); if (!input) return;
    opts.onChange(input.dataset.key, +input.value);
    refresh();
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) return pickTab(b.dataset.tab);
    const seg = b.closest('.pause-seg');
    if (seg) { opts.onChange(seg.dataset.key, JSON.parse(b.dataset.value)); refresh(); return; }
    const go = b.dataset.go;
    if (go === 'resume') close();
    else if (go === 'restart-yes') { close(); opts.onRestart(); }
    else if (go === 'defaults') { for (const [k, s] of Object.entries(SETTINGS)) opts.onChange(k, s.def); refresh(); }
    else if (go) page(go);
  });
  // A click on the dim backdrop is the same as «Продолжить».
  root.addEventListener('pointerdown', e => { if (e.target === root) close(); });

  function open() {
    if (!root.hidden) return;
    root.querySelector('[data-go="restart"]').hidden = !opts.canRestart();
    page('main');
    root.hidden = false;
    opts.onOpen();
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    opts.onClose();
  }
  // Esc steps back a page, and from the first page closes the menu.
  function back() {
    const at = root.querySelector('[data-page]:not([hidden])')?.dataset.page;
    if (at && at !== 'main') page('main'); else close();
  }

  // The frame counter the settings can switch on.
  let frames = 0, last = performance.now();
  function tickFps() {
    if (fps.hidden) return;
    frames++;
    const now = performance.now();
    if (now - last > 500) { fps.textContent = `${Math.round(frames * 1000 / (now - last))} FPS`; frames = 0; last = now; }
  }

  return {
    get isOpen() { return !root.hidden; },
    open, close, back,
    toggle() { if (root.hidden) open(); else back(); },
    showFps(v) { fps.hidden = !v; frames = 0; last = performance.now(); if (v) fps.textContent = '… FPS'; },
    tickFps,
  };
}
