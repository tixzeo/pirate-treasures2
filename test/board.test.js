import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, N, GEMS, CANNON_ROW, CANNON_COL, BARREL, COMPASS } from '../src/match3/board.js';

// Seeded random so a failing board can be replayed.
const seeded = s => () => (s = (s * 9301 + 49297) % 233280) / 233280;

// Lays out a board from rows of digits; '.' cells get filler that never matches.
function layout(rows) {
  const b = new Board({ types: 7, rand: seeded(1) });
  const filler = (r, c) => 3 + ((r + Math.floor(c / 2)) % 2) * 1 + ((c % 2) ? 2 : 0);
  b.grid = rows.map((line, r) => [...line].map((ch, c) => b.tile(ch === '.' ? filler(r, c) : +ch, r, c)));
  return b;
}

test('fresh board has no matches and has a move', () => {
  for (let s = 1; s < 40; s++) {
    const b = new Board({ types: 6, rand: seeded(s) });
    assert.equal(b.findGroups().length, 0);
    assert.ok(b.findMove());
  }
});

test('swap that makes nothing is undone', () => {
  const b = new Board({ types: 6, rand: seeded(3) });
  const before = b.grid.map(row => row.map(t => t.t).join('')).join('/');
  let bad = null;
  for (let r = 0; r < N && !bad; r++) for (let c = 0; c + 1 < N && !bad; c++) {
    b.swap({ r, c }, { r, c: c + 1 });
    if (!b.findGroups().length) bad = [{ r, c }, { r, c: c + 1 }];
    b.swap({ r, c }, { r, c: c + 1 });
  }
  assert.equal(b.trySwap(...bad), null);
  assert.equal(b.grid.map(row => row.map(t => t.t).join('')).join('/'), before);
});

test('three in a row clears, scores and refills', () => {
  const b = layout([
    '00.0....', '........', '........', '........',
    '........', '........', '........', '........',
  ]);
  const steps = b.trySwap({ r: 0, c: 2 }, { r: 0, c: 3 });
  assert.ok(steps);
  assert.equal(steps[0].kind, 'clear');
  assert.equal(steps[0].cleared.length, 3);
  assert.equal(b.collected[0], 3);
  assert.ok(b.score >= 30);
  assert.ok(b.grid.flat().every(Boolean), 'board is full after the drop');
});

test('four in a row makes a row cannonball, five makes a compass bomb', () => {
  const four = layout(['000.0...', '........', '........', '........', '........', '........', '........', '........']);
  const s4 = four.trySwap({ r: 0, c: 3 }, { r: 0, c: 4 });
  assert.equal(s4[0].made[0].t, CANNON_ROW);

  const col = layout(['0.......', '0.......', '0.......', '.0......', '........', '........', '........', '........']);
  const sc = col.trySwap({ r: 3, c: 0 }, { r: 3, c: 1 });
  assert.equal(sc[0].made[0].t, CANNON_COL);

  const five = layout(['00.00...', '..0.....', '........', '........', '........', '........', '........', '........']);
  const s5 = five.trySwap({ r: 0, c: 2 }, { r: 1, c: 2 });
  assert.equal(s5[0].made[0].t, COMPASS);
});

test('corner of five makes a powder barrel', () => {
  const g = layout(['000.....', '..0.....', '..0.....', '........', '........', '........', '........', '........']);
  const groups = g.findGroups();
  assert.equal(groups.length, 1);
  assert.equal(g.specialFor(groups[0], []).type, BARREL);
});

test('cannonball clears its whole row', () => {
  const b = layout(['........', '........', '........', '........', '........', '........', '........', '........']);
  b.grid[4][2].t = CANNON_ROW;
  const steps = b.trySwap({ r: 4, c: 2 }, { r: 3, c: 2 });
  assert.ok(steps);
  const first = steps[0];
  assert.equal(first.fired[0].t, CANNON_ROW);
  assert.equal(first.fired[0].hits.length, N - 1);
});

test('compass bomb swapped with a treasure takes every piece of that kind', () => {
  const b = layout(['........', '........', '........', '........', '........', '........', '........', '........']);
  b.grid[0][0].t = COMPASS; b.grid[0][1].t = 1; b.grid[5][5].t = 1; b.grid[7][2].t = 1;
  const steps = b.trySwap({ r: 0, c: 0 }, { r: 0, c: 1 });
  const hit = steps[0].fired[0].hits;
  assert.equal(hit.length, 3);
});

test('long random play keeps the board valid', () => {
  const b = new Board({ types: 7, rand: seeded(11) });
  for (let i = 0; i < 300; i++) {
    const [a, c] = b.findMove();
    assert.ok(b.trySwap(a, c), 'the move findMove offers is accepted');
    const flat = b.grid.flat();
    assert.ok(flat.every(Boolean));
    flat.forEach(t => { assert.equal(b.grid[t.r][t.c], t); });
    assert.ok(flat.every(t => t.t >= 0 && t.t <= COMPASS && t.t !== GEMS));
    assert.equal(b.findGroups().length, 0, 'no leftover matches after a move');
  }
});
