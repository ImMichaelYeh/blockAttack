# Block Attack

An original rising-panel puzzle duel. In CPU mode, Red is you and Blue is the CPU.
Local and browser-to-browser LAN two-player let two humans play Red versus Blue, first to two victory stars.
The game starts directly at a SELECT menu inside an SNES-style console frame, with original
Red/Blue square trash-block mascots, original pixel scenery, licensed music, and synthesized sound effects.
Battle, menus, help, pause, and results render into one **256 × 224** bitmap.
Pause and round results use fuller pixel lettering and wrapped lines above the original buttons.
Settings uses readable monospace HTML lettering with a retro beveled frame and controls.
Settings scrolls on smaller screens so every control remains reachable.

## Run

**Double-click `index.html`** to play. Keep `game.js`, `style.css`, and the `assets/music/` folder beside it.
The classic script bundle works without ES-module requests, including direct local-file opening.
Menu audio unlocks after the first click or keypress; blocked local-file storage leaves settings in memory.

For an optional HTTP preview, use Node.js 22 or newer. No dependencies need installation.

```sh
npm run dev
```

Open **http://127.0.0.1:4173/blockAttack/**.
The preview binds only to this computer. Set `PORT` if 4173 is occupied.

## Play

- **Single match:** use −/+ to choose one of 10 custom CPU levels.
  Level 1 makes simple clears at a relaxed pace. Level 10 plans up to three swaps ahead,
  favors combos/cascades, and caps cursor moves/swaps at six actions per second.
- **CPU series:** choose EASY (10 levels), NORMAL (11), or HARD (12).
  Route timing/speed stays unchanged; CPU strength progresses through custom levels
  1–4 on Easy, 3–7 on Normal, and 6–10 on Hard.
  A win advances; a loss retries; a draw replays. The final win completes the series.
- **2 Player Game:** opens an in-frame setup screen, like 1 Player, with **Local** (one computer)
  or **LAN** (two browsers). Back/Escape returns to the previous menu; LAN pairing scrolls within the frame.
  Local setup has separate Red/Blue levels from **1–10**, adjustable with −/+.
  LAN players each choose their own level before creating an invitation or answer.
  Native two-player settings control rise speed, hover/clear timing, stop/grace and row generation;
  levels **9–10** include a sixth ordinary block: a dark blue inverted triangle. Gray **!** blocks
  stay separate. The LEVEL row shows each player's selected level, retained across rounds and sets.
  See [verified two-player settings](docs/VERSUS_LEVELS.md) for exact values and verification limits.
  Each round winner earns one star;
  first to two wins the set. Draws award no stars and replay the same round. Choose
  **Next round** to continue or **Play another set** after a set winner to reset both star counts.
  The 2P POINT row keeps running win totals across sets until returning to the main menu.
  Both players use the same board rules; neither board is controlled by a CPU.
- **LAN:** both players open this version of the game on the same network. Choose **2 Player Game → LAN**.
  The host chooses **Host game**, selects/copies the invitation code and sends it to the joining player.
  The joiner chooses **Join game**, pastes that invitation and chooses **Create answer**.
  They send the resulting answer code back; the host pastes it and chooses **Connect**.
  The countdown starts on both computers. Host is Red, joiner is Blue, and each uses their own
  Player 1 controls. “YOU” marks your character. The host starts subsequent rounds and sets.
  Either player can pause; each player who paused must resume before play continues.
  Closing/leaving a game or losing the connection ends that LAN session; create new codes to reconnect.
  Codes are for one connection and must be copied in full. Current browsers compress them locally
  into shorter `BA2Z.` codes. Full `BA2.` codes are still accepted; wrapped/pasted line breaks are
  ignored. Both players still exchange an invitation and an answer. Compression does not provide
  four-character room lookup. No Node game server, accounts, public signaling service, STUN/TURN
  service or external runtime requests are required. Both browsers run
  the same simulation with ordered inputs and a three-tick input buffer; periodic checks stop a
  session if states diverge. Guest Wi-Fi/client isolation, VPNs or firewalls can prevent a direct link.
  Older invitation/answer codes are incompatible with the new level-aware protocol; generate fresh codes.
- **Menu:** W/S or arrows select; Enter confirms; Escape goes back from CPU setup.
- **Player 1 controls:** WASD or arrows move, **Enter** swaps, **Left Shift** raises, **Escape** pauses.
  Settings lets you rebind the six gameplay actions. Arrows and Escape remain available.
  Numpad Enter also swaps. Cursor timing matches the previous clone: immediate movement,
  ten-tick delay, then every-tick repeat, with Up/Down/Left/Right priority instead of diagonal movement.
- **Player 2 controls:** IJKL move, **Right Shift** swaps, **Space** raises in local mode.
  P1's arrow alternatives do not move P2. Old untouched P1 defaults upgrade
  from F to Enter and G to Left Shift; custom bindings stay intact.
- Match 3+ horizontally/vertically. Clear 4+ for combos; falling matches form chains.
  Combos/chains send garbage to your opponent. Match beside garbage to convert it back into panels.
  Special **!** panels send metal garbage. Keep the rising stack below the ceiling.
- Settings includes mute, volume, and reduced effects; these and bindings save in browser storage.
  Audio unlocks when you press Play. If audio or storage is unavailable, play still works.
  Leaving the tab pauses the game. Series progress lasts only for the current visit.
  Local sets also last only for the current visit; returning to the menu ends the set.
- One or two keyboards can be used. Browsers merge their key events, so players use different
  bindings. Local play rejects P1 bindings that overlap P2's keys. Hardware rollover needs a physical playtest.

## Battle presentation

- One fixed NTSC-sized **256 × 224** scene scales by whole-number steps (1×, 2×, 3×, etc.) to fit
  the window. The display preserves 8:7 geometry and disables image smoothing.
- Two 96 × 192 playfields use 16 × 16 panels at `(8, 24)` and `(152, 24)`, with a 48-pixel center
  panel with a shared gold frame for the characters, POINT (2P) or STAGE (1P), LEVEL, TIME,
  and 16-pixel victory stars. Single player has one star row; local play has a 2×2 grid.
  Scores and incoming trash sit at the top.
- Saturated red-heart, yellow-star, green-circle, cyan-triangle, purple-diamond, and gray-! panels
  use newly drawn pixel masks and beveled edges. Original bitmap lettering is used throughout the canvas.
  Menus use the clone's compact SELECT arrangement; battles use a shaded forest backdrop.
- The scene comes from Canvas, while Settings uses readable HTML text. Native HTML controls supply mouse hit areas,
  keyboard focus, form validation, and accessible labels for the bitmap menus. Pause/settings/menu
  utility buttons remain outside the game frame, along with the sound toggle.
- Combo/chain cards appear beside the panels that cleared and float upward from that spot.
  They follow stack rise, stay within the board, and remain stationary with reduced effects.
- Original small, wide/tall, and metal trash icons appear above each board after the attack flight arrives,
  including packets waiting for space to spawn. Small attacks show groups of miniature blocks; tall attacks
  show a height multiplier; long queues show an overflow count. The strip stays clear between attacks;
  board names, scores, and the CPU VS / 1 MATCH header are omitted. Admitted trash replaces its icon.
  Attack trails fly between boards. Heavy landings shake the stack and throw up a brief impact burst.
- Red and Blue sit together in the center with idle, attack, hit, win, and loss reactions.
- Small golden stars with tall blinking eyes continuously bounce straight up and down after being earned,
  accompanied by a sparkle cue when awarded. Local mode shows two star slots per player and keeps earned stars
  between rounds. CPU wins also show the new celebration without changing CPU match/series rules.
  Reduced effects displays a stationary star with open eyes.
- A short curtain/READY/GO transition precedes each round. Simulation starts after GO.
  Cursor positioning is allowed during READY while swaps, raising, and board physics remain frozen.
  Results freeze simulation while loss columns fall away, winner panels clear, and a celebration plays;
  the retry/next-level menu follows after 2.5 seconds. Presentation never alters the stored board state.
- Newly synthesized movement, conversion, incoming, impact, danger, start, and result cues complement
  the recorded music. Sound effects use no extracted game recordings.
  Red has a warm, bold attack call; Blue has a playful two-syllable call. Voices briefly lower the
  backing music, take turns during simultaneous attacks, and share a soft arcade instrument palette.
  Quiet interaction cues and duplicate-event limits keep busy battles from becoming a wall of sound.
- Menu music is **Puzzle Menu** by caret7; gameplay is **Long Summer Nights** by David KBD.
  Critical play uses the same track at 1.4x speed with pitch preservation and a restrained heartbeat.
  It follows the shaking threshold of ten settled rows on either board in all modes,
  returning to normal below that height. Music pauses/resumes with the game and dips during attack calls.
  Both tracks are CC BY 4.0; full attribution is available from the **Music credits** footer link.
- Reduced effects keeps timing and indicators while removing shakes, trails, flashing, confetti, and cascades.

## Check and build

```sh
npm test
npm run build
```

Publish `dist/` on a static host if desired. All runtime paths are relative, including at a project subpath.
After editing `src/`, run `npm run bundle` to update `game.js` for direct-file play.
The preview server and build regenerate the bundle automatically when starting.
The build includes only `index.html`, `style.css`, and `game.js`;
it excludes tests, fixtures, tools, plans, and unbundled modules.
Nothing is pushed or deployed by these commands.

[Mechanics comparison](docs/MECHANICS_PARITY.md) records the audit against `../tetrisAttack`,
the cursor fixes, and ten captured reference replays that verify engine state/event parity.
It also records the native hover-swap correction: rapid swaps no longer restart an unsupported
block's hover delay or carry it sideways during that delay. Four captured SNES traces cover this case.

Automated checks cover retained engine mechanics, seeded play, legal CPU battles, series lengths 1–10,
retry/draw/completion, input repeat/rebinding, controller navigation/pause/results, audio cleanup,
local dual input/attacks, 2–0 and 2–1 sets, duplicate-result protection, draws, set resets, victory stars,
LAN invitation validation, ordered inputs, delayed delivery, shared pauses, state checks and disconnects,
preview-server file restrictions, native dimensions, integer pixel drawing/scaling, presentation isolation,
incoming attacks, effect cleanup,
and executing the exact direct-file classic bundle with storage blocked.
In-memory controller checks do not substitute for browser QA.
Native-resolution and 3× offline raster previews were generated from the scene renderer and visually inspected.
`node tools/verify-lan.mjs` runs two game documents in isolated headless Chrome with a real WebRTC
connection: pairing, bad codes, synchronized play, pause/resume, results, next round and disconnect.
Add `--file` to exercise direct-file game documents through the same real WebRTC flow.
Set `CHROME` to the browser executable if needed. This checks two documents on one computer;
two physical LAN devices, audible balance, and physical keyboard feel still need a playtest.

## Scope and source

CPU, local two-player and browser-to-browser LAN modes are implemented.
See [PLAN.md](PLAN.md) for the full roadmap and [ASSETS.md](ASSETS.md) for provenance.

The sibling `../tetrisAttack` repository was used read-only for engine code and mechanics regression tests.
Its character assets, sprites, scenery, soundtrack, voices, story flow, and generated bundle are excluded.
The inherited mechanics are an existing approximation; this release does not claim native frame accuracy.
