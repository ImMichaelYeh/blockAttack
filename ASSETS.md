# Asset and code provenance

The game uses original art and synthesized effects, plus two user-selected licensed music recordings.
It makes no external runtime requests. LAN peers exchange game inputs directly over WebRTC after
manually exchanging invitation/answer codes; no public signaling, STUN or relay service is used.

- `src/render.js`: new pixel-style Canvas drawings for Red and Blue square trash-block characters,
  six ordinary symbol/color block designs plus the gray shock block, cursor, grinning pressure blocks,
  particles, and reaction poses. The sixth ordinary design is a newly drawn dark blue inverted triangle
  used by two-player levels 9–10; it is separate from the gray exclamation-mark block.
  Faces use newly drawn rivets, cheeks, eyes, and a toothed grille; no reference sprites are traced or loaded.
  Panels use the reference's saturated color/symbol associations, with independently drawn 16 × 16 pixel
  masks. Every scene, backdrop, menu, HUD, flight, impact, and transition is composed at 256 × 224.
  Danger animation follows the sibling renderer's 18-tick, four-pose bounce/squash cycle and
  column-pair staggering. At stack height 10, idle blocks across the board animate inside fixed
  frames; symbols use newly drawn deformations rather than imported reference sprite pixels.
  `VICTORY_STAR` is a newly drawn compact five-point star on a 16-pixel grid, with bright yellow
  fill, an amber edge and tall blinking eyes. Earned stars continuously bounce vertically;
  reduced effects keeps them still. Empty slots use a muted gold outline.
  Its proportions follow the reference star; no original game's sprite is loaded.
  Incoming-trash previews use newly drawn miniature blue faces, wide/tall blocks, and riveted metal plates,
  grouped above the boards in the reference layout. Original combo/chain cards are drawn beside each clear.
  The center HUD is one 48-pixel-wide dark panel with a gold frame matching the playfields,
  inset dividers, warm gold labels and cream values. It holds the characters, POINT/STAGE, LEVEL,
  TIME and 16-pixel stars. POINT is a running 2P round-win total;
  stars track the current set. Single-player uses one row; two-player uses two rows of two.
- `src/pixels.js`: new bitmap letter/digit definitions and pixel window/mask drawing routines.
  No copied game font, font file, or SVG icon is used. The canvas uses original bitmap lettering;
  Settings uses a system font in HTML for legibility. Round results use full seven-row pixel lettering.
- `src/versus.js`: numeric two-player settings checked against native ROM tables and fresh SNES
  runtime captures. No original sprite, sound or font data is included; see `docs/VERSUS_LEVELS.md`.
- `style.css` and `index.html`: console frame, beveled windows, and SELECT/menu placement adapted
  from the user's clone layout. Colors, background, mascots, and screen content are original.
  Transparent native controls overlay the Canvas menus to preserve mouse, keyboard, and screen-reader
  behavior. System fonts are used only for the browser utility chrome outside the scene;
  the favicon is an inline geometric drawing.
- `assets/music/`: "Puzzle Menu" by caret7 and "Long Summer Nights" by David KBD,
  supplied by the user under CC BY 4.0. Full attribution, source links, license links and playback
  adaptations are in `assets/music/CREDITS.txt`, linked from the footer and included in the build.
- `src/audio.js`: looping playback of those recordings with individual volume trims. Both sources
  were decoded locally and measured: menu mean -36.0 dB / peak -15.7 dB; gameplay mean -12.6 dB /
  peak -1.4 dB. Trims compensate for that loudness difference without rewriting the supplied files.
  At height 10 on either board, gameplay playback switches to 1.4x with browser pitch preservation,
  plus a quiet two-part heartbeat every 0.85 seconds. Pulses wait during character calls and stop
  when music pauses, the menu opens or the stacks become safe;
  lowering both stacks below height 9 restores normal speed without resetting playback position.
  Native HTML audio supports the local-file game as well as the HTTP preview. Menu music starts
  after a user gesture. Pausing, hiding the page or losing focus pauses playback; new rounds restart
  gameplay music, while ordinary resume keeps its position. The synthesized background score was removed.
  Impact sounds combine synthesized bass with locally generated, filtered noise. Movement, conversion,
  incoming-trash warnings, READY/GO, danger, win, and loss effects are also synthesized from new sequences.
  The victory-star sparkle uses a new three-note synthesized cue.
  Red is a bold, warm firecracker with a compact throaty call; Blue is cheeky and springy with a
  rounded two-syllable call. Vowel resonances and subtle pitch flutter give both original voices
  the same warm timbral family. No original recordings or browser text-to-speech voices are used.
  Attack calls take turns and briefly duck music/effects. Repeated movement, pops, conversion,
  impacts and warning cues have short cooldowns instead of stacking freely. Calls last less than
  0.27 seconds; incidental cues stay quiet and use notes from the same D-centered palette.
  Effects and character voices have separate gain buses into a shared 6.2 kHz low-pass filter
  and soft compressor. Rounded pulse/saw waves use a decaying 16-harmonic spectrum. The mastered
  music recordings play directly, with a smooth volume dip during attack calls.
  Victory themes share D major while retaining separate Red/Blue melodies, without a simultaneous
  defeat cue or extra percussion layer.
- `src/presentation.js`: visual timing and result/incoming-state helpers; these do not advance or rewrite
  the engine's board state.
- `src/engine.js`: gameplay implementation copied from the user's sibling `tetrisAttack` repository.
  Existing rule/timing constants and CPU logic are retained. Internal `story`/`endless` profile names
  describe legacy engine rules, not additional playable modes.
- `test/engine.test.js` and the other mechanics suites: copied from that repository;
  timing tests no longer assert frames from its retired sprite renderer.
- `test/fixtures/`: numerical regression observations and job definitions copied only for tests.
  These files are excluded from the website build and preview allowlist. No ROM or emulator is included.
- `tools/bundle.mjs` and `game.js`: a small local classic-script build of only the new source modules,
  so `index.html` works with `file://`. No old generated bundle is copied.
- Other source files and tests: new for this project.

No character, scenery, title, result animation, or audio asset directory from the sibling game is used.
This inventory documents migration choices; it is not a legal clearance opinion.
