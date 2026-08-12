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
- [x] 4.2 Run `tune-balance.mjs` under common random numbers.
- [x] 4.3 Record what was measured for each constant, not a guess.

### 5. The claim
- [x] 5.1 2400-tick eight-strategy sweep at n >= 96, four parts reported with numbers.
- [x] 5.2 Regenerate only the baselines that moved, with a written rationale.
- [x] 5.3 `npm run verify` green.

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

## Constraints held throughout

- `npm run goldens:regen` is **never** run. A failing golden test is a finding, not a regeneration.
- Balance baselines only via `regenerate-baseline.mjs`, with the constants and deltas named.
- Fixed point at 1/1024, integer comparisons, no float in the rules path.
- Every constant in validated content data, never hardcoded.
