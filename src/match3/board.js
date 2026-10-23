// Match-3 rules from part one, with no drawing in them.
// A move returns a list of steps; the view plays them back one by one.

export const N = 8;
// Treasures 0..6, then special pieces made by big matches.
export const GEMS = 7;
export const CANNON_ROW = 8, CANNON_COL = 9, BARREL = 10, COMPASS = 11;
export const isSpecial = t => t >= CANNON_ROW && t <= COMPASS;
export const NAMES = ['дублоны', 'рубины', 'изумруды', 'ракушки', 'компасы', 'якоря', 'черепа',
  '', 'ядро', 'ядро', 'бочка пороха', 'компас-бомба'];
export const VALUE = [1, 3, 2, 1, 2, 2, 4]; // gold per piece, as in part one

export class Board {
  constructor({ types = 5, rand = Math.random } = {}) {
    this.types = types;
    this.rand = rand;
    this.nextId = 1;
    this.collected = {};
    this.score = 0;
    this.fill();
  }

  tile(t, r, c) { return { id: this.nextId++, t, r, c }; }
  randomType() { return Math.floor(this.rand() * this.types); }

  // A fresh board with no ready matches and at least one possible move.
  fill() {
    do {
      this.grid = [];
      for (let r = 0; r < N; r++) {
        this.grid.push([]);
        for (let c = 0; c < N; c++) {
          let t;
          do t = this.randomType();
          while ((c >= 2 && this.grid[r][c - 1].t === t && this.grid[r][c - 2].t === t) ||
                 (r >= 2 && this.grid[r - 1][c].t === t && this.grid[r - 2][c].t === t));
          this.grid[r].push(this.tile(t, r, c));
        }
      }
    } while (!this.findMove());
  }

  at(r, c) { return r >= 0 && c >= 0 && r < N && c < N ? this.grid[r][c] : null; }
  tiles() { return this.grid.flat().filter(Boolean); }

  // Lines of 3+ merged into groups, so a corner of two lines counts as one match.
  findGroups() {
    const T = (r, c) => this.grid[r][c] ? this.grid[r][c].t : -1;
    const runs = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      let e = c; while (e + 1 < N && T(r, e + 1) === T(r, c)) e++;
      if (T(r, c) >= 0 && T(r, c) < GEMS && e - c >= 2) runs.push({ dir: 'h', cells: Array.from({ length: e - c + 1 }, (_, k) => [r, c + k]) });
      c = e + 1;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      let e = r; while (e + 1 < N && T(e + 1, c) === T(r, c)) e++;
      if (T(r, c) >= 0 && T(r, c) < GEMS && e - r >= 2) runs.push({ dir: 'v', cells: Array.from({ length: e - r + 1 }, (_, k) => [r + k, c]) });
      r = e + 1;
    }
    const groups = [];
    for (const run of runs) {
      const keys = run.cells.map(([r, c]) => r * N + c);
      const hit = groups.filter(g => keys.some(k => g.keys.has(k)));
      const g = { runs: [run], keys: new Set(keys) };
      hit.forEach(h => { g.runs.push(...h.runs); h.keys.forEach(k => g.keys.add(k)); groups.splice(groups.indexOf(h), 1); });
      groups.push(g);
    }
    return groups;
  }

  // Five in a line makes a compass bomb, a corner of five a powder barrel, four in a line a cannonball.
  specialFor(g, swapped) {
    const longest = Math.max(...g.runs.map(r => r.cells.length));
    const run = g.runs.find(r => r.cells.length === longest);
    let type = null, at = run.cells[Math.floor(run.cells.length / 2)];
    if (longest >= 5) type = COMPASS;
    else if (g.runs.some(r => r.dir === 'h') && g.runs.some(r => r.dir === 'v') && g.keys.size >= 5) {
      type = BARREL;
      const h = g.runs.find(r => r.dir === 'h'), v = g.runs.find(r => r.dir === 'v');
      at = h.cells.find(([r, c]) => v.cells.some(([r2, c2]) => r === r2 && c === c2)) || h.cells[1];
    } else if (longest === 4) type = run.dir === 'h' ? CANNON_ROW : CANNON_COL;
    if (type === null) return null;
    const mine = swapped.find(([r, c]) => g.keys.has(r * N + c));
    if (mine) at = mine;
    return { type, r: at[0], c: at[1] };
  }

  mostCommon() {
    const count = {};
    this.tiles().forEach(t => { if (t.t < GEMS) count[t.t] = (count[t.t] || 0) + 1; });
    return +Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  }

  // Tiles one special piece destroys.
  blast(sp) {
    if (sp.t === COMPASS) {
      const type = sp.aim ?? this.mostCommon();
      return this.tiles().filter(t => t.t === type);
    }
    const out = [];
    if (sp.t === BARREL) {
      for (let r = sp.r - 1; r <= sp.r + 1; r++) for (let c = sp.c - 1; c <= sp.c + 1; c++) {
        const t = this.at(r, c); if (t && t !== sp) out.push(t);
      }
      return out;
    }
    for (let k = 0; k < N; k++) {
      const t = sp.t === CANNON_ROW ? this.at(sp.r, k) : this.at(k, sp.c);
      if (t && t !== sp) out.push(t);
    }
    return out;
  }

  swap(a, b) {
    const ta = this.grid[a.r][a.c], tb = this.grid[b.r][b.c];
    this.grid[a.r][a.c] = tb; this.grid[b.r][b.c] = ta;
    [ta.r, tb.r] = [tb.r, ta.r];
    [ta.c, tb.c] = [tb.c, ta.c];
  }

  // Returns null when the swap is not allowed, otherwise the steps it caused.
  trySwap(a, b) {
    const ta = this.at(a.r, a.c), tb = this.at(b.r, b.c);
    if (!ta || !tb || Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return null;
    this.swap(a, b);
    const specials = [ta, tb].filter(t => isSpecial(t.t));
    if (ta.t === COMPASS && tb.t < GEMS) ta.aim = tb.t;
    if (tb.t === COMPASS && ta.t < GEMS) tb.aim = ta.t;
    if (!this.findGroups().length && !specials.length) { this.swap(a, b); return null; }
    const steps = this.resolve(specials, [[ta.r, ta.c], [tb.r, tb.c]]);
    if (!this.findMove()) steps.push(this.shuffle());
    return steps;
  }

  // One step of the cascade per loop: match groups, fire specials, make new specials, clear, drop.
  resolve(pending, swapped = []) {
    const steps = [];
    let combo = 1;
    while (true) {
      const groups = this.findGroups();
      if (!groups.length && !pending.length) break;
      const clear = new Set();
      groups.forEach(g => g.keys.forEach(k => clear.add(this.grid[Math.floor(k / N)][k % N])));
      const makes = groups.map(g => this.specialFor(g, swapped)).filter(Boolean);
      swapped = [];
      // A blast that reaches another special sets it off too.
      const fired = [], queue = [...pending], seen = new Set();
      pending = [];
      while (queue.length) {
        const sp = queue.shift();
        if (seen.has(sp)) continue;
        seen.add(sp); clear.add(sp);
        const hit = this.blast(sp);
        fired.push({ id: sp.id, t: sp.t, r: sp.r, c: sp.c, hits: hit.map(t => t.id) });
        for (const t of hit) {
          clear.add(t);
          if (isSpecial(t.t) && !seen.has(t)) queue.push(t);
        }
      }
      // New specials replace a matched piece instead of being cleared.
      const made = [];
      for (const m of makes) {
        const t = this.grid[m.r][m.c];
        if (!clear.has(t)) continue;
        clear.delete(t);
        this.collected[t.t] = (this.collected[t.t] || 0) + 1;
        t.t = m.type;
        made.push({ id: t.id, t: m.type });
      }
      const points = clear.size * 10 * combo;
      this.score += points;
      clear.forEach(t => {
        this.grid[t.r][t.c] = null;
        if (t.t < GEMS) this.collected[t.t] = (this.collected[t.t] || 0) + 1;
      });
      steps.push({ kind: 'clear', combo, points, fired, made, cleared: [...clear].map(t => t.id) });
      steps.push(this.gravity());
      combo++;
    }
    return steps;
  }

  gravity() {
    const fell = [], spawned = [];
    for (let c = 0; c < N; c++) {
      let write = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const t = this.grid[r][c];
        if (!t) continue;
        if (r !== write) { this.grid[write][c] = t; this.grid[r][c] = null; t.r = write; fell.push({ id: t.id, r: write, c }); }
        write--;
      }
      const missing = write + 1;
      for (let r = write; r >= 0; r--) {
        const t = this.tile(this.randomType(), r, c);
        this.grid[r][c] = t;
        spawned.push({ id: t.id, t: t.t, r, c, from: r - missing });
      }
    }
    return { kind: 'drop', fell, spawned };
  }

  // A pair of neighbours that makes a match, or a special that can be fired.
  findMove() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
      if (isSpecial(this.grid[r][c].t)) return [{ r, c }, { r, c: c + 1 < N ? c + 1 : c - 1 }];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const b = { r: r + dr, c: c + dc };
        if (b.r >= N || b.c >= N) continue;
        this.swap({ r, c }, b);
        const ok = this.findGroups().length > 0;
        this.swap({ r, c }, b);
        if (ok) return [{ r, c }, b];
      }
    }
    return null;
  }

  // Deals the same pieces again when no move is left.
  shuffle() {
    const all = this.tiles();
    do {
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [all[i].t, all[j].t] = [all[j].t, all[i].t];
      }
    } while (this.findGroups().length || !this.findMove());
    return { kind: 'shuffle', tiles: all.map(t => ({ id: t.id, t: t.t })) };
  }
}
