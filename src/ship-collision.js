import { SHIP_RULES } from './ship-config.js';

// Distance from an island centre to the hull's centre segment (XZ plane).
export function coastDistance(pos, heading, reach, centre) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  const t = Math.max(-reach, Math.min(reach, (centre.x - pos.x) * fx + (centre.z - pos.z) * fz));
  const x = pos.x + fx * t - centre.x, z = pos.z + fz * t - centre.z;
  return { x, z, distance: Math.hypot(x, z) };
}

export function coastPush(pos, heading, coast, centre, shore) {
  const d = coastDistance(pos, heading, coast.reach, centre);
  const overlap = shore + coast.radius - d.distance;
  if (overlap <= 0) return null;
  // Move sideways when the island centre lies exactly on the centre segment.
  const x = d.distance > 1e-8 ? d.x / d.distance : Math.cos(heading);
  const z = d.distance > 1e-8 ? d.z / d.distance : -Math.sin(heading);
  return { x: x * overlap, z: z * overlap };
}

// Separating axis test: full hull rectangle against a pier rectangle. Handles
// diagonal approaches and pier ends without gaps between three sample points.
export function pierPush(pos, heading, { length, width }, pier, pierLength, pierWidth) {
  const f = { x: -Math.sin(heading), z: -Math.cos(heading) };
  const r = { x: Math.cos(heading), z: -Math.sin(heading) };
  const centre = { x: pier.root.x + pier.dir.x * pierLength / 2, z: pier.root.z + pier.dir.z * pierLength / 2 };
  const delta = { x: pos.x - centre.x, z: pos.z - centre.z };
  const dot = (a, b) => a.x * b.x + a.z * b.z;
  let best = null;
  for (const axis of [pier.side, pier.dir, r, f]) {
    const shipExtent = Math.abs(dot(axis, f)) * length / 2 + Math.abs(dot(axis, r)) * (width / 2 + SHIP_RULES.pierGap);
    const pierExtent = Math.abs(dot(axis, pier.dir)) * pierLength / 2 + Math.abs(dot(axis, pier.side)) * pierWidth / 2;
    const separation = dot(delta, axis), overlap = shipExtent + pierExtent - Math.abs(separation);
    if (overlap <= 1e-8) return null;
    if (!best || overlap < best.overlap) best = { axis, overlap, sign: Math.sign(separation) || 1 };
  }
  return { x: best.axis.x * best.overlap * best.sign, z: best.axis.z * best.overlap * best.sign };
}
