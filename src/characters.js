import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Артем's character models (public/models/characters), squeezed for the web with gltf-transform:
// meshopt geometry and 256px WebP maps. The source files are Z-up, so each one is stood upright here,
// scaled to a height, set on its feet at y = 0 and turned to face +Z.
// Rigged ones (so far the captain) are already Y-up and facing +Z; they come with an AnimationMixer playing Idle.
const base = import.meta.env ? import.meta.env.BASE_URL : './';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sources = new Map();

function source(id) {
  if (!sources.has(id)) sources.set(id, loader.loadAsync(`${base}models/characters/${id}.glb`).then(g => {
    // The early rigged exports leave out normals and metalness (so everything comes out as bare metal);
    // the Meshy captain brings his own metallic-roughness map.
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      if (g.animations.length && !o.material.metalnessMap) { o.material.metalness = /gold|metal|steel|iron/i.test(o.material.name) ? .5 : 0; o.material.roughness = .8; }
    });
    return g;
  }));
  return sources.get(id);
}

// character('captain', 1.7) → Promise of a Group standing at the origin.
export async function character(id, height = 1.7) {
  const src = await source(id), rigged = src.animations.length > 0;
  const model = rigged ? SkeletonUtils.clone(src.scene) : src.scene.clone(true);
  if (!rigged) model.rotation.x = -Math.PI / 2;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(height / size.y);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  model.position.x -= (box.min.x + box.max.x) / 2;
  model.position.z -= (box.min.z + box.max.z) / 2;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const g = new THREE.Group();
  g.add(model);
  g.userData.id = id;
  g.userData.height = height;
  if (rigged) {
    const mixer = new THREE.AnimationMixer(model);
    g.userData.mixer = mixer;
    g.userData.actions = Object.fromEntries(src.animations.map(a => [a.name, mixer.clipAction(a)]));
    const idle = g.userData.actions.Idle;
    if (idle) { idle.play(); mixer.setTime(Math.random() * idle.getClip().duration); }
    // Finger poses ride on their own bones on top of the body clip; at rest the hands hang relaxed.
    g.userData.actions.HandsRelaxed?.play();
  }
  return g;
}

// Head-and-shoulders portraits for dialogs, drawn once through the game's own renderer.
const portraits = new Map();
export function portrait(renderer, id) {
  if (!portraits.has(id)) portraits.set(id, character(id, 2).then(fig => {
    const size = 256;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a20', 2.2));
    const key = new THREE.DirectionalLight('#fff1d6', 2.4);
    key.position.set(1.5, 3, 4);
    scene.add(key, fig);
    const cam = new THREE.PerspectiveCamera(24, 1, .1, 50);
    cam.position.set(.35, 1.62, 3.4);
    cam.lookAt(0, 1.5, 0);
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const before = renderer.getRenderTarget();
    const tone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
    renderer.setRenderTarget(before);
    renderer.toneMapping = tone;
    renderer.setClearColor(0x000000, 1);
    target.dispose();
    // The pixels come out bottom row first.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }));
  return portraits.get(id);
}
