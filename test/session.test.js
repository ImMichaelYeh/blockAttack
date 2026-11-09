import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, SERIES_LENGTHS, SINGLE_LEVELS } from '../src/session.js';
import { CPU_PROFILES, chooseMove, Match } from '../src/engine.js';

test('single CPU levels span the reference encounters and retain their level on rematch', () => {
  assert.deepEqual(SINGLE_LEVELS[0], { difficulty: 'easy', stage: 1 });
  assert.equal(SINGLE_LEVELS.length, 20);
  assert.deepEqual(SINGLE_LEVELS[19], { difficulty: 'hard', stage: 12 });
  const cpuKey = match => JSON.stringify([match.cpu.interval, match.cpu.chains, match.cpu.raiseBelow]);
  const expected = new Set(Object.entries(SERIES_LENGTHS).flatMap(([difficulty, length]) =>
    Array.from({ length }, (_, index) => cpuKey(new Match(123, difficulty, index + 1)))));
  const actual = SINGLE_LEVELS.map(({ difficulty, stage }) => cpuKey(new Match(123, difficulty, stage)));
  assert.equal(new Set(actual).size, 20);
  assert.deepEqual(new Set(actual), expected);
  let previousInterval = Infinity;
  for (let level = 1; level <= 20; level++) {
    const { difficulty, stage } = SINGLE_LEVELS[level - 1];
    const session = new Session({ level });
    const match = session.start(123);
    assert.equal(session.length, 1);
    assert.equal(match.cpu.interval, CPU_PROFILES[difficulty].intervals[stage - 1]);
    assert.ok(match.cpu.interval <= previousInterval);
    previousInterval = match.cpu.interval;
    assert.ok(match.boards.every(board => board.difficulty === difficulty));
    assert.throws(() => session.continue(), /Finish/);
    match.result = 'loss'; session.continue(123);
    assert.equal(session.level, level);
    assert.equal(session.match.result, null);
    session.match.result = 'win'; session.continue();
    assert.equal(session.level, level);
  }
});

test('reference series routes progress, retry and complete without decreasing CPU strength', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const length = SERIES_LENGTHS[difficulty];
    const session = new Session({ mode: 'series', difficulty });
    assert.equal(session.length, length);
    let previousInterval = Infinity;
    session.start(42);
    for (let level = 1; level <= length; level++) {
      assert.equal(session.level, level);
      const reference = new Match(42, difficulty, level);
      assert.deepEqual(session.match.cpu, reference.cpu);
      assert.equal(session.match.boards[0].speedLevel, reference.boards[0].speedLevel);
      assert.ok(session.match.cpu.interval <= previousInterval);
      previousInterval = session.match.cpu.interval;
      const stage = session.profileStage, speed = session.match.boards[0].speedLevel;
      for (const result of ['draw', 'loss']) {
        session.match.result = result; session.continue(44);
        assert.equal(session.level, level);
        assert.equal(session.profileStage, stage);
        assert.equal(session.match.boards[0].speedLevel, speed);
      }
      session.match.result = 'win';
      assert.equal(session.complete, level === length);
      if (level < length) session.continue();
    }
    assert.equal(session.profileStage, length === 1 ? 1 : CPU_PROFILES[difficulty].intervals.length);
    session.continue();
    assert.equal(session.level, 1);
    assert.equal(session.match.result, null);
    assert.equal(session.match.boards[0].score, 0);
  }
});

test('series rejects invalid settings at the boundary', () => {
  for (const level of [0, 21, -1, 2.5, NaN, Infinity, '5', null]) assert.throws(() => new Session({ level }));
  for (const difficulty of ['extreme', '__proto__', '', null]) assert.throws(() => new Session({ difficulty }));
  assert.throws(() => new Session({ mode: 'lan' }));
});

test('CPU planning does not consume board RNG or change simulation state', () => {
  const match = new Session({ difficulty: 'hard' }).start(72);
  const first = new Session({ difficulty: 'hard' }).start(72);
  const before = JSON.stringify(match.boards[1]);
  assert.deepEqual(chooseMove(match.boards[1], true), chooseMove(match.boards[1], true));
  assert.equal(JSON.stringify(match.boards[1]), before);
  assert.deepEqual(match.boards[1].makeRow(), first.boards[1].makeRow());
});
