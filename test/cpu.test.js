import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, Match, COLS, ROWS, HEIGHT, panel } from '../src/engine.js';
import { CPU_LEVELS, ComputerPlayer, choosePlan } from '../src/cpu.js';

function field(kinds) {
  const board = new Board(123, { autoRise: false });
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  board.grid[0] = kinds.map(kind => kind === null ? null : panel(kind));
  return board;
}

test('ten profiles increase planning and pace up to a fast final boss', () => {
  assert.equal(CPU_LEVELS.length, 10);
  assert.equal(CPU_LEVELS[0].interval, 30);
  assert.equal(CPU_LEVELS[9].interval, 3);
  assert.equal(CPU_LEVELS[9].raiseBelow, 9);
  assert.equal(CPU_LEVELS[0].attackHeight, 0);
  assert.equal(CPU_LEVELS[9].attackHeight, 9);
  for (let index = 1; index < CPU_LEVELS.length; index++) {
    assert.ok(CPU_LEVELS[index].interval < CPU_LEVELS[index - 1].interval);
    assert.ok(CPU_LEVELS[index].depth >= CPU_LEVELS[index - 1].depth);
    assert.ok(CPU_LEVELS[index].beam > CPU_LEVELS[index - 1].beam);
    assert.equal(CPU_LEVELS[index - 1].interval - CPU_LEVELS[index].interval, 3);
    assert.ok(CPU_LEVELS[index].attackHeight > CPU_LEVELS[index - 1].attackHeight);
    assert.ok(CPU_LEVELS[index].raiseBelow >= CPU_LEVELS[index - 1].raiseBelow);
    assert.ok(CPU_LEVELS[index].attackHeight <= CPU_LEVELS[index].raiseBelow);
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

test('expert planning chooses a cascade and completes it in the real simulation', () => {
  const board = new Board(1, { autoRise: false });
  const plan = choosePlan(board, CPU_LEVELS[9]);
  let chain = 0;
  assert.ok(plan.length);
  for (const { x, y } of plan) {
    board.cursor = { x, y };
    assert.ok(board.swap());
    for (let tick = 0; tick < 600; tick++) {
      for (const event of board.step()) {
        if (event.type === 'chain-end') chain = Math.max(chain, event.chain);
      }
    }
  }
  assert.ok(chain >= 2, 'The expert should choose a chain over independent clears');
});

test('CPU considers clears on the highest swappable row', () => {
  const board = field([]);
  for (let y = 0; y < ROWS - 1; y++) {
    board.grid[y] = Array.from({ length: COLS }, (_, x) => panel((x + y) % 5));
  }
  board.grid[ROWS - 1] = [0, 0, 1, 0, 2, 3].map(kind => panel(kind));
  board.cursor = { x: 2, y: ROWS - 1 };
  const plan = choosePlan(board, CPU_LEVELS[0]);
  assert.deepEqual(plan.map(({ x, y }) => ({ x, y })), [{ x: 2, y: ROWS - 1 }]);
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
  const board = field([0, 0, 1, 0, 2, 3]), cpu = new ComputerPlayer(1);
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

test('every level gradually raises the stack height at which it cancels stop for attacks', () => {
  for (let level = 1; level <= 10; level++) {
    const cpu = new ComputerPlayer(level);
    for (const height of new Set([Math.max(1, cpu.profile.attackHeight - 1), Math.max(1, cpu.profile.attackHeight)])) {
      const board = field([]);
      for (let y = 0; y < height; y++) {
        board.grid[y] = Array.from({ length: COLS }, (_, x) => panel((x + y) % 5));
      }
      board.stop = 60;
      cpu.cooldown = 100;
      cpu.step(board);
      assert.equal(cpu.raise, height < cpu.profile.attackHeight, `level ${level}, height ${height}`);
    }
  }
});

test('level ten feeds attacks while travelling, cancels stop, and stops raising at height nine', () => {
  const board = field([0, 0, 1, 0, 2, 3]), cpu = new ComputerPlayer(10);
  board.cursor = { x: 0, y: 3 };
  board.stop = 60;
  cpu.step(board);
  assert.ok(cpu.plan.length);
  assert.equal(cpu.raise, true, 'Keep supplying blocks while moving toward an attack');
  board.step({ raise: cpu.raise });
  assert.equal(board.stop, 0, 'The boss cancels its own stop time to maintain pressure');
  board.grid[8][0] = panel(2);
  cpu.step(board);
  assert.equal(cpu.raise, false, 'Leave headroom instead of raising into the ceiling');
  board.grid[8][0] = null;
  board.grid[0][0].phase = 'clear';
  cpu.step(board);
  assert.equal(cpu.raise, false, 'Animation locks still apply to the boss');
  board.lost = true;
  cpu.step(board);
  assert.equal(cpu.raise, false);
  assert.deepEqual(cpu.plan, []);
});

test('incoming trash cancels buffered raising at every level while the CPU still pursues clears', () => {
  for (let level = 1; level <= 10; level++) {
    const board = field([0, 0, 1, 0, 2, 3]), cpu = new ComputerPlayer(level);
    board.cursor = { x: 0, y: 3 };
    board.stop = 60;
    board.raiseQueued = true;
    board.raiseRemaining = 0.5;
    board.raiseDelay = 1;
    cpu.step(board, true);
    assert.equal(cpu.raise, false, `level ${level}`);
    assert.equal(board.raiseQueued, false);
    assert.equal(board.raiseRemaining, 0);
    assert.equal(board.raiseDelay, null);
    assert.ok(cpu.plan.length, 'Incoming trash must not freeze useful clearing moves');
    assert.notDeepEqual(board.cursor, { x: 0, y: 3 });
    board.step({ raise: cpu.raise });
    assert.equal(board.rise, 0);
    assert.ok(board.stop > 0, 'Preserve defensive stop time');
  }
});

test('falling trash cancels buffered raising even after it leaves the attack queue', () => {
  const board = field([0, 1, 2, 3, 4, null]), cpu = new ComputerPlayer(10);
  assert.ok(board.addGarbage({ width: 6, height: 2 }));
  board.raiseQueued = true;
  board.raiseRemaining = 0.5;
  board.raiseDelay = 1;
  cpu.step(board);
  assert.equal(cpu.raise, false);
  assert.equal(board.raiseQueued, false);
  assert.equal(board.raiseRemaining, 0);
  assert.equal(board.raiseDelay, null);
});

test('CPU resumes aggressive raising once incoming trash is gone', () => {
  const board = field([0, 0, 1, 0, 2, 3]), cpu = new ComputerPlayer(10);
  board.cursor = { x: 0, y: 3 };
  cpu.step(board, true);
  assert.equal(cpu.raise, false);
  cpu.step(board);
  assert.equal(cpu.raise, true);
});

test('Match exposes its incoming attack queue to the CPU without treating outgoing trash as a threat', () => {
  for (const [target, due] of [[0, 1], [1, 1], [0, 161], [1, 161]]) {
    const cpu = new ComputerPlayer(10);
    const match = new Match(123, 'hard', 1, { opponent: cpu });
    match.boards = [field([0, 1, 2, 3, 4, null]), field([0, 0, 1, 0, 2, 3])];
    const board = match.boards[1];
    board.cursor = { x: 0, y: 3 };
    board.stop = 60;
    board.raiseRemaining = 0.5;
    match.attacks.push({ due, target, sender: 1 - target, width: 6, height: 2, metal: false });
    match.step();
    assert.equal(cpu.raise, target === 0);
    assert.equal(board.raiseRemaining > 0, target === 0);
    assert.equal(board.stop > 0, target === 1);
    assert.equal(match.boards[target].garbage.length, due === 1 ? 1 : 0);
    assert.equal(match.attacks.length, due === 1 ? 0 : 1);
  }
});

test('all ten levels sustain a gradual increase in clears across the same seeded fields', () => {
  const totals = [];
  for (let level = 1; level <= 10; level++) {
    let cleared = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const board = new Board(seed, { difficulty: 'normal' }), cpu = new ComputerPlayer(level);
      for (let tick = 0; tick < 3600 && !board.lost; tick++) {
        cpu.step(board); board.step({ raise: cpu.raise });
      }
      cleared += board.cleared;
      assert.equal(board.lost, false, `level ${level}, seed ${seed}`);
    }
    totals.push(cleared);
  }
  for (let index = 1; index < totals.length; index++) {
    assert.ok(totals[index] >= totals[index - 1], JSON.stringify(totals));
  }
  assert.ok(totals[5] > totals[2] * 1.25, JSON.stringify(totals));
  assert.ok(totals[9] > totals[5] * 1.25, JSON.stringify(totals));
});

test('higher levels clear more and build more attacks with identical pace and raising', () => {
  const totals = [];
  for (const level of [1, 5, 10]) {
    const total = { cleared: 0, combos: 0, chains: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const board = new Board(seed, { difficulty: 'normal' }), cpu = new ComputerPlayer(level);
      cpu.interval = 10;
      cpu.profile = { ...cpu.profile, raiseBelow: 7, attackHeight: 0 };
      for (let tick = 0; tick < 3600 && !board.lost; tick++) {
        cpu.step(board);
        for (const event of board.step({ raise: cpu.raise })) {
          if (event.type === 'clear' && event.count >= 4) total.combos++;
          if (event.type === 'chain-end') total.chains++;
        }
      }
      total.cleared += board.cleared;
    }
    totals.push(total);
  }
  for (let index = 1; index < totals.length; index++) {
    for (const metric of ['cleared', 'combos', 'chains']) {
      assert.ok(totals[index][metric] > totals[index - 1][metric], `${metric}: ${JSON.stringify(totals)}`);
    }
  }
  assert.ok(totals[2].combos >= totals[0].combos * 2, JSON.stringify(totals));
  assert.ok(totals[2].chains >= totals[0].chains * 1.5, JSON.stringify(totals));
});

test('level ten boss produces more combos and chains than its previous tuning', () => {
  const totals = [];
  for (const aggressive of [false, true]) {
    const total = { combos: 0, chains: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const board = new Board(seed, { difficulty: 'hard' }), cpu = new ComputerPlayer(10);
      if (!aggressive) {
        cpu.interval = 10;
        cpu.profile = { ...cpu.profile, raiseBelow: 7, attackHeight: 0 };
      }
      for (let tick = 0; tick < 3600 && !board.lost; tick++) {
        cpu.step(board);
        for (const event of board.step({ raise: cpu.raise })) {
          if (event.type === 'clear' && event.count >= 4) total.combos++;
          if (event.type === 'chain-end') total.chains++;
        }
      }
      assert.equal(board.lost, false, 'Aggressive raising must remain sustainable');
    }
    totals.push(total);
  }
  assert.ok(totals[1].combos >= totals[0].combos * 1.75, JSON.stringify(totals));
  assert.ok(totals[1].chains >= totals[0].chains * 1.75, JSON.stringify(totals));
});

test('level ten boss dominates beginner and middle levels in seeded matches', () => {
  const results = [];
  for (const opponent of [1, 5]) {
    let wins = 0, losses = 0;
    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
      const match = new Match(seed, 'normal', 1, { cpu: false });
      const beginner = new ComputerPlayer(opponent), expert = new ComputerPlayer(10);
      for (let tick = 0; tick < 7200 && !match.result; tick++) {
        beginner.step(match.boards[0], match.attacks.some(attack => attack.target === 0));
        expert.step(match.boards[1], match.attacks.some(attack => attack.target === 1));
        match.step({ raise: beginner.raise }, { raise: expert.raise });
      }
      if (match.result === 'loss') wins++;
      if (match.result === 'win') losses++;
    }
    results.push({ wins, losses });
  }
  assert.ok(results[0].wins >= 6, JSON.stringify(results));
  assert.ok(results[1].wins >= 7 && results[1].losses <= 1, JSON.stringify(results));
});
