// Tiny tween runner driven by the main loop: tween(target, {x: 1}, 300).then(...)
const active = [];

export const ease = {
  linear: k => k,
  out: k => 1 - (1 - k) * (1 - k),
  inOut: k => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  back: k => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
  bounce: k => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + .75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + .9375;
    return n * (k -= 2.625 / d) * k + .984375;
  },
};

export function tween(target, to, ms, fn = ease.out) {
  return new Promise(resolve => {
    const from = {};
    for (const k in to) from[k] = target[k];
    active.push({ target, from, to, ms: Math.max(1, ms), t: 0, fn, resolve });
  });
}

export const wait = ms => tween({ v: 0 }, { v: 1 }, ms, ease.linear);

export function updateTweens(dtMs) {
  for (let i = active.length - 1; i >= 0; i--) {
    const a = active[i];
    a.t += dtMs;
    const k = Math.min(1, a.t / a.ms), e = a.fn(k);
    for (const key in a.to) a.target[key] = a.from[key] + (a.to[key] - a.from[key]) * e;
    if (k >= 1) { active.splice(i, 1); a.resolve(); }
  }
}
