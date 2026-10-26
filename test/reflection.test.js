import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Post} from '../src/post.js';

function setup(farVisible=true,fail=false){
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,20,40);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const world={camera,scene:new THREE.Scene(),atmo:{rain:{visible:true}},sea:{mesh:{visible:true},backdrop:{visible:farVisible},uniforms:{uUseRefl:{value:1},uReflMatrix:{value:new THREE.Matrix4()}}}};
  world.scene.background=new THREE.Color('#123456');
  for(const key of ['sky','dome','clouds','stars','moon','moonGlow'])world.atmo[key]=new THREE.Object3D();
  const planes=[new THREE.Plane()],targets=[];
  let clearColor=new THREE.Color('#abcdef'),clearAlpha=1;
  const renderer={getClearColor(target){return target.copy(clearColor)},getClearAlpha(){return clearAlpha},setClearColor(color,alpha){clearColor.set(color);clearAlpha=alpha},clippingPlanes:planes,shadowMap:{autoUpdate:true},setRenderTarget(t){targets.push(t)},clear(){},render(){
    assert.equal(world.sea.mesh.visible,false);assert.equal(world.sea.backdrop.visible,false);
    for(const object of Object.values(world.atmo))assert.equal(object.visible,false,'sky stays procedural, not opaque in the planar target');
    assert.equal(world.scene.background,null);assert.equal(clearAlpha,0);
    assert.equal(world.sea.uniforms.uUseRefl.value,0,'no sampling of the target while it is written');
    if(fail)throw Error('render failed');
  }};
  return {world,renderer,planes,targets,post:{world,renderer,vcam:new THREE.PerspectiveCamera(),refl:{},plane:new THREE.Plane()}};
}
test('high reflection excludes both water meshes and restores their original visibility',()=>{
  for(const farVisible of [true,false]){
    const s=setup(farVisible);Post.prototype.renderReflection.call(s.post);
    assert.equal(s.world.sea.mesh.visible,true);assert.equal(s.world.sea.backdrop.visible,farVisible);
    assert.equal(s.world.atmo.rain.visible,true);assert.equal(s.world.sea.uniforms.uUseRefl.value,1);
    assert.equal(s.world.scene.background.getHexString(),'123456');
    assert.equal(s.renderer.getClearColor(new THREE.Color()).getHexString(),'abcdef');assert.equal(s.renderer.getClearAlpha(),1);
    assert.equal(s.renderer.clippingPlanes,s.planes);assert.equal(s.renderer.shadowMap.autoUpdate,true);
    assert.equal(s.targets.at(-1),null);
  }
});
test('failed reflection does not leave the ocean hidden or a stale mirror active',()=>{
  const s=setup(true,true);assert.throws(()=>Post.prototype.renderReflection.call(s.post),/render failed/);
  assert.equal(s.world.sea.mesh.visible,true);assert.equal(s.world.sea.backdrop.visible,true);
  assert.equal(s.world.atmo.rain.visible,true);assert.equal(s.world.sea.uniforms.uUseRefl.value,0);
  assert.equal(s.world.scene.background.getHexString(),'123456');
  assert.equal(s.renderer.getClearColor(new THREE.Color()).getHexString(),'abcdef');assert.equal(s.renderer.getClearAlpha(),1);
  assert.equal(s.renderer.clippingPlanes,s.planes);assert.equal(s.renderer.shadowMap.autoUpdate,true);
  assert.equal(s.targets.at(-1),null);
});
