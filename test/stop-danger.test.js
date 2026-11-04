import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, Match, COLS, HEIGHT, panel } from '../src/engine.js';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const measured = read('snes-s11a-results.json');
const jobs = read('snes-s11a-plan.json').jobs;
const kinds = { 1: 0, 2: 2, 3: 3, 4: 1, 5: 4, 7: 5 };
function empty(difficulty = 'normal', mode = 'story') {
  const board = new Board(42, { difficulty, mode, autoRise: false });
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  board.makeRow = () => Array(COLS).fill(null);
  board.nextRow = board.makeRow();
  return board;
}
const advance = (board, ticks) => { for (let i = 0; i < ticks; i++) board.step(); };
const column = (board, height, x = 5) => { for (let y = 0; y < height; y++) board.grid[y][x] = panel(1 + y % 4); };
const place = (board, cells) => { for (const [x, y, kind] of cells) board.grid[14 - y][x - 1] = panel(kinds[kind]); };

for (const [difficulty, profile] of Object.entries(measured.profiles)) {
  test(`${difficulty} replays every ordinary and danger combo grant without summing or forcing monotonic values`, () => {
    for (const high of [false, true]) for (let count = 3; count <= 12; count++) {
      const board = empty(difficulty);
      if (high) { column(board, 11); advance(board, 3); }
      place(board, jobs.find(j => j.name === `${difficulty}-combo-${count}`).fixture.cells);
      assert.equal(board.step().find(e => e.type === 'clear').count, count);
      assert.equal(board.stop, 0, 'The registration transition precedes the grant');
      board.step();
      assert.equal(board.stop, (high ? profile.highCombo : profile.combo)[count], `${high ? 'danger' : 'ordinary'} ${count}`);
    }
    const existing = empty(difficulty);
    existing.stop = 200;
    place(existing, jobs.find(j => j.name === `${difficulty}-combo-4`).fixture.cells);
    existing.step(); existing.step();
    assert.equal(existing.stop, 200, 'A new grant takes the maximum with the existing timer');
  });

  for (const high of [false, true]) for (const depth of [2, 3, 4]) {
    test(`${difficulty} ${high ? 'danger' : 'ordinary'} natural chain ×${depth} replays the recorded stop maximum`, () => {
      const board = empty(difficulty);
      if (high) { column(board, 11); advance(board, 3); }
      place(board, jobs.find(j => j.name === `${difficulty}-chain-${depth}`).fixture.cells);
      let maximum = 0;
      for (let tick = 0; tick < 450; tick++) { board.step(); maximum = Math.max(maximum, board.stop); }
      assert.equal(board.bestChain, depth);
      assert.equal(maximum, (high ? profile.highChain : profile.chain)[depth]);
    });
  }

  test(`${difficulty} four-clear grant and expiry match native board-processing steps`, () => {
    const board = empty(difficulty);
    place(board, jobs.find(j => j.name === `${difficulty}-combo-4`).fixture.cells);
    for (let step = 1; step <= profile.stopExpiry.expiry.boardStep; step++) {
      board.step();
      const expected = step < 2 ? 0 : step < profile.stopExpiry.firstDecrement.boardStep ? profile.combo[4] : Math.max(0, profile.combo[4] - (step - profile.stopExpiry.firstDecrement.boardStep + 1));
      assert.equal(board.stop, expected, `native board step ${step}`);
    }
  });

  test(`${difficulty} real insertion arms grace once, uses exactly its measured allowance, and prevents overflow`, () => {
    const board = empty(difficulty);
    column(board, 11);
    board.nextRow = Array.from({ length: COLS }, (_, x) => panel(x % 5));
    board.step({ raisePressed: true });
    advance(board, 17);
    assert.equal(board.cursor.y, 1);
    assert.equal(board.stop, profile.grace);
    assert.equal(board.graceUsed, true);
    const bottom = board.grid[0];
    advance(board, profile.grace - 1);
    assert.equal(board.stop, 1); assert.equal(board.lost, false);
    board.step();
    assert.equal(board.stop, 0); assert.equal(board.lost, true);
    assert.equal(board.grid[0], bottom);
  });

  test(`${difficulty} headroom waits for expiry to reset grace, then a later contact gets a full allowance`, () => {
    const board = empty(difficulty);
    column(board, 12);
    board.step(); advance(board, 10);
    board.grid[11][5] = null;
    const remaining = board.stop;
    board.step();
    assert.equal(board.graceUsed, true);
    assert.equal(board.stop, remaining - 1);
    advance(board, board.stop);
    assert.equal(board.graceUsed, false); assert.equal(board.lost, false);
    board.grid[11][5] = panel(2);
    board.step();
    assert.equal(board.stop, profile.grace);
    advance(board, profile.grace);
    assert.equal(board.lost, true);
  });

  test(`${difficulty} new and held raise inputs cancel ceiling grace without pushing a row`, () => {
    for (const held of [false, true]) {
      const board = empty(difficulty);
      column(board, 12);
      const bottom = board.grid[0];
      board.step({ raise: held });
      assert.equal(board.stop, profile.grace);
      board.step(held ? { raise: true } : { raisePressed: true });
      assert.equal(board.lost, true); assert.equal(board.stop, 0);
      assert.equal(board.grid[0], bottom);
    }
  });
}

test('danger flags scan paired columns on simulation ticks and ignore clearing cells', () => {
  const board = empty();
  column(board, 11);
  board.step(); board.step();
  assert.equal(board.dangerFlags[5], false);
  board.step(); assert.equal(board.dangerFlags[5], true);
  board.grid[10][5].phase = 'clear'; board.grid[10][5].timer = 30;
  board.step(); board.step(); assert.equal(board.dangerFlags[5], true);
  board.step(); assert.equal(board.dangerFlags[5], false);
  const low = empty(); column(low, 10); advance(low, 6);
  assert.equal(low.dangerFlags.some(Boolean), false);
});

test('an existing stop defers first contact, while hover consumes the timer and defers defeat', () => {
  const board = empty(); column(board, 12); board.stop = 10;
  advance(board, 9); assert.equal(board.stop, 1); assert.equal(board.graceUsed, false);
  board.step(); assert.equal(board.stop, 65); assert.equal(board.graceUsed, true);
  board.stop = 2;
  Object.assign(board.grid[11][5], { phase: 'hover', timer: 5 });
  advance(board, 2); assert.equal(board.stop, 0); assert.equal(board.lost, false);
  advance(board, 3); assert.equal(board.lost, true);
});

test('post-clear raise cancellation and first pixel replay the native two-call startup', () => {
  const board = empty(); board.rise = 2 / 16;
  place(board, jobs.find(j => j.name === 'normal-combo-4').fixture.cells);
  const native = measured.timelines['normal-cancel-after'];
  const cancel = native.find(s => s.frame === 120);
  const firstPixel = native.find(s => s.frame === 122);
  for (let step = 1; step <= firstPixel.boardStep; step++) {
    board.step({ raisePressed: step === cancel.boardStep });
    if (step === cancel.boardStep) assert.equal(board.stop, 0);
    assert.equal(board.rise, step < firstPixel.boardStep ? 2 / 16 : 3 / 16);
  }
});

test('an active clear extends ceiling grace with the selected table and holds it through cleanup', () => {
  const board = empty(); column(board, 12);
  board.step(); advance(board, 10);
  place(board, jobs.find(j => j.name === 'normal-combo-4').fixture.cells);
  board.step();
  const duration = board.grid[0][0].timer;
  board.step();
  assert.equal(board.stop, 99);
  advance(board, duration);
  assert.equal(board.stop, 99);
  assert.equal(board.graceUsed, true); assert.equal(board.lost, false);
  board.step(); assert.equal(board.stop, 98);
  advance(board, 98); assert.equal(board.lost, true);
});

test('released clear-time taps cancel stop and remain buffered through cleanup and startup', () => {
  const board = empty();
  place(board, jobs.find(j => j.name === 'normal-combo-4').fixture.cells);
  const firstPixel = measured.timelines['normal-hold-during'].find(s => s.rise === 3).boardStep;
  for (let step = 1; step <= firstPixel; step++) {
    board.step({ raisePressed: step === 21 });
    if (step >= 21) assert.equal(board.stop, 0);
    assert.equal(board.rise, step < firstPixel ? 0 : 1 / 16);
  }
  advance(board, 15);
  assert.equal(board.cursor.y, 1); assert.equal(board.rise, 0);
});

test('real hover/fall consumes stop, and a cancelled raise waits through landing before its first pixel', () => {
  for (const cancel of [false, true]) {
    const board = empty(); board.rise = 2 / 16;
    board.grid[6][2] = panel(0); board.cursor = { x: 2, y: 6 }; board.stop = 25;
    for (let frame = 0; frame <= 25; frame++) {
      if (frame === 2) board.swap();
      board.step({ raisePressed: cancel && frame === 8 });
      assert.equal(board.stop, cancel && frame >= 8 ? 0 : Math.max(0, 24 - frame));
      assert.equal(board.rise, cancel && frame >= 24 ? (3 + frame - 24) / 16 : 2 / 16);
    }
  }
});

test('verified Endless Normal stop grants remain distinct and unmeasured grants keep explicit fallbacks', () => {
  const native = read('snes-expanded-results.json');
  const board = empty('normal', 'endless');
  for (const { count, endlessNormalStop } of native.combos) assert.equal(board.stopGrant({ count, chain: 1, shocks: 0 }), endlessNormalStop);
  for (const { depth, endlessNormalStop } of native.chains) assert.equal(board.stopGrant({ count: 3, chain: depth, shocks: 0 }), endlessNormalStop);
  assert.equal(empty().stopGrant({ count: 3, chain: 5, shocks: 0 }), 166);
  assert.equal(empty().stopGrant({ count: 3, chain: 1, shocks: 3 }), 86);
});

test('unmeasured garbage fall and conversion recovery preserve the existing timer suspension', () => {
  const falling = empty(); falling.stop = 10;
  falling.addGarbage({ width: 3, height: 1 });
  falling.step(); assert.equal(falling.stop, 10);
  const recovering = empty(); recovering.stop = 10;
  recovering.grid[0][0] = panel(1, { phase: 'recover', timer: 20 });
  advance(recovering, 10); assert.equal(recovering.stop, 10);
});

for (const outcome of ['win', 'loss', 'draw']) {
  test(`${outcome} expiry clears pending inputs/grants and retry starts with fresh timer state`, () => {
    const match = new Match(42); match.cpu.step = () => {};
    match.boards = [empty(), empty()];
    match.boards.forEach((board, player) => {
      column(board, 12);
      board.graceUsed = true;
      board.stop = outcome === 'draw' || (outcome === 'win' ? player === 1 : player === 0) ? 1 : 20;
      board.raiseQueued = true;
    });
    match.attacks.push({ due: 999, target: 1, width: 6, height: 1 });
    match.step();
    assert.equal(match.result, outcome);
    assert.equal(match.attacks.length, 0);
    assert.ok(match.boards.every(board => !board.stopRequest && !board.raiseQueued && !board.raiseRemaining && !board.raiseHeld && !board.raisePause && board.raiseDelay === null));
    const snapshot = JSON.stringify(match.boards);
    assert.deepEqual(match.step({ raisePressed: true }), []);
    assert.equal(JSON.stringify(match.boards), snapshot);
    const retry = new Match(42);
    assert.ok(retry.boards.every(board => !board.stop && !board.stopRequest && !board.graceUsed && !board.clearHold && !board.landingHold && !board.dangerFlags.some(Boolean)));
  });
}
