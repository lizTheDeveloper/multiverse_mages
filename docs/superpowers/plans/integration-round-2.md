<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Integration round 2 — measure the six workstreams together

**Branch:** `integration/campaign-round-2`, from `origin/main` at `6e5ecee`.

## Why this exists

Six workstreams landed independently, each green on its own branch, and no two of them have ever
been measured together. Several move the same numbers in opposite directions. The sharpest case:
**W6 measured `ascensionRate` 0.125 and W8 measured 0.854, on branches that do not contain each
other.** Neither number describes the game. This workstream produces the number that does.

## The ancestry fact that reorders the brief

`w17/value-sensitive-acquirer` **exists on the remote and already contains `w7/knowledge-capital`
and `w15/strategy-dimensionality`** (`git merge-base --is-ancestor` confirms W7 is an ancestor of
W17). Two consequences:

1. **The `compareTargets` collision is already resolved**, deliberately, by W17's merge commit
   `1acf8e5`. It is not an open question for this workstream to decide — it is a decision to verify
   survives and to state. See "Collisions" below.
2. **W17 is not optional for the measurement.** `foundingSpeciesMask`, which D7 requires, is a W15
   commit and reaches `main` only through W17's ancestry.

W7 is still merged as its own step, before W17, so that the knowledge-capital deltas are attributed
to W7 and only the W15+W17 delta is attributed to W17. Git handles the ancestor merge cleanly.

## Merge order

| # | branch | what it carries | behaviour? |
|---|---|---|---|
| 1 | `w14/ci-dedupe` | CI concurrency + doc corrections | no |
| 2 | `w11/modal-sweep-fanout` | distributed sweep execution | no (byte-identical) |
| 3 | `w13/tradition-sweep` | tradition selector as a sweep factor | no (absent key = identity) |
| 4 | `w6-verify/positive-achievement` | the ascension predicates **+ the adversarial verification** | **yes** |
| 5 | `w7/knowledge-capital` | §6a compounding loop, novelty-first scribing, library upkeep | **yes** |
| 6 | `w8/raid-engagement-live` | raids fire, looting, durability-gated burning | **yes** |
| 7 | `w17/value-sensitive-acquirer` | value-sensitive acquirer + W15 instruments | **yes**, **squashed** |
| 8 | `w10/server-contracts` | `packages/server`, a leaf nothing imports | no |

`npm run verify` after each merge; per-stage results recorded, not "chain green".

## Standing rules for this workstream

- **Never `npm run goldens:regen`.** A golden fixture failing is a determinism finding: STOP,
  report the diff, do not resolve it.
- **A balance-gate failure is not a golden failure.** From merge 4 onward the three
  `balance:gate*` stages are *expected* to fail, because W6/W7/W8/W17 each regenerated all three
  baselines against a different tree and the gate refuses cross-build comparison. The gate's
  printed metric deltas at each step **are** the "what moved" record.
- **Baselines are regenerated exactly once, after every merge**, with a single written rationale
  naming every mechanism that moved and its measured delta. Never mid-sequence.
- **`git add -A` is unsafe here.** The tuner rewrites `packages/content/data/god-constant.json`
  and a concurrent `add -A` has already committed a trial value once (`975e177`, reverted in
  `41d40be`). Stage explicit paths.
- If `package-lock.json` conflicts: `npm install`, commit the result. It auto-merges wrongly.
- `npm run verify` can fail spuriously under load with `Timeout calling "onTaskUpdate"` *after*
  all tests pass — `reference-long-run.test.ts` blocking a worker ~146 s past vitest's RPC budget.
  Re-run stages individually. **Do not raise a timeout to make a chain green.**

## Collisions, and how each is resolved

### 1. `compareTargets` in `agent-api`/`rules-world` `autonomy/candidates.ts` — W7 vs W17

**Resolved upstream, by W17, as two mechanisms composed — not one mechanism.** Verbatim from
`1acf8e5`:

> W7 made compareTargets order scribing candidates novel-before-cheap — a binary fact about
> redundancy on one goal. W17 makes chooseTarget an argmax over a utility score — a magnitude about
> value on all five target-taking goals. They are composed rather than merged. `compareNovelty` is
> factored out of `compareTargets` and applied FIRST in `compareAppeal`, so novelty partitions the
> candidate list and the utility score decides inside the partition. Folding the binary into the
> bounded additive sum has only two outcomes: a bound small enough to be outvoted, which restores
> the 1,263-books-two-nodes defect W7 measured, or a bound large enough to dominate, which is a
> lexicographic prefix wearing a magnitude's clothes and lying about it in the ablation report.

**This workstream's position: adopt it, and say so.** They are two mechanisms. The argument for
keeping them apart is a measurement argument — folding them destroys the ablation's honesty — and
that is the right kind of argument. My job is to verify the composition *survives* the W8 merge,
which touches neighbouring files, and to check the consequence below.

### 2. `narrow-depth` 12/12 → 0/12 must stay broken

W7's novelty-first scribing made shelves hold single copies that upkeep can destroy, which
partially breaks *"doing nothing is perfect custodianship"*. **That is a feature.** If a later merge
restores duplicate-heavy shelves the defect returns. Checked explicitly in the final sweep.

### 3. W8's three constants were calibrated against a world where recovery did not exist

`inbound-raid-chance-per-world-tick`, `looted-grimoires-per-raid`, and the rival mastery grants
were all calibrated before W7 changed recovery. W8 flagged all three as wanting revisiting.
**Report whether they now need it; do not silently retune them.**

### 4. Baselines

W6, W7, W8 and W17 each regenerated all three. One regeneration at the end, one rationale.

### 5. Two tradition-selector sweep factors, added independently by W7 and W13

**Found while scouting the W7 merge; the brief did not name it.** Both workstreams added a way to
select the universe's tradition as a sweep factor, for the same reason, in the same file, doing the
same thing — memoize resolved content per tradition, resolve it before `Scenario.create`:

| | W13 | W7 (inherited by W17) |
|---|---|---|
| factor id | `tradition` | `traditionIndex` |
| level | the `tradition.json` **id** string | an **ordinal** into content order |
| lives in | resolved in `executor.ts`, not a `ReferenceOptions` field | a required `ReferenceOptions` field |
| cache | `CONTENT_BY_TRADITION`, keyed by string | `contentByTradition`, keyed by number |

**Resolved: one mechanism, and W13's wins. `traditionIndex` is deleted.**

The reason is in W13's own code, which considered the ordinal and rejected it — `traditionOf`
refuses a non-string level because an id "would move the day a tradition is added". That is not a
style preference here, it is *this campaign's own most-cited defect*: the reference tradition turned
out to be True Naming **by accident of the alphabet**, because `scribingTraditionId` walked
traditions in interned — lexicographic — order. An ordinal into content order is the same hazard
with a committed sweep file attached to it. `CLAUDE.md` also has content living in validated data
files and never hardcoded; an ordinal index into content order is a hardcoded content reference.

W13's is also the mechanism already backed by three committed sweep files and by the documented
common-random-numbers discipline (one level per file, all files sharing `sweepId` and `rootSeed`).

Behaviour-neutral: W7's default `defaultTraditionIndex(registry)` resolves to the same tradition as
`scribingTraditionId(registry)`, which W7 itself recorded as the reason no committed number moved.
Blast radius is three source files — `reference-universe.ts`, `executor.ts`, `long-run.ts` — plus
docs. `foundingSpeciesMask`, which arrives in the same `ReferenceOptions` from W15, is orthogonal
and **kept**; D7 needs it.

**Acceptance check, run after the W7 merge and again after W17** (which re-introduces the same
code): `git grep -n traditionIndex` returns nothing outside documentation quoting this decision,
and no `defaultTraditionIndex` / `traditionOrder` helper is left dangling.

### 6. W17 rewrote an assertion inside W7's test — to be checked, not taken on trust

W17 reports that W7's capital test asserted `researchCompleted`, which **inverts** under the
value-scored acquirer (4131 scholarly against 4142 bare), and that zeroing the five non-effort
bounds reverses the inversion — which is the discriminating experiment that says "reordering", not
"merge defect". The assertion now counts books instead. W17's argument that this is a *metric*
inversion rather than a regression is that the deep library still yields more distinct nodes
(42 against 41), more instances, and 40% more books.

**This is verified here rather than accepted**, because a workstream rewriting another workstream's
assertion is exactly the move that hides a regression.

## Defects found while reading, before merging

- **`packages/content/src/autonomy.ts` on W17 contains a raw NUL byte at offset 7617**, inside the
  template literal ``` `${record.role}\0${record.primitive}` ``` used as a composite-key delimiter.
  Git therefore classifies the whole file as binary: no diff, no review, no three-way merge. Fixed
  as its own commit at the W17 step by replacing the raw byte with the `\u0000` escape, which is
  the identical string at runtime. Reported as a W17 defect.
- **`.w17-masks.sh` and `.w17-run.sh` are committed at the repository root** on W17 — throwaway
  sweep launchers. Flagged, not removed; that is the author's call.
- **W17's commits `5afce74` and `1acf8e5` carry ~60,000 lines of `.w17/` sweep JSON.** A later
  commit untracked the files, but the blobs remain in the pushed history and a normal merge would
  put them in `main` permanently — and this is a public repository, so "permanently" is the
  operative word. **W17 is therefore merged with `--squash`**, which takes its tree and leaves its
  history behind. This is the one branch merged that way, and the reason is recorded on the commit.
  W7 is merged normally: it is a legitimate ancestor of W17 and carries none of those blobs, so
  merging it first keeps its authorship and its deltas attributable.

## The adversarial verification, and what it does to the instruments

An adversarial review of W6 landed mid-integration, on `w6-verify/positive-achievement` (which
**contains** `w6/positive-achievement`, so it is merged in its place). It invalidates three of the
instruments this workstream was going to measure with. Each is carried into the measurement design
rather than worked around.

### V1 — round-robin assignment ignores `cellIndex`, so the tuner swept six of eight strategies

`assignStrategies` under round-robin at one slot is `strategies[replicateIndex % poolSize]`, and
`cellIndex` never enters it. `tune-balance.mjs` defaults to `--replicates 6` against an
eight-strategy sweep, so **every trial of W6's calibration scan ran only six strategies** —
`portal-rush` and `worship-maximizer` got zero runs. The scan's own rows confirm the arithmetic:
`13 → 0.167` is 4/24 with poolMean 1/6.

**Consequence for this workstream:** `replicates` **must be a multiple of the pool size**, or the
sweep measures a subset. Strategy coverage is asserted from the output — runs counted per strategy,
all pool members present — before any aggregate is trusted. Pinned upstream in
`packages/mc-harness/test/unit/round-robin-coverage.test.ts`.

### V2 — D2 is D1 restated, not an independent constraint

`scoreBalance` computes `poolMean` **including** the probe, so with balanced runs
`exploitMargin ≡ ascensionRate − probeRate`; and `EXPLOIT_MARGIN_MIN` (0.05) happens to equal
`band.min` (0.05). Measured: 0.1250 and 0.1250; 0.1146 and 0.1146 — the same number twice.

**Consequence:** D1 and D2 are reported separately, with the plain statement that **D2 carries no
information while the probe loses**. They are not presented as two independent passes.

### V3 — D4's correlation is one point against a cluster

W6's +0.955 is over eight points, **seven of them at rate 0**. Drop `permissive-breadth` and the
rate vector has zero variance and Pearson is undefined. Spearman over the same data is **0.615**.

**Consequence:** Pearson and Spearman are both reported, with the count of strategies at a non-zero
rate. A correlation over one outlier and seven ties is not evidence of a relationship.

### V4 — the predicates read the ruleset, not play. This is the one that matters.

`permit-then-idle` submits `permitTechnique`/`permitForm` for 140 of 2400 ticks and an **empty**
preference list for the remaining 2260. It funds nothing, encourages nothing, blesses nobody.
Measured: **12/12, mean nodes 231.0, median tick 1202, apotheosis 6 / canon 6** — `permissive-breadth`'s
exact profile on different seeds. So `permissive-breadth`'s funding, dispensations and research
encouragement contribute **nothing**, and the predicates measure what the god *permitted*.

Adding the probe pushes `ascensionRate` to **0.2500 — out of band**, which makes the band a property
of pool composition rather than of the ruleset.

**Consequence, and it is not optional:** the D1–D9 sweep runs the **ten**-strategy pool including
`permit-then-idle` and `idle-then-declare`. A pool that cannot detect a ruleset-only winner is not
an instrument. **D1 is expected to fail once `permit-then-idle` is in.** It is reported honestly;
reverting to the eight-strategy pool to keep a green number is exactly the fitting this campaign
forbids.

### V5 — two smaller corrections carried into the report

- **`a319285`'s stated premise is false.** It claims nothing in the pool exceeds 15 mastered cells
  so 18 makes Path A dead. Measured at n=384 with summit-cells 18: **apotheosis = 12 of 44 wins.**
  Path A was alive. 13 may still be the right value; the argument given for it is not.
- **Path A is `cohortSize`-conditional.** At 13, apotheosis fires **0/12 at cohortSize 4** and 11/12
  at cohortSize 12. "Both paths live" holds in half the factor space.

### What survived, and it is W6's strongest result

The **identity property** is confirmed: a differential test drove both `origin/main` predicates
against the shipped ones over **40,000 randomised fact sets** with zero disagreements, and an
end-to-end identity run reproduced W6's pre-change table cell for cell. The in-band rate, the
*sign* of the margin against an honest idle probe, and the D3 impossibility all hold.

## The measurement

After all merges, baselines regenerated once: the 2400-tick **ten**-strategy sweep — the eight plus
`idle-then-declare` and `permit-then-idle` — at **n = 400**, via Modal (W11).

`n = 400` rather than 384: V1 requires `replicates` to be a multiple of the pool size, 400 is the
smallest multiple of ten at or above the brief's floor of 384, and it gives **40 runs per strategy**.

Reported against D1–D9, plus `capitalSnowball` against its 0.35 guard and the per-tradition table.

### Every criterion is reported **failed** or **saturated**, and those are different findings

W17 made the acquirer value-sensitive and **all four of its own pre-registered thresholds failed** —
prefix fidelity fell only 0.943 → 0.909, containment stayed 1.000. The reason is not the selector:

> **Five of seven unrestricted strategies still end holding all 51 reachable v1 nodes** (mean 51.0,
> union 51, intersection 51). Gnome and human both exhaust the 49 reachable at `depthCeiling: 4`.

**A set that contains everything is contained in every other set.** Containment 1.000 and near-perfect
prefix fidelity are *arithmetic about the ceiling*, not observations about the queue. The same holds
for **D6** and **D7**: neither can register a change while every unrestricted strategy exhausts the
reachable set. They are measured, and reported **saturated** — not failed. Only one of those two
words is a statement about the game.

Every measure that is *not* saturated moved a long way, which is what shows the selector is no longer
blind: effort-shape participation ratio **2.39 → 4.89**; tick-240 minimum containment
**0.742 → 0.612**; `denial-warden`↔`narrow-depth` containment **0.771 → 0.643**; human's cross-seed
intersection **37 → 0**; every species roughly **twice as fast** to tier 3. And the cleanest summary
of W17 in one line, from its own baselines: `referenceNodesKnown` at 600 ticks **22.1 → 29.4
(+48.6 SE)**, at 2400 ticks **unchanged** (46.93 → 46.86, −0.6 SE). **Much sooner, same place.**

The campaign now has **four independent confirmations that the binding constraint is content
exhaustion** — W15's prefix fidelity, W13's teaching result, W7's ceiling-versus-rate finding, and
W17's saturation. The forced next step is that **a universe must not be able to exhaust the reachable
set**, and W8's looting is the only mechanism yet measured that crosses it, at ~9 nodes per run from
cells the god forbids.

Two instrument facts already established by reading the tree, before any number is taken:

- **Arm-scoped metrics need not be named.** `armMetricsFor` in `mc-harness/src/runner.ts` runs
  `BALANCE_METRIC_REGISTRY` — not the sweep's own — over any arm that describes itself, so
  `ascensionRate` and `capitalSnowball` come out of a reference sweep without appearing in its
  `metrics` list. W7's plan recorded the opposite; the code is the authority.
- **`knowledgeHalfLife` still cannot be computed, and D5 will say so.** It is a *per-run* metric,
  so it must be named in the sweep's `metrics`, and a sweep may name only the ten `reference*`
  measures the scenario registers. Underneath that, `CensusSample` carries `nodesKnown` as an
  aggregate count and no node-id list, so the Kaplan–Meier estimator over node cohorts has no
  input. This is exactly what W8 reported and it is unchanged by any merge here.

## Progress

- [x] Branch cut from `origin/main`, `npm ci`
- [x] Board, `CLAUDE.md` and every branch report read
- [x] 1. `w14/ci-dedupe` — clean; verify deferred to step 2 (both behaviour-free)
- [x] 2. `w11/modal-sweep-fanout` — clean. **Reference verify: 3682 tests / 261 files pass, all
      three gates PASS with delta 0.00000 on every metric.** This is the number every later step
      is compared against.
- [x] 3. `w13/tradition-sweep` — clean. Verify **EXIT=0**, all three gates PASS at delta 0.00000,
      which is the byte-identity claim W13 made for an absent factor key, confirmed on a tree that
      is not W13's.
- [x] 4. `w6-verify/positive-achievement` — clean, **no conflicts**. Verify **EXIT=0**: 3709 tests
      in 264 files, all three gates PASS at delta 0.00000 against W6's own regenerated baselines,
      which this tree reproduces exactly. What moved, from the baseline values themselves:
      - **600-tick and 240-tick gates: nothing.** Every value identical to `main`'s
        (`referenceGrimoires` 97.0450, `referenceNodesKnown` 21.4250, …). The predicates change
        terminal status and those two gates do not measure it. Clean attribution.
      - **2400-tick ascension gate: a great deal**, all of it the same mechanism — runs no longer
        end early, because ascension got hard. `referencePeakPopulation` **19340 → 50049**,
        `referencePopulation` **4859.31 → 19769.0**, `referenceKnowledgeInstances`
        **2025.38 → 2746.66**, `referenceGrimoires` **1012.56 → 1230.41**, `referenceLivingMages`
        **73.28 → 111.63**, `referenceNodesKnown` **58.53 → 60.84**.
- [ ] 5. `w7/knowledge-capital`
- [ ] 6. `w8/raid-engagement-live`
- [ ] 7. `w17/value-sensitive-acquirer` (+ the NUL fix)
- [ ] 8. `w10/server-contracts`
- [ ] Single baseline regeneration, with its rationale
- [ ] Final sweep at n ≥ 384, D1–D9 reported
