<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Integration round 2 — the six workstreams, measured together

**What this is.** W6, W7, W8, W11, W13, W14, W17 (which contains W15) and W10 merged onto one
tree, and the campaign's acceptance criteria measured on it. Before this, no two of those
workstreams had ever been measured together, and the sharpest consequence was that **W6 reported
`ascensionRate` 0.125 and W8 reported 0.854 on branches that did not contain each other.**

**The measurement.** 2400 ticks, **ten** strategies, **n = 400 per arm** (40 runs per strategy,
coverage asserted before any aggregate), six arms, 2,400 runs total, executed on Modal via W11.
Branch `integration/campaign-round-2`. `npm run verify` **EXIT=0**: 3,872 tests in 275 files, all
three balance gates PASS. **No golden fixture was regenerated or changed at any point.**

The pool is ten, not eight, because the adversarial verification of W6 contributed two probes and
**a pool that cannot detect a ruleset-only winner is not an instrument.** `n = 400` rather than the
brief's 384 because round-robin assignment is `strategies[replicateIndex % poolSize]` and a count
that does not divide the pool measures a subset.

---

## The headline, and it is not a number

**A god who permits the whole grid for 140 ticks and then does literally nothing for the remaining
2,260 wins more often than any god who plays.**

| strategy | asc/n | rate | nodes known | libDepth | books |
|---|---|---|---|---|---|
| **`permit-then-idle`** *(probe)* | **40/40** | **1.0000** | 257.9 ±1.48 | 43.27 | 87 |
| `permissive-breadth` | 38/40 | 0.9500 | 258.8 ±1.62 | 37.08 | 64 |
| `uniform-random-legal` | 0/40 | 0.0000 | 62.1 ±0.13 | 12.00 | 92 |
| `portal-rush` | 0/40 | 0.0000 | 52.0 ±2.09 | 5.13 | 151 |
| `passive-control` | 0/40 | 0.0000 | 51.0 ±0.00 | 0.95 | 1 |
| `worship-maximizer` | 0/40 | 0.0000 | 51.0 ±0.02 | 1.02 | 1 |
| `idle-then-declare` *(probe)* | 0/40 | 0.0000 | 51.0 ±0.00 | 0.78 | 1 |
| `archivist` | 0/40 | 0.0000 | 50.9 ±0.06 | 38.75 | 970 |
| `narrow-depth` | 0/40 | 0.0000 | 5.1 ±0.26 | 4.25 | 18 |
| `denial-warden` | 0/40 | 0.0000 | 3.0 ±0.39 | 3.05 | 9 |

*(arm: True Naming, the default build, n=400)*

`permit-then-idle` funds nothing, encourages nothing, blesses nobody and teaches no one. It presses
two buttons — `permitTechnique` and `permitForm` — for 140 rounds and then submits an **empty**
preference list forever. It beats `permissive-breadth`, which does all of that *and* funds,
dispenses and encourages, **40/40 against 38/40**.

So `permissive-breadth`'s funding, dispensations and research encouragement are worth **less than
nothing** — they are a small net negative. The two positive-achievement predicates measure what the
god **permitted**, not what the universe **achieved**. This confirms the adversarial verification's
finding at n=400 and at the full ten-strategy pool.

---

## D1–D9 at n = 400

Each criterion is marked **passed**, **failed** or **saturated**. Saturated means the measurement
cannot register a change because a ceiling is binding — a different finding from failure, and only
one of the two is about the game.

| # | criterion | result | verdict |
|---|---|---|---|
| **D1** | `ascensionRate` inside 0.05–0.20 | **0.1950** with probes; **0.1187** without | **passed** |
| **D2** | exploit margin ≥ 0.05 | **+0.2167** vs `uniform-random-legal`; **+0.2167** vs `idle-then-declare` | **passed, but carries no information** |
| **D3** | ≥3 winners, none above 60% of wins | **2 of 10** winners; top share **51.3%** | **failed** |
| **D4** | correlation of rate with nodes known > 0 | Pearson **+0.9760**, Spearman **+0.6854**, **2 of 10** at non-zero rate | **passed, weakly** |
| **D5** | `knowledgeHalfLife` falls; nodes counted leaving | **instrument absent** | **not measurable** |
| **D6** | no strategy wins at the passive knowledge baseline | passive = 51.0 ±0.00; **no winner at or below it** | **passed, saturated** |
| **D7** | founding species mix changes which strategy wins | **rate** changes 1.000 → 0.350 → 0.000; **winner identity never changes** | **failed, and saturated** |
| **D9** | more than one viable playstyle per species | **one** viable line, and it is "edit the ruleset" | **failed** |

### D1 — passed, and the band is a property of pool composition

**0.1950 with the probes, 0.1187 without.** Both inside §7's 0.05–0.20 band. This is the number the
campaign asked for, and it reconciles the two that did not describe the game: W6's 0.125 was
measured without raids, W8's 0.854 without the predicates. **On the tree that has both, it is
0.1950.**

W6's 0.125 turns out to be very close to the eight-strategy figure here (0.1187), so the predicates
are the dominant term and raids barely move the rate — which is itself the finding that raids are
not yet pressure.

But note what moving the pool does: adding two probes moves the rate from 0.1187 to 0.1950, **65%
of the band's width**. The band is being satisfied by a property of who is in the pool, not by a
property of the ruleset. It would leave the band with one more ruleset-editing bot in the pool.

### D2 — passed, and it adds nothing

`exploitMargin` is identically `ascensionRate − probeRate` while the probe loses, and both probes
score exactly **0.0000**, so D2 is D1 restated. Reported against both the criterion's
`uniform-random-legal` and the honest `idle-then-declare` control; they agree because both are zero.

**`uniform-random-legal` is a crippled probe and this should be recorded.** `CANDIDATE_SLOTS` covers
actions 8–14 only, so it submits actions 1–7 with no parameter. The gate *admits* them
(`outOfAxisRange` returns false for `undefined`, deliberately); `axisPlan`, `edictPlan` and
`revokePlan` refuse them one layer down onto `state.illegalActionCount`; and §7's
`illegalActionRate` reads the *session's* counters, which never saw them. **Seven of its fifteen
verbs are inert and its own telemetry reads clean.** Every exploit margin this campaign has ever
published was measured against it.

### D3 — failed, exactly where the campaign predicted it would

Two winners, and they are the only two strategies that edit the ruleset. This is not a tuning
failure: the Pareto front over the pool is one point, and any predicate that admits a third
strategy readmits the passive profile. **D3 binds on the strategy pool and the missing loops, and
no constant can buy it.**

### D4 — passed, weakly, and the weakness is the point

Pearson **+0.9760** looks decisive and is not: **eight of ten strategies sit at rate exactly 0**,
so the coefficient is one cluster against two points. Spearman over the same data is **+0.6854**.
Both are positive, so the criterion passes, but a correlation over two non-zero points is not
evidence of a relationship between playing well and winning.

### D5 — not measurable, and the reason is structural

`knowledgeHalfLife` is a **per-run** metric, so it must be named in a sweep's `metrics` list, and a
sweep may name only the ten `reference*` measures the scenario registers. Underneath that,
`CensusSample` carries `nodesKnown` as an aggregate count and **no node-id list**, so the
Kaplan–Meier estimator over node cohorts has no input at all. The same limitation hides
`libraryDependence` and all three raid metrics. **W8 reported this and nothing in this integration
changed it.** Closing D5 needs a census that carries node identities — a change to
`packages/scenario/src/census.ts`, not a tuning pass.

### D6 — passed, but saturated

No strategy ascends at or below `passive-control`'s 51.0 nodes. But `passive-control` reaches 51.0
because **51 is every node the v1 ruleset permits**, and five of the ten strategies land on exactly
it. The criterion passes because the two winners are at ~258 nodes — and they get there by
*permitting more cells*, not by playing better. **D6 cannot register a change while every
unrestricted strategy exhausts the reachable set.**

### D7 — failed on the letter, and the measurement underneath it is the most interesting in this report

Founding-species arms at n=400 each, single-species universes:

| founding mix | ascensions/400 | winners | `permissive-breadth` nodes | best-strategy rate |
|---|---|---|---|---|
| all six species | 78 | `permit-then-idle`, `permissive-breadth` | 258.8 | 1.000 |
| **gnome only** | **25** | `permit-then-idle`, `permissive-breadth` | 217.3 | 0.350 |
| **human only** | **0** | *none* | 121.3 | 0.000 |
| **orc only** | **0** | *none* | 0.8 | 0.000 |

**The criterion as written fails**: the winner's identity is invariant. It is `permit-then-idle`
first and `permissive-breadth` second, or it is nobody. The species mix never reorders them.

**But the species table is emphatically load-bearing**, and this is new. An orc-only universe learns
**essentially nothing** — every strategy between 0.0 and 8.4 nodes, against 51 for a mixed passive
universe. A human-only universe reaches 121 nodes under `permissive-breadth` and still **never
ascends**. A gnome-only universe ascends at 0.350 where the mixed one ascends at 1.000.

So the founding mix decides **whether winning is possible at all**, across a range from 1.000 to
0.000 — it just cannot decide **who** wins, because only two strategies do anything the win
condition can see. D7 is blocked by the same saturation as D6, and the instrument (W15's
`foundingSpeciesMask`) works.

### D9 — failed

Each species should admit more than one viable playstyle. Measured, **the universe admits one
viable playstyle in total**, for every species: edit the ruleset and then wait. Eight of ten
strategies never win under any founding mix or any tradition.

---

## `capitalSnowball` — the 0.35 guard is breached

| arm | `capitalSnowball` | `worshipSnowball` |
|---|---|---|
| True Naming (default) | **0.4571** | 0.1028 |
| Vancian | **0.4129** | 0.1189 |
| Art of Memory | 0.0000 | 0.0823 |

**Recomputed for this tree, as it had to be.** W7's 0.5024 was a figure for W7's build, and W17
raised early `referenceLibraryDepth` 7.145 → 10.435, which is that Gini's own input; W17's baselines
explicitly declined to assert it.

**0.4571 against the 0.35 threshold its sibling `worshipSnowball` is held to.** `worshipSnowball`
itself is comfortable at 0.1028. §6a warns specifically about *"two compounding loops that feed each
other"*, and only one of the two is currently running hot. The threshold formally belongs to
`god-agency`, and `capitalSnowball` is *reported* rather than gated — but on the merged tree it is
**31% above** the number its sibling must respect, and that is a decision for the author rather than
something to tune away here.

---

## The per-tradition table, and W13's headline result is destroyed

n = 400 per arm, ten strategies, common random numbers (shared `sweepId` and `rootSeed`).

| tradition | ascensionRate | winners | nodes (passive) | libDepth (archivist) | books (archivist) | capitalSnowball |
|---|---|---|---|---|---|---|
| **True Naming** (default) | **0.1950** | 2 | 51.0 | 38.75 | 970 | 0.4571 |
| **Vancian** | **0.1950** | 2 | 51.0 | 9.05 | 483 | 0.4129 |
| **Art of Memory** | **0.0000** | **0** | 30.0 | 0.00 | 0 | 0.0000 |

**W13 measured Art of Memory as the only arm with an in-band `ascensionRate` (0.1250), reached by
the `store` hook rather than by any balance constant. On the merged tree it is the only arm that
cannot ascend at all — 0 of 400 runs, both paths, every strategy.**

The mechanism is direct and it is a W6×W13 interaction neither branch could have seen. Art of
Memory's `store` hook routes knowledge to a memory palace, so the universe holds **zero grimoires
and zero library depth**. W6's canon predicate requires holding a body of knowledge intact across
eras, and the apotheosis predicate requires summit depth; a universe with no written record and 30
nodes clears neither. W13's arm was in band because *everything* was, at 0.6875–0.6979 elsewhere —
Art of Memory was simply the slowest. W6 raised the bar past it entirely.

True Naming and Vancian are now **exactly equal at 0.1950**, reproducing W13's finding that the
teaching difference between them buys no extra nodes. They differ where W7's loop reads them:
`archivist` library depth 38.75 against 9.05, books 970 against 483.

---

## The interactions — what only a merged tree could show

1. **W6 × W7 on library depth, and it runs backwards.** W6 alone moves `referenceLibraryDepth` not
   at all (2.21875, identical to `main`). W7 alone takes it to 25.4688 at 2400 ticks. **Together it
   is 9.9375** — W7's gain cut by 61%. Nothing subtracted the loop: W6 made ascension hard, so runs
   stop ending early, and over the longer horizon W7's own library upkeep keeps destroying
   single-copy shelves. This is the same mechanism as W7's `narrow-depth` 12/12 → 0/12 flip,
   appearing as a continuous quantity instead of a threshold.

2. **W6 × W13 kills Art of Memory**, above.

3. **W7 × W8: looting's advantage has largely collapsed.** W8 alone measured `portal-rush` at
   **57.0 nodes against `passive-control`'s 50.9 — +6.1, and it separated at +4.3 SE.** On the
   merged tree it is **52.0 ±2.09 against 51.0 ±0.00 — +1.0, well inside its own standard error.**
   `portal-rush` is still raiding — 151 books against passive's 1 — so the books arrive and the
   nodes do not stay. The most likely mechanism is W7's library upkeep destroying looted
   single-copy shelves, which is the same mechanism as interaction 1.

4. **W6 and W7 are additive on population.** W6 alone moved `referencePeakPopulation` 19340 →
   50049; on the W7 world it moves 19506 → 50038. No destructive interaction.

---

## W8's three flagged constants — do they need revisiting?

W8 calibrated these against a world where a surviving mage could not teach a lost node back, and
flagged all three. **Answered from the measurement, not retuned.**

| constant | value | verdict |
|---|---|---|
| `inbound-raid-chance-per-world-tick` | `4` (fp ≈ 0.0039) | **Yes — and it is the first number to move.** Raids fire and take books, and the books buy +1.0 nodes against a 2.09 SE. The arrival process is too sparse to be pressure on the merged tree. |
| `looted-grimoires-per-raid` | `4` | **Yes, but second.** Loot arrives (151 books) and does not become durable knowledge. Raising it without addressing upkeep raises the number of books destroyed, not the number of nodes kept. |
| `rival-raider-node-count` | `8` | **No, not on this evidence.** Nothing measured here bears on how a rival warband is armed; `winRateByPrimitive` still reports `unavailable`, and it is the metric that would. |

The honest summary: **W7 did change recovery, and it changed it in the direction that makes W8's
calibration too weak rather than too strong.** All three remain `tuningStatus: "untuned"` and none
was touched.

---

## What survived, checked rather than assumed

- **`narrow-depth` stays broken at 0/40 in every arm and every founding mix.** W7's novelty-first
  scribing made shelves hold single copies that upkeep can destroy, partially breaking *"doing
  nothing is perfect custodianship"*. No later merge restored duplicate-heavy shelves.
- **The `compareTargets` composition survives.** `compareAppeal` applies `compareNovelty` first,
  then the utility score, then `compareTargets` as the deterministic tie-break — W7's binary and
  W17's magnitude composed, not merged.
- **`raidEngagement: true`** on every run record.
- **Strategy coverage is exact**: all six arms report ten strategies at exactly 40 runs each.

---

## The conclusion, stated plainly

**The combined tree is better than the parts on the number the campaign asked for, and the reason
it is better is not a reason to be pleased.**

D1 passes at 0.1950, reconciling W6's 0.125 and W8's 0.854. D2, D4 and D6 pass. But D3, D7 and D9
fail, D5 cannot be measured, and D6 and D7 are saturated rather than satisfied — and the single
finding underneath all of it is that **the win condition reads the ruleset rather than play**, which
`permit-then-idle` demonstrates by winning 40/40 while doing nothing.

This is now the campaign's **fifth independent confirmation that the binding constraint is content
exhaustion** — after W15's prefix fidelity, W13's teaching result, W7's ceiling-versus-rate finding
and W17's saturation. Every unrestricted strategy reaches all 51 reachable nodes; the only lever
that adds anything is permitting cells; and permitting cells is a thing the god does once, in the
first 140 of 2,400 ticks, after which the universe does the rest by itself.

**The forced next step is that a universe must not be able to exhaust the reachable set, and the
win condition must read something a god can only get by playing.** W8's looting is still the only
mechanism yet measured that crosses the content ceiling — and interaction 3 shows that on this tree
it no longer does so durably.
