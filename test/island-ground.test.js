import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeGroundSurface,bindIslandGround,groundHeightAt,islandBounds} from '../src/island-ground.js';
test('world queries follow upright island translation, yaw and scale without changing terrain',()=>{
  const mesh=new T.Mesh(new T.PlaneGeometry(20,20).rotateX(-Math.PI/2));mesh.position.y=2;
  const before=Array.from(mesh.geometry.attributes.position.array),surface=makeGroundSurface([mesh]);
  const isle=new T.Group(),frame=new T.Group();isle.add(frame);isle.position.set(30,5,-20);isle.scale.set(2,1.5,3);frame.rotation.y=.7;frame.position.y=.35;
  bindIslandGround(isle,surface,frame);frame.updateWorldMatrix(true,false);
  const point=new T.Vector3(3,2,4).applyMatrix4(frame.matrixWorld);
  assert.ok(Math.abs(groundHeightAt(isle,point.x,point.z)-point.y)<1e-8);
  const bounds=islandBounds(isle);assert.ok(Object.isFrozen(bounds));assert.ok(point.x>=bounds.minX&&point.x<=bounds.maxX&&point.z>=bounds.minZ&&point.z<=bounds.maxZ);
  assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before);
  assert.equal(groundHeightAt(isle,1000,1000),null);assert.equal(groundHeightAt(isle,NaN,0),null);
});
test('queries retain physical ground after welding detaches or moves the source mesh',()=>{
  const ground=new T.Mesh(new T.PlaneGeometry(10,10).rotateX(-Math.PI/2));ground.position.y=1;
  const surface=makeGroundSurface([ground]),isle=new T.Group();bindIslandGround(isle,surface,isle);
  ground.position.y=100;ground.updateMatrixWorld(true);
  assert.ok(Math.abs(groundHeightAt(isle,0,0)-1)<1e-8);assert.ok(Math.abs(islandBounds(isle).maxY-1)<1e-8);
});
test('missing terrain is explicit, seabed is not silently snapped to dry land',()=>{
  const isle=new T.Group();assert.equal(groundHeightAt(isle,0,0),null);assert.equal(islandBounds(isle),null);
  const ground=new T.Mesh(new T.PlaneGeometry(10,10).rotateX(-Math.PI/2));ground.position.y=-3;
  bindIslandGround(isle,makeGroundSurface([ground]),isle);
  assert.ok(Math.abs(groundHeightAt(isle,0,0)+3)<1e-8);assert.equal(groundHeightAt(isle,50,50),null);
});
