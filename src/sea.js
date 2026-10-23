import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// A few long swells added together. Ships read waveHeight() to bob on the same waves the shader draws.
const SWELLS = [
  { dir: [1, .3], len: 38, amp: .55, speed: 1.1 },
  { dir: [-.4, 1], len: 21, amp: .3, speed: 1.5 },
  { dir: [.8, -.7], len: 11, amp: .14, speed: 2.2 },
  { dir: [-1, -.2], len: 6.5, amp: .06, speed: 3.1 },
];
for (const s of SWELLS) { const l = Math.hypot(...s.dir); s.dir = [s.dir[0] / l, s.dir[1] / l]; s.k = Math.PI * 2 / s.len; }

export function waveHeight(x, z, t) {
  let h = 0;
  for (const s of SWELLS) h += s.amp * Math.sin((x * s.dir[0] + z * s.dir[1]) * s.k + t * s.speed);
  return h;
}

const SIZE = 700, SEG = 220, STEP = SIZE / SEG;
export const MAX_ISLES = 8, TRAIL = 28;

const CHOP = 1.8; // how far crests lean together (Gerstner); 0 gives plain sines

const vertex = /* glsl */`
  uniform float uTime;
  uniform vec4 uSwell[4];   // dir.x, dir.y, k, speed
  uniform float uAmp[4];
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 base = w.xz;
    float h = 0.0;
    vec3 n = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < 4; i++) {
      vec2 d = uSwell[i].xy;
      float k = uSwell[i].z, a = uAmp[i];
      float ph = dot(base, d) * k + uTime * uSwell[i].w;
      float s = sin(ph), c = cos(ph);
      h += a * s;
      // Gerstner: points slide toward the crest, so crests sharpen and troughs widen.
      w.xz += ${CHOP.toFixed(2)} * a * d * c;
      n.xz -= d * k * a * c;
      n.y -= ${CHOP.toFixed(2)} * k * a * s;
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
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uIsles[${MAX_ISLES}];   // x, z, shore radius
  uniform vec4 uTrail[${TRAIL}];       // x, z, age 0..1, width
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    // Two layers of ripples drifting across each other so the sun breaks into sparkles; they calm down with distance.
    vec2 p = vWorld.xz;
    float dist = length(cameraPosition - vWorld);
    vec3 r1 = texture2D(uRipples, p * 0.045 + uTime * vec2(0.011, 0.007)).xyz * 2.0 - 1.0;
    vec3 r2 = texture2D(uRipples, p * 0.083 + uTime * vec2(-0.009, 0.013)).xyz * 2.0 - 1.0;
    float ripple = 0.85 * (1.0 - smoothstep(40.0, 230.0, dist)) + 0.12;
    vec3 n = normalize(vNormal + vec3(r1.x + r2.x * 0.7, 0.0, r1.y + r2.y * 0.7) * ripple);

    vec3 view = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);

    // Shallow turquoise water and surf around the islands.
    float lagoon = 0.0, surf = 0.0;
    for (int i = 0; i < ${MAX_ISLES}; i++) {
      if (uIsles[i].z <= 0.0) continue;
      float d = length(p - uIsles[i].xy) - uIsles[i].z;
      lagoon = max(lagoon, 1.0 - smoothstep(0.0, 22.0, d));
      float band = 1.0 - smoothstep(0.0, 2.2, abs(d - 1.5 - sin(uTime * 1.3 + atan(p.y - uIsles[i].y, p.x - uIsles[i].x) * 5.0) * 0.8));
      surf = max(surf, band * step(-1.0, d));
    }

    vec3 body = mix(uDeep, uShallow, clamp(vHeight * 0.6 + 0.45, 0.0, 1.0));
    // Sunlight shining through the thin tops of the waves, strongest when you look toward the sun.
    vec2 sunH = normalize(uSunDir.xz), lookH = normalize(-view.xz + 1e-4);
    float back = pow(clamp(dot(lookH, sunH), 0.0, 1.0), 3.0);
    float glow = smoothstep(0.05, 0.95, vHeight) * (0.3 + 0.7 * back) * clamp(1.0 - n.y + 0.35, 0.0, 1.0);
    body = mix(body, uGlow, clamp(glow, 0.0, 1.0) * 0.55);
    body = mix(body, uLagoon, lagoon * 0.85);
    vec3 refl = mix(uHorizon, uSky, clamp(reflect(-view, n).y * 2.0, 0.0, 1.0));
    vec3 col = mix(body, refl, fres * 0.5);

    // Sun glint.
    vec3 h = normalize(uSunDir + view);
    float spec = pow(max(dot(n, h), 0.0), 320.0) * 2.4 + pow(max(dot(n, h), 0.0), 60.0) * 0.06;
    col += uSunColor * spec;

    // Foam on wave crests, at the shore and in the ship's wake.
    float crest = smoothstep(0.78, 1.1, vHeight + (noise(p * 0.7 + uTime * 0.3) - 0.5) * 0.4);
    float wake = 0.0;
    for (int i = 0; i < ${TRAIL}; i++) {
      vec4 t = uTrail[i];
      if (t.w <= 0.0) continue;
      float d = length(p - t.xy);
      float w = t.w * (0.5 + t.z * 1.6);
      wake = max(wake, (1.0 - smoothstep(w * 0.4, w, d)) * (1.0 - t.z));
    }
    float foamTex = noise(p * 3.0 + uTime * 0.4) * 0.6 + noise(p * 7.0 - uTime) * 0.4;
    float foam = clamp(crest * 0.55 + surf * 0.95 + wake * 0.7, 0.0, 1.0) * smoothstep(0.25, 0.6, foamTex + 0.2);
    col = mix(col, vec3(0.95, 0.98, 1.0), foam);

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
    this.uniforms = {
      uTime: { value: 0 },
      uSwell: { value: SWELLS.map(s => new THREE.Vector4(s.dir[0], s.dir[1], s.k, s.speed)) },
      uAmp: { value: SWELLS.map(s => s.amp) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color('#fff2d0') },
      uDeep: { value: new THREE.Color('#06374f') },
      uShallow: { value: new THREE.Color('#1d7f99') },
      uLagoon: { value: new THREE.Color('#3fd0c9') },
      uGlow: { value: new THREE.Color('#2fc4b2') },
      uRipples: { value: rippleNormals() },
      uSky: { value: new THREE.Color('#6fa8d6') },
      uHorizon: { value: new THREE.Color('#cfe6ef') },
      uFogColor: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
      uIsles: { value: Array.from({ length: MAX_ISLES }, () => new THREE.Vector3()) },
      uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4()) },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.trail = [];
    this.trailT = 0;
  }

  setIslands(list) {
    list.slice(0, MAX_ISLES).forEach((isl, i) => this.uniforms.uIsles.value[i].set(isl.position.x, isl.position.z, isl.userData.shore));
  }

  // Ships leave a fading line of foam behind them.
  addWake(dt, ships) {
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = .09;
      for (const s of ships) {
        if (Math.abs(s.speed) < 1 || s.sinking >= 1) continue;
        const back = s.forward().multiplyScalar(-s.mesh.userData.length * .45);
        this.trail.push({ x: s.pos.x + back.x, z: s.pos.z + back.z, age: 0, w: s.mesh.userData.width * .55 * Math.min(1, Math.abs(s.speed) / 8) });
      }
    }
    for (const t of this.trail) t.age += dt / 3.2;
    this.trail = this.trail.filter(t => t.age < 1).slice(-TRAIL);
    const u = this.uniforms.uTrail.value;
    for (let i = 0; i < TRAIL; i++) {
      const t = this.trail[i];
      if (t) u[i].set(t.x, t.z, t.age, t.w); else u[i].set(0, 0, 0, 0);
    }
  }

  // The grid follows the camera in whole cells so the waves stay put in the world.
  update(t, center) {
    this.uniforms.uTime.value = t;
    this.mesh.position.set(Math.round(center.x / STEP) * STEP, 0, Math.round(center.z / STEP) * STEP);
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
  scene.fog = new THREE.Fog('#b9dbe6', 110, 340);

  scene.add(new THREE.HemisphereLight('#d6ecff', '#1d5a6a', 1.25));
  const light = new THREE.DirectionalLight('#fff1d6', 2.6);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -.0005;
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -60; cam.right = cam.top = 60; cam.near = 1; cam.far = 400;
  scene.add(light, light.target);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .62;
  return { light, sun };
}
