// Stable wave packets: amplitude changes smoothly along a crest and over time.
// The same packet parameters drive the CPU flotation and the GPU water surface.
export const SWELLS = [
  { dir: [1,.3], len:38, amp:.55, speed:1.1, phase:.4 },
  { dir: [-.4,1], len:21, amp:.3, speed:1.5, phase:2.7 },
  { dir: [.8,-.7], len:11, amp:.14, speed:2.2, phase:4.1 },
  { dir: [-1,-.2], len:6.5, amp:.06, speed:3.1, phase:1.8 },
].map(s=>{const n=Math.hypot(...s.dir);return {...s,dir:s.dir.map(v=>v/n),k:Math.PI*2/s.len}});
export const swell = { k:1 };
const PACKET = { base:.78, depth:.22, scale:.17, drift:.13, phase:1.73 };
export function swellHeight(s,x,z,t) {
  const [dx,dz]=s.dir;
  const packet=PACKET.base+PACKET.depth*Math.sin((-x*dz+z*dx)*s.k*PACKET.scale+t*PACKET.drift+s.phase*PACKET.phase);
  return s.amp*packet*Math.sin((x*dx+z*dz)*s.k+t*s.speed+s.phase);
}
export const waveHeight = (x,z,t) => SWELLS.reduce((h,s)=>h+swellHeight(s,x,z,t)*swell.k,0);
export const PACKET_GLSL = /* glsl */`
  vec3 swellPacket(vec2 p, vec2 dir, float k, float t, float phase) {
    vec2 across = vec2(-dir.y, dir.x);
    float ph = dot(p, across) * k * ${PACKET.scale} + t * ${PACKET.drift} + phase * ${PACKET.phase};
    float amplitude = ${PACKET.base} + ${PACKET.depth} * sin(ph);
    vec2 gradient = across * (k * ${PACKET.scale * PACKET.depth} * cos(ph));
    return vec3(amplitude, gradient);
  }
`;
