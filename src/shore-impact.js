export const SHORE_IMPACT = Object.freeze({ minSpeed: 2, cooldown: 1.2, baseDamage: 4, perSpeed: 2, maxDamage: 25 });

export function shoreDamage(speed) {
  const s = Math.abs(speed);
  if (!Number.isFinite(s) || s <= SHORE_IMPACT.minSpeed) return 0;
  return Math.min(SHORE_IMPACT.maxDamage, SHORE_IMPACT.baseDamage + Math.floor((s - SHORE_IMPACT.minSpeed) * SHORE_IMPACT.perSpeed));
}

// A sustained contact must not charge damage once per frame. Gentle touches do
// not consume the cooldown; a later genuine impact can still register.
export class ShoreImpact {
  constructor() { this.reset(); }
  reset() { this.lastAt = -Infinity; }
  sample(speed, time, immortal = false) {
    const damage = shoreDamage(speed);
    if (!damage || !Number.isFinite(time) || time - this.lastAt < SHORE_IMPACT.cooldown) return null;
    this.lastAt = time;
    return { damage: immortal ? 0 : damage, speed: Math.abs(speed) };
  }
}
