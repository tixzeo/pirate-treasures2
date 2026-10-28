// The wind over the sea and what it does to a square-rigged ship: how hard the sails drive her
// on each point of sail and how far she heels. Angles use Vessel.heading's frame (0 means towards -Z);
// the wind's angle is where it blows TO, so a ship with that heading runs dead before it.
export const WIND = Object.freeze({
  calm: 7,          // m/s, a fresh breeze: the sail speeds are tuned for it
  storm: 18,        // m/s, a gale
  gust: .15,        // share of the speed that comes and goes
  shift: 240,       // seconds between shifts: like Sea of Thieves, every few minutes the wind swings to a new quarter
  swingTime: 45,    // seconds a shift takes, so the sails have time to follow
  swing: [45, 150], // degrees one shift turns it, either way
  strength: .25,    // share each shift can freshen or ease the wind by
  veer: 8 * Math.PI / 180,  // the small wander on top, either way
  noGo: .3,         // drive left when pointing into the wind: sails aback, she only creeps
  heel: 3.2,        // heel per unit of side pressure, before the hull's limit
  leeway: .05,      // sideways slip per m/s of wind across the hull with all sails set
  base: -.45,       // where the wind blows at the start: from astern towards the first island (islands.js)
  tack: 60 * Math.PI / 180,  // closest a captain steers to the wind
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;
const hash = k => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Where the wind settles after each shift (k = 0 is the start) and how strong it is there.
function settled(k, base) {
  let toward = base;
  for (let i = 1; i <= k; i++) {
    const a = hash(i), turn = (WIND.swing[0] + (WIND.swing[1] - WIND.swing[0]) * hash(i + .5)) * DEG;
    toward = wrap(toward + (a < .5 ? -turn : turn));
  }
  return { toward, strength: k ? 1 + WIND.strength * (2 * hash(k + .25) - 1) : 1 };
}

// The wind at a moment: deterministic, so a reload or a replay sees the same weather.
// storm 0..1 from the atmosphere, base where it blows at first. Returns { toward, speed, shift, shifting }:
// radians and m/s, the number of the shift it is on and whether it is swinging right now.
export function windAt(t, storm = 0, base = 0) {
  const s = clamp(Number.isFinite(storm) ? storm : 0, 0, 1);
  const time = Math.max(0, Number.isFinite(t) ? t : 0);
  const k = Math.floor(time / WIND.shift), into = (time - k * WIND.shift) / WIND.swingTime;
  const now = settled(k, base), before = k ? settled(k - 1, base) : now, f = smooth(clamp(into, 0, 1));
  const veer = WIND.veer * (Math.sin(time * .021) + .5 * Math.sin(time * .057 + 1.3)) / 1.5;
  const toward = wrap(before.toward + wrap(now.toward - before.toward) * f + veer);
  const gust = Math.sin(time * .9) * Math.sin(time * .37 + 2) * (1 + s);
  const strength = before.strength + (now.strength - before.strength) * f;
  const speed = (WIND.calm * strength + (WIND.storm - WIND.calm * strength) * s) * (1 + WIND.gust * gust);
  return { toward, speed: Math.max(0, speed), shift: k, shifting: k > 0 && into < 1 };
}

// 0 with the bow straight into the wind, π running straight before it.
export const offWind = (heading, toward) => Math.PI - Math.abs(wrap(heading - toward));

// How hard square sails drive on each point of sail, as a share of the tuned speed.
// A brig cannot point higher than about 60° off the wind; she is fastest on a broad reach.
// Running dead before it is the tuned speed; a broad reach is the best she can do.
const POLAR = [[0, WIND.noGo], [45, WIND.noGo], [62, .55], [90, .95], [130, 1.1], [180, 1]];
export function sailDrive(off) {
  const deg = clamp(Number.isFinite(off) ? Math.abs(off) : 0, 0, Math.PI) / DEG;
  for (let i = 1; i < POLAR.length; i++) {
    const [a0, v0] = POLAR[i - 1], [a1, v1] = POLAR[i];
    if (deg <= a1) return v0 + (v1 - v0) * smooth((deg - a0) / (a1 - a0));
  }
  return POLAR[POLAR.length - 1][1];
}

// A light air slows her; a fresh breeze or more is all the hull can use, so a gale is no faster.
export const windSpeedFactor = speed => clamp(Math.sqrt(Math.max(0, speed) / WIND.calm), .6, 1);

// Heel from the wind pressing on the sails, in radians: positive leans to port (wind on the starboard side).
// Nothing when running before the wind or with the sails furled; strongest on a beam reach in a gale.
export function windHeel(heading, wind, sails) {
  const across = Math.sin(wrap(wind.toward - heading));  // > 0: blowing towards port, from starboard
  const pressure = (wind.speed / WIND.storm) ** 2;
  return WIND.heel * clamp(sails, 0, 1) * pressure * across * .1;
}

// Where the wind pushes a hull sideways, in m/s towards starboard (positive) or port, before the keel resists.
export function leeway(heading, wind, sails) {
  return -Math.sin(wrap(wind.toward - heading)) * wind.speed * WIND.leeway * clamp(sails, 0, 1);
}


// The heading to steer for a goal the wind may not allow: inside the no-go zone, the nearer tack.
export function tackFor(goal, toward) {
  const from = wrap(toward + Math.PI), off = wrap(goal - from);
  if (Math.abs(off) >= WIND.tack) return goal;
  return wrap(from + (off >= 0 ? WIND.tack : -WIND.tack));
}

// What sailors call the course relative to the wind.
export function pointOfSail(off) {
  const deg = Math.abs(off) / DEG;
  if (deg < 55) return 'Левентик';
  if (deg < 80) return 'Бейдевинд';
  if (deg < 105) return 'Галфвинд';
  if (deg < 160) return 'Бакштаг';
  return 'Фордевинд';
}

// The world's wind, advanced every step.
export class Wind {
  constructor(base = WIND.base) { this.base = base; this.time = 0; this.toward = base; this.speed = WIND.calm; this.shift = 0; this.shifting = false; }
  update(dt, storm) {
    this.time += Math.max(0, dt) || 0;
    Object.assign(this, windAt(this.time, storm, this.base));
    return this;
  }
}
