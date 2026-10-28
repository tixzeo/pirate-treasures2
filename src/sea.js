import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { coastAtlas, COAST_SIZE, COAST_RANGE } from './island-shape.js';
import { SWELLS, swell, PACKET_GLSL } from './waves.js';
import { WakeTrail, WAKE } from './wake.js';
import { WAKE_GLSL, WAKE_UNIFORMS, wakeSurface, BOW_WAVE } from './wake-field.js';
export { swell, waveHeight } from './waves.js';

const SIZE = 700, SEG = 220, STEP = SIZE / SEG;
export const MAX_ISLES = 8, TRAIL = WAKE.capacity;

// The detailed grid remains local and cheap. Two distant triangles continue the
// sea underneath far-away islands, beyond the fully fogged edge of that grid.
export function makeSeaBackdrop(material = new THREE.MeshBasicMaterial({color:'#bddde8',fog:false})) {
  const geometry = new THREE.PlaneGeometry(12000,12000);
  geometry.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(geometry,material);
  mesh.position.y=0; mesh.frustumCulled=false;
  return mesh;
}

const CHOP = 1.8; // how far crests lean together (Gerstner); 0 gives plain sines

const vertex = /* glsl */`
  uniform float uTime;
  uniform vec4 uSwell[${SWELLS.length}];   // dir.x, dir.y, k, speed
  uniform float uAmp[${SWELLS.length}];
  uniform float uPhase[${SWELLS.length}];
  uniform vec2 uSeaCenter;
  uniform float uFarPlane;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying vec2 vWakeSlope;
  ${PACKET_GLSL}
  ${WAKE_GLSL}
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 base = w.xz;
    vec2 gridOffset = abs(base-uSeaCenter);
    float detail = (1.0-uFarPlane) * (1.0-smoothstep(${(SIZE * .34).toFixed(1)},${(SIZE * .48).toFixed(1)},max(gridOffset.x,gridOffset.y)));
    float h = 0.0;
    vec3 n = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < ${SWELLS.length}; i++) {
      vec2 d = uSwell[i].xy;
      float k = uSwell[i].z, a = uAmp[i]*detail;
      vec3 packet = swellPacket(base, d, k, uTime, uPhase[i]);
      vec3 ph = swellPhase(base,d,k,uSwell[i].w,uTime,uPhase[i]);
      float s = sin(ph.x), c = cos(ph.x);
      h += a * packet.x * s;
      // Gerstner: points slide toward the crest, so crests sharpen and troughs widen.
      w.xz += ${CHOP.toFixed(2)} * a * packet.x * d * c;
      n.xz -= a * (packet.x * ph.yz * c + packet.yz * s);
      n.y -= ${CHOP.toFixed(2)} * k * a * packet.x * s;
    }
    vWakeSlope = vec2(0.0);
    if(detail>0.001){
      vec3 wake = wakeField(w.xz) * detail;
      h += wake.x;
      vWakeSlope = wake.yz;
    }
    w.y += h;
    vWorld = w.xyz;
    vHeight = h;
    vNormal = normalize(n);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// A tiling field of small ripples, made once: integer wave numbers make it repeat seamlessly.
function rippleNormals(size = 256) {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const waves = [];
  for (let i = 0; i < 28; i++) {
    const kx = Math.round((rnd() - .5) * 24), ky = Math.round((rnd() - .5) * 24);
    if (!kx && !ky) continue;
    const len = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / len ** 1.3, ph: rnd() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const c = Math.cos((w.kx * x + w.ky * y) / size * Math.PI * 2 + w.ph) * w.a;
      dx += c * w.kx; dy += c * w.ky;
    }
    const n = [-dx * .045, -dy * .045, 1], l = Math.hypot(...n), o = (y * size + x) * 4;
    data[o] = (n[0] / l * .5 + .5) * 255; data[o + 1] = (n[1] / l * .5 + .5) * 255; data[o + 2] = (n[2] / l * .5 + .5) * 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Until the foam texture loads: a soft noise pattern in the alpha channel.
function blankFoam(size = 64) {
  const data = new Uint8Array(size * size * 4).fill(255);
  for (let i = 0; i < size * size; i++) data[i * 4 + 3] = 40 + ((i * 2654435761) >>> 24) % 120;
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const fragment = /* glsl */`
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uLagoon;
  uniform vec3 uSky;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform sampler2D uRipples;
  uniform float uRippleK;              // how hard the ripple map bends the light
  uniform sampler2D uFoam;             // foam pattern in alpha
  uniform vec3 uSand;
  uniform float uLight;                // how much daylight there is: 1 at noon, about 0.1 on a moonlit night
  uniform float uWhite;                // extra whitecaps in rough weather
  uniform sampler2D uRefl;             // the scene as the water mirrors it (high quality only)
  uniform mat4 uReflMatrix;
  uniform float uUseRefl;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uIsles[${MAX_ISLES}];   // x, z, shore radius
  uniform sampler2D uCoastAtlas;
  uniform vec3 uCoastGrid[${MAX_ISLES}]; // local grid min x/z, cell metres (0 = legacy)
  uniform vec2 uCoastRot[${MAX_ISLES}]; // cos/sin of island yaw
  uniform vec2 uSeaCenter;
  uniform float uFarPlane;
  ${WAKE_UNIFORMS}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying vec2 vWakeSlope;

  ${PACKET_GLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  float shoreAt(vec2 p, int i) {
    vec2 off = p - uIsles[i].xy;
    float cell = uCoastGrid[i].z;
    if (cell <= 0.0) return length(off) - uIsles[i].z;
    vec2 rot = uCoastRot[i];
    vec2 local = vec2(rot.x * off.x - rot.y * off.y, rot.y * off.x + rot.x * off.y);
    vec2 grid = (local - uCoastGrid[i].xy) / cell - 0.5;
    vec2 edge = clamp(grid, 0.0, ${COAST_SIZE - 1}.0);
    float outside = length(grid - edge) * cell;
    if (outside > 32.0) return outside; // far water needs no atlas sample
    vec2 uv = vec2((float(i) * ${COAST_SIZE}.0 + edge.x + 0.5) / ${COAST_SIZE * MAX_ISLES}.0, (edge.y + 0.5) / ${COAST_SIZE}.0);
    vec2 encoded = texture2D(uCoastAtlas, uv).rg;
    return dot(encoded, vec2(65280.0, 255.0)) / 65535.0 * ${COAST_RANGE * 2}.0 - ${COAST_RANGE}.0 + outside;
  }

  // The sky as the water mirrors it: a gradient from the haze at the horizon up to blue, soft clouds and the sun's glow.
  vec3 skyColor(vec3 r) {
    float y = max(r.y, 0.0);
    vec3 col = mix(uHorizon, uSky, pow(y, 0.45));
    vec2 cp = r.xz / (y + 0.15) * 1.4 + uTime * 0.008;
    float cloud = smoothstep(0.55, 0.85, noise(cp) * 0.65 + noise(cp * 2.3 + 4.0) * 0.35);
    col = mix(col, vec3(1.0), cloud * 0.5 * smoothstep(0.03, 0.3, y));
    float sun = max(dot(r, uSunDir), 0.0);
    return col + uSunColor * (pow(sun, 8.0) * 0.2 + pow(sun, 90.0) * 0.8);
  }

  // Only the pressure band moves with the hull. Wake history stays in the sea.
  float shipFoam(vec2 p, vec4 ship, vec2 size) {
    if (abs(ship.w) <= 1.0 || size.x <= 0.0 || size.y <= 0.0) return 0.0;
    vec2 f = vec2(-sin(ship.z), -cos(ship.z)), r = vec2(cos(ship.z), -sin(ship.z));
    vec2 d = p - ship.xy;
    float u = dot(d, f) * sign(ship.w), v = dot(d, r);
    float pace = smoothstep(1.0, 10.0, abs(ship.w));
    float e = length(vec2(u / (size.x * 1.05), v / (size.y * 1.25)));
    float hull = 1.0 - smoothstep(0.04, 0.3, abs(e - 1.0));
    return hull * smoothstep(-0.25, 0.9, u / size.x) * pace;
  }

  // White water on the bow waves (wake-field.js bowWaves): a broken line along each arm of the V from the stem
  // and fainter lace on the crests that run outwards from it.
  float bowFoam(vec2 p, vec4 ship, vec2 size) {
    if (abs(ship.w) <= 1.0 || size.x <= 0.0 || size.y <= 0.0) return 0.0;
    vec2 f = vec2(-sin(ship.z), -cos(ship.z)) * sign(ship.w), d = p - ship.xy;
    float b = size.x * 0.9 - dot(d, f);
    if (b <= -1.0 || b >= ${BOW_WAVE.reach.toFixed(1)}) return 0.0;
    float n = abs(dot(d, vec2(-f.y, f.x))) * ${Math.cos(BOW_WAVE.angle).toFixed(4)} - b * ${Math.sin(BOW_WAVE.angle).toFixed(4)};
    float fade = smoothstep(-1.0, 3.0, b) * pow(1.0 - b / ${BOW_WAVE.reach.toFixed(1)}, 2.0) * smoothstep(1.0, 8.0, abs(ship.w));
    float line = 1.0 - smoothstep(0.0, 1.3 + b * 0.04, abs(n - 0.3));
    float crests = smoothstep(0.55, 1.0, cos(${BOW_WAVE.k.toFixed(4)} * (n - ${BOW_WAVE.run.toFixed(1)} * uWakeTime))) * (1.0 - smoothstep(0.5, ${BOW_WAVE.band.toFixed(1)}, n)) * step(0.0, n);
    return max(line * 0.75, crests * 0.25) * fade;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 gridOffset = abs(p-uSeaCenter);
    float detail = (1.0-uFarPlane) * (1.0-smoothstep(${(SIZE * .34).toFixed(1)},${(SIZE * .48).toFixed(1)},max(gridOffset.x,gridOffset.y)));
    if(uFarPlane>0.5 && max(gridOffset.x,gridOffset.y)<${(SIZE * .47).toFixed(1)}) discard;
    float dist = length(cameraPosition - vWorld);
    float near = 1.0 - smoothstep(40.0, 230.0, dist);
    // Medium waves too short for the mesh: they only bend the light, with the same lean-in crests as the swell.
    vec3 n = vNormal;
    // Reuse the analytic slopes already evaluated for grid displacement.
    // Fine ocean ripples below remain per-pixel; the ship fronts use the mesh.
    n.xz -= vWakeSlope;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 d = normalize(vec2(cos(fi * 2.1 + 0.6), sin(fi * 2.1 + 0.6)));
      float k = 6.2832 / (9.0 - fi * 1.7), a = 0.05 - fi * 0.009;
      if(near>0.001){
        vec3 field=swellField(p,vec4(d,k,sqrt(9.8*k)),uTime,fi*1.9);
        n.xz -= a * field.yz * near;
        n.y -= 1.2 * k * a * field.x * near;
      }
    }
    // Two layers of small ripples drifting across each other so the sun breaks into sparkles.
    vec2 rippleWarp = 0.35 * vec2(sin(dot(p,vec2(0.027,0.019))+uTime*0.11),sin(dot(p,vec2(-0.014,0.023))-uTime*0.07));
    vec2 uv1=vec2(0.8*p.x-0.6*p.y,0.6*p.x+0.8*p.y);
    vec2 uv2=vec2(-0.28*p.x+0.96*p.y,-0.96*p.x-0.28*p.y);
    vec3 r1 = texture2D(uRipples, uv1 * 0.045 + rippleWarp + uTime * vec2(0.011, 0.007)).xyz * 2.0 - 1.0;
    vec3 r2 = texture2D(uRipples, uv2 * 0.083 - rippleWarp * 0.73 + uTime * vec2(-0.009, 0.013)).xyz * 2.0 - 1.0;
    // Rotate sampled slopes back to world axes with the UV basis transpose.
    vec2 slope1=vec2(0.8*r1.x+0.6*r1.y,-0.6*r1.x+0.8*r1.y);
    vec2 slope2=vec2(-0.28*r2.x-0.96*r2.y,0.96*r2.x-0.28*r2.y);
    vec2 ripples=(slope1+slope2*0.7)*uRippleK*(0.45*near+0.07);
    n = normalize(n + vec3(ripples.x,0.0,ripples.y));

    vec3 view = normalize(cameraPosition - vWorld);
    float ndv = max(dot(n, view), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

    // Islands: turquoise shallows, sand showing through right at the beach, light rippling on the bottom, and surf.
    float lagoon = 0.0, sand = 0.0, surf = 0.0;
    for (int i = 0; i < ${MAX_ISLES}; i++) {
      if (uIsles[i].z <= 0.0) continue;
      float d = shoreAt(p, i);
      // Outer-coast atlas also masks enclosed basins: their calm water is a
      // separate opaque mesh. Open bays remain connected to the ocean.
      if (uCoastGrid[i].z > 0.0 && d < 0.0) discard;
      lagoon = max(lagoon, 1.0 - smoothstep(0.0, 24.0, d));
      sand = max(sand, 1.0 - smoothstep(-2.0, 7.0, d));
      float band = 1.0 - smoothstep(0.0, 2.2, abs(d - 1.5 - sin(uTime * 1.3 + atan(p.y - uIsles[i].y, p.x - uIsles[i].x) * 5.0) * 0.8));
      surf = max(surf, band * step(-1.0, d));
    }

    // Deep water reads dark looking straight down and lighter toward the horizon; crests lighten it too.
    vec3 body = mix(uDeep, uShallow, clamp(vHeight * 0.5 + 0.35 + (1.0 - ndv) * 0.35, 0.0, 1.0));
    // Sunlight shining through the thin tops of the waves, strongest when you look toward the sun.
    vec2 sunH = normalize(uSunDir.xz), lookH = normalize(-view.xz + 1e-4);
    float back = pow(clamp(dot(lookH, sunH), 0.0, 1.0), 3.0);
    float glow = smoothstep(0.05, 0.95, vHeight) * (0.3 + 0.7 * back) * clamp(1.0 - n.y + 0.35, 0.0, 1.0);
    body = mix(body, uGlow, clamp(glow, 0.0, 1.0) * 0.55);
    body = mix(body, uLagoon, lagoon * 0.85);
    float caustic = pow(1.0 - abs(noise(p * 0.45 + uTime * 0.12) * 2.0 - 1.0), 8.0) + pow(1.0 - abs(noise(p * 0.7 - uTime * 0.1 + 9.0) * 2.0 - 1.0), 8.0);
    body = mix(body, uSand, sand * 0.55);
    body += vec3(0.9, 1.0, 0.95) * caustic * lagoon * 0.18;
    body *= uLight;

    // What the surface mirrors: the sky, and on high quality the islands and ships too.
    vec3 mirror = skyColor(reflect(-view, n));
    // Planar reflection belongs to the near y=0 surface. Fade it with the same
    // weight as geometric waves so the far sea cannot form a second mirror.
    if (uUseRefl > 0.5 && detail > 0.001) {
      vec4 rc = uReflMatrix * vec4(vWorld, 1.0);
      if (rc.w > 0.0) {
        vec2 ruv = rc.xy / rc.w + n.xz * 0.12;
        vec2 edge = smoothstep(vec2(0.0), vec2(0.05), min(ruv, 1.0 - ruv));
        vec4 reflected = texture2D(uRefl, clamp(ruv, 0.001, 0.999));
        // The target contains scene objects over transparent clear. Sky uses
        // skyColor on both water surfaces, avoiding a bright full-width seam.
        mirror = mix(mirror, reflected.rgb / max(reflected.a,0.001), edge.x * edge.y * 0.8 * detail * reflected.a);
      }
    }
    vec3 col = mix(body, mirror, fres * 0.85);

    // Sun glint.
    vec3 h = normalize(uSunDir + view);
    float nh = max(dot(n, h), 0.0);
    col += uSunColor * (pow(nh, 400.0) * 3.0 + pow(nh, 60.0) * 0.05);

    // Foam on wave crests, at the shore, around the hulls and in the wakes.
    float crest = smoothstep(0.78 - uWhite * 0.35, 1.1, vHeight + (noise(p * 0.7 + uTime * 0.3) - 0.5) * 0.4);
    // Breaking fronts have gaps and quiet patches.
    crest *= mix(0.25, 1.0, smoothstep(0.22, 0.72, noise(p * 0.033 + uTime * vec2(0.035,-0.018))));
    float wake = 0.0;
    for (int i = 0; i < ${TRAIL}; i++) {
      vec4 t = uTrail[i];
      if (t.w <= 0.0) continue;
      vec4 shape = uTrailShape[i];
      vec2 off = p - t.xy;
      float along = dot(off, shape.xy), across = dot(off, vec2(-shape.y,shape.x));
      float width = t.w * (0.7 + t.z * 1.1), extent = shape.w + t.z * 2.0;
      if (abs(along) > extent || abs(across) > width * 1.2) continue;
      // A small meander breaks the outline; no noise or texture lookup per patch.
      across += sin(along * 0.8 + dot(t.xy,vec2(1.7,2.3))) * width * 0.15;
      float deposit = 1.0 - smoothstep(0.05, 1.0, length(vec2(along/extent,across/width)));
      wake = max(wake, deposit * pow(1.0-t.z,1.8) * shape.z);
    }
    float ships = max(shipFoam(p, uShips[0], uShipSize[0]), shipFoam(p, uShips[1], uShipSize[1]));
    ships = max(ships, max(bowFoam(p, uShips[0], uShipSize[0]), bowFoam(p, uShips[1], uShipSize[1])));
    // Texture coverage stays porous even when hull, wake and surf overlap.
    float lace = texture2D(uFoam, p * 0.11 + uTime * vec2(0.012, 0.004)).a * 0.65 + texture2D(uFoam, p * 0.27 - uTime * vec2(0.006, 0.015)).a * 0.35;
    float breakup = smoothstep(0.23,0.72,noise(p * 0.19 + uTime * vec2(0.018,-0.011)));
    float grain = smoothstep(0.22,0.8,lace);
    float shipFoamAmount = max(wake * 0.55, ships * 0.7) * mix(0.25,1.0,breakup);
    float foam = max(max(crest * 0.48, surf * 0.64),shipFoamAmount) * grain;
    col = mix(col, vec3(0.95, 0.98, 1.0) * (0.2 + 0.8 * uLight), foam);

    col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sea {
  constructor(scene, sunDir) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const fog = scene.fog;
    this.fog=fog;
    this.uniforms = {
      uTime: { value: 0 },
      uSwell: { value: SWELLS.map(s => new THREE.Vector4(s.dir[0], s.dir[1], s.k, s.speed)) },
      uAmp: { value: SWELLS.map(s => s.amp) },
      uPhase: { value: SWELLS.map(s => s.phase) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color('#fff2d0') },
      uDeep: { value: new THREE.Color('#06374f') },
      uShallow: { value: new THREE.Color('#1d7f99') },
      uLagoon: { value: new THREE.Color('#3fd0c9') },
      uGlow: { value: new THREE.Color('#2fc4b2') },
      uRipples: { value: rippleNormals() },
      uRippleK: { value: 1 },
      uLight: { value: 1 },
      uWhite: { value: 0 },
      uRefl: { value: new THREE.DataTexture(new Uint8Array([120, 160, 200, 255]), 1, 1) },
      uReflMatrix: { value: new THREE.Matrix4() },
      uUseRefl: { value: 0 },
      uFoam: { value: blankFoam() },
      uSand: { value: new THREE.Color('#e9d9a6') },
      uShips: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uShipSize: { value: [new THREE.Vector2(1, 1), new THREE.Vector2(1, 1)] },
      uWakeTime: { value: 0 },
      uSky: { value: new THREE.Color('#6fa8d6') },
      uHorizon: { value: new THREE.Color('#cfe6ef') },
      uFogColor: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
      uIsles: { value: Array.from({ length: MAX_ISLES }, () => new THREE.Vector3()) },
      uCoastAtlas: { value: new THREE.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1) },
      uCoastGrid: { value: Array.from({ length: MAX_ISLES }, () => new THREE.Vector3()) },
      uCoastRot: { value: Array.from({ length: MAX_ISLES }, () => new THREE.Vector2(1, 0)) },
      uSeaCenter: { value: new THREE.Vector2() },
      uFarPlane: { value: 0 },
      uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4()) },
      uTrailShape: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4()) },
    };
    this.uniforms.uRefl.value.needsUpdate = true;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment }));
    this.backdrop=makeSeaBackdrop(new THREE.ShaderMaterial({ uniforms: {...this.uniforms,uFarPlane:{value:1}}, vertexShader:vertex, fragmentShader:fragment }));
    scene.add(this.backdrop);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.wakes = new WakeTrail();
    // Артем's ripple normal map and foam pattern take over from the generated stand-ins once they are in.
    const tex = new THREE.TextureLoader(), base = import.meta.env ? import.meta.env.BASE_URL : './';
    tex.load(`${base}textures/sea/sea_ripple_normal_1024.png`, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 4;
      this.uniforms.uRipples.value = t;
      this.uniforms.uRippleK.value = .2;
    });
    tex.load(`${base}textures/sea/sea_foam_white_alpha_512.png`, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      this.uniforms.uFoam.value = t;
    });
  }

  setIslands(list) {
    if (list.length > MAX_ISLES) throw new Error('Sea island capacity exceeded');
    const atlas = coastAtlas(list.map(isl => isl.userData.terrain), MAX_ISLES);
    const texture = new THREE.DataTexture(atlas.data, atlas.width, atlas.height);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.uniforms.uCoastAtlas.value.dispose(); this.uniforms.uCoastAtlas.value = texture;
    for (let i = 0; i < MAX_ISLES; i++) {
      const isl = list[i], shape = isl?.userData.terrain;
      this.uniforms.uIsles.value[i].set(isl?.position.x ?? 0, isl?.position.z ?? 0, isl?.userData.shore ?? 0);
      this.uniforms.uCoastGrid.value[i].set(shape?.minX ?? 0, shape?.minZ ?? 0, shape?.cell ?? 0);
      this.uniforms.uCoastRot.value[i].set(Math.cos(shape?.yaw ?? 0), Math.sin(shape?.yaw ?? 0));
    }
  }

  // Ships leave expanding wavelets and fading foam at their actual past positions.
  addWake(dt, ships) {
    const sources = ships.slice(0,2).map(s => ({ id:s, x:s.pos.x, z:s.pos.z, heading:s.heading, speed:s.speed,
      length:s.mesh.userData.length, width:s.mesh.userData.width, active:s.sinking < .3 && !!s.mesh.parent }));
    for (let i=0;i<2;i++) {
      const s=sources[i];
      this.uniforms.uShips.value[i].set(s?.x??0,s?.z??0,s?.heading??0,s?.active?s.speed:0);
      this.uniforms.uShipSize.value[i].set(s?.length/2||0,s?.width/2||0);
    }
    const trail = this.wakes.update(dt,sources), u = this.uniforms.uTrail.value, shape = this.uniforms.uTrailShape.value;
    wakeSurface.points=trail; wakeSurface.ships=sources;
    for (let i = 0; i < TRAIL; i++) {
      const t = trail[i];
      if (t) { u[i].set(t.x,t.z,t.age,t.width); shape[i].set(t.fx,t.fz,t.strength,t.extent); }
      else { u[i].set(0,0,0,0); shape[i].set(0,0,0,0); }
    }
  }

  // The grid follows the camera in whole cells so the waves stay put in the world.
  update(t, center) {
    this.uniforms.uTime.value = t;
    // One period of the bow waves, so float precision holds however long the voyage.
    this.uniforms.uWakeTime.value = wakeSurface.time = t % (Math.PI * 2 / (BOW_WAVE.k * BOW_WAVE.run));
    SWELLS.forEach((s, i) => { this.uniforms.uAmp.value[i] = s.amp * swell.k; });
    this.uniforms.uWhite.value = (swell.k - 1) * 1.1;
    this.mesh.position.set(Math.round(center.x / STEP) * STEP, 0, Math.round(center.z / STEP) * STEP);
    this.backdrop.position.set(this.mesh.position.x,0,this.mesh.position.z);
    this.uniforms.uSeaCenter.value.set(this.mesh.position.x,this.mesh.position.z);
    this.uniforms.uFogNear.value=this.fog.near; this.uniforms.uFogFar.value=this.fog.far;
  }
}

// Soft low-poly clouds far off.
export function addClouds(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, emissive: '#c8dbe6', emissiveIntensity: .35, fog: false });
  const clouds = new THREE.Group();
  let seed = 5;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(8 + rnd() * 9, 1), mat);
      puff.position.set((j - n / 2) * 10 + rnd() * 6, rnd() * 6, rnd() * 8);
      puff.scale.y = .6;
      c.add(puff);
    }
    const a = rnd() * Math.PI * 2, r = 380 + rnd() * 380;
    c.position.set(Math.cos(a) * r, 70 + rnd() * 70, Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  scene.add(clouds);
  clouds.userData.mat = mat;
  return clouds;
}

export function addSky(scene, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.2; u.rayleigh.value = 1.1; u.mieCoefficient.value = .003; u.mieDirectionalG.value = .86;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(72), THREE.MathUtils.degToRad(160));
  u.sunPosition.value.copy(sun);
  scene.add(sky);
  scene.fog = new THREE.Fog('#b9dbe6', 180, 900);

  const hemi = new THREE.HemisphereLight('#d6ecff', '#1d5a6a', 1.25);
  scene.add(hemi);
  const light = new THREE.DirectionalLight('#fff1d6', 2.6);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -.0005;
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -60; cam.right = cam.top = 60; cam.near = 1; cam.far = 400;
  scene.add(light, light.target);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .62;
  return { light, sun, sky, hemi };
}
