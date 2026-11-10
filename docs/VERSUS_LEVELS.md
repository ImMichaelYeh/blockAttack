# Two-player levels: native comparison

Local and LAN games use independent levels 1–10 for Red and Blue. Default is level 4.
LAN includes each player's choice in the connection code and validates both choices when starting
each round. The protocol is now `block-attack-lan-2`; old codes must be recreated.

## Verified parameters

On November 9, 2026, the verified US SNES ROM (SHA-1
`2dc56eab3e70c0910ae47119d8b69f494e6000df`) was run in two-player VS mode.
Ten independent level initializations, ten combined four-clear/hover probes, four forced timed
speed transitions and two physical-speed cap probes produced **5,870 frames** of evidence.
Portable results are in `test/fixtures/snes-versus-levels.json`; tests require no ROM or emulator.
Raw emulator output, screenshots, states and research plans remain in ignored `test-results/versus-*`.

| Selected level | Initial physical speed | Rise word | Ordinary colors | Hover steps | First pop after match | Ceiling grace |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 71 | 5 | 12 | 70 | 120 |
| 2 | 5 | 89 | 5 | 12 | 68 | 100 |
| 3 | 9 | 119 | 5 | 11 | 65 | 80 |
| 4 | 13 | 175 | 5 | 10 | 64 | 65 |
| 5 | 17 | 228 | 5 | 9 | 59 | 50 |
| 6 | 21 | 296 | 5 | 6 | 56 | 40 |
| 7 | 25 | 385 | 5 | 5 | 53 | 30 |
| 8 | 29 | 508 | 5 | 4 | 50 | 20 |
| 9 | 27 | 439 | 6 | 3 | 47 | 10 |
| 10 | 32 | 648 | 6 | 6 | 44 | 0 |

These settings change more than rise speed. Level 9 deliberately starts rising slower than 8,
while adding a sixth color, shortening hover/clear time and reducing ceiling grace.
Level 10's hover is longer than level 9's. Neither observed exception is smoothed out.

`src/versus.js` retains raw-table-derived timing, stop tables, grace, shock quotas and row modes.
The tables at file offsets `$103E7/$103FB/$10405/$1040F/$10419/$10423/$10441/$1044B/$10455`
provide color counts, flash, face, pop, initial speed, shock quota, hover, grace and row-generation mode.
Stop tables use the existing measured pointer tables at `$105ED/$104E1/$108C7/$1085B` for ordinary
combos/chains and danger combos/chains. Four-clear runtime maxima match those tables at all ten levels.

The existing engine represents raw flash as twice the native register, face as the register plus
three transition calls, and pop spacing as the register plus one. All four pop ages and the first
post-swap descent are checked against native processing-call counts at every level.

Timed speed progression uses the existing native interval stages, independent of selected level:
four 900-step intervals, four 600, four 540, four 480, eight 420, four 360, then 300.
Fresh forced transitions at stages 1/4/20/49 confirmed the next intervals 900/600/420/300.
Native physical-speed transitions 49→50 and 50→50 confirm the cap; the LEVEL display continues
showing the chosen handicap rather than this internal speed counter.

The sixth ordinary color is a dark blue inverted triangle, stored as kind 6. Kind 5 remains the
gray shock block. Initial boards, rising rows, garbage conversion, matching and rendering support
the extra ordinary color; matching it never creates a metal attack merely because it is the sixth color.

## Scope

This verifies the selected-level parameters and the measured timing/progression cases. It does not
establish full native parity for the entire game. RNG sequence, opening layouts, unmeasured large
combo/shock stop grants, advanced garbage boundaries and all projectile/attack timing remain subject
to the limits recorded in `SNES_PARITY_GAPS.md`. Existing CPU single/series settings remain separate.

Automated coverage checks mixed local levels, level bounds, rematches/sets, ordinary versus shock
colors, native timing tables and native speed transitions. Real Chrome HTTP and direct-file WebRTC
tests exercise different levels on the two peers and verify identical simulated state. Physical-device
network latency and player feel still require a LAN playtest.
