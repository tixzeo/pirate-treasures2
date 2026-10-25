// Pure ship-local locomotion. No scene, DOM, ship class or animation dependency.
export const WALK = Object.freeze({ radius: .32, height: 1.75, edgeMargin: .18, speed: 2.4, maxDt: .1 });

const finiteBounds = b => b?.min?.length === 3 && b?.max?.length === 3 && [...b.min, ...b.max].every(Number.isFinite);

export function makeDeckZone(navigation, extraObstacles = []) {
  const surface = navigation?.space === 'ship-local' && navigation.surfaces?.find(s => s.kind === 'deck');
  if (!finiteBounds(surface?.bounds) || !surface.outline || surface.outline.length < 3 ||
      !surface.outline.every(p => p.length === 2 && p.every(Number.isFinite))) return null;
  const floor = surface.bounds.max[1];
  // Close stairs/quarterdeck/cabin as one aft boundary. Do not let a doorway in
  // the cabin walls imply that this first prototype supports interior walking.
  const aft = Math.min(surface.bounds.max[2], ...navigation.surfaces.filter(s => s.kind === 'step' || s.kind === 'quarterdeck').map(s => s.bounds.min[2]));
  const obstacles = [...(navigation.obstacles ?? []), ...extraObstacles].filter(o => finiteBounds(o.bounds) &&
    o.bounds.max[1] > floor + .06 && o.bounds.min[1] < floor + WALK.height).map(o => o.bounds);
  return { surface: surface.name, floor, aft, bounds: surface.bounds, outline: surface.outline, obstacles };
}

export function deckClear(zone, x, z) {
  if (!zone || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const inset = WALK.radius + WALK.edgeMargin;
  if (z > zone.aft - inset) return false;
  const points = zone.outline;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1];
    if (dx * (z - a[1]) - dz * (x - a[0]) < inset * Math.hypot(dx, dz) - 1e-8) return false;
  }
  for (const b of zone.obstacles) {
    const dx = x - Math.max(b.min[0], Math.min(b.max[0], x));
    const dz = z - Math.max(b.min[2], Math.min(b.max[2], z));
    if (dx * dx + dz * dz < WALK.radius ** 2 - 1e-9) return false;
  }
  return true;
}

export function findDeckSpawn(zone, preferred) {
  if (!zone) return null;
  if (preferred && deckClear(zone, preferred.x, preferred.z)) return { x: preferred.x, y: zone.floor, z: preferred.z, surface: zone.surface };
  const b = zone.bounds, cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + Math.min(b.max[2], zone.aft)) / 2;
  let best = null, distance = Infinity;
  for (let z = b.min[2] + .5; z < zone.aft; z += .25) for (let x = b.min[0] + .5; x < b.max[0]; x += .25) {
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < distance && deckClear(zone, x, z)) { distance = d; best = { x, y: zone.floor, z, surface: zone.surface }; }
  }
  return best;
}

export class DeckWalker {
  constructor(zone, preferred) { this.zone = zone; this.position = findDeckSpawn(zone, preferred); this.moving = false; this.facing = Math.PI; }

  update(dt, x, z) {
    this.moving = false;
    if (!this.position || ![dt, x, z].every(Number.isFinite) || dt <= 0) return;
    const length = Math.hypot(x, z); if (length < .08) return;
    const scale = WALK.speed * Math.min(dt, WALK.maxDt) / Math.max(1, length);
    const dx = x * scale, dz = z * scale, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (WALK.radius * .4)));
    const p = this.position, before = { x: p.x, z: p.z };
    for (let i = 0; i < steps; i++) {
      // Axis-separated substeps slide along an obstacle rather than pushing the
      // capsule through it; each step is smaller than its collision radius.
      if (deckClear(this.zone, p.x + dx / steps, p.z)) p.x += dx / steps;
      if (deckClear(this.zone, p.x, p.z + dz / steps)) p.z += dz / steps;
    }
    const mx = p.x - before.x, mz = p.z - before.z;
    this.moving = Math.hypot(mx, mz) > 1e-6;
    if (this.moving) this.facing = Math.atan2(mx, mz);
  }
}

// One routing function is shared by keyboard and touch. Deck controls never
// write a new sail setting or feed walking intent into the ship's rudder.
export function seaIntent(mode, keys, stick, throttle) {
  const axis = (positive, negative) => Number(positive.some(k => keys.has(k))) - Number(negative.some(k => keys.has(k)));
  if (mode === 'deck') return { throttle, rudder: 0,
    walkX: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) + (stick?.x ?? 0),
    walkZ: axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) + (stick?.y ?? 0) };
  const side = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
  return { throttle, rudder: side || -(stick?.x ?? 0), walkX: 0, walkZ: 0 };
}
