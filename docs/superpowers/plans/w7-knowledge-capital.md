<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W7 — the knowledge-as-capital loop (vision §6a)

**Branch:** `w7/knowledge-capital`, from `integration/measured-ground` (`516ac98`).

## What this is

`vision.md` §6a names a compounding loop:

> **Knowledge as capital** — a university's output scales with the depth of its library. […] A deep
> library trains better mages, who research faster, who deepen the library.

The loop is **specified in full** — `openspec/changes/mages-and-species/specs/universities/spec.md`
carries five requirements for it, and `openspec/changes/mages-and-species/design.md` gives it four
named brakes. The arithmetic is **implemented in full**, in
`packages/rules-world/src/universities/library.ts` and `capital.ts`.

**Nothing calls it.** Before this change, `capitalRateMultiplier`, `contributionFor`,
`applyLibraryUpkeep` and `emitCapital` have exactly zero callers outside their own unit tests, and
`packages/coordination/src/world-step.ts` hardcodes `libraryUpkeep: 0`. Task 7.5 of
`mages-and-species` is ticked at function level and unsatisfied at loop level.

So this change is **wiring, not invention**. Every constant it needs already exists as authored
data; the two it adds are named in section 3 below with their reasoning.

## The falsifiable claim

On the 2400-tick, eight-strategy, 96-run round-robin sweep
(`replicates: 96`, `rootSeed: 20260811`, `cohortSize: 8`, one slot):

1. `archivist` separates from `passive-control` on `referenceNodesKnown` by **more than three
   standard errors**.
2. `referenceLibraryDepth` moves off its pinned value.
3. `capitalSnowball` reports something other than a Gini coefficient over a constant.

**Disproved by** any of the three failing on that sweep at n = 96.

### Measured before the change (this branch's parent, `516ac98`)

| strategy | nodes known | library depth | grimoires | instances |
|---|---:|---:|---:|---:|
| `passive-control` | 51.000 ± 0.000 | 1.000 ± 0.000 | 1076.0 | 2572.4 |
| `archivist` | 51.000 ± 0.000 | 1.083 ± 0.083 | 1879.8 | 1735.1 |
| `permissive-breadth` | 234.000 ± 3.254 | 2.667 ± 0.284 | 893.5 | 4919.8 |
| `narrow-depth` | 5.750 ± 0.131 | 3.750 ± 0.131 | 1212.5 | 533.7 |
| `denial-warden` | 2.000 ± 0.000 | 2.000 ± 0.000 | 44.8 | 44.8 |

`archivist − passive-control` on nodes known: **delta 0.000, on a pooled standard error of 0.000.**
The archivist funds universities, grants founding knowledge and blesses mages, and lands on exactly
the number a god who never acted lands on.

## Tasks

### 1. Instrumentation and baseline

- [x] 1.1 Capture the before-sweep: 96 runs, eight strategies round-robin, 2400 world ticks, and
  per-strategy means and standard errors for all ten reference measures. Recorded above.
- [x] 1.2 Establish which failures are which: **tripwire tests** written to fail when this is fixed,
  **balance baselines** which may be regenerated with rationale, and **golden replay fixtures**
  which may not be touched at all.
  - Goldens live in `packages/sim-core/test/golden/` and cover `sim-core`'s own substrate scenarios
    only — no world loop, no scenario content. Recorded here so that a golden failure is known to be
    a real finding rather than an expected consequence.

### 2. Route the library contribution into the shared `(1 + Σ)` accumulator

Traces to §6a *"a university's output scales with the depth of its library"* and to the
`universities` requirement *Library depth contributes bounded knowledge capital*.

- [ ] 2.1 Failing test first: a mage in a university with a deep library completes a research
  project in strictly fewer world ticks than the same mage in a university with an empty one.
- [ ] 2.2 Change the god's rate seam from *stacked multiplier* to *bonus magnitudes*
  (`researchMultiplierFor` → `researchBonusesFor`, `teachMultiplierFor` → `teachBonusesFor`), so the
  library's contribution and a blessing land in **one** accumulator and are clamped **once**.
  Without this the loop is `(1 + Σblessing) × (1 + library)` — the *"4.0 × 2.0 without anyone
  deciding it should be 8.0"* the design document rejects by name.
- [ ] 2.3 Compute per-university library depth once per world tick in `coordination`, gated by the
  ruleset so that an interdicted shelf is worth nothing (`rules-magic/instances/library-depth.ts`:
  *"A library full of interdicted books still stands […] and reports zero depth"*).
- [ ] 2.4 Apply `contributionFor(depth, species.depthCeiling)` — brake 2 — at the three rates the
  spec names: `research-rate`, `teach-rate`, `scribe-rate`.
- [ ] 2.5 Verify the conformance scan (`universities-capital-routing.test.ts`) still finds no
  contribution applied outside the shared stacking.

### 3. Close the loop's other edge: scribing must deepen the library

Traces to §6a *"who deepen the library"*. Without this the loop has no closing edge: the library's
depth is pinned at one to two distinct nodes forever, so its contribution is a constant and no
amount of research changes it.

The mechanism is already diagnosed in three committed artifacts — `vision.md` §13
(*"two distinct nodes against 1,263 books, because the scribable list is ordered by cost and every
scribe copies the cheapest thing available"*), `mages-and-species` task 9.8, and the rationale on
`balance/baselines/balance-gate-v1.baseline.json`.

- [ ] 3.1 Failing test first: two scribes in a university whose library already holds node A choose
  to write something other than A, when something else is available and affordable.
- [ ] 3.2 Order scribing candidates **novel-before-duplicate, then by cost**. Not a duplicate ban:
  brake 4 charges upkeep per instance while the contribution counts distinct nodes, and redundancy
  is the archivist's whole thesis (§5's loss channel). A second copy stays legal and stays worse.
- [ ] 3.3 Confirm research and teaching candidate ordering is bit-for-bit unchanged.

### 4. Brake 4: upkeep must actually be charged

Traces to the `universities` requirement *Libraries impose upkeep proportional to depth*.

- [ ] 4.1 Failing test first: a universe with a large library has strictly less material left at the
  end of a tick than an otherwise identical universe with a small one.
- [ ] 4.2 Charge `libraryUpkeep` in phase 9, from the value `applyLibraryUpkeep` computes, exactly
  once, with materials never going negative.
- [ ] 4.3 Degradation on shortfall, in ascending library-handle order, routed through the gateway so
  that a destroyed last instance still counts as a lost node.

### 5. Make the harness watch it (§6a: *"the balance harness must watch it specifically"*)

- [ ] 5.1 Report per-university capital emission from the world tick, via the report closure and
  never into state — no `WORLD_SCHEMA_VERSION` revision.
- [ ] 5.2 Confirm `capitalSnowball`'s quantity (`libraryNodeCount`, from
  `packages/scenario/src/executor.ts`) is no longer constant, and report its before/after value.
- [ ] 5.3 Register a capital measure the scenario sweep can actually ask for, if `capitalSnowball`
  proves unreachable from a scenario-driven sweep. Report which.

### 6. Verification

- [ ] 6.1 `npm run verify` green, including the three balance gates.
- [ ] 6.2 Balance baselines regenerated **with a written rationale** naming what moved and why the
  new numbers are right. Never `npm run goldens:regen`.
- [ ] 6.3 Re-run the 2400-tick eight-strategy sweep and report the claim's three parts, whether or
  not they hold.
- [ ] 6.4 Report the audit of specified-but-absent mechanics (§5, §6a, §7), unimplemented.

## Out of scope, deliberately

Reported, not fixed:

- Populace roles beyond laborer/scribe/student; `staffCohorts` never staffed.
- The four standing roles of §7 and the god's `assign-role` verb.
- Why no strategy moves any population metric.
- ~55 knowledge instances per known node, which makes §5's loss channel unreachable and
  `libraryDependence` identically zero.
