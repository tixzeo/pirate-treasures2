import { WAKE } from './wake.js';

// Surface state belongs to the active sea, just like the weather swell gain.
// The wake is a bounded visual wave approximation, not a fluid solver.
export const wakeSurface = { points: [], ships: [] };
const K = Math.PI*2/9, AMPLITUDE=.42, SPREAD=4, BAND=4.5;
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
  const a=AMPLITUDE*p.strength*(1-p.age)**1.5;
  const h=a*envelope*Math.cos(phase);
  const dr=a*(-4*q*(1-q*q)/band*Math.cos(phase)-envelope*K*Math.sin(phase));
  const g=gate*gate*(3-2*gate), dg=-6*gate*(1-gate)/12;
  return {height:h*g,dx:dr*ox/r*g+h*dg*p.fx,dz:dr*oz/r*g+h*dg*p.fz};
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

export function wakeHeight(x,z,points=wakeSurface.points,ships=wakeSurface.ships) {
  let h=0;
  for(const p of points)h+=wakePulse(p,x,z).height;
  for(const s of ships)h+=bowPressure(s,x,z).height;
  return h;
}

// Value and analytic slopes. The same kernels are used in vertex displacement,
// fragment normals and the GPU readback fixture, without another render pass.
export const WAKE_GLSL = /* glsl */`
  uniform vec4 uShips[2];
  uniform vec2 uShipSize[2];
  uniform vec4 uTrail[${WAKE.capacity}];
  uniform vec4 uTrailShape[${WAKE.capacity}];
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
    float a=${AMPLITUDE}*shape.z*pow(1.0-t.z,1.5), h=a*envelope*cos(phase);
    float dr=a*(-4.0*q*(1.0-q*q)/band*cos(phase)-envelope*${K}*sin(phase));
    float g=gate*gate*(3.0-2.0*gate), dg=-6.0*gate*(1.0-gate)/12.0;
    return vec3(h*g,dr*off/r*g+h*dg*shape.xy);
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
  vec3 wakeField(vec2 p) {
    vec3 field=vec3(0.0);
    for(int i=0;i<${WAKE.capacity};i++)field+=wakePulse(p,uTrail[i],uTrailShape[i]);
    for(int i=0;i<2;i++)field+=bowPressure(p,uShips[i],uShipSize[i]);
    return field;
  }
`;
