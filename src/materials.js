import * as THREE from 'three';

// PBR materials from Артем's texture pack (public/textures). Basecolor is sRGB; normal, roughness and metallic stay linear.
// Metal and roughness factors are the pack's own hints; non-metals skip the all-black metallic map.
const HINTS = {
  deck_oak: [0, .78], weathered_hull: [0, .86], polished_oak: [0, .48], sail_canvas: [0, .93],
  black_sailcloth: [0, .91], crimson_sailcloth: [0, .91], hemp_rope: [0, .91], worn_iron: [.72, .42],
  pirate_gold: [.82, .31], aged_bronze: [.7, .48], dark_leather: [0, .78], ruin_stone: [0, .91],
  dune_sand: [0, .96], bone_ivory: [0, .58], swamp_moss: [0, .94],
};

const loader = new THREE.TextureLoader();
const images = new Map();
const base = import.meta.env ? import.meta.env.BASE_URL : './';

function source(name, map) {
  const key = `${name}_${map}`;
  if (!images.has(key)) {
    const entry = { clones: [], loaded: false };
    entry.tex = loader.load(`${base}textures/materials/${key}.png`, () => {
      entry.loaded = true;
      entry.clones.forEach(c => { c.needsUpdate = true; });
    });
    images.set(key, entry);
  }
  return images.get(key);
}

// A texture that shares the loaded image but has its own tiling.
function tex(name, map, repeat, srgb) {
  const src = source(name, map);
  // A clone shares the image but keeps its own upload version, so it is flagged once the image is there.
  const t = src.tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  if (src.loaded) t.needsUpdate = true; else src.clones.push(t);
  return t;
}

const cache = new Map();

// pbr('deck_oak', { repeat: 2, color: '#fff', normal: 1, ...extra MeshStandardMaterial options })
export function pbr(name, { repeat = 1, color = '#ffffff', normal = 1, ...extra } = {}) {
  const rep = Array.isArray(repeat) ? repeat : [repeat, repeat];
  const key = JSON.stringify([name, rep, color, normal, extra]);
  if (cache.has(key) && !extra.transparent) return cache.get(key);
  const [metal, rough] = HINTS[name];
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: tex(name, 'basecolor', rep, true),
    normalMap: tex(name, 'normal', rep, false),
    normalScale: new THREE.Vector2(normal, normal),
    roughnessMap: tex(name, 'roughness', rep, false),
    roughness: 1,
    metalness: metal,
    ...extra,
  });
  if (metal > 0) { mat.metalnessMap = tex(name, 'metallic', rep, false); mat.metalness = 1; }
  cache.set(key, mat);
  return mat;
}

export const icon = name => `${base}textures/icons/icon_${name}.png`;
