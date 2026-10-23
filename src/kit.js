import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Артем's World Kit (public/models/kit): ships, islands, docks, props and match-3 pieces.
// Y up, ship bows to -Z with the waterline at y = 0, docks run along +Z. Geometry is meshopt-compressed.
// Everything loads once at start; until then the game shows its own built-in shapes.
const base = import.meta.env ? import.meta.env.BASE_URL : './';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const FILES = [
  'player_brigantine', 'scar_karakatitsa',
  'island_small_palm_cove', 'island_medium_lagoon', 'island_large_volcanic',
  'dock_pine', 'dock_royal', 'dock_ruined', 'palm_tree', 'rock_cluster',
  'tile_base', 'token_ruby', 'token_emerald', 'token_compass', 'token_seashell', 'token_doubloon',
];

// The kit's materials come out fully metallic (glTF's default when the exporter leaves metalness out), which turns
// sails and wood dark and makes gems mirror the room. Only iron and gold parts keep some metal.
const METAL = /Cannon|Muzzle|Nail|Hoop|Band|Bollard|Lantern|Doubloon|Compass_Blue_Rim|Rim_Highlight|Pivot|Needle/;

export const kit = {};
export const kitReady = Promise.all(FILES.map(f => loader.loadAsync(`${base}models/kit/${f}.glb`).then(g => {
  const seen = new Set();
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    // Colours are painted per vertex in sRGB, but three.js reads vertex colours as linear, which washes them out.
    const col = o.geometry.attributes.color;
    if (col && !seen.has(col)) {
      seen.add(col);
      const c = new THREE.Color();
      for (let i = 0; i < col.count; i++) {
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).convertSRGBToLinear();
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
    const metal = METAL.test(o.name) || f === 'token_doubloon';
    o.material.metalness = metal ? .55 : 0;
    o.material.roughness = metal ? .4 : /Ruby|Emerald/.test(o.name) ? .45 : .8;
    o.material.envMapIntensity = .45; // the board's room reflections otherwise wash flat tops out to white
    if (/Sail|Flag/.test(o.name)) o.material.side = THREE.DoubleSide;
  });
  kit[f] = g.scene;
}))).then(() => kit);
kitReady.catch(e => console.warn('World kit did not load', e));

export const hasKit = name => !!kit[name];
export const part = name => kit[name].clone(true);

// Bounds of the named nodes of an object, in that object's own space.
export function boundsOf(root, test) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || !test(o.name)) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
  });
  return box;
}
