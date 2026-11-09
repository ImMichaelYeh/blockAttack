import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioPlayer, MUSIC_TRACKS } from '../src/audio.js';

test('audio fails gracefully when unavailable and clears scheduled voices on pause', async () => {
  const audio = new AudioPlayer();
  await audio.unlock(); audio.start(); audio.cue('win'); audio.stop();
  assert.equal(audio.music, null);
  let stopped = 0;
  audio.nodes.add({ stop() { stopped++; } });
  audio.stop(); assert.equal(stopped, 1); assert.equal(audio.nodes.size, 0);
});

test('trash impacts synthesize bass and filtered noise; mute and stop silence both', () => {
  const audio = new AudioPlayer(), created = [], buffers = [];
  const node = () => {
    const value = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
    created.push(value); return value;
  };
  audio.context = { state: 'running', currentTime: 1, sampleRate: 8000,
    createOscillator: node, createGain: node, createBufferSource: node, createBiquadFilter: node,
    createBuffer(channels, count) { const data = new Float32Array(count); buffers.push(data); return { getChannelData: () => data }; },
  };
  audio.master = node(); audio.cue('hit');
  assert.equal(audio.nodes.size, 2, 'A short bass thump and restrained noise form the impact');
  assert.equal(buffers[0].length, 520);
  assert.ok(buffers[0].some(sample => sample !== 0));
  audio.stop(); assert.equal(audio.nodes.size, 0);
  for (const [cue, player] of [['attack',0], ['attack',1], ['chain',0], ['chain',1], ['red-win',0], ['blue-win',1], ['loss',0]]) {
    audio.cue(cue, 4, player);
    assert.ok(audio.nodes.size > 0, `${cue} schedules playable voices`);
    audio.stop(); assert.equal(audio.nodes.size, 0, `${cue} can be cancelled`);
  }
  const count = created.length; audio.enabled = false;
  for (const cue of ['incoming', 'attack', 'chain', 'red-win', 'blue-win', 'loss']) audio.cue(cue);
  assert.equal(created.length, count);
});

function composition(type, index, player = 0) {
  const audio = new AudioPlayer(), tones = [], noise = [], vocals = [];
  audio.context = { state: 'running', currentTime: 0 };
  audio.tone = (...args) => tones.push(args);
  audio.noise = (...args) => noise.push(args);
  audio.vocal = (...args) => vocals.push(args);
  audio.cue(type, index, player);
  return { tones, noise, vocals };
}

test('Red and Blue have distinct victory themes in the same key, without a competing defeat cue', () => {
  const red = composition('red-win'), blue = composition('blue-win'), loss = composition('loss');
  assert.notDeepEqual(red.tones, blue.tones);
  assert.deepEqual(loss.tones.map(tone => tone[0]), [69,65,62,50]);
  assert.equal(red.tones[0][3], 'square');
  assert.equal(blue.tones[0][3], 'triangle');
  assert.notDeepEqual(red.tones.map(tone => tone[0]), blue.tones.map(tone => tone[0]));
  for (const result of [red, blue]) {
    assert.equal(result.noise.length, 0, 'Result themes do not add another layer of percussion');
    assert.ok(result.tones.every(([note]) => [2,4,6,7,9,11,1].includes(note % 12)), 'Both victories resolve in D major');
    assert.ok(result.tones.every(([, time, duration]) => time >= 0 && time + duration <= 2.5), 'Theme fits the result presentation');
  }
});

test('Red growls and Blue uses a distinct two-syllable call instead of shared attack beeps', () => {
  const red = composition('attack', 4, 0), blue = composition('attack', 4, 1);
  assert.equal(red.vocals.length, 1);
  assert.equal(blue.vocals.length, 2);
  assert.ok(red.vocals[0][0] < blue.vocals[0][0], 'Red has a lower voice');
  assert.notDeepEqual(red.vocals[0][3], blue.vocals[0][3], 'Characters have different vowel resonances');
  assert.ok(blue.vocals[1][1] > blue.vocals[0][1], 'Blue has a recognizable second syllable');
  assert.equal(red.tones.length + blue.tones.length, 0, 'No extra musical stabs compete with the calls');
  assert.equal(red.noise.length + blue.noise.length, 0, 'No added roar hiss');
});

test('larger combos lengthen each character call and chains add their own vocal variation', () => {
  for (const player of [0, 1]) {
    const small = composition('attack', 4, player), large = composition('attack', 12, player), chain = composition('chain', 4, player);
    assert.ok(large.vocals.at(-1)[2] > small.vocals.at(-1)[2]);
    assert.ok(chain.vocals.length > small.vocals.length);
    assert.ok(chain.vocals.every(([, time, duration]) => time + duration < .6));
  }
});

function recordedMusic() {
  const previous = globalThis.Audio, players = [], tones = [];
  globalThis.Audio = class {
    paused=true; currentTime=0; volume=1; playCount=0;
    constructor() { players.push(this); }
    play() { this.paused=false; this.playCount++; return Promise.resolve(); }
    pause() { this.paused=true; }
  };
  const audio = new AudioPlayer();
  audio.context = { state:'running', currentTime:0 };
  audio.tone = (...args) => tones.push(args);
  return { audio, players, tones, restore() { audio.stop(); if (previous === undefined) delete globalThis.Audio; else globalThis.Audio=previous; } };
}

test('recorded menu/game tracks loop, switch on one player, pause/resume and restart new rounds', () => {
  const { audio, players, restore } = recordedMusic();
  try {
    audio.start('menu'); const music=players[0];
    assert.equal(music.src,MUSIC_TRACKS.menu.src);assert.equal(music.loop,true);assert.equal(music.paused,false);
    music.currentTime=12;audio.start('menu');
    assert.equal(music.currentTime,12);assert.equal(music.playCount,1,'Repeated gestures do not restart the menu');
    audio.start('game',true);
    assert.equal(music.src,MUSIC_TRACKS.game.src);assert.equal(music.currentTime,0);assert.equal(players.length,1);
    music.currentTime=17;audio.stop();assert.equal(music.paused,true);
    audio.start('game');assert.equal(music.currentTime,17);assert.equal(music.paused,false);
    audio.start('game',true);assert.equal(music.currentTime,0);
  } finally { restore(); }
});

test('critical playback preserves pitch/position, voice ducking and volume apply to recorded music', () => {
  const { audio, players, restore } = recordedMusic();
  audio.vocal=()=>{};
  try {
    audio.start('game');const music=players[0];music.currentTime=23;
    const normal=music.volume;
    audio.danger=true;audio.updateMusic(true);
    assert.equal(music.playbackRate,1.4);assert.equal(music.preservesPitch,true);assert.equal(music.currentTime,23);
    audio.cue('attack',4,0);audio.updateMusic(true);assert.equal(music.volume,normal*.5);
    audio.context.currentTime=1;audio.danger=false;audio.updateMusic(true);
    assert.equal(music.volume,normal);assert.equal(music.playbackRate,1);assert.equal(music.currentTime,23);
    audio.volume=.8;audio.applyVolume();assert.equal(music.volume,normal*2);
    audio.enabled=false;audio.applyVolume();assert.equal(music.volume,0);
    audio.enabled=true;audio.start('menu');audio.danger=true;audio.updateMusic(true);
    assert.equal(music.playbackRate,1,'Critical state never speeds up menu music');
  } finally { restore(); }
});

test('critical heartbeat is restrained, waits for character calls and stops on safety/pause/menu', () => {
  const { audio, players, tones, restore } = recordedMusic();
  try {
    audio.start('game');audio.danger=true;audio.updateMusic();
    assert.equal(tones.length,2,'One two-part heartbeat on entering critical play');
    for(let frame=0;frame<30;frame++)audio.updateMusic();
    assert.equal(tones.length,2,'Rendering does not pile up pulses');
    audio.context.currentTime=.86;audio.updateMusic();assert.equal(tones.length,4);
    audio.voiceUntil=2;audio.context.currentTime=1.72;audio.updateMusic();assert.equal(tones.length,4);
    audio.context.currentTime=2.01;audio.updateMusic();assert.equal(tones.length,6);
    audio.danger=false;audio.context.currentTime=3;audio.updateMusic();assert.equal(tones.length,6);
    audio.danger=true;players[0].pause();audio.updateMusic();assert.equal(tones.length,6);
    audio.start('menu');audio.context.currentTime=4;audio.updateMusic();assert.equal(tones.length,6);
    audio.stop();assert.equal(audio.nextCriticalPulse,0);
  } finally { restore(); }
});

test('autoplay/media failures do not escape into the game controller', async () => {
  const { audio, players, restore } = recordedMusic();
  try {
    audio.start('menu');audio.stop();
    players[0].play=()=>Promise.reject(new Error('Playback blocked'));
    assert.doesNotThrow(()=>audio.start('game'));
    await Promise.resolve();
    players[0].play=()=>{ throw new Error('Media unavailable'); };
    assert.doesNotThrow(()=>audio.start('menu'));
  } finally { restore(); }
});

test('rapid repeated effects are bounded and starting a new round clears cue limits', () => {
  const audio = new AudioPlayer(), notes = [], noise = [];
  audio.context = { state:'running', currentTime:0 };
  audio.tone = (...args) => notes.push(args);
  audio.noise = (...args) => noise.push(args);
  for (let event = 0; event < 100; event++) {
    for (const type of ['move','swap','pop','convert','hit','incoming','danger']) audio.cue(type, event);
  }
  assert.ok(notes.length <= 10, `${notes.length} voices scheduled for a simultaneous effect burst`);
  assert.equal(noise.length, 1, 'Only the impact adds a short noise layer');
  assert.ok(notes.find(note => note[2] === .014)[4] < .03, 'Movement is a quiet tactile click');
  audio.context.currentTime = .1;
  const before = notes.length; audio.cue('move');
  assert.ok(notes.length > before, 'A later deliberate movement can sound');
  audio.stop();
  const reset = notes.length; audio.cue('move');
  assert.ok(notes.length > reset, 'Pause/new-round cleanup does not leave stale cue limits');
});

test('character calls take turns and duck the backing mix until the last call ends', () => {
  const audio = new AudioPlayer(), calls = [], levels = [];
  audio.context = { state:'running', currentTime:0 };
  audio.vocal = (...args) => calls.push(args);
  for (const name of ['effects']) audio[name + 'Gain'] = { gain: {
    cancelScheduledValues() {},
    setTargetAtTime: (...args) => levels.push([name,...args]),
    setValueAtTime: (...args) => levels.push([name,...args]),
  } };
  audio.cue('attack', 4, 0);
  const redEnd = Math.max(...calls.map(([,time,duration]) => time + duration)), count = calls.length;
  audio.cue('attack', 4, 1);
  assert.ok(calls[count][1] >= redEnd, 'Simultaneous players do not shout over each other');
  const total = calls.length;
  for (let event = 0; event < 20; event++) { audio.cue('chain', 4, 0); audio.cue('attack', 4, 1); }
  assert.equal(calls.length, total, 'Rapid duplicate character calls are suppressed');
  const ending = Math.max(...calls.map(([,time,duration]) => time + duration));
  assert.ok(levels.some(([name,value]) => name === 'effects' && value < .8));
  assert.ok(levels.filter(([name,value]) => name === 'effects' && value === .8).at(-1)[2] >= ending);
  audio.stop();
  assert.equal(audio.voiceUntil, 0);
  assert.equal(levels.filter(([name]) => name === 'effects').at(-1)[1], .8, 'Stopping restores the backing gain');
});

test('audio buses share a soft filter/compressor and use rounded, band-limited waveforms', async () => {
  const previous = globalThis.AudioContext, oscillators = [], filters = [];
  const parameter = () => ({ value:0, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = () => ({ gain:parameter(), frequency:parameter(), Q:parameter(), connections:[], connect(target) { this.connections.push(target); }, disconnect() {}, start() {}, stop() {}, setPeriodicWave(wave) { this.wave = wave; } });
  globalThis.AudioContext = class {
    state='running'; currentTime=0; destination={};
    createGain() { return node(); }
    createBiquadFilter() { const filter=node(); filters.push(filter); return filter; }
    createDynamicsCompressor() { return { ...node(), threshold:{}, knee:{}, ratio:{}, attack:{}, release:{} }; }
    createPeriodicWave(real, imaginary) { return { real, imaginary }; }
    createOscillator() { const oscillator=node(); oscillators.push(oscillator); return oscillator; }
  };
  const audio = new AudioPlayer();
  try {
    await audio.unlock();
    const filter=filters[0], compressor=filter.connections[0];
    for (const name of ['effects','voice']) assert.equal(audio[name+'Gain'].connections[0], filter);
    assert.equal(filter.type, 'lowpass'); assert.equal(filter.frequency.value, 6200);
    assert.equal(compressor.connections[0], audio.master);
    assert.ok(compressor.ratio.value > 1 && compressor.threshold.value < 0);
    assert.equal(audio.waves.square.imaginary[2], 0);
    assert.ok(audio.waves.sawtooth.imaginary[12] < audio.waves.sawtooth.imaginary[2]);
    audio.tone(74,0,.12,'square',.18);
    assert.ok(oscillators.some(oscillator => oscillator.wave === audio.waves.square));
    assert.ok(oscillators.every(oscillator => oscillator.connections[0].connections[0] === audio.effectsGain));
    audio.cue('attack',4,0);
    assert.equal(oscillators.at(-1).connections[0].connections[0].connections[0], audio.voiceGain);
  } finally {
    audio.stop();
    if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous;
  }
});
