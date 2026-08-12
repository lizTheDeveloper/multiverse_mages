<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The horizon, swept — was every measurement taken after the game was over?

**Build:** `w19/horizon-sweep`, from `integration/campaign-round-2` at `0b54c84` — the tree with all
eight workstreams merged. **Role:** measurer. No constant, rule or magnitude was changed. No golden
fixture and no balance baseline was regenerated.

*(Composition numbers land when the local arms finish. Everything below the production-arm heading
is measured and final.)*

## The question

Every diversity measurement this campaign has taken was at **2400 world ticks**, and the horizon is
the one variable eight workstreams never varied. **Does the strategy space have more than one
dimension before the content is exhausted?**

- **Yes** — dimensionality rises and containment falls at shorter horizons — means the game works
  and the horizon is too long for its content. A configuration finding, and good news.
- **No** — one dimension even where universes hold a fraction of the set — means the flatness is in
  the **content graph itself**, and no mechanic fixes it.

## The premise the brief handed me is false on this tree, and that is the first finding

The brief's framing was that `referenceNodesKnown` is **29.4 at 600 ticks** against a reachable set
of 51, so a 600-tick universe holds *"roughly 60% of the set — not exhausted"*, and a 300-tick one
about a third.

**Measured on this tree, at n = 400 per horizon on the production executor:**

| strategy | 300 | 450 | 600 | 900 | 1200 | 1800 | 2400 |
|---|--:|--:|--:|--:|--:|--:|--:|
| `passive-control` | **48.9** | 50.3 | 50.6 | 50.9 | 51.0 | 51.0 | 51.0 |
| `idle-then-declare` | **48.8** | 50.0 | 50.6 | 51.0 | 51.0 | 51.0 | 51.0 |
| `worship-maximizer` | **48.9** | 50.2 | 50.6 | 51.0 | 51.0 | 51.0 | 51.0 |
| `archivist` | **49.2** | 50.3 | 50.7 | 50.9 | 51.0 | 51.0 | 51.0 |
| `uniform-random-legal` | 54.7 | 58.1 | 59.5 | 60.9 | 62.0 | 62.3 | 62.1 |
| `portal-rush` | 47.2 | 44.4 | 42.2 | 43.6 | 42.8 | 47.9 | 51.7 |
| `narrow-depth` | 6.3 | 6.0 | 5.7 | 5.5 | 5.1 | 4.8 | 4.8 |
| `denial-warden` | 3.9 | 3.6 | 3.5 | 3.4 | 3.2 | 3.0 | 2.9 |
| `permissive-breadth` | 154.9 | 202.3 | 222.1 | 252.7 | 255.9 | 258.2 | 259.4 |
| `permit-then-idle` *(probe)* | 155.8 | 200.5 | 220.3 | 249.8 | 254.1 | 256.1 | 255.9 |

**A universe that the god never touches holds 48.9 of the 51 reachable nodes by tick 300** — 96% of
everything it can ever reach, in an eighth of the horizon every campaign measurement has used. The
29.4-at-600 figure describes a different build; it is not what this tree does.

So the brief's shortest horizon was **already past exhaustion**, and the sweep as specified could
not have seen the space open up even if it does. A second pass at **30, 60, 120, 180 and 240** ticks
was added under the same seeds. That is a change to the experiment, made because the first numbers
falsified its premise, and it is recorded here rather than folded in quietly.

Two smaller readings from the same table, both new:

- **The two deniers shrink.** `denial-warden` goes 3.9 → 2.9 and `narrow-depth` 6.3 → 4.8 as the
  horizon lengthens. Under an edict that forbids most of the grid, nodes decay out from under the
  universe and are not re-derived. Their longest run is their poorest.
- **`portal-rush` dips and recovers** — 47.2 at 300, 42.2 at 600, 51.7 at 2400 — the only
  non-monotone row in the table.

## The production arm — n = 400 per horizon, the real executor

Seven sweep files differing in `termination.worldTickCap` and in nothing else, run on Modal through
`run-sweep-distributed.mjs`. 2,800 runs.

### Integrity, checked rather than argued

- **Common random numbers: `runSeed` is identical on all 400 coordinates at every horizon**, checked
  pairwise against the 300-tick arm — 400/400 for 450, 600, 900, 1200, 1800 and 2400. Only the tick
  cap varies.
- **Coverage is exact**: ten strategies at exactly 40 runs each, at every horizon. `replicates` is
  400 and the pool is 10, so `strategies[replicateIndex % poolSize]` deals evenly — the failure mode
  that has already corrupted one shipped constant did not occur here, and is asserted rather than
  assumed.
- **The 2400 arm reproduces the integration round exactly**: `ascensionRate` **0.1950**, the same
  number `integration-round-2-results.md` reports at the same n. The instrument agrees with the
  record it is extending.

### Ascension by horizon, with both gates stated

| horizon | ascension window | canon reachable | ascensions | rate | apotheosis | canon |
|--:|---|---|--:|--:|--:|--:|
| 300 | **empty** | no | 0 | — | 0 | 0 |
| 450 | **empty** | no | 0 | — | 0 | 0 |
| 600 | **empty** | no | 0 | — | 0 | 0 |
| 900 | `[600, 900)` | **no** | **0** | 0.0000 | 0 | 0 |
| 1200 | `[600, 1200)` | yes | 69 | **0.1725** | 0 | 69 |
| 1800 | `[600, 1800)` | yes | 72 | **0.1800** | 1 | 71 |
| 2400 | `[600, 2400)` | yes | 78 | **0.1950** | 6 | 72 |

**Two structural gates, and neither is a finding about play:**

1. `ascension-min-tick` is **600**, and a run capped at `H` executes ticks `0 .. H-1`. The window is
   therefore `[600, H)` — **empty at 300, 450 and at exactly 600**. Reporting a zero at 600 as a
   rate would be reporting arithmetic.
2. Enduring Canon needs `goodEraRun >= ascension-era-count` (**4**), incremented at most once per
   era boundary, and `ERA_TICKS` is **240**. Four consecutive passes cannot land before tick **960**.
   So **horizon 900 admits apotheosis only** — and measures **zero of 400**.

**The first horizon at which any universe wins is 1200, and it wins by canon.** Apotheosis appears
at 1800 (1 run) and 2400 (6 runs); at every shorter horizon it is zero. The 0.05–0.20 band §7 asks
for is met at 1200, 1800 and 2400 — and is *unreachable by construction* below 1200.

### Who wins, at every horizon where winning is possible

| strategy | 1200 | 1800 | 2400 |
|---|--:|--:|--:|
| `permit-then-idle` *(probe)* | **35/40** | **36/40** | **39/40** |
| `permissive-breadth` | 34/40 | 36/40 | 39/40 |
| *every other strategy* | 0/40 | 0/40 | 0/40 |

**A shorter horizon does not make the god's other verbs matter.** `permit-then-idle` — which presses
`permitTechnique` and `permitForm` for 140 ticks and then submits an empty preference list forever —
wins at least as often as `permissive-breadth` at every horizon, and eight of ten strategies win
nothing at any horizon. The integration round's headline survives the horizon sweep intact.

## Status

In flight — the composition arms are still running.
