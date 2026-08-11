<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Making the win condition discriminating — design

**Status:** design, pending implementation.
**Measured against:** `main` @ `71261e9`, reference-universe-v1, content revision `2512ea02…`.

## Why

The goal is release-plan 0.12.0: *"learned agents have played enough to expose strategies the
scripted pool could not, and the baselines have been re-established against them."* That is
blocked, and the block was measured rather than suspected.

## What was measured

Three sweeps through `mc-harness` against the reference universe: 400 runs at 240 ticks, 80 runs
at 2400 ticks, and `balance-full` at 10,000 runs × 240 ticks. Eight-strategy round-robin pool.

### F1 — ascension is a button, not an achievement

At 2400 ticks (200 world years), `uniform-random-legal` ascends **10 of 10** runs, at ticks
700–964, always at exactly 51 nodes known. Every other strategy ascends **0 of 10**.

The mechanism has two independent causes, and they need different fixes.

**Cause 1 — a harness artifact.** `policyFor` submits the first preference the mask permits. Only
`portal-rush` lists `declareAscension` at all, and it sits behind `encourageResearch` and
`permitTechnique`, which are always legal. So seven of eight strategies *cannot* win, whatever
they do. Any tournament run today measures preference-list ordering, not play.

**Cause 2 — a game-design issue.** Path A (apotheosis) gates on `ascension-min-tick` (600) and
worship tier ≥ `ascension-tier-gate` (4). Worship accrues from mages, universities and populace,
all of which exist whether or not the god acts, so Path A opens *passively* around tick 600.
`passive-control` reaches the same state as the random bot and differs only in never pressing the
button. Even with cause 1 fixed, "idle until eligible, then declare" dominates.

### F2 — ascensionRate is horizon-dependent, not broken

240 ticks: 0 / 400 ascend. 2400 ticks: 10 / 80 = **0.125**, inside the declared 0.05–0.20 band.
Both committed gates (60 and 240 ticks) are structurally incapable of observing the win condition.

### F3 — the strategy space is one axis

Mean nodes known at 2400 ticks:

| strategy | nodes known |
|---|---|
| `permissive-breadth` | 273.2 |
| `passive-control`, `archivist`, `portal-rush`, `worship-maximizer` | 51.0 |
| `denial-warden` | 7.8 |
| `narrow-depth` | 7.0 |

One axis: how much magic is permitted. `denial-warden` and `narrow-depth` are near-duplicates;
`archivist`, `portal-rush` and `worship-maximizer` are indistinguishable from the passive control.

### F4 — population is inert to the god

No strategy separates on `referenceLivingMages`, `referencePopulation`, `referencePeakPopulation`
or `referencePopulationChange`. Four of ten reference metrics are blind to every strategy.

### F5 — §7 metrics are half-wired

The twelve §7 balance metrics cannot be named by a sweep — only the ten `reference*` measures are
registered in the scenario's runtime registry. Five arm-scoped ones are computed automatically into
the sweep summary and are not surfaced by any CLI:

    ascensionRate 0.125 | capitalSnowball 0.3498 | worshipSnowball 0.1075
    prestigeAdvantage no-observations | winRateByPrimitive mechanic-absent

`capitalSnowball` was byte-identical at ticks 60/120/240 in the short probe. Worth a look.

### F6 — `POOL_BUILD_LIMITS` is stale

It claims every god action is effect-degenerate and that *"a pairwise matrix taken now measures the
harness, not the game"*. That was true at 0.5.0 and is false now: `coordination/src/god/
interventions.ts` implements the interventions and `mask.ts` gates `declareAscension` on
`ascensionPath`. Leaving it in place tells a reader not to run the experiment that finds F1.

## Consequence for the stated goal

`mm_gym.rewards.sparse_terminal` scores ascension. Under F1 that reward is maximised by idling
until eligible and pressing one button, so a trained policy converges on it and learns nothing
about magic. **Fixing the win condition is a prerequisite for training, not a follow-up.**

## What is being built

Three workstreams. W1 gates the other two: until it lands, no change to the game can be measured.

### W1 — make the pool able to win, and able to be seen winning

1. Every scripted strategy declares an explicit **ascension stance** — when it would declare, and
   why — so that "did it win" measures play rather than preference-list position. The stance is
   part of `StrategyDefinition`, not a preference-list accident.
2. A **long-horizon instrument**: a third sweep at 2400 ticks with its own committed baseline.
   The existing two gates are *not* to be lengthened — `balance/README.md` argues their horizons
   from measured sensitivity-per-second, and widening either trades one blind spot for another.
3. Correct `POOL_BUILD_LIMITS` to what is true of this build.

**Falsifiable claim:** with W1 alone and no game change, at 2400 ticks more than one strategy
ascends, and `uniform-random-legal` is no longer the only winner.

### W2 (approach B) — make ascension discriminating

Path A's gate must depend on something the god's play moves, and `declareAscension` must trade
against other uses of favor rather than being free. Retuning follows the order the content data
already authors: `ascension-tier-gate` first, then `ascension-era-count`, then
`ascension-dependence-max`.

**Falsifiable claim:** ascension rate correlates with play. Specifically, `passive-control`'s
ascension rate is below the pool mean, and at least two deliberate strategies exceed it, with
`ascensionRate` still inside 0.05–0.20.

### W3 (approach C) — a summit per playstyle

Additional ascension routes so that depth, endurance, breadth and worship each have a win
condition. Blocked on W2: adding routes to an instrument that cannot tell strategies apart would
be untestable.

**Falsifiable claim:** at least three distinct strategies each win predominantly by a *different*
route, and no single route accounts for more than 60% of ascensions.

## Constraints

These are not negotiable by any agent working on this.

- **Golden replay fixtures are never regenerated by this campaign.** They are determinism claims,
  categorically different from balance baselines. `npm run goldens:regen` is not to be run.
- Balance baselines *may* be regenerated — the user granted that authority explicitly — but only
  via `packages/mc-harness/bin/regenerate-baseline.mjs`, and every regeneration must state the
  constants that changed and the measured deltas that justify it.
- Determinism holds: no `Math.random`, no `Date.now`, no floats in the rules path. Fixed point at
  1/1024.
- Content lives in validated data files. Constants carry `tuningStatus`; a tuner may move
  `untuned` ones and must say so.
- Every package keeps its declared dependency edges. `mc-harness` may not import `rules-*`.

## Out of scope here

The training harness (torch/numpy, outside the repo so the AGPL surface stays clean) and the
auto-balance search loop. Both are blocked on W1–W3 and get their own design.
