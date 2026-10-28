// Metres in ship-local coordinates: Y up, bow towards -Z. Only the player is resized.
export const BRIGANTINE = Object.freeze({
  length: 22,
  deckWidth: 4.4,
  referenceLength: 14,
  handling: Object.freeze({ hp: 100, maxSpeed: 15.2, turnRate: .25 }),   // knots running: 20 in a fresh breeze, ~23 fair weather at most, ~30 in a gale
});

// Native 32m V6 brig with authored UV textures. Only this class is replaced.
// Legacy BRIGANTINE remains available for TASK 001 regression checks.
export const PLAYER_SHIP = Object.freeze({
  model: 'morskoy_strannik_v6', class: 'brig', length: 32, referenceLength: 14,
  handling: BRIGANTINE.handling,
});

export const MORSKOY_STERN = Object.freeze({ rise: 2.4, helmScale: .55, standGap: .7 });

// Keep weapon tuning and mooring tolerances independent of the visual scale.
export const SHIP_RULES = Object.freeze({
  berthGap: .6,
  pierGap: .1,
  shoreGap: .2,
  muzzleGap: .6,
  moor: Object.freeze({ dist: 3, ang: 12 * Math.PI / 180, speed: 2.5 / 1.94 }),
});

export function shipMetrics({ length, width, referenceLength = length }) {
  const scale = length / referenceLength;
  return {
    // A conservative capsule for the coast, a full oriented hull box for piers.
    coast: { radius: width / 2 + SHIP_RULES.shoreGap, reach: Math.max(0, length / 2 - width / 2) },
    hit: { halfLength: length / 2 + .4, halfWidth: width / 2 + .5, minY: -2 * scale, maxY: 4 * scale },
    camera: {
      back: 26 * scale, up: 10 * scale, battleBack: 34 * scale, battleUp: 15 * scale,
      ahead: 10 * scale, lookY: 2 * scale, minY: 4 * scale,
      resetBack: 30 * scale, teleportBack: 28 * scale, teleportUp: 12 * scale,
    },
    lamp: { y: 2.4 * scale, z: 3.5 * scale, distance: 22 * scale },
  };
}
