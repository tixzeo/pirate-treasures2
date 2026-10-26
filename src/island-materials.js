import { rawTex } from './materials.js';

const cache = new WeakMap();

// Native terrain mixes grass, sand and rock in vertex colours without UVs.
// Project metre-sized detail onto the dominant face axis; preserve those painted
// biome boundaries and use existing texture assets rather than extra downloads.
export function withIslandTerrain(material) {
  if (cache.has(material)) return cache.get(material);
  const mat = material.clone(); mat.userData.islandDetail = true;
  const uniforms = {};
  for (const [tag, name] of [['Grass','swamp_moss'],['Sand','dune_sand'],['Rock','ruin_stone']]) {
    uniforms[`uIsle${tag}`] = { value: rawTex(name, 'basecolor', true) };
    uniforms[`uIsle${tag}N`] = { value: rawTex(name, 'normal', false) };
  }
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    const varyings = 'varying vec3 vIslePos, vIsleNormal, vIsleColor, vIsleAx, vIsleAy, vIsleAz;';
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${varyings}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vIslePos=position; vIsleNormal=normal;
        vIsleColor=vec3(.3);
        #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
          vIsleColor=color.rgb;
        #endif
        mat3 isleBasis=normalMatrix;
        #ifdef USE_INSTANCING
          isleBasis=normalMatrix*mat3(instanceMatrix);
        #endif
        vIsleAx=normalize(isleBasis[0]);vIsleAy=normalize(isleBasis[1]);vIsleAz=normalize(isleBasis[2]);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        ${varyings}
        uniform sampler2D uIsleGrass,uIsleSand,uIsleRock,uIsleGrassN,uIsleSandN,uIsleRockN;
        vec2 isleUV(){
          vec3 n=abs(normalize(vIsleNormal));
          return (n.y>=max(n.x,n.z)?vIslePos.xz:(n.x>n.z?vIslePos.zy:vIslePos.xy))*.4;
        }
        vec3 isleWeights(){
          vec3 c=vIsleColor;
          float grass=smoothstep(.005,.07,c.g-max(c.r,c.b));
          float sand=smoothstep(.025,.12,min(c.r-c.b,c.g-c.b))*(1.0-grass);
          return vec3(grass,sand,1.0-grass-sand);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 w=isleWeights();vec2 uv=isleUV();vec3 lum=vec3(.299,.587,.114);
          vec3 color=texture2D(uIsleGrass,uv).rgb*w.x+texture2D(uIsleSand,uv).rgb*w.y+texture2D(uIsleRock,uv).rgb*w.z;
          vec3 avg=textureLod(uIsleGrass,vec2(.5),12.0).rgb*w.x+textureLod(uIsleSand,vec2(.5),12.0).rgb*w.y+textureLod(uIsleRock,vec2(.5),12.0).rgb*w.z;
          float grain=clamp(dot(color,lum)/max(dot(avg,lum),.03),.55,1.5);
          vec3 palette=vec3(.14,.235,.07)*w.x+vec3(.58,.43,.21)*w.y+mix(diffuseColor.rgb,vec3(.14,.15,.14),.25)*w.z;
          float patches=.94+.035*sin(vIslePos.x*.052+vIslePos.z*.027)+.025*sin(vIslePos.z*.13-vIslePos.x*.041);
          diffuseColor.rgb=mix(diffuseColor.rgb,palette,.6)*mix(1.0,grain,.65)*patches;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 w=isleWeights();vec2 uv=isleUV();
          vec3 bump=(texture2D(uIsleGrassN,uv).xyz*w.x+texture2D(uIsleSandN,uv).xyz*w.y+texture2D(uIsleRockN,uv).xyz*w.z)*2.0-1.0;
          vec3 n=abs(normalize(vIsleNormal));
          vec3 bend=n.y>=max(n.x,n.z)?vec3(bump.x,0.0,bump.y):(n.x>n.z?vec3(0.0,bump.y,bump.x):vec3(bump.x,bump.y,0.0));
          normal=normalize(normal+(vIsleAx*bend.x+vIsleAy*bend.y+vIsleAz*bend.z)*.22*faceDirection);
        }`);
  };
  mat.customProgramCacheKey = () => 'island-terrain-v1';
  cache.set(material, mat); return mat;
}
