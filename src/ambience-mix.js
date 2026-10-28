// How loud the sea around the ship should be, as plain numbers: the player in ambience.js turns them into sound,
// the tests check them without a browser.
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Recordings in public/sounds (sources and licences in public/sounds/CREDITS.md).
// Loops play all the time at a changing volume, shots are single calls picked at random.
export const LOOPS = ['hull', 'bow', 'surf', 'rigging', 'rigging-strong', 'sails', 'storm'];
export const SHOTS = { creak: 4, gull: 4 };
export const shotFiles = name => Array.from({ length: SHOTS[name] }, (_, i) => `${name}-${i + 1}`);
export const SILENT = Object.freeze(Object.fromEntries(LOOPS.map(n => [n, 0])));

// Shore noise starts to show at 120 m and is full at the waterline.
export const SURF_FAR = 120, SURF_NEAR = 10;
export const shoreNear = distance => 1 - smooth(SURF_NEAR, SURF_FAR, distance);

// The wind the crew feels: the weather plus the ship's own way through the air.
export const feltWind = (speed, storm) => clamp01(.2 + .45 * clamp01(Math.abs(speed)) + .8 * clamp01(storm));

// scene: 'sea' at the helm or on deck, 'island' on the shore, anything else is silence.
// speed is the share of top speed, sails the sail setting 0..1, storm 0..1, shore in metres.
export function loopLevels({ scene, speed = 0, sails = 0, storm = 0, shore = Infinity }) {
  const s = clamp01(Math.abs(speed)), st = clamp01(storm), wind = feltWind(s, st);
  if (scene === 'island') return { ...SILENT, surf: .8, rigging: .25 * (1 - st), 'rigging-strong': .5 * st, storm: .5 * st };
  if (scene !== 'sea') return { ...SILENT };
  return {
    hull: .45 + .25 * st,                           // water slapping the planks, there even at anchor
    bow: Math.min(1, s ** 1.3 * .95 + .2 * st),    // the bow wave only exists with way on
    surf: .9 * shoreNear(shore),
    rigging: .6 * (1 - smooth(.45, .8, wind)),       // rattle of blocks and lines in a light air...
    'rigging-strong': .9 * smooth(.35, .9, wind),    // ...that turns into a whistle as it freshens
    sails: clamp01(sails) * (.25 + .5 * s),
    storm: st,
  };
}

// The hull creaks when it is worked: rolling, pitching, the rudder biting, a heavy sea.
// rollRate and pitchRate in radians per second, helmRate in wheel turns per second.
export function creakRate({ rollRate = 0, pitchRate = 0, helmRate = 0, speed = 0, storm = 0 }) {
  const strain = clamp01(Math.abs(rollRate) * 4 + Math.abs(pitchRate) * 4 + Math.abs(helmRate) * clamp01(Math.abs(speed)) * .8 + clamp01(storm) * .5);
  return { perSecond: .07 + .9 * strain, volume: .35 + .65 * strain };
}
export const CREAK_GAP = 1.2; // never two creaks closer than this, in seconds

// A gull calls now and then by day and keeps quiet at night and in a storm. distance is from the camera, in metres.
export const GULL_RANGE = 140;
export function gullRate({ night = 0, storm = 0, distance = Infinity }) {
  if (!(distance <= GULL_RANGE)) return 0;
  return .07 * (1 - clamp01(night)) * (1 - clamp01(storm));
}
export const GULL_GAP = 2.5; // per gull, in seconds
export const MAX_GULLS = 2;  // calls heard at once

// Chance that an event with this rate happens within dt.
export const chance = (perSecond, dt) => 1 - Math.exp(-Math.max(0, perSecond) * Math.max(0, dt));
