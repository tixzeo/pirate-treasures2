// World-space foam history; the shader only draws these bounded, fading patches.
// Keeping emission time-based lets low FPS retain the same spacing and lifetime.
export const WAKE = Object.freeze({ capacity: 28, lifetime: 6, interval: .45, minSpeed: 1 });
const mix = (a, b, t) => a + (b - a) * t;

export class WakeTrail {
  constructor() { this.clear(); }
  clear() { this.points = []; this.tracks = new Map(); this.time = 0; }

  emit(p, born, key) {
    const direction = Math.sign(p.speed), fx = -Math.sin(p.heading) * direction, fz = -Math.cos(p.heading) * direction;
    this.points.push({ x: p.x - fx * p.length * .45, z: p.z - fz * p.length * .45,
      fx, fz, width: p.width * .4, extent: Math.max(1, Math.abs(p.speed) * WAKE.interval * 1.2),
      strength: Math.min(1, (Math.abs(p.speed) - WAKE.minSpeed) / 9), born, age: 0, key });
  }

  update(dt, vessels) {
    if (!Number.isFinite(dt) || dt < 0) return this.points;
    this.time += dt;
    const active = new Set();
    for (const [index, p] of vessels.slice(0, 2).entries()) {
      const key = p.id ?? index;
      active.add(key);
      const valid = p.active !== false && [p.x,p.z,p.heading,p.speed,p.length,p.width].every(Number.isFinite)
        && p.length > 0 && p.width > 0 && Math.abs(p.speed) > WAKE.minSpeed;
      if (!valid) { this.tracks.delete(key); continue; }
      const prev = this.tracks.get(key);
      // Teleports and a resumed tab must not paint a line across the sea.
      const jump = prev && Math.hypot(p.x-prev.x,p.z-prev.z) > Math.max(p.length*2, Math.abs(p.speed)*dt*3, 20);
      if (!prev || jump || dt > WAKE.lifetime || Math.sign(prev.speed) !== Math.sign(p.speed)) {
        this.emit(p, this.time, key);
        this.tracks.set(key, { ...p, phase: 0 });
        continue;
      }
      const turn = Math.atan2(Math.sin(p.heading-prev.heading),Math.cos(p.heading-prev.heading));
      const count = Math.floor((prev.phase+dt+1e-9)/WAKE.interval);
      for (let i=1;i<=count;i++) {
        const offset = i*WAKE.interval-prev.phase;
        const t = Math.min(1, offset / dt);
        this.emit({ ...p, x: mix(prev.x,p.x,t), z: mix(prev.z,p.z,t), heading: prev.heading+turn*t,
          speed: mix(prev.speed,p.speed,t) }, this.time-dt+offset, key);
      }
      this.tracks.set(key, { ...p, phase: Math.max(0,prev.phase+dt-count*WAKE.interval) });
    }
    for (const key of this.tracks.keys()) if (!active.has(key)) this.tracks.delete(key);
    for (const point of this.points) point.age = (this.time-point.born)/WAKE.lifetime;
    this.points = this.points.filter(p => p.age < 1).sort((a,b) => a.born-b.born).slice(-WAKE.capacity);
    return this.points;
  }
}
