import { TICK_RATE } from './engine.js';
import { Session } from './session.js';
import { Controls, DEFAULT_BINDINGS, PLAYER_TWO_BINDINGS, LABELS, bindable, restoreBindings, keyLabel, normalizeKey } from './controls.js';
import { BoardRenderer, SceneRenderer, drawMascot, drawBattleEffects } from './render.js';
import { INTRO_TICKS, RESULT_TICKS, incomingPackets, sceneScale } from './presentation.js';
import { AudioPlayer } from './audio.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'blockAttack.original.settings.v1';
const defaults = { sound: true, volume: .4, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, bindings: { ...DEFAULT_BINDINGS } };
let settings = { ...defaults }, storageFailed = false;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && typeof saved === 'object') {
    if (typeof saved.sound === 'boolean') settings.sound = saved.sound;
    if (typeof saved.reduced === 'boolean') settings.reduced = saved.reduced;
    if (Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1) settings.volume = saved.volume;
    settings.bindings = restoreBindings(saved.bindings);
  }
} catch { storageFailed = true; }

const controls = new Controls(settings.bindings);
const playerTwo = new Controls(PLAYER_TWO_BINDINGS, { arrows: false });
const clearInputs = () => { for (const input of [controls, playerTwo]) input.clear(); };
const audio = new AudioPlayer();
const renderers = [new BoardRenderer($('red-board'), $('red-mascot'), 0, $('red-incoming')), new BoardRenderer($('blue-board'), $('blue-mascot'), 1, $('blue-incoming'))];
const scene = new SceneRenderer($('scene'));
const sceneBuffers = { boards: [$('red-board'), $('blue-board')], mascots: [$('red-mascot'), $('blue-mascot')], incoming: [$('red-incoming'), $('blue-incoming')] };
let session = null, paused = false, capture = null, accumulator = 0, previous = performance.now(), frameTick = 0;
let introAge = INTRO_TICKS, resultAge = null, resultShown = false, visualTick = 0, lastDanger = false;
let incomingCounts = [0, 0];
let lastFeed = '', feedUntil = 0;
const menuIds = ['menu-one-player', 'menu-two-player', 'help-open', 'settings-open'];
const menuDescriptions = ['Let\'s make a chain! Red vs. Blue. Ready?', 'Local two-player. First to two victory stars wins!', 'A few little tips for some big comebacks!', 'Your keys. Your sound. Your kind of fun!'];
let menuIndex = 0;
const active = () => session?.match && !paused && !$('game').hidden;
const running = () => active() && !session.match.result && introAge >= INTRO_TICKS;

function fitScene() {
  const scale = sceneScale(window.innerWidth || 1024, window.innerHeight || 900);
  $('scene-viewport').setAttribute('style', `--scale:${scale}`);
  const bounds = $('scene-viewport').getBoundingClientRect?.();
  if (bounds) for (const id of ['match-dialog','help-dialog','settings-dialog']) $(id).setAttribute('style', `left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px`);
}

function selectMenu(index, focus = false) {
  if ((index + menuIds.length) % menuIds.length !== menuIndex) audio.cue('menu');
  menuIndex = (index + menuIds.length) % menuIds.length;
  menuIds.forEach((id, position) => $(id).setAttribute('aria-current', String(position === menuIndex)));
  $('menu-description').textContent = menuDescriptions[menuIndex];
  if (focus) $(menuIds[menuIndex]).focus();
}

function showMenuPanel(setup) {
  $('menu-home').hidden = setup; $('cpu-setup').hidden = !setup;
  $('setup-error').textContent = '';
  if (setup) $('difficulty').focus(); else selectMenu(0, true);
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); storageFailed = false; }
  catch { storageFailed = true; }
  $('storage-message').textContent = storageFailed ? 'Settings cannot be saved in this browser. They still work for this visit.' : '';
}

function updateSettings() {
  audio.enabled = settings.sound; audio.volume = settings.volume; audio.applyVolume();
  $('sound').textContent = settings.sound ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(!settings.sound));
  $('sound').setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Enable sound');
  $('sound-setting').checked = settings.sound; $('volume').value = Math.round(settings.volume * 100); $('reduced').checked = settings.reduced;
  $('storage-message').textContent = storageFailed ? 'Settings cannot be saved in this browser. They still work for this visit.' : '';
  refreshBindings();
}

function refreshBindings() {
  controls.bindings = { ...settings.bindings };
  $('bindings').replaceChildren();
  for (const [action, label] of Object.entries(LABELS)) {
    const row = document.createElement('div'); row.className = 'binding-row';
    const name = document.createElement('span'); name.textContent = label;
    const button = document.createElement('button'); button.className = 'quiet'; button.id = `bind-${action}`;
    button.textContent = capture === action ? 'Press a key…' : keyLabel(settings.bindings[action]);
    button.setAttribute('aria-label', `Change ${label} key, currently ${keyLabel(settings.bindings[action])}`);
    button.addEventListener('click', () => { capture = action; refreshBindings(); $('binding-message').textContent = 'Press a letter, number, Space, Enter, or Shift. Escape or Tab cancels.'; });
    row.append(name, button); $('bindings').append(row);
  }
  const moveKeys = ['up', 'left', 'down', 'right'].map(action => keyLabel(settings.bindings[action])).join(' ');
  $('control-hints').innerHTML = `<span>MOVE <kbd>${moveKeys}</kbd> / <kbd>↑ ← ↓ →</kbd></span><span>SWAP <kbd>${keyLabel(settings.bindings.swap)}</kbd></span><span>RAISE <kbd>${keyLabel(settings.bindings.raise)}</kbd></span><span>PAUSE <kbd>Esc</kbd></span>`;
  $('help-controls').textContent = `Move: ${moveKeys} or arrows. Swap: ${keyLabel(settings.bindings.swap)}. Raise: ${keyLabel(settings.bindings.raise)}. Pause: Escape.`;
  $('red-board').setAttribute('aria-label', `Your board. ${$('help-controls').textContent}`);
  $('p2-controls').textContent = `Local Player 2: ${['up', 'left', 'down', 'right'].map(action => keyLabel(PLAYER_TWO_BINDINGS[action])).join(' ')} to move, ${keyLabel(PLAYER_TWO_BINDINGS.swap)} to swap, ${keyLabel(PLAYER_TWO_BINDINGS.raise)} to raise. LAN is coming later.`;
}

async function startAudio(ready = false) {
  if (!settings.sound) return;
  await audio.unlock();
  if (active() && !session.match.result) { audio.start(); if (ready) audio.cue('ready'); }
}

function startRound() {
  paused = false; accumulator = 0; previous = performance.now(); clearInputs(); audio.stop();
  introAge = 0; resultAge = null; resultShown = false; visualTick = 0; lastDanger = false; incomingCounts = [0, 0];
  for (const renderer of renderers) renderer.reset();
  $('menu').hidden = true; $('game').hidden = false;
  $('game-tools').hidden = false;
  if ($('match-dialog').open) $('match-dialog').close();
  $('match-title').textContent = session.mode === 'local' ? `Local versus · Round ${session.round} · First to 2 stars` : session.mode === 'series' ? `CPU series · Level ${session.level} / ${session.length}` : 'Single match';
  $('blue-board').setAttribute('aria-label', session.mode === 'local' ? 'Player 2 board. IJKL move, Right Shift swaps, Space raises, Escape pauses.' : 'CPU board');
  $('difficulty-label').textContent = session.difficulty.toUpperCase();
  lastFeed = 'Your move.'; feedUntil = 120; $('attack-feed').textContent = lastFeed;
  $('battle-announcement').textContent = 'Ready?';
  draw(); $('red-board').focus(); void startAudio(true);
}

function setOverlay(kicker, title, copy, action) {
  $('overlay-kicker').textContent = kicker; $('overlay-title').textContent = title;
  $('overlay-copy').textContent = copy; $('continue').textContent = action;
  fitScene();
  if (!$('match-dialog').open) $('match-dialog').showModal();
  $('continue').focus();
}

function pauseGame() {
  if (!active() || resultShown) return;
  paused = true; clearInputs(); accumulator = 0; audio.stop();
  setOverlay('TAKE A BREATHER', 'Paused.', 'The stack can wait. Resume when you are ready.', 'Resume');
}

function resume() {
  if (!session || resultShown) return;
  paused = false; clearInputs(); accumulator = 0; previous = performance.now();
  $('match-dialog').close(); $('red-board').focus(); void startAudio();
}

function mainMenu() {
  audio.stop(); clearInputs(); session = null; paused = false; accumulator = 0;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('menu').hidden = false; $('game').hidden = true;
  $('game-tools').hidden = true;
  showMenuPanel(false);
}

function finish() {
  audio.stop(); clearInputs();
  resultAge = 0;
  session.recordResult();
  audio.cue(session.match.result);
  $('battle-announcement').textContent = session.match.result === 'draw' ? 'Draw!' : session.match.result === 'win' ? 'Red wins!' : 'Blue wins!';
  if (session.mode === 'local') $('battle-announcement').textContent += ` Red ${session.stars[0]} stars, Blue ${session.stars[1]} stars.`;
}

function showResult() {
  resultShown = true;
  const result = session.match.result;
  if (session.mode === 'local') {
    const winner = result === 'win' ? 'Red' : 'Blue';
    const title = result === 'draw' ? 'A perfect tie.' : session.complete ? `${winner} wins the set!` : `${winner} earns a star!`;
    const copy = result === 'draw' ? 'No stars awarded. Replay this round.' : `Red ${session.stars[0]} - Blue ${session.stars[1]}. ${session.complete ? 'Two stars wins. Play another set?' : 'First to two stars wins the set.'}`;
    draw(); setOverlay('BEST OF THREE', title, copy, result === 'draw' ? 'Replay round' : session.complete ? 'Play another set' : 'Next round');
    return;
  }
  const series = session.mode === 'series', completed = session.complete;
  const title = result === 'draw' ? 'A perfect tie.' : result === 'loss' ? 'Blue takes it.' : series && completed ? 'Series cleared.' : 'Red takes it.';
  const copy = result === 'draw' ? 'Neither stack survived. Run that one back.' : result === 'loss' ? 'A little pressure builds a better player. Ready for another try?' : series && completed ? `You cleared all ${session.length} ${session.length === 1 ? 'level' : 'levels'}. Nicely stacked.` : series ? 'Good round. The next rival moves a little quicker.' : 'A clean win. Blue is ready for a rematch.';
  const action = result === 'draw' ? 'Replay match' : result === 'loss' ? 'Try again' : series && !completed ? 'Next level' : series ? 'Play series again' : 'Rematch';
  draw(); setOverlay(series ? `LEVEL ${session.level} / ${session.length}` : 'ROUND COMPLETE', title, copy, action);
}

function handleEvents(events) {
  for (const event of events) {
    renderers[event.player].react(event, session.match.tick);
    if (event.type === 'pop') audio.cue('pop', event.index);
    if (event.type === 'swap') audio.cue('swap');
    if (event.type === 'move') audio.cue('move');
    if (event.type === 'convert') audio.cue('convert', event.index);
    if (event.type === 'clear' && (event.count > 3 || event.chain > 1)) {
      audio.cue(event.chain > 1 ? 'chain' : 'attack');
      lastFeed = `${event.player === 0 ? 'RED' : 'BLUE'} · ${event.chain > 1 ? `CHAIN ×${event.chain}` : `${event.count} COMBO`}`;
      feedUntil = session.match.tick + 150;
    }
    if (event.type === 'land' && event.incoming) audio.cue('hit');
  }
}

function draw() {
  if (!session) return;
  const match = session.match;
  for (const [index, color] of ['red', 'blue'].entries()) {
    const board = match.boards[index], danger = board.occupiedHeight() >= 10;
    renderers[index].draw(board, match, settings.reduced, { visualTick, resultAge: resultAge ?? 0 });
    const packets = incomingPackets(match, index);
    $(color + '-incoming').hidden = packets.length === 0;
    if (incomingCounts[index] !== packets.length) {
      $(color + '-incoming').setAttribute('aria-label', `Incoming trash for ${color}: ${packets.length} blocks, ${packets.reduce((cells, packet) => cells + packet.width * packet.height, 0)} panels.`);
      if (packets.length > incomingCounts[index] && !match.result) audio.cue('incoming');
      incomingCounts[index] = packets.length;
    }
    $(color + '-score').textContent = board.score.toLocaleString();
    $(color + '-chain').textContent = board.bestChain > 1 ? `×${board.bestChain}` : '—';
    $(color + '-danger').hidden = !danger || !!match.result;
    $(color + '-status').textContent = match.result ? (match.result === 'draw' ? 'Draw.' : (match.result === 'win') === (index === 0) ? 'Round won.' : 'Next round is yours.') : danger ? 'Keep it below the line!' : board.stop ? 'Chain time. Keep building.' : index === 0 ? 'Make your move.' : 'Ready to rally.';
  }
  const seconds = Math.floor(match.tick / TICK_RATE);
  $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const feed = match.tick < feedUntil ? lastFeed : 'Build a chain.';
  if ($('attack-feed').textContent !== feed) $('attack-feed').textContent = feed;
  const danger = match.boards.some(board => board.occupiedHeight() >= 10);
  if (danger && !lastDanger && !match.result) audio.cue('danger');
  audio.danger = lastDanger = danger;
  drawBattleEffects($('battle-effects'), match, { introAge, resultAge, visualTick, reduced: settings.reduced });
  scene.drawBattle(match, sceneBuffers, { session, effects: $('battle-effects'), visualTick, reduced: settings.reduced, resultAge: resultAge ?? 0 });
  if ($('match-dialog').open) scene.drawDialog({ kicker: $('overlay-kicker').textContent, title: $('overlay-title').textContent, copy: $('overlay-copy').textContent, action: $('continue').textContent, focus: document.activeElement?.id || 'continue' });
}

function frame(now) {
  const delta = Math.max(0, Math.min(now - previous, 100)), elapsed = delta / 1000; previous = now;
  if (active()) {
    if (!resultShown) visualTick += elapsed * TICK_RATE;
    if (introAge < INTRO_TICKS) {
      accumulator += delta;
      while (accumulator >= 1000 / TICK_RATE && introAge < INTRO_TICKS) {
        for (const [player, input] of (session.mode === 'local' ? [controls, playerTwo] : [controls]).entries()) {
          const { move } = input.sample();
          if (move && session.match.boards[player].move(...move)) audio.cue('move');
        }
        introAge++;
        if (introAge === 48) { audio.cue('go'); $('battle-announcement').textContent = 'Go!'; }
        accumulator -= 1000 / TICK_RATE;
      }
      if (introAge >= INTRO_TICKS) $('battle-announcement').textContent = '';
    } else if (resultAge !== null && !resultShown) {
      const previousAge = resultAge;
      resultAge = Math.min(RESULT_TICKS, resultAge + elapsed * TICK_RATE);
      if (previousAge < 18 && resultAge >= 18 && session.match.result !== 'draw') audio.cue('star');
      if (resultAge >= RESULT_TICKS) showResult();
    } else if (running()) {
      accumulator += delta;
      while (accumulator >= 1000 / TICK_RATE && running()) {
        accumulator -= 1000 / TICK_RATE;
        handleEvents(session.match.step(controls.sample(), session.mode === 'local' ? playerTwo.sample() : {}));
        if (session.match.result) finish();
      }
    }
    draw();
  } else if (session && !$('game').hidden) {
    draw();
  }
  if (!$('menu').hidden) {
    frameTick += elapsed * TICK_RATE;
    drawMascot($('menu-red'), 0, frameTick, 'idle', settings.reduced);
    drawMascot($('menu-blue'), 1, frameTick + 25, 'idle', settings.reduced);
    scene.drawMenu({ setup: !$('cpu-setup').hidden, index: menuIndex, mode: new FormData($('setup')).get('mode'), difficulty: $('difficulty').value, length: $('length').value, mascots: [$('menu-red'), $('menu-blue')], focus: document.activeElement?.id });
  }
  const focus = document.activeElement?.id;
  if ($('settings-dialog').open) scene.drawSettings({ sound: settings.sound, volume: settings.volume, reduced: settings.reduced, rows: Object.entries(LABELS).map(([action,label])=>({action,label,key:keyLabel(settings.bindings[action])})), capture, message: storageFailed ? 'Settings cannot be saved in this browser.' : capture ? 'Press a key. Esc or Tab cancels.' : $('binding-message').textContent, focus });
  else if ($('help-dialog').open) scene.drawHelp({ move: ['up','left','down','right'].map(action=>keyLabel(settings.bindings[action])).join(''), swap: keyLabel(settings.bindings.swap), raise: keyLabel(settings.bindings.raise), focus });
  requestAnimationFrame(frame);
}

$('menu-one-player').addEventListener('click', () => showMenuPanel(true));
$('menu-two-player').addEventListener('click', () => {
  if (Object.values(settings.bindings).some(code => Object.values(PLAYER_TWO_BINDINGS).includes(code))) {
    $('binding-message').textContent = 'P1 / P2 keys overlap. Rebind or reset P1 keys.';
    fitScene(); $('settings-dialog').showModal(); return;
  }
  session = new Session({ mode: 'local' }); session.start(); startRound();
});
$('setup-back').addEventListener('click', () => showMenuPanel(false));
menuIds.forEach((id, index) => {
  $(id).addEventListener('focus', () => selectMenu(index));
  $(id).addEventListener('mouseenter', () => selectMenu(index));
});
$('setup').addEventListener('change', () => {
  const single = new FormData($('setup')).get('mode') !== 'series';
  $('length-field').hidden = single; $('length').disabled = single;
});
$('setup').addEventListener('submit', event => {
  event.preventDefault();
  try {
    session = new Session({ mode: new FormData($('setup')).get('mode'), difficulty: $('difficulty').value, length: Number($('length').value) });
    session.start(); $('setup-error').textContent = ''; startRound();
  } catch (error) { $('setup-error').textContent = error.message; }
});
$('pause').addEventListener('click', pauseGame);
$('leave').addEventListener('click', () => { pauseGame(); if (paused) setOverlay('LEAVE THIS ROUND?', 'Back to menu?', 'This round and any set or series progress will end.', 'Keep playing'); });
$('continue').addEventListener('click', () => {
  if (resultShown) { session.continue(); startRound(); }
  else resume();
});
$('overlay-menu').addEventListener('click', mainMenu);
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); if (active()) $('leave').click(); else if (session) $('overlay-menu').focus(); else mainMenu(); });
$('match-dialog').addEventListener('cancel', event => { event.preventDefault(); if (!resultShown) resume(); });

for (const name of ['help', 'settings']) {
  $(name + '-open').addEventListener('click', () => { pauseGame(); fitScene(); $(name + '-dialog').showModal(); });
  $(name + '-dialog').addEventListener('close', () => { capture = null; refreshBindings(); clearInputs(); });
}
$('game-settings').addEventListener('click', () => { pauseGame(); fitScene(); $('settings-dialog').showModal(); });
for (const button of document.querySelectorAll('[data-close]')) {
  button.id = button.dataset.close.replace('-dialog','') + (button.classList.contains('primary') ? '-done' : '-close');
  button.addEventListener('click', () => $(button.dataset.close).close());
}
async function setSound(enabled) {
  settings.sound = enabled; updateSettings(); save();
  if (enabled) await startAudio(); else audio.stop();
}
$('sound').addEventListener('click', () => { void setSound(!settings.sound); });
$('sound-setting').addEventListener('change', () => { void setSound($('sound-setting').checked); });
$('volume').addEventListener('input', () => { settings.volume = Number($('volume').value) / 100; audio.volume = settings.volume; audio.applyVolume(); save(); });
$('reduced').addEventListener('change', () => { settings.reduced = $('reduced').checked; save(); if (session) draw(); });
$('reset-controls').addEventListener('click', () => { capture = null; settings.bindings = { ...DEFAULT_BINDINGS }; clearInputs(); refreshBindings(); save(); $('binding-message').textContent = 'Default controls restored.'; });

window.addEventListener('keydown', event => {
  const code = normalizeKey(event.code);
  if (capture) {
    event.preventDefault();
    if (['Escape', 'Tab'].includes(code)) { capture = null; refreshBindings(); $('binding-message').textContent = 'Binding cancelled.'; return; }
    if (!bindable(code)) { $('binding-message').textContent = 'Use a letter, number, Space, Enter, or Shift.'; return; }
    if (session?.mode === 'local' && Object.values(PLAYER_TWO_BINDINGS).includes(code)) { $('binding-message').textContent = 'That key belongs to Player 2. Choose another.'; return; }
    if (Object.entries(settings.bindings).some(([action, binding]) => action !== capture && binding === code)) { $('binding-message').textContent = 'That key is already in use. Choose another.'; return; }
    settings.bindings[capture] = code; capture = null; clearInputs(); refreshBindings(); save();
    $('binding-message').textContent = 'Binding saved. Arrow keys also move. Escape always pauses.'; return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  const modalOpen = ['help-dialog', 'settings-dialog', 'match-dialog'].some(id => $(id).open);
  if (modalOpen && event.repeat && ['Enter', 'Space'].includes(code)) { event.preventDefault(); return; }
  if (!$('menu').hidden && !modalOpen) {
    if (code === 'Escape' && !$('cpu-setup').hidden) { event.preventDefault(); showMenuPanel(false); return; }
    if (!$('menu-home').hidden) {
      if (['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'].includes(code)) {
        event.preventDefault(); if (!event.repeat) selectMenu(menuIndex + (['KeyW', 'ArrowUp'].includes(code) ? -1 : 1), true); return;
      }
      if (code === 'Enter') { event.preventDefault(); if (!event.repeat) $(menuIds[menuIndex]).click(); return; }
    }
    if (code === 'Enter' && event.repeat) { event.preventDefault(); return; }
  }
  if (code === 'Escape' && active() && !resultShown) { event.preventDefault(); pauseGame(); return; }
  if (active() && !session.match.result && !modalOpen) for (const input of session.mode === 'local' ? [controls, playerTwo] : [controls]) {
    if (input.handles(code)) {
      event.preventDefault();
      if (introAge < INTRO_TICKS && [input.bindings.swap, input.bindings.raise].includes(code)) continue;
      if (!event.repeat) input.down(code);
    }
  }
});
window.addEventListener('keyup', event => { const code = normalizeKey(event.code); controls.up(code); playerTwo.up(code); });
window.addEventListener('resize', fitScene);
window.addEventListener('blur', () => { clearInputs(); pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInputs(); pauseGame(); } });
updateSettings();
showMenuPanel(false);
fitScene();
requestAnimationFrame(frame);
