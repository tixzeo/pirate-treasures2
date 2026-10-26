import { wakeHeight } from './wake-field.js';
// Crossing swell groups with curved fronts and independent 2D envelopes.
// No random reseeding: flotation and rendering sample the same field.
export const SWELLS = [
  { dir: [1,.3], len:43, amp:.28, speed:1.1, phase:.4 },
  { dir: [-.4,1], len:29, amp:.27, speed:1.5, phase:2.7 },
  { dir: [.8,-.7], len:19, amp:.22, speed:1.8, phase:4.1 },
  { dir: [-1,-.2], len:13, amp:.14, speed:2.2, phase:1.8 },
  { dir: [.2,1], len:9.1, amp:.09, speed:2.6, phase:5.3 },
  { dir: [1,-.1], len:6.7, amp:.05, speed:3.1, phase:3.2 },
].map(s=>{const n=Math.hypot(...s.dir);return {...s,dir:s.dir.map(v=>v/n),k:Math.PI*2/s.len}});
export const swell = { k:1 };
export function swellSample(s,x,z,t) {
  const [dx,dz]=s.dir, u=x*dx+z*dz, v=-x*dz+z*dx;
  const a=v*s.k*.68+t*.16+s.phase*1.73, b=u*s.k*.31-t*.11+s.phase*2.31;
  const bend=v*s.k*.37+t*.12+s.phase*2.1;
  const A=.68+.32*Math.sin(a), B=.8+.2*Math.sin(b), packet=A*B;
  const phase=u*s.k+t*s.speed+s.phase+1.4*Math.sin(bend);
  const across=s.k*.37*1.4*Math.cos(bend), dA=s.k*.68*.32*Math.cos(a)*B, dB=s.k*.31*.2*Math.cos(b)*A;
  const sin=Math.sin(phase), cos=Math.cos(phase);
  return {height:s.amp*packet*sin,
    dx:s.amp*((dx*dB-dz*dA)*sin+packet*(dx*s.k-dz*across)*cos),
    dz:s.amp*((dz*dB+dx*dA)*sin+packet*(dz*s.k+dx*across)*cos)};
}
export function swellHeight(s,x,z,t) {
  const [dx,dz]=s.dir, u=x*dx+z*dz, v=-x*dz+z*dx;
  const packet=(.68+.32*Math.sin(v*s.k*.68+t*.16+s.phase*1.73))
    *(.8+.2*Math.sin(u*s.k*.31-t*.11+s.phase*2.31));
  const phase=u*s.k+t*s.speed+s.phase+1.4*Math.sin(v*s.k*.37+t*.12+s.phase*2.1);
  return s.amp*packet*Math.sin(phase);
}
export const waveHeight = (x,z,t) => SWELLS.reduce((h,s)=>h+swellHeight(s,x,z,t)*swell.k,0)+wakeHeight(x,z);
export const PACKET_GLSL = /* glsl */`
  vec3 swellPacket(vec2 p, vec2 dir, float k, float t, float phase) {
    vec2 across=vec2(-dir.y,dir.x);
    float a=dot(p,across)*k*0.68+t*0.16+phase*1.73;
    float b=dot(p,dir)*k*0.31-t*0.11+phase*2.31;
    float A=0.68+0.32*sin(a), B=0.8+0.2*sin(b);
    return vec3(A*B,across*(k*0.68*0.32*cos(a)*B)+dir*(k*0.31*0.2*cos(b)*A));
  }
  vec3 swellPhase(vec2 p, vec2 dir, float k, float speed, float t, float phase) {
    vec2 across=vec2(-dir.y,dir.x);
    float bend=dot(p,across)*k*0.37+t*0.12+phase*2.1;
    return vec3(dot(p,dir)*k+t*speed+phase+1.4*sin(bend),dir*k+across*(k*0.37*1.4*cos(bend)));
  }
  vec3 swellField(vec2 p, vec4 s, float t, float phase) {
    vec3 a=swellPacket(p,s.xy,s.z,t,phase), ph=swellPhase(p,s.xy,s.z,s.w,t,phase);
    return vec3(a.x*sin(ph.x),a.yz*sin(ph.x)+a.x*ph.yz*cos(ph.x));
  }
`;
