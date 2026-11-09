import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, Match, COLS, HEIGHT, panel } from '../src/engine.js';
import { CPU_LEVELS, ComputerPlayer, choosePlan } from '../src/cpu.js';

function field(kinds) {
  const board = new Board(123, { autoRise: false });
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  board.grid[0] = kinds.map(kind => kind === null ? null : panel(kind));
  return board;
}

test('ten profiles increase planning and pace with a human-scale speed ceiling', () => {
  assert.equal(CPU_LEVELS.length, 10);
  assert.equal(CPU_LEVELS[0].interval, 30);
  assert.equal(CPU_LEVELS[9].interval, 10);
  for (let index = 1; index < CPU_LEVELS.length; index++) {
    assert.ok(CPU_LEVELS[index].interval < CPU_LEVELS[index - 1].interval);
    assert.ok(CPU_LEVELS[index].depth >= CPU_LEVELS[index - 1].depth);
    assert.ok(CPU_LEVELS[index].beam >= CPU_LEVELS[index - 1].beam);
  }
  for (const level of [0, 11, 20, 1.5, NaN, '5']) assert.throws(() => new ComputerPlayer(level), /1–10/);
});

test('expert CPU plans and completes a two-swap setup that the beginner cannot see', () => {
  const board = field([0, 1, 0, 2, 0, 3]);
  assert.deepEqual(choosePlan(board, CPU_LEVELS[0]), []);
  const plan = choosePlan(board, CPU_LEVELS[9]);
  assert.ok(plan.length >= 2);
  const cpu = new ComputerPlayer(10);
  let swaps = 0;
  const swap = board.swap.bind(board);
  board.swap = () => { const result = swap(); if (result) swaps++; return result; };
  for (let tick = 0; tick < 600 && board.cleared < 3; tick++) { cpu.step(board); board.step(); }
  assert.ok(board.cleared >= 3);
  assert.ok(swaps >= 2 && swaps <= 3, 'The setup finishes without aimless extra swaps');
});

test('CPU keeps a distant target while travelling and replans when the field changes', () => {
  const board = field([0, 1, 2, 3, 3, 4]);
  board.grid[1][4] = panel(0);
  board.grid[2][4] = panel(0);
  board.grid[0][5] = panel(0);
  board.cursor = { x: 0, y: 5 };
  const cpu = new ComputerPlayer(10);
  cpu.step(board);
  assert.ok(cpu.plan.length);
  const target = cpu.plan[0];
  for (let tick = 0; tick < cpu.interval; tick++) cpu.step(board);
  assert.equal(cpu.plan[0], target, 'Cursor travel does not discard a committed target');
  board.grid = field([0, 1, 2, 3, 4, null]).grid;
  for (let tick = 0; tick < cpu.interval; tick++) cpu.step(board);
  assert.deepEqual(cpu.plan, [], 'A changed board invalidates a stale plan');
});

test('CPU waits instead of shuffling an unsolvable field and never changes planning RNG', () => {
  const board = field([0, 1, 2, 3, 4, null]), identical = field([0, 1, 2, 3, 4, null]);
  const before = JSON.stringify(board);
  assert.deepEqual(choosePlan(board, CPU_LEVELS[9]), []);
  assert.equal(JSON.stringify(board), before);
  assert.deepEqual(board.makeRow(), identical.makeRow());
  const cpu = new ComputerPlayer(10);
  board.swap = () => assert.fail('No speculative shuffle without a reachable clear');
  for (let tick = 0; tick < 120; tick++) cpu.step(board);
  assert.equal(cpu.raise, true, 'Request fresh blocks when no useful move exists');
});

test('CPU respects animation locks and cancels raising when it has a plan or has lost', () => {
  const board = field([0, 0, 1, 0, 2, 3]), cpu = new ComputerPlayer(10);
  board.cursor = { x: 0, y: 3 };
  board.grid[0][0].phase = 'clear';
  cpu.step(board);
  assert.equal(cpu.raise, false);
  assert.deepEqual(cpu.plan, []);
  board.grid[0][0].phase = 'idle';
  cpu.step(board);
  assert.equal(cpu.raise, false);
  assert.ok(cpu.plan.length);
  board.lost = true;
  cpu.step(board);
  assert.equal(cpu.raise, false);
  assert.deepEqual(cpu.plan, []);
});

test('stronger planning clears more blocks across the same seeded fields', () => {
  const totals = [];
  for (const level of [1, 5, 10]) {
    let cleared = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const board = new Board(seed, { difficulty: 'normal' }), cpu = new ComputerPlayer(level);
      for (let tick = 0; tick < 3600 && !board.lost; tick++) {
        cpu.step(board); board.step({ raise: cpu.raise });
      }
      cleared += board.cleared;
    }
    totals.push(cleared);
  }
  assert.ok(totals[1] > totals[0], JSON.stringify(totals));
  assert.ok(totals[2] > totals[1] * 1.25, JSON.stringify(totals));
});

test('level ten wins against beginners but remains beatable by middle levels in seeded matches', () => {
  const results = [];
  for (const opponent of [1, 5]) {
    let wins = 0, losses = 0;
    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
      const match = new Match(seed, 'normal', 1, { cpu: false });
      const beginner = new ComputerPlayer(opponent), expert = new ComputerPlayer(10);
      for (let tick = 0; tick < 7200 && !match.result; tick++) {
        beginner.step(match.boards[0]); expert.step(match.boards[1]);
        match.step({ raise: beginner.raise }, { raise: expert.raise });
      }
      if (match.result === 'loss') wins++;
      if (match.result === 'win') losses++;
    }
    results.push({ wins, losses });
  }
  assert.ok(results[0].wins >= 6, JSON.stringify(results));
  assert.ok(results[1].wins > results[1].losses && results[1].losses > 0, JSON.stringify(results));
});
