# Mechanics comparison with tetrisAttack

Reference: the local `../tetrisAttack` implementation, inspected November 3, 2026.
This comparison targets that browser game's behavior, including its existing approximations.

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

The engine comparison found no changes to `Board`, seeded generation, CPU planning, or the timing,
speed, stop-time, combo/chain, garbage, conversion, danger, and defeat constants/algorithms.
The `Match` differences enable optional human control of board 2; default CPU behavior remains equivalent.
Human-versus-human boards omit the Red-only tutorial opening so both use the same generation rules.

This includes falling/hover/landing timing, four-tick swaps, legal hover reversal and locked falling
panels, automatic-rise progression, committed manual-raise taps, held-raise transition pauses,
clear/pop ordering, active chains, garbage scheduling/conversion, and simultaneous defeat.

## Regression evidence

`test/fixtures/mechanics-parity.json` was captured by executing the actual reference engine and
its actual `cursorMove` function, without loading original art/audio. It records the source engine
SHA-256, a cursor-input trace, and ten seeded replays across Easy/Normal/Hard and early/late CPU stages.

`test/mechanics-parity.test.js` runs those replays against this engine and checks internal-state
checkpoint hashes, the complete event-stream hash, event counts, outcomes, scores, and chains.
The captured runs include 1,016 clears, 3,138 pops, 55 completed chains, 683 conversion steps,
and 747 garbage landings. The fixtures run without the sibling repo or a ROM present.

Additional controller/input checks cover READY, Numpad Enter, buffered swaps/raise taps, directional
priority, repeat changes, local P2 timing, pause/reset behavior, and differing render frame rates.
The retained mechanics suites continue to check the original measured timing fixtures.

Art, audio, menu/presentation timing, CPU-series length/profile mapping, and two-player set rules are
intentional differences. Live physical keyboard feel still requires a browser playtest.
