import { Match3 } from './view.js';
import { N } from './board.js';

// The legacy match HUD is private to this adapter. main uses mode 'island';
// a future activity chooses its own HUD without changing the shared UI class.
export class Match3Activity {
  constructor(match){this.match=match;this.kind='match3'}
  start(ctx,onEnd){this.ui=ctx.ui;this.ui.mode('match');this.match.start(ctx.level,onEnd)}
  update(dt,t){this.match.update(dt,t)}
  render(){this.match.render()}
  resize(w,h){this.match.resize(w,h)}
  stop(){this.match.stop();this.ui?.mode('island')}
  debug(command,arg){
    const m=this.match;
    if(command==='view')return m;
    if(command==='state')return m.level?{level:m.level.name,moves:m.moves,score:m.board.score,collected:m.board.collected}:null;
    if(!m.active)return;
    if(command==='win'&&!m.over){
      const level=m.level,b=m.board;
      if(level.score)b.score=Math.max(b.score,level.score);
      for(const t in level.collect||{})b.collected[t]=Math.max(b.collected[t]||0,level.collect[t]);
      m.hud();m.checkEnd();
    }else if(command==='moves'){m.moves+=arg;m.hud()}
    else if(command==='shuffle'&&!m.busy)m.play(m.board.shuffle());
    else if(command==='special'&&!m.busy){
      const r=Math.floor(Math.random()*N),c=Math.floor(Math.random()*N),tile=m.board.grid[r][c];
      m.boardGroup.remove(m.meshes.get(tile.id));tile.t=arg;m.addMesh(tile.id,arg,r,c);
    }
  }
}

export function createMatch3Activity(ctx){return new Match3Activity(new Match3(ctx.renderer,ctx.ui))}
