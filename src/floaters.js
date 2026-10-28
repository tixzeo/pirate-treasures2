// Things afloat (barrels, planks, wreckage): their own slow set, the wind on what stands out of the water,
// and the ships that shoulder them aside and stir them in their wake.
export const FLOAT = Object.freeze({
  windage: .035,     // share of the wind's speed a floating barrel drifts at
  settle: 2.5,       // seconds for a shoved thing to slow back to the drift
  margin: .6,        // m beyond the hull's side where it still gets shouldered
  shove: .3,         // sideways m/s per m/s of the ship's speed when the hull meets it
  wake: 2.5,         // hull lengths behind her that the wake still stirs
  wakePush: .25,     // sideways acceleration in the wake per m/s of her speed
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// f: { m: { position }, drift: { x, z } }; gains f.vel. ships: Vessels (pos, heading, length, width, speed).
export function driftFloater(f, dt, wind, ships = []) {
  if (!(dt > 0)) return;
  const p = f.m.position;
  if (!f.vel) f.vel = { x: f.drift.x, z: f.drift.z };
  const blow = wind ? wind.speed * FLOAT.windage : 0;
  const tx = f.drift.x - (wind ? Math.sin(wind.toward) : 0) * blow, tz = f.drift.z - (wind ? Math.cos(wind.toward) : 0) * blow;
  const settle = 1 - Math.exp(-dt / FLOAT.settle);
  f.vel.x += (tx - f.vel.x) * settle; f.vel.z += (tz - f.vel.z) * settle;
  for (const s of ships) {
    const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading), rx = -fz, rz = fx;
    const dx = p.x - s.pos.x, dz = p.z - s.pos.z, along = dx * fx + dz * fz, across = dx * rx + dz * rz;
    const half = s.length / 2, beam = s.width / 2 + FLOAT.margin, side = Math.sign(across) || 1, speed = Math.abs(s.speed);
    if (Math.abs(along) < half && Math.abs(across) < beam) {
      // The hull meets it: out to her side at once, and away with a shove, harder at the bow.
      p.x += rx * (side * beam - across); p.z += rz * (side * beam - across);
      const shove = .5 + speed * FLOAT.shove * (along > 0 ? 1 : .4), ahead = along > half * .5 ? s.speed * .15 : 0;
      f.vel.x += rx * side * shove + fx * ahead; f.vel.z += rz * side * shove + fz * ahead;
      f.spin = (f.spin ?? 0) + side * .4;
    } else if (along < -half && along > -half - s.length * FLOAT.wake) {
      // In the wake, which spreads as it falls astern: pushed out to the sides and drawn a little after her.
      const back = (-half - along) / (s.length * FLOAT.wake);
      if (Math.abs(across) < s.width * (.6 + back * 1.4)) {
        const push = speed * (1 - back) * dt;
        f.vel.x += (rx * side * FLOAT.wakePush + fx * .1) * push; f.vel.z += (rz * side * FLOAT.wakePush + fz * .1) * push;
      }
    }
  }
  p.x += f.vel.x * dt; p.z += f.vel.z * dt;
  if (f.spin) f.spin = clamp(f.spin, -1.5, 1.5);
}
