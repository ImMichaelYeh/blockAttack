import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, Match, COLS, HEIGHT, panel, findMatches } from '../src/engine.js';
const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const evidence = read('snes-s12a-results.json');
const jobs = read('snes-s12a-plan.json').jobs;
const kinds = { 1: 0, 2: 2, 3: 3, 4: 1, 5: 4, 7: 5 };

for (const name of ['isolated-4', 'isolated-5', 'isolated-6', 'isolated-8', 'isolated-12', 'position-right', 'position-high', 'repeat-4', 'repeat-5', 'repeat-6', 'mixed-widths', 'receiver-clear', 'fast-pop-launch']) {
  test(`${name} reproduces the recorded ordinary arrival frames, widths and columns`, () => {
    const job = jobs.find(j => j.name === name), match = new Match(42);
    match.cpu.step = () => {};
    for (const board of match.boards) {
      board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
      board.autoRise = false;
    }
    // Native CPU-off local VS has a handicap-five receiver, independently of the sender.
    match.boards[1].timing = { hover: 9, flash: 38, face: 20, pop: 8 };
    if (name === 'fast-pop-launch') match.boards[0].timing = { ...match.boards[0].timing, flash: 0 };
    for (const [x, y, k, player = 0] of job.fixture.cells) match.boards[player].grid[14 - y][x - 1] = panel(kinds[k]);
    const arrivals = [];
    const receiver = match.boards[1], add = receiver.addGarbage.bind(receiver);
    let frame;
    receiver.addGarbage = packet => {
      const accepted = add(packet);
      if (accepted) arrivals.push([frame, receiver.garbage.at(-1).x, packet.width]);
      return accepted;
    };
    for (frame = 0; frame < job.frames; frame++) {
      for (const [at, address, value] of job.fixture.actions || []) if (at === frame && address >= 0xF7C && address < 0x117C) {
        const offset = address - 0xF7C, player = offset >= 256 ? 1 : 0;
        const cell = offset - player * 256, nativeY = Math.floor(cell / 16), x = cell % 16 / 2;
        match.boards[player].grid[14 - nativeY][x - 1] = value ? panel(kinds[value]) : null;
      }
      match.step();
    }
    assert.deepEqual(arrivals, evidence.attacks[name].arrivals);
  });
}

test('ordinary preview rows follow measured predecessor/above exclusions with no random shocks', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const board = new Board(42, { difficulty });
    for (let i = 0; i < 300; i++) {
      const parity = board.rowState.alternate;
      const row = board.makeRow();
      const distance = difficulty === 'hard' && parity ? 1 : 2;
      row.forEach((cell, x) => {
        assert.ok(cell.kind < 5);
        assert.notEqual(cell.kind, board.grid[0][x]?.kind);
        if (x >= distance) assert.notEqual(cell.kind, row[x - distance].kind);
      });
      assert.equal(findMatches([row, ...Array.from({ length: HEIGHT - 1 }, () => Array(COLS).fill(null))]).length, 0);
      board.grid[0] = row;
    }
  }
});

test('pops earn a Story shock credit at the native threshold and generation consumes it once', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const board = new Board(42, { difficulty, autoRise: false });
    board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
    board.shockRemaining = 1;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 6; x++) board.grid[y][x] = panel(0);
    for (let i = 0; i < 200; i++) board.step();
    const native = evidence.credits[`story-${difficulty}-shock-credit-cross`];
    assert.equal(board.shockRemaining, native.remaining);
    assert.equal(board.shockCredits, 1); assert.equal(board.shocksEarned, 1);
    assert.equal(board.makeRow().filter(cell => cell.kind === 5).length, 1);
    assert.equal(board.shockCredits, 0);
    assert.equal(board.makeRow().filter(cell => cell.kind === 5).length, 0);
  }
  const endless = new Board(42, { mode: 'endless' });
  assert.equal(endless.shockQuota, 0);
});

test('failed placement preserves placement phases and panel random sequence; successful phases are independent', () => {
  const a = new Board(42), b = new Board(42);
  a.grid[11][5] = panel(1);
  assert.equal(a.addGarbage({ width: 3 }), false);
  assert.deepEqual(a.placement, b.placement);
  assert.equal(a.random(), b.random());
  for (const width of [3, 4, 5, 6]) {
    const xs = [];
    for (let i = 0; i < 6; i++) {
      a.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null)); a.garbage = [];
      assert.equal(a.addGarbage({ width }), true); xs.push(a.garbage[0].x);
    }
    assert.deepEqual(xs, Array.from({ length: 6 }, (_, i) => width === 3 ? i % 2 * 3 : i % (7 - width)));
  }
});
