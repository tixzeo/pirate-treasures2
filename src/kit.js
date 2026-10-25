import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { detailKind, withDetail } from './detail.js';
import { mergeStatic } from './merge.js';
import { captureShipParts } from './ship-layout.js';
import { PLAYER_SHIP } from './ship-config.js';
import { prepareMorskoy } from './morskoy.js';
import { ISLAND_V3, isIslandV3, prepareIslandV3 } from './island-v3.js';
import { prepareWaterModel } from './water-models.js';
import { withIslandTerrain } from './island-materials.js';
export { boundsOf } from './ship-layout.js';

// Артем's World Kit (public/models/kit): ships, islands, docks, props and match-3 pieces.
// Y up, ship bows to -Z with the waterline at y = 0, docks run along +Z. Geometry is meshopt-compressed.
// Everything loads once at start; until then the game shows its own built-in shapes.
const base = import.meta.env ? import.meta.env.BASE_URL : './';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const FILES = [
  PLAYER_SHIP.model, 'scar_karakatitsa',
  ...ISLAND_V3.map(name => `islands/${name}`),
  'dock_pine', 'dock_royal', 'dock_ruined', 'palm_tree', 'rock_cluster',
  'tile_base', 'token_ruby', 'token_emerald', 'token_compass', 'token_seashell', 'token_doubloon',
  // The Water Life Pack (public/models/water): Scar's rowboat, wreckage, buoys, a gull and fish.
  'water/scar_rowboat', 'water/floating_plank_cluster', 'water/broken_mast_section', 'water/wrecked_hull_chunk',
  'water/barrel_intact', 'water/barrel_damaged', 'water/buoy_red_white', 'water/buoy_lantern',
  'water/seagull', 'water/fish_silver', 'water/fish_tropical',
];

// The kit's materials come out fully metallic (glTF's default when the exporter leaves metalness out), which turns
// sails and wood dark and makes gems mirror the room. Only iron and gold parts keep some metal.
const METAL = /Cannon|Muzzle|Nail|Hoop|Band|Bollard|Lantern|Doubloon|Compass_Blue_Rim|Rim_Highlight|Pivot|Needle/;

// The water pack names its materials well, so there the material name says what is metal.
const WATER_METAL = /iron|metal|nail|chain|ring|lifting eye|cap|brass|oarlock|hoop|lamp|cage|roof/i;

// Parts ship.js and island.js find by name: hull, decks and beach for sizing, muzzles for the guns,
// sails, seams and flags to sway, the island's own dock to hide.
const KEEP = /_CarvedHull$|_Deck$|_Quarterdeck$|_CannonMuzzle_|_Sail|_Flag_|_Beach$|_Dock_/;

export const kit = {};
export const glows = [];
export const kitReady = Promise.all(FILES.map(path => loader.loadAsync(`${base}models/${path.includes('/') ? path : 'kit/' + path}.glb`).then(g => {
  const f = path.split('/').pop(), water = path.startsWith('water/');
  const morskoy = f === 'morskoy_strannik_v2';
  const islandV3 = isIslandV3(f);
  if (morskoy) prepareMorskoy(g.scene);
  if (islandV3) prepareIslandV3(g.scene);
  if (water) prepareWaterModel(g.scene, f);
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
    if (morskoy || islandV3) {
      // The adapter assigns shared materials by surface type before kit detailing.
    } else if (water) {
      if (!WATER_METAL.test(o.material.name)) o.material.metalness = 0;
    } else {
      const metal = METAL.test(o.name) || f === 'token_doubloon';
      o.material.metalness = metal ? .55 : 0;
      o.material.roughness = metal ? .4 : /Ruby|Emerald/.test(o.name) ? .45 : .8;
    }
    // Lamps and lit windows: they glow after dark (the atmosphere raises their intensity as the light fails).
    if (/window|lantern|warm buoy light/i.test(o.material.name) && !glows.some(g => g.mat === o.material)) {
      o.material.emissive = new THREE.Color(o.material.userData.glowColor ?? o.material.color);
      o.material.emissiveIntensity = .4;
      glows.push({ mat: o.material, k: /lantern|buoy/i.test(o.material.name) ? 1.2 : .8 });
    }
    o.material.envMapIntensity = .45; // the board's room reflections otherwise wash flat tops out to white
    if (/Sail|Flag|Wing|Fin|Canvas/.test(o.name)) o.material.side = THREE.DoubleSide;
    // Wood grain, sailcloth, sand and stone from the texture pack; the match-3 pieces stay clean.
    if (islandV3 && o.material.name === 'island_v3_ground') o.material = withIslandTerrain(o.material);
    const kind = islandV3 ? (o.material.name === 'island_v3_wood' && {tex:'weathered_hull',scale:.5,color:.65,normal:.3}) :
      !/^(token|tile)_/.test(f) && detailKind(`${o.name} ${o.material.name}`);
    if (kind) o.material = withDetail(o.material, kind);
  });
  // Static parts welded per material; what the game looks up by name or animates stays separate.
  if (f === 'player_brigantine' || f === 'scar_karakatitsa') g.scene.userData.shipParts = captureShipParts(g.scene);
  if (!water && !/^(token|tile|island)_/.test(f)) mergeStatic(g.scene, KEEP); // islands weld once they are reshaped
  kit[f] = g.scene;
}).catch(e => {
  // Sea life is decoration: the game goes on without any piece of it.
  if (!path.startsWith('water/')) throw e;
  console.warn(`${path} did not load`, e);
}))).then(() => kit);
kitReady.catch(e => console.warn('World kit did not load', e));

export const hasKit = name => !!kit[name];
export const part = name => kit[name].clone(true);
