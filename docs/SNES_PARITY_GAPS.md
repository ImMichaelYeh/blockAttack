# SNES mechanics verification backlog

Updated November 8, 2026. Matching the sibling browser project is separate from
matching the original SNES game. Passing browser replays does not prove native AI.
These are verification gaps unless explicitly described as intentional differences.

## CPU decisions: custom AI approved

The user approved our own AI instead of copying native CPU behavior, then reduced the requested
range to ten calibrated levels. Native AI reconstruction is no longer a parity requirement.
Live sessions now use `src/cpu.js`: 30-to-10-tick action intervals, one- to three-swap lookahead,
committed plans, stale-plan invalidation, and no blind shuffling when no clear is reachable.
The strongest level caps cursor moves/swaps at six per second; the weakest caps them at two.
Board speed/timing/physics remain the established profiles. Raising requests are separate from
cursor moves/swaps and pause while a plan or board resolution is active.

Calibration: eight identical Normal-profile seeds (1–8), 3,600 steps each, cleared 313 / 362 / 559
blocks in aggregate at levels 1 / 5 / 10. In eight seeded two-minute AI matches (11,22,…,88),
level 10 beat level 1 in all eight and level 5 in five, losing three. This is an automated baseline,
not proof of how difficult a human will find each level. Human playtesting remains necessary.

The planner forecasts settled cascades and waits through animation/conversion. It does not plan
timed swaps during a clear or simulate garbage conversion. These are explicit limits of our AI.

### Historical report and investigation

Player report: Single Match level 20 moves quickly but does not appear purposeful.
Level 20 selects the independently tuned Hard encounter 12 profile: a two-tick
action interval, chain evaluation enabled, and automatic raising below height 9.
These are browser settings, not measured native AI parameters. The 20 selectable
levels count distinct browser CPU configurations, not proven native difficulties.

Code findings in `src/engine.js`, `chooseMove` and `Cpu.step`:

- The CPU recomputes its target on every action interval, including cursor travel.
  It can abandon a target before reaching it; there is no committed plan.
- The evaluator always returns the highest-rated legal swap, even when every
  candidate has a nonpositive score. The CPU has no deliberate wait decision.
- Setup scoring counts nearby matching colors. Chain evaluation removes one
  immediate clear and checks its settled aftermath; it does not search sequences
  of setup swaps or plan actions during a future clear.
- Raising depends on stack height and resolution state, without considering the
  time needed to finish a plan.

### Browser diagnostic baseline

Five independent Hard boards, seeds 1–5, each simulated for 3,600 steps with
`new Cpu(2, { chains: true, raiseBelow: 9 })`. Boards had no opponent or incoming
attacks. Before each successful swap, its current `chooseMove` score was recorded.
This isolates the decision policy; it is not a full-match or native comparison.

| Seed | Swaps | Swaps rated <= 0 | Blocks cleared | Best chain |
| --- | ---: | ---: | ---: | ---: |
| 1 | 639 | 426 | 167 | 2 |
| 2 | 651 | 493 | 155 | 2 |
| 3 | 604 | 385 | 182 | 4 |
| 4 | 588 | 358 | 164 | 1 |
| 5 | 623 | 372 | 144 | 2 |

Total: 2,034 of 3,105 swaps (65.5%) were rated nonpositive by the CPU's own
evaluator. This supports investigating aimless swapping. A nonpositive rating
alone does not prove a move is useless: a good multi-swap setup may be beyond
the evaluator's limited foresight. All five boards survived the observation.

### Evidence that would be required for native CPU fidelity (deferred)

Existing sibling research (`docs/snes-s19-cpu-results.json`) records cursor
movement in three native observations: Normal stage 1, Normal stage 8, Hard stage 1.
Its explicit limits say wall-frame cursor movement is not the AI decision interval,
different starting boards prevent strategy comparisons, and browser profiles are
independent tuning. It does not establish Hard stage 12 behavior.

Next controlled comparisons should give the native CPU known fields and record
the board, cursor, swaps, raises, clears, and gameplay-processing steps together:

1. A single available clear, both near and far from the cursor: target commitment.
2. No immediate clear, but a known two-swap setup: purposeful preparation.
3. A clear that can produce a chain versus an isolated clear: selection priorities.
4. An active clear with a chain opportunity: waiting and chain continuation.
5. High stacks and adjacent garbage: survival, conversion, and raise decisions.
6. Repeat equivalent fields across routes/encounters to separate strategy from pace.

Keep any browser AI improvement labeled as an improvement until native traces
support it. Do not infer stronger strategy merely from a shorter action interval.

## Verified two-player level settings — November 9, 2026

Local and LAN now use independently selected native levels 1–10, including the sixth ordinary color
at levels 9–10. Numeric parameters were checked against the US ROM and 26 focused native runs
(5,870 frames). Tests retain every level's measured four-clear pop ages and first post-swap descent,
the full ordinary/danger stop tables, initialization registers, speed-stage transitions and speed cap.
See [two-player verification](VERSUS_LEVELS.md) for the exact table and remaining scope limits.
This is separate from the independently designed CPU AI.

## Other mechanics to verify

- **Attack travel and ordering:** only sampled Normal anchors have calibrated
  delays; other positions/profiles and tall/metal/chain traffic use fallbacks.
- **Large attacks:** combos above 12 use a six-wide fallback; chains beyond ×5
  have capped height; special-block clears above six extrapolate a measured rule.
- **Stop time:** special-block clears, combos above 12, and chains above ×4 use
  fallback grants. Garbage/conversion/recovery suspension needs broader evidence.
- **Garbage conversion:** new arrivals during active conversion, reactivation,
  and mixed-material interactions need controlled native coverage. Placement has
  implemented cycles; verify their range rather than treating placement as random.
- **Generation:** exact native RNG/state equivalence and rows with multiple
  special-block generation credits remain unproven.
- **Swap/cursor/ceiling edges:** neighboring overlapping swaps, fractional-rise
  boundaries, and shared danger-scan phase need broader native coverage.
- **Manual raise — intentional difference:** browser taps commit 16 additional
  pixels and retain buffered taps through clears; native taps finish the current
  row boundary and released clear-time taps can be lost. Revisit explicitly if
  strict native input behavior becomes the requirement.

Ordinary measured speed, swap, clear, chain, conversion, and stop/grace cases
retain their existing fixture coverage. An open edge case does not invalidate
those measurements or prove the entire mechanic wrong.
