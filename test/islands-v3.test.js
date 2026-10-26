import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { ISLANDS, SCENERY, BOSS_HOME, VOYAGE_SPACING, ISLE_SCALE } from '../src/islands.js';
import { ISLAND_V3, prepareIslandV3, fitIslandV3 } from '../src/island-v3.js';
import { shoreDistance, terrainPush, terrainClearance, coastAtlas, closedBasins, COAST_SIZE, COAST_RANGE } from '../src/island-shape.js';

const islands = new Map();
for (const name of ISLAND_V3) {
  const b = await readFile(new URL(`../public/models/islands/${name}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  prepareIslandV3(scene);
  islands.set(name, fitIslandV3(scene, 55, null, 1));
}

test('read-only ground queries match the planted terrain on all six real assets',()=>{
  for(const [name,fit] of islands){
    for(const prop of fit.terrain.props){
      const [x,,z]=prop.position, y=fit.groundSurface.heightAt(x,z);
      assert.ok(y!==null&&Math.abs(y-prop.groundY)<1e-6,name+': '+prop.name);
    }
    assert.equal(fit.groundSurface.heightAt(10000,10000),null);
  }
});

test('all six real V3 assets fit, with finite coast fields and bounded mesh counts', () => {
  assert.equal(islands.size, 6);
  const signatures = new Set();
  for (const [name, fit] of islands) {
    assert.ok(fit.coast > 0 && fit.coast < 80, name);
    assert.ok(fit.terrain.field.every(Number.isFinite), name);
    const land = fit.terrain.field.filter(v => v < 0).length;
    assert.ok(land > 1000 && land < fit.terrain.field.length - 1000, name);
    signatures.add(land);
    const meshes=fit.wrap.getObjectsByProperty('isMesh',true);
    assert.ok(meshes.filter(m=>!m.isInstancedMesh).length<=7,'static details are welded; one opaque foundation is added');
    assert.ok(meshes.filter(m=>m.isInstancedMesh).length<=10,'scatter uses bounded material batches');
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

test('native palms and landmarks are grounded on actual fitted terrain, including enlarged islands', async () => {
  for (const [name, fit] of islands) {
    const inspect = value => {
      value.wrap.updateMatrixWorld(true);
      const ground=value.wrap.getObjectsByProperty('isMesh',true).filter(m=>m.material.name==='island_v3_ground');
      assert.ok(value.terrain.props.length>0,name);
      for (const prop of value.terrain.props) {
        const p=new THREE.Vector3(...prop.position).applyAxisAngle(new THREE.Vector3(0,1,0),value.terrain.yaw);
        const ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.08,p.z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObjects(ground).find(h=>Math.abs(h.point.y-prop.groundY)<.002);
        assert.ok(hit&&Math.abs(hit.point.y-prop.groundY)<.002,`${name}: ${prop.name} ground probe`);
        assert.ok(Math.abs(hit.point.y-p.y-.06)<.002,`${prop.name} root is buried 6cm`);
      }
    };
    inspect(fit);
    const b=await readFile(new URL(`../public/models/islands/${name}.glb`,import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
    prepareIslandV3(scene);inspect(fitIslandV3(scene,165,null,1,7.5));
  }
});

test('small camp props keep useful proportions instead of stretching with the island', () => {
  const cove=islands.get('island_cove_small').terrain.props;
  const table=cove.find(p=>/_MapTable$/.test(p.name));assert.ok(table);assert.ok(table.size[1]<=1.051&&table.size[0]<4);
  assert.ok(cove.some(p=>/_Campfire$/.test(p.name))&&cove.some(p=>/_grass_\d+$/.test(p.name)));
  const lagoon=islands.get('island_lagoon').terrain.props;
  assert.ok(lagoon.find(p=>/_Fence$/.test(p.name)).size[1]<=1.401);
  assert.ok(lagoon.some(p=>/_Signal$/.test(p.name)));
  const volcano=islands.get('island_volcanic').terrain.props;
  assert.equal(volcano.filter(p=>/_dead_tree_\d+$/.test(p.name)).length,2);
  const fort=islands.get('island_fortress_rock').terrain.props;
  assert.ok(fort.filter(p=>/_supply_[ab]$/.test(p.name)).every(p=>p.size[1]<=1.151));
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

test('islands have opaque undersides and side walls without closing their open bay', () => {
  for(const [name,{wrap,terrain:s}] of islands){
    const foundation=wrap.getObjectByName('Island_solid_foundation');assert.ok(foundation,name);
    assert.equal(foundation.material.transparent,false);assert.equal(foundation.material.depthWrite,true);
    assert.ok(s.foundation.skirts>0&&s.foundation.caps>0&&s.foundation.floor<=-4);
    wrap.updateMatrixWorld(true);let count=0;
    for(let i=0;i<s.field.length;i+=73)if(s.field[i]<-s.cell*2){
      const x=s.minX+(i%s.size+.5)*s.cell,z=s.minZ+(Math.floor(i/s.size)+.5)*s.cell;
      const p=new THREE.Vector3(x,s.foundation.floor-1,z).applyAxisAngle(new THREE.Vector3(0,1,0),s.yaw);
      const hit=new THREE.Raycaster(p,new THREE.Vector3(0,1,0)).intersectObject(foundation)[0];
      assert.ok(hit&&Math.abs(hit.point.y-s.foundation.floor)<.002,`${name} has a solid underside at ${x},${z}`);count++;
    }
    assert.ok(count>100,name);
  }
  const {wrap,terrain:s}=islands.get('island_crescent_bay');
  const p=new THREE.Vector3(0,s.foundation.floor-1,0);
  assert.equal(new THREE.Raycaster(p,new THREE.Vector3(0,1,0)).intersectObject(wrap.getObjectByName('Island_solid_foundation')).length,0,'open lagoon is not capped with a disk');
});

test('volcano foot meets the real ground while the crater stays at its authored height', () => {
  const fit=islands.get('island_volcanic'),foot=fit.terrain.volcanoFoot;
  assert.ok(foot.samples.length>=20,'the entire lower ring was inspected');
  assert.ok(foot.samples.every(p=>p.before-p.ground>.2),'the source really contained a gap');
  assert.ok(foot.samples.every(p=>Math.abs(p.after-p.ground)<.031),'ring extends slightly into supporting ground');
  const meshes=fit.wrap.getObjectsByProperty('isMesh',true).filter(m=>m.material.name==='island_v3_ground');
  fit.wrap.updateMatrixWorld(true);
  for(const p of foot.samples) {
    const at=new THREE.Vector3(p.x,foot.peak+10,p.z).applyAxisAngle(new THREE.Vector3(0,1,0),fit.wrap.rotation.y);
    const hit=new THREE.Raycaster(at,new THREE.Vector3(0,-1,0)).intersectObjects(meshes)[0];
    assert.ok(hit&&Math.abs(hit.point.y-p.ground)<.06,'visible cone and ground have no vertical gap at the foot');
  }
  assert.ok(Math.abs(foot.peak-(5.6475*fit.vertical+.35))<.01);
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

test('scattered props are deterministic, grounded, budgeted and leave a landing corridor', async () => {
  for(const [name,{terrain:s,wrap}] of islands){
    assert.ok(s.scatter.triangles<=s.scatter.budget,name);
    const instanced=wrap.getObjectsByProperty('isInstancedMesh',true);
    assert.equal(instanced.length,s.scatter.batches.length);
    for(const p of s.scatter.props){
      assert.ok(shoreDistance(s,p.position[0],p.position[2])<-3);
      assert.ok(Math.abs(p.position[1]+p.burial-p.groundY)<1e-6,'no hovering bases');
      assert.ok(Math.hypot(p.position[0],p.position[2])>=12,'centre stays clear');
      const [dx,dz]=s.scatter.corridor.direction,x=p.position[0],z=p.position[2];
      assert.ok(x*dx+z*dz<=0||Math.abs(x*dz-z*dx)>=6,'landing corridor stays clear');
    }
    for(const mesh of instanced){
      const matrix=new THREE.Matrix4();
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);const pos=new THREE.Vector3().setFromMatrixPosition(matrix);
        assert.ok(s.scatter.props.some(p=>pos.distanceTo(new THREE.Vector3(...p.position))<1e-4),'rendered instance matches grounded metadata');
      }
    }
  }
  const b=await readFile(new URL('../public/models/islands/island_cove_small.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');prepareIslandV3(scene);
  const first=fitIslandV3(scene,165,new THREE.Vector3(1,0,0),42,7.5),again=fitIslandV3(scene,165,new THREE.Vector3(1,0,0),42,7.5);
  assert.deepEqual(first.terrain.scatter,again.terrain.scatter);
  assert.ok(first.terrain.scatter.props.filter(p=>p.kind==='palm').length>=30,'large cove has groves, not five isolated trees');
  assert.ok(first.terrain.scatter.props.some(p=>p.kind==='rock'));
  const library={};
  for(const [kind,name] of [['palm','palm_tree'],['rock','rock_cluster']]){
    const data=await readFile(new URL(`../public/models/kit/${name}.glb`,import.meta.url));
    library[kind]=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
  }
  const detailed=fitIslandV3(scene,165,new THREE.Vector3(1,0,0),42,7.5,library);
  assert.ok(detailed.terrain.scatter.props.some(p=>p.source==='Library_palm_0'));
  assert.ok(detailed.terrain.scatter.props.some(p=>p.source==='Library_rock_0'));
  assert.ok(detailed.terrain.scatter.triangles<=24000);
});

test('voyage legs grow threefold without changing ship speed or quest identities', () => {
  assert.equal(VOYAGE_SPACING,3);
  const baseline=[[0,0],[30,-190],[-150,-360],[110,-520],[320,-470]];
  const actual=[{x:0,z:0},...ISLANDS,BOSS_HOME];
  for(let i=1;i<actual.length;i++){
    const metres=Math.hypot(actual[i].x-actual[i-1].x,actual[i].z-actual[i-1].z);
    const previous=Math.hypot(baseline[i][0]-baseline[i-1][0],baseline[i][1]-baseline[i-1][1]);
    assert.ok(Math.abs(metres/previous-3)<1e-8);
  }
  assert.deepEqual(ISLANDS.map(d=>d.name),['Остров Креста','Бухта Попугая','Остров Черепа']);
});

test('islands grow threefold in footprint while authored props keep their human scale', async () => {
  assert.equal(ISLE_SCALE,7.5);
  for(const name of ISLAND_V3){
    const b=await readFile(new URL(`../public/models/islands/${name}.glb`,import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
    prepareIslandV3(scene);
    const old=fitIslandV3(scene,55,null,1,2.5),large=fitIslandV3(scene,165,null,1,7.5);
    assert.ok(Math.abs(large.scale/old.scale-3)<1e-8,name);
    assert.ok(Math.abs(large.vertical/old.vertical-Math.sqrt(3))<1e-8,name);
    assert.ok(Math.abs(large.propScale-old.propScale)<1e-8,name);
    assert.ok(large.terrain.cell<1.5,'coast grid remains fine enough for the enlarged shore');
  }
  const all=[...ISLANDS.map(i=>({x:i.x,z:i.z,r:i.radius*1.15})),...SCENERY.map(([x,z,r])=>({x,z,r:r*1.15}))];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const a=all[i],b=all[j];assert.ok(Math.hypot(a.x-b.x,a.z-b.z)-a.r-b.r>100,'ships retain open passages between islands');
  }
});
