// Angular inertia only: vertical support follows the current spatially averaged
// water plane. A temporal heave filter would keep a ship high after a trough.
import { HULL_PHYSICS } from './ship-physics.js';

export function dampedAxis(value,velocity,target,omega,dt) {
  const error=value-target,drive=velocity+omega*error,decay=Math.exp(-omega*dt);
  return {value:target+(error+drive*dt)*decay,velocity:(velocity-omega*drive*dt)*decay};
}
// A slow, lightly damped sway: how a heavy hull rocks after a blow. Exact for any step.
export function swayAxis(value,velocity,omega,zeta,dt) {
  const wd=omega*Math.sqrt(1-zeta*zeta),k=zeta*omega,decay=Math.exp(-k*dt),c=Math.cos(wd*dt),s=Math.sin(wd*dt);
  const b=(velocity+k*value)/wd;
  return {value:decay*(value*c+b*s),velocity:decay*((velocity+k*value)*c-wd*value*s)-k*decay*(value*c+b*s)};
}
export const SWAY=Object.freeze({omega:1.25,zeta:.3});   // about a five second roll, settling over three or four swings
export class HullMotion {
  constructor() { this.reset(); }
  reset() { this.ready=false;this.pitchVelocity=0;this.rollVelocity=0;this.sway={pitch:0,pitchVelocity:0,roll:0,rollVelocity:0}; }
  // A blow to the hull (recoil, a ball, a collision) starts a slow sway, never a jerk: the hull follows it
  // like it follows the waves, and the sway dies out over a few rolls.
  kick(pitch=0,roll=0) { if(Number.isFinite(pitch))this.sway.pitchVelocity+=pitch;if(Number.isFinite(roll))this.sway.rollVelocity+=roll; }
  update(dt, { heave, pitch, roll, heel }, length) {
    const weight = Math.sqrt(Math.max(8, length) / 32);
    const target = { heave, pitch: Math.max(-HULL_PHYSICS.pitchLimit, Math.min(HULL_PHYSICS.pitchLimit, pitch)),
      roll: Math.max(-HULL_PHYSICS.rollLimit, Math.min(HULL_PHYSICS.rollLimit, roll * .65 + Math.max(-HULL_PHYSICS.heelLimit, Math.min(HULL_PHYSICS.heelLimit, heel)))) };
    this.heave = heave;
    for (const key of ['pitch', 'roll']) {
      const next=swayAxis(this.sway[key],this.sway[key+'Velocity'],SWAY.omega/weight,SWAY.zeta,Math.max(0,dt));
      this.sway[key]=next.value;this.sway[key+'Velocity']=next.velocity;target[key]+=next.value;
    }
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
