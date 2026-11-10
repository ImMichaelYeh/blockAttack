import { TICK_RATE } from './engine.js';
import { Session, SINGLE_LEVELS } from './session.js';
import { Controls, DEFAULT_BINDINGS, PLAYER_TWO_BINDINGS, LABELS, bindable, restoreBindings, keyLabel, normalizeKey } from './controls.js';
import { BoardRenderer, SceneRenderer, drawMascot, drawBattleEffects } from './render.js';
import { INTRO_TICKS, RESULT_TICKS, incomingPackets, sceneScale, boardInDanger } from './presentation.js';
import { AudioPlayer } from './audio.js';
import { LanPeer } from './lan.js';

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
let lan = null;
let introAge = INTRO_TICKS, resultAge = null, resultShown = false, visualTick = 0, lastDanger = false;
let incomingCounts = [0, 0];
let lastFeed = '', feedUntil = 0;
const menuIds = ['menu-one-player', 'menu-two-player', 'help-open', 'settings-open'];
const menuDescriptions = ['Let\'s make a chain! Red vs. Blue. Ready?', 'Two players: local or LAN. First to two stars wins!', 'A few little tips for some big comebacks!', 'Your keys. Your sound. Your kind of fun!'];
let menuIndex = 0;
const active = () => session?.match && !paused && !$('game').hidden;
const running = () => active() && !session.match.result && introAge >= INTRO_TICKS;

function fitScene() {
  const scale = sceneScale(window.innerWidth || 1024, window.innerHeight || 900);
  $('scene-viewport').setAttribute('style', `--scale:${scale}`);
  const bounds = $('scene-viewport').getBoundingClientRect?.();
  if (bounds) for (const id of ['match-dialog','help-dialog']) $(id).setAttribute('style', `--scale:${scale};left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px`);
}

function selectMenu(index, focus = false) {
  if ((index + menuIds.length) % menuIds.length !== menuIndex) audio.cue('menu');
  menuIndex = (index + menuIds.length) % menuIds.length;
  menuIds.forEach((id, position) => $(id).setAttribute('aria-current', String(position === menuIndex)));
  $('menu-description').textContent = menuDescriptions[menuIndex];
  if (focus) $(menuIds[menuIndex]).focus();
}

function showMenuPanel(setup) {
  $('multiplayer-screen').hidden = true;
  $('menu-home').hidden = setup; $('cpu-setup').hidden = !setup;
  $('setup-error').textContent = '';
  if (setup) (new FormData($('setup')).get('mode') === 'series' ? $('difficulty-' + $('difficulty').value) : $('level')).focus(); else selectMenu(0, true);
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
  $('top-volume').value = Math.round(settings.volume * 100);
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
  $('p2-controls').textContent = lan ? 'LAN: both players use their own Player 1 bindings. Host is Red; joining player is Blue.' : `Local Player 2: ${['up', 'left', 'down', 'right'].map(action => keyLabel(PLAYER_TWO_BINDINGS[action])).join(' ')} to move, ${keyLabel(PLAYER_TWO_BINDINGS.swap)} to swap, ${keyLabel(PLAYER_TWO_BINDINGS.raise)} to raise.`;
}

async function startAudio(ready = false) {
  if (!settings.sound || document.hidden) return;
  const intendedMatch = session?.match;
  await audio.unlock();
  if (!settings.sound || document.hidden || intendedMatch !== session?.match) return;
  if (active() && !session.match.result) { audio.start('game', ready); if (ready) audio.cue('ready'); }
  else if (!session) audio.start('menu');
}

function startRound() {
  paused = false; accumulator = 0; previous = performance.now(); clearInputs(); audio.stop();
  introAge = 0; resultAge = null; resultShown = false; visualTick = 0; lastDanger = false; incomingCounts = [0, 0];
  for (const renderer of renderers) renderer.reset();
  $('menu').hidden = true; $('game').hidden = false;
  $('multiplayer-screen').hidden = true;
  $('game-tools').hidden = false;
  if ($('match-dialog').open) $('match-dialog').close();
  $('match-title').textContent = lan ? `LAN versus · Round ${session.round} · You are ${lan.host ? 'Red' : 'Blue'} · First to 2 stars` : session.mode === 'local' ? `Local versus · Round ${session.round} · First to 2 stars` : session.mode === 'series' ? `CPU series · Level ${session.level} / ${session.length}` : 'Single match';
  $('blue-board').setAttribute('aria-label', lan ? 'Blue board. Joining player uses their own Player 1 controls.' : session.mode === 'local' ? 'Player 2 board. IJKL move, Right Shift swaps, Space raises, Escape pauses.' : 'CPU board');
  $('difficulty-label').textContent = session.mode === 'local' ? `Levels ${session.levels.join(' / ')}` : session.difficulty.toUpperCase();
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
  if (lan && session && !resultShown) { lan.setPaused(true); return; }
  if (!active() || resultShown) return;
  paused = true; clearInputs(); accumulator = 0; audio.stop();
  setOverlay('TAKE A BREATHER', 'Paused.', 'The stack can wait. Resume when you are ready.', 'Resume');
}

function resume(network = false) {
  if (!session || resultShown) return;
  if (lan && !network) { lan.setPaused(false); return; }
  paused = false; clearInputs(); accumulator = 0; previous = performance.now();
  $('match-dialog').close(); $('red-board').focus(); void startAudio();
}

function mainMenu() {
  closeLan();
  audio.stop(); clearInputs(); session = null; paused = false; accumulator = 0;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('menu').hidden = false; $('game').hidden = true;
  $('game-tools').hidden = true;
  refreshBindings();
  showMenuPanel(false);
  void startAudio();
}

function finish() {
  audio.stop(); clearInputs();
  resultAge = 0;
  session.recordResult();
  audio.cue(session.match.result === 'draw' ? 'draw' : session.match.result === 'win' ? 'red-win' : 'blue-win');
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
    if (lan && !lan.host) $('continue').textContent = 'Wait for host';
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
    if (event.type === 'clear' && (event.count > 3 || event.chain > 1 || event.shocks >= 3)) {
      audio.cue(event.chain > 1 ? 'chain' : 'attack', event.chain > 1 ? event.chain : event.count, event.player);
      lastFeed = `${event.player === 0 ? 'RED' : 'BLUE'} · ${event.chain > 1 ? `CHAIN ×${event.chain}` : `${event.count} COMBO`}`;
      feedUntil = session.match.tick + 150;
    }
    if (event.type === 'land' && event.incoming) audio.cue('hit');
  }
}

function draw() {
  if (!session) return;
  const match = session.match;
  $('match-points').textContent = session.mode === 'local' ? `Total rounds won: Red ${session.points[0]}, Blue ${session.points[1]}.` : '';
  for (const [index, color] of ['red', 'blue'].entries()) {
    const board = match.boards[index], danger = boardInDanger(board);
    renderers[index].draw(board, match, settings.reduced, { visualTick, resultAge: resultAge ?? 0 });
    const packets = incomingPackets(match, index);
    $(color + '-incoming').hidden = packets.length === 0;
    if (incomingCounts[index] !== packets.length) {
      $(color + '-incoming').setAttribute('aria-label', `Incoming trash for ${color}: ${packets.length} blocks, ${packets.reduce((cells, packet) => cells + packet.width * packet.height, 0)} blocks.`);
      if (packets.length > incomingCounts[index] && !match.result) audio.cue('incoming');
      incomingCounts[index] = packets.length;
    }
    $(color + '-chain').textContent = board.bestChain > 1 ? `×${board.bestChain}` : '—';
    $(color + '-danger').hidden = !danger || !!match.result;
    $(color + '-status').textContent = match.result ? (match.result === 'draw' ? 'Draw.' : (match.result === 'win') === (index === 0) ? 'Round won.' : 'Next round is yours.') : danger ? 'Keep it below the line!' : board.stop ? 'Chain time. Keep building.' : index === 0 ? 'Make your move.' : 'Ready to rally.';
  }
  const seconds = Math.floor(match.tick / TICK_RATE);
  $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const feed = match.tick < feedUntil ? lastFeed : 'Build a chain.';
  if ($('attack-feed').textContent !== feed) $('attack-feed').textContent = feed;
  const danger = !match.result && match.boards.some(boardInDanger);
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
    if (lan && (introAge < INTRO_TICKS || running())) {
      const peer = lan;
      accumulator = Math.min(accumulator + delta, 100);
      while (accumulator >= 1000 / TICK_RATE && active() && !session.match.result) {
        if (peer.needsInput) peer.queueInput(controls.sample());
        const inputs = peer.takeInput();
        if (!inputs) break;
        accumulator -= 1000 / TICK_RATE;
        if (introAge < INTRO_TICKS) {
          inputs.forEach((input, player) => { if (input.move && session.match.boards[player].move(...input.move)) audio.cue('move'); });
          introAge++;
          if (introAge === 48) { audio.cue('go'); $('battle-announcement').textContent = 'Go!'; }
          if (introAge === INTRO_TICKS) $('battle-announcement').textContent = '';
        } else {
          handleEvents(session.match.step(...inputs));
          if (session.match.result) finish();
        }
        peer.verify({ match: session.match, stars: session.stars, points: session.points, introAge });
      }
      if (!session) { requestAnimationFrame(frame); return; }
    } else if (introAge < INTRO_TICKS) {
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
    scene.drawMenu({ setup: !$('cpu-setup').hidden, multiplayer: !$('multiplayer-screen').hidden, redLevel: $('local-red-level').value, blueLevel: $('local-blue-level').value, error: $('local-level-error').textContent, index: menuIndex, mode: new FormData($('setup')).get('mode'), difficulty: $('difficulty').value, level: $('level').value, mascots: [$('menu-red'), $('menu-blue')], focus: document.activeElement?.id });
  }
  const focus = document.activeElement?.id;
  if ($('help-dialog').open && !$('settings-dialog').open) scene.drawHelp({ move: ['up','left','down','right'].map(action=>keyLabel(settings.bindings[action])).join(''), swap: keyLabel(settings.bindings.swap), raise: keyLabel(settings.bindings.raise), focus });
  audio.updateMusic();
  requestAnimationFrame(frame);
}

function closeLan() {
  const peer = lan; lan = null; peer?.close();
}

function showLanLobby() {
  $('multiplayer-screen').hidden = false; $('multiplayer-screen').setAttribute('data-lan','true');
  $('menu-home').hidden = $('cpu-setup').hidden = true;
  $('multiplayer-title').textContent = 'LAN game';
  $('multiplayer-choice').hidden = true; $('lan-lobby').hidden = false;
  $('lan-setup').hidden = true; $('lan-status').textContent = '';
  $('lan-host').disabled = $('lan-join').disabled = false;
  for (const id of ['lan-level','lan-level-down','lan-level-up']) $(id).disabled = false;
}

function readVersusLevel(id) {
  const level = Number($(id).value);
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('Choose a player level from 1 to 10.');
  return level;
}

function createLan(host) {
  const level = readVersusLevel('lan-level');
  closeLan();
  const peer = new LanPeer(host, {
    level,
    onready: () => {
      if (lan !== peer) return;
      if (host) peer.startRound(Date.now() >>> 0);
      else $('lan-status').textContent = 'Connected. Waiting for the host to start…';
    },
    onstart: (seed, levels) => {
      if (lan !== peer) return;
      if (session) session.continue(seed);
      else { session = new Session({ mode: 'local', levels }); session.start(seed); }
      session.networkPlayer = host ? 0 : 1;
      refreshBindings(); startRound();
    },
    onpause: waiting => {
      if (lan !== peer || !session || resultShown) return;
      if (waiting) {
        paused = true; clearInputs(); accumulator = 0; audio.stop();
        setOverlay('LAN GAME', 'Paused.', peer.localPaused ? 'Resume when you are ready. Both players must be ready.' : 'The other player paused. Waiting for them to resume.', 'Resume');
      } else resume(true);
    },
    onerror: message => {
      if (lan !== peer) return;
      mainMenu(); showLanLobby(); $('lan-status').textContent = message;
    },
  });
  lan = peer;
  $('lan-host').disabled = $('lan-join').disabled = true;
  for (const id of ['lan-level','lan-level-down','lan-level-up']) $(id).disabled = true;
  $('lan-setup').hidden = false; $('lan-outgoing-area').hidden = true;
  $('lan-incoming-area').hidden = false;
  $('lan-incoming').value = $('lan-outgoing').value = '';
  $('lan-incoming-label').textContent = host ? '2. Paste the joining player’s answer' : '1. Paste the host’s invitation';
  $('lan-connect').textContent = host ? 'Connect' : 'Create answer';
  $('lan-connect').disabled = host;
  $('lan-status').textContent = host ? 'Creating your invitation…' : 'Paste the invitation from the host, then choose Create answer.';
  return peer;
}

$('multiplayer-lan').addEventListener('click', showLanLobby);
$('lan-host').addEventListener('click', async () => {
  let peer;
  try {
    peer = createLan(true);
    const code = await peer.invite();
    if (lan !== peer) return;
    $('lan-outgoing').value = code; $('lan-outgoing-area').hidden = false;
    $('lan-outgoing-label').textContent = '1. Send this invitation to the joining player';
    $('lan-connect').disabled = false;
    $('lan-status').textContent = 'Send the entire invitation code. Paste their answer below and choose Connect.';
  } catch (error) {
    if (peer && lan !== peer) return;
    closeLan(); showLanLobby(); $('lan-status').textContent = error.message;
  }
});
$('lan-join').addEventListener('click', () => {
  try { createLan(false); }
  catch (error) { showLanLobby(); $('lan-status').textContent = error.message; }
});
$('lan-connect').addEventListener('click', async () => {
  const peer = lan;
  if (!peer) return;
  $('lan-connect').disabled = true;
  try {
    if (peer.host) {
      await peer.accept($('lan-incoming').value);
      if (lan === peer && !session) $('lan-status').textContent = 'Connecting directly to the other browser…';
    } else {
      const code = await peer.answer($('lan-incoming').value);
      if (lan !== peer) return;
      $('lan-outgoing').value = code; $('lan-outgoing-area').hidden = false;
      $('lan-outgoing-label').textContent = '2. Send this answer back to the host';
      $('lan-status').textContent = 'Send the entire answer code to the host. The match starts when they connect.';
    }
  } catch (error) {
    if (lan !== peer) return;
    $('lan-status').textContent = error.message; $('lan-connect').disabled = false;
  }
});
$('lan-select-code').addEventListener('click', () => { $('lan-outgoing').focus(); $('lan-outgoing').select(); });
function showMultiplayer() {
  closeLan();
  $('menu-home').hidden = $('cpu-setup').hidden = true;
  $('multiplayer-screen').hidden = false; $('multiplayer-screen').setAttribute('data-lan','false');
  $('multiplayer-title').textContent = '2 Player Game';
  $('multiplayer-choice').hidden = false; $('lan-lobby').hidden = true;
  $('local-level-error').textContent = '';
  $('multiplayer-local').focus();
}
$('lan-back').addEventListener('click', showMultiplayer);
$('multiplayer-close').addEventListener('click', () => {
  if (!$('lan-lobby').hidden) showMultiplayer(); else { closeLan(); showMenuPanel(false); }
});

$('menu-one-player').addEventListener('click', () => showMenuPanel(true));
$('menu-two-player').addEventListener('click', showMultiplayer);
$('multiplayer-local').addEventListener('click', () => {
  let levels;
  try { levels = [readVersusLevel('local-red-level'), readVersusLevel('local-blue-level')]; }
  catch (error) { $('local-level-error').textContent = error.message; return; }
  if (Object.values(settings.bindings).some(code => Object.values(PLAYER_TWO_BINDINGS).includes(code))) {
    $('binding-message').textContent = 'P1 / P2 keys overlap. Rebind or reset P1 keys.';
    fitScene(); $('settings-dialog').showModal(); return;
  }
  session = new Session({ mode: 'local', levels }); session.start(); startRound();
});
for (const id of ['local-red-level','local-blue-level','lan-level']) for (const [suffix, step] of [['down',-1],['up',1]]) {
  $(id+'-'+suffix).addEventListener('click', () => {
    $(id).value = Math.max(1, Math.min(10, (Number($(id).value) || 4) + step));
    audio.cue('menu');
  });
}
$('setup-back').addEventListener('click', () => showMenuPanel(false));
menuIds.forEach((id, index) => {
  $(id).addEventListener('focus', () => selectMenu(index));
  $(id).addEventListener('mouseenter', () => selectMenu(index));
});
$('setup').addEventListener('change', () => {
  const single = new FormData($('setup')).get('mode') !== 'series';
  $('difficulty-field').hidden = single; $('level-field').hidden = !single; $('level').disabled = !single;
});
for (const difficulty of ['easy', 'normal', 'hard']) $('difficulty-' + difficulty).addEventListener('click', () => {
  $('difficulty').value = difficulty;
  for (const value of ['easy', 'normal', 'hard']) $('difficulty-' + value).setAttribute('aria-pressed', String(value === difficulty));
  audio.cue('menu');
});
for (const [id, step] of [['level-down', -1], ['level-up', 1]]) $(id).addEventListener('click', () => {
  $('level').value = Math.max(1, Math.min(SINGLE_LEVELS.length, (Number($('level').value) || 1) + step));
  audio.cue('menu');
});
$('setup').addEventListener('submit', event => {
  event.preventDefault();
  try {
    session = new Session({ mode: new FormData($('setup')).get('mode'), difficulty: $('difficulty').value, level: Number($('level').value) });
    session.start(); $('setup-error').textContent = ''; startRound();
  } catch (error) { $('setup-error').textContent = error.message; }
});
$('pause').addEventListener('click', pauseGame);
$('leave').addEventListener('click', () => { pauseGame(); if (paused) setOverlay('LEAVE THIS ROUND?', 'Back to menu?', 'This round and any set or series progress will end.', 'Keep playing'); });
$('continue').addEventListener('click', () => {
  if (resultShown && lan) { if (lan.host) lan.startRound(Date.now() >>> 0); }
  else if (resultShown) { session.continue(); startRound(); }
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
for (const id of ['volume', 'top-volume']) $(id).addEventListener('input', () => {
  settings.volume = Number($(id).value) / 100;
  $('volume').value = $('top-volume').value = Math.round(settings.volume * 100);
  audio.volume = settings.volume; audio.applyVolume(); save();
});
$('top-volume').addEventListener('focus', clearInputs);
$('reduced').addEventListener('change', () => { settings.reduced = $('reduced').checked; save(); if (session) draw(); });
$('reset-controls').addEventListener('click', () => { capture = null; settings.bindings = { ...DEFAULT_BINDINGS }; clearInputs(); refreshBindings(); save(); $('binding-message').textContent = 'Default controls restored.'; });

window.addEventListener('keydown', event => {
  const code = normalizeKey(event.code);
  if (capture) {
    event.preventDefault();
    if (['Escape', 'Tab'].includes(code)) { capture = null; refreshBindings(); $('binding-message').textContent = 'Binding cancelled.'; return; }
    if (!bindable(code)) { $('binding-message').textContent = 'Use a letter, number, Space, Enter, or Shift.'; return; }
    if (!lan && session?.mode === 'local' && Object.values(PLAYER_TWO_BINDINGS).includes(code)) { $('binding-message').textContent = 'That key belongs to Player 2. Choose another.'; return; }
    if (Object.entries(settings.bindings).some(([action, binding]) => action !== capture && binding === code)) { $('binding-message').textContent = 'That key is already in use. Choose another.'; return; }
    settings.bindings[capture] = code; capture = null; clearInputs(); refreshBindings(); save();
    $('binding-message').textContent = 'Binding saved. Arrow keys also move. Escape always pauses.'; return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  if (event.target?.id === 'top-volume' && code !== 'Escape') return;
  const modalOpen = ['help-dialog', 'settings-dialog', 'match-dialog'].some(id => $(id).open);
  if (modalOpen && event.repeat && ['Enter', 'Space'].includes(code)) { event.preventDefault(); return; }
  if (!$('menu').hidden && !modalOpen) {
    if (code === 'Escape' && !$('multiplayer-screen').hidden) {
      event.preventDefault(); $('multiplayer-close').click();
      return;
    }
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
  if (active() && !session.match.result && !modalOpen) for (const input of !lan && session.mode === 'local' ? [controls, playerTwo] : [controls]) {
    if (input.handles(code)) {
      event.preventDefault();
      if (introAge < INTRO_TICKS && [input.bindings.swap, input.bindings.raise].includes(code)) continue;
      if (!event.repeat) input.down(code);
    }
  }
});
window.addEventListener('keyup', event => { const code = normalizeKey(event.code); controls.up(code); playerTwo.up(code); });
window.addEventListener('resize', fitScene);
const unlockMenuAudio = () => { if (!session) void startAudio(); };
window.addEventListener('pointerdown', unlockMenuAudio);
window.addEventListener('keydown', unlockMenuAudio);
window.addEventListener('focus', unlockMenuAudio);
window.addEventListener('blur', () => { clearInputs(); pauseGame(); audio.stop(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInputs(); pauseGame(); audio.stop(); }
  else unlockMenuAudio();
});
updateSettings();
showMenuPanel(false);
fitScene();
requestAnimationFrame(frame);
