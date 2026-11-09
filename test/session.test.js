import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, SERIES_LENGTHS, SINGLE_LEVELS } from '../src/session.js';
import { chooseMove, Match } from '../src/engine.js';
import { CPU_LEVELS, ComputerPlayer } from '../src/cpu.js';

test('single CPU levels use all custom profiles and retain their level on rematch', () => {
  assert.equal(SINGLE_LEVELS[0].difficulty, 'easy');
  assert.equal(SINGLE_LEVELS.length, 10);
  assert.equal(SINGLE_LEVELS[9].difficulty, 'hard');
  assert.equal(new Set(SINGLE_LEVELS.map(profile => JSON.stringify(profile))).size, 10);
  let previousInterval = Infinity;
  for (let level = 1; level <= 10; level++) {
    const { difficulty } = SINGLE_LEVELS[level - 1];
    const session = new Session({ level });
    const match = session.start(123);
    assert.equal(session.length, 1);
    assert.ok(match.cpu instanceof ComputerPlayer);
    assert.equal(match.cpu.level, level);
    assert.equal(match.cpu.profile, CPU_LEVELS[level - 1]);
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

test('series routes progress through custom CPU levels while retaining route board timing', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const length = SERIES_LENGTHS[difficulty];
    const session = new Session({ mode: 'series', difficulty });
    assert.equal(session.length, length);
    let previousInterval = Infinity;
    session.start(42);
    for (let level = 1; level <= length; level++) {
      assert.equal(session.level, level);
      const reference = new Match(42, difficulty, level);
      assert.ok(session.match.cpu instanceof ComputerPlayer);
      const [first, last] = { easy: [1, 4], normal: [3, 7], hard: [6, 10] }[difficulty];
      assert.ok(session.match.cpu.level >= first && session.match.cpu.level <= last);
      if (level === 1) assert.equal(session.match.cpu.level, first);
      if (level === length) assert.equal(session.match.cpu.level, last);
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
    assert.equal(session.profileStage, length);
    session.continue();
    assert.equal(session.level, 1);
    assert.equal(session.match.result, null);
    assert.equal(session.match.boards[0].score, 0);
  }
});

test('series rejects invalid settings at the boundary', () => {
  for (const level of [0, 11, 20, -1, 2.5, NaN, Infinity, '5', null]) assert.throws(() => new Session({ level }));
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
