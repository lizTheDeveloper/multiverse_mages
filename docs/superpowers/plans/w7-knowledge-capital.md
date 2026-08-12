<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W7 — the knowledge-as-capital loop (vision §6a)

**Branch:** `w7/knowledge-capital`, from `integration/measured-ground` (`516ac98`).
**Status:** complete. `npm run verify` green — 260 files, 3,675 tests, three balance gates PASS.

## What this is

`vision.md` §6a names a compounding loop:

> **Knowledge as capital** — a university's output scales with the depth of its library. […] A deep
> library trains better mages, who research faster, who deepen the library.

The loop is **specified in full** — `openspec/changes/mages-and-species/specs/universities/spec.md`
carries five requirements for it, and `openspec/changes/mages-and-species/design.md` gives it four
named brakes. The arithmetic was **implemented in full**, in
`packages/rules-world/src/universities/library.ts` and `capital.ts`.

**Nothing called it.** Before this change, `capitalRateMultiplier`, `contributionFor`,
`applyLibraryUpkeep` and `emitCapital` had exactly zero callers outside their own unit tests, and
`packages/coordination/src/world-step.ts` hardcoded `libraryUpkeep: 0`. Task 7.5 of
`mages-and-species` is ticked at function level and was unsatisfied at loop level.

So this change is **wiring, not invention**.

## The falsifiable claim, and its verdict

On the 2400-tick, eight-strategy, 96-run round-robin sweep (`rootSeed: 20260811`, `cohortSize: 8`,
one slot, 12 runs per strategy):

| # | claim | verdict |
|---|---|---|
| 1 | `archivist` separates from `passive-control` on `referenceNodesKnown` by more than three standard errors | **DISPROVED** — both end at exactly 51.000 ± 0.000, before and after |
| 2 | `referenceLibraryDepth` moves off its pinned value | **HELD** — archivist 1.083 → 48.250, a 33.25-point gap at **40.7 SE** |
| 3 | `capitalSnowball` measures something real | **HELD** — 0.2973 → 0.5024, over a quantity that went from taking 5 values to taking 40 |

**Why 1 fails, and why it is not a defect in the loop.** 51 is the *ruleset* ceiling: neither
strategy permits an axis, so both exhaust everything the v1 rectangle allows. The loop moves the
**rate** of knowing, not the **ceiling** of the knowable. The proof that it works is in the one
strategy with ruleset headroom: `permissive-breadth` went **234.0 ± 3.25 → 248.7 ± 3.97**, a ~2.8 SE
separation on nodes known attributable to the loop alone. Making an economic decision move the
ceiling is a design question for the author.

### Per-strategy, before → after

| strategy | nodes known | library depth | grimoires | ascension |
|---|---|---|---|---|
| `passive-control` | 51.000 → 51.000 | 1.000 → **15.000** | 1076 → 15 | 0/12 → 0/12 |
| `archivist` | 51.000 → 51.000 | 1.083 → **48.250** | 1880 → 767 | 12/12 → 12/12 |
| `uniform-random-legal` | 50.667 → 50.750 | 1.000 → **38.667** | 1126 → 168 | 12/12 → 12/12 |
| `permissive-breadth` | 234.0 → **248.7** | 2.667 → 23.000 | 894 → 39 | 12/12 → 12/12 |
| `worship-maximizer` | 51.000 → 51.000 | 1.250 → 15.750 | 1199 → 29 | 12/12 → 12/12 |
| `portal-rush` | 51.000 → 51.000 | 1.000 → 14.167 | 1100 → 37 | 12/12 → 12/12 |
| `narrow-depth` | 5.750 → 5.750 | 3.750 → 5.750 | 1213 → 15 | **12/12 → 0/12** |
| `denial-warden` | 2.000 → 2.083 | 2.000 → 2.083 | 45 → 42 | 12/12 → 11/12 |

Pool ascension rate 0.875 → 0.740. `narrow-depth` flipping to 0/12 is the largest single behavioural
consequence in the change and is discussed in the report.

## Tasks

### 1. Instrumentation and baseline

- [x] 1.1 Capture the before-sweep: 96 runs, eight strategies round-robin, 2400 world ticks,
  per-strategy means and standard errors for all ten reference measures.
- [x] 1.2 Establish the failure taxonomy — **tripwires** written to fail when this is fixed,
  **balance baselines** which may be regenerated with rationale, **golden replay fixtures** which
  may not be touched at all. Goldens live in `packages/sim-core/test/golden/` and cover `sim-core`'s
  own substrate scenarios only: no world loop, no scenario content. **No golden fixture's behaviour
  changed, and none was regenerated.**

### 2. Route the library contribution into the shared `(1 + Σ)` accumulator

- [x] 2.1 Failing test first — `packages/coordination/test/unit/knowledge-capital.test.ts`.
- [x] 2.2 Changed the god's rate seam from *stacked multiplier* to *bonus magnitudes*
  (`researchBonusesFor` / `teachBonusesFor`), so a blessing and a library land in **one** accumulator
  and are clamped **once**. Two stacked multipliers multiplied is the *"4.0 × 2.0 without anyone
  deciding it should be 8.0"* `design.md` rejects by name.
- [x] 2.3 `packages/coordination/src/capital.ts` computes per-university library depth once per
  world tick, gated by the ruleset so an interdicted shelf is worth nothing and costs the same.
- [x] 2.4 `contributionFor(depth, species.depthCeiling)` — brake 2 — applied at `research-rate`,
  `teach-rate` and `scribe-rate`. Research goes through `rules-magic`'s own `researchRate` seam
  (which scales the *requirement*); teaching and scribing have no such seam so the rate scales the
  months, exactly as the god's multiplier already did.
- [x] 2.5 `universities-capital-routing.test.ts` extended to scan `packages/coordination/src` as
  well, and still finds no contribution applied outside the shared stacking.

### 3. Close the loop's other edge: scribing must deepen the library

- [x] 3.1 Failing test first.
- [x] 3.2 Scribing candidates ordered **novel-before-duplicate, then by cost**. Not a duplicate ban:
  brake 4 charges upkeep per instance while the contribution counts distinct nodes, and redundancy
  is the archivist's thesis. **This is a tie-break decision made by this change and it is flagged in
  the report for the author** — alternatives considered are recorded there.
- [x] 3.3 Research and teaching ordering unchanged: `libraryHolds` is set only by the scribing scan.
- [x] 3.4 An affordability filter on the scribable list, so the goal mask's promise and the target
  choice are the same promise.

### 4. Brake 4: upkeep is charged

- [x] 4.1 Failing test first.
- [x] 4.2 `libraryUpkeep` is a real demand, reserved out of the scribes' stock at the top of the tick
  so it cannot be spent twice; materials never go negative.
- [x] 4.3 Degradation on shortfall, ascending library handle, **duplicates before singles**, routed
  through the gateway so a destroyed last instance counts as a lost node.

### 5. Make the harness watch it

- [x] 5.1 Per-university capital emission reported from the world tick, never into state. **No
  `WORLD_SCHEMA_VERSION` revision was needed.**
- [x] 5.2 `capitalSnowball`'s quantity (`libraryNodeCount`) is no longer constant: checkpoint values
  went from `{1,2,3,4,5}` to a spread running 2–51, and the Gini from 0.2973 to 0.5024.
- [ ] 5.3 **Not done, and reported instead:** `capitalSnowball` is not nameable in a scenario-driven
  sweep's `metrics` list — the scenario registers only the ten `reference*` measures, so
  `run-sweep` refuses the name. The metric *is* computable from the committed run records without
  retrofit, which is what the `universities` spec requires, and it was computed that way here.
  Registering it is `agent-interface`'s call, not this change's.

### 6. Verification

- [x] 6.1 `npm run verify` green: 260 test files, 3,675 tests, three balance gates PASS.
- [x] 6.2 All three balance baselines regenerated with a written rationale naming the five
  mechanisms. `npm run goldens:regen` was never run.
- [x] 6.3 The 2400-tick eight-strategy sweep re-run and reported above, including the disproved part.
- [x] 6.4 Audit of specified-but-absent mechanics — in the report.

### 7. Reverted on instruction

- [x] 7.1 A mastery-gain path (`rules-magic/src/instances/practice.ts`) was implemented against a
  stated defect — researched instances born below the teach threshold with no way up — and
  **reverted whole** when the premise turned out to be false: the reference universe runs
  **true-naming**, whose `acquire` hook creates instances at `fp(1024)`. The measurement it produced
  survives in the report; the code does not.

### 8. Added instead: the tradition axis is a sweep factor

- [x] 8.1 `traditionIndex` joins `REFERENCE_FACTOR_IDS`, defaulting to the tradition
  `scribingTraditionId` already chose, so adding the knob moved no committed number.
- [x] 8.2 `makeReferenceExecutor` stops closing over a content set when the caller supplied none —
  a set resolved once at build time answered every level of the factor with the same tradition.
- [x] 8.3 144-run sweep across all three traditions; the table is in the report.

## Out of scope, reported not fixed

- Populace roles beyond laborer/scribe/student; `staffCohorts` never staffed; `advanceConstruction`
  never called from the loop.
- The four standing roles of §7: `warden` and `raider` bias mages toward goals with no accrual path.
- Why no god action moves any population metric.
- `gatherEffects` — one of sixteen primitives is both reachable and node-driven.
- The `standard` acquire hook's latent 256-vs-512 mastery gap, live only in the two traditions the
  reference universe does not run.
