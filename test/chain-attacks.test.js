import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Match, COLS, HEIGHT, TIMING_PROFILES, panel } from '../src/engine.js';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const natural = read('snes-landing-results.json').cascades;
const measured = read('snes-chain-lifecycle-results.json');
const jobs = [...read('snes-chain-plan.json').jobs, ...read('snes-chain-lifecycle-plan.json').jobs];
const kinds = { 1: 0, 2: 2, 3: 3, 4: 1, 5: 4, 7: 5 };
const shape = attacks => attacks.map(({ width, height, metal, sender, target }) => [width, height, metal, sender, target]);
function emptyMatch(mode = 'story') {
  const match = new Match(42);
  for (const board of match.boards) {
    board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
    board.autoRise = false; board.timing = TIMING_PROFILES[mode].normal;
  }
  match.cpu.step = () => {};
  return match;
}
function place(board, cells) {
  for (const [x, y, kind] of cells) board.grid[14 - y][x - 1] = panel(kinds[kind]);
}

for (const fixture of [...natural, { ...measured.chain5, counts: Array(5).fill(3) }]) {
  test(`${fixture.name} sends one final chain block for either player with no per-link attack`, () => {
    for (const sender of [0, 1]) {
      const match = emptyMatch(fixture.name.startsWith('endless') ? 'endless' : 'story');
      place(match.boards[sender], jobs.find(job => job.name === fixture.name).fixture.cells);
      const ends = [], links = [], finish = fixture.removalFrames.at(-1);
      for (let frame = 0; frame <= finish; frame++) {
        for (const event of match.step()) {
          if (event.type === 'chain-end') ends.push([frame, event.chain, event.player]);
          if (event.type === 'clear') links.push([frame, event.chain, event.count]);
        }
        if (frame < finish) {
          assert.equal(match.attacks.length, 0, 'No link may send its own chain block');
          assert.equal(match.boards[1 - sender].garbage.length, 0);
        }
      }
      const depth = fixture.matchFrames.length;
      assert.deepEqual(links, fixture.matchFrames.map((frame, i) => [frame, i + 1, fixture.counts[i]]));
      assert.deepEqual(ends, [[finish, depth, sender]]);
      assert.equal(match.boards[sender].chainDepth, 0);
      assert.deepEqual(shape(match.attacks), [[6, depth - 1, false, sender, 1 - sender]]);
      for (let tick = 0; tick < 74; tick++) match.step();
      assert.equal(match.boards[1 - sender].garbage.length, 0);
      match.step();
      const blocks = match.boards[1 - sender].garbage;
      assert.equal(blocks.length, 1);
      assert.deepEqual([blocks[0].width, blocks[0].height, blocks[0].metal, blocks[0].sender], [6, depth - 1, false, sender]);
      assert.equal(match.attacks.length, 0);
    }
  });
}

for (const fixture of measured.overlaps) {
  test(`${fixture.name} matches the native board-chain outcome without duplicate branch attacks`, () => {
    const match = emptyMatch(), job = jobs.find(job => job.name === fixture.name);
    place(match.boards[0], job.fixture.cells);
    const ends = [], links = [];
    for (let frame = 0; frame < 400; frame++) {
      for (const [at, address, value] of job.fixture.actions || []) if (at === frame && address !== 1024) {
        const offset = address - 0xF7C, y = Math.floor(offset / 16), x = (offset % 16) / 2;
        match.boards[0].grid[14 - y][x - 1] = panel(kinds[value]);
      }
      for (const event of match.step()) {
        if (event.type === 'chain-end') ends.push(event.chain);
        if (event.type === 'clear' && event.chain > 1) links.push(event.chain);
      }
    }
    assert.deepEqual(ends, [fixture.depth]);
    assert.deepEqual(links, fixture.depth === 2 ? [2] : [2, 3]);
    const chainBlocks = match.boards[1].garbage.filter(block => block.width === 6);
    assert.equal(chainBlocks.length, 1);
    assert.equal(chainBlocks[0].height, fixture.height);
    assert.equal(match.attacks.length, 0);
  });
}

test('a later independent chain starts at ×2 rather than inheriting the previous chain depth', () => {
  const match = emptyMatch(), cells = jobs.find(job => job.name === 'story-normal-chain-2').fixture.cells;
  place(match.boards[0], cells);
  const ends = [];
  for (let frame = 0; frame < 360; frame++) {
    if (frame === 180) {
      assert.equal(match.boards[0].chainDepth, 0);
      place(match.boards[0], cells);
    }
    for (const event of match.step()) if (event.type === 'chain-end') ends.push([frame, event.chain]);
  }
  assert.deepEqual(ends, [[173, 2], [353, 2]]);
  assert.equal(match.boards[1].garbage.length, 1);
  assert.deepEqual(shape(match.attacks), [[6, 1, false, 0, 1]]);
});

test('simultaneous opposing chains keep separate lifetimes and sender metadata', () => {
  const match = emptyMatch(), cells = jobs.find(job => job.name === 'story-normal-chain-2').fixture.cells;
  match.boards.forEach(board => place(board, cells));
  const ends = [];
  for (let frame = 0; frame <= 173; frame++) for (const event of match.step()) if (event.type === 'chain-end') ends.push([event.player, event.chain]);
  assert.deepEqual(ends, [[0, 2], [1, 2]]);
  assert.deepEqual(shape(match.attacks), [[6, 1, false, 0, 1], [6, 1, false, 1, 0]]);
});

test('nonmatching eligibility expiry ends the chain without waiting for an unrelated fall', () => {
  const match = emptyMatch(), board = match.boards[0];
  board.chainDepth = 3;
  board.grid[0][0] = panel(2, { chain: 2, phase: 'fall', timer: 1 });
  board.grid[8][5] = panel(4);
  const ends = match.step().filter(event => event.type === 'chain-end');
  assert.deepEqual(ends.map(event => event.chain), [3]);
  assert.equal(board.grid[8][5].phase, 'hover');
  assert.deepEqual(shape(match.attacks), [[6, 2, false, 0, 1]]);
  for (let tick = 0; tick < 20; tick++) assert.equal(match.step().filter(event => event.type === 'chain-end').length, 0);
});

test('conversion previews and recovery keep an existing chain open until eligibility resolves', () => {
  const match = emptyMatch(), board = match.boards[0];
  board.chainDepth = 2;
  const block = { id: board.nextGarbageId++, x: 0, y: 1, width: 3, height: 1, metal: false, phase: 'idle', timer: 0 };
  board.garbage.push(block); board.writeBlock(block);
  board.activateGarbage([{ x: 0, y: 0 }], 2, 80);
  for (let tick = 1; tick < 147; tick++) {
    assert.equal(match.step().some(event => event.type === 'chain-end'), false);
    assert.equal(match.attacks.length, 0);
  }
  assert.deepEqual(match.step().filter(event => event.type === 'chain-end').map(event => event.chain), [2]);
  assert.deepEqual(shape(match.attacks), [[6, 1, false, 0, 1]]);
});

test('shock and combo packets stay distinct from the consolidated chain packet', () => {
  const match = emptyMatch(), board = match.boards[0], received = [];
  for (const x of [0, 1, 3]) board.grid[0][x] = panel(2);
  for (let y = 0; y < 3; y++) board.grid[y][2] = panel(5);
  board.grid[3][2] = panel(2);
  const receive = match.boards[1].addGarbage.bind(match.boards[1]);
  match.boards[1].addGarbage = attack => {
    const accepted = receive(attack);
    if (accepted) received.push([attack.width, attack.height, attack.metal]);
    return accepted;
  };
  const ends = [];
  for (let frame = 0; frame < 400; frame++) for (const event of match.step()) if (event.type === 'chain-end') ends.push(event.chain);
  assert.deepEqual(ends, [2]);
  assert.deepEqual(received, [[6, 1, true], [3, 1, false], [6, 1, false]]);
});

for (const result of ['win', 'loss', 'draw']) {
  test(`${result} clears unfinished chain state and queued attacks; a new match starts clean`, () => {
    const match = emptyMatch();
    place(match.boards[0], jobs.find(job => job.name === 'story-normal-chain-3').fixture.cells);
    for (let frame = 0; frame <= 93; frame++) match.step();
    assert.equal(match.boards[0].chainDepth, 2);
    match.attacks.push({ due: 999, target: 1, sender: 0, width: 6, height: 1, metal: false });
    match.boards[0].lost = result !== 'win'; match.boards[1].lost = result !== 'loss';
    match.step();
    assert.equal(match.result, result);
    assert.equal(match.attacks.length, 0);
    assert.ok(match.boards.every(board => board.chainDepth === 0));
    const tick = match.tick;
    assert.deepEqual(match.step(), []); assert.equal(match.tick, tick);
    const retry = emptyMatch();
    assert.equal(retry.attacks.length, 0);
    assert.ok(retry.boards.every(board => board.chainDepth === 0));
  });
}
