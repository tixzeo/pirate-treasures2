// Angular inertia only: vertical support follows the current spatially averaged
// water plane. A temporal heave filter would keep a ship high after a trough.
export class HullMotion {
  constructor() { this.ready = false; }
  update(dt, { heave, pitch, roll, heel }, length) {
    const weight = Math.sqrt(Math.max(8, length) / 32);
    const target = { heave, pitch: Math.max(-.1, Math.min(.1, pitch)),
      roll: Math.max(-.16, Math.min(.16, roll * .65 + Math.max(-.1, Math.min(.1, heel)))) };
    this.heave = heave;
    for (const key of ['pitch', 'roll']) {
      const tau = .9 * weight;
      this[key] = this.ready ? this[key] + (target[key] - this[key]) * (1 - Math.exp(-Math.max(0, dt) / tau)) : target[key];
    }
    this.ready = true;
    return this;
  }
}
