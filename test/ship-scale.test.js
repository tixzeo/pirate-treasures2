import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { boundsOf, captureShipParts, fitShipLayout } from '../src/ship-layout.js';
import { BRIGANTINE, SHIP_RULES, shipMetrics } from '../src/ship-config.js';
import { coastDistance, coastPush, pierPush } from '../src/ship-collision.js';
import { mergeStatic } from '../src/merge.js';

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-5, message || `${a} != ${b}`);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function model(name) {
  const b = await readFile(new URL(`../public/models/kit/${name}.glb`, import.meta.url));
  return (await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
}
const brig = await model('player_brigantine');
const parts = captureShipParts(brig);
const fitted = fitShipLayout(parts, BRIGANTINE);
const width = fitted.hull.max[0] - fitted.hull.min[0];
const dimensions = { ...BRIGANTINE, width };
const metrics = shipMetrics(dimensions);

test('actual brigantine has a 22m hull and 4.4m deck, independently fitted', () => {
  const d = fitted.surfaces.find(s => s.kind === 'deck').bounds;
  close(fitted.hull.max[2] - fitted.hull.min[2], 22);
  close(d.max[0] - d.min[0], 4.4);
  close(fitted.hull.min[2], -11);
  close(fitted.hull.max[2], 11);
  assert.ok(fitted.scale.x > fitted.scale.z, 'width is fitted separately');
  close(fitted.scale.y, fitted.scale.z, 'height retains the longitudinal scale');
  assert.ok(fitted.obstacles.some(p => /CaptainCabin/.test(p.name)));
  assert.ok(fitted.obstacles.some(p => /Mast_/.test(p.name)));
  assert.ok(fitted.obstacles.some(p => /Barrel_/.test(p.name)));
  assert.equal(fitted.surfaces.length, 2);
});

test('physical parts survive welding and clone; fitted bounds match the visible model', () => {
  const root = brig.clone(true);
  root.userData.shipParts = captureShipParts(root);
  mergeStatic(root, /_CarvedHull$|_Deck$|_Quarterdeck$|_CannonMuzzle_|_Sail|_Flag_/);
  const copy = root.clone(true);
  assert.deepEqual(copy.userData.shipParts, parts);
  assert.equal(copy.getObjectByName('Brigantine_Mast_1'), undefined, 'mast geometry really was welded');
  copy.scale.set(fitted.scale.x, fitted.scale.y, fitted.scale.z);
  copy.position.z = fitted.offsetZ;
  const parent = new THREE.Group(); parent.add(copy);
  for (const s of fitted.surfaces) {
    const b = boundsOf(parent, n => n === s.name);
    b.min.toArray().forEach((n, i) => close(n, s.bounds.min[i]));
    b.max.toArray().forEach((n, i) => close(n, s.bounds.max[i]));
  }
  const guns = [];
  copy.traverse(o => { if (/_CannonMuzzle_/.test(o.name)) guns.push(o); });
  assert.equal(guns.length, 8);
  for (const gun of guns) {
    const raw = boundsOf(brig, n => n === gun.name).getCenter(new THREE.Vector3());
    const at = boundsOf(parent, n => n === gun.name).getCenter(new THREE.Vector3());
    close(at.x, raw.x * fitted.scale.x);
    close(at.y, raw.y * fitted.scale.y);
    close(at.z, raw.z * fitted.scale.z + fitted.offsetZ);
  }
});

test('Karakatitsa keeps its own model and uniform 15m fit', async () => {
  const scar = await model('scar_karakatitsa');
  const layout = fitShipLayout(captureShipParts(scar), { length: 15 });
  close(layout.hull.max[2] - layout.hull.min[2], 15);
  close(layout.scale.x, layout.scale.y);
  close(layout.scale.y, layout.scale.z);
  const originalWidth = boundsOf(scar, n => /_CarvedHull$/.test(n)).getSize(new THREE.Vector3()).x * layout.scale.x;
  close(layout.hull.max[0] - layout.hull.min[0], originalWidth);
});

test('invalid hulls, decks and dimensions fail instead of producing NaN', () => {
  assert.throws(() => fitShipLayout({ ...parts, surfaces: [] }, BRIGANTINE));
  assert.throws(() => fitShipLayout(parts, { length: 0 }));
  assert.throws(() => fitShipLayout(parts, { length: 22, deckWidth: 0 }));
});

test('camera and hit height follow length while handling and mooring stay fixed', () => {
  close(metrics.camera.back, 26 * 22 / 14);
  close(metrics.hit.maxY, 4 * 22 / 14);
  assert.equal(BRIGANTINE.handling.maxSpeed, 9.1);   // captain 28.10.2026: 20 knots at best with the wind
  assert.equal(BRIGANTINE.handling.hp, 100);
  assert.equal(SHIP_RULES.moor.dist, 3);
  close(SHIP_RULES.moor.ang, Math.PI / 15);
});

const pier = { root: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, side: { x: -1, z: 0 } };
const pierLength = 28.8, pierWidth = 4.8;
test('both headings at the berth leave the full enlarged hull clear of the pier', () => {
  const pos = { x: -(pierWidth / 2 + width / 2 + SHIP_RULES.berthGap), z: pierLength * .6 };
  for (const heading of [0, Math.PI]) assert.equal(pierPush(pos, heading, dimensions, pier, pierLength, pierWidth), null);
});

test('pier collision resolves broadside, diagonal, head-on and exact-centre overlaps', () => {
  for (const [x, z, heading] of [[-4, 14, 0], [-4, 14, Math.PI / 4], [0, 35, 0], [0, 14, 0], [-4, 28, Math.PI / 2]]) {
    const pos = { x, z }, push = pierPush(pos, heading, dimensions, pier, pierLength, pierWidth);
    assert.ok(push, 'overlap detected');
    pos.x += push.x; pos.z += push.z;
    assert.equal(pierPush(pos, heading, dimensions, pier, pierLength, pierWidth), null, 'one correction separates the boxes');
  }
});

test('coast accounts for bow and stern; a clear centre alone is insufficient', () => {
  for (const heading of [0, Math.PI, Math.PI / 3]) {
    const centre = { x: 0, z: 0 }, shore = 40;
    const pos = { x: Math.sin(heading) * 45, z: Math.cos(heading) * 45 };
    const push = coastPush(pos, heading, metrics.coast, centre, shore);
    assert.ok(push, 'bow overlaps despite centre being outside the shore');
    pos.x += push.x; pos.z += push.z;
    const d = coastDistance(pos, heading, metrics.coast.reach, centre);
    close(d.distance, shore + metrics.coast.radius);
  }
  const push = coastPush({ x: 0, z: 0 }, 0, metrics.coast, { x: 0, z: 0 }, 40);
  assert.ok(Number.isFinite(push.x) && Number.isFinite(push.z));
  assert.ok(Math.hypot(push.x, push.z) > 40, 'coincident centre does not get stuck');
});
