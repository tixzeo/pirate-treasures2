import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { ISLANDS, SCENERY } from '../src/islands.js';
import { ISLAND_V3, prepareIslandV3, fitIslandV3 } from '../src/island-v3.js';
import { shoreDistance, terrainPush, terrainClearance, coastAtlas, closedBasins, COAST_SIZE, COAST_RANGE } from '../src/island-shape.js';

const islands = new Map();
for (const name of ISLAND_V3) {
  const b = await readFile(new URL(`../public/models/islands/${name}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  prepareIslandV3(scene);
  islands.set(name, fitIslandV3(scene, 55, null, 1));
}

test('all six real V3 assets fit, with finite coast fields and bounded mesh counts', () => {
  assert.equal(islands.size, 6);
  const signatures = new Set();
  for (const [name, fit] of islands) {
    assert.ok(fit.coast > 0 && fit.coast < 80, name);
    assert.ok(fit.terrain.field.every(Number.isFinite), name);
    const land = fit.terrain.field.filter(v => v < 0).length;
    assert.ok(land > 1000 && land < fit.terrain.field.length - 1000, name);
    signatures.add(land);
    assert.ok(fit.wrap.getObjectsByProperty('isMesh', true).length <= 6, 'static details are welded by material');
  }
  assert.equal(signatures.size, 6, 'shore shapes are not six scaled copies');
});

test('crescent lagoon remains water and has an open route to the outer sea', () => {
  const { terrain: s } = islands.get('island_crescent_bay');
  assert.ok(shoreDistance(s, 0, 0) > 8);
  let open = false;
  for (let i = 0; i < 72; i++) {
    const a = i * Math.PI / 36;
    if (Array.from({ length: 35 }, (_, k) => shoreDistance(s, Math.cos(a) * k * 2, Math.sin(a) * k * 2)).every(d => d > 1)) open = true;
  }
  assert.ok(open, 'bay is connected to sea, not hidden behind the old collision circle');
  const isle = { position: { x: 0, z: 0 }, userData: { terrain: s } };
  assert.equal(terrainPush({ x: 0, z: 0 }, s.yaw, { radius: .6, reach: 1 }, isle), null);
});

test('terrain collision resolves land penetration after rotation for each island', () => {
  for (const [name, fit] of islands) {
    const s = fit.terrain, i = s.field.indexOf(Math.min(...s.field));
    const x = s.minX + (i % s.size + .5) * s.cell, z = s.minZ + (Math.floor(i / s.size) + .5) * s.cell;
    const p = { x: Math.cos(s.yaw) * x + Math.sin(s.yaw) * z, z: -Math.sin(s.yaw) * x + Math.cos(s.yaw) * z };
    const isle = { position: { x: 0, z: 0 }, userData: { terrain: s } }, coast = { radius: 1, reach: 2 };
    assert.ok(terrainClearance(p, s.yaw, coast, isle).distance < 0, name);
    const push = terrainPush(p, s.yaw, coast, isle); assert.ok(push, name);
    p.x += push.x; p.z += push.z;
    assert.ok(terrainClearance(p, s.yaw, coast, isle).distance >= -.1, `${name} was separated from land`);
  }
});

test('inward-facing volcano is opaque and visible from above', () => {
  const { wrap } = islands.get('island_volcanic'); wrap.updateMatrixWorld(true);
  const ground = wrap.getObjectsByProperty('isMesh', true).filter(m => m.material.name === 'island_v3_ground');
  assert.ok(ground.length);
  for (const m of ground) {
    assert.equal(m.material.side, THREE.DoubleSide);
    assert.equal(m.material.transparent, false);
    assert.equal(m.material.opacity, 1);
    assert.equal(m.material.depthWrite, true);
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(7, 100, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), wrap.rotation.y), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObjects(ground)[0]?.point.y > 4, 'cone, rather than the sand underneath, occludes the sea');
});

test('water atlas shares outer shore fields with millimetre precision and no slot bleed', () => {
  const shapes = [...islands.values()].map(f => f.terrain);
  const { data, width, height } = coastAtlas(shapes, 8);
  assert.equal(width, 8 * COAST_SIZE); assert.equal(height, COAST_SIZE);
  for (let slot = 0; slot < 8; slot++) for (let z = 0; z < height; z++) for (let x = 0; x < COAST_SIZE; x++) {
    const i = (z * width + slot * COAST_SIZE + x) * 4;
    const decoded = (data[i] * 256 + data[i + 1]) / 65535 * 2 * COAST_RANGE - COAST_RANGE;
    const expected = shapes[slot] ? Math.max(-COAST_RANGE, Math.min(COAST_RANGE, shapes[slot].oceanField[z * COAST_SIZE + x])) : COAST_RANGE;
    assert.ok(Math.abs(decoded - expected) < .0011);
  }
});

test('closed water is isolated but a narrow open channel still reaches the ocean', () => {
  const n=9,mask=new Uint8Array(n*n);
  for(let z=2;z<=6;z++)for(let x=2;x<=6;x++)mask[z*n+x]=x===2||x===6||z===2||z===6?1:0;
  assert.deepEqual(closedBasins(mask,n).map(b=>b.length),[9]);
  mask[4*n+2]=0;assert.equal(closedBasins(mask,n).length,0);
});

test('real closed pools have opaque flat water and no ocean or foam inside', () => {
  for(const name of ['island_cove_small','island_lagoon','island_jungle_ruins']) {
    const fit=islands.get(name),s=fit.terrain;
    assert.ok(s.ponds.length>0,name);
    for(let i=0;i<s.closedWater.length;i++)if(s.closedWater[i]) {
      assert.ok(s.field[i]>0, 'collision field still describes the physical terrain');
      assert.ok(s.oceanField[i]<0, 'ocean shader masks the entire closed basin');
    }
    const water=fit.wrap.getObjectsByProperty('isMesh',true).filter(m=>m.material.name==='island_v3_water');
    assert.ok(water.length);for(const mesh of water){assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);assert.equal(mesh.material.vertexColors,false);}
  }
  const bay=islands.get('island_crescent_bay').terrain;
  assert.ok(shoreDistance({...bay,field:bay.oceanField},0,0)>8);
});

test('voyage has six islands, preserving all three story levels', () => {
  assert.equal(ISLANDS.length, 3); assert.equal(SCENERY.length, 3);
  assert.deepEqual(ISLANDS.map(i => i.level.moves), [20, 20, 22]);
});
