import * as THREE from 'three';
import { swell } from './sea.js';
import { glows } from './kit.js';
import { sfx } from './sound.js';

// Time of day and weather: the sun, moon and stars cross the sky, the light, fog and water colours follow, lanterns
// come on at dusk, and storms bring rain, lightning, higher swells and heavier cloud.
// The palette is keyed by the sun's elevation in degrees, so dawn and dusk share one set of colours.
const c = h => new THREE.Color(h);
const KEYS = [
  { e: -20, horizon: c('#0b1630'), zenith: c('#040815'), fog: c('#0b1428'), hemiSky: c('#5068a8'), hemiGround: c('#0e1e2a'), hemi: .85, key: c('#a9bff0'), keyI: 1.0, exposure: 1.1, light: .22, turb: 2, rayleigh: .3, mie: .001, mieG: .7 },
  { e: -7, horizon: c('#3a3358'), zenith: c('#101a3c'), fog: c('#2e2c4c'), hemiSky: c('#6a6aa4'), hemiGround: c('#16222e'), hemi: .8, key: c('#a9bff0'), keyI: .95, exposure: .95, light: .28, turb: 4, rayleigh: 1.4, mie: .004, mieG: .85 },
  { e: 0, horizon: c('#ff9a62'), zenith: c('#3d5a96'), fog: c('#d49a84'), hemiSky: c('#ffc9a0'), hemiGround: c('#2a4452'), hemi: .95, key: c('#ff9a5a'), keyI: 1.9, exposure: .68, light: .6, turb: 6, rayleigh: 2.6, mie: .006, mieG: .9 },
  { e: 9, horizon: c('#ffd7ae'), zenith: c('#5f8fcc'), fog: c('#e0c6ac'), hemiSky: c('#ffe2c8'), hemiGround: c('#235566'), hemi: 1.1, key: c('#ffd5a6'), keyI: 2.3, exposure: .64, light: .85, turb: 3.5, rayleigh: 1.6, mie: .004, mieG: .88 },
  { e: 26, horizon: c('#cfe6ef'), zenith: c('#6fa8d6'), fog: c('#b9dbe6'), hemiSky: c('#d6ecff'), hemiGround: c('#1d5a6a'), hemi: 1.25, key: c('#fff1d6'), keyI: 2.6, exposure: .62, light: 1, turb: 2.2, rayleigh: 1.1, mie: .003, mieG: .86 },
  { e: 55, horizon: c('#d4eaf2'), zenith: c('#6aa4d6'), fog: c('#bddde8'), hemiSky: c('#dcefff'), hemiGround: c('#1d5a6a'), hemi: 1.3, key: c('#fff6e6'), keyI: 2.8, exposure: .6, light: 1, turb: 2, rayleigh: 1, mie: .003, mieG: .86 },
];
const STORM = { fog: c('#6f7c86'), fogNear: 30, fogFar: 190, cloud: c('#6a727a') };

const tmp = c('#000');
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

// Blend of the two keys around an elevation.
function sample(e) {
  const i = Math.max(0, Math.min(KEYS.length - 2, KEYS.findIndex(k => k.e > e) - 1));
  const a = KEYS[e <= KEYS[0].e ? 0 : i], b = KEYS[e >= KEYS[KEYS.length - 1].e ? KEYS.length - 1 : i + 1];
  const t = a === b ? 0 : THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1);
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'e') continue;
    out[k] = a[k].isColor ? a[k].clone().lerp(b[k], t) : THREE.MathUtils.lerp(a[k], b[k], t);
  }
  return out;
}

export class Atmosphere {
  constructor(world, parts) {
    this.world = world;
    this.scene = world.scene;
    Object.assign(this, parts);          // light, sky, hemi, clouds, sea
    this.hour = 16;                      // 16:00: the afternoon sun, a little above where it stood before
    this.auto = true;
    this.dayLength = 900;                // seconds for a full day
    this.storm = 0;                      // 0 clear .. 1 storm, eased toward stormGoal
    this.stormGoal = 0;
    this.weatherAuto = true;
    this.weatherT = 60;
    this.flash = 0;
    this.nextBolt = 8;
    this.fogBase = { near: this.scene.fog.near, far: this.scene.fog.far };
    this.sunDir = new THREE.Vector3();
    this.keyDir = new THREE.Vector3();
    this.elev = 25;
    this.night = 0;

    // Stars and moon ride along with the camera so they never come nearer.
    this.dome = new THREE.Group();
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(a), Math.abs(u) * .96 + .04, r * Math.sin(a)].map(v => v * 1800), i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe8ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(55, 40), new THREE.MeshBasicMaterial({ color: '#eef2ff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.moonGlow = new THREE.Mesh(new THREE.CircleGeometry(190, 40), new THREE.MeshBasicMaterial({ color: '#8fa6e0', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.dome.add(this.stars, this.moonGlow, this.moon);
    this.dome.traverse(o => { o.frustumCulled = false; o.renderOrder = -1; });
    this.scene.add(this.dome);

    // The physical sky model goes muddy brown once the sun is far below the horizon, and has no weather:
    // past dusk it hands over to a plain night gradient, and storm cloud greys it over.
    const sm = this.sky.material;
    Object.assign(sm.uniforms, { uNight: { value: 0 }, uNightTop: { value: c('#000') }, uNightLow: { value: c('#000') }, uOver: { value: 0 }, uOverCol: { value: c('#000') } });
    sm.fragmentShader = sm.fragmentShader
      .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float uNight, uOver;\nuniform vec3 uNightTop, uNightLow, uOverCol;')
      .replace('gl_FragColor = vec4( retColor, 1.0 );', `
        vec3 nightCol = mix(uNightLow, uNightTop, pow(max(direction.y, 0.0), 0.45));
        retColor = mix(retColor, nightCol, uNight);
        retColor = mix(retColor, uOverCol, uOver);
        gl_FragColor = vec4(retColor, 1.0);`);
    sm.needsUpdate = true;

    this.rain = this.makeRain();
    this.scene.add(this.rain);
    this.apply(0);
  }

  makeRain() {
    const N = 2600, pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('end', new THREE.BufferAttribute(end, 1));
    this.rainUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(70, 45, 70) }, uWind: { value: new THREE.Vector3(-5, -26, 3) }, uK: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        uniform float uTime; uniform vec3 uCam, uBox, uWind;
        attribute float end; varying float vA;
        void main() {
          vec3 p = position * uBox + uWind * uTime;
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          p -= uWind * 0.045 * end;
          vA = 1.0 - end * 0.8;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uK; varying float vA;
        void main() { gl_FragColor = vec4(0.78, 0.86, 0.94, 0.42 * vA * uK); }`,
    });
    const r = new THREE.LineSegments(g, m);
    r.frustumCulled = false;
    r.visible = false;
    return r;
  }

  setTime(h) { this.hour = THREE.MathUtils.euclideanModulo(h, 24); this.apply(0); }
  setWeather(w) {
    this.weatherAuto = w === 'auto';
    if (w === 'clear') this.stormGoal = 0;
    if (w === 'cloudy') this.stormGoal = .4;
    if (w === 'storm') this.stormGoal = 1;
  }

  update(dt, camera) {
    if (this.auto) this.hour = (this.hour + dt * 24 / this.dayLength) % 24;
    // Weather drifts between clear, overcast and storm on its own; mostly clear.
    if (this.weatherAuto) {
      this.weatherT -= dt;
      if (this.weatherT <= 0) {
        const r = Math.random();
        this.stormGoal = r < .55 ? 0 : r < .82 ? .4 : 1;
        this.weatherT = 70 + Math.random() * 110;
      }
    }
    this.storm += (this.stormGoal - this.storm) * Math.min(1, dt * .25);
    if (Math.abs(this.storm - this.stormGoal) < .002) this.storm = this.stormGoal;
    this.apply(dt, camera);
  }

  apply(dt, camera) {
    const h = this.hour, e = 50 * Math.sin(2 * Math.PI * (h - 6) / 24), el = THREE.MathUtils.degToRad(e);
    const az = Math.PI / 2 + (h - 6) / 12 * Math.PI;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const moonDir = this.sunDir.clone().negate();
    const k = sample(e), st = this.storm;
    this.elev = e;
    this.night = 1 - smooth(e, -6, 8);

    // The key light is the sun, or the moon once the sun is well down; it fades through the swap.
    const useSun = e > -4;
    this.keyDir.copy(useSun ? this.sunDir : moonDir);
    const swapFade = smooth(Math.abs(e + 4), 0, 2.2);
    // Lightning: a short burst lighting everything from above.
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (st > .55) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 5 + Math.random() * 11;
        setTimeout(() => sfx('thunder'), 500 + Math.random() * 1500);
      }
    }
    const gloom = 1 - .45 * st, keyDim = 1 - .8 * st;

    this.light.color.copy(k.key);
    this.light.intensity = k.keyI * keyDim * swapFade;
    this.hemi.color.copy(k.hemiSky).lerp(tmp.set('#8e9aa4'), st * .6);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemi * gloom + this.flash * 3.2;
    this.renderer.toneMappingExposure = k.exposure * (1 + this.flash * .35);

    // Sky model: red at the horizon at dusk, thin air at night.
    const su = this.sky.material.uniforms;
    su.turbidity.value = k.turb + st * 6; su.rayleigh.value = k.rayleigh * (1 - st * .6);
    su.mieCoefficient.value = k.mie + st * .01; su.mieDirectionalG.value = k.mieG;
    su.sunPosition.value.copy(this.sunDir);
    su.uNight.value = smooth(-e, 1, 12);
    su.uNightTop.value.copy(k.zenith);
    su.uNightLow.value.copy(k.horizon);
    su.uOver.value = st * .8;
    su.uOverCol.value.copy(STORM.fog).multiplyScalar(.3 + .7 * k.light).addScalar(this.flash * .4);

    // Fog follows the horizon colour, and closes in under storm cloud.
    const fog = this.scene.fog;
    fog.color.copy(k.fog).lerp(tmp.copy(STORM.fog).multiplyScalar(.35 + .65 * k.light), st * .75);
    fog.color.addScalar(this.flash * .18);
    fog.near = THREE.MathUtils.lerp(this.fogBase.near, STORM.fogNear, st);
    fog.far = THREE.MathUtils.lerp(this.fogBase.far, STORM.fogFar, st);

    // Water.
    const u = this.sea.uniforms;
    u.uSunDir.value.copy(this.keyDir);
    u.uSunColor.value.copy(k.key).multiplyScalar(k.keyI / 2.6 * keyDim * (useSun ? 1 : .8));
    u.uSky.value.copy(k.zenith).lerp(STORM.fog, st * .7);
    u.uHorizon.value.copy(k.horizon).lerp(STORM.fog, st * .7);
    u.uLight.value = k.light * (1 - .3 * st) + this.flash * .5;
    swell.k = 1 + .9 * st;

    // Clouds darken and sink with the weather and the light.
    const cm = this.clouds.userData.mat;
    cm.color.copy(tmp.set('#ffffff').lerp(STORM.cloud, st)).multiplyScalar(.25 + .75 * k.light);
    cm.emissive.copy(tmp.set('#c8dbe6').lerp(k.horizon, .5)).multiplyScalar(k.light * (1 - .5 * st));
    cm.emissiveIntensity = .35 + this.flash * 2;
    this.clouds.position.y = -st * 22;
    this.clouds.scale.y = 1 + st * .6;

    // Stars, moon, lamps.
    this.stars.material.opacity = smooth(-e, 4, 14) * (1 - st);
    const moonUp = THREE.MathUtils.clamp(moonDir.y * 3, 0, 1);
    this.moon.material.opacity = moonUp * smooth(-e, 0, 8) * (1 - st * .8);
    this.moonGlow.material.opacity = moonUp * smooth(-e, 0, 8) * .22 * (1 - st);
    this.moon.position.copy(moonDir).multiplyScalar(1700); this.moon.lookAt(0, 0, 0);
    this.moonGlow.position.copy(moonDir).multiplyScalar(1690); this.moonGlow.lookAt(0, 0, 0);
    for (const g of glows) g.mat.emissiveIntensity = g.k * (.3 + 3.2 * this.night + st * .8);

    if (camera) {
      this.dome.position.copy(camera.position);
      this.sky.position.copy(camera.position);
      this.rainUniforms.uCam.value.copy(camera.position);
    }
    this.rainUniforms.uTime.value += dt;
    this.rainUniforms.uK.value = smooth(st, .35, .9);
    this.rain.visible = st > .4;
  }
}
