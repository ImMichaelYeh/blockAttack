import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls, DEFAULT_BINDINGS, PLAYER_TWO_BINDINGS, validBindings, restoreBindings } from '../src/controls.js';

test('movement repeats after ten ticks then every tick; swaps are edges and raising is held', () => {
  const controls = new Controls();
  controls.down('KeyW'); controls.down('Enter'); controls.down('ShiftLeft');
  assert.deepEqual(controls.sample(), { move: [0, 1], swap: true, raise: true, raisePressed: true });
  controls.down('Enter');
  for (let tick = 1; tick < 10; tick++) {
    const input = controls.sample(); assert.equal(input.move, undefined); assert.equal(input.swap, false); assert.equal(input.raise, true);
  }
  assert.deepEqual(controls.sample().move, [0, 1]);
  assert.deepEqual(controls.sample().move, [0, 1]);
  controls.up('KeyW'); controls.up('Enter'); controls.down('Enter');
  assert.equal(controls.sample().swap, true);
  controls.clear();
  assert.deepEqual(controls.sample(), { move: undefined, swap: false, raise: false, raisePressed: false });
});

test('opposite directions use the previous game priority and remapped actions stay separate', () => {
  const controls = new Controls({ ...DEFAULT_BINDINGS, swap: 'Space' });
  controls.down('ArrowLeft'); controls.down('ArrowRight');
  assert.deepEqual(controls.sample().move, [-1, 0]);
  controls.up('ArrowLeft');
  assert.deepEqual(controls.sample().move, [1, 0]);
  assert.equal(controls.handles('KeyF'), false);
  controls.down('Space'); assert.equal(controls.sample().swap, true);
});

test('restored bindings reject collisions and unsupported keys', () => {
  assert.ok(validBindings(DEFAULT_BINDINGS));
  for (const bindings of [{}, { ...DEFAULT_BINDINGS, swap: 'Escape' }, { ...DEFAULT_BINDINGS, swap: 'KeyW' }, { ...DEFAULT_BINDINGS, up: 'ArrowUp' }]) assert.ok(!validBindings(bindings));
});

test('released movement is not held, while released swap/raise taps remain buffered', () => {
  const controls = new Controls();
  controls.down('ArrowUp'); controls.up('ArrowUp');
  assert.equal(controls.sample().move, undefined);
  assert.equal(controls.sample().move, undefined);
  controls.down('Enter'); controls.up('Enter');
  controls.down('ShiftLeft'); controls.up('ShiftLeft');
  assert.deepEqual(controls.sample(), { move: undefined, swap: true, raise: false, raisePressed: true });
  assert.deepEqual(controls.sample(), { move: undefined, swap: false, raise: false, raisePressed: false });
});

test('player defaults use independent movement and swap keys', () => {
  assert.deepEqual([DEFAULT_BINDINGS.up, DEFAULT_BINDINGS.left, DEFAULT_BINDINGS.down, DEFAULT_BINDINGS.right, DEFAULT_BINDINGS.swap], ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter']);
  assert.deepEqual([PLAYER_TWO_BINDINGS.up, PLAYER_TWO_BINDINGS.left, PLAYER_TWO_BINDINGS.down, PLAYER_TWO_BINDINGS.right, PLAYER_TWO_BINDINGS.swap], ['KeyI', 'KeyJ', 'KeyK', 'KeyL', 'ShiftRight']);
  assert.ok(validBindings(PLAYER_TWO_BINDINGS));
  assert.equal(DEFAULT_BINDINGS.raise, 'ShiftLeft');
  assert.equal(PLAYER_TWO_BINDINGS.raise, 'Space');
  assert.equal(Object.values(DEFAULT_BINDINGS).some(code => Object.values(PLAYER_TWO_BINDINGS).includes(code)), false);
  const controls = new Controls(); controls.down('ShiftRight');
  assert.equal(controls.sample().swap, false, 'The reserved P2 swap cannot control P1');
});

test('old defaults upgrade to Enter without discarding custom controls', () => {
  assert.deepEqual(restoreBindings({ ...DEFAULT_BINDINGS, swap: 'KeyF', raise: 'KeyG' }), DEFAULT_BINDINGS);
  assert.deepEqual(restoreBindings({ ...DEFAULT_BINDINGS, raise: 'KeyG' }), DEFAULT_BINDINGS);
  const custom = { ...DEFAULT_BINDINGS, swap: 'Space', raise: 'ShiftLeft' };
  assert.deepEqual(restoreBindings(custom), custom);
  assert.deepEqual(restoreBindings(null), DEFAULT_BINDINGS);
});
