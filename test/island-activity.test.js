import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerIslandActivity,islandActivity} from '../src/island-activity.js';
function fake(){
  const log=[];let done;
  return {kind:'fake',log,start(ctx,onEnd){log.push(['start',ctx]);done=onEnd},
    update(...args){log.push(['update',...args])},render(){log.push(['render'])},
    resize(...args){log.push(['resize',...args])},stop(){log.push(['stop'])},end(result){done(result)}};
}
test('registration, resize and lifecycle are routed to one activity',()=>{
  const f=fake(),a=islandActivity(),results=[];let creations=0;
  registerIslandActivity(()=>{creations++;return f});a.resize(800,600);
  const world={mutable:true};a.start({world,isle:{name:'test'}},r=>results.push(r));a.update(.1,3);a.render();
  assert.equal(a.kind,'fake');assert.equal(creations,1);assert.equal(f.log[0][0],'resize');
  assert.ok(Object.isFrozen(f.log[1][1]));assert.equal(f.log[1][1].world,world);assert.ok(!Object.isFrozen(world));
  f.end({win:true,gold:10});f.end({win:true,gold:10});assert.deepEqual(results,[{win:true,gold:10}]);
  a.stop();a.update(.1,4);a.render();assert.equal(f.log.at(-1)[0],'stop');
  a.start({},()=>{});assert.equal(creations,1);a.stop();
});
test('old completions cannot credit a new visit or a replaced activity',()=>{
  const f=fake(),a=islandActivity(),results=[];registerIslandActivity(()=>f);
  a.start({},r=>results.push(r));const oldEnd=r=>f.end(r);
  // Capture the actual callback before the fake receives a new visit.
  let callback;const other={...fake(),start(_ctx,end){callback=end}};
  registerIslandActivity(()=>other);a.start({},r=>results.push(r));const previous=callback;
  a.stop();a.start({},r=>results.push(r));previous({win:true,gold:10});oldEnd({win:true,gold:10});
  assert.deepEqual(results,[]);callback({win:true,gold:11});assert.deepEqual(results,[{win:true,gold:11}]);a.stop();
});
test('core fallback cannot override an externally registered activity',()=>{
  const f=fake(),a=islandActivity();registerIslandActivity(()=>f);
  registerIslandActivity(()=>{throw Error('fallback replaced treasure')},{fallback:true});
  a.start({},()=>{});assert.equal(a.kind,'fake');a.stop();
});
test('malformed factories and results fail before rewards are delivered',()=>{
  assert.throws(()=>registerIslandActivity(null),TypeError);
  registerIslandActivity(()=>({start(){}}));assert.throws(()=>islandActivity().start({},()=>{}),TypeError);
  const f=fake();registerIslandActivity(()=>f);let rewards=0;islandActivity().start({},()=>rewards++);
  for(const result of [{win:true,gold:NaN},{win:true,gold:-1},{win:'yes',gold:10}])assert.throws(()=>f.end(result),TypeError);
  assert.equal(rewards,0);islandActivity().stop();
});
