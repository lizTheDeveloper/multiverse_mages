<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W6 — both ascension paths must read positive achievement

**Branch:** `w6/positive-achievement`, off `integration/measured-ground` (`abcda16`).
**Goal:** neither path may be satisfiable by a universe the god never touched.

## The defect, restated

Measured over ~40 sweeps: Path A opens passively around tick 700 (worship accrues without the
god), Path B around tick 1080 (a passive universe loses nothing, so *doing nothing is perfect
custodianship*). A 2-D scan over the two authored knobs under common random numbers had the
idle-then-declare probe winning 100% of runs in **every** cell.

## What was found before any code was written

- **F1 — the "51-node passive baseline" is content exhaustion, not a baseline.** The v1 rectangle
  is exactly twelve cells holding exactly fifty-one nodes, and an unattended universe learns *all
  fifty-one*. So no predicate over the starting rectangle can discriminate, at any threshold. The
  only quantity that separates play from non-play today is **how much of the grid the god opened**.
- **F2 — `completedUniversities` cannot serve as Path A's conjunct on this pool.** The brief named
  it as the successor knob and `discriminating-ascension` D5-alt-3 names it too. Measured from the
  96-run sweep's worship checkpoints: every deliberate strategy ends with **1** completed
  university — the seeded one — and only `uniform-random-legal` reaches 2–4. A university gate
  would hand Path A *exclusively to the exploit probe*.
- **F3 — `libraryDependence` is identically zero.** ~2900 instances over 51 nodes is ~55 copies
  each. The conjunct is retained but is inert and load-bears nothing until the loss channel exists.

## Checklist

### 1. Orientation
- [x] 1.1 Read `probable-strategies.md`, the ascension-meta design, vision §8a, `discriminating-ascension`.
- [x] 1.2 Verify golden fixtures cannot be reached by this change — they are sim-core toy worlds
      (`packages/sim-core/test/golden/worlds.ts`), no content, no god system. **Verified.**
- [x] 1.3 Reproduce the pre-change measurement at n = 96 (see "Measurements" below).
- [x] 1.4 Establish the passive baseline the thresholds are multiples of.

### 2. The two predicates
- [x] 2.1 Failing tests first: `packages/coordination/test/unit/god-ascension-achievement.test.ts`.
- [x] 2.2 Path A: `masteredCellCount` — permitted cells standing at their floor — gated by
      `ascension-summit-cells` and `ascension-summit-copies`.
- [x] 2.3 Path B: `eraBoundaryPassed` — breadth (`ascension-canon-breadth`), spread
      (`ascension-canon-cells`), dependence (existing), and a **scale-relative** loss allowance.
- [x] 2.4 Both reduce to the shipped predicate at their identity values, asserted by test.
- [x] 2.5 `GodTickReport.ascensionProgress` so a refusal says which conjunct refused.

### 3. Content and the loader
- [x] 3.1 Five constants in `god-constant.json`, each with `gloss` and `tuningStatus`.
- [x] 3.2 `REQUIRED_GOD_CONSTANTS` updated — checked in both directions by the loader.
- [x] 3.3 Loader invariants asserted at load, with tests.

### 4. Calibration
- [x] 4.1 Extend the tuner's `AXES` with every constant added.
- [ ] 4.2 Run `tune-balance.mjs` under common random numbers.
- [ ] 4.3 Record what was measured for each constant, not a guess.

### 5. The claim
- [ ] 5.1 2400-tick eight-strategy sweep at n >= 96, four parts reported with numbers.
- [ ] 5.2 Regenerate only the baselines that moved, with a written rationale.
- [ ] 5.3 `npm run verify` green.

## Measurements

### Pre-change, n = 96, 2400 ticks, sweep id `tune-shared-seeds`

| strategy | asc/runs | rate | mean nodes | median tick |
|---|---|---|---|---|
| archivist | 12/12 | 1.000 | 50.7 | 1201 |
| denial-warden | 7/12 | 0.583 | 2.3 | 1202 |
| narrow-depth | 7/12 | 0.583 | 7.3 | 1202 |
| passive-control | 0/12 | 0.000 | 50.9 | — |
| permissive-breadth | 12/12 | 1.000 | 219.9 | 1001 |
| portal-rush | 12/12 | 1.000 | 51.0 | 962 |
| uniform-random-legal | 12/12 | 1.000 | 50.3 | 717 |
| worship-maximizer | 12/12 | 1.000 | 50.8 | 962 |

`ascensionRate` **0.771** (band 0.05–0.20: **fail**), exploit margin **−0.229** (**fail**),
7 winners, topShare 0.162 (pass), correlation **+0.324** (pass).

`passive-control` scores 0 by construction — its declared stance is `never`. It is the *state*
baseline, not a win-rate baseline; `uniform-random-legal` is the honest exploit probe.

### The calibration measurement — what each strategy can actually reach

Taken by driving all eight pool strategies through the reference universe over four factor cells
(`cohortSize` 4/12 × `foundingNodes` 1/4, 2400 ticks) and reading the god tick report's
`ascensionProgress` block at every era boundary. Maxima over the run:

| strategy | masteredCells | nodesKnown | cellsKnown | completedUniversities |
|---|---|---|---|---|
| passive-control | 12 | 51 | 12 | 1 |
| uniform-random-legal | 12 | 51 | 12 | **26** |
| archivist | 12 | 51 | 12 | 1 |
| portal-rush | 12 | 51 | 12 | 1 |
| worship-maximizer | 12 | 51 | 12 | 1 |
| permissive-breadth | **15** | **262** | **70** | 1 |
| narrow-depth | 0 | 9 | 5 | 1 |
| denial-warden | 0 | 5 | 5 | 1 |

**The passive ceiling is (12, 51, 12), and it is the whole v1 rectangle.** Every threshold below is
a multiple of it.

**Five strategies are one universe with five labels.** `passive-control`, `uniform-random-legal`,
`archivist`, `portal-rush` and `worship-maximizer` produce *identical* achievement vectors. Any
predicate that admits one admits all five; any predicate that refuses one refuses all five. This is
the binding constraint on part 3 of the claim and it is a property of the pool, not of the win
condition — see "The impossibility" below.

**`completedUniversities` is inverted.** Only the exploit probe builds any. Gating Path A on it
would hand the summit exclusively to the bot that presses buttons at random.

## The impossibility, stated so it can be checked

Part 3 of the claim — *at least three strategies win at materially different rates, none above 60%
of wins* — **cannot be satisfied by any setting of any ascension constant** while parts 2 and 4
hold. This is an argument from the measured table above, not a report of a failed search.

1. The pool contains exactly **three** distinct achievement profiles: the passive profile
   `(12, 51, 12)` shared by five strategies, `permissive-breadth` at `(15, 262, 70)`, and the two
   deniers at `(0, ≤9, ≤5)`.
2. Part 2 requires `uniform-random-legal` to lose. It carries the passive profile, so every
   predicate that refuses it refuses all five strategies in that profile.
3. The two deniers sit **strictly below** the passive profile on every axis. Any positive-achievement
   predicate that admits them therefore also admits the passive profile, contradicting (2).
4. So at most **one** strategy can win: `permissive-breadth`. One winner means `topShare = 1.0` and
   a winner count of 1.

The Pareto front over the pool's achievement vectors has **one point**: `permissive-breadth`
dominates every other strategy on all three axes at once. The degeneracy is in the strategy pool —
five bots that submit different actions and produce the same universe — and not in the predicate,
which has three axes that genuinely trade against one another.

What would change it: `permissive-breadth` is the only strategy whose actions move any measured
quantity, because the two loops that would make the other strategies' actions matter are missing.
Universities do not compound (`libraryDepth` feeds no rate — W7), and nothing is ever the last copy,
so `libraryDependence` is identically zero and redundancy buys nothing (W8's loss channel). Until
those land, "does ascension follow from play" has one bit of evidence in it.

## What must be recalibrated later, and against what

| constant | recalibrate when | because |
|---|---|---|
| `ascension-summit-cells` | W7 lands (knowledge as capital) | mastering a cell will stop being a function of time-since-permitted once library depth feeds research and teaching rates |
| `ascension-canon-breadth` | content enables cells beyond the v1 rectangle | it is a count, deliberately, so the summit does not recede as content grows — but the passive ceiling it is anchored to moves |
| `ascension-canon-cells` | same as above | anchored to the same twelve-cell rectangle |
| `ascension-loss-fraction` | W8 lands (raids engage) | it is the allowance for a loss channel that currently never fires; 5% of a canon is an untested magnitude against zero observed losses |
| `ascension-dependence-max` | W8 lands | `libraryDependence` is identically zero today, so this conjunct is inert and load-bears nothing |
| `ascension-summit-copies` | W8 lands | two copies is free when the mean is ~55 copies per node |

## Constraints held throughout

- `npm run goldens:regen` is **never** run. A failing golden test is a finding, not a regeneration.
- Balance baselines only via `regenerate-baseline.mjs`, with the constants and deltas named.
- Fixed point at 1/1024, integer comparisons, no float in the rules path.
- Every constant in validated content data, never hardcoded.
