// Fixed game steps, one render per browser frame. Recover ordinary 5 FPS frames
// without speeding through a suspended tab or building an unbounded backlog.
export const SIMULATION = Object.freeze({ step: 1/60, maxFrame: .25, pauseGap: 1 });
export class SimulationClock {
  constructor() { this.reset(); }
  reset() { this.remainder=0; this.time=0; }
  advance(elapsed, update, scale=1) {
    if (!Number.isFinite(elapsed) || elapsed<0 || !Number.isFinite(scale) || scale<=0) return 0;
    if (elapsed>SIMULATION.pauseGap) { this.remainder=0; return 0; }
    this.remainder+=Math.min(elapsed,SIMULATION.maxFrame)*Math.min(scale,3);
    const count=Math.floor((this.remainder+1e-10)/SIMULATION.step);
    for(let i=0;i<count;i++){this.time+=SIMULATION.step;update(SIMULATION.step,this.time);}
    this.remainder=Math.max(0,this.remainder-count*SIMULATION.step);
    return count;
  }
}
