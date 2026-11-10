import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Match } from '../src/engine.js';
import { Session } from '../src/session.js';
import { AudioPlayer } from '../src/audio.js';
import { runInNewContext } from 'node:vm';
import { bundle } from '../tools/bundle.mjs';

// An in-memory DOM exercises controller transitions without launching a browser.
class Element {
  constructor(id) { this.id = id; this.listeners = {}; this.hidden = false; this.open = false; this.value = ''; this.textContent = ''; this.children = []; this.dataset = {}; this.width = 288; this.height = 576; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  fire(type, props = {}) { const event = { preventDefault() {}, ...props }; for (const callback of this.listeners[type] || []) callback(event); }
  click() { this.fire('click'); }
  focus() {}
  setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
  replaceChildren() { this.children = []; }
  append(...children) { this.children.push(...children); }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  querySelector() { return new Element('submit'); }
  getContext() { return new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } }); }
}

test('CPU controller covers menu, play, focus pause, settings, results and series navigation', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element(id)]));
  const get = id => { assert.ok(elements.has(id), `Missing element ${id}`); return elements.get(id); };
  const browserWindow = new Element('window'), documentEvents = new Element('document');
  let now = 0, nextFrame, mode = 'single', outcome = null, observedMatch;
  const emitted = [], cueCalls = [], musicStarts = [];
  let observedAudio;
  const stored = new Map();
  const names = ['document', 'window', 'localStorage', 'matchMedia', 'requestAnimationFrame', 'FormData', 'performance'];
  const originals = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const install = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  install('document', { hidden: false, getElementById: get, createElement: () => new Element('new'), addEventListener: (...args) => documentEvents.addEventListener(...args), querySelector: () => new Element('brand'), querySelectorAll: selector => selector === 'dialog[open]' ? [...elements.values()].filter(element => element.open) : [] });
  install('window', browserWindow);
  install('localStorage', { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) });
  install('matchMedia', () => ({ matches: false }));
  install('requestAnimationFrame', callback => { nextFrame = callback; });
  install('FormData', class { get() { return mode; } });
  install('performance', { now: () => now });
  get('difficulty').value = 'easy'; get('level').value = '1'; get('game').hidden = true;
  const originalStep = Match.prototype.step;
  const originalStart = Session.prototype.start;
  const originalCue = AudioPlayer.prototype.cue, cues = [];
  const originalMusicStart = AudioPlayer.prototype.start;
  AudioPlayer.prototype.start = function(track,restart) { musicStarts.push([track,restart]); return originalMusicStart.call(this,track,restart); };
  AudioPlayer.prototype.cue = function(type, ...args) { observedAudio = this; cues.push(type); cueCalls.push([type, ...args]); return originalCue.call(this, type, ...args); };
  Session.prototype.start = function(...args) { observedMatch = originalStart.apply(this, args); return observedMatch; };
  Match.prototype.step = function(input, opponentInput) {
    observedMatch = this;
    if (outcome) { this.result = outcome; outcome = null; return []; }
    return originalStep.call(this, input, opponentInput).concat(emitted.splice(0));
  };
  const frameWith = milliseconds => { now += milliseconds; nextFrame(now); };
  const frame = () => frameWith(17);
  const advance = count => { for (let tick = 0; tick < count; tick++) frame(); };
  try {
    await import('../src/main.js');
    assert.equal(get('menu').hidden, false);
    assert.equal(get('match-dialog').open, false);
    assert.equal(get('cpu-setup').hidden, true);
    browserWindow.fire('keydown', { code: 'NumpadEnter' });
    assert.equal(get('cpu-setup').hidden, false);
    await Promise.resolve();
    assert.equal(musicStarts.at(-1)[0],'menu');
    get('setup').fire('submit'); frame();
    await Promise.resolve();
    assert.deepEqual(musicStarts.at(-1),['game',true]);
    assert.equal(get('game').hidden, false);
    assert.equal(get('match-title').textContent, 'Single match');
    assert.equal(get('battle-announcement').textContent, 'Ready?');
    const frozen = observedMatch.boards.map(({ cursor, ...state }) => JSON.stringify(state));
    browserWindow.fire('keydown', { code: 'KeyW' });
    browserWindow.fire('keydown', { code: 'Enter' });
    browserWindow.fire('keydown', { code: 'ShiftLeft' });
    frame(); assert.equal(observedMatch.boards[0].cursor.y, 1);
    advance(9); assert.equal(observedMatch.boards[0].cursor.y, 1);
    frame(); assert.equal(observedMatch.boards[0].cursor.y, 2);
    assert.equal(observedMatch.tick, 0, 'READY allows cursor movement without advancing physics');
    assert.deepEqual(observedMatch.boards.map(({ cursor, ...state }) => JSON.stringify(state)), frozen, 'Swap and raise stay blocked during READY');
    for (const code of ['KeyW', 'Enter', 'ShiftLeft']) browserWindow.fire('keyup', { code });
    for (let tap = 0; tap < 2; tap++) { browserWindow.fire('keydown', { code: 'KeyS' }); frame(); browserWindow.fire('keyup', { code: 'KeyS' }); frame(); }
    advance(75);
    emitted.push({type:'clear',player:0,count:4,chain:1}, {type:'clear',player:1,count:3,chain:2}, {type:'clear',player:1,count:3,chain:1,shocks:3});
    frame();
    assert.ok(cueCalls.some(call => call[0] === 'attack' && call[1] === 4 && call[2] === 0), 'Red attacks use Red voice');
    assert.ok(cueCalls.some(call => call[0] === 'chain' && call[1] === 2 && call[2] === 1), 'Blue chains use Blue voice');
    assert.ok(cueCalls.some(call => call[0] === 'attack' && call[1] === 3 && call[2] === 1), 'Metal attacks also use the attacker voice');
    browserWindow.fire('keydown', { code: 'NumpadEnter' }); frame();
    browserWindow.fire('keyup', { code: 'NumpadEnter' });
    for (let i = 0; i < 100; i++) frame();
    assert.ok(observedMatch.boards[0].score > 0, 'The opening swap actually clears panels');
    get('top-volume').value = '65';get('top-volume').fire('input');
    assert.equal(observedAudio.volume,.65,'Top slider changes live audio without pausing');
    assert.equal(Number(get('volume').value),65,'Settings volume stays synchronized');
    assert.equal(JSON.parse(stored.get('blockAttack.original.settings.v1')).volume,.65);
    assert.equal(get('match-dialog').open,false);
    const cursorBeforeVolume={...observedMatch.boards[0].cursor};
    browserWindow.fire('keydown',{code:'ArrowLeft',target:get('top-volume'),preventDefault(){assert.fail('Slider arrows must keep their native behavior');}});
    frame();
    assert.deepEqual(observedMatch.boards[0].cursor,cursorBeforeVolume,'Slider arrows do not move the game cursor');
    get('volume').value='40';get('volume').fire('input');
    assert.equal(observedAudio.volume,.4);
    assert.equal(Number(get('top-volume').value),40,'Settings changes update the top slider too');
    for (const board of observedMatch.boards) {
      let height = 9;
      board.occupiedHeight = () => height;
      frame();
      assert.equal(observedAudio.danger, false, 'Music stays normal below the shaking threshold');
      height = 10; frame();
      assert.equal(observedAudio.danger, true, 'Either board selects critical music in CPU matches');
      height = 9; frame();
      assert.equal(observedAudio.danger, false, 'Music returns to normal when shaking stops');
      height = 8; frame();
      assert.equal(observedAudio.danger, false, 'Music returns to normal with safe headroom');
      delete board.occupiedHeight;
      frame();
      assert.equal(observedAudio.danger, false, 'Music returns to normal after the stack drops');
    }
    for (const rate of [30, 144]) {
      const tick=observedMatch.tick;
      for(let frame=0;frame<rate;frame++)frameWith(1000/rate);
      assert.ok(Math.abs(observedMatch.tick-tick-60)<=1,`Physics stays at 60 Hz with ${rate} Hz rendering`);
    }
    browserWindow.fire('blur');
    assert.equal(get('overlay-title').textContent, 'Paused.');
    const clock = get('clock').textContent;
    for (let i = 0; i < 100; i++) frame();
    assert.equal(get('clock').textContent, clock);
    get('continue').click();
    assert.equal(get('match-dialog').open, false);
    get('settings-open').click();
    assert.equal(get('settings-dialog').open, true);
    assert.equal(get('match-dialog').open, true);
    get('settings-dialog').close(); get('continue').click();
    outcome = 'loss'; frame();
    assert.equal(get('match-dialog').open, false, 'The loss animation precedes the menu');
    assert.equal(get('battle-announcement').textContent, 'Blue wins!');
    assert.ok(cues.includes('blue-win'));
    get('pause').click(); advance(30);
    assert.equal(get('overlay-title').textContent, 'Paused.');
    get('continue').click();
    assert.equal(get('battle-announcement').textContent, 'Blue wins!', 'Resuming presentation does not start another round');
    advance(155);
    assert.equal(get('overlay-title').textContent, 'Blue takes it.');
    let blockedRepeat = false;
    browserWindow.fire('keydown', { code: 'Enter', repeat: true, preventDefault() { blockedRepeat = true; } });
    assert.ok(blockedRepeat, 'Held confirm cannot skip the result menu');
    get('continue').click();
    assert.equal(observedMatch.boards[0].score, 0);
    get('leave').click(); assert.equal(get('overlay-title').textContent, 'Back to menu?');
    get('overlay-menu').click();
    assert.equal(get('menu').hidden, false);
    assert.equal(get('cpu-setup').hidden, true);
    get('menu-one-player').click();
    for (let index = 0; index < 15; index++) get('level-up').click();
    assert.equal(Number(get('level').value), 10);
    for (let index = 0; index < 15; index++) get('level-down').click();
    assert.equal(Number(get('level').value), 1);
    mode = 'series'; get('setup').fire('change');
    assert.equal(get('level').disabled, true);
    get('difficulty-easy').click();
    get('setup').fire('submit');
    advance(75);
    outcome = 'win'; frame();
    assert.ok(cues.includes('red-win'));
    advance(155);
    assert.equal(get('continue').textContent, 'Next level');
    get('continue').click();
    assert.equal(get('match-title').textContent, 'CPU series · Level 2 / 10');
    advance(75);
    outcome = 'draw'; frame(); advance(155); get('continue').click();
    assert.equal(get('match-title').textContent, 'CPU series · Level 2 / 10');
    advance(75);
    for (let level = 2; level <= 10; level++) {
      outcome = 'win'; frame(); advance(155);
      if (level < 10) { get('continue').click(); advance(75); }
    }
    assert.equal(get('overlay-title').textContent, 'Series cleared.');
    get('continue').click();
    assert.equal(get('match-title').textContent, 'CPU series · Level 1 / 10');
    get('pause').click(); get('overlay-menu').click();
    get('menu-two-player').click(); advance(75);
    assert.equal(observedMatch.cpu,null);
    for(const board of observedMatch.boards) {
      board.occupiedHeight=()=>10;frame();
      assert.equal(observedAudio.danger,true,'Either human board selects critical music in local play');
      delete board.occupiedHeight;frame();
      assert.equal(observedAudio.danger,false);
    }
    assert.match(get('match-title').textContent,/Local versus.*Round 1/);
    const redX=observedMatch.boards[0].cursor.x,blueY=observedMatch.boards[1].cursor.y;
    browserWindow.fire('keydown',{code:'KeyD'});browserWindow.fire('keydown',{code:'KeyI'});frame();
    browserWindow.fire('keyup',{code:'KeyD'});browserWindow.fire('keyup',{code:'KeyI'});
    assert.equal(observedMatch.boards[0].cursor.x,redX+1);
    assert.equal(observedMatch.boards[1].cursor.y,blueY+1);
    outcome='win';frame();advance(155);
    assert.equal(get('overlay-title').textContent,'Red earns a star!');
    assert.match(get('match-points').textContent,/Red 1, Blue 0/);
    assert.match(get('overlay-copy').textContent,/Red 1 - Blue 0/);
    get('continue').click();advance(75);
    outcome='draw';frame();advance(155);
    assert.equal(get('continue').textContent,'Replay round');
    get('continue').click();advance(75);
    assert.match(get('match-title').textContent,/Round 2/);
    outcome='loss';frame();advance(155);
    assert.match(get('overlay-copy').textContent,/Red 1 - Blue 1/);
    get('continue').click();advance(75);
    assert.match(get('match-title').textContent,/Round 3/);
    outcome='win';frame();advance(155);
    assert.equal(get('overlay-title').textContent,'Red wins the set!');
    assert.match(get('overlay-copy').textContent,/Red 2 - Blue 1/);
    assert.equal(get('continue').textContent,'Play another set');
    get('continue').click();advance(75);
    assert.match(get('match-title').textContent,/Round 1/);
    assert.match(get('match-points').textContent,/Red 2, Blue 1/,'New sets retain the running win totals');
    get('pause').click();get('overlay-menu').click();
    get('bindings').children[4].children[1].click();
    browserWindow.fire('keydown', { code: 'KeyW' });
    assert.match(get('binding-message').textContent, /already in use/);
    browserWindow.fire('keydown', { code: 'Space' });
    assert.match(get('control-hints').innerHTML, /Space/);
    assert.equal(JSON.parse([...stored.values()][0]).bindings.swap, 'Space');
    get('menu-two-player').click();
    assert.equal(get('settings-dialog').open,true);
    assert.match(get('binding-message').textContent,/overlap/);
    assert.equal(get('game').hidden,true);
  } finally {
    await Promise.resolve();
    Match.prototype.step = originalStep;
    Session.prototype.start = originalStart;
    AudioPlayer.prototype.cue = originalCue;
    AudioPlayer.prototype.start = originalMusicStart;
    for (const name of names) { if (originals[name]) Object.defineProperty(globalThis, name, originals[name]); else delete globalThis[name]; }
  }
});

test('direct-file classic bundle starts a single match and Enter clears the opening panels', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script defer src="\.\/game\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
  const script = await bundle();
  assert.doesNotMatch(script, /^\s*(import|export)\s/m);
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element(id)]));
  const get = id => { assert.ok(elements.has(id), `Missing element ${id}`); return elements.get(id); };
  const win = new Element('window');
  let now = 0, nextFrame;
  const context = {
    document: { getElementById: get, createElement: () => new Element('new'), querySelector: () => new Element('brand'), querySelectorAll: () => [], addEventListener() {} },
    window: win, matchMedia: () => ({ matches: false }),
    localStorage: { getItem() { throw new Error('Blocked for local files'); }, setItem() { throw new Error('Blocked for local files'); } },
    performance: { now: () => now }, requestAnimationFrame: callback => { nextFrame = callback; },
    FormData: class { get() { return 'single'; } }, setInterval, clearInterval,
  };
  get('difficulty').value = 'normal'; get('level').value = '1'; get('game').hidden = true;
  runInNewContext(script.replace('this.match = new Match(seed,', 'globalThis.observedMatch = this.match = new Match(seed,'), context, { timeout: 2000, filename: 'game.js' });
  assert.equal(get('cpu-setup').hidden, true);
  get('menu-one-player').click(); get('setup').fire('submit');
  assert.equal(get('game').hidden, false);
  assert.equal(get('match-title').textContent, 'Single match');
  for (let frame = 0; frame < 75; frame++) { now += 17; nextFrame(now); }
  win.fire('keydown', { code: 'Enter' }); win.fire('keyup', { code: 'Enter' });
  for (let frame = 0; frame < 110; frame++) { now += 17; nextFrame(now); }
  assert.ok(context.observedMatch.boards[0].score > 0);
  assert.match(get('storage-message').textContent, /cannot be saved/);
  assert.equal(context.Match, undefined, 'Bundling does not expose engine globals');
  win.fire('keydown', { code: 'Escape' });
  assert.equal(get('overlay-title').textContent, 'Paused.');
});
