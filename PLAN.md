# Block Attack implementation plan

Status: CPU and local two-player implementations are present. Direct menu, original presentation/audio,
single CPU matches, 1–10-level CPU series, best-of-three local sets with jumping victory stars,
settings, controls, and automated checks are implemented. LAN remains a future milestone.
See README.md for run instructions and current verification limits.
Presentation now uses one fixed 256 × 224 scene with integer nearest-neighbor scaling, native-size
96 × 192 boards and 16 × 16 panels, bitmap lettering, a compact SELECT menu/HUD, original pixel scenery,
and square Red/Blue trash-block mascots. Direct-file play is supported through the classic-script bundle.

## Goal and boundaries

Build an original browser puzzle battler in `C:\1TB\Workspaces\Websites\blockAttack`.
Use `C:\1TB\Workspaces\Websites\tetrisAttack` as a read-only source for reusable code and tests.
Keep the responsive swapping, rising-stack pressure, combos, chains, and back-and-forth attacks.
Give the game its own visual identity, music, menu, and progression rather than reproducing the old game's presentation.

- Player 1 is Red, on the left. Player 2 is Blue, on the right.
- CPU games: human is Red; CPU is Blue.
- Local games: first control set is Red; second is Blue.
- LAN games: host is Red; joining player is Blue.
- Open directly at the main menu. No splash, opening animation, sound popup, or “press any key” screen.
- Ship CPU single matches, CPU series of 1–10 levels, local two-player, and LAN two-player.
- Desktop keyboard play is the first release target. Keep menus usable with mouse and keyboard.

## What the source repo actually contains

Inspected November 3, 2026. The destination initially contains only `.git` and `.gitattributes`.

- `src/engine.js`: self-contained ES module with a seeded generator, 6 × 12 visible boards, 60 Hz simulation, swaps, gravity, rising, combos, chains, garbage, defeat, and CPU planning.
- `Match.step(input)` accepts human movement/swap/raise only for board 0 and always runs `Cpu.step()` for board 1. This is the main multiplayer seam to change.
- `CPU_PROFILES` already tunes reaction intervals, chain planning, and raising by difficulty and encounter. Reuse this before writing smarter AI.
- `src/main.js` couples input and screen navigation to title, campaign, map, dialogue, and results. Build a smaller controller rather than migrating that flow.
- `src/render.js` imports original panel sprites, character/result data, and scenery. Build a new Canvas renderer using engine state; do not copy this module wholesale.
- `src/audio.js`, `sound-data.js`, `music-data.js`, `result-actors-data.js`, `assets/`, and generated `game.js` include or reference source-game content. Exclude them from migration.
- `src/controls.js` provides useful binding validation and key labels, but its defaults overlap WASD and arrows for one player. Adapt for two independent players.
- Tests use built-in `node:test`; there are no package dependencies. The old server binds only to `127.0.0.1` and cannot serve another LAN device as written.
- The old bundler embeds recordings and the build copies broad asset directories. Replace these tools with packaging limited to the new game's files.
- The old `AGENTS.md` asks for original-game fidelity. Do not copy that direction into this project.

## Product decisions

### Menu and match flow

```text
Main menu
  1 Player
    Single Match: Easy / Normal / Hard, then Play
    CPU Series: Easy / Normal / Hard + length 1–10 (default 5), then Start
  2 Players
    Local: show both control sets, then Play
    LAN: Host / Join
  How to Play
  Settings: sound, volume, reduced effects, keyboard bindings
```

Starting a match also unlocks browser audio through that user gesture. If audio is unavailable,
the match still starts. Preserve an obvious mute button.

Every match shows both boards, Red/Blue labels, scores, danger, attack feedback, pause,
and the relevant bindings. End with a simple winner/draw panel and explicit next action.
Single/local/LAN matches offer Rematch and Main Menu; LAN rematches require both players ready.
Local versus uses best-of-three sets: one star per round win, first to two wins the set;
draws replay the round without changing either player's stars. A new set clears both counters.

CPU series shows `Level X / N`. A win advances; a loss offers retry of the same level or exit;
a draw offers replay of that level. The final win completes the series. New levels reset both boards
and scores; there are no lives, character selection, story maps, dialogue, or boss exceptions.
Keep series progress in memory for the first release; persist only settings and bindings.

### Rules and feel

Keep the current tested engine behavior as the initial baseline:

- Two-cell horizontal cursor; swap neighbors, including a panel and empty space where allowed.
- Match at least three equal panels horizontally or vertically.
- Larger clears create combos; falling panels can continue chains.
- Automatic rising and a manual raise control.
- Combos/chains send garbage; adjacent clears convert garbage into playable panels.
- Danger feedback and a grace period before topping out; simultaneous defeat is a draw.
- Fixed simulation clock independent of rendering and screen refresh rate.

Retain existing metal/special-panel behavior initially: removing it would change generation,
attacks, conversion, and several regression tests. Give it original symbols and sounds.
Do not spend the first release reproducing additional native frame timings or AI tables.
Tune only after the new game is playable; keep both human boards on identical rule settings.

### CPU difficulty and series

- Single Match uses the chosen difficulty's opening CPU profile.
- Series maps its first level to the opening profile and its final level to that difficulty's
  last existing profile. For length 1, use the opening profile and avoid division by zero.
- For length greater than 1, use profile index
  `round((level - 1) * (profileCount - 1) / (length - 1))`.
- Reaction intervals never increase as levels advance; chain planning and raising become
  more aggressive according to the existing profile thresholds. Repeated strength is acceptable
  where adjacent profiles already share parameters.
- Keep board timing and initial rise speed fixed within a series. Progression changes the CPU,
  not the human player's controls or rules.
- Replace encounter/boss names and comments with neutral level terminology when adapting code.

### Original presentation and audio

- Draw two square trash-block mascots from scratch: Red and Blue, with idle, attack, hit,
  win, and loss poses made from basic shapes. No character sprite pipeline is necessary.
- Use a colorful SNES-style console frame and beveled SELECT menu based on the clone's layout,
  with an original pixel garden, red/blue accents, readable panels, and restrained danger pulses.
- Create an original panel palette and symbol set. Pair color with distinct symbols;
  label players with both names/numbers and colors.
- Draw panels, cursor, garbage, mascots, and effects in Canvas/CSS. Use system fonts.
  Keep native HTML buttons, focus indicators, and accessible labels for menus.
- Compose one new looping electronic track with a higher-energy arrangement for danger,
  plus short original swap, clear, chain, attack, win, and loss cues using Web Audio.
  Do not reuse the source repo's melodies, recordings, voices, or audio fallback data.
- Reduced effects suppresses flashes and shake without changing simulation timing.
- Record provenance for every shipped asset or composition in `ASSETS.md`, including
  code-drawn/generated material. Review source-code provenance before copying it too.

This is an asset and design separation plan, not a legal clearance assessment.

### Local keyboard play

| Action | Red / Player 1 | Blue / Player 2 |
| --- | --- | --- |
| Move | W / A / S / D | I / J / K / L |
| Swap | Enter | Right Shift |
| Raise | Left Shift | Space |
| Pause / back | Escape | Escape |

- Use these non-overlapping defaults consistently across modes. LAN users control only their assigned board.
- Track held keys with `KeyboardEvent.code`; implement movement repeat on simulation ticks,
  not operating-system key repeat. Swap is an edge action; raising can be held.
- Reject conflicting bindings across both players, with one shared pause action.
- Clear held inputs on blur, pause, result, and screen changes so keys never remain stuck.
- Two USB keyboards work through the same key stream. They are not separately identified:
  players must use different bindings. Keyboard rollover varies; test simultaneous move/swap/raise
  on actual hardware and allow rebinding. One keyboard is also supported.

### LAN approach

Use one local Node server to serve the game and run authoritative matches over WebSocket.
One computer runs `npm run lan`; both players open its displayed private IPv4 address and port.
Host/Join happens in the browser; the browser host is not itself a network server.
Use one small server WebSocket dependency (`ws`) rather than implementing framing or WebRTC signaling.
Keep its installation and lockfile in the LAN milestone.

- Bind LAN mode to `0.0.0.0`; retain loopback-only binding for ordinary `npm run dev`.
  Print local URLs, and explain that the Windows firewall must allow the server on private networks.
- Host creates a two-seat room with a short room code. Join enters that code at the same server URL.
  Room codes are scoped to that running server. Both devices need to reach the same private network;
  a shared public internet connection or guest Wi-Fi does not guarantee this.
- Server assigns Red to room creator, Blue to joiner; both mark ready before the start countdown.
- Server runs the shared engine at 60 ticks/second. Both clients send ordered actions;
  server applies them on ticks. Clients render authoritative state, targeting 20 snapshots/second
  with visual interpolation. No client prediction or rollback for the first LAN release.
- Define an explicit plain-data render snapshot: tick, public board/cell/animation state,
  cursors, rise, garbage, pending attacks, scores, pause, and result. Do not attempt to restore
  engine instances or RNG closures from `JSON.stringify(match)`.
- Include room status, player readiness, and session/protocol version in messages.
  Bind each socket to its assigned seat; never trust a client-supplied player index, board state,
  score, result, or room membership.
- Validate message type, action enum, sequence, finite/bounded values, size, and rate.
  Cap rooms/connections; reject extra players and incompatible protocol versions.
  Serve only public game files with path traversal protection; keep repository metadata private.
  Check allowed browser origins for the local server.
- Either player may pause; both must agree to resume. A disconnect ends the active match
  with an opponent-disconnected message and returns the remaining player to the lobby.
  No automatic reconnection or mid-match recovery in this release.
- On focus loss, send input release and a pause request; on connection loss clear held server inputs.
  Do not auto-forfeit because a tab was briefly backgrounded.
- Static hosting can provide CPU/local play, but cannot run this LAN server. Public internet rooms,
  matchmaking, accounts, port forwarding, and relay hosting are outside this plan.

## Small implementation structure

Use plain JavaScript ES modules, Canvas, CSS, and Node's test runner. No UI framework or game engine.
Support direct `file://` CPU/local startup through a generated classic script; LAN still requires HTTP serving.

```text
index.html, style.css       Menu, two-board game view, lobby, results
src/engine.js              Adapted Board / Match / Cpu and rule constants
src/main.js                Screens, fixed-step loop, mode selection, series state
src/controls.js            Two-player key state, bindings, validation
src/render.js              Original Canvas drawing and effects
src/audio.js               New Web Audio compositions and cues
src/network.js             Browser room/session messages and snapshots
tools/serve.mjs            Static server, optional LAN rooms and authoritative loop
tools/build.mjs            Explicit static distribution allowlist
test/                     Retained engine tests plus focused new mode/network tests
package.json               dev, lan, test, build scripts
README.md, ASSETS.md        Setup, controls, LAN instructions, provenance
```

Keep small series state in `main.js` unless its size later warrants a separate module.
The shared match accepts two players' action objects and an explicit CPU/human opponent mode.
All modes use the same simulation path. CPU computes board 1 actions only in CPU mode;
local mode supplies both input sets; the LAN server supplies validated socket input.
Represent results by winner index or draw, then translate to labels per viewer.
Do not leave `win`/`loss` permanently tied to the Red player's perspective in LAN UI.

## Implementation order and acceptance gates

### 1. Selective migration and two-player engine seam

- Create package scripts and a small static server in the destination. Keep the source repo unchanged.
- Copy `engine.js` only after reviewing its provenance; retain relevant engine tests and their fixtures.
  Bring over mechanics suites for timing, speed, generation, attacks, conversions, chains, danger,
  and deterministic play. Check each test's imports rather than copying all tests blindly.
- Update `Match` constructor/step, every new caller, and affected tests for two input sets and
  optional CPU. Preserve attack scheduling, result cleanup, and fixed board processing order.
- Disable the Red-only tutorial opening in human-versus-human modes; give both players the same
  generation rules and starting conditions. Audit shared row-generation state before changing it.
- Keep the existing rule constants initially. Remove obsolete source-game references from copied code.
- Use new storage keys such as `blockAttack.original.settings.v1` and
  `blockAttack.original.controls.v1` so old campaign/settings data cannot silently configure this game.

Gate: retained mechanics tests pass; seeded matches repeat; either human can move, swap, raise,
send attacks, and lose; human modes never run CPU input; simultaneous defeat and post-result cleanup work.

### 2. Original presentation, menu, CPU single match and series

- Implement the direct-to-menu screen, original renderer/mascots, sound, instructions, settings,
  pause, and simple match results. Wire both boards to existing simulation events/state.
- Implement single-match difficulty and series length validation (integer 1–10), progression,
  retry, draw replay, completion, and exit.
- Build only the new public files; no copied asset directory, old bundle, soundtrack, or research output.

Gate: a fresh load shows the menu; CPU is always Blue; all three difficulties launch;
series lengths 1 and 10 finish correctly; CPU strength never decreases; retry does not skip a level;
sound unlocks on Play, mute/volume persist, and reduced effects preserves outcomes.
Use controller/audio tests and a browser smoke pass at a normal desktop and narrow window size.

### 3. Local multiplayer

- Connect both binding sets to the same match loop with CPU disabled.
- Add control hints, rebinding conflict checks, pause/resume, rematch, and result labels.

Gate: simultaneous inputs independently control both players; pressing one player's swap never
affects the other; held keys reset after blur/pause/rematch; attacks work both ways.
Verify one-keyboard and two-keyboard play manually, including rollover-sensitive combinations.

### 4. LAN multiplayer

- Add `ws`, LAN server mode, room creation/joining/readiness, authoritative ticking,
  input validation, render snapshots, lobby UI, pause, disconnect, and rematch handling.
- Update packaging/scripts/docs: static build stays suitable for CPU/local; LAN runs through Node.
- Test rooms with actual WebSocket clients: seat assignment, room full, bad code, invalid/versioned
  messages, duplicate/out-of-order actions, oversized floods, foreign-seat attempts,
  disconnect during countdown/game/pause, and room cleanup after both players leave.

Gate: two browsers on different devices on the same LAN complete a match and rematch;
host is Red, joiner Blue; both see the same authoritative winner and board state;
pausing/backgrounding does not produce stuck inputs or independent simulation drift.
Document real-device latency and verify private-network/firewall instructions.

### 5. Release check

- Run `npm test` and `npm run build` in `blockAttack`.
- Inspect the built file list and search source/output for old character names, asset paths,
  recordings, embedded audio data, and copied branding. Review what each match means;
  filename/text scans alone do not establish asset provenance.
- Confirm every asset is documented; visually and audibly inspect the shipped game.
- Verify keyboard focus, non-color player/panel identification, reduced effects, and storage failure.
- Verify static distribution works for CPU/local and LAN instructions work from a clean install.

Finish only when all three modes pass their gates. Do not treat LAN as an optional follow-up.

## Deliberately excluded

Story scenes, rescued characters, title cinematics, character selection, passwords, saved campaigns,
native-fidelity research, gamepad/touch expansion, spectators, chat, accounts, ranked play,
internet matchmaking, reconnect recovery, rollback netcode, multiple music libraries, and automatic LAN discovery.
The main remaining uncertainties are source-code provenance, real keyboard rollover,
LAN reachability, and real-device latency. Validate them at the relevant gates.
