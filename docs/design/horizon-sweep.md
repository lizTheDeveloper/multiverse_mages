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

### The second pass, and the two findings in it

The same ten strategies, the same seeds, five shorter caps. n = 400 per horizon, production
executor. Mean `referenceNodesKnown`:

| strategy | 30 | 60 | 120 | 180 | 240 | 300 |
|---|--:|--:|--:|--:|--:|--:|
| `passive-control` | 14.7 | 28.1 | 39.4 | 45.8 | 47.7 | 48.9 |
| `archivist` | 15.9 | 27.5 | 38.6 | 45.2 | 47.8 | 49.2 |
| `worship-maximizer` | 15.2 | 28.9 | 39.9 | 46.1 | 47.8 | 48.9 |
| `idle-then-declare` | 14.6 | 27.3 | 39.5 | 46.0 | 47.5 | 48.8 |
| `portal-rush` | 15.9 | 27.6 | 38.4 | 45.6 | 46.5 | 47.2 |
| `uniform-random-legal` | 15.4 | 27.8 | 38.7 | 46.9 | 51.1 | 54.7 |
| `narrow-depth` | 8.2 | 10.2 | 9.2 | 8.9 | 6.4 | 6.3 |
| `denial-warden` | 13.6 | 13.7 | 13.6 | **12.8** | **4.1** | 3.9 |
| `permissive-breadth` | 14.0 | 28.0 | 58.1 | 91.0 | 123.0 | 154.9 |
| `permit-then-idle` *(probe)* | 13.5 | 29.4 | 59.3 | 92.1 | 126.3 | 155.8 |

**1. The one lever the campaign found live is inert for its first ~120 ticks.** At caps of 30 and
60, `permit-then-idle` (13.5, 29.4) and `permissive-breadth` (14.0, 28.0) are indistinguishable from
`passive-control` (14.7, 28.1) and from every other unrestricted strategy — **all ten sit inside a
two-node band**. Permitting a cell does not produce a node for roughly 120 ticks. So the window in
which universes hold a fraction of the reachable set *and* any strategy differs from any other in
count is, on this evidence, **empty**.

**2. `denial-warden` falls off a cliff between caps 180 and 240** — 12.8 to 4.1, and under common
random numbers these are the same universes, so roughly nine nodes leave in sixty ticks. That is a
discontinuity, not a drift. 240 is exactly one `ERA_TICKS`; that coincidence is recorded as a
hypothesis and was not chased further, because nothing in this measurement turns on it.

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

## The decision rule, written down before the composition numbers were read

Counts are not composition, and the question is about composition. The composition arms are still
running as this is written, so the rule that will decide the verdict is fixed here first — that is
the only thing that makes the eventual claim immune to *"you picked the reading that flattered the
noise"*, in either direction.

**Containment below 1.000 at a short horizon is expected and is not the finding.** W15 already
measured min pairwise containment at 0.202 / 0.437 / 0.620 / 1.000 at ticks 240 / 480 / 960 / 1440.
Mid-acquisition scatter produces sub-unity containment on its own, and at 30–240 ticks
within-strategy seed noise is at its maximum: small sets, still moving.

**A second dimension is real at horizon H only if both hold:**

1. **cross-strategy containment is below the within-strategy diagonal** — strategies differ from
   each other by more than each differs from *itself* across seeds; and
2. **`betweenShare` stays high** (W15 measured 0.946 at 2400) among the **eight** v1-bound
   strategies — the strategy label still explains the variance, rather than noise explaining it.

   *(Eight, not the seven this rule first said. The v1 pool is defined by measuring which strategies
   hold nodes outside the fifty-one, and on this arm only `permissive-breadth` and `permit-then-idle`
   do — `uniform-random-legal` holds union 51 with **zero** nodes outside. The correction was made
   and committed at `0edc71e`, before any composition analysis output existed; the timestamps are the
   check on that.)*

If cross ≈ within, the verdict is the negative one and it will be stated plainly: **one dimension at
every horizon where the content is unexhausted; the count spread from tick 120 onward is the
permission axis and nothing else; the flatness is in the content graph.**

The rank cap is stated too: ten strategies bound strategy-level structure at nine components, eight
bound it at seven, no matter what the nodes do.

**One limit of the cross-check, so nobody assumes it covers more than it does.** The prefix
cross-check — *"the 2400 arm's composition sample at tick H equals the H-capped arm's terminal"* —
applies only to the first pass, whose sampling grid is 150. None of 30, 60, 120, 180 or 240 is a
multiple of 150, and the second pass has no 2400-tick run of its own. **The short horizons are
validated by being explicit capped runs, which is the authoritative method in either case.**

## Status

In flight — the composition arms are still running.
