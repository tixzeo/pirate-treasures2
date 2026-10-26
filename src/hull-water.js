// Fit the water plane over the hull footprint instead of delaying the ship's
// vertical response. Spatial averaging rejects short chop without phase lag.
// Coordinates are metres, heading 0 faces -Z; draft is the existing 30cm offset.
export function sampleHullWater(height, { x, z, heading, length, width }, time) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  let sum = 0, fore = 0, side = 0, foreSq = 0, sideSq = 0, count = 0;
  for (const u of [-.4, -.2, 0, .2, .4]) {
    const along = u * length, beam = width * .42 * Math.sqrt(1 - (u / .5) ** 2);
    for (const v of [-1, 0, 1]) {
      const across = v * beam, h = height(x + fx * along + rx * across, z + fz * along + rz * across, time);
      sum += h; fore += along * h; side += across * h;
      foreSq += along * along; sideSq += across * across; count++;
    }
  }
  return { heave: sum / count - .3, pitch: Math.atan(fore / foreSq), roll: Math.atan(side / sideSq) * .8 };
}
