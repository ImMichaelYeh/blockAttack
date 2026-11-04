import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, COLS, HEIGHT, panel } from '../src/engine.js';

const measured = JSON.parse(readFileSync(new URL('./fixtures/snes-conversion-timing.json', import.meta.url), 'utf8'));
const kinds = { 1: 0, 2: 2, 3: 3, 4: 1, 5: 4 };
function setup(fixture) {
  const board = new Board(42, { autoRise: false });
  board.timing = { ...board.timing, flash: 2 * fixture.flashRegister, face: fixture.faceRegister + 3, pop: fixture.popRegister + 1 };
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  fixture.floorKinds.forEach((kind, x) => { if (kind) board.grid[0][x] = panel(kinds[kind]); });
  const add = (y, width, height = 1, metal = false) => {
    const block = { id: board.nextGarbageId++, x: 0, y, width, height, metal, phase: 'idle', timer: 0 };
    board.garbage.push(block); board.writeBlock(block);
  };
  if (fixture.name === 'combo-8') { add(1, 3); add(2, 4); }
  else {
    const width = /^combo-[4-7]$/.test(fixture.name) ? Number(fixture.name.at(-1)) - 1 : fixture.name.startsWith('chain') || fixture.name === 'metal' ? 6 : 3;
    add(1, width, fixture.name === 'chain-3' ? 2 : fixture.name === 'chain-4' ? 3 : 1, fixture.name === 'metal');
  }
  return board;
}

for (const fixture of measured.cases) {
  test(`conversion clock matches native ${fixture.name} preview/release/hover ages`, () => {
    const board = setup(fixture), members = [...board.garbage];
    const previews = [], actual = [];
    let releaseAge;
    for (let age = 0; age <= fixture.descentAge; age++) {
      for (const event of board.step()) if (event.type === 'convert') actual.push(age);
      for (const block of board.garbage) for (let y = block.y; y < block.y + block.height; y++) {
        for (let x = block.x; x < block.x + block.width; x++) assert.equal(board.grid[y][x].garbage, block.id, 'Upper layers stay solid through release and recovery');
      }
      if (age === 0) for (const block of members) previews.push({ block, y: block.y, cells: [...block.preview], colors: block.preview.map(cell => cell.kind) });
      if (age < fixture.stepAges[0]) {
        const group = board.conversions[0];
        assert.equal(group.age, age);
        assert.equal(group.stage, age < fixture.faceAge ? 'flash' : 'face');
        assert.equal(group.next, 0);
      }
      if (age < fixture.ordinaryRemovalAge) assert.equal(board.grid[0][0].phase, 'clear');
      if (age === fixture.ordinaryRemovalAge) assert.equal(board.grid[0][0], null);
      if (age < fixture.releaseAge) {
        assert.equal(board.conversions.length, 1);
        for (const { block, y, colors } of previews) {
          assert.deepEqual(block.preview.map(cell => cell.kind), colors);
          assert.equal(board.grid[y][0].garbage, block.id);
          assert.equal(board.canSwap(0, y), false);
        }
      } else if (releaseAge === undefined) releaseAge = age;
      if (age >= fixture.releaseAge && age < fixture.descentAge) {
        for (const { block, y, cells } of previews) for (let x = 0; x < block.width; x++) {
          assert.equal(board.grid[y][x], cells[x], 'All members wait together, even over existing support');
          assert.equal(cells[x].phase, 'recover');
          assert.equal(cells[x].timer, fixture.hover - (age - fixture.releaseAge));
          assert.equal(board.canSwap(Math.min(x, COLS - 2), y), false, 'Recovery remains locked through the full countdown');
        }
      }
    }
    assert.deepEqual(actual, fixture.stepAges);
    assert.equal(releaseAge, fixture.releaseAge);
    assert.equal(board.conversions.length, 0);
    assert.equal(board.grid[0][0], previews[0].cells[0]);
    assert.equal(board.grid[0][0].phase, 'fall');
  });
}

test('the observed preview setup remains playable and chains on the recorded landing step', () => {
  const board = setup(measured.cases.find(fixture => fixture.name === 'combo-4'));
  const fixture = measured.recovery, matches = [];
  let color;
  for (let age = 0; age <= fixture.matchAge; age++) {
    if (age === fixture.setupAge) {
      board.grid[0][3] = panel(color); board.grid[0][4] = panel(color); board.grid[0][5] = null;
    }
    if (age === fixture.setupAge + 2) {
      board.cursor = { x: 3, y: 0 };
      assert.equal(board.swap(), true, 'Unrelated panels stay interactive during conversion recovery');
      board.cursor = { x: 1, y: 1 };
      assert.equal(board.swap(), false, 'Released recovering panels cannot be swapped');
    }
    for (const event of board.step()) {
      if (event.type === 'convert' && event.index === 1) color = board.garbage[0].preview[2].kind;
      if (event.type === 'clear') matches.push([age, event.chain, event.count]);
    }
    if (age === fixture.descentAge) {
      assert.equal(board.grid[0][2].phase, 'fall');
      assert.equal(board.grid[0][2].chain, 1);
    }
  }
  assert.deepEqual(matches, [[0, 1, 3], [fixture.matchAge, fixture.chain, 3]]);
});
