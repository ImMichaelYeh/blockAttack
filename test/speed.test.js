import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, Match, COLS, HEIGHT, SPEED_WORDS, SPEED_PANELS, STORY_SPEED_FRAMES, panel } from '../src/engine.js';

const measured = JSON.parse(readFileSync(new URL('./fixtures/snes-s10-speed-results.json', import.meta.url), 'utf8'));
function empty(options = {}) {
  const board = new Board(42, options);
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  board.makeRow = () => Array(COLS).fill(null);
  board.nextRow = board.makeRow();
  return board;
}

test('speed tables retain every verified stock value, including the initial slowdown', () => {
  assert.deepEqual(SPEED_WORDS, measured.speedWords);
  assert.deepEqual(SPEED_PANELS, measured.endlessPanels);
  assert.deepEqual(STORY_SPEED_FRAMES, measured.storyFrames);
  assert.ok(SPEED_WORDS[1] < SPEED_WORDS[0]);
});

for (const trace of measured.automatic) {
  test(`speed ${trace.level} reproduces recorded pixels and row intervals`, () => {
    const board = empty({ mode: 'endless', speedLevel: trace.level });
    board.rise = trace.initialRise / 16;
    board.riseAccumulator = trace.initialAccumulator;
    const pixels = [], rows = [];
    let previous = board.rise;
    for (let frame = 1; frame < trace.frames; frame++) {
      board.step();
      if (board.rise !== previous) pixels.push(frame);
      if (board.rise < previous) rows.push(frame);
      previous = board.rise;
    }
    assert.deepEqual(pixels, trace.pixels, 'Pixel movement ticks must match independently of row insertion representation');
    assert.deepEqual(rows, trace.rows.map(frame => frame - 1), 'Browser insertion accompanies pixel sixteen; native inserts next tick');
    assert.deepEqual(rows.slice(1).map((frame, i) => frame - rows[i]), trace.rows.slice(1).map((frame, i) => frame - trace.rows[i]));
  });
}

test('every Endless threshold advances on actual pops, carries surplus panels, and caps physical speed separately', () => {
  for (const [from, next, display, word, quota] of measured.endless) {
    const board = empty({ mode: 'endless', speedLevel: from, autoRise: false });
    board.speedPanels = 1;
    for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
    board.step();
    assert.equal(board.speedLevel, from, 'Registering a match must not consume the pop quota');
    let popped = 0;
    for (let tick = 0; tick < 100; tick++) {
      if (board.step().some(event => event.type === 'pop')) {
        popped++;
        assert.deepEqual([board.speedLevel, board.displaySpeedLevel, board.speedWord, board.speedPanels], [next, display, word, quota - popped + 1]);
      }
    }
    assert.equal(popped, 3);
  }
});

test('the saved twelve-panel example advances level one to two and leaves nine pops', () => {
  const board = empty({ mode: 'endless', autoRise: false });
  for (let y = 0; y < 2; y++) for (let x = 0; x < 6; x++) board.grid[y][x] = panel(0);
  const changes = [];
  for (let frame = 0; frame <= measured.twelve.at(-1)[0]; frame++) {
    const events = board.step();
    if (!frame || events.some(event => event.type === 'pop')) changes.push([frame, board.speedLevel, board.speedPanels]);
  }
  assert.deepEqual(changes, measured.twelve);
  assert.equal(board.speedWord, 68);
});

test('Story advances by elapsed ticks during clears/stop, using the separate verified interval stages', () => {
  const board = empty({ autoRise: false });
  board.speedProgress = 900 - measured.storyClock.quota;
  board.stop = 300;
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  for (let frame = 0; frame < measured.storyClock.transitionFrame; frame++) board.step();
  assert.equal(board.speedLevel, 13);
  board.step();
  assert.deepEqual([board.speedLevel, board.speedWord, board.speedProgress], [14, 187, measured.storyClock.nextProgress]);
  for (const [from, next, word, quota] of measured.story) {
    const fixture = empty({ speedLevel: from, autoRise: false });
    fixture.speedStage = from - 1;
    fixture.speedProgress = STORY_SPEED_FRAMES[fixture.speedStage];
    fixture.step();
    assert.deepEqual([fixture.speedLevel, fixture.speedWord, STORY_SPEED_FRAMES[fixture.speedStage]], [next, word, quota]);
  }
});

test('initialized settings cap at fifty while runtime Endless display can reach ninety-nine', () => {
  assert.deepEqual([new Board(1, { mode: 'endless', speedLevel: 99 }).speedLevel, new Board(1, { mode: 'endless', speedLevel: 99 }).displaySpeedLevel], [50, 50]);
  const board = empty({ mode: 'endless', speedLevel: 50, autoRise: false });
  board.displaySpeedLevel = 99; board.speedPanels = 1;
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  for (let tick = 0; tick < 90; tick++) board.step();
  assert.deepEqual([board.speedLevel, board.displaySpeedLevel, board.speedWord], [50, 99, 2340]);
  for (const [difficulty, speed] of [['easy', 5], ['relaxed', 5], ['normal', 13], ['hard', 21]]) {
    assert.deepEqual(new Match(42, difficulty).boards.map(board => board.speedLevel), [speed, speed]);
  }
});

test('automatic rise preserves fractional offset and freezes accumulator during stop, clears, and ceiling blockage', () => {
  const board = empty();
  board.rise = .375; board.riseAccumulator = -1;
  board.stop = 3;
  board.step(); board.step();
  assert.deepEqual([board.rise, board.riseAccumulator], [.375, -1]);
  board.step();
  assert.deepEqual([board.rise, board.riseAccumulator], [.4375, 4095]);
  for (let y = 0; y < 12; y++) board.grid[y][0] = panel(y % 2);
  board.step();
  assert.deepEqual([board.rise, board.riseAccumulator], [.4375, 4095]);
  board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
  for (let x = 0; x < 3; x++) board.grid[0][x] = panel(0);
  board.step();
  assert.deepEqual([board.rise, board.riseAccumulator], [.4375, 4095]);
});

test('manual raise finishes a full fractional row and resumes the mode-specific accumulator', () => {
  for (const mode of ['story', 'endless']) {
    const board = empty({ mode });
    board.rise = .375; board.riseAccumulator = -15;
    board.step({ raisePressed: true });
    for (let tick = 1; tick < 22; tick++) board.step();
    assert.equal(board.rise, .375);
    assert.equal(board.raiseRemaining, 0);
    assert.equal(board.riseAccumulator, mode === 'story' ? -15 : board.speedWord);
    board.step();
    assert.equal(board.rise, mode === 'story' ? .4375 : .375);
  }
});
