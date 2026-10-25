import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareMorskoy } from '../src/morskoy.js';
import { boundsOf, fitShipLayout } from '../src/ship-layout.js';
import { PLAYER_SHIP, MORSKOY_STERN } from '../src/ship-config.js';
import { mergeStatic } from '../src/merge.js';

const data = await readFile(new URL('../public/models/kit/morskoy_strannik_v2.glb', import.meta.url));
const root = (await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')).scene;
const triangles = object => object.getObjectsByProperty('isMesh', true).reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0);
const beforeTriangles = triangles(root);
const beforeHull = boundsOf(root, n => /_CarvedHull$/.test(n));
const beforeMasts = boundsOf(root, n => /^mast_[01]_main_/.test(n));
prepareMorskoy(root);
const layout = fitShipLayout(root.userData.shipParts, PLAYER_SHIP);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);

test('Morskoy is uniformly fitted to 32m with its original proportions', () => {
  near(layout.hull.max[2] - layout.hull.min[2], 32);
  near(layout.scale.x, 32 / 22); near(layout.scale.y, layout.scale.x); near(layout.scale.z, layout.scale.x);
  const deck = layout.surfaces.find(s => s.kind === 'deck').bounds;
  near(deck.max[0] - deck.min[0], 4.661 * 32 / 22);
  assert.equal(PLAYER_SHIP.length, 32); // the V2 adapter remains a regression fixture
});

test('stern correction preserves hull and main masts; nine sail groups stay intact', () => {
  assert.equal(triangles(root), beforeTriangles + 64, 'only the new windowed back wall adds triangles');
  for (const [testName, before] of [[n => /_CarvedHull$/.test(n), beforeHull], [n => /^mast_[01]_main_/.test(n), beforeMasts]]) {
    const after = boundsOf(root, testName);
    after.min.toArray().forEach((n, i) => near(n, before.min.toArray()[i]));
    after.max.toArray().forEach((n, i) => near(n, before.max.toArray()[i]));
  }
  const sails = root.getObjectsByProperty('type', 'Group').filter(o => /_Sail_\d+_\d+$/.test(o.name));
  assert.equal(sails.length, 9);
  for (const sail of sails) {
    assert.ok(sail.getObjectsByProperty('isMesh', true).length <= 2);
    assert.ok(sail.position.y > 0, 'pivot is at the yard, not the world origin');
  }
});

test('quarterdeck and helm fit a 1.75m captain; rear wall has three open windows', () => {
  const main = layout.surfaces.find(s => s.kind === 'deck').bounds.max[1];
  const quarter = layout.surfaces.find(s => s.kind === 'quarterdeck').bounds.max[1];
  near(quarter - main, MORSKOY_STERN.rise);
  const wheel = boundsOf(root, n => /^captains_wheel_rim_/.test(n));
  const diameter = (wheel.max.x - wheel.min.x) * layout.scale.x;
  assert.ok(diameter > 1.2 && diameter < 1.4, 'wheel is proportional to the captain');
  const wall = root.getObjectByName('cabin_back_wall_0'); root.updateMatrixWorld(true);
  const y = 1.81 + (2.98 - 1.81) * (2.4 / (2.4 * 32 / 22));
  for (const x of [-1.2, 0, 1.2]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 12), new THREE.Vector3(0, 0, -1), 0, 3);
    assert.equal(ray.intersectObject(wall).length, 0, 'window aperture remains open');
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(2, y, 12), new THREE.Vector3(0, 0, -1), 0, 3);
  assert.ok(ray.intersectObject(wall).length, 'wooden wall closes the stern');
});

test('both four-gun broadsides retain contract markers, hidden from rendering', () => {
  const guns = root.getObjectsByProperty('isMesh', true).filter(o => /_CannonMuzzle_/.test(o.name));
  assert.equal(guns.filter(o => /_CannonMuzzle_-1_/.test(o.name)).length, 4);
  assert.equal(guns.filter(o => /_CannonMuzzle_1_/.test(o.name)).length, 4);
  assert.ok(guns.every(o => !o.visible));
});

test('navigation has separate gun solids, steps, cabin walls and safe crew anchors', () => {
  const obs = layout.obstacles;
  assert.equal(obs.filter(o => /^cannon_carriages_/.test(o.name)).length, 8);
  assert.ok(layout.surfaces.filter(s => s.kind === 'step').length >= 8);
  assert.equal(layout.surfaces.filter(s => s.kind === 'deck').length, 1, 'painted fragments share one logical main floor');
  const parts = layout.surfaces.filter(s => s.kind === 'deck-part');
  assert.equal(parts.length, 3, 'source fragments remain inspectable');
  const main = layout.surfaces.find(s => s.kind === 'deck');
  assert.ok(main.outline.length >= 3);
  assert.ok(parts.every(s => s.bounds.min[2] >= main.bounds.min[2] && s.bounds.max[2] <= main.bounds.max[2]));
  assert.ok(obs.some(o => /^cabin_side_wall_/.test(o.name)));
  for (const [role, point] of Object.entries(layout.anchors)) {
    const [x, y, z] = point, radius = .35, height = role === 'tim_cabin_boy' ? 1.35 : 1.75;
    for (const o of obs) {
      const { min, max } = o.bounds;
      if (max[1] <= y + .03 || min[1] >= y + height) continue;
      const dx = Math.max(min[0] - x, 0, x - max[0]), dz = Math.max(min[2] - z, 0, z - max[2]);
      assert.ok(Math.hypot(dx, dz) >= radius, `${role} overlaps ${o.name}`);
    }
    const native = root.userData.shipParts.anchors[role];
    const ray = new THREE.Raycaster(new THREE.Vector3(native[0], native[1] + .1, native[2]), new THREE.Vector3(0, -1, 0), 0, .2);
    const decks = root.getObjectsByProperty('isMesh', true).filter(m => /_Deck(?:_\d+)?$|_Quarterdeck(?:_\d+)?$/.test(m.name));
    assert.ok(ray.intersectObjects(decks, false).length, `${role} has real deck geometry underfoot`);
  }
});

test('static welding and cloning retain navigation and moving sail groups', () => {
  mergeStatic(root, /_CarvedHull$|_Deck$|_Quarterdeck$|_CannonMuzzle_|_Sail|_Flag_/);
  const clone = root.clone(true);
  assert.deepEqual(clone.userData.shipParts, root.userData.shipParts);
  assert.ok(clone.getObjectByName('MorskoyStrannik_Sail_1_0'));
  assert.ok(clone.getObjectByName('MorskoyStrannik_Deck'));
});
