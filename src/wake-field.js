import { WAKE } from './wake.js';

// Surface state belongs to the active sea, just like the weather swell gain.
// The wake is a bounded visual wave approximation, not a fluid solver.
export const wakeSurface = { points: [], ships: [], time: 0 };
const K = Math.PI*2/9, AMPLITUDE=.42, SPREAD=4, BAND=4.5;
// A hull faster than its waves spread leaves a Kelvin V: of each expanding ring only the stretch on the arms
// of the V stays (where the ring touches the envelope, cos = SPREAD / speed), not the arc that wells up
// behind the stern. Each ring also swells in over its first half second instead of appearing at once.
const ARM=.2, FAST=[4.5,7], BIRTH=.08;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const ZERO=Object.freeze({height:0,dx:0,dz:0});

export function wakePulse(p,x,z) {
  if(p.age<0||p.age>=1||p.strength<=0)return ZERO;
  const ox=x-p.x, oz=z-p.z, seconds=p.age*WAKE.lifetime;
  const radius=p.width*.75+seconds*SPREAD, band=BAND+seconds*.2;
  if(Math.max(Math.abs(ox),Math.abs(oz))>radius+band)return ZERO;
  // Smooth distance at the source prevents a normal singularity.
  const r=Math.sqrt(ox*ox+oz*oz+1), q=(r-radius)/band;
  const gate=Math.max(0,Math.min(1,(8-ox*p.fx-oz*p.fz)/12));
  if(Math.abs(q)>=1||gate===0)return ZERO;
  const envelope=(1-q*q)**2, phase=(r-radius)*K;
  const a=AMPLITUDE*p.strength*(1-p.age)**1.5*smooth(0,BIRTH,p.age);
  const h=a*envelope*Math.cos(phase);
  const dr=a*(-4*q*(1-q*q)/band*Math.cos(phase)-envelope*K*Math.sin(phase));
  const g=gate*gate*(3-2*gate), dg=-6*gate*(1-gate)/12;
  // Speed from the patch length wake.js gives it; a slow hull keeps the plain half ring.
  const speed=(p.extent??0)/(WAKE.interval*1.2), fast=smooth(FAST[0],FAST[1],speed), cosM=Math.min(.95,SPREAD/Math.max(speed,1e-6));
  const nf=(ox*p.fx+oz*p.fz)/r, d=nf-cosM, arm=Math.exp(-d*d/(ARM*ARM)), da=-2*d/(ARM*ARM)*arm*fast/r;
  const w=g*(1-fast)+arm*fast;
  const wx=dg*p.fx*(1-fast)+da*(p.fx-nf*ox/r), wz=dg*p.fz*(1-fast)+da*(p.fz-nf*oz/r);
  return {height:h*w,dx:dr*ox/r*w+h*wx,dz:dr*oz/r*w+h*wz};
}

export function bowPressure(ship,x,z) {
  if(!ship||ship.active===false||Math.abs(ship.speed)<=WAKE.minSpeed)return ZERO;
  const sign=Math.sign(ship.speed), fx=-Math.sin(ship.heading)*sign, fz=-Math.cos(ship.heading)*sign;
  const rx=-fz, rz=fx, width=Math.max(2,ship.width*.9), cross=ship.width*.7;
  const ox=x-ship.x, oz=z-ship.z;
  const u=(ox*fx+oz*fz-ship.length*.45)/width, v=(ox*rx+oz*rz)/cross, e=u*u+v*v;
  if(e>=1)return ZERO;
  const pace=Math.min(1,(Math.abs(ship.speed)-WAKE.minSpeed)/9), a=.24*pace;
  return {height:a*(1-e)**2, dx:-4*a*(1-e)*(u*fx/width+v*rx/cross), dz:-4*a*(1-e)*(u*fz/width+v*rz/cross)};
}

// The bow's diverging waves (captain 28.10.2026: «спереди анимацию расхождения волн в стороны»): two arms of
// crests at the Kelvin angle from the stem, running outwards while the ship carries the V along. They ride with
// the hull, so a turn swings them round; they fade out a few lengths astern.
export const BOW_WAVE = Object.freeze({ angle: 20 * Math.PI / 180, reach: 55, band: 8, k: Math.PI * 2 / 8.5, run: 2.6, amplitude: .3 });
const ramp=(a,b,x)=>{const t=(x-a)/(b-a);return t<=0||t>=1?[t<=0?0:1,0]:[t*t*(3-2*t),6*t*(1-t)/(b-a)];};
export function bowWaves(ship,x,z,time=wakeSurface.time) {
  if(!ship||ship.active===false||Math.abs(ship.speed)<=WAKE.minSpeed)return ZERO;
  const {angle,reach,band,k,run,amplitude}=BOW_WAVE;
  const sign=Math.sign(ship.speed), fx=-Math.sin(ship.heading)*sign, fz=-Math.cos(ship.heading)*sign, rx=-fz, rz=fx;
  const ox=x-ship.x, oz=z-ship.z, b=ship.length*.45-(ox*fx+oz*fz);   // metres astern of the stem
  if(b<=-2||b>=reach)return ZERO;
  // A rounded |lat| keeps the surface smooth on the ship's line, under the stem.
  const lat=ox*rx+oz*rz, al=Math.sqrt(lat*lat+1), side=lat/al, ca=Math.cos(angle), sa=Math.sin(angle);
  const n=al*ca-b*sa;                                                 // metres outside the arm
  if(n<=-1.5||n>=band)return ZERO;
  const span=band+1.5, q=(n+1.5)/span, S=Math.sin(Math.PI*q)**2, dS=Math.sin(2*Math.PI*q)*Math.PI/span;
  const [g,dg]=ramp(-2,4,b), tail=(1-b/reach)**2, F=g*tail, dF=dg*tail-g*2*(1-b/reach)/reach;
  const a=amplitude*Math.min(1,(Math.abs(ship.speed)-WAKE.minSpeed)/9), phase=k*(n-run*time);
  const c=Math.cos(phase), h=a*S*F*c, dn=a*F*(dS*c-S*k*Math.sin(phase)), db=a*S*dF*c;
  return {height:h, dx:dn*(side*ca*rx+sa*fx)-db*fx, dz:dn*(side*ca*rz+sa*fz)-db*fz};
}

export function wakeHeight(x,z,points=wakeSurface.points,ships=wakeSurface.ships,excludeSource=null) {
  let h=0;
  // The rendered surface and floaters sample every source. A hull must not
  // lift itself with the pressure wave or history it generated last step.
  for(const p of points)if(excludeSource===null||p.key!==excludeSource)h+=wakePulse(p,x,z).height;
  for(const s of ships)if(excludeSource===null||s.id!==excludeSource)h+=bowPressure(s,x,z).height+bowWaves(s,x,z).height;
  return h;
}

export const WAKE_UNIFORMS = /* glsl */`
  uniform vec4 uShips[2];
  uniform vec2 uShipSize[2];
  uniform float uWakeTime;
  uniform vec4 uTrail[${WAKE.capacity}];
  uniform vec4 uTrailShape[${WAKE.capacity}];
`;

// Value and analytic slopes, evaluated once per grid vertex. Rasterisation
// interpolates those slopes for lighting, without another 30 kernels per pixel.
export const WAKE_GLSL = /* glsl */`
  ${WAKE_UNIFORMS}
  vec3 wakePulse(vec2 p, vec4 t, vec4 shape) {
    if(t.w<=0.0||t.z<0.0||t.z>=1.0||shape.z<=0.0)return vec3(0.0);
    vec2 off=p-t.xy;
    float seconds=t.z*${WAKE.lifetime.toFixed(1)}, radius=t.w*0.75+seconds*${SPREAD.toFixed(1)}, band=${BAND.toFixed(1)}+seconds*0.2;
    // Reject distant patches before square roots, powers or trigonometry.
    if(max(abs(off.x),abs(off.y))>radius+band)return vec3(0.0);
    float r=sqrt(dot(off,off)+1.0), q=(r-radius)/band;
    float gate=clamp((8.0-dot(off,shape.xy))/12.0,0.0,1.0);
    if(abs(q)>=1.0||gate<=0.0)return vec3(0.0);
    float envelope=(1.0-q*q)*(1.0-q*q), phase=(r-radius)*${K};
    float a=${AMPLITUDE}*shape.z*pow(1.0-t.z,1.5)*smoothstep(0.0,${BIRTH.toFixed(2)},t.z), h=a*envelope*cos(phase);
    float dr=a*(-4.0*q*(1.0-q*q)/band*cos(phase)-envelope*${K}*sin(phase));
    float g=gate*gate*(3.0-2.0*gate), dg=-6.0*gate*(1.0-gate)/12.0;
    float speed=shape.w/${(WAKE.interval*1.2).toFixed(4)}, fast=smoothstep(${FAST[0].toFixed(1)},${FAST[1].toFixed(1)},speed);
    float cosM=min(0.95,${SPREAD.toFixed(1)}/max(speed,1e-6)), nf=dot(off,shape.xy)/r, d=nf-cosM;
    float arm=exp(-d*d/${(ARM*ARM).toFixed(4)}), da=-2.0*d/${(ARM*ARM).toFixed(4)}*arm*fast/r;
    float w=g*(1.0-fast)+arm*fast;
    vec2 dw=dg*shape.xy*(1.0-fast)+da*(shape.xy-nf*off/r);
    return vec3(h*w,dr*off/r*w+h*dw);
  }
  vec3 bowPressure(vec2 p,vec4 ship,vec2 size) {
    if(abs(ship.w)<=1.0||size.x<=0.0||size.y<=0.0)return vec3(0.0);
    vec2 f=vec2(-sin(ship.z),-cos(ship.z))*sign(ship.w), r=vec2(-f.y,f.x), off=p-ship.xy;
    float width=max(2.0,size.y*1.8), crossWidth=size.y*1.4;
    float u=(dot(off,f)-size.x*0.9)/width, v=dot(off,r)/crossWidth, e=u*u+v*v;
    if(e>=1.0)return vec3(0.0);
    float a=0.24*min(1.0,(abs(ship.w)-1.0)/9.0);
    return vec3(a*(1.0-e)*(1.0-e),-4.0*a*(1.0-e)*(u*f/width+v*r/crossWidth));
  }
  vec2 wakeRamp(float a,float b,float x){float t=(x-a)/(b-a);return t<=0.0||t>=1.0?vec2(step(1.0,t),0.0):vec2(t*t*(3.0-2.0*t),6.0*t*(1.0-t)/(b-a));}
  vec3 bowWaves(vec2 p,vec4 ship,vec2 size) {
    if(abs(ship.w)<=1.0||size.x<=0.0||size.y<=0.0)return vec3(0.0);
    vec2 f=vec2(-sin(ship.z),-cos(ship.z))*sign(ship.w), r=vec2(-f.y,f.x), off=p-ship.xy;
    float b=size.x*0.9-dot(off,f);
    if(b<=-2.0||b>=${BOW_WAVE.reach.toFixed(1)})return vec3(0.0);
    float lat=dot(off,r), al=sqrt(lat*lat+1.0), side=lat/al, ca=${Math.cos(BOW_WAVE.angle).toFixed(7)}, sa=${Math.sin(BOW_WAVE.angle).toFixed(7)};
    float n=al*ca-b*sa;
    if(n<=-1.5||n>=${BOW_WAVE.band.toFixed(1)})return vec3(0.0);
    float span=${(BOW_WAVE.band+1.5).toFixed(1)}, q=(n+1.5)/span, S=sin(3.14159265*q)*sin(3.14159265*q), dS=sin(6.2831853*q)*3.14159265/span;
    vec2 g=wakeRamp(-2.0,4.0,b);
    float tail=(1.0-b/${BOW_WAVE.reach.toFixed(1)})*(1.0-b/${BOW_WAVE.reach.toFixed(1)}), F=g.x*tail, dF=g.y*tail-g.x*2.0*(1.0-b/${BOW_WAVE.reach.toFixed(1)})/${BOW_WAVE.reach.toFixed(1)};
    float a=${BOW_WAVE.amplitude}*min(1.0,(abs(ship.w)-1.0)/9.0), phase=${BOW_WAVE.k.toFixed(7)}*(n-${BOW_WAVE.run.toFixed(1)}*uWakeTime);
    float c=cos(phase), dn=a*F*(dS*c-S*${BOW_WAVE.k.toFixed(7)}*sin(phase)), db=a*S*dF*c;
    return vec3(a*S*F*c, dn*(side*ca*r+sa*f)-db*f);
  }
  vec3 wakeField(vec2 p) {
    vec3 field=vec3(0.0);
    for(int i=0;i<${WAKE.capacity};i++)field+=wakePulse(p,uTrail[i],uTrailShape[i]);
    for(int i=0;i<2;i++)field+=bowPressure(p,uShips[i],uShipSize[i])+bowWaves(p,uShips[i],uShipSize[i]);
    return field;
  }
`;
