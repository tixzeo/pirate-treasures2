// Fit the water plane over the hull footprint instead of delaying the ship's
// vertical response. Spatial averaging rejects short chop without phase lag.
// Coordinates are metres, heading 0 faces -Z. Wider middle sections contribute
// more support than the pointed ends; a travelling plane is still fitted exactly.
import { HULL_PHYSICS } from './ship-physics.js';
const cache=new Map();
export function hullProbes(length,width) {
  if(!Number.isFinite(length)||!Number.isFinite(width)||length<=0||width<=0)throw new Error('Invalid hull footprint');
  const key=length+'/'+width;if(cache.has(key))return cache.get(key);
  const probes=[],alongWeights=[1,4,2,4,1],crossWeights=[1,4,1];
  for(const [i,u] of [-.4,-.2,0,.2,.4].entries()){
    const beam=width*.42*Math.sqrt(1-(u/.5)**2);
    for(const [j,v] of [-1,0,1].entries())probes.push(Object.freeze({along:u*length,across:v*beam,weight:alongWeights[i]*crossWeights[j]*beam}));
  }
  if(cache.size>=16)cache.delete(cache.keys().next().value);
  cache.set(key,Object.freeze(probes));return cache.get(key);
}
export function sampleHullWater(height, { x, z, heading, length, width, draft=HULL_PHYSICS.draft }, time) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  let sum = 0, fore = 0, side = 0, foreSq = 0, sideSq = 0, count = 0;
  for (const {along,across,weight} of hullProbes(length,width)) {
    const h=height(x+fx*along+rx*across,z+fz*along+rz*across,time);
    sum+=weight*h;fore+=weight*along*h;side+=weight*across*h;
    foreSq+=weight*along*along;sideSq+=weight*across*across;count+=weight;
  }
  return { heave: sum / count - draft, pitch: Math.atan(fore / foreSq), roll: Math.atan(side / sideSq) * .8 };
}
