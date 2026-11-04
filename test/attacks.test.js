import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, Match, COLS, HEIGHT, panel } from '../src/engine.js';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const observed = read('snes-expanded-results.json');
const jobs = [...read('snes-attack-plan.json').jobs, ...read('snes-danger-plan.json').jobs];
function emptyMatch() {
  const match = new Match(42);
  for (const board of match.boards) {
    board.grid = Array.from({ length: HEIGHT }, () => Array(COLS).fill(null));
    board.autoRise = false;
  }
  match.cpu.step = () => {};
  return match;
}
const dimensions = attacks => attacks.map(({ width, height, metal, sender }) => [width, height, metal, sender]);
function intact(board) {
  const occupied = new Set();
  for (const block of board.garbage) {
    assert.ok(block.x >= 0 && block.x + block.width <= COLS && block.y >= 0 && block.y + block.height <= HEIGHT);
    let cells = 0;
    for (const row of board.grid) for (const cell of row) if (cell?.garbage === block.id) cells++;
    assert.equal(cells, block.width * block.height);
    for (let y = block.y; y < block.y + block.height; y++) for (let x = block.x; x < block.x + block.width; x++) {
      assert.equal(board.grid[y][x].garbage, block.id);
      assert.ok(!occupied.has(y * COLS + x)); occupied.add(y * COLS + x);
    }
  }
}

const cases = [
  ...observed.combos.map(fixture => ({ name: `combo ${fixture.count}`, count: fixture.count,
    job: `story-normal-combo-${fixture.count}`, attacks: fixture.widths.map(width => ({ width, metal: false })) })),
  ...observed.shockAttacks.map(fixture => ({ name: `shock ${fixture.count}`, count: fixture.count,
    job: fixture.count <= 4 ? `story-shock-${fixture.count}` : `shock-${fixture.count}`, attacks: fixture.attacks })),
];
for (const fixture of cases) {
  test(`${fixture.name} queues and delivers the complete recorded attack sequence for either player`, () => {
    const job = jobs.find(job => job.name === fixture.job);
    assert.ok(job);
    for (const sender of [0, 1]) {
      const match = emptyMatch(), target = 1 - sender, receiver = match.boards[target];
      const sentinel = panel(4); receiver.grid[0][5] = sentinel;
      for (const [x, y, kind] of job.fixture.cells) {
        assert.ok(kind === 1 || kind === 7);
        match.boards[sender].grid[14 - y][x - 1] = panel(kind === 7 ? 5 : 0);
      }
      const clear = match.step().find(event => event.type === 'clear' && event.player === sender);
      assert.equal(clear.count, fixture.count);
      const expected = fixture.attacks.map(({ width, metal }) => [width, 1, metal, sender]);
      assert.deepEqual(dimensions(match.attacks), expected, 'Queue preserves native block order and material');
      assert.ok(match.attacks.every(attack => attack.target === target && attack.due > match.tick));
      for (let tick = 0; tick < 250; tick++) {
        match.step(); intact(receiver);
        assert.equal(receiver.lost, false, 'A queued burst must not overflow the internal spawn buffer');
        assert.equal(receiver.grid[0][5], sentinel, 'Delivery must preserve existing panels');
      }
      assert.equal(match.attacks.length, 0);
      assert.deepEqual(dimensions(receiver.garbage), expected, 'Separate metal rows must not become one tall rectangle');
    }
  });
}

test('blocked deliveries retain width priority while the opposite target can receive', () => {
  const match = emptyMatch(), receiver = match.boards[1];
  for (let y = 0; y < 12; y++) receiver.grid[y][5] = panel(y % 2);
  const first = { due: 1, target: 1, sender: 0, width: 6, height: 1, metal: false };
  const second = { ...first, width: 3 };
  const opposite = { ...first, target: 0, sender: 1, metal: true };
  match.attacks = [first, second, opposite];
  const attempted = [], add = receiver.addGarbage.bind(receiver);
  receiver.addGarbage = attack => { attempted.push(attack); return add(attack); };
  match.step();
  assert.deepEqual(attempted, [second], 'Ordinary width priority selects the narrower packet even when blocked');
  assert.deepEqual(match.attacks, [first, second]);
  assert.equal(receiver.garbage.length, 0);
  assert.equal(receiver.lost, false);
  assert.deepEqual(dimensions(match.boards[0].garbage), [[6, 1, true, 1]]);
  receiver.grid[11][5] = null;
  match.step();
  for (let i = 0; i < 20; i++) match.step();
  assert.equal(match.attacks.length, 0);
  assert.deepEqual(dimensions(receiver.garbage), [[3, 1, false, 0], [6, 1, false, 0]]);
  intact(receiver); intact(match.boards[0]);
});

test('a rejected garbage insertion preserves cells, ID counter and loss state', () => {
  const board = new Board(7);
  board.grid[HEIGHT - 1] = Array.from({ length: COLS }, (_, x) => panel(x % 2));
  const grid = JSON.stringify(board.grid), id = board.nextGarbageId;
  assert.equal(board.addGarbage({ width: 6 }), false);
  assert.equal(JSON.stringify(board.grid), grid);
  assert.equal(board.nextGarbageId, id);
  assert.equal(board.garbage.length, 0);
  assert.equal(board.lost, false);
});
