<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W99 — teachability by tradition, raw output

Produced by `node scripts/w99-teachability-probe.mjs 8 2400` on `main` at `e2a15cf`.
Passive control, zero actions, 2400 world ticks, eight common run seeds per arm.
Read `balance/results-w99-tradition-species.md` for what it means.

#### The acquire hook, as loaded

| tradition | acquire kind | initialMastery | teachable on arrival by construction? |
|---|---|---|---|
| true-naming | `true-name` | 1024 | **yes** |
| vancian-memorization | `standard` | 256 | **no** |
| art-of-memory | `standard` | 256 | **no** |

#### Table A — instances that arrive after founding

| tradition | arrivals | teachable on arrival | fraction | mean arrival mastery | mean age at first sight (ticks) |
|---|---|---|---|---|---|
| true-naming | 5074.8 | 4279.6 | **0.8433** | 819.0 | 6.6 |
| vancian-memorization | 4481.8 | 3.9 | **0.0009** | 229.8 | 6.5 |
| art-of-memory | 815.9 | 3.9 | **0.0047** | 229.5 | 6.7 |

#### Table B — what the universe holds at the end of the run

| tradition | nodes known | distinct nodes shelved | held instances | written instances | teachable | marooned | condemned | teachable nodes | untransmittable nodes |
|---|---|---|---|---|---|---|---|---|---|
| true-naming | 51.0 | 37.0 | 2486.6 | 68.1 | **78.9** | 2407.8 | 0.0 | 23.1 | 27.9 |
| vancian-memorization | 51.0 | 36.8 | 1897.6 | 68.1 | **0.0** | 1897.6 | 0.0 | 0.0 | 51.0 |
| art-of-memory | 26.4 | 0.0 | 440.3 | 0.0 | **0.0** | 440.3 | 0.0 | 0.0 | 26.4 |

#### Table C — teaching over the run

| tradition | lessons taught | research completed | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|---|---|
| true-naming | 2155.9 | 2937.5 | 262.5 | 412.4 | 687.1 | 793.9 |
| vancian-memorization | 4.1 | 4494.5 | 4.1 | 0.0 | 0.0 | 0.0 |
| art-of-memory | 4.1 | 814.8 | 4.1 | 0.0 | 0.0 | 0.0 |

#### Per-seed detail (teachable / held instances at the final tick)

| seed | true-naming | vancian-memorization | art-of-memory |
|---|---|---|---|
| 20268730 | 52 / 2473 | 0 / 1709 | 0 / 565 |
| 20276649 | 39 / 2227 | 0 / 1690 | 0 / 114 |
| 20284568 | 164 / 2780 | 0 / 1841 | 0 / 163 |
| 20292487 | 96 / 2504 | 0 / 1494 | 0 / 633 |
| 20300406 | 78 / 2452 | 0 / 2105 | 0 / 517 |
| 20308325 | 65 / 2587 | 0 / 2464 | 0 / 568 |
| 20316244 | 72 / 2364 | 0 / 2066 | 0 / 492 |
| 20324163 | 65 / 2506 | 0 / 1812 | 0 / 470 |
