import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../src/engine.js';
import { Controls, PLAYER_TWO_BINDINGS } from '../src/controls.js';
import { mechanicsReplay } from '../tools/replay-check.mjs';

const reference = JSON.parse(readFileSync(new URL('./fixtures/mechanics-parity.json', import.meta.url), 'utf8'));

for (const { config, expected } of reference.replays) {
  test(`previous-engine parity: ${config.difficulty}, stage ${config.stage}, ${config.input}, seed ${config.seed}`, () => {
    assert.deepEqual(mechanicsReplay(engine, config), expected);
  });
}

test('cursor matches a trace captured from the actual previous cursorMove function', () => {
  const controls = new Controls();
  for (const event of reference.cursor) {
    for (const code of event.down || []) controls.down(code);
    for (const code of event.up || []) controls.up(code);
    assert.deepEqual(controls.sample().move || null, event.move, JSON.stringify(event));
  }
});

test('direction changes, alias keys and P2 share the same cursor timing', () => {
  for (const controls of [new Controls(), new Controls(PLAYER_TWO_BINDINGS, { arrows: false })]) {
    controls.down(controls.bindings.up);
    assert.deepEqual(controls.sample().move, [0, 1]);
    for (let tick = 1; tick < 10; tick++) assert.equal(controls.sample().move, undefined);
    assert.deepEqual(controls.sample().move, [0, 1]);
    controls.down(controls.bindings.right);
    assert.deepEqual(controls.sample().move, [0, 1], 'No diagonal; held Up keeps priority');
    controls.up(controls.bindings.up);
    assert.deepEqual(controls.sample().move, [1, 0], 'A direction change moves immediately');
    for (let tick = 1; tick < 10; tick++) assert.equal(controls.sample().move, undefined);
    assert.deepEqual(controls.sample().move, [1, 0]);
    controls.clear();
    controls.down(controls.bindings.right);
    assert.deepEqual(controls.sample().move, [1, 0], 'Pause/focus reset removes repeat charge');
  }
  const controls = new Controls(); controls.down('KeyW'); controls.sample();
  for (let tick = 1; tick < 10; tick++) controls.sample();
  controls.down('ArrowUp'); controls.up('KeyW');
  assert.deepEqual(controls.sample().move, [0, 1], 'Switching aliases for the same direction keeps repeat charge');
});
