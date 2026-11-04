import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, COLS, HEIGHT, panel } from '../src/engine.js';

const observed = JSON.parse(readFileSync(new URL('./fixtures/snes-expanded-results.json', import.meta.url), 'utf8')).garbage;
function emptyBoard() {
  const board = new Board(42, { autoRise: false });
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  return board;
}
function addBlock(board, x, y, width, height = 1, metal = false, sender = 1) {
  const block = { id: board.nextGarbageId++, x, y, width, height, metal, sender, phase: 'idle', timer: 0 };
  board.garbage.push(block); board.writeBlock(block);
  return block;
}

for (const fixture of observed) {
  test(`shared conversion traverses saved ${fixture.case} cells and distinguishes panels from retiles`, () => {
    const board = emptyBoard();
    if (fixture.case === 'combo-8') {
      addBlock(board, 0, 1, 3); addBlock(board, 0, 2, 4);
    } else {
      const width = fixture.case.startsWith('combo') ? Number(fixture.case.slice(-1)) - 1 : 6;
      const height = fixture.case === 'chain-3' ? 2 : fixture.case === 'chain-4' ? 3 : 1;
      addBlock(board, 0, 1, width, height, fixture.case === 'metal');
    }
    for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
    board.step();
    assert.equal(board.conversions.length, 1);
    const group = board.conversions[0];
    const members = [...board.garbage];
    const previews = members.map(block => ({ block, y: block.y, colors: block.preview.map(cell => cell.kind) }));
    assert.equal(group.steps.length, fixture.initialCells);
    const events = [];
    for (let tick = 0; tick < 400 && board.conversions.length; tick++) {
      events.push(...board.step().filter(event => event.type === 'convert'));
      if (board.conversions.length) {
        for (const { block, colors } of previews) {
          assert.deepEqual(block.preview.map(cell => cell.kind), colors);
          assert.equal(block.preview.length, block.width, 'Upper retiles must not allocate ordinary previews');
          assert.equal(board.grid[block.y][block.x].garbage, block.id, 'Members retain support for the whole sequence');
        }
      }
    }
    assert.equal(board.conversions.length, 0, 'Conversion must finish');
    assert.deepEqual(events.map(event => [event.x + 1, 14 - event.y, event.ordinaryPreview]),
      fixture.traversal.map(step => [step.x, step.y, step.ordinaryPreview]));
    assert.deepEqual(events.map(event => event.index), events.map((_, index) => index + 1));
    for (const { block, y, colors } of previews) {
      assert.deepEqual(board.grid[y].slice(block.x, block.x + block.width).map(cell => cell.kind), colors, 'Release preserves spatial colors');
      assert.ok(board.grid[y].slice(block.x, block.x + block.width).every(cell => cell.chain === 1));
    }
    assert.equal(board.grid.flat().filter(cell => cell?.garbage).length, fixture.remainingGarbageCells);
    for (const block of board.garbage) {
      assert.equal(block.sender, 1);
      for (let y = block.y; y < block.y + block.height; y++) for (let x = block.x; x < block.x + block.width; x++) {
        assert.equal(board.grid[y][x].garbage, block.id);
      }
    }
  });
}

test('edge-connected blocks propagate transitively; corner contacts stay separate', () => {
  const board = emptyBoard();
  const a = addBlock(board, 0, 1, 3), b = addBlock(board, 3, 1, 3), c = addBlock(board, 3, 2, 3);
  const corner = addBlock(board, 0, 3, 3);
  board.activateGarbage([{ x: 0, y: 0 }], 2, 80);
  assert.deepEqual(board.conversions[0].blocks, [a.id, b.id, c.id]);
  assert.equal(corner.phase, 'idle');
  assert.ok([a, b, c].every(block => block.preview.every(cell => cell.chain === 2)));
});

test('a connected group has one clock, ignores reactivation, and releases all members together', () => {
  const board = emptyBoard();
  const lower = addBlock(board, 0, 1, 3), upper = addBlock(board, 0, 2, 4, 1, false, 0);
  board.activateGarbage([{ x: 0, y: 0 }], 1, 80);
  const group = board.conversions[0], preview = upper.preview;
  board.step();
  assert.equal(group.timer, 103, 'Members must not each decrement the shared clock');
  board.activateGarbage([{ x: 0, y: 3 }], 4, 200);
  assert.equal(board.conversions.length, 1);
  assert.equal(upper.preview, preview);
  assert.equal(group.timer, 103);
  assert.equal(group.chain, 1);
  let finished = false;
  for (let tick = 0; tick < 300 && !finished; tick++) {
    board.step();
    assert.equal(lower.phase === 'convert', upper.phase === 'convert', 'No member releases early');
    finished = board.conversions.length === 0;
  }
  assert.ok(finished);
  assert.equal(upper.sender, 0);
});

test('ordinary conversion does not cross a metal layer, while a direct ordinary match can activate metal', () => {
  const board = emptyBoard();
  const ordinary = addBlock(board, 0, 1, 3);
  const metal = addBlock(board, 0, 2, 6, 2, true);
  const beyond = addBlock(board, 0, 4, 3);
  board.activateGarbage([{ x: 0, y: 0 }], 1, 80);
  assert.equal(ordinary.phase, 'convert');
  assert.equal(metal.phase, 'idle');
  assert.equal(beyond.phase, 'idle');
  assert.deepEqual(board.conversions[0].blocks, [ordinary.id]);
  board.activateGarbage([{ x: 5, y: 1 }], 1, 80);
  assert.deepEqual(board.conversions[1].blocks, [metal.id]);
  assert.equal(beyond.phase, 'idle');
  assert.equal(board.conversions[1].steps.filter(step => step.ordinaryPreview).length, 6);
  assert.equal(board.conversions[1].steps.length, 12);
});

test('disconnected groups remain independent and in-flight conversion state stays serializable and deterministic', () => {
  const boards = [emptyBoard(), emptyBoard()];
  for (const board of boards) {
    addBlock(board, 0, 1, 3); addBlock(board, 3, 3, 3);
    board.activateGarbage([{ x: 0, y: 0 }, { x: 3, y: 2 }], 1, 80);
    assert.equal(board.conversions.length, 2);
    assert.notEqual(board.conversions[0].id, board.conversions[1].id);
    board.conversions[1].timer += 5;
  }
  const observeAfter = boards[0].conversions[0].timer + 1;
  for (let tick = 0; tick < observeAfter; tick++) {
    boards.forEach(board => board.step());
    assert.equal(JSON.stringify(boards[0]), JSON.stringify(boards[1]));
  }
  assert.notEqual(boards[0].conversions[0].next, boards[0].conversions[1].next);
});
