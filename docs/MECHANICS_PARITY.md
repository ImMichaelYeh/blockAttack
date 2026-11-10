# Mechanics comparison with tetrisAttack

Reference: the local `../tetrisAttack` implementation, inspected November 3, 2026.
This comparison targets that browser game's behavior, including its existing approximations.

Track outstanding native verification separately in [SNES parity gaps](SNES_PARITY_GAPS.md),
starting with CPU decision-making and the level 20 player report.

## Differences corrected

- Cursor repeat was immediate / 12-tick delay / every fourth tick. Restored immediate movement,
  a 10-tick initial delay, then movement every simulation tick while held.
- Simultaneous directions could move diagonally or cancel opposite directions. Restored the reference's
  Up, Down, Left, Right priority: only one direction is selected per tick.
- Movement now samples held directions, as the reference does. Swap and raise taps remain buffered
  when released between ticks; an operating-system key repeat never creates another swap.
- Restored Numpad Enter as an alias of Enter.
- READY now accepts cursor movement without advancing board physics. Swap/raise stay blocked,
  and held-direction repeat carries through GO. The shorter entrance presentation remains intentional.
- Simulation uses the same millisecond accumulator, 60 Hz step, and 100 ms frame-delta clamp as the
  reference. Rendering at 30 Hz or 144 Hz does not change the simulation rate.
- Restored the reference's panel paint order when reversing an unfinished swap. This fixes visual
  overlap; the underlying four-tick swap and reversal rules were already identical.

## Confirmed unchanged

The initial engine comparison found no changes to `Board`, seeded generation, or the timing,
speed, stop-time, combo/chain, garbage, conversion, danger, and defeat constants/algorithms.
The `Match` differences enable optional human control of board 2 and a custom CPU opponent.
Human-versus-human boards omit the Red-only tutorial opening so both use the same generation rules.

This includes falling/hover/landing timing, four-tick swaps, unfinished-swap reversal and locked falling
panels, automatic-rise progression, committed manual-raise taps, held-raise transition pauses,
clear/pop ordering, active chains, garbage scheduling/conversion, and simultaneous defeat.

## Native hover correction — November 9, 2026

A player reported sustaining unsupported blocks and moving them sideways with rapid swaps.
Four fresh SNES Story Normal traces (560 frames total, verified US ROM SHA-1
`2dc56eab3e70c0910ae47119d8b69f494e6000df`) reproduced the mismatch:
after a supported block swaps into empty space, native hover rejects subsequent swap attempts.
The inherited browser engine instead accepted them and restarted the swap/hover timers.

`Board.canSwap` now locks hovering blocks, alongside falling/clearing/converting blocks.
The four-tick animation and verified unfinished-swap reversal remain unchanged.
`test/fixtures/snes-swap-hover-results.json` records release, repeated unsupported swaps,
sideways traversal attempts, and a supported-floor control using the same input cadence.
`test/swap-hover.test.js` checks positions on every frame without requiring a ROM/emulator.
These traces establish this Story Normal case; they do not certify every native swap edge case.

## Regression evidence

`test/fixtures/mechanics-parity.json` was captured by executing the actual reference engine and
its actual `cursorMove` function, without loading original art/audio. It records the source engine
SHA-256, a cursor-input trace, and ten seeded replays across Easy/Normal/Hard and early/late CPU stages.

`test/mechanics-parity.test.js` runs those replays with the retained historical CPU against this engine and checks internal-state
checkpoint hashes, the complete event-stream hash, event counts, outcomes, scores, and chains.
The captured runs include 1,016 clears, 3,138 pops, 55 completed chains, 683 conversion steps,
and 747 garbage landings. The fixtures run without the sibling repo or a ROM present.

Additional controller/input checks cover READY, Numpad Enter, buffered swaps/raise taps, directional
priority, repeat changes, local P2 timing, pause/reset behavior, and differing render frame rates.
The retained mechanics suites continue to check the original measured timing fixtures.

CPU series retains Easy10 / Normal11 / Hard12 encounters and route board timing/speed.
On November 8, 2026 the user approved independently designed AI instead of native CPU reconstruction.
Single Match now uses ten custom profiles, with slower reaction intervals (30 down to 10 ticks),
one- to three-swap planning, combo/cascade evaluation, and bounded search breadth.
The CPU commits to plans, discards them when the field changes, and waits for fresh blocks instead
of shuffling without a reachable clear. Easy series maps to AI levels 1–4, Normal 3–7, Hard 6–10.
Single board profiles progress Easy (1–3), Normal (4–7), Hard (8–10), without changing board physics.
The old `Cpu`/`chooseMove` remain to run the recorded engine-parity fixtures; live sessions explicitly
provide `ComputerPlayer`. Those historical replays do not test the new AI.

Art, audio, menu/presentation timing, custom CPU behavior, and two-player set rules are intentional
differences. New CPU tests cover purposeful setup sequences, target commitment, no-move waiting,
determinism, level bounds, route mapping, and seeded strength comparisons.
Live physical keyboard feel still requires a browser playtest.
