# Asset and code provenance

The game has no externally sourced images, fonts, audio files, sprite sheets, or embedded recordings.
It makes no external runtime requests.

- `src/render.js`: new pixel-style Canvas drawings for Red and Blue square trash-block characters,
  six symbol/color panel designs, cursor, grinning pressure blocks, particles, and reaction poses.
  Faces use newly drawn rivets, cheeks, eyes, and a toothed grille; no reference sprites are traced or loaded.
  Panels use the reference's saturated color/symbol associations, with independently drawn 16 × 16 pixel
  masks. Every scene, backdrop, menu, HUD, flight, impact, and transition is composed at 256 × 224.
  `VICTORY_STAR` is a new nine-pixel, eight-point gold star character with blinking eyes, pink cheeks,
  a smile, and a dark shadow;
  it is separate from the five-point panel star and uses no original game's star sprite.
  Incoming-trash previews use newly drawn miniature blue faces, wide/tall blocks, and riveted metal plates,
  grouped above the boards in the reference layout. Original combo/chain cards are drawn beside each clear.
- `src/pixels.js`: new bitmap letter/digit definitions and pixel window/mask drawing routines.
  No copied game font, font file, SVG icon, or browser font is used inside the rendered scene.
- `style.css` and `index.html`: console frame, beveled windows, and SELECT/menu placement adapted
  from the user's clone layout. Colors, background, mascots, and screen content are original.
  Transparent native controls overlay the Canvas menus to preserve mouse, keyboard, and screen-reader
  behavior. System fonts are used only for the browser utility chrome outside the scene;
  the favicon is an inline geometric drawing.
- `src/audio.js`: new 16-step bass/lead composition and danger arrangement synthesized with Web Audio,
  with newly generated short effects and result cues. No source soundtrack, melody data, or voices imported.
  Impact sounds combine synthesized bass with locally generated, filtered noise. Movement, conversion,
  incoming-trash warnings, READY/GO, danger, win, and loss effects are also synthesized from new sequences.
  The victory-star sparkle uses a new three-note synthesized cue.
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
