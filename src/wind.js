// The wind over the sea and what it does to a square-rigged ship: how hard the sails drive her
// on each point of sail and how far she heels. Angles use Vessel.heading's frame (0 means towards -Z);
// the wind's angle is where it blows TO, so a ship with that heading runs dead before it.
export const WIND = Object.freeze({
  calm: 7,          // m/s, a fresh breeze: the existing sail speeds are tuned for it
  storm: 18,        // m/s, a gale
  gust: .15,        // share of the speed that comes and goes
  veer: .35,        // radians the wind swings either way over a few minutes
  period: 300,      // seconds for one slow swing
  noGo: .3,         // drive left when pointing into the wind: sails aback, she only creeps
  heel: 3.2,        // heel per unit of side pressure, before the hull's limit
  leeway: .05,      // sideways slip per m/s of wind across the hull with all sails set
  base: -.45,       // where the wind blows on average: from astern on the voyage out (islands.js)
  tack: 60 * Math.PI / 180,  // closest a captain steers to the wind
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;

// The wind at a moment: deterministic, so a reload or a replay sees the same weather.
// storm 0..1 from the atmosphere, base the direction it swings around. Returns { toward, speed } in radians and m/s.
export function windAt(t, storm = 0, base = 0) {
  const s = clamp(Number.isFinite(storm) ? storm : 0, 0, 1);
  const time = Number.isFinite(t) ? t : 0;
  const swing = Math.sin(time * 2 * Math.PI / WIND.period) + .4 * Math.sin(time * 2 * Math.PI / (WIND.period * .37) + 1.3);
  const gust = Math.sin(time * .9) * Math.sin(time * .37 + 2) * (1 + s);
  const speed = (WIND.calm + (WIND.storm - WIND.calm) * s) * (1 + WIND.gust * gust);
  return { toward: wrap(base + WIND.veer * swing / 1.4), speed: Math.max(0, speed) };
}

// 0 with the bow straight into the wind, π running straight before it.
export const offWind = (heading, toward) => Math.PI - Math.abs(wrap(heading - toward));

// How hard square sails drive on each point of sail, as a share of the tuned speed.
// A brig cannot point higher than about 60° off the wind; she is fastest on a broad reach.
// Running dead before it is the speed the sails were tuned for, so the old routes keep their pace.
const POLAR = [[0, WIND.noGo], [45, WIND.noGo], [62, .55], [90, .95], [130, 1.1], [180, 1]];
export function sailDrive(off) {
  const deg = clamp(Number.isFinite(off) ? Math.abs(off) : 0, 0, Math.PI) / DEG;
  for (let i = 1; i < POLAR.length; i++) {
    const [a0, v0] = POLAR[i - 1], [a1, v1] = POLAR[i];
    if (deg <= a1) return v0 + (v1 - v0) * smooth((deg - a0) / (a1 - a0));
  }
  return POLAR[POLAR.length - 1][1];
}

// More wind, more speed, but a hull has a limit: a quarter more at most in a gale, less in a light air.
export const windSpeedFactor = speed => clamp(Math.sqrt(Math.max(0, speed) / WIND.calm), .6, 1.25);

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
  constructor(base = WIND.base) { this.base = base; this.time = 0; this.toward = base; this.speed = WIND.calm; }
  update(dt, storm) {
    this.time += Math.max(0, dt) || 0;
    Object.assign(this, windAt(this.time, storm, this.base));
    return this;
  }
}
