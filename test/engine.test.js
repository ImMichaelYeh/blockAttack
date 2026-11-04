import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, Match, Cpu, COLS, HEIGHT, TIMING, panel, findMatches } from '../src/engine.js';

function emptyBoard(seed = 42) {
  const board = new Board(seed, { autoRise: false });
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  return board;
}

function advance(board, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...board.step());
  return events;
}

test('opening boards have no free matches and the first player swap clears stars', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const board = new Board(seed, { starter: true });
    assert.equal(findMatches(board.grid).length, 0);
    assert.equal(board.swap(), true);
    const events = advance(board, 15);
    assert.ok(events.some(event => event.type === 'clear' && event.count >= 3), `Seed ${seed}: ${JSON.stringify(events)}`);
  }
});

test('music stack height excludes airborne garbage but includes landed garbage and high panels', () => {
  const board = emptyBoard();
  board.grid[3][0] = panel(0);
  assert.equal(board.addGarbage({width:3}), true);
  const block = board.garbage[0];
  assert.equal(board.occupiedHeight(), 12, 'Physics and CPU still see incoming garbage');
  assert.equal(board.occupiedHeight(false), 4);
  block.phase = 'idle';
  assert.equal(board.occupiedHeight(false), 12, 'Landed garbage contributes to stack pressure');
  block.phase = 'fall';
  board.grid[9][5] = panel(1);
  assert.equal(board.occupiedHeight(false), 10, 'High panels still trigger danger during an attack');
});

test('matches combine intersecting runs without double counting, and include different colors', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[1][x] = panel(0);
  for (let y = 0; y < 3; y++) board.grid[y][1] = panel(0);
  for (let x = 3; x < 6; x++) board.grid[0][x] = panel(1);
  assert.equal(findMatches(board.grid).length, 8);
  board.grid[0][3].phase = 'swap';
  assert.equal(findMatches(board.grid).length, 5);
});

test('cursor clamps to bounds and locked/garbage cells cannot be swapped', () => {
  const board = emptyBoard();
  board.move(-100, 100);
  assert.deepEqual(board.cursor, { x: 0, y: 10 });
  board.grid[0][0] = panel(0, { phase: 'clear', timer: 10 });
  board.grid[0][1] = panel(1);
  assert.equal(board.canSwap(0, 0), false);
  board.grid[0][0] = { garbage: 1 };
  assert.equal(board.canSwap(0, 0), false);
  assert.equal(board.canSwap(-1, 0), false);
  assert.equal(board.canSwap(5, 0), false);
});

test('fresh swap presses reproduce native frame-2 and frame-4/5/6/7 state order', () => {
  for (const second of [4, 5, 6, 7]) {
    const board = emptyBoard();
    board.cursor = { x: 0, y: 0 };
    board.grid[0][0] = panel(0); board.grid[0][1] = panel(2);
    for (let frame = 0; frame <= second + 3; frame++) {
      if (frame === 2 || frame === second) assert.equal(board.swap(), true);
      board.step();
      assert.deepEqual(board.grid[0].slice(0, 2).map(cell => cell.kind),
        frame >= 2 && frame < second ? [2, 0] : [0, 2], `second=${second}, frame=${frame}`);
      const active = (frame >= 2 && frame < 5) || (frame >= second && frame < second + 3);
      assert.ok(board.grid[0].slice(0, 2).every(cell => cell.phase === (active ? 'swap' : 'idle')));
    }
  }
});

test('reversals preserve position, restart four ticks, and reject overlapping pairs', () => {
  for (const empty of [false, true]) {
    const board = emptyBoard();
    board.cursor = { x: 1, y: 0 };
    board.grid[0][1] = panel(0);
    if (!empty) board.grid[0][2] = panel(2);
    const positions = () => new Map(board.grid[0].flatMap((cell, x) => cell ?
      [[cell, x + (cell.phase === 'swap' ? cell.from * cell.timer / TIMING.swap : 0)]] : []));
    board.swap();
    for (let press = 0; press < 5; press++) {
      board.step();
      const before = positions();
      assert.equal(board.canSwap(0, 0), false);
      assert.equal(board.canSwap(2, 0), false);
      assert.equal(board.swap(), true);
      assert.deepEqual(positions(), before);
      assert.ok(board.grid[0].filter(Boolean).every(cell => cell.timer === 4));
    }
    advance(board, 4);
    assert.ok(board.grid[0].filter(Boolean).every(cell => cell.phase === 'idle'));
  }
});

test('hover stays swappable while clear, conversion, fall and garbage remain locked', () => {
  const board = emptyBoard();
  board.cursor = { x: 0, y: 0 };
  for (const phase of ['clear', 'convert', 'fall']) {
    board.grid[0][0] = panel(0, { phase, timer: 3 });
    assert.equal(board.swap(), false, phase);
  }
  board.grid[0][0] = { garbage: 1 };
  assert.equal(board.swap(), false);
  board.grid[0][0] = panel(0, { phase: 'hover', timer: 3 });
  assert.equal(board.swap(), true);
});

test('panels can swap into empty space and fall to the floor', () => {
  const board = emptyBoard();
  board.grid[2][0] = panel(3);
  board.cursor = { x: 0, y: 2 };
  assert.equal(board.swap(), true);
  advance(board, 60);
  assert.equal(board.grid[0][1]?.kind, 3);
  assert.equal(board.grid[0][1]?.phase, 'idle');
  assert.equal(board.grid[2][0], null);
});

test('a panel hovers once, then falls through consecutive rows without pausing again', () => {
  const board = emptyBoard();
  const falling = panel(3);
  board.grid[5][0] = falling;
  board.step();
  assert.equal(falling.phase, 'hover');
  advance(board, board.timing.hover);
  for (let y = 4; y >= 0; y--) {
    assert.equal(board.grid[y][0], falling);
    assert.equal(falling.phase, 'fall');
    board.step();
  }
  assert.equal(board.grid[0][0], falling);
  assert.equal(falling.phase, 'idle');
  assert.equal(falling.landing, TIMING.landing);
});

test('a falling column inherits one hover and keeps its panels together', () => {
  const board = emptyBoard();
  const lower = panel(2);
  const upper = panel(4);
  board.grid[5][0] = lower; board.grid[6][0] = upper;
  board.step();
  assert.equal(lower.phase, 'hover'); assert.equal(upper.phase, 'hover');
  assert.equal(lower.timer, upper.timer);
  advance(board, board.timing.hover);
  for (let y = 4; y >= 0; y--) {
    assert.equal(board.grid[y][0], lower);
    assert.equal(board.grid[y + 1][0], upper);
    board.step();
  }
});

test('two rows landing together register as one six-panel combo', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) { board.grid[5][x] = panel(0); board.grid[6][x] = panel(1); }
  const clears = advance(board, 25).filter(event => event.type === 'clear');
  assert.deepEqual(clears.map(event => event.count), [6]);
  assert.equal(clears[0].chain, 1);
});

test('separate clears on different ticks do not merge into a combo', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  const first = board.step().find(event => event.type === 'clear');
  for (let x = 3; x < 6; x++) board.grid[0][x] = panel(1);
  const second = board.step().find(event => event.type === 'clear');
  assert.equal(first.count, 3); assert.equal(second.count, 3);
  assert.equal(first.chain, 1); assert.equal(second.chain, 1);
});

test('chain eligibility survives a long fall and is tested on the landing frame', () => {
  const board = emptyBoard();
  board.grid[0][0] = panel(1); board.grid[0][1] = panel(1);
  board.grid[8][2] = panel(1, { chain: 1 });
  const clears = advance(board, 30).filter(event => event.type === 'clear');
  assert.equal(clears.length, 1);
  assert.equal(clears[0].chain, 2);
});

test('a new swap after landing does not receive an unrelated chain bonus', () => {
  const board = emptyBoard();
  board.grid[0][0] = panel(1); board.grid[0][1] = panel(1); board.grid[0][3] = panel(1);
  const falling = panel(2, { chain: 1 }); board.grid[3][2] = falling;
  advance(board, board.timing.hover + 5);
  assert.equal(falling.phase, 'idle');
  assert.equal(falling.chain, 0);
  board.cursor = { x: 2, y: 0 }; board.swap();
  const clear = advance(board, TIMING.swap).find(event => event.type === 'clear');
  assert.equal(clear.chain, 1);
});

test('matched panels pop one by one but retain support until the entire group finishes', () => {
  const board = emptyBoard();
  for (let x = 0; x < 4; x++) board.grid[0][x] = panel(0);
  const above = panel(1); board.grid[1][0] = above;
  board.step();
  const duration = board.grid[0][0].timer;
  const firstPop = board.grid[0][0].popAt;
  advance(board, firstPop - 1);
  assert.equal(board.grid[0][0].popped, false);
  const first = board.step().filter(event => event.type === 'pop');
  assert.deepEqual(first.map(event => event.index), [1]);
  assert.equal(board.grid[0][0].popped, true);
  assert.equal(board.grid[0][1].popped, false);
  assert.equal(board.grid[1][0], above);
  assert.equal(above.phase, 'idle');
  const rest = advance(board, duration - firstPop);
  assert.deepEqual(rest.filter(event => event.type === 'pop').map(event => event.index), [2, 3, 4]);
  assert.equal(board.grid[0][0], null);
  assert.equal(above.phase, 'hover');
  assert.equal(above.chain, 1);
});

test('combo stop freezes during clear cleanup but counts through falling animations', () => {
  const board = emptyBoard();
  for (let x = 0; x < 4; x++) board.grid[0][x] = panel(0);
  board.grid[1][0] = panel(1);
  board.step();
  const duration = board.grid[0][0].timer;
  board.step();
  const stop = board.stop;
  advance(board, duration - 1);
  assert.equal(board.stop, stop);
  advance(board, 2);
  assert.equal(board.stop, stop - 1);
  assert.equal(board.grid[1][0].phase, 'hover');
  advance(board, 3);
  assert.ok(board.stop < stop && board.stop > 0);
});

test('a falling clear becomes a chain and pauses stack rise', () => {
  const board = emptyBoard();
  board.grid[0][0] = panel(0); board.grid[0][1] = panel(0); board.grid[0][2] = panel(0);
  board.grid[1][0] = panel(1); board.grid[1][1] = panel(1);
  for (let y = 1; y <= 3; y++) board.grid[y][2] = panel(2);
  board.grid[4][2] = panel(1);
  const events = advance(board, 130).filter(event => event.type === 'clear');
  assert.equal(events[0].count, 6);
  assert.ok(events.some(event => event.chain === 2 && event.count === 3));
  assert.equal(board.bestChain, 2);
  assert.ok(board.stop > 0);
});

test('the player can build a skill chain while another match is clearing', () => {
  const board = emptyBoard();
  [0, 0, 0, 4].forEach((kind, x) => { board.grid[0][x] = panel(kind); });
  [1, 1, 3, 1].forEach((kind, x) => { board.grid[1][x] = panel(kind); });
  board.step();
  advance(board, board.grid[0][0].timer - TIMING.swap + 1);
  assert.equal(board.grid[0][0].phase, 'clear');
  board.cursor = { x: 2, y: 1 };
  assert.equal(board.swap(), true);
  const events = advance(board, 100);
  assert.ok(events.some(event => event.type === 'clear' && event.chain === 2));
});

test('a settled panel loses chain eligibility after its landing match check', () => {
  const board = emptyBoard();
  board.grid[0][0] = panel(1, { chain: 1 });
  advance(board, 1);
  assert.equal(board.grid[0][0].chain, 0);
  board.grid[0][1] = panel(1); board.grid[0][2] = panel(1);
  const events = board.step();
  assert.equal(events.find(event => event.type === 'clear').chain, 1);
});

function block(board, { id, x, y, width = 3, height = 1, metal = false }) {
  const item = { id, x, y, width, height, metal, phase: 'idle', timer: 0 };
  board.garbage.push(item);
  board.writeBlock(item);
  return item;
}

test('garbage converts one bottom layer and yields chain-eligible panels', () => {
  const board = emptyBoard();
  [0, 0, 0].forEach((kind, x) => { board.grid[0][x] = panel(kind); });
  const garbage = block(board, { id: 1, x: 0, y: 1, height: 2 });
  board.step();
  assert.equal(garbage.phase, 'convert');
  const group = board.conversions[0];
  advance(board, group.timer);
  advance(board, (group.steps.length - 1) * board.timing.pop + TIMING.garbageHold);
  assert.equal(garbage.height, 1);
  assert.equal(garbage.y, 2);
  assert.equal(board.grid[1][0].phase, 'recover');
  assert.equal(board.grid[1][0].chain, 1);
  assert.equal(board.grid[2][0].garbage, 1);
});

test('garbage reveals one fixed-color panel at a time, holds, then releases the row together', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  const garbage = block(board, { id: 1, x: 0, y: 1, width: 6 });
  board.step();
  const colors = garbage.preview.map(cell => cell.kind);
  const group = board.conversions[0];
  advance(board, group.timer - 1);
  assert.equal(group.stage, 'face');
  assert.equal(garbage.revealed, 0);
  const reveals = board.step().filter(event => event.type === 'convert');
  assert.equal(garbage.revealed, 1);
  assert.deepEqual(reveals.map(event => event.index), [1]);
  for (let revealed = 1; revealed < 6; revealed++) {
    advance(board, board.timing.pop - 1);
    assert.equal(garbage.revealed, revealed);
    const next = board.step().find(event => event.type === 'convert');
    assert.equal(next.index, revealed + 1);
    assert.deepEqual(garbage.preview.map(cell => cell.kind), colors);
  }
  assert.equal(group.stage, 'hold');
  advance(board, TIMING.garbageHold - 1);
  for (let x = 0; x < 6; x++) assert.equal(board.grid[1][x].garbage, 1, 'Preview cells must retain garbage support until release');
  board.step();
  assert.equal(board.garbage.length, 0);
  assert.deepEqual(board.grid[1].map(cell => cell.kind), colors);
  assert.ok(board.grid[1].every(cell => cell.phase === 'recover' && cell.chain === 1));
  advance(board, TIMING.garbageHover - 1);
  assert.deepEqual(board.grid[1].map(cell => cell.kind), colors);
  board.step();
  assert.deepEqual(board.grid[0].map(cell => cell.kind), colors);
});

test('other panels remain swappable during the garbage reveal, but preview panels stay locked', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  board.grid[0][4] = panel(2); board.grid[0][5] = panel(3);
  const garbage = block(board, { id: 1, x: 0, y: 1 });
  board.step(); advance(board, board.conversions[0].timer);
  assert.equal(board.conversions[0].stage, 'reveal');
  board.cursor = { x: 4, y: 0 };
  assert.equal(board.swap(), true);
  assert.equal(board.canSwap(0, 1), false);
  assert.equal(board.grid[0][4].kind, 3);
});

test('a combo set up using revealed garbage colors can chain when those panels land', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  const garbage = block(board, { id: 1, x: 0, y: 1 });
  board.step(); advance(board, board.conversions[0].timer);
  const revealedColor = garbage.preview.at(-1).kind;
  board.grid[0][0] = panel(revealedColor); board.grid[0][1] = panel(revealedColor);
  const events = advance(board, (garbage.width - 1) * board.timing.pop + TIMING.garbageHold + TIMING.garbageHover + 5);
  assert.ok(events.some(event => event.type === 'clear' && event.chain === 2));
});

test('touching an already-converting block does not restart or reroll its preview', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  const garbage = block(board, { id: 1, x: 0, y: 1 });
  board.step(); advance(board, board.conversions[0].timer);
  const preview = garbage.preview;
  const group = board.conversions[0];
  const timer = group.timer;
  board.activateGarbage([{ x: 0, y: 0 }], 3, 200);
  assert.equal(garbage.preview, preview);
  assert.equal(garbage.revealed, 1);
  assert.equal(group.timer, timer);
  assert.equal(board.conversions.length, 1);
});

test('touching ordinary garbage converts together; metal remains separate', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  const first = block(board, { id: 1, x: 0, y: 1 });
  const second = block(board, { id: 2, x: 3, y: 1 });
  const metal = block(board, { id: 3, x: 0, y: 2, metal: true });
  board.step();
  assert.equal(first.phase, 'convert');
  assert.equal(second.phase, 'convert');
  assert.equal(metal.phase, 'idle');
});

test('garbage lands as a rectangle and never overlaps panels', () => {
  const board = emptyBoard();
  board.grid[0][1] = panel(2);
  board.addGarbage({ width: 6, height: 2 });
  advance(board, 65);
  assert.equal(board.garbage[0].y, 1);
  assert.equal(board.garbage[0].phase, 'idle');
  assert.equal(board.grid[0][1].kind, 2);
  for (let y = 1; y <= 2; y++) for (let x = 0; x < 6; x++) assert.ok(board.grid[y][x].garbage);
});

test('garbage is incoming only on first landing, including after conversion and subsequent falls', () => {
  for (const height of [1, 2]) {
    const board = emptyBoard();
    board.grid[0][1] = panel(2);
    assert.equal(board.addGarbage({ width: 6, height }), true);
    assert.deepEqual(advance(board, 30).filter(event => event.type === 'land').map(event => event.incoming), [true]);
    const block = board.garbage[0];
    if (height === 2) {
      board.activateGarbage([{ x: 1, y: 0 }], 1, 0);
      advance(board, 200);
      assert.equal(block.height, 1);
    }
    for (let y = 0; y < block.y; y++) for (let x = 0; x < COLS; x++) board.grid[y][x] = null;
    assert.deepEqual(advance(board, 40).filter(event => event.type === 'land').map(event => event.incoming), [false]);
    assert.equal(board.addGarbage({ width: 3 }), true);
    assert.deepEqual(advance(board, 30).filter(event => event.type === 'land').map(event => event.incoming), [true]);
  }
  const board = emptyBoard(); board.grid[2][1] = panel(0);
  assert.equal(advance(board, 40).some(event => event.type === 'land'), false, 'Regular panel drops are not incoming garbage');
});

test('manual raise cancels stop and inserts a fresh row without losing cursor position', () => {
  const board = emptyBoard();
  board.stop = 100;
  const oldNext = board.nextRow;
  board.rise = .999;
  board.step({ raise: true });
  assert.equal(board.stop, 0);
  advance(board, 2);
  assert.equal(board.grid[0], oldNext);
  assert.equal(board.cursor.y, 1);
  assert.ok(board.rise < 1);
});

test('one raise press smoothly completes a full row after release and preserves fractional rise', () => {
  const board = emptyBoard();
  const next = board.nextRow;
  board.rise = .375;
  board.step({ raise: true });
  assert.equal(board.rise, .375, 'The native startup precedes pixel movement');
  advance(board, 2);
  assert.equal(board.rise, .375 + 1 / TIMING.raiseRepeat);
  assert.equal(board.cursor.y, 0, 'A raise must not jump a whole row on its first tick');
  advance(board, TIMING.raiseRepeat + TIMING.raisePause - 1);
  assert.equal(board.grid[0], next);
  assert.equal(board.cursor.y, 1);
  assert.equal(board.rise, .375);
  advance(board, 60);
  assert.equal(board.grid[0], next, 'Releasing the key must stop manual raising');
  assert.equal(board.cursor.y, 1);
});

test('holding raise repeats rows at the simulation rate, not the keyboard repeat rate', () => {
  const board = emptyBoard();
  const first = board.nextRow;
  board.step({ raise: true });
  board.step({ raise: true }); board.step({ raise: true });
  for (let tick = 1; tick < TIMING.raiseRepeat - 1; tick++) board.step({ raise: true });
  assert.equal(board.cursor.y, 0);
  assert.ok(board.rise > 0 && board.rise < 1);
  board.step({ raise: true });
  assert.equal(board.grid[0], first);
  for (let tick = 0; tick < TIMING.raisePause; tick++) {
    board.step({ raise: true });
    assert.equal(board.rise, 0, 'Row transitions pause without moving pixels');
  }
  for (let tick = 0; tick < TIMING.raiseRepeat; tick++) board.step({ raise: true });
  assert.equal(board.grid[1], first);
  assert.equal(board.cursor.y, 2);
});

test('a second distinct tap queues another smooth row while the first is moving', () => {
  const board = emptyBoard();
  board.step({ raise: true });
  board.step();
  board.step({ raise: true });
  assert.equal(board.cursor.y, 0);
  advance(board, TIMING.raiseRepeat * 2 + TIMING.raisePause - 1);
  assert.equal(board.cursor.y, 2);
});

test('a tap released before a simulation tick still requests exactly one row', () => {
  const board = emptyBoard();
  board.step({ raisePressed: true });
  assert.equal(board.cursor.y, 0);
  assert.equal(board.rise, 0);
  advance(board, 2);
  assert.ok(board.rise > 0 && board.rise < 1);
  advance(board, TIMING.raiseRepeat - 1);
  assert.equal(board.cursor.y, 1);
  advance(board, TIMING.raiseRepeat * 2);
  assert.equal(board.cursor.y, 1);
});

test('a raise tap waits for an active clear instead of shifting locked panels', () => {
  const board = emptyBoard();
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  const next = board.nextRow;
  board.step({ raisePressed: true });
  assert.equal(board.cursor.y, 0);
  const duration = board.grid[0][0].timer;
  advance(board, duration);
  assert.equal(board.cursor.y, 0);
  assert.equal(board.rise, 0);
  advance(board, 4);
  assert.ok(board.rise > 0 && board.rise < 1);
  advance(board, TIMING.raiseRepeat - 1);
  assert.equal(board.grid[0], next);
  assert.equal(board.cursor.y, 1);
  advance(board, 30);
  assert.equal(board.cursor.y, 1);
});

test('a clear pauses an in-progress raise and it resumes smoothly afterward', () => {
  const board = emptyBoard();
  board.step({ raisePressed: true });
  advance(board, TIMING.raiseRepeat / 2 + 1);
  assert.equal(board.rise, .5);
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  board.step(); advance(board, 10);
  assert.equal(board.rise, .5);
  assert.equal(board.raiseRemaining, .5);
  advance(board, 120);
  assert.equal(board.raiseRemaining, 0);
  assert.equal(board.cursor.y, 1);
});

test('manual raising cannot push through a blocked ceiling', () => {
  const board = emptyBoard();
  for (let y = 0; y < 12; y++) board.grid[y][0] = panel(y % 2);
  const bottom = board.grid[0];
  board.step({ raise: true });
  assert.equal(board.grid[0], bottom);
  assert.equal(board.cursor.y, 0);
  assert.equal(board.danger, 1);
});

test('cursor upper bound is row ten at every measured rise offset and after insertion', () => {
  for (const pixels of [0, 1, 7, 15]) {
    const board = emptyBoard();
    board.rise = pixels / 16;
    board.move(100, 100);
    assert.deepEqual(board.cursor, { x: 4, y: 10 });
    advance(board, 20);
    board.step({ raisePressed: true });
    advance(board, 20);
    assert.equal(board.cursor.y, 10);
    board.move(-100, -100);
    assert.deepEqual(board.cursor, { x: 0, y: 0 });
  }
});

test('row-transition pause preserves queued taps and freezes during clears', () => {
  const board = emptyBoard();
  board.step({ raisePressed: true });
  advance(board, 17);
  assert.equal(board.raisePause, 4);
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  board.step({ raisePressed: true });
  advance(board, 10);
  assert.equal(board.raisePause, 4);
  assert.equal(board.rise, 0);
  assert.equal(board.raiseRemaining, 1);
  advance(board, 130);
  assert.equal(board.cursor.y, 2);
  assert.equal(board.raiseRemaining, 0);
  advance(board, 40);
  assert.equal(board.cursor.y, 2, 'A queued tap does not turn into a held raise');
});

test('danger grants a recovery interval, then defeats a blocked board', () => {
  const board = emptyBoard();
  for (let y = 0; y < 12; y++) board.grid[y][0] = panel(y % 2);
  advance(board, board.graceTicks);
  assert.equal(board.lost, false);
  board.step();
  assert.equal(board.lost, true);
});

test('a simultaneous defeat resolves as a draw', () => {
  const match = new Match(3);
  match.boards.forEach(board => { board.lost = true; });
  match.step();
  assert.equal(match.result, 'draw');
  const tick = match.tick;
  match.step();
  assert.equal(match.tick, tick);
});

test('a combo queues garbage, which arrives on the opponent after the travel delay', () => {
  const match = new Match(9);
  match.boards = [emptyBoard(), emptyBoard()];
  match.cpu.step = () => {};
  for (let x = 0; x < 4; x++) match.boards[0].grid[0][x] = panel(0);
  match.step();
  assert.equal(match.attacks[0].width, 3);
  assert.equal(match.attacks[0].sender, 0);
  assert.equal(match.boards[1].garbage.length, 0);
  for (let i = 0; i < 161; i++) match.step();
  assert.equal(match.boards[1].garbage.length, 1);
  assert.equal(match.boards[1].garbage[0].sender, 0);
});

test('opponent garbage retains its sender through arrival and conversion', () => {
  const match = new Match(9);
  match.boards = [emptyBoard(), emptyBoard()];
  match.cpu.step = () => {};
  for (let x = 0; x < 4; x++) match.boards[1].grid[0][x] = panel(0);
  match.step();
  assert.equal(match.attacks[0].sender, 1);
  for (let i = 0; i < 161; i++) match.step();
  const block = match.boards[0].garbage[0];
  assert.equal(block.sender, 1);
  match.boards[0].activateGarbage([{ x: block.x, y: block.y - 1 }], 1, 50);
  assert.equal(block.phase, 'convert');
  assert.equal(block.sender, 1);
});

test('shock panels queue metal garbage even for a three-panel clear', () => {
  const match = new Match(9);
  match.boards[0] = emptyBoard();
  for (let x = 0; x < 3; x++) match.boards[0].grid[0][x] = panel(5);
  match.step();
  assert.equal(match.attacks.length, 1);
  assert.equal(match.attacks[0].metal, true);
  assert.equal(match.attacks[0].width, 6);
});

test('an opponent defeat produces a victory and stops the match', () => {
  const match = new Match(11);
  match.boards[1].lost = true;
  match.step();
  assert.equal(match.result, 'win');
  const tick = match.tick;
  match.step({ swap: true, raise: true });
  assert.equal(match.tick, tick);
});

test('move and swap feedback events only describe accepted player actions', () => {
  const match = new Match(11);
  const board = emptyBoard(); match.boards[0] = board;
  board.cursor = { x: 0, y: 0 };
  assert.equal(match.step({ move: [-1, 0], swap: true }).some(event => event.player === 0 && ['move', 'swap'].includes(event.type)), false);
  board.grid[0][0] = panel(0); board.grid[0][1] = panel(1);
  assert.equal(match.step({ swap: true }).filter(event => event.player === 0 && event.type === 'swap').length, 1);
  assert.equal(match.step({ swap: true }).filter(event => event.player === 0 && event.type === 'swap').length, 1, 'An accepted reversal has its own cue');
  board.grid[0][0].phase = 'clear';
  assert.equal(match.step({ swap: true }).some(event => event.player === 0 && event.type === 'swap'), false, 'Locked panels cannot generate another swap cue');
  assert.ok(match.step({ move: [1, 0] }).some(event => event.player === 0 && event.type === 'move'));
});

test('legal automated play can win a full match without corrupting garbage rectangles', () => {
  let wins = 0;
  const outcomes = [];
  for (const seed of [71, 112, 333]) {
    const match = new Match(seed);
    const player = new Cpu(3);
    for (let tick = 0; tick < 18000 && !match.result; tick++) {
      player.step(match.boards[0]);
      match.step({ raise: match.boards[0].occupiedHeight() < 8 });
      if (tick % 60 !== 0) continue;
      for (const board of match.boards) for (const garbage of board.garbage) {
        let cells = 0;
        for (const row of board.grid) for (const cell of row) if (cell?.garbage === garbage.id) cells++;
        assert.equal(cells, garbage.width * garbage.height);
        for (let y = garbage.y; y < garbage.y + garbage.height; y++) {
          for (let x = garbage.x; x < garbage.x + garbage.width; x++) assert.equal(board.grid[y][x]?.garbage, garbage.id);
        }
      }
    }
    if (match.result === 'win') wins++;
    outcomes.push({ seed, result: match.result, ticks: match.tick, scores: match.boards.map(board => board.score), heights: match.boards.map(board => board.occupiedHeight()) });
  }
  assert.ok(wins > 0, `The player must be able to win by making legal swaps: ${JSON.stringify(outcomes)}`);
});

test('seeded matches and the same inputs produce identical simulation state', () => {
  const first = new Match(12345);
  const second = new Match(12345);
  for (let i = 0; i < 1200; i++) {
    const input = { swap: i % 23 === 0, raise: i % 100 > 92, move: i % 17 === 0 ? [i % 2 ? 1 : -1, 0] : undefined };
    first.step(input); second.step(input);
  }
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('the CPU makes legal moves and clears panels over an extended simulation', () => {
  const board = new Board(91);
  const cpu = new Cpu(9);
  for (let i = 0; i < 3600 && !board.lost; i++) { cpu.step(board); board.step({ raise: cpu.raise }); }
  assert.ok(board.cleared >= 12, `CPU only cleared ${board.cleared} panels`);
  assert.ok(board.score > 0);
  assert.ok(board.cursor.x >= 0 && board.cursor.x <= 4);
  assert.ok(board.cursor.y >= 0 && board.cursor.y < 12);
});
