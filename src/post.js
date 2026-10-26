import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// How the sea view is drawn, in three steps of quality:
//   low    the scene straight to the screen, as before (weak phones)
//   medium bloom on glints and lamps, sun shafts, gentle vignette
//   high   medium plus the water mirroring islands and ships, and finer edges (4x MSAA)
// The match-3 board is drawn on its own and is not touched.
export const QUALITY = ['low', 'medium', 'high'];

export function pickQuality() {
  try {
    const q = new URLSearchParams(location.search).get('q') || localStorage.getItem('quality');
    if (QUALITY.includes(q)) return q;
  } catch (e) { /* storage may be blocked */ }
  const phone = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  return phone ? 'medium' : 'high';
}

const Finish = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(.5, .5) }, uRays: { value: 0 }, uVig: { value: .2 }, uAspect: { value: 1 }, uThresh: { value: 6 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uRays, uVig, uAspect, uThresh;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uRays > 0.001) {
        // Sun shafts: march toward the sun, gathering whatever is brighter than the sky around it.
        vec2 d = (uSun - vUv) * 0.8 / 18.0;
        vec2 p = vUv;
        vec3 acc = vec3(0.0);
        float w = 1.0;
        for (int i = 0; i < 18; i++) {
          p += d;
          vec3 s = texture2D(tDiffuse, clamp(p, 0.0, 1.0)).rgb;
          float l = max(dot(s, vec3(0.333)) - uThresh, 0.0);
          acc += normalize(s + 1e-4) * min(l, 3.0) * w;
          w *= 0.93;
        }
        float near = 1.0 - smoothstep(0.0, 1.5, length((uSun - vUv) * vec2(uAspect, 1.0)));
        c += acc / 18.0 * uRays * near * near;
      }
      float v = length((vUv - 0.5) * vec2(uAspect * 0.8, 1.0));
      c *= 1.0 - uVig * smoothstep(0.35, 0.95, v);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  constructor(renderer, world, quality) {
    this.renderer = renderer;
    this.world = world;
    this.quality = quality;
    this.size = new THREE.Vector2(1, 1);
    this.build();
  }

  build() {
    const { renderer, world } = this;
    const q = this.quality;
    this.composer = null;
    this.refl = null;
    world.sea.uniforms.uUseRefl.value = 0;
    if (q === 'low') return;

    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    const composer = this.composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.addPass(new RenderPass(world.scene, world.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), .32, .5, 2.7);
    composer.addPass(this.bloom);
    this.finish = new ShaderPass(Finish);
    composer.addPass(this.finish);
    composer.addPass(new OutputPass());

    if (q === 'high') {
      this.refl = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
      this.vcam = new THREE.PerspectiveCamera();
      this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.2);
      world.sea.uniforms.uRefl.value = this.refl.texture;
    }
    this.resize();
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.dispose();
    this.quality = q;
    try { localStorage.setItem('quality', q); } catch (e) { /* optional */ }
    this.build();
  }

  dispose() {
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    if (this.refl) this.refl.dispose();
    this.composer = this.refl = null;
  }

  resize() {
    if (!this.composer) return;
    const { renderer } = this;
    renderer.getDrawingBufferSize(this.size);
    const { x: w, y: h } = this.size;
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.bloom.setSize(w / 2, h / 2);
    this.finish.uniforms.uAspect.value = w / h;
    if (this.refl) this.refl.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
  }

  // The scene seen from below the water, for the surface to mirror.
  renderReflection() {
    const { renderer, world, vcam, refl } = this;
    const cam = world.camera;
    if (cam.position.y < .5) { world.sea.uniforms.uUseRefl.value = 0; return; }
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    vcam.position.set(cam.position.x, -cam.position.y, cam.position.z);
    vcam.up.set(up.x, -up.y, up.z);
    vcam.lookAt(cam.position.x + f.x, -(cam.position.y + f.y), cam.position.z + f.z);
    vcam.near = cam.near; vcam.far = cam.far;
    vcam.projectionMatrix.copy(cam.projectionMatrix);
    vcam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    vcam.updateMatrixWorld();
    const m = world.sea.uniforms.uReflMatrix.value;
    m.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
    m.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);

    const hidden = [world.sea.mesh,world.sea.backdrop,world.atmo.rain,world.atmo.sky,world.atmo.dome,
      world.atmo.clouds,world.atmo.stars,world.atmo.moon,world.atmo.moonGlow].filter(Boolean);
    const visible = hidden.map(m=>m.visible), backgroundWas=world.scene.background;
    const planesWas = renderer.clippingPlanes, shadowsWas = renderer.shadowMap.autoUpdate;
    const clearWas=renderer.getClearColor(new THREE.Color()), alphaWas=renderer.getClearAlpha();
    // Neither water surface may sample the reflection target while it is being
    // written. Preserve visibility, including a deliberately hidden far plane.
    world.sea.uniforms.uUseRefl.value = 0;
    try {
      hidden.forEach(m=>{m.visible=false}); world.scene.background=null; renderer.setClearColor(0,0);
      renderer.clippingPlanes=[this.plane]; renderer.shadowMap.autoUpdate=false;
      renderer.setRenderTarget(refl); renderer.clear(); renderer.render(world.scene,vcam);
    } finally {
      renderer.setRenderTarget(null); renderer.shadowMap.autoUpdate=shadowsWas;
      renderer.clippingPlanes=planesWas;
      hidden.forEach((m,i)=>{m.visible=visible[i]}); world.scene.background=backgroundWas;
      renderer.setClearColor(clearWas,alphaWas);
    }
    world.sea.uniforms.uUseRefl.value = 1;
  }

  render() {
    const { renderer, world } = this;
    if (!this.composer) { renderer.render(world.scene, world.camera); return; }
    if (this.refl) this.renderReflection();
    // Where the sun is on screen, and whether it is in front of the camera at all.
    const cam = world.camera, sun = world.atmo.sunDir;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const p = cam.position.clone().addScaledVector(sun, 1000).project(cam);
    const facing = THREE.MathUtils.smoothstep(dir.dot(sun), 0, .35);
    const up = THREE.MathUtils.smoothstep(world.atmo.elev, -2, 6);
    const u = this.finish.uniforms;
    u.uSun.value.set(p.x * .5 + .5, p.y * .5 + .5);
    u.uRays.value = facing * up * (1 - world.atmo.storm) * .55;
    // Only what ends up brighter than white on screen blooms: sun glints, lamps, lightning; never the sky itself.
    const exposure = renderer.toneMappingExposure;
    this.bloom.threshold = 1.7 / exposure;
    u.uThresh.value = 5 / exposure;
    this.composer.render();
  }
}
