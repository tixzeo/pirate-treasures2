// Progress kept in the browser between sessions. Yandex cloud saves can replace this later.
const KEY = 'pirates2-save';
const EMPTY = { gold: 0, done: [], bossBeaten: false };

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.done)) return { ...EMPTY, ...s };
  } catch (e) { /* storage may be blocked */ }
  return { ...EMPTY, done: [] };
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage may be blocked */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage may be blocked */ }
}
