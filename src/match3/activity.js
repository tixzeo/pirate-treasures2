import { Match3 } from './view.js';

// The legacy match HUD is private to this adapter. main uses mode 'island';
// a future activity chooses its own HUD without changing the shared UI class.
export class Match3Activity {
  constructor(match){this.match=match;this.kind='match3'}
  start(ctx,onEnd){this.ui=ctx.ui;this.ui.mode('match');this.match.start(ctx.level,onEnd)}
  update(dt,t){this.match.update(dt,t)}
  render(){this.match.render()}
  resize(w,h){this.match.resize(w,h)}
  stop(){this.match.active=false;this.ui?.mode('island')}
}

export function createMatch3Activity(ctx){return new Match3Activity(new Match3(ctx.renderer,ctx.ui))}
