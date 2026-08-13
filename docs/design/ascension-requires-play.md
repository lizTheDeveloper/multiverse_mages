<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Ascension requires play — the claims, written before the measurement

**Companion to `integration-round-2-results.md`,** which is the diagnosis this change acts on, and
to `openspec/changes/god-agency/specs/ascension-and-prestige/spec.md`, which is the rule.

Four claims, each naming what would refute it, authored **before** the sweep was run.

**Every verdict below was `unmeasured` when the claims were committed, and that was the point.** They
were filled in by a later commit, so the git history shows the claims were fixed before the numbers
existed rather than after — `git show 878ea28` is the commit where they were still unanswered. A
predicate's refutation written once the answer is known is a rationalisation.

**All four hold.** Not one was edited between being written and being answered; the `procedure` and
`refutedBy` fields are byte-identical to `878ea28`, and only `verdict`, `verdictReason` and
`evidence` were added. The result, in one line: **the exploit is closed, the conjunct is reachable,
and the pool still holds one winning profile rather than three.**

### What had already been seen when these claims were fixed

Stated because a claim written after a glimpse of the answer is worth less than one written blind,
and the reader cannot tell which this is unless it is said. Before the claims below were finalised,
the instrument was smoke-tested at **one replicate per starting position** — four runs per arm, not
the forty each claim asks for — to check that the constant override reached the predicate at all:

- `permit-then-idle`, before-arm, 1200 ticks: one of four positions ascended at tick 960 by Enduring
  Canon, holding 196 nodes and **one** university, which is the seeded academy.
- The same coordinates, after-arm: truncated, `ascensionFirstMetTick = 0`.
- `passive-control`, on the shipped tree at 2400 ticks: 0 of 4 qualified.

So the direction of claims 1 and 2 was not a surprise by the time they were written. What was not
known, and is what the claims are actually for, is whether either survives at n=40 across all four
positions, and whether `open-then-build` can clear a conjunct that nothing else in the pool can.

## The ascension gate moved, and what moved it

`balance/README.md` predicted this in as many words: *"when it lands **every number in that file
should move**. That is the gate working, not a defect."* It did, and every one of the ten metrics
stayed inside tolerance at k=3, the largest at **1.55 SE**:

| metric | baseline | current | delta | SE |
|---|---|---|---|---|
| `referenceKnowledgeInstances` | 3266.59 | 4016.63 | **+750.03** | 1.55 |
| `referencePopulation` | 15732.3 | 17866.4 | **+2134.16** | 1.48 |
| `referencePopulationChange` | 15588.3 | 17722.4 | **+2134.16** | 1.48 |
| `referenceNodesKnown` | 60.8750 | 69.0625 | **+8.19** | 0.73 |
| `referenceNodesGained` | 58.3750 | 66.5625 | **+8.19** | 0.73 |
| `referenceNodesGainedFinalQuarter` | 4.87500 | 3.21875 | **−1.66** | −0.78 |
| `referenceGrimoires` | 283.563 | 255.219 | **−28.34** | −0.64 |
| `referenceLibraryDepth` | 34.1250 | 37.5625 | **+3.44** | 0.52 |
| `referenceLivingMages` | 459.875 | 461.563 | **+1.69** | 0.01 |
| `referencePeakPopulation` | 29490.0 | 29490.0 | **0.00000** | 0.00 |

**The mechanism is proven, not inferred.** The sweep round-robins eight strategies over 32 runs, so
each gets four. In the paired re-run at these coordinates — same seeds, one constant apart —
`snapshotHash` is **bit-identical across the two arms for all 40 paired runs each** of
`passive-control`, `idle-then-declare`, `denial-warden`, `narrow-depth`, `portal-rush` and
`worship-maximizer`. `snapshotHash` digests the whole simulation state, so a match means the two
arms produced the same world at every tick, not merely the same aggregates. **The conjunct changes
nothing for a universe that was never going to qualify.**

What changed is `permissive-breadth`, which ascended 40/40 before and 0/40 after. Its four runs now
play to the 2400-tick cap instead of terminating near tick 1094 — and **a longer run accumulates
more of every stock**, which is the sign of every delta above. The two negative entries fit the same
story rather than contradicting it: `referenceNodesGainedFinalQuarter` falls because a run that no
longer ends early has a *later* final quarter, by then already at the content ceiling, and
`referenceGrimoires` falls because the arms that keep running are the breadth-permitting ones whose
mages research rather than copy. `referencePeakPopulation` — a **max** aggregation — moved by
exactly zero, which is what should happen when the changed runs never held the maximum.

**The direction is the point.** These numbers rose because a universe that used to win by editing
the ruleset and then idling now keeps running instead of stopping at its own coronation.

### Four tolerances widened, and the honest reading of that

`balance/README.md`'s instruction is *"do not widen a tolerance"*, and the regenerated file has four
tolerances larger than the ones it replaced:

| metric | tolerance before → after | standard error before → after |
|---|---|---|
| `referenceKnowledgeInstances` | 1455.70 → **2235.54** | 485.23 → 745.18 |
| `referenceNodesKnown` / `...Gained` | 33.44 → **45.05** | 11.15 → 15.02 |
| `referenceLibraryDepth` | 19.95 → **24.30** | 6.65 → 8.10 |

**No tolerance was set.** `tolerance = standardError × toleranceK`, `toleranceK` is **3** in both the
old file and the new one, and the flag that would change it was never passed — verified by diffing
the field. Every number in the right-hand column is a *measurement of the sweep's own variance*, and
four of them went up because the sweep genuinely became more variable: four of its 32 runs stopped
terminating early, so those arms now run 2400 ticks and accumulate stock that the other 28 do not.
A pool with one strategy running twice as long as it used to has a wider spread, and the estimator
reports it. Six other tolerances *narrowed* in the same regeneration, which a widening-for-comfort
would not produce.

**The distinction that matters, stated so a reviewer can reject it if they disagree:** widening a
tolerance is choosing to be told about fewer regressions; this is the instrument reporting that the
thing it measures got noisier. The first is a decision, the second is data. But the *consequence* is
the same either way — **this gate is now less sensitive on four metrics than it was**, and a future
regression in knowledge instances would need to be half again as large to trip it. That is a real
cost of this change and it is not paid back by the reasoning above.

**The remedy, and why it is deferred — a decision on the record, not an omission.** The fix is to
raise `replicates` in `balance-gate-ascension.sweep.json`: standard error falls with the square root
of the sample, so tolerances tighten without touching `toleranceK` and without asking the gate to
ignore anything. It is deliberately **not** done here, because four approved changes already
invalidate every committed baseline:

| change | what it moves |
|---|---|
| `w69/grant-budget` | founding grants become scarce — directly the surplus this branch measured |
| `w70/opening-square` | a universe begins at 2×2 of the grid instead of twelve cells |
| `w77/effect-displacement` | economy effects gain a cost term |
| `w80/research-cost-variation` | `researchCost` stops being a pure function of tier |

The last one bears hardest on exactly the four widened metrics. **All 300 nodes carry exactly six
distinct `researchCost` values, one per tier, with not one node deviating** — so `compareTargets`
ordering *"by cost then node id"* is, today, entirely the node-id tiebreak. Giving cost real variance
changes the shape of the discovery curve, which is precisely what `referenceNodesKnown`,
`referenceNodesGained`, `referenceKnowledgeInstances` and `referenceLibraryDepth` measure.

So paying 32 minutes now to tighten tolerances on a baseline about to be replaced wholesale is the
wrong order. **The replicate increase belongs in the re-baselining those four changes force**, where
it costs one run instead of two.

## The notation, and the instrument it borrows from

The records are written in the shape `w32/depth-language` defines — `claimId`, `form`, `subjects`,
`hypothesis`, `procedure` (including its **`refutedBy`**), `pinnedConstants`, `definitionVersion`,
`verdict`. **That branch is not merged**, so `design-language.schema.json` does not exist on this
tree and `design-language-claims.test.ts` does not validate these blocks. They are written to its
form anyway, because the form is what makes them checkable, and they will validate unedited if it
lands. Where a claim needs a form the vocabulary does not have, it says so rather than stretching
one.

Two other instruments named in the same brief were also unavailable and the substitutions are
recorded here rather than left to be noticed:

| instrument | state | what was used instead |
|---|---|---|
| `w59/gate-power` — the 8.7-second agency gate | **not merged** (4 commits ahead of `main`) | the four starting positions of `balance-gate-ascension.sweep.json` at 2400 ticks, driven through `tools/w58/harness.mjs`, which exercises the god verbs because each arm *is* a strategy |
| `w62/metrics-collector` — wiring `collectRunMetrics` | **not merged** (8 commits ahead) | nothing. `collectRunMetrics` is exported by `index.ts` and called by no production code on this tree, so the per-run metrics it would drive did not run here either |
| `w32/depth-language` | **not merged** (5 commits ahead) | its claim shape, unvalidated |

**All three named instruments are unmerged**, which is worth stating plainly rather than leaving to
be inferred from a table: this change is measured with what is committed on `main` plus the two
tools added here. The consequence for `w62` is the concrete one — the quantities below are read
straight out of `GodStateRecord` and the world components, not from the metrics registry, because
the registry's per-run collector has no caller to run it.

The measuring instrument is `tools/w58/harness.mjs` with `tools/w63/qualification.mjs` and
`tools/w63/paired.mjs` reading its output. It is the production episode path — `buildReferenceState`, `createSession`,
`adaptAgentSession`, `runEpisode`, `BOT_POOL_REGISTRY`, `policiesForRun` — with one read-only system
appended, and every result file records its own inertness check: a probed run and an unprobed run at
the same coordinates must produce the same snapshot hash, status, terminal reason and tick count. A
file whose check fails is reported as void rather than quietly averaged.

## Why qualification is measured and not ascension

Every committed record answers *"did this run end `ascended`"*, and that is a conjunction of two
different facts: the universe **qualified**, and the policy **declared**. `passive-control`'s
ascension stance is `never` — `effectivePreferences` strips action 15 out of its list — so it
reports 0 of 40 whether it reached an ascension path or not. `GodStateRecord.ascensionFirstMetTick`
separates them: the god system writes it the first tick `qualifyingPath` leaves `none`, whatever any
policy submits, so it is a fact about the universe. **A brief that says "everyone qualifies, only
some declare" can only be settled on that field**, and no rate table contains it.

No margin is computed anywhere below. `exploitMargin` is identically `ascensionRate − probeRate`
while the probe loses, so it is D1 wearing a second name and it hides which strategy moved. Counts
first, rates second, nothing derived.

---

## Claim: passive-control-does-not-qualify

The claim the brief is about, and the one that decides whether the fix is even aimed at a live
defect.

```json
{
  "claimId": "passive-control-does-not-qualify",
  "form": "inert",
  "subjects": ["passive-control"],
  "hypothesis": "A universe whose god submits nothing but no-ops never reaches an ascension path at all, so the win condition is not a clock that runs whether or not anyone plays. The brief this branch was opened on asserts the opposite -- apotheosis at tick 960 in 8 of 8 -- and one of the two is wrong about this tree.",
  "procedure": {
    "design": "paired-arms",
    "statistic": "count of runs with a non-zero GodStateRecord.ascensionFirstMetTick",
    "measures": ["ascensionFirstMetTick", "ascensionPath"],
    "runsPerArm": 40,
    "margin": "any qualifying run refutes it; this is an existential claim and no averaging applies",
    "interval": "none -- a count, not an estimate",
    "refutedBy": "one run in which passive-control's universe leaves ascensionPath = none, at any tick, in any of the four starting positions"
  },
  "pinnedConstants": {
    "horizonTicks": 2400,
    "rootSeed": 20260811,
    "sweepId": "w58-falsification-v1",
    "cells": "cohortSize [4,12] x foundingNodes [1,4]"
  },
  "definitionVersion": 1,
  "verdict": "holds",
  "verdictReason": "0 of 40 qualify, in BOTH arms. ascensionFirstMetTick is 0 and ascensionPath is none in every one of 40 worlds before the change and after it, and all 40 paired runs are bit-identical across the two arms. The brief this branch was opened on asserted apotheosis at tick 960 in 8 of 8; that finding predates ceb1492 (W6), which closed it. idle-then-declare -- a probe that plays nothing and declares the instant the mask opens -- is likewise 0 of 40 in both arms.",
  "evidence": ["balance/w63/w63-qualification.txt"]
}
```

## Claim: permit-then-idle-no-longer-qualifies

The live defect, and the one this change exists to close.

```json
{
  "claimId": "permit-then-idle-no-longer-qualifies",
  "form": "solved-open-loop",
  "subjects": ["permit-then-idle"],
  "hypothesis": "A fixed action sequence that reads no world state -- permitTechnique and permitForm for 140 of 2400 ticks, then an empty preference list forever -- no longer attains an ascension path, because both paths now carry a conjunct that no edit to the ruleset produces. Before the change it won 40 of 40, ahead of every policy that also funded, dispensed and encouraged.",
  "procedure": {
    "design": "paired-arms under common random numbers",
    "statistic": "count of runs with a non-zero ascensionFirstMetTick, before against after, at identical coordinates",
    "measures": ["ascensionFirstMetTick", "ascensionPath", "universities"],
    "runsPerArm": 40,
    "margin": "the after arm at zero",
    "interval": "none -- a count",
    "refutedBy": "permit-then-idle qualifying in any run after the change, which would mean the institution conjunct is reachable without buying an institution"
  },
  "pinnedConstants": {
    "horizonTicks": 2400,
    "openLoopPrefixTicks": 140,
    "ascensionInstitutions": 2,
    "rootSeed": 20260811,
    "sweepId": "w58-falsification-v1"
  },
  "definitionVersion": 1,
  "verdict": "holds",
  "verdictReason": "40 of 40 before, 0 of 40 after, on the same 40 worlds. Every one of the 40 is a discordant pair in the before-only direction and none in the after-only direction, which is the sign test at its maximum. The mechanism is visible in the run rows: permit-then-idle ends every run at universities = 1, the academy the scenario seeds, having never founded one.",
  "evidence": ["balance/w63/w63-qualification.txt"],
  "supersedes": ["solved-open-loop-2400"]
}
```

## Claim: institution-conjunct-is-reachable

The claim that separates *"the predicate is right and the pool is impoverished"* from *"the
predicate is unsatisfiable"*. These have opposite consequences and no committed measurement
separates them, because no pool member both opens the grid and buys anything.

```json
{
  "claimId": "institution-conjunct-is-reachable",
  "form": "dominates",
  "subjects": ["open-then-build", "permit-then-idle"],
  "hypothesis": "A policy differing from permit-then-idle by one submission a world year -- founding a university, the one thing in this build no ruleset edit produces -- reaches an ascension path where permit-then-idle does not. If it also fails, the conjunct is unreachable and the predicate is wrong rather than strict.",
  "procedure": {
    "design": "paired-arms under common random numbers",
    "statistic": "count of runs with a non-zero ascensionFirstMetTick",
    "measures": ["ascensionFirstMetTick", "ascensionPath", "universities"],
    "runsPerArm": 40,
    "margin": "strictly above zero, against permit-then-idle at zero in the same worlds",
    "interval": "none -- a count",
    "refutedBy": "open-then-build at 0 of 40. That verdict is a finding about the PREDICATE, not about the probe: the two policies differ by one action, so a shared zero says the conjunct cannot be met at all."
  },
  "pinnedConstants": {
    "horizonTicks": 2400,
    "openLoopPrefixTicks": 140,
    "foundingsPerRound": "1 attempt every 12 rounds, at preference slot 0",
    "ascensionInstitutions": 2
  },
  "definitionVersion": 1,
  "verdict": "holds",
  "verdictReason": "40 of 40 in BOTH arms, and all 40 paired runs bit-identical across them -- the conjunct is not merely satisfiable, it is satisfied in every world by a policy that differs from permit-then-idle by one submission a world year. So the refutation this claim named (a shared zero, which would have meant the conjunct was unreachable and the predicate wrong) did not occur. The margin is enormous and that is its own finding: 98 universities against a threshold of 2, with zero refusals -- see the campaign-plan entry on favor never binding.",
  "evidence": ["balance/w63/w63-qualification.txt"]
}
```

## Claim: pool-front-is-still-one-point

Named in advance so it cannot be presented afterwards as an unexpected result. **This change does
not fix D3**, and saying so before the run is the difference between a limitation and an excuse.

```json
{
  "claimId": "pool-front-is-still-one-point",
  "form": "width",
  "subjects": ["v1-strategy-pool"],
  "hypothesis": "After the change the pool still holds one winning profile rather than three, because the binding constraint is content exhaustion and not the win condition: every unrestricted strategy reaches every node the ruleset permits, so the only axis the pool separates on remains how much of the grid was opened.",
  "procedure": {
    "design": "paired-arms",
    "statistic": "number of distinct strategies with a non-zero qualification rate",
    "measures": ["ascensionFirstMetTick"],
    "runsPerArm": 40,
    "margin": "three or more distinct winners would refute it",
    "interval": "none -- a count",
    "refutedBy": "three or more strategies qualifying at materially different non-zero rates, which would mean the win condition was the binding constraint after all"
  },
  "pinnedConstants": { "horizonTicks": 2400, "poolSize": 11 },
  "definitionVersion": 1,
  "verdict": "holds",
  "verdictReason": "One strategy qualifies after the change (open-then-build, 40/40) against two before it (permit-then-idle and permissive-breadth, 40/40 each). Three or more distinct winners at materially different non-zero rates would have refuted it; the count went from two to one. D3 fails before and after, and this change moves WHICH policies qualify rather than how many profiles the pool holds. The binding constraint remains content exhaustion.",
  "evidence": ["balance/w63/w63-qualification.txt"]
}
```

---

## What this change does not fix, stated before anyone has to ask

- **The human and orc arms stay at zero.** W57 found it and the committed n=400 record shows it: no
  strategy ascends in 400 runs of either, because those species cannot reach the knowledge the
  unchanged conjuncts ask for. That is a per-species defect in the *knowledge* conjuncts and this
  change touches neither. It is named here so that a reader of a zero does not attribute it to the
  institution conjunct.
- **The open-loop solution survives with a longer prefix.** A policy that permits the grid *and*
  buys a university and then idles is still open-loop. What the conjunct buys is that the prefix now
  contains something the god had to pay for out of a budget that competes with permitting — not that
  the run stopped being solvable in advance. The thing that would end that is the binding constraint
  named five times in this campaign: **a universe must not be able to exhaust the reachable set.**
- **D3 and D9.** One viable line per species, and it is still *"edit the ruleset"*, now with a
  building attached.
- **The conjunct is a placement fix, not an economic one, and the margin is enormous.** Measured on
  a single `open-then-build` run at 2400 ticks: 99 foundings submitted, **98 completed**, against a
  threshold of **2** — with **zero** rejections and `favorWasted` at 4,789,833, because the god sits
  at its favor cap discarding regeneration for most of the run. So the conjunct does not ask the god
  to *trade* anything; it asks whether the policy ever presses the button at all. That is a real
  discrimination — no amount of permitting produces a university, which is the whole point — but it
  is the `starting-position-is-broke` and favor-cap saturation already recorded in
  `POOL_BUILD_LIMITS`, and it means `ascension-institutions` could be raised by an order of
  magnitude before any strategy that builds at all would notice. The constant carries
  `tuningStatus: "untuned"` and this is the measurement a tuner should start from.
- **`permissive-breadth` — a god that does play — also drops to zero, and the reason is a pool
  defect rather than a rule defect.** It ends every run at `unis=1`, the seeded academy: it lists
  `fundUniversity`, but behind `permitTechnique`, which is always legal, so `policyFor` submits the
  first legal preference and never reaches the founding. That is `POOL_BUILD_LIMITS`'s
  `universities-are-founded-and-never-finished` entry becoming decisive instead of merely recorded.
  The honest statement is therefore that **this change closes the exploit and takes the pool's one
  playing strategy down with it**, and that `open-then-build` — identical to `permit-then-idle`
  except for one submission a world year at slot 0 — is the only member that clears the conjunct.
  A reader is entitled to ask whether a predicate that only a purpose-built probe satisfies is a
  good predicate. The answer this workstream gives is that the predicate is right and the pool is
  impoverished, and the evidence for that ordering is that the fix for `permissive-breadth` is a
  one-line reordering of its preference list rather than any change to the rule. **That reordering
  is deliberately not made here**, because a strategy edited to pass a predicate committed in the
  same branch measures the edit, not the rule.

  **And the defect is worse than this branch could see.** `permissive-breadth`'s role in the pool is
  *"funds broadly"*, and it has **never founded a university in any run of any sweep ever taken** —
  `fundUniversity` has sat behind the always-legal `permitTechnique` for its whole existence, so
  `policyFor` never reached it. Every prior measurement of that strategy is a measurement of a god
  that does not fund. It is fixed on `w73/pool-build-order` (PR #70), on its own branch for exactly
  the reason given above.

  **This is the qualification that matters most to the result below, so it is stated before the
  numbers rather than after them: W63's conjunct must be re-measured against that fix, and the
  reading "the only pool member that clears the conjunct is the one built to test it" may not
  survive it.** If a `permissive-breadth` that actually funds clears the conjunct, then the
  predicate discriminates between playing and not playing after all, and the pessimistic reading
  here was an artefact of a broken preference list. If it still fails, the reading stands. **Neither
  outcome is known on this branch, and the flattering version must not be left standing
  unqualified.**

- **A conjunct is not the same as a cost.** The honest reading of the above is that this change
  converts "the win condition reads the ruleset" into "the win condition reads the ruleset **and**
  one button nobody was pressing". It is a strictly better predicate and it is not a deep one. What
  would make it deep is founding competing with permitting for a scarce resource, which requires the
  favor economy to bind — and on this build it does not.
