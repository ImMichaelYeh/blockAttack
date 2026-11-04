import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';
import { CPU_PROFILES, chooseMove } from '../src/engine.js';

test('single CPU matches use selected difficulty and opening profile', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const session = new Session({ difficulty });
    const match = session.start(123);
    assert.equal(session.length, 1);
    assert.equal(match.cpu.interval, CPU_PROFILES[difficulty].intervals[0]);
    assert.ok(match.boards.every(board => board.difficulty === difficulty));
    assert.throws(() => session.continue(), /Finish/);
    match.result = 'loss'; session.continue(123);
    assert.equal(session.level, 1);
    assert.equal(session.match.result, null);
    session.match.result = 'win'; session.continue();
    assert.equal(session.level, 1);
  }
});

test('all series lengths progress, retry and complete without decreasing CPU strength', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) for (let length = 1; length <= 10; length++) {
    const session = new Session({ mode: 'series', difficulty, length });
    let previousInterval = Infinity;
    session.start(42);
    for (let level = 1; level <= length; level++) {
      assert.equal(session.level, level);
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
  for (const length of [0, 11, -1, 2.5, NaN, Infinity, '5', null]) assert.throws(() => new Session({ mode: 'series', length }));
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
