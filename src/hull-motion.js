// Angular inertia only: vertical support follows the current spatially averaged
// water plane. A temporal heave filter would keep a ship high after a trough.
import { HULL_PHYSICS } from './ship-physics.js';

export function dampedAxis(value,velocity,target,omega,dt) {
  const error=value-target,drive=velocity+omega*error,decay=Math.exp(-omega*dt);
  return {value:target+(error+drive*dt)*decay,velocity:(velocity-omega*drive*dt)*decay};
}
export class HullMotion {
  constructor() { this.reset(); }
  reset() { this.ready=false;this.pitchVelocity=0;this.rollVelocity=0; }
  // A blow to the hull (recoil, a ball, a collision) sets her rocking; the damping takes it out again.
  kick(pitch=0,roll=0) { if(Number.isFinite(pitch))this.pitchVelocity+=pitch;if(Number.isFinite(roll))this.rollVelocity+=roll; }
  update(dt, { heave, pitch, roll, heel }, length) {
    const weight = Math.sqrt(Math.max(8, length) / 32);
    const target = { heave, pitch: Math.max(-HULL_PHYSICS.pitchLimit, Math.min(HULL_PHYSICS.pitchLimit, pitch)),
      roll: Math.max(-HULL_PHYSICS.rollLimit, Math.min(HULL_PHYSICS.rollLimit, roll * .65 + Math.max(-HULL_PHYSICS.heelLimit, Math.min(HULL_PHYSICS.heelLimit, heel)))) };
    this.heave = heave;
    for (const key of ['pitch', 'roll']) {
      const limit=key==='pitch'?HULL_PHYSICS.pitchLimit:HULL_PHYSICS.rollLimit;
      const next=this.ready?dampedAxis(this[key],this[key+'Velocity'],target[key],3/(.9*weight),Math.max(0,dt)):{value:target[key],velocity:0};
      this[key]=Math.max(-limit,Math.min(limit,next.value));
      this[key+'Velocity']=this[key]===next.value?next.velocity:0;
    }
    this.ready = true;
    return this;
  }
}
