import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareMorskoy } from '../src/morskoy.js';
import { fitShipLayout } from '../src/ship-layout.js';
import { PLAYER_SHIP } from '../src/ship-config.js';
import { makeDeckZone, deckClear, findDeckSpawn, DeckWalker, seaIntent, WALK } from '../src/deck-walk.js';
import { cameraLimit, DeckCamera } from '../src/deck-camera.js';

const box = (name, min, max) => ({ name, bounds: { min, max } });
const navigation = obstacles => ({ space: 'ship-local',
  surfaces: [{ ...box('main', [-3, 1.8, -10], [3, 2, 10]), kind: 'deck', outline: [[-3,-10],[3,-10],[3,10],[-3,10]] },
    { ...box('upper', [-3, 4, 6], [3, 4.2, 10]), kind: 'quarterdeck' }], obstacles });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('ship-local capsule uses vertical overlap and closes aft transition', () => {
  const zone = makeDeckZone(navigation([box('under', [-1,0,-4],[1,1.95,-2]), box('crate', [-1,2,-1],[1,3,1]), box('overhead',[-1,4,-6],[1,5,-4])]));
  assert.ok(deckClear(zone,0,-3), 'below-deck cannon does not block');
  assert.ok(deckClear(zone,0,-5), 'high object does not block');
  assert.ok(!deckClear(zone,0,0), 'crate blocks');
  assert.ok(!deckClear(zone,0,5.8), 'quarterdeck is closed');
  near(zone.floor,2);
  assert.equal(makeDeckZone(null),null);
  assert.equal(makeDeckZone({space:'ship-local',surfaces:[{kind:'deck',bounds:zone.bounds}],obstacles:[]}),null,'unverified AABB alone cannot enable walking');
});

test('movement is frame independent, normalised diagonally and bounded during spikes', () => {
  const zone = makeDeckZone(navigation([]));
  const run = hz => { const w = new DeckWalker(zone,{x:0,z:-3}); for(let i=0;i<hz;i++)w.update(1/hz,1,0); return w; };
  near(run(30).position.x,run(120).position.x);
  const w = new DeckWalker(zone,{x:0,z:-3}); w.update(.1,1,-1);
  near(Math.hypot(w.position.x,w.position.z+3),WALK.speed*.1);
  const before = { ...w.position }; w.update(3,1,0); assert.ok(w.position.x-before.x<=WALK.speed*WALK.maxDt+1e-8);
  w.update(NaN,1,0); assert.ok(Number.isFinite(w.position.x));
});

test('thin obstacles cannot be crossed and the captain slides along a crate', () => {
  const zone = makeDeckZone(navigation([box('thin mast',[-.02,2,-5],[.02,8,-1])]));
  const w = new DeckWalker(zone,{x:-1,z:-3});
  for(let i=0;i<120;i++)w.update(i%2 ? .1 : .05,1,.1);
  assert.ok(w.position.x<-.3,'does not tunnel through a thin mast');
  assert.ok(w.position.z>-2,'slides rather than sticking to the face');
  for(let i=0;i<200;i++)w.update(.05,-1,-1);
  assert.ok(deckClear(zone,w.position.x,w.position.z),'never leaves the eroded deck boundary');
});

test('actual outline excludes a rectangular AABB corner and blocked spawn is rejected', () => {
  const nav = navigation([]); nav.surfaces[0].outline=[[-1,-10],[1,-10],[3,0],[3,10],[-3,10],[-3,0]];
  const zone = makeDeckZone(nav);
  assert.ok(!deckClear(zone,2,-8)); assert.ok(deckClear(zone,0,-8));
  const blocked = makeDeckZone(navigation([box('all',[-9,0,-20],[9,8,20])]));
  assert.equal(findDeckSpawn(blocked),null);
});

test('keyboard and touch route only walking in deck mode and retain sails', () => {
  const keys = new Set(['KeyW','KeyA']);
  assert.deepEqual(seaIntent('deck',keys,{x:.1,y:-.5},.75),{throttle:.75,rudder:0,walkX:-.9,walkZ:-1.5});
  assert.deepEqual(seaIntent('helm',keys,null,.75),{throttle:.75,rudder:1,walkX:0,walkZ:0});
  assert.equal(seaIntent('deck',new Set(),null,.75).throttle,.75);
});

test('camera segment stops before geometry and clear or parallel rays stay finite', () => {
  const boxes=[{min:[-1,0,2],max:[1,5,2.1]}];
  assert.ok(cameraLimit([0,3,0],[0,4,6],boxes)<.35);
  assert.equal(cameraLimit([4,3,0],[4,4,6],boxes),1);
  assert.equal(cameraLimit([0,3,0],[0,3,0],boxes),1);
});

const data=await readFile(new URL('../public/models/kit/morskoy_strannik_v2.glb',import.meta.url));
const root=(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
prepareMorskoy(root);

test('real 32m and future scale use measured outline, clear spawn and a route around the mast', () => {
  for(const length of [22,32,46]) {
    const nav=fitShipLayout(root.userData.shipParts,{...PLAYER_SHIP,length});
    const zone=makeDeckZone(nav),spawn=findDeckSpawn(zone);
    assert.ok(spawn&&deckClear(zone,spawn.x,spawn.z),`${length}m spawn`);
    assert.equal(spawn.surface,nav.surfaces[0].name);
    const mast=nav.obstacles.find(o=>/^mast_0_main/.test(o.name)).bounds;
    const middle=(mast.min[2]+mast.max[2])/2;
    const x=mast.min[0]-WALK.radius-.12;
    const w=new DeckWalker(zone,{x,z:middle+1.2}); assert.ok(w.position);
    for(let i=0;i<30;i++)w.update(.05,0,-1);
    assert.ok(w.position.z<middle-.7,'real mast can be passed on the port side before reaching the next gun');
  }
});

test('parenting keeps feet and camera fixed in the moving, pitching and rolling ship frame', () => {
  const nav=fitShipLayout(root.userData.shipParts,PLAYER_SHIP),w=new DeckWalker(makeDeckZone(nav));
  const ship=new THREE.Group(),fig=new THREE.Group(),camera=new THREE.PerspectiveCamera(),rig=new DeckCamera();
  fig.position.set(w.position.x,w.position.y,w.position.z); ship.add(fig);
  rig.update(1/60,camera,ship,w,nav); const localCamera=ship.worldToLocal(camera.position.clone());
  for(let i=0;i<40;i++) {
    ship.position.set(i*2,Math.sin(i),-i*3); ship.rotation.set(Math.sin(i)*.1,i*.2,Math.cos(i)*.08); ship.updateMatrixWorld(true);
    rig.update(1/60,camera,ship,w,nav);
    const feet=ship.worldToLocal(fig.getWorldPosition(new THREE.Vector3()));
    near(feet.y,w.position.y); near(feet.x,w.position.x); near(feet.z,w.position.z);
    assert.ok(ship.worldToLocal(camera.position.clone()).distanceTo(localCamera)<1e-5,'camera does not lag the ship transform');
  }
});

test('captain can complete a loop around the actual main-deck mast', () => {
  const nav=fitShipLayout(root.userData.shipParts,PLAYER_SHIP),zone=makeDeckZone(nav);
  const mast=nav.obstacles.find(o=>/^mast_0_main/.test(o.name)).bounds,z=(mast.min[2]+mast.max[2])/2;
  const w=new DeckWalker(zone,{x:-.8,z:z+.8}),start={...w.position};
  for(const [x,z] of [[1,0],[0,-1],[-1,0],[0,1]]) for(let i=0;i<40;i++)w.update(1/60,x,z);
  near(w.position.x,start.x);near(w.position.z,start.z);
  assert.ok(deckClear(zone,w.position.x,w.position.z));
});
