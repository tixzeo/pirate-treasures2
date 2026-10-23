import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// A few long swells added together. Ships read the same function to bob on the waves.
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

const SIZE = 600, SEG = 150, STEP = SIZE / SEG;

export class Sea {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: .6, metalness: .05, flatShading: true,
    }));
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.base = geo.attributes.position.array.slice();
    this.deep = new THREE.Color('#0c4a66');
    this.crest = new THREE.Color('#5fb7c9');
    this.foam = new THREE.Color('#e6f6f7');
  }

  // The grid follows the camera in whole cells so the waves stay put in the world.
  update(t, center) {
    const ox = Math.round(center.x / STEP) * STEP, oz = Math.round(center.z / STEP) * STEP;
    this.mesh.position.set(ox, 0, oz);
    const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3] + ox, z = this.base[i * 3 + 2] + oz;
      const h = waveHeight(x, z, t);
      pos.array[i * 3 + 1] = h;
      const k = THREE.MathUtils.clamp((h + .7) / 1.4, 0, 1);
      c.copy(this.deep).lerp(this.crest, k);
      if (h > .75) c.lerp(this.foam, Math.min(1, (h - .75) * 3));
      col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

export function addSky(scene, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = .004; u.mieDirectionalG.value = .85;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(200));
  u.sunPosition.value.copy(sun);
  scene.add(sky);
  scene.fog = new THREE.Fog('#a9cfdc', 90, 300);

  scene.add(new THREE.HemisphereLight('#cfe8ff', '#1d4a5a', 1.1));
  const light = new THREE.DirectionalLight('#fff1d6', 2.2);
  light.position.copy(sun).multiplyScalar(120);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -60; cam.right = cam.top = 60; cam.near = 1; cam.far = 400;
  scene.add(light, light.target);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .6;
  return { light, sun };
}
