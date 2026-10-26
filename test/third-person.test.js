import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeckCamera, CrewOcclusion, cameraRelativeMove } from '../src/deck-camera.js';
import { DeckWalker, makeDeckZone, deckClear } from '../src/deck-walk.js';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const nav = {surfaces:[],obstacles:[]};
const actor = () => ({position:{x:0,y:2,z:0}});

test('deck view survives leaving and entering with a fresh target', () => {
  const first = new DeckCamera(); first.orbit(170, -25); first.zoom(180);
  const second = new DeckCamera(first.view());
  second.update(1/60, new THREE.PerspectiveCamera(), new THREE.Group(), { position: { x: 2, y: 3, z: -4 } }, nav);
  assert.deepEqual(second.view(), first.view());
  assert.deepEqual(second.focus.toArray(), [2, 4.1, -4]);
  near(second.azimuth, first.yaw);
});

test('foreground crew fades without changing shared materials, and restores on exit', () => {
  const shared = new THREE.MeshStandardMaterial(), figure = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.7, 1), shared); figure.add(mesh);
  figure.position.set(0, 2.85, 1.5);
  const occlusion = new CrewOcclusion([{ figure }]);
  occlusion.update(new THREE.Vector3(0, 3.2, 4), actor().position);
  assert.notEqual(mesh.material, shared); assert.equal(shared.opacity, 1);
  assert.equal(mesh.material.opacity, .18); assert.equal(mesh.material.depthWrite, false);
  occlusion.update(new THREE.Vector3(4, 3.2, 0), actor().position);
  assert.equal(mesh.material.opacity, 1); assert.equal(mesh.material.transparent, false);
  assert.equal(mesh.material.depthWrite, true);
  occlusion.restore(); assert.equal(mesh.material, shared);
});

test('crew occlusion follows walking, turning and animated parts in a rolling ship', () => {
  const ship = new THREE.Group(), figure = new THREE.Group(); ship.add(figure);
  const shared = new THREE.MeshStandardMaterial();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.7, .4), shared); body.position.y = .85; figure.add(body);
  figure.position.set(3, 2, 1.5);
  const fade = new CrewOcclusion([{ figure, frame: ship }]), eye = new THREE.Vector3(0, 3.2, 4);
  fade.update(eye, actor().position); assert.equal(body.material, shared);
  figure.position.x = 0; ship.position.set(30, 2, -90); ship.rotation.set(.08, 1.2, -.13);
  fade.update(eye, actor().position); assert.equal(body.material.opacity, .18);
  figure.position.x = 3; figure.rotation.y = Math.PI / 2;
  fade.update(eye, actor().position); assert.equal(body.material.opacity, 1);
  body.position.z = -3; // an animated child now reaches into the view
  fade.update(eye, actor().position); assert.equal(body.material.opacity, .18);
  body.visible = false; fade.update(eye, actor().position); assert.equal(body.material.opacity, 1);
  fade.restore(); assert.equal(body.material, shared);
});

test('screen controls follow the view at four headings and preserve analogue magnitude',()=>{
  for(const [yaw,x,z] of [[0,0,-1],[Math.PI/2,-1,0],[Math.PI,0,1],[-Math.PI/2,1,0]]){
    const forward=cameraRelativeMove(0,-1,yaw);near(forward.x,x);near(forward.z,z);
    const diagonal=cameraRelativeMove(.3,-.7,yaw);near(Math.hypot(diagonal.x,diagonal.z),Math.hypot(.3,.7));
  }
});

test('movement uses the displayed camera, including a partly completed orbit on a moving ship',()=>{
  const ship=new THREE.Group(),camera=new THREE.PerspectiveCamera(),rig=new DeckCamera(),walker=actor();
  rig.update(1/60,camera,ship,walker,nav);
  rig.orbit(-Math.PI/.006,0);
  near(rig.movement(0,-1).z,-1); // desired yaw changed, visible camera has not yet turned
  for(let i=0;i<30;i++){
    ship.position.set(i,Math.sin(i),-i*2);ship.rotation.set(.07*Math.sin(i),i*.12,.06*Math.cos(i));ship.updateMatrixWorld(true);
    rig.update(1/60,camera,ship,walker,nav);
    const look=camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(ship.quaternion.clone().invert());look.y=0;look.normalize();
    const input=rig.movement(0,-1);near(new THREE.Vector3(input.x,0,input.z).dot(look),1);
    const right=rig.movement(1,0);near(right.x*input.x+right.z*input.z,0);
  }
});

test('a fast half-turn stays on the orbit instead of passing through the captain',()=>{
  const rig=new DeckCamera(),ship=new THREE.Group(),camera=new THREE.PerspectiveCamera(),walker=actor(),target=new THREE.Vector3(0,3.1,0);
  rig.update(1/60,camera,ship,walker,nav);rig.orbit(-Math.PI/.006,0);
  for(let i=0;i<80;i++){rig.update(1/60,camera,ship,walker,nav);near(camera.position.distanceTo(target),4.2);}
  near(rig.movement(0,-1).z,1);
  rig.yaw=Math.PI-.02;rig.update(1,camera,ship,walker,nav);const before=rig.azimuth;
  rig.yaw=-Math.PI+.02;rig.update(1/60,camera,ship,walker,nav);
  assert.ok(rig.azimuth>before&&rig.azimuth-before<.04,'short arc across the ±pi seam');
});

test('camera-relative movement still respects the same collision zone',()=>{
  const navigation={space:'ship-local',surfaces:[{name:'main',kind:'deck',bounds:{min:[-5,1.8,-5],max:[5,2,5]},outline:[[-5,-5],[5,-5],[5,5],[-5,5]]}],obstacles:[{bounds:{min:[-1.5,2,-2],max:[-1.4,6,2]}}]};
  const walker=new DeckWalker(makeDeckZone(navigation),{x:0,z:0}),rig=new DeckCamera(),ship=new THREE.Group(),camera=new THREE.PerspectiveCamera();rig.yaw=Math.PI/2;
  for(let i=0;i<120;i++){rig.update(1/60,camera,ship,walker,navigation);const move=rig.movement(0,-1);walker.update(1/60,move.x,move.z);}
  assert.ok(walker.position.x<-.8&&walker.position.x>=-1.08-1e-6);assert.ok(deckClear(walker.zone,walker.position.x,walker.position.z));
});
