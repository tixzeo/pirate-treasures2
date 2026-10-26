import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGeometryOnly } from './helpers/glb-geometry.js';
import { prepareMorskoyV6 } from '../src/morskoy-v6.js';
import { boundsOf, fitShipLayout } from '../src/ship-layout.js';
import { makeDeckZone, deckClear, DeckWalker, WALK } from '../src/deck-walk.js';
import { PLAYER_SHIP } from '../src/ship-config.js';
import { mergeStatic } from '../src/merge.js';

const { root, original, data } = await loadGeometryOnly(new URL('../public/models/kit/morskoy_strannik_v6.glb', import.meta.url));
const hull = boundsOf(root, n => /_CarvedHull$/.test(n));
const uvCount = root.getObjectsByProperty('isMesh', true).filter(m => m.geometry.attributes.uv).length;
prepareMorskoyV6(root);
const layout = fitShipLayout(root.userData.shipParts, PLAYER_SHIP);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-4, `${a} != ${b}`);

test('V6 replaces only the player brig, with native 32m hull and measured floors', () => {
  assert.equal(PLAYER_SHIP.model, 'morskoy_strannik_v6'); assert.equal(PLAYER_SHIP.class, 'brig');
  near(layout.scale.x, 1); near(layout.scale.y, 1); near(layout.scale.z, 1);
  near(layout.hull.max[2]-layout.hull.min[2], 32); near(layout.hull.max[0]-layout.hull.min[0], 6.4983334);
  assert.deepEqual(boundsOf(root, n => /_CarvedHull$/.test(n)), hull);
  near(layout.surfaces.find(s => s.kind === 'deck').bounds.max[1], 2.05998);
  near(layout.surfaces.find(s => s.kind === 'quarterdeck').bounds.max[1], 4.79826);
  const rim = boundsOf(root, n => /^captains_wheel_rim_/.test(n)); near(rim.max.x-rim.min.x, 1.3);
  assert.ok(rim.max.y-layout.anchors.captain[1]<1.7);
  const markers = root.getObjectsByProperty('isMesh', true).filter(m => /_CannonMuzzle_/.test(m.name));
  assert.equal(markers.length, 8); assert.ok(markers.every(m=>!m.visible));
  assert.ok(!root.getObjectByName('MorskoyStrannik_Deck').visible);
});

test('V6 retains all authored UV/PBR contracts and embedded 512px textures', () => {
  assert.equal(original.images.length, 16); assert.equal(original.materials.length, 13);
  const binStart = 20+data.readUInt32LE(12)+8;
  for (const image of original.images) {
    const view = original.bufferViews[image.bufferView], start = binStart+(view.byteOffset??0);
    assert.equal(data.toString('ascii', start+1, start+4), 'PNG');
    assert.equal(data.readUInt32BE(start+16), 512); assert.equal(data.readUInt32BE(start+20), 512);
  }
  assert.equal(original.materials.filter(m=>m.pbrMetallicRoughness?.baseColorTexture && m.normalTexture).length, 8);
  assert.equal(uvCount, 226);
  assert.equal(original.meshes.filter(m=>m.primitives.some(p=>original.materials[p.material]?.pbrMetallicRoughness?.baseColorTexture)).length,65);
  assert.ok(root.getObjectsByProperty('isMesh', true).filter(m=>m.geometry.attributes.uv).length >= 50);
  const wood = root.getObjectsByProperty('isMesh', true).find(m=>m.material.name==='Morskoy_V6_wood_hull');
  assert.equal(wood.material.metalness, 0); near(wood.material.roughness,.82);
  const sails = root.getObjectsByProperty('type','Group').filter(g=>/_Sail_\d+_\d+$/.test(g.name));
  assert.equal(sails.length,9); assert.ok(sails.every(g=>g.position.y>0));
  const painted = root.getObjectsByProperty('isMesh',true).find(m=>!m.material.name);
  assert.equal(painted.material.metalness,0);
});

test('V6 stations, masts and added barrels have safe navigation and a walkable route', () => {
  const zone = makeDeckZone(layout), walker = new DeckWalker(zone);
  assert.ok(walker.position && deckClear(zone,walker.position.x,walker.position.z));
  assert.equal(layout.obstacles.filter(o=>/_Mast_[01]_/.test(o.name)).length,2);
  assert.ok(layout.obstacles.some(o=>/^V4_oak_barrels_/.test(o.name)));
  for (const role of ['bosun','tim_cabin_boy']) {
    const [x,,z]=layout.anchors[role]; assert.ok(deckClear(zone,x,z),role);
  }
  for (const anchor of Object.values(layout.anchors)) {
    const [x,y,z] = anchor;
    const floors = root.getObjectsByProperty('isMesh',true).filter(m=>/^(quarter)?deck_planking_/.test(m.name));
    const ray = new THREE.Raycaster(new THREE.Vector3(x,y+.1,z),new THREE.Vector3(0,-1,0),0,.2);
    assert.ok(ray.intersectObjects(floors,false).length,'station has source floor underneath');
  }
  const mast=layout.obstacles.find(o=>/_Mast_0_/.test(o.name)).bounds, z=(mast.min[2]+mast.max[2])/2;
  assert.ok(!deckClear(zone,0,z),'mast blocks');
  const route=new DeckWalker(zone,{x:mast.min[0]-WALK.radius-.18,z:z+1});
  const before=route.position.z; for(let i=0;i<45;i++)route.update(1/60,0,-1);
  assert.ok(route.position.z<before-1.5,'captain passes beside actual mast');
});

test('V6 materials, hidden floor contracts and nine moving sails survive welding and clone', () => {
  mergeStatic(root, /_CarvedHull$|_Deck$|_Quarterdeck$|_CannonMuzzle_|_Sail|_Flag_/);
  const clone=root.clone(true); assert.deepEqual(clone.userData.shipParts,root.userData.shipParts);
  const meshes=clone.getObjectsByProperty('isMesh',true);
  assert.ok(meshes.length<65, `draw mesh count: ${meshes.length}`);
  assert.equal(new Set(meshes.map(m=>m.material.name)).size,14); // 13 authored + vertex-painted default
  assert.ok(clone.getObjectByName('MorskoyStrannik_Sail_1_0'));
});
