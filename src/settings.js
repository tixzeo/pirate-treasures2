// Player settings from the pause menu: sound, picture, camera, hints. Kept apart from the game save,
// so «Начать заново» never resets them. Graphics quality stays where post.js keeps it ('quality').
export const SETTINGS_KEY = 'pirates2-settings';

// kind: a number range (min, max, step) or one of a few choices; def is the default.
export const SETTINGS = {
  master:    { min: 0, max: 1, step: .05, def: .8 },
  effects:   { min: 0, max: 1, step: .05, def: 1 },
  ambience:  { min: 0, max: 1, step: .05, def: .8 },
  muted:     { choices: [false, true], def: false },
  sharpness: { min: .5, max: 1, step: .05, def: 1 },    // share of the screen's own pixel density
  shadows:   { choices: [true, false], def: true },
  fpsCap:    { choices: [0, 30, 60], def: 0 },          // 0: as fast as the screen refreshes
  showFps:   { choices: [false, true], def: false },
  camSpeed:  { min: .25, max: 2.5, step: .05, def: 1 },  // how far a drag turns the view
  invertY:   { choices: [false, true], def: false },
  fov:       { min: 45, max: 75, step: 1, def: 55 },     // degrees, vertical
  hints:     { choices: [true, false], def: true },     // the key list along the bottom
};

export const defaults = () => Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, s.def]));

// Whatever comes in (an old version, a hand-edited value, garbage), out comes a full valid set.
export function sanitize(raw) {
  const out = defaults();
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, s] of Object.entries(SETTINGS)) {
    const v = raw[k];
    if (s.choices) { if (s.choices.includes(v)) out[k] = v; continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const snapped = s.min + Math.round((Math.min(s.max, Math.max(s.min, v)) - s.min) / s.step) * s.step;
    out[k] = +snapped.toFixed(4);
  }
  return out;
}

export function loadSettings(storage = globalThis.localStorage) {
  try { return sanitize(JSON.parse(storage.getItem(SETTINGS_KEY) || 'null')); } catch (e) { return defaults(); }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(sanitize(settings))); } catch (e) { /* private window: settings last this visit only */ }
}
