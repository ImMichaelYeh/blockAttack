import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioPlayer } from '../src/audio.js';

test('audio fails gracefully when unavailable and clears scheduled voices on pause', async () => {
  const audio = new AudioPlayer();
  await audio.unlock(); audio.start(); audio.cue('win'); audio.stop();
  assert.equal(audio.timer, null);
  let stopped = 0;
  audio.nodes.add({ stop() { stopped++; } });
  audio.stop(); assert.equal(stopped, 1); assert.equal(audio.nodes.size, 0);
});

test('trash impacts synthesize bass and filtered noise; mute and stop silence both', () => {
  const audio = new AudioPlayer(), created = [], buffers = [];
  const node = () => {
    const value = { frequency: {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
    created.push(value); return value;
  };
  audio.context = { state: 'running', currentTime: 1, sampleRate: 8000,
    createOscillator: node, createGain: node, createBufferSource: node, createBiquadFilter: node,
    createBuffer(channels, count) { const data = new Float32Array(count); buffers.push(data); return { getChannelData: () => data }; },
  };
  audio.master = node(); audio.cue('hit');
  assert.equal(audio.nodes.size, 3, 'Two low tones and a noise voice form the impact');
  assert.equal(buffers[0].length, 2240);
  assert.ok(buffers[0].some(sample => sample !== 0));
  audio.stop(); assert.equal(audio.nodes.size, 0);
  const count = created.length; audio.enabled = false;
  audio.cue('incoming'); assert.equal(created.length, count);
});
