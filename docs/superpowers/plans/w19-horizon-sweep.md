<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W19 — the horizon sweep

**Branch:** `w19/horizon-sweep`, from `origin/integration/campaign-round-2` at `0b54c84`.
**Role:** measurer. **Changes no constant, no rule, no magnitude.** Never runs `goldens:regen`;
regenerates no balance baseline.

## The hypothesis under test

Every diversity measurement this campaign has taken was at **2400 world ticks**, and the horizon is
the one variable eight workstreams never varied. `referenceNodesKnown` is 29.4 at 600 ticks and 46.9
at 2400 against a reachable set of 51, so at 2400 a universe holds essentially everything it can
reach — and a set that contains everything is contained in every other set.

**The question: does the strategy space have more than one dimension before the content is
exhausted?**

- **Yes** — dimensionality rises and containment falls at shorter horizons — means the game works
  and the horizon is too long for its content. A configuration finding.
- **No** — one dimension even at 300 ticks, where universes hold a third of the set — means the
  flatness is in the **content graph itself**, and no mechanic fixes it.

Report whichever is found. A preference for the good outcome must not shape the analysis.

## Pre-registered, written before any number was read

Recorded so a confirming result cannot be claimed as a discovery afterwards, and so the failure
modes below cannot be quietly dropped.

1. **Containment below 1.000 at short horizons is nearly certain and is NOT the finding.**
   W15 §4 already reports min pairwise containment 0.202 / 0.437 / 0.620 / 1.000 at ticks
   240 / 480 / 960 / 1440 on the pre-integration tree. Mid-acquisition scatter produces
   sub-unity containment on its own. It is a necessary condition, not the answer.
2. **The discriminator is between-strategy variance against within-strategy noise.** A genuine
   second dimension requires strategies to differ from *each other* by more than each differs from
   *itself* across seeds. `analyse.mjs` already computes both: `variance.betweenShare` and the
   within-strategy diagonal (`withinJaccard`, `withinCosine`, diagonal containment). **Every
   per-horizon verdict must cite both, or the conclusion is manufactured.**
3. **Rank cap.** Ten strategies bound strategy-level structure at 9 components regardless of what
   the nodes do. Stated so nobody over-reads a spectrum.
4. **Two structural gates make short-horizon zeros arithmetic, not gameplay.** Reported as such:
   - `ascension-min-tick` = **600**. Horizons **300 and 450 cannot ascend at all**, by either path.
   - Enduring Canon needs `goodEraRun >= ascension-era-count` = **4**, incremented at most once per
     era boundary, and `ERA_TICKS` = **240**. The earliest possible canon is therefore tick **960**.
     **Horizons 300, 450, 600 and 900 admit apotheosis only.** Only 1200, 1800 and 2400 admit both.
5. **Saturation is defined against the v1 reachable set, and the deniers can never reach it.**
   `denial-warden` and `narrow-depth` shrink their own reachable set by edict; `permissive-breadth`
   and `permit-then-idle` enlarge theirs and hold only 25–38 of the 51 (W15). Saturation is reported
   as `|held ∩ V1| == 51` per strategy, with V1 derived from content, plus v1-coverage separately
   for the permissives.

### The reachable set, derived from content rather than assumed

`cells.v1CellIds()` returns **12** cells; the nodes whose `cellOf` lands in them number exactly
**51**, ids
`97–112, 215–231, 274–291`. Asserted equal to `passive-control`'s union across all seeds at 2400.

## Instrument — W15's tooling, reused

`tools/w15/composition.mjs` already reads node **identity** off the simulation state via an inert
probe system appended to the world schema, and `tools/w15/run-arm.mjs` already builds its own
`RunTask`s so that **every arm walks the identical `(rootSeed, sweepId, cellIndex, replicateIndex)`
grid and the factor under test is supplied out of band**. `tools/w15/analyse.mjs` already computes
the eigenvalue spectrum, the between/within variance decomposition, pairwise
Jaccard/cosine/containment and prefix fidelity, and already emits `--json`.

**Nothing is rebuilt.** The horizon becomes the out-of-band factor, exactly as the strategy and the
species mask already are.

### Common random numbers

`deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex, replicateIndex)`.
`SWEEP_ID = 'w15-dimensionality-v1'` and `ROOT_SEED = 20260811` are held constant across all seven
horizons, as are the two cells (0: `cohortSize 4, foundingNodes 1`; 3: `cohortSize 12,
foundingNodes 4`) and the replicate range. **Only `--ticks` varies.** Seed equality is therefore
true by construction for the local arms, and is *verified after the fact* by comparing the recorded
`runSeed` pairwise across horizons — the brief's requirement, and W13's method.

`assignStrategies`'s `strategies[replicateIndex % poolSize]` never runs on this path, because the
strategy is passed explicitly rather than dealt by index. **Per-strategy coverage is asserted
anyway** in the output. For the Modal arm, where round-robin *does* run, `replicates` is **400** and
the pool is **10** — 400 % 10 == 0, 40 runs per strategy, asserted from the records.

### The two additive changes, both tool-side, neither in production code

1. `tools/w15/run-arm.mjs` gains `--sample <ticks>`, defaulting to `ERA_TICKS` (240) — the existing
   behaviour, byte-identical when the flag is absent. It exists so composition can be sampled on a
   150-tick grid, which divides all seven horizons and makes the prefix cross-check below possible.
2. `tools/w19/` — a driver that fans the horizons out across local processes, and a summariser that
   folds the seven per-horizon analyses into one table. No production package is touched.

### The prefix cross-check, and why explicit caps are still authoritative

`referenceOptions` reads `cohortSize`, `foundingMages`, `foundingNodes` and `foundingSpeciesMask`
and **not** `worldTickCap`, so a shorter cap should produce a strict prefix of the longer run's
trajectory. That is a claim, not an assumption, so:

- **Each horizon is run with its own explicit `--ticks` cap.** These are the numbers reported. If
  the prefix property fails, they remain valid.
- **The 2400 arm's sample at tick H is compared against the H-cap arm's terminal composition**, run
  for run. Agreement counts are reported. This is a free validity check, not the measurement.

## Arms

| arm | what varies | strategies | cells | replicates/cell | runs |
|---|---|--:|--:|--:|--:|
| **A — horizons** | `--ticks` ∈ {300, 450, 600, 900, 1200, 1800, 2400} | 10 | 2 | 20 | **400 per horizon, 2800 total** |
| **B — species** | `foundingSpeciesMask` ∈ {8 gnome, 16 human} × the same 7 horizons | 3 | 2 | 12 | 1008 |
| **C — Modal** | `termination.worldTickCap`, one sweep file per horizon, everything else identical | 10 | 1 | 400 | 400 per horizon, 2800 total |

Arm C is the production sweep path (`run-sweep-distributed.mjs --backend modal`) and carries
`ascensionRate` and `referenceNodesKnown` at n = 400 per horizon on the **production** executor.
**It cannot carry composition**: no committed record in this repository holds node ids, which is why
W15's probe exists at all. The split is disclosed rather than smoothed over.

## What is reported, per horizon

Saturation first, because it is the variable that should explain everything else.

1. **Saturation fraction** — share of runs holding all 51 v1 nodes; and v1-coverage for the
   permissives, which leave the subset.
2. **Effective dimensionality** — eigenvalue spectrum over the strategy × node matrix, components
   for 80% and 95%, participation ratio, **and the between-strategy variance share beside the
   within-strategy diagonal**.
3. **Cross-strategy containment** — mean and minimum pairwise `|A∩B| / min(|A|,|B|)`.
4. **Prefix fidelity** — does one fixed node ordering predict each run's set from its count alone?
5. **Per-strategy node counts and the spread between them.**
6. **Species divergence** — gnome vs human paired containment and union/intersection, by horizon.
7. **Ascension**, for horizons ≥ 600 only, with the canon gate stated: rate, path split, and
   whether `permit-then-idle` still wins.

## Tasks

- [ ] Commit and push this plan
- [ ] Confirm `probeIsInert` on **this** tree — W15 validated it on a branch from `main`, before
      W8's raid systems merged. If it is not inert, every number below is void.
- [ ] Add `--sample` to `run-arm.mjs`; confirm the default path is unchanged
- [ ] Write `tools/w19/fan-out.mjs` and `tools/w19/summarise.mjs`
- [ ] Arm A — 7 horizons × 10 strategies × 40 runs
- [ ] Prefix cross-check: 2400 samples vs capped terminals
- [ ] Arm B — gnome and human at every horizon
- [ ] Arm C — seven Modal sweep files; verify `runSeed` equality pairwise across horizons
- [ ] Assert per-strategy coverage in every arm
- [ ] Write `docs/design/horizon-sweep.md`
- [ ] `npm run verify`, reported exactly. No golden fixture, no balance baseline regenerated.

## Status

In flight.
