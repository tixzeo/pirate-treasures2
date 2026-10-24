import * as THREE from 'three';
import { rawTex } from './materials.js';

// Артем's kit models are painted with flat colours and carry no UV maps, so his PBR textures cannot be laid on
// them the usual way. Instead the texture is projected along the model's own three axes (triplanar) and only its
// light and dark pattern is used: the model keeps its colours and gains grain, weave and relief.
// Coordinates are the model's own, in metres, so the pattern travels with a ship instead of swimming over it.

// What each part is made of, read from its node and material names. First match wins.
const KINDS = [
  [/Sail(?!Seam)|sail_stitch|canvas/i, 'sail_canvas', .45, .6, .45],
  [/rope|rigging/i, 'hemp_rope', 1.4, .5, .5],
  [/cannon_barrel|muzzle|iron|nail/i, 'worn_iron', .9, .35, .5],
  [/gunwale|rail_post|band|hoop|collar|figurehead|ribbon/i, 'aged_bronze', .8, .35, .45],
  [/tentacle|suction|barnacle/i, 'dark_leather', .6, .45, .6],
  [/deck|plank|crossbeam/i, 'deck_oak', .45, .9, .7],
  [/hull|cabin|quarterdeck|bowsprit|mast|yard|carriage|crate|barrel|support|mooring|bollard|bench|boom|keel|rib|lid/i, 'weathered_hull', .45, .85, .65],
  [/sand|beach/i, 'dune_sand', .3, 1.3, .9],
  [/meadow|grass|green|hill|summit/i, 'swamp_moss', .18, .9, .7],
  [/cliff|rock|stone|underwater/i, 'ruin_stone', .25, 1.1, .9],
];
// Never textured: glass, glowing parts, lava, foliage painted per vertex, eyes.
const SKIP = /window|lava|eye|lantern|light|Palm|leaf|frond|roof|flag|skull|crossbone/i;

export function detailKind(name) {
  if (SKIP.test(name)) return null;
  const k = KINDS.find(([re]) => re.test(name));
  return k && { tex: k[1], scale: k[2], color: k[3], normal: k[4] };
}

const made = new Map();

// A copy of the material with the detail added; the same material and kind always give the same copy.
export function withDetail(mat, kind) {
  const key = `${mat.uuid}:${kind.tex}`;
  if (made.has(key)) return made.get(key);
  const m = mat.clone();
  m.userData.detail = kind.tex;
  const uniforms = {
    uDetMap: { value: rawTex(kind.tex, 'basecolor', true) },
    uDetNormal: { value: rawTex(kind.tex, 'normal', false) },
    uDetScale: { value: kind.scale },
    uDetColor: { value: kind.color },
    uDetBump: { value: kind.normal },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;\nvarying vec3 vTriAx;\nvarying vec3 vTriAy;\nvarying vec3 vTriAz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = position * length(modelMatrix[0].xyz);\nvTriN = normal;\nvTriAx = normalMatrix[0];\nvTriAy = normalMatrix[1];\nvTriAz = normalMatrix[2];');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDetMap, uDetNormal;
        uniform float uDetScale, uDetColor, uDetBump;
        varying vec3 vTriPos;
        varying vec3 vTriN;
        varying vec3 vTriAx;
        varying vec3 vTriAy;
        varying vec3 vTriAz;
        // Flat-shaded kit parts come without normals; then the face's own slope, from screen derivatives, stands in.
        vec3 triN() { return dot(vTriN, vTriN) > 1e-4 ? vTriN : cross(dFdx(vTriPos), dFdy(vTriPos)); }
        vec3 triW() { vec3 w = pow(abs(normalize(triN())) + 1e-4, vec3(4.0)); return w / dot(w, vec3(1.0)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 w = triW(); vec3 p = vTriPos * uDetScale;
          vec3 c = texture2D(uDetMap, p.zy).rgb * w.x + texture2D(uDetMap, p.xz).rgb * w.y + texture2D(uDetMap, p.xy).rgb * w.z;
          vec3 avg = textureLod(uDetMap, vec2(0.5), 12.0).rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114)) / max(dot(avg, vec3(0.299, 0.587, 0.114)), 0.04);
          diffuseColor.rgb *= mix(1.0, clamp(lum, 0.25, 2.0), uDetColor);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 w = triW(); vec3 p = vTriPos * uDetScale;
          vec3 nx = texture2D(uDetNormal, p.zy).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(uDetNormal, p.xz).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(uDetNormal, p.xy).xyz * 2.0 - 1.0;
          vec3 bend = vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z;
          vec3 d = (vTriAx * bend.x + vTriAy * bend.y + vTriAz * bend.z) * uDetBump;
          vec3 bent = normal + d * faceDirection;
          if (dot(bent, bent) > 1e-6) normal = normalize(bent);
        }`);
  };
  m.customProgramCacheKey = () => 'detail';
  made.set(key, m);
  return m;
}
