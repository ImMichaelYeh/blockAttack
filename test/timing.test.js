import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, Match, COLS, HEIGHT, TIMING_PROFILES, panel } from '../src/engine.js';

// Recorded native processing-call counts; tests need neither the ROM nor the local emulator.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/snes-difficulty-results.json', import.meta.url), 'utf8'));
function emptyBoard(mode, difficulty) {
  const board = new Board(42, { autoRise: false, mode, difficulty });
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  return board;
}

for (const fixture of fixtures) {
  const [mode, difficulty] = fixture.mode.split('-');
  test(`${fixture.mode} matches saved hover, flash, face, pop and removal transitions`, () => {
    const board = emptyBoard(mode, difficulty);
    const cells = [panel(0), panel(0), panel(0)];
    board.grid[0].splice(0, 3, ...cells);
    const above = panel(2); board.grid[1][0] = above;
    assert.equal(board.step().find(event => event.type === 'clear').count, 3);
    const registration = fixture.stages[0][1];
    const faceStart = fixture.faceAfterMatchCalls;
    assert.equal(fixture.flashAfterMatchCalls, 1);
    assert.equal(faceStart, fixture.stages[2][1] - registration - 1, 'Panel art changes before the controller stage');
    const expectedPops = fixture.pops.map(([, calls]) => calls - registration);
    const removal = expectedPops.at(-1);
    const pops = [];
    for (let age = 0; age <= removal; age++) {
      if (age) for (const event of board.step()) if (event.type === 'pop') pops.push([age, event.index, event.x]);
      if (age < removal) {
        assert.deepEqual(board.grid[0].slice(0, 3), cells, `Support retained at age ${age}`);
        assert.equal(above.phase, 'idle');
        for (const [index, cell] of cells.entries()) {
          assert.equal(cell.timer, removal - age);
          assert.equal(cell.popped, age >= expectedPops[index]);
        }
      }
    }
    assert.deepEqual(pops, expectedPops.map((age, index) => [age, index + 1, index]));
    assert.ok(board.grid[0].slice(0, 3).every(cell => cell === null));
    assert.equal(above.phase, 'hover', 'Support releases on the last pop');

    const falling = emptyBoard(mode, difficulty);
    for (let y = 0; y <= 6; y++) falling.grid[y][0] = panel(y % 2);
    falling.cursor = { x: 0, y: 6 };
    const moving = falling.grid[6][0];
    let firstFall;
    for (let frame = 0; frame <= fixture.firstFall; frame++) {
      if (frame === 2) assert.equal(falling.swap(), true);
      falling.step();
      if (frame === 5) assert.equal(moving.timer, fixture.hover);
      if (falling.grid[5][1] === moving) { firstFall = frame; break; }
    }
    assert.equal(firstFall, fixture.firstFall);
    for (let y = 4; y >= 0; y--) {
      falling.step();
      assert.equal(falling.grid[y][1], moving, 'Continuous fall must not add another hover');
    }
  });
}

test('ordinary pops traverse top to bottom, then left to right, including intersecting runs', () => {
  const board = emptyBoard('story', 'normal');
  for (let x = 0; x < COLS; x++) board.grid[0][x] = panel(0);
  board.grid[1][2] = panel(0); board.grid[2][2] = panel(0);
  const support = panel(2); board.grid[3][2] = support;
  assert.equal(board.step().find(event => event.type === 'clear').count, 8);
  const duration = board.grid[0][0].timer;
  const pops = [];
  for (let age = 1; age <= duration; age++) {
    for (const event of board.step()) if (event.type === 'pop') pops.push([event.x, event.y, event.index, age]);
    if (age < duration) assert.equal(support.phase, 'idle');
  }
  assert.deepEqual(pops, [[2, 2], [2, 1], ...Array.from({ length: COLS }, (_, x) => [x, 0])]
    .map(([x, y], index) => [x, y, index + 1, 64 + index * 8]));
  assert.equal(support.phase, 'hover');
});

test('both Story boards use the selected timing profile and legacy Relaxed selects Easy', () => {
  for (const [setting, profile] of [['easy', 'easy'], ['relaxed', 'easy'], ['normal', 'normal'], ['hard', 'hard']]) {
    const match = new Match(7, setting);
    assert.ok(match.boards.every(board => board.timing === TIMING_PROFILES.story[profile]));
  }
  assert.equal(new Board().timing, TIMING_PROFILES.story.normal);
  assert.equal(emptyBoard('unknown', 'unknown').timing, TIMING_PROFILES.story.normal);
  assert.ok(Object.values(TIMING_PROFILES).every(mode => Object.values(mode).every(Object.isFrozen)));
});
