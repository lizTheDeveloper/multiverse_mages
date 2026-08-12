<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W13 — sweep the tradition axis

**Finding under test.** The tradition axis is authored, asymmetric, and has never been swept.
True Naming's `acquire` hook sets `instanceMastery: 1024`; Vancian and Art of Memory take the
`DEFAULT_INITIAL_MASTERY` of 256. The teach threshold is 512, and `setMastery`'s only rules-path
caller lowers — so a node born at 256 can never become teachable.

**Correction, measured before the sweep was written.** The brief for this workstream states that the
reference universe runs Vancian, the dead-teaching tradition. **It does not. It runs True Naming.**
`scribingTraditionId` returns the first tradition whose `store` hook has `scribingAvailable`, in
*interned* order, and `internSorted` sorts the id strings lexicographically — `art-of-memory`(1),
`true-naming`(2), `vancian-memorization`(3). Art of Memory is skipped (its `palace` store cannot
scribe), so True Naming wins the loop before Vancian is ever reached. Verified by loading the
shipped content:

    RESOLVED reference traditionId = 2
    acquire policy = {"kind":"true-name","initialMastery":1024,"stolenMastery":1024}

So the campaign's whole measured record was taken under the **live-teaching** tradition, and the two
never measured are Vancian and Art of Memory. The sweep is unchanged; its framing is inverted.

**This is a measurement workstream.** No constant, no magnitude, no rule changes. If a tradition
looks broken, it gets reported, not fixed.

## 1. Orientation

- [x] 1.1 Branch `w13/tradition-sweep` off `origin/main` (`6e5ecee`), `npm ci`, `npm run typecheck` green.
- [x] 1.2 Read `campaign-plan.md`, `vision.md` §4a, `probable-strategies.md`, `CLAUDE.md`.
- [x] 1.3 The three tradition ids, from `packages/content/data/tradition.json`:
      `vancian-memorization`, `true-naming`, `art-of-memory`.
- [x] 1.4 Establish how the reference universe picks its tradition today.
- [x] 1.5 Establish which metrics the scenario registry actually exposes — `terminalReason`,
      `ascensionRate`, the five arm-scoped §7 metrics, and any teaching counter.

## 2. Make the tradition selectable

`packages/scenario/src/reference-universe.ts:233` resolves one `traditionId` via
`scribingTraditionId(registry)` and feeds it to **both** the universe record and `worldDeps` — a
single thread point, not two. `REFERENCE_FACTOR_IDS` lists only `cohortSize`, `foundingMages`,
`foundingNodes`, so the tradition is **not selectable without a code change**. That is itself a
finding.

The change must be the smallest one that makes it selectable, and must be byte-identical to today
when the key is absent — otherwise it moves baselines.

- [x] 2.1 `referenceContent(registry, traditionId?)` takes an optional explicit tradition;
      absent means `scribingTraditionId(registry)`, exactly as now.
- [x] 2.2 The `tradition` level is read and **refused** if unknown or non-string — mirroring
      `readCount`'s stated reasoning, so a typo cannot silently run one tradition and be reported as
      another. It is *not* a `ReferenceOptions` field, because it is not read when tick-zero state is
      built: the `store` and `acquire` hooks are baked into `WorldStepDeps` before `Scenario.create`
      is ever called. `traditionIdNamed` refuses the name; `traditionOf` refuses the type.
- [x] 2.3 `'tradition'` added to `REFERENCE_FACTOR_IDS`.
- [x] 2.4 The executor resolves content per requested tradition, memoized, so a worker still pays
      for the node graph once per tradition rather than once per run.
- [x] 2.5 `npm run typecheck` green; no golden fixture regenerated; no baseline regenerated.

## 3. Common random numbers

Run seed is `f(rootSeed, sweepId, cellIndex, replicateIndex)` — `packages/mc-harness/src/seed.ts`.
Making `tradition` a multi-level factor **would break CRN**, because each level takes its own
`cellIndex` and therefore its own seed. That mistake has been made once in this campaign already.

- [x] 3.1 Three sweep files, one per tradition, each with **the same `sweepId` and `rootSeed`** and
      `tradition` as a **single-level** factor. A single-level factor yields `cellIndex` 0 in all
      three, so the seeds and the round-robin strategy assignment are identical across arms.
- [x] 3.2 Separate `--out` directories per arm; the arms are labelled in the writeup, not by sweepId.
- [x] 3.3 **Empirically verify CRN after the runs**: matching `(cellIndex, replicateIndex)` records
      must carry the same `runSeed` in all three arms. Report the check.

## 4. Run the sweep

- [x] 4.1 96 replicates, eight strategies round-robin (12 runs each), `worldTickCap` 2400.
      Strategies: `passive-control`, `uniform-random-legal`, `permissive-breadth`, `narrow-depth`,
      `denial-warden`, `archivist`, `portal-rush`, `worship-maximizer`.
- [x] 4.2 Vancian arm.
- [x] 4.3 True Naming arm.
- [x] 4.4 Art of Memory arm.

## 5. Report

- [x] 5.1 Per-tradition table: ascended/total, median ascension tick, per-route split from
      `terminalReason`, mean nodes known, knowledge instances, grimoires, library depth,
      stagnation counts, `ascensionRate`, the five arm-scoped §7 `armMetrics`.
- [x] 5.2 Teaching events per run **if the harness can see them**. If it cannot, say so plainly
      rather than inferring a number.
- [x] 5.3 Answer the four questions:
      1. Does the tradition change the strategy space at all — do the five strategies sharing the
         achievement vector `(12 mastered cells, 51 nodes, 12 cells)` separate under True Naming?
      2. Does teaching function under True Naming — nodes born at 1024 are above the 512 threshold,
         so how long does that last and how much propagates?
      3. Is tradition a genuine playstyle axis, or does one dominate?
      4. Does Art of Memory behave as §4a describes — *"unburnable, unlootable, un-loanable, and
         utterly lost when its holder dies"*? Pre-registered expectation: grimoires ≈ 0, library
         depth flat, knowledge instances dropping on mage deaths. If it shows 4096 grimoires, the
         `store` hook is not doing what §4a says, and that is the finding.
- [x] 5.4 Note that the Vancian arm is a **new baseline**, not a reproduction: the prior numbers in
      `probable-strategies.md` were taken at `4ea0fcf` with the axis off-by-one live, which W5 has
      since fixed. Qualitative agreement is the check; exact agreement is not expected.
- [x] 5.5 Write `docs/design/tradition-sweep.md` with the full tables.
- [ ] 5.6 `npm run verify`, exact result reported, since code was touched.
- [x] 5.7 Report a negative result plainly if that is what the numbers say.
