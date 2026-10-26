import * as THREE from 'three';
import { flatten, mergeStatic } from './merge.js';
import { shoreDistance } from './island-shape.js';

export function scatterSources(native, library) {
  const sources=new Map();
  for(const [kind,root] of Object.entries(library)){
    if(!root)continue;root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(),list=[];const box=new THREE.Box3();
    root.traverse(m=>{if(!m.isMesh)return;const geometry=flatten(m,inverse);geometry.computeBoundingBox();box.union(geometry.boundingBox);list.push(new THREE.Mesh(geometry,m.material));});
    const base=new THREE.Vector3(),v=new THREE.Vector3();let count=0;
    for(const mesh of list){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)if(v.fromBufferAttribute(p,i).y<box.min.y+.05){base.add(v);count++;}}
    if(!count)continue;base.divideScalar(count);base.y=box.min.y;
    const scale=(kind==='palm'?6.5:2)/(box.max.y-box.min.y);
    for(const mesh of list)mesh.geometry.translate(-base.x,-base.y,-base.z).scale(scale,scale,scale);
    sources.set(kind==='palm'?'Library_palm_0':'Library_rock_0',list);
  }
  for(const entry of native)sources.set(...entry);
  return sources;
}

// Reuse the authored props with instancing: a grove costs one draw per material,
// rather than one draw for each trunk/frond. No additional model downloads.
export function scatterIslandProps(model, sources, terrain, probe, shore, pierDir, seed) {
  let state=(Math.abs(seed*1009)|0)+1;
  for(const name of sources.keys())for(const c of name)state=(state*31+c.charCodeAt(0))>>>0;
  const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const props=[],batches=[],reserved=terrain.props.map(p=>({x:p.position[0],z:p.position[2],radius:/hut|Temple|Keep/.test(p.name)?12:3}));
  const point=()=>{
    const i=Math.floor(rand()*terrain.size**2);
    return {x:terrain.minX+(i%terrain.size+.5)*terrain.cell,z:terrain.minZ+(Math.floor(i/terrain.size)+.5)*terrain.cell};
  };
  const templates=(pattern,count)=>[...sources].filter(([name])=>pattern.test(name)).slice(0,count).map(([name,meshes])=>{
    const group=new THREE.Group();
    for(const m of meshes){const mesh=new THREE.Mesh(m.geometry.clone(),m.material);mesh.name=m.name;group.add(mesh);}
    mergeStatic(group,/$a/);
    const parts=group.getObjectsByProperty('isMesh',true),box=new THREE.Box3().setFromObject(group);
    return {name,parts,height:box.max.y-box.min.y,triangles:parts.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)};
  });
  const volcanic=[...sources.keys()].some(n=>/Volcanic/.test(n));
  const plans=[
    {kind:'hut',templates:templates(/(?:fishers?_hut|stilt_hut|guard_hut)/,1),count:shore>90&&!volcanic?2:0,radius:7,slope:.96,near:true},
    {kind:'palm',templates:templates(/_palm_\d+$/,3),count:volcanic?0:Math.min(64,Math.round(Math.PI*shore*shore/1300)),radius:3.8,slope:.8},
    {kind:'rock',templates:templates(/(?:rock|boulder)_\d+$/,2),count:Math.min(32,Math.round(Math.PI*shore*shore/2200)),radius:2.2,slope:.55},
  ];
  let triangles=0;
  for(const plan of plans){
    if(!plan.count||!plan.templates.length)continue;
    const clusters=[];
    for(let i=0;i<5;i++)for(let attempt=0;attempt<100;attempt++){
      const p=point();if(shoreDistance(terrain,p.x,p.z)<-6){clusters.push(p);break;}
    }
    const perTemplate=plan.templates.map(()=>[]);let kindTriangles=0;
    for(let attempt=0,placed=0;attempt<plan.count*60&&placed<plan.count;attempt++){
      let p=point();
      if(plan.kind==='palm'&&clusters.length){const c=clusters[Math.floor(rand()*clusters.length)],a=rand()*Math.PI*2,r=Math.sqrt(rand())*shore*.19;p={x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r};}
      const distance=shoreDistance(terrain,p.x,p.z);
      if(distance>-Math.max(3,plan.radius)||plan.near&&distance<-24||Math.hypot(p.x,p.z)<12)continue;
      const along=p.x*pierDir.x+p.z*pierDir.z,across=p.x*pierDir.z-p.z*pierDir.x;
      if(along>0&&Math.abs(across)<6)continue; // six-metre half corridor from the landing
      if(reserved.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<plan.radius+q.radius))continue;
      const hit=probe(p.x,p.z);if(!hit||hit.y<.35||hit.slope<plan.slope)continue;
      if(plan.kind==='hut'&&[[-4,-3],[-4,3],[4,-3],[4,3]].some(([x,z])=>{const h=probe(p.x+x,p.z+z);return !h||Math.abs(h.y-hit.y)>.3;}))continue;
      const index=plan.kind==='palm'&&plan.templates[0].name.startsWith('Library')&&plan.templates.length>1?
        (rand()<.16?0:1+Math.floor(rand()*(plan.templates.length-1))):Math.floor(rand()*plan.templates.length),template=plan.templates[index];
      const remaining=Math.min(24000-triangles,(plan.kind==='palm'?17000:24000)-kindTriangles);
      if(template.triangles>remaining){if(Math.min(...plan.templates.map(t=>t.triangles))>remaining)break;else continue;}
      const scale=plan.kind==='palm'?1.15+rand()*.65:plan.kind==='rock'?.7+rand()*.75:.9+rand()*.15;
      const yaw=rand()*Math.PI*2,burial=plan.kind==='rock'?template.height*scale*.18:.08;
      const prop={kind:plan.kind,source:template.name,position:[p.x,hit.y-burial,p.z],groundY:hit.y,burial,scale,yaw};
      props.push(prop);perTemplate[index].push(prop);reserved.push({x:p.x,z:p.z,radius:plan.radius});
      triangles+=template.triangles;kindTriangles+=template.triangles;placed++;
    }
    plan.templates.forEach((template,i)=>{
      const list=perTemplate[i];if(!list.length)return;
      for(const part of template.parts){
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,list.length);mesh.name=`Island_${plan.kind}_${template.name}`;
        const object=new THREE.Object3D();
        list.forEach((p,j)=>{object.position.fromArray(p.position);object.rotation.y=p.yaw;object.scale.setScalar(p.scale);object.updateMatrix();mesh.setMatrixAt(j,object.matrix);});
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=mesh.receiveShadow=true;model.add(mesh);
        batches.push({kind:plan.kind,count:list.length,triangles:(part.geometry.index?.count??part.geometry.attributes.position.count)/3*list.length});
      }
    });
  }
  return {props,batches,triangles,budget:24000,corridor:{direction:[pierDir.x,pierDir.z],halfWidth:6}};
}
