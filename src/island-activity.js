// One island activity owns its input, scene and HUD. A factory receives ctx once;
// start receives a fresh visit context. ctx.world is read-only by contract (do
// not freeze the live Three.js world); shared rewards/saves belong to main.js.
let factory=null, current=null, running=false, visit=0, viewport=null;
const methods=['start','update','render','resize','stop'];

export function registerIslandActivity(nextFactory,{fallback=false}={}) {
  if(typeof nextFactory!=='function')throw new TypeError('Island activity factory must be a function');
  // Core installs match-3 as a fallback. A treasure module may register before
  // main runs, e.g. from its own UI entry, and must not be overwritten.
  if(fallback&&factory)return;
  activity.stop();factory=nextFactory;current=null;
}

const activity=Object.freeze({
  get active(){return running},
  get kind(){return current?.kind??null},
  start(ctx,onEnd){
    if(!factory)throw new Error('No island activity registered');
    if(typeof onEnd!=='function')throw new TypeError('Island activity needs an onEnd callback');
    activity.stop();
    if(!current){
      const created=factory(ctx);
      if(!created||methods.some(name=>typeof created[name]!=='function'))throw new TypeError('Incomplete island activity contract');
      current=created;
    }
    if(viewport)current.resize(...viewport);
    const token=++visit;let ended=false;running=true;
    try{
      current.start(Object.freeze({...ctx}),result=>{
        if(!running||token!==visit||ended)return;
        if(typeof result?.win!=='boolean'||!Number.isFinite(result.gold)||result.gold<0)throw new TypeError('Invalid island activity result');
        ended=true;onEnd({win:result.win,gold:result.gold});
      });
    }catch(error){activity.stop();throw error}
  },
  update(dt,t){if(running)current.update(dt,t)},
  render(){if(running)current.render()},
  resize(w,h){
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;
    viewport=[w,h];current?.resize(w,h);
  },
  stop(){const wasRunning=running;running=false;visit++;if(wasRunning)current.stop()},
  // Optional adapter-specific developer commands. Gameplay does not use this.
  debug(command,...args){if(running)return current.debug?.(command,...args)},
});

export function islandActivity(){return activity}
