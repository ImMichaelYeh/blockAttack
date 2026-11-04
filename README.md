# Block Attack

An original rising-panel puzzle duel. In CPU mode, Red is you and Blue is the CPU.
Local two-player lets two humans play Red versus Blue, first to two victory stars.
The game starts directly at a SELECT menu inside an SNES-style console frame, with original
Red/Blue square trash-block mascots, original pixel scenery, and newly composed synthesized music.
Battle, menus, help, settings, pause, and results all render into one **256 × 224** bitmap.

## Run

**Double-click `index.html`** to play. Keep `game.js` and `style.css` beside it.
The classic script bundle works without ES-module requests, including direct local-file opening.
Audio unlocks after Play; blocked local-file storage simply leaves settings in memory.

For an optional HTTP preview, use Node.js 22 or newer. No dependencies need installation.

```sh
npm run dev
```

Open **http://127.0.0.1:4173/blockAttack/**.
The preview binds only to this computer. Set `PORT` if 4173 is occupied.

## Play

- **Single match:** select Easy, Normal, or Hard and play one CPU battle.
- **CPU series:** select difficulty and 1–10 levels (default 5). CPU reaction and strategy progress
  across the existing difficulty profiles. A win advances; a loss retries; a draw replays.
  The final win completes the series. Scores/boards reset each match.
- **2 Player Game:** starts a local best-of-three set. Each round winner earns one star;
  first to two wins the set. Draws award no stars and replay the same round. Choose
  **Next round** to continue or **Play another set** after a set winner to reset both star counts.
  Both players use the same board rules; neither board is controlled by a CPU.
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
  column for the characters, round, difficulty, time, and victory stars. The bottom R/B chain panel is removed.
  Scores and incoming trash sit at the top.
- Saturated red-heart, yellow-star, green-circle, cyan-triangle, purple-diamond, and gray-! panels
  use newly drawn pixel masks and beveled edges. Original bitmap lettering replaces browser-rendered fonts
  inside the game. Menus use the clone's compact SELECT arrangement; battles use a shaded forest backdrop.
- Visible screen pixels come from Canvas. Transparent native HTML controls supply mouse hit areas,
  keyboard focus, form validation, and accessible labels for the bitmap menus. Pause/settings/menu
  utility buttons remain outside the game frame, along with the sound toggle.
- Combo/chain cards appear beside the panels that cleared and float upward from that spot.
  They follow stack rise, stay within the board, and remain stationary with reduced effects.
- Original small, wide/tall, and metal trash icons appear above each board after the attack flight arrives,
  including packets waiting for space to spawn. Small attacks show groups of miniature blocks; tall attacks
  show a height multiplier; long queues show an overflow count. The icon strip temporarily replaces that
  board's name/score header, which returns when the preview clears. Admitted trash replaces its icon.
  Attack trails fly between boards. Heavy landings shake the stack and throw up a brief impact burst.
- Red and Blue sit together in the center with idle, attack, hit, win, and loss reactions.
- Original eight-point gold star characters with eyes, cheeks, smiles, and a blink jump three times after a round win,
  accompanied by a new sparkle cue. Local mode shows two star slots per player and keeps earned stars
  between rounds. CPU wins also show the new celebration without changing CPU match/series rules.
  Reduced effects displays a stationary star with open eyes.
- A short curtain/READY/GO transition precedes each round. Simulation starts after GO.
  Cursor positioning is allowed during READY while swaps, raising, and board physics remain frozen.
  Results freeze simulation while loss columns fall away, winner panels clear, and a celebration plays;
  the retry/next-level menu follows after 2.5 seconds. Presentation never alters the stored board state.
- Newly synthesized movement, conversion, incoming, impact, danger, start, and result cues complement
  the existing music. No extracted sound effects or recordings are loaded.
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

Automated checks cover retained engine mechanics, seeded play, legal CPU battles, series lengths 1–10,
retry/draw/completion, input repeat/rebinding, controller navigation/pause/results, audio cleanup,
local dual input/attacks, 2–0 and 2–1 sets, duplicate-result protection, draws, set resets, victory stars,
preview-server file restrictions, native dimensions, integer pixel drawing/scaling, presentation isolation,
incoming attacks, effect cleanup,
and executing the exact direct-file classic bundle with storage blocked.
In-memory controller checks do not substitute for browser QA.
Native-resolution and 3× offline raster previews were generated from the scene renderer and visually inspected.
Live browser verification remains blocked because the browser access host is unavailable;
mouse hit areas, audible balance, and physical keyboard play still need a browser playtest.

## Scope and source

CPU and local two-player modes are implemented. LAN multiplayer remains planned.
See [PLAN.md](PLAN.md) for the full roadmap and [ASSETS.md](ASSETS.md) for provenance.

The sibling `../tetrisAttack` repository was used read-only for engine code and mechanics regression tests.
Its character assets, sprites, scenery, soundtrack, voices, story flow, and generated bundle are excluded.
The inherited mechanics are an existing approximation; this release does not claim native frame accuracy.
