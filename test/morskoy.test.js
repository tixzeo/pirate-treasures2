import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareMorskoy } from '../src/morskoy.js';
import { fitShipLayout } from '../src/ship-layout.js';
import { PLAYER_SHIP } from '../src/ship-config.js';
import { mergeStatic } from '../src/merge.js';

const data = await readFile(new URL('../public/models/kit/morskoy_strannik_v2.glb', import.meta.url));
const root = (await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')).scene;
const triangles = object => object.getObjectsByProperty('isMesh', true).reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0);
const beforeTriangles = triangles(root), beforeBounds = new THREE.Box3().setFromObject(root);
prepareMorskoy(root);
const layout = fitShipLayout(root.userData.shipParts, PLAYER_SHIP);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);

test('Morskoy is uniformly fitted to 32m with its original proportions', () => {
  near(layout.hull.max[2] - layout.hull.min[2], 32);
  near(layout.scale.x, 32 / 22); near(layout.scale.y, layout.scale.x); near(layout.scale.z, layout.scale.x);
  const deck = layout.surfaces.find(s => s.kind === 'deck').bounds;
  near(deck.max[0] - deck.min[0], 4.661 * 32 / 22);
  assert.equal(PLAYER_SHIP.model, 'morskoy_strannik_v2');
});

test('preparation preserves the supplied geometry and binds stripes into nine sails', () => {
  assert.equal(triangles(root), beforeTriangles);
  const after = new THREE.Box3().setFromObject(root);
  after.min.toArray().forEach((n, i) => near(n, beforeBounds.min.toArray()[i]));
  after.max.toArray().forEach((n, i) => near(n, beforeBounds.max.toArray()[i]));
  const sails = root.getObjectsByProperty('type', 'Group').filter(o => /_Sail_\d+_\d+$/.test(o.name));
  assert.equal(sails.length, 9);
  for (const sail of sails) {
    assert.ok(sail.getObjectsByProperty('isMesh', true).length <= 2);
    assert.ok(sail.position.y > 0, 'pivot is at the yard, not the world origin');
  }
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
  assert.ok(layout.surfaces.filter(s => s.kind === 'deck').length >= 4);
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
