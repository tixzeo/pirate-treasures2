// Metres, seconds and radians. Forces below are divided by effective hull mass;
// terminal speeds remain the existing class/SAILS values, independent of size.
export const HULL_PHYSICS = Object.freeze({
  dragLinear:.20, dragQuadratic:.003, stopSpeed:.015, maxStep:1/120,
  helmRate:1.8, yawTime:.9, minTurnLength:.85, heelTime:.8, heelLimit:.1,
  pitchLimit:.1, rollLimit:.16, draft:.3,
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const waterDrag = speed => HULL_PHYSICS.dragLinear*speed + HULL_PHYSICS.dragQuadratic*speed*Math.abs(speed);

export function advanceSurge(speed,throttle,maxSpeed,dt) {
  if(![speed,throttle,maxSpeed,dt].every(Number.isFinite)||dt<0)return Number.isFinite(speed)?speed:0;
  const target=clamp(throttle,-.25,1)*Math.max(0,maxSpeed), thrust=waterDrag(target);
  const steps=Math.max(1,Math.ceil(Math.min(dt,1)/HULL_PHYSICS.maxStep)),h=Math.min(dt,1)/steps;
  // Midpoint integration of sail thrust minus linear and quadratic water drag.
  for(let i=0;i<steps;i++){
    const half=speed+(thrust-waterDrag(speed))*h*.5;
    const next=speed+(thrust-waterDrag(half))*h;
    speed=(target-speed)*(target-next)<0?target:next;
  }
  return target===0&&Math.abs(speed)<HULL_PHYSICS.stopSpeed?0:speed;
}
