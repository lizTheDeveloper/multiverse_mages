<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The tradition axis, as measured

**Build:** `w13/tradition-sweep` off `main` (`6e5ecee`), reference-universe-v1, scenario build
`0.3.0`, record format 3.
**Instrument:** three arms × 96 runs, eight strategies round-robin (12 runs each), 2400 world ticks
(200 world years), common random numbers across the arms.
**Sweep files:** `balance/sweeps/w13-tradition-{vancian,true-naming,art-of-memory}.sweep.json`.

This is the first time `vision.md` §4a's tradition axis has been measured. Everything here is read
off run records. Where a number is derived, the derivation is arithmetic over recorded values and
the script that does it is committed (`scripts/w13-analyse.mjs`, `scripts/w13-paired.mjs`).

---

## Read these two corrections first

### 1. The reference universe runs True Naming, not Vancian

This workstream was commissioned on the premise that the reference universe runs **Vancian** — the
tradition where a researched instance is born at `DEFAULT_INITIAL_MASTERY` (256), can never reach
the teach threshold (512) because `setMastery`'s only rules-path caller lowers, and therefore
cannot propagate. **That premise is false.**

`scribingTraditionId` returns the first tradition whose `store` hook has `scribingAvailable`, walking
`registry.traditions` in **interned** order. `internSorted` sorts the id *strings* lexicographically:

    art-of-memory (1),  true-naming (2),  vancian-memorization (3)

Art of Memory is skipped — its `palace` store cannot scribe. **True Naming wins the loop, and
Vancian is never reached.** Loading the shipped content confirms it:

    RESOLVED reference traditionId = 2
    acquire policy = {"kind":"true-name","initialMastery":1024,"stolenMastery":1024}

So every measurement this campaign has taken — the 51-node plateau, the identical achievement
vectors, the archivist's grimoires — was taken under the tradition where **teaching works**, not the
one where it is dead. The two never measured were Vancian and Art of Memory.

The choice is also an accident rather than a decision. `content-set.ts` explains at length why it
picks by asking the hook rather than by naming a tradition, and its worked example names the Art of
Memory as the one that "happens to come first". Nothing in that comment anticipated that the rule
would land on True Naming, whose `acquire` hook doubles research cost. **The reference universe's
tradition is a consequence of the alphabet.**

### 2. The tradition was not selectable, and this is what it took to make it so

`REFERENCE_FACTOR_IDS` listed `cohortSize`, `foundingMages`, `foundingNodes`. The tradition was
resolved once in `referenceContent()` and baked into `WorldStepDeps` before any `ScenarioConfig`
existed, so no sweep file could name it. The change made here is the smallest that makes it
selectable and is byte-identical to the previous behaviour when the key is absent:

- `traditionIdNamed(registry, name)` resolves a tradition by its `tradition.json` id and **refuses**
  an unknown name. Named, not interned, because the interned numbers come from sorting id strings —
  the number that means "True Naming" is a fact about the alphabet and moves the day a tradition is
  added, which would silently repoint a committed sweep file at a different arm.
- `referenceContent(registry, traditionName?)` takes the name; absent means the old rule.
- `TRADITION_FACTOR_ID` joins `REFERENCE_FACTOR_IDS`; the executor resolves content per named
  tradition, memoized, and a task's level beats a pre-resolved content set.

No constant, magnitude, or rule was changed. No golden fixture and no balance baseline was
regenerated.

---

## Common random numbers, verified

A run seed is `f(rootSeed, sweepId, cellIndex, replicateIndex)`, and **each level of a factor takes
its own `cellIndex`**. A three-level `tradition` factor in one file would therefore have varied the
universes as well as the tradition, and the two effects would be inseparable. Instead: three files,
one level each, sharing one `sweepId` (`w13-tradition-v1`) and one `rootSeed` (20260811).

Checked after the fact rather than assumed:

    Compared 192 (cellIndex, replicateIndex) pairs across arms.
    Seed or strategy mismatches: 0
    Distinct sweepIds: w13-tradition-v1
    Arms with any run at the wrong tradition level: 0

Run *r* of one arm is the same universe as run *r* of another, playing the same strategy, under a
different tradition. That is what licenses the paired tables below.

---

## Table 1 — per tradition

`±` is one standard error of the mean over 96 runs.

| tradition | ascended/n | median asc. tick | apotheosis | canon | stagnated | truncated | nodes known | instances | grimoires | library depth | living mages |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Vancian** | 66/96 | 1015 | 25 | 41 | 16 | 14 | 65.8 ±8.0 | 1688.1 ±135.2 | 978.7 ±42.9 | 1.4 ±0.1 | 59.0 ±2.6 |
| **True Naming** *(the status quo)* | 67/96 | 962 | 20 | 47 | 17 | 12 | 58.2 ±6.1 | 1745.9 ±127.4 | 907.5 ±44.9 | 1.7 ±0.1 | 57.2 ±2.6 |
| **Art of Memory** | 12/96 | 1480 | 2 | 10 | 54 | 30 | 17.2 ±1.1 | 307.9 ±50.5 | **0.0 ±0.0** | **0.0 ±0.0** | 56.6 ±7.5 |

## Table 2 — the arm-scoped §7 metrics

Read from each summary's `armMetrics`. These are computed from `armContribution` on the records; they
are not declared in the sweep file's `metrics` list, which carries only the ten `reference*` vital
signs.

| metric | Vancian | True Naming | Art of Memory | §7 target |
|---|---|---|---|---|
| `ascensionRate` | 0.6875 | 0.6979 | **0.1250** | 0.05–0.20 |
| `capitalSnowball` | 0.1818 | 0.2487 | 0.0000 | — |
| `worshipSnowball` | 0.1142 | 0.0786 | 0.0793 | — |
| `prestigeAdvantage` | unavailable | unavailable | unavailable | — |
| `winRateByPrimitive` | unavailable | unavailable | unavailable | — |

Two of the five report `unavailable` in every arm, unchanged by tradition.

**The single most campaign-relevant number in this document is that `0.1250`.** Art of Memory is the
only one of the three shipped traditions whose ascension rate falls inside `contracts.md` §7's
declared band, and it gets there with no change to any ascension constant or predicate. Vancian and
True Naming sit at roughly 0.69, three and a half times the top of the band.

## Table 3 — per strategy, per tradition

### Vancian

| strategy | n | asc | stag | trunc | median asc tick | nodes known | instances | grimoires | lib depth |
|---|---|---|---|---|---|---|---|---|---|
| archivist | 12 | 12 | 0 | 0 | 1201 | 51.0 ±0.0 | 1678 | 1278 | 1.0 |
| denial-warden | 12 | 3 | 7 | 2 | 1202 | 1.9 ±0.1 | 26 | 26 | 1.9 |
| narrow-depth | 12 | 3 | 9 | 0 | 1202 | 5.3 ±0.3 | 527 | 1115 | 3.3 |
| passive-control | 12 | 0 | 0 | 12 | n/a | 50.8 ±0.1 | 1875 | 1138 | 1.0 |
| permissive-breadth | 12 | 12 | 0 | 0 | 1745 | **264.4 ±7.1** | 4403 | 972 | 1.3 |
| portal-rush | 12 | 12 | 0 | 0 | 962 | 51.0 ±0.0 | 1820 | 1106 | 1.0 |
| uniform-random-legal | 12 | 12 | 0 | 0 | 803 | 50.8 ±0.2 | 1339 | 1074 | 1.0 |
| worship-maximizer | 12 | 12 | 0 | 0 | 962 | 50.9 ±0.1 | 1837 | 1122 | 1.0 |

### True Naming

| strategy | n | asc | stag | trunc | median asc tick | nodes known | instances | grimoires | lib depth |
|---|---|---|---|---|---|---|---|---|---|
| archivist | 12 | 12 | 0 | 0 | 1201 | 50.9 ±0.1 | 1897 | 1320 | 1.0 |
| denial-warden | 12 | 5 | 7 | 0 | 1202 | 2.0 ±0.0 | 27 | 27 | 2.0 |
| narrow-depth | 12 | 2 | 10 | 0 | 1202 | 5.8 ±0.2 | 532 | 1083 | 3.8 |
| passive-control | 12 | 0 | 0 | 12 | n/a | 50.8 ±0.1 | 2456 | 1126 | 1.0 |
| permissive-breadth | 12 | 12 | 0 | 0 | 962 | **203.8 ±7.9** | 3912 | 844 | 2.8 |
| portal-rush | 12 | 12 | 0 | 0 | 962 | 50.8 ±0.1 | 1605 | 987 | 1.0 |
| uniform-random-legal | 12 | 12 | 0 | 0 | 853 | 50.7 ±0.1 | 1601 | 902 | 1.0 |
| worship-maximizer | 12 | 12 | 0 | 0 | 962 | 51.0 ±0.0 | 1938 | 973 | 1.0 |

### Art of Memory

| strategy | n | asc | stag | trunc | median asc tick | nodes known | instances | grimoires | lib depth |
|---|---|---|---|---|---|---|---|---|---|
| archivist | 12 | 2 | 6 | 4 | 2042 | 20.2 ±1.5 | 249 | 0 | 0.0 |
| denial-warden | 12 | 3 | 9 | 0 | 1202 | 0.0 ±0.0 | 0 | 0 | 0.0 |
| narrow-depth | 12 | 2 | 10 | 0 | 1202 | 3.0 ±0.0 | 35 | 0 | 0.0 |
| passive-control | 12 | 0 | 8 | 4 | n/a | 22.3 ±1.5 | 206 | 0 | 0.0 |
| permissive-breadth | 12 | 0 | 2 | 10 | n/a | 27.5 ±1.5 | 284 | 0 | 0.0 |
| portal-rush | 12 | 2 | 5 | 5 | 1408 | 22.7 ±1.5 | 291 | 0 | 0.0 |
| uniform-random-legal | 12 | 3 | 4 | 5 | 1941 | 19.7 ±1.4 | 1237 | 0 | 0.0 |
| worship-maximizer | 12 | 0 | 10 | 2 | n/a | 22.2 ±1.4 | 160 | 0 | 0.0 |

## Table 4 — paired differences

The same universe under two traditions. Pairing removes the between-universe variance that dominates
the unpaired standard errors above, and it is only legitimate because CRN was verified. `**` marks a
paired mean more than three paired standard errors from zero.

### True Naming minus Vancian

| scope | nodes known | knowledge instances | grimoires | ascended Δ |
|---|---|---|---|---|
| **ALL** | **−7.5 ±2.3** ** | +57.8 ±65.5 | **−71.1 ±23.5** ** | +1 (67 vs 66) |
| archivist | −0.1 ±0.1 | +219.5 ±164.2 | +41.7 ±138.0 | 0 (12 vs 12) |
| denial-warden | +0.1 ±0.1 | +0.3 ±0.6 | +0.3 ±0.6 | +2 (5 vs 3) |
| narrow-depth | +0.6 ±0.2 | **+5.4 ±1.6** ** | −32.3 ±18.9 | −1 (2 vs 3) |
| passive-control | 0.0 ±0.1 | **+581.2 ±126.4** ** | −11.5 ±26.3 | 0 (0 vs 0) |
| permissive-breadth | **−60.7 ±9.3** ** | −491.9 ±363.8 | −127.6 ±51.4 | 0 (12 vs 12) |
| portal-rush | −0.3 ±0.1 | −215.2 ±129.4 | −118.8 ±72.4 | 0 (12 vs 12) |
| uniform-random-legal | −0.1 ±0.3 | +261.8 ±114.8 | **−172.0 ±47.0** ** | 0 (12 vs 12) |
| worship-maximizer | +0.1 ±0.1 | +101.3 ±158.4 | −148.9 ±61.6 | 0 (12 vs 12) |

### Art of Memory minus True Naming

| scope | nodes known | knowledge instances | grimoires | ascended Δ |
|---|---|---|---|---|
| **ALL** | **−41.0 ±5.5** ** | **−1438.0 ±130.3** ** | **−907.5 ±44.9** ** | **−55 (12 vs 67)** |
| archivist | **−30.8 ±1.5** ** | **−1648.2 ±202.2** ** | **−1319.5 ±126.0** ** | −10 (2 vs 12) |
| denial-warden | **−2.0 ±0.0** ** | **−26.7 ±0.3** ** | **−26.7 ±0.3** ** | −2 (3 vs 5) |
| narrow-depth | **−2.8 ±0.2** ** | **−497.0 ±8.0** ** | **−1082.8 ±13.9** ** | 0 (2 vs 2) |
| passive-control | **−28.6 ±1.5** ** | **−2249.9 ±61.3** ** | **−1126.4 ±40.4** ** | 0 (0 vs 0) |
| permissive-breadth | **−176.3 ±7.6** ** | **−3627.3 ±372.2** ** | **−843.9 ±87.1** ** | −12 (0 vs 12) |
| portal-rush | **−28.1 ±1.5** ** | **−1313.7 ±106.6** ** | **−986.8 ±96.0** ** | −10 (2 vs 12) |
| uniform-random-legal | **−31.0 ±1.4** ** | −363.3 ±277.3 | **−901.5 ±71.1** ** | −9 (3 vs 12) |
| worship-maximizer | **−28.8 ±1.4** ** | **−1777.8 ±153.5** ** | **−972.8 ±74.8** ** | −12 (0 vs 12) |

---

## The four questions, answered

### 1. Does the tradition change the strategy space at all?

**Between Vancian and True Naming: almost not at all — and specifically not where it was expected
to.** The question as posed was whether the five strategies sharing the achievement vector
`(12 mastered cells, 51 nodes, 12 cells)` separate under True Naming. They do not, and the paired
table is unambiguous about it. `archivist`, `passive-control`, `portal-rush`,
`uniform-random-legal` and `worship-maximizer` differ by **−0.1, 0.0, −0.3, −0.1 and +0.1 nodes**
between the two traditions, every one of them inside its own standard error. All five sit on the
same ~50.8 plateau in both arms. Ascensions: 67 against 66 out of 96.

The one place the tradition does move the strategy space is `permissive-breadth`, and it moves it a
lot: **−60.7 ±9.3 nodes**, more than six standard errors. That is not a teaching effect. It is the
`researchCostMultiplier` of `2048` — 2× at fixed-point scale 1024 — in True Naming's `acquire` hook.
The only strategy that researches enough for the price of research to matter is the only strategy
that notices which tradition it is playing, **and it does worse under the tradition whose knowledge
propagates better.**

**Between either of those and Art of Memory: completely.** Every strategy loses 2 to 176 nodes,
every one significantly, and the ordering changes: `permissive-breadth` goes from the best strategy
in the game (264 nodes, 12/12 ascensions) to **0/12 ascensions**, because the knowledge it generates
cannot be stored anywhere durable.

### 2. Does teaching actually function under True Naming?

See "Teaching, measured" below — the sweep pipeline cannot see teaching events, so this is answered
by a second instrument.

### 3. Is the tradition a genuine playstyle axis?

**It is a real axis with two levels, not three.** Vancian and True Naming are near-duplicates of one
another for seven of eight strategies; the honest summary is that the shipped content contains *two*
distinguishable traditions and a third that differs only in the price of research.

Art of Memory is a different game, and not merely a worse one:

- It is the only arm with an `ascensionRate` inside §7's band (0.1250 against 0.6875 and 0.6979).
- It is the only arm where **stagnation is a normal outcome** (54/96 against 16 and 17) — i.e. the
  only arm where risk of ruin is a live consideration for every strategy rather than for the two
  denial strategies alone.
- It is the only arm where `permissive-breadth` — the strategy `probable-strategies.md` calls "the
  only strategy that currently plays the game" — **loses**.

Whether that makes it *viable* is a different question from whether it is *distinct*, and this sweep
does not settle it: 54/96 stagnations and 0 grimoires may read to a player as a tradition that
punishes everything. What can be said is that the axis is not decorative, and that the two-way split
runs between `store` hooks, not between `acquire` hooks.

**One tradition does dominate, in the plainest sense:** if the goal is to ascend, Vancian and True
Naming ascend at 0.69 and Art of Memory at 0.125. Nothing here rescues that as a balanced choice.

### 4. Does Art of Memory behave as §4a describes?

**Yes, exactly, and the pre-registered prediction held.** §4a says a memory palace is *"unburnable,
unlootable, un-loanable, and utterly lost when its holder dies"*. Registered before the runs: expect
grimoires ≈ 0, library depth flat, knowledge instances dropping.

Measured, across all 96 runs and all eight strategies:

- **Grimoires: 0.0 ±0.0.** Not one book, in any run, under any strategy. The `palace` store hook's
  `scribingAvailable: false` is fully load-bearing.
- **Library depth: 0.0 ±0.0.** Flat at zero for the entire 2400 ticks.
- **Knowledge instances: 307.9 against 1745.9** — a 5.7× reduction, paired difference −1438.0 ±130.3.
- **`capitalSnowball`: exactly 0.0000**, against 0.18 and 0.25. There is no library, so the §6a
  knowledge-capital loop has nothing to compound.
- `denial-warden` under Art of Memory reaches **0.0 nodes known** — a universe that ends knowing
  nothing at all, which no other tradition produces.

The one part of §4a this sweep cannot confirm is *"utterly lost when its holder dies"* as a
mechanism: living mages are statistically identical across arms (56.6 against 57.2 and 59.0), so the
instance collapse is not explained by more mages dying. It is consistent with per-mage palace
capacity — `slotsPerMage: 12` — capping what a universe can hold, which would also explain why
nodes known lands at 17.2 rather than 51. **That is a hypothesis this instrument does not test**, and
it is the obvious next measurement.

---

## Teaching, measured

**The sweep pipeline cannot see teaching events, and this is a limitation of the instrument rather
than a fact about the game.** Stated plainly rather than inferred:

- `mc-harness`'s census samples standing stocks every twelve ticks. `metrics-census.ts` says so
  itself: *"A node lost and rediscovered between two censuses is invisible. The census sees
  existence, not events."*
- The ten `reference*` measures — the only metrics any committed sweep collects — contain no
  teaching entry.
- The only place a lesson is counted anywhere in the tree is
  `coordination`'s `WorldStepReport.lessonsTaught`, which `contracts.md` §4.4 makes an *explain
  channel that no rule may read back*, and which only `packages/scenario/src/long-run.ts` folds up
  (`WindowActivity.lessonsTaught`). That instrument is not wired into `mc-harness`'s
  `MetricRegistry`, so no sweep file can declare a teaching metric today.

So teaching was measured with a **second instrument** rather than guessed at:
`scripts/w13-teaching-probe.mjs` drives the same reference universe directly against `SimState` for
2400 ticks with **zero actions** — the passive control and nothing else — under each tradition, at
eight shared run seeds, and folds `WorldStepReport`. It measures no strategy and changes nothing.

<!-- TEACHING RESULTS -->

---

## What this does and does not license

- The Vancian arm is a **new baseline, not a reproduction**. `probable-strategies.md`'s numbers were
  taken at `4ea0fcf` with the axis off-by-one live, which W5 has since fixed; `permissive-breadth`
  reaching 264 nodes here against 217 there is consistent with the fifth technique and fourteenth
  form becoming permittable. Qualitative agreement is the check and it holds.
- The 51-node plateau, the flat achievement vectors, and `ascensionRate` ≈ 0.69 are **not artefacts
  of a dead-teaching tradition**. They reproduce under both `acquire` hooks, including the one where
  every instance is born at full mastery. Whatever is causing them, it is not the teach threshold.
- Nothing here is a balance change and nothing here should be read as a recommendation to make one.
