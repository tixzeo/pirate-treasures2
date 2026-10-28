// Metres, seconds and radians. Forces below are divided by effective hull mass;
// terminal speeds remain the existing class/SAILS values, independent of size.
export const HULL_PHYSICS = Object.freeze({
  dragLinear:.20, dragQuadratic:.003, stopSpeed:.015, maxStep:1/120,
  helmRate:.7, yawTime:1.8, minTurnLength:.85, heelTime:2.5, heelLimit:.1,
  pitchLimit:.1, rollLimit:.16, draft:.3, floodDrag:.8,
  skid:.12, driftTime:1.1, slope:.7, spray:.05,
  sailUp:.1, sailDown:.25,
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const waterDrag = speed => HULL_PHYSICS.dragLinear*speed + HULL_PHYSICS.dragQuadratic*speed*Math.abs(speed);

export function advanceSurge(speed,throttle,maxSpeed,dt,dragMultiplier=1) {
  if(![speed,throttle,maxSpeed,dt].every(Number.isFinite)||dt<0)return Number.isFinite(speed)?speed:0;
  const target=clamp(throttle,-.25,1)*Math.max(0,maxSpeed), thrust=waterDrag(target);
  const steps=Math.max(1,Math.ceil(Math.min(dt,1)/HULL_PHYSICS.maxStep)),h=Math.min(dt,1)/steps;
  // Midpoint integration of sail thrust minus linear and quadratic water drag.
  for(let i=0;i<steps;i++){
    const half=speed+(thrust-waterDrag(speed)*dragMultiplier)*h*.5;
    const next=speed+(thrust-waterDrag(half)*dragMultiplier)*h;
    speed=(target-speed)*(target-next)<0?target:next;
  }
  return target===0&&Math.abs(speed)<HULL_PHYSICS.stopSpeed?0:speed;
}

export function advanceSteering({helm,yaw},rudder,speed,maxSpeed,turnRate,length,dt) {
  if(![helm,yaw,rudder,speed,maxSpeed,turnRate,length,dt].every(Number.isFinite)||dt<0)return {helm,yaw,angle:0};
  const nextHelm=helm+clamp(clamp(rudder,-1,1)-helm,-HULL_PHYSICS.helmRate*dt,HULL_PHYSICS.helmRate*dt);
  const bite=clamp(Math.abs(speed)/Math.max(.01,maxSpeed*.4),0,1);
  const limit=Math.min(Math.max(0,turnRate),Math.abs(speed)/(Math.max(8,length)*HULL_PHYSICS.minTurnLength));
  const target=nextHelm*limit*bite*Math.sign(speed),tau=HULL_PHYSICS.yawTime*Math.sqrt(Math.max(8,length)/32);
  const decay=Math.exp(-dt/tau),nextYaw=target+(yaw-target)*decay;
  // Integrate the angular response, rather than using the final rate for all dt.
  return {helm:nextHelm,yaw:nextYaw,angle:target*dt+(yaw-target)*tau*(1-decay)};
}

// windHeel: the lean the wind puts on the sails (wind.js), added to the lean of the turn.
export function advanceHeel(heel,speed,yaw,dt,windHeel=0) {
  const target=clamp(-Math.atan(speed*yaw/9.81)*.38+(Number.isFinite(windHeel)?windHeel:0),-HULL_PHYSICS.heelLimit,HULL_PHYSICS.heelLimit);
  return target+(heel-target)*Math.exp(-Math.max(0,dt)/HULL_PHYSICS.heelTime);
}

// Sideways speed, m/s towards starboard: the keel lets the hull slip outward in a turn and to leeward
// in the wind (wind.js leeway), and takes any slip back out with lateral resistance.
export function advanceDrift(drift,speed,yaw,leeway,length,dt) {
  if(![drift,speed,yaw,dt].every(Number.isFinite)||dt<0)return Number.isFinite(drift)?drift:0;
  const target=speed*yaw*HULL_PHYSICS.skid+(Number.isFinite(leeway)?leeway:0);
  return target+(drift-target)*Math.exp(-dt/(HULL_PHYSICS.driftTime*Math.sqrt(Math.max(8,length)/32)));
}

// Gravity along the water's slope: down the back of a wave she gathers way, up its face she loses it.
// pitch: the water plane under the hull, bow up positive. Fades out as she stops, so a ship at rest stays at rest.
export function slopeSurge(speed,pitch,dt) {
  if(![speed,pitch,dt].every(Number.isFinite)||dt<0)return Number.isFinite(speed)?speed:0;
  return speed-9.81*Math.sin(pitch)*HULL_PHYSICS.slope*clamp(Math.abs(speed)/3,0,1)*dt;
}

// The sails the crew has actually set, following the order: setting them takes about ten seconds,
// taking them in about four, so a ship gathers way slowly and a heavy hull keeps it.
export function advanceSails(sail,order,dt) {
  if(![sail,order,dt].every(Number.isFinite)||dt<0)return Number.isFinite(sail)?sail:0;
  const goal=clamp(order,-.25,1),rate=goal>sail?HULL_PHYSICS.sailUp:HULL_PHYSICS.sailDown;
  return sail+clamp(goal-sail,-rate*dt,rate*dt);
}
