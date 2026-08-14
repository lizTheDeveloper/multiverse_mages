<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W99 — the two factors no committed gate varies

**Build:** `w99/tradition-species-sweep` off `main` (`e2a15cf`), reference-universe-v1, scenario
build `0.3.0`, record format 3.
**Instruments:** the `integration-r2` sweep family re-executed on this build, plus two scripts that
answer questions a sweep physically cannot.

**Sample size, stated plainly.** The committed sweep files declare 400 replicates. Under the machine
contention this ran on, one 400-replicate arm took twenty-five minutes, so **every arm here was
executed at 100 replicates — ten runs per strategy over the ten-strategy pool.** That is a *prefix*
and not a different experiment: `seed.ts` deliberately does not mix the replicate count into the
derivation, so runs 0–99 of a 100-replicate execution are bit-identical to runs 0–99 of the
committed 400-replicate file. Anyone re-running the committed files gets a superset of these numbers.
The all-six control was executed at 200 and **truncated to its first 100 records** so that every arm
in the table carries the same seeds; its full 200-run figures agree (`ascensionRate` 0.2000 at n=200
and 0.2000 at n=100).
**This changed no simulation behaviour.** The diff is four sweep JSON files, three scripts and this
document. No package source, no gate, no baseline, no golden fixture.

`REFERENCE_FACTOR_IDS` offers eight factors. Every committed gate — `balance-gate`,
`balance-gate-horizon`, `balance-gate-agency`, `balance-gate-ascension` — varies exactly two of
them, `cohortSize` and `foundingNodes`. `balance-full` adds `foundingMages`. **No committed gate
varies `foundingSpeciesMask` or `tradition`**, so every universe in every gate is founded with all
six species under one tradition, and that tradition is True Naming by an accident of the alphabet.

## The result in seven lines

1. **`balance/results-integration-r2.txt` does not reproduce on `main`.** Eighty-three commits
   touched `packages/` since it was written, including `feat(w69): founding grants become a budget`.
   The orc arm alone moved from *"learns essentially nothing, 0 of 400 ascensions"* to a universe
   that ascends. Every number in that file, and in `docs/design/tradition-sweep.md`, is a figure for
   a superseded build. **The tables below are the record for `main` at `e2a15cf`.**
2. **Under two of the three shipped traditions, a universe ends 2400 ticks with exactly zero
   teachable knowledge instances** — in all eight seeds, with every node it holds untransmittable.
   Under True Naming it holds 78.9.
3. **84.3% of the knowledge instances that arrive after founding are teachable on arrival under True
   Naming. Under Vancian it is 0.09%, and under the Art of Memory 0.47%.** The reference universe
   runs True Naming, so *every propagation, teaching and library number this project has published
   is the 84.3% case.*
4. Half of what a tradition is licensed to do has no simulation path at all: `castPolicy` and
   `costPolicy` have **zero consumers** outside `rules-magic`'s own `traditions/` directory, and the
   two helpers that do reach further (`castCost`, `expendOnCast`) are consumed only by
   `@mm/rules-raid`, which has no dependents. **Every tradition result here is `acquire`/`store`
   only, and Vancian is therefore the standard-hooks control.**
5. **The founding species mix is a real factor and it is bigger than seed noise** — and **founding
   with all six beats founding with any one of them**, on every metric, at every seed. What it does
   *not* do is reorder the winners. See Table 2c.
6. **The two traditions that are indistinguishable on `ascensionRate` (0.2000 both), on the winner
   set, and on nodes known differ absolutely on whether any knowledge in the universe can move.**
   That is the case for the missing instrument, in one sentence.
7. **Neither factor should be added to a committed gate yet**, and the reason is in the
   recommendation section — it is not that they do nothing.

---

## Method, and the two identities it rests on

A run seed is `f(rootSeed, sweepId, cellIndex, replicateIndex)` (`mc-harness/src/seed.ts`) and each
**level** of a factor takes its own `cellIndex`. A three-level `tradition` factor in one file would
vary the universes as well as the tradition and the two effects could not be separated. So: one
level per file, all files in a family sharing one `sweepId` and one `rootSeed`. Run *r* of one arm
is then the same universe, playing the same strategy, under a different level.

Two families, and they are **not** comparable to each other, because their `sweepId`s differ and
therefore so do their seeds:

| family | `sweepId` | arms |
|---|---|---|
| tradition | `integration-r2-v1` | true-naming *(control)*, vancian-memorization, art-of-memory |
| founding species | `integration-r2-species-v1` | all six *(control)*, draconic, dwarf, elf, gnome, human, orc |

Four of the seven species arms are new in this change; `gnome`, `human` and `orc` were already
committed and are unchanged. The **all-six control at the species `sweepId` is new and it is the
one that was missing**: `integration-r2`'s "all six species" row was the *tradition* family's
control, at a different `sweepId`, so it was never seed-paired with the single-species arms it was
being compared against.

### The controls are the universe every previous measurement was taken in

Both control arms declare a factor at the level that means *"what a sweep file which does not name
this factor does"*. That identity is documented in `reference-universe.ts` — mask `0` selects every
species, and an absent tradition takes `scribingTraditionId`'s pick — and it is checked rather than
believed. `scripts/w99-identity-check.mjs` runs 400 ticks and compares **final snapshot hashes**,
because a comparison of resolved option structs would pass for two configurations that diverge after
tick one:

```
## Identity 1 — `foundingSpeciesMask: 0` is the absent factor

OK    seed 20268730  e72d94252d0e6bdf vs e72d94252d0e6bdf
OK    seed 20276649  efb2def837d54ac2 vs efb2def837d54ac2
OK    seed 20284568  a72dff7e9fef208e vs a72dff7e9fef208e
OK    seed 20292487  78e0bd27f397432c vs 78e0bd27f397432c

## Identity 2 — `tradition: "true-naming"` is the absent factor

reference traditionId resolves to 2

OK    seed 20268730  e72d94252d0e6bdf vs e72d94252d0e6bdf
OK    seed 20276649  efb2def837d54ac2 vs efb2def837d54ac2
OK    seed 20284568  a72dff7e9fef208e vs a72dff7e9fef208e
OK    seed 20292487  78e0bd27f397432c vs 78e0bd27f397432c

## Control — a different seed must give a different hash

OK    seeds differ  e72d94252d0e6bdf vs efb2def837d54ac2

## Control — a single-species arm must differ from the all-six arm

OK    draconic (mask 1)  e72d94252d0e6bdf vs a79b5d97ac664ca2
OK    dwarf (mask 2)  e72d94252d0e6bdf vs bc6e1be0b0c096da
OK    elf (mask 4)  e72d94252d0e6bdf vs 6ec82c2823b6420a
OK    gnome (mask 8)  e72d94252d0e6bdf vs 02ac0c9c8dfe8da3
OK    human (mask 16)  e72d94252d0e6bdf vs d293e844a23a36fb
OK    orc (mask 32)  e72d94252d0e6bdf vs 7fd9ba3f9a808e40

ALL CHECKS PASSED
```

The two controls are there for a reason beyond hygiene. The first says this change did not alter the
universe the gates run in; the second says the tradition arm labelled *true-naming* is not a fourth
universe but the status quo itself.

### One trap, recorded because it nearly caught this change

`foundingSpeciesMask`'s bits are indexed by **interned** species order, and interning sorts the id
*strings*. It is not `species.json`'s array order:

| bit | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| mask | 1 | 2 | 4 | 8 | 16 | 32 |
| species | draconic | dwarf | elf | gnome | human | orc |

`species.json` lists human first and gnome fifth. A file written from that order would have labelled
three arms with the wrong species and reported a table nobody could tell was wrong. The committed
`gnome`/`human`/`orc` files are correct; the order was verified against loaded content before the
new files were written, not reasoned about.

---

## Question 1 — does the tradition change the game?

### 1a. Two of the four licensed hooks have no simulation path

`vision.md` §4a licenses four extension points. On `main`:

| hook | reaches the simulation? | evidence |
|---|---|---|
| `acquire` | **yes** | `AcquirePolicy` is carried on `WorldStepDeps` and consulted per node by `instances/research.ts` |
| `store` | **yes** | `StorePolicy.scribingAvailable` decides whether a universe can scribe at all |
| `cast` | **no** | `castPolicy` has zero consumers outside `rules-magic/src/traditions/`; `expendOnCast` and `isCastable` reach only `rules-raid/src/arbitration.ts` |
| `cost` | **no** | `costPolicy` likewise; `castCost` reaches only `rules-raid/src/arbitration.ts` |

`@mm/rules-raid` appears in no other package's `package.json`. The gates resolve zero raids. So
**every tradition finding in this document is an `acquire`/`store` finding**, and the shipped
tradition table reduces to three points in a two-dimensional space:

| tradition | `acquire` | `store` | what it isolates |
|---|---|---|---|
| vancian-memorization | `standard` | `standard` | **the control** — its two differing hooks are inert |
| true-naming | `true-name` | `standard` | against Vancian: `acquire` alone |
| art-of-memory | `standard` | `palace` | against Vancian: `store` alone |

Vancian's `cast: prepared` (`slotsPerMage: 4`) and `cost: prepaid` are, on this build, decorative.

### 1b. The True Naming assumption, tested directly

**No sweep can answer this and that is a property of the instrument, not of the game.**
`packages/scenario/src/census.ts` decodes its vital signs out of §4.1's observation vector, on
purpose. The observation's knowledge block carries three channels per cell — nodes known, deepest
tier, instance count — and **no mastery channel**. So no `reference*` measure can distinguish a
universe holding two thousand instances it can teach from one holding two thousand it cannot, and
every committed sweep in this repository is blind to the difference.

W26 built the instrument that is not blind to it and wired it into two tests and no measurement:
`@mm/agent-api`'s `knowledgeCensus(state, { mastery })`. `scripts/w99-teachability-probe.mjs` is the
measurement. Passive control, zero actions, 2400 world ticks, eight common seeds per arm.

Full output in `balance/results-w99-teachability.md`. The three tables that matter:

#### Table 1a — the `acquire` hook, as loaded

| tradition | `acquire` kind | `initialMastery` | teachable on arrival by construction? |
|---|---|---|---|
| true-naming | `true-name` | **1024** | **yes** |
| vancian-memorization | `standard` | 256 | **no** |
| art-of-memory | `standard` | 256 | **no** |

The threshold is `DEFAULT_TEACH_THRESHOLD` = 512, and `setMastery`'s only rules-path caller is the
decay pass in `instances/decay.ts`, which **only ever lowers**. So under an `acquire: standard`
tradition an instance born at 256 is not merely slow to become teachable — there is no mechanism in
the simulation that can ever raise it.

#### Table 1b — instances that arrive after founding, and whether they can be taught

| tradition | arrivals | teachable on arrival | fraction | mean arrival mastery |
|---|---|---|---|---|
| true-naming | 5074.8 | 4279.6 | **0.8433** | 819.0 |
| vancian-memorization | 4481.8 | 3.9 | **0.0009** | 229.8 |
| art-of-memory | 815.9 | 3.9 | **0.0047** | 229.5 |

#### Table 1c — what a universe holds after 200 world years

| tradition | nodes known | distinct nodes shelved | held instances | **teachable** | marooned | teachable nodes | **untransmittable nodes** |
|---|---|---|---|---|---|---|---|
| true-naming | 51.0 | 37.0 | 2486.6 | **78.9** | 2407.8 | 23.1 | 27.9 |
| vancian-memorization | 51.0 | 36.8 | 1897.6 | **0.0** | 1897.6 | 0.0 | **51.0** |
| art-of-memory | 26.4 | 0.0 | 440.3 | **0.0** | 440.3 | 0.0 | **26.4** |

#### The answer

**No. Under the other two traditions researched knowledge is not immediately teachable, and it never
becomes teachable.** In all eight seeds, under both Vancian and the Art of Memory, the universe
finishes 2400 ticks holding between 440 and 2,464 knowledge instances of which **exactly zero** can
be taught, and **every node it knows is untransmittable**. Teaching over the whole run: 4.1 lessons,
all of them in the first quarter, none afterwards — against True Naming's 2,155.9, which *rise*
through the run (262 → 412 → 687 → 794).

The 0.8433 rather than 1.0000 under True Naming is not the `acquire` hook failing. Arrivals are
detected on a 12-tick census grid, so a row's mastery is read up to twelve ticks after it was
created; at the shipped decay rates that is at most 96 units, which cannot carry 1024 below 512 nor
256 above it. The shortfall is **taught** instances: `teaching.ts` sets a student's mastery from the
teacher's, not from the `acquire` hook, and a teacher who has decayed transmits with a shortfall
that compounds down a chain. So even under True Naming a sixth of new knowledge arrives already
unteachable — which is why the universe ends with 78.9 teachable instances out of 2,486 held.

**How much of what this project has measured is a True-Naming-only result?** Every number taken from
the reference universe that involves teaching, knowledge propagation, redundancy, or teachable
stock. Concretely: `referenceKnowledgeInstances` is 31% higher under True Naming than under the
standard-hooks control on this build, and the *composition* of that stock differs absolutely — 78.9
teachable against 0.0. Any claim of the form *"knowledge spreads"* is a True Naming claim.


### 1c. The tradition sweep on this build

Three arms, one hundred runs each, common random numbers verified — 200 pairs compared, **zero seed
or strategy mismatches**, one `sweepId`, one `rootSeed`, three distinct levels. Full output in
`balance/results-w99-tradition-arms.md`.

#### Table 1d — per arm

| tradition | hooks | ascended/n | `ascensionRate` | nodes known | library depth | grimoires | instances | living mages |
|---|---|---|---|---|---|---|---|---|
| **true-naming** *(the status quo)* | `true-name` / `standard` | 20/100 | **0.2000** | 73.47 ±6.84 | 39.78 ±3.59 | 224.45 ±22.38 | 3217.56 ±236.62 | 328.12 ±74.50 |
| **vancian-memorization** *(the control)* | `standard` / `standard` | 20/100 | **0.2000** | 76.62 ±7.81 | 27.00 ±2.12 | 140.36 ±12.85 | 2824.16 ±210.78 | 355.12 ±80.84 |
| **art-of-memory** | `standard` / `palace` | **0/100** | **0.0000** | 21.36 ±1.04 | **0.00 ±0.00** | **0.00 ±0.00** | 858.25 ±114.58 | 373.78 ±87.52 |

Terminal statuses: true-naming `{truncated 65, ascended 20, stagnated 15}`, vancian
`{truncated 63, ascended 20, stagnated 17}`, art-of-memory `{truncated 73, stagnated 27}`.

#### Table 1e — paired against True Naming, same seed and same strategy

| tradition | nodes known | library depth | grimoires | instances | living mages | ascended Δ |
|---|---|---|---|---|---|---|
| vancian | +3.15 ±1.38 | **−12.78 ±3.88** ** | **−84.09 ±19.10** ** | **−393.40 ±101.78** ** | +27.00 ±14.73 | **0** (20 vs 20) |
| art-of-memory | **−52.11 ±6.55** ** | **−39.78 ±3.59** ** | **−224.45 ±22.38** ** | **−2359.31 ±184.52** ** | +45.66 ±16.90 | **−20** (0 vs 20) |

#### Table 1f — is the tradition bigger than the seed?

| metric | median ratio | strategies with `sd_between ≥ sd_within` |
|---|---|---|
| nodes known | **9.17** | 9 of 10 |
| knowledge instances | **4.66** | 10 of 10 |
| library depth | **2.21** | 10 of 10 |
| grimoires | **1.80** | 10 of 10 |
| living mages | 0.46 | 1 of 10 |
| population | 0.43 | 0 of 10 |

The tradition is emphatically a factor on the knowledge metrics and emphatically **not** one on the
demographic metrics — which is the right shape, because neither `acquire` nor `store` touches
births or deaths, and it is a useful negative control on the instrument.

#### The answer, in four parts

**1. The tradition changes the game — but the `acquire` axis and the `store` axis change different
things, and only one of them changes the outcome.**

`store` decides everything. The Art of Memory's `palace` hook has `scribingAvailable: false`, and
that single boolean produces a universe with **zero grimoires and zero library depth in all one
hundred runs**, 21.4 nodes known against 73.5, and **not one ascension**. Vancian and True Naming
differ only in `acquire`, and they ascend at exactly the same rate — 20/100 each — with exactly the
same two winning strategies at exactly the same counts (`permissive-breadth` 10/10, `permit-then-idle`
10/10, and eight strategies at 0/10 under both).

**2. The `acquire` axis is invisible to the outcome and enormous underneath it.** Paired, Vancian
knows *more* nodes than True Naming, not fewer (+3.15 ±1.38, inside three standard errors overall,
and per strategy `permissive-breadth` reaches 228.8 ±5.6 under Vancian against 202.0 ±2.1 under True
Naming — True Naming's `researchCostMultiplier: 2048` costing it breadth). What Vancian loses is
carriage: 12.8 fewer distinct nodes shelved, 84 fewer books, 393 fewer instances — and, invisibly to
every committed metric, **all 78.9 of its teachable instances**.

**So the two traditions that are indistinguishable on the ascension rate, on the winner set, and on
nodes known differ absolutely on whether any knowledge in the universe can move.** That is the whole
case for the missing instrument.

**3. Which of these are `acquire`/`store` only? All of them.** `castPolicy` and `costPolicy` were
never executed in any of these three hundred runs, because nothing outside `@mm/rules-raid` calls
them and no package depends on `@mm/rules-raid`. Vancian's `cast: prepared` with `slotsPerMage: 4`
and its `cost: prepaid` did nothing, which is why it is usable as the standard-hooks control.

**4. `docs/design/tradition-sweep.md`'s headline no longer holds.** W13 measured `ascensionRate` at
0.6875 (Vancian), 0.6979 (True Naming) and **0.1250** (Art of Memory), and its most-quoted line was
that the Art of Memory *"is the only one of the three shipped traditions whose ascension rate falls
inside `contracts.md` §7's declared band"*. On this build the three read **0.2000, 0.2000 and
0.0000**. Two of the three have moved into the band and the Art of Memory has fallen out of it
underneath — it now ascends **never**. `docs/design/ages-of-magic.md` quotes the 0.125 as a measured
fact. It is not one any more.


---

## Question 2 — does the species mix change the game?

Seven arms, one hundred runs each (ten per strategy over the ten-strategy pool), 2400 world ticks,
common random numbers verified across all seven — 600 `(cellIndex, replicateIndex)` pairs compared,
**zero seed or strategy mismatches**, one `sweepId`, one `rootSeed`, seven distinct factor levels.
Full output in `balance/results-w99-species-arms.md`.

### Table 2a — per arm

| founding mix | ascended/n | `ascensionRate` | nodes known | library depth | grimoires | instances | living mages | population |
|---|---|---|---|---|---|---|---|---|
| **all six** *(control)* | 20/100 | **0.2000** | 73.41 ±6.85 | 37.71 ±3.23 | 228.78 ±22.82 | 3190.51 ±235.70 | 324.30 ±72.92 | 12257.90 ±840.66 |
| elf only | 20/100 | **0.2000** | 54.03 ±4.83 | 12.10 ±2.05 | 84.18 ±14.19 | 245.35 ±21.72 | 2.84 ±0.13 | 32.46 ±1.93 |
| gnome only | 17/100 | 0.1700 | 56.63 ±5.84 | 10.10 ±1.92 | 45.25 ±8.68 | 587.62 ±139.00 | 30.28 ±15.44 | 1374.49 ±408.01 |
| human only | 6/100 | 0.0600 | 39.62 ±4.29 | 0.52 ±0.27 | 15.53 ±5.00 | 3415.93 ±360.62 | 174.68 ±27.27 | 4089.89 ±506.95 |
| dwarf only | 2/100 | 0.0200 | 30.30 ±5.12 | 6.59 ±0.93 | 178.55 ±19.32 | 1061.28 ±219.92 | 29.56 ±10.59 | 648.48 ±148.31 |
| orc only | 2/100 | 0.0200 | 15.78 ±2.66 | 0.38 ±0.21 | 1.88 ±1.16 | 615.12 ±135.29 | 138.14 ±29.62 | 5794.95 ±844.13 |
| draconic only | **0/100** | **0.0000** | 26.88 ±4.55 | 3.10 ±1.20 | 18.49 ±7.44 | 50.56 ±9.80 | 4.26 ±0.07 | 11.86 ±0.38 |

### Table 2b — paired against the all-six control, same seed and same strategy

`**` marks a paired mean more than three paired standard errors from zero.

| founding mix | nodes known | library depth | grimoires | instances | living mages | ascended Δ |
|---|---|---|---|---|---|---|
| elf only | −19.38 ±2.68 ** | −25.61 ±3.83 ** | −144.60 ±30.63 ** | −2945.16 ±229.04 ** | −321.46 ±72.91 ** | 0 (20 vs 20) |
| gnome only | −16.78 ±2.41 ** | −27.61 ±3.61 ** | −183.53 ±25.56 ** | −2602.89 ±219.13 ** | −294.02 ±69.54 ** | −3 (17 vs 20) |
| human only | −33.79 ±4.89 ** | −37.19 ±3.27 ** | −213.25 ±23.56 ** | +225.42 ±296.05 | −149.62 ±59.60 | −14 (6 vs 20) |
| dwarf only | −43.11 ±5.50 ** | −31.12 ±3.04 ** | −50.23 ±29.64 | −2129.23 ±244.98 ** | −294.74 ±70.09 ** | −18 (2 vs 20) |
| draconic only | −46.53 ±5.03 ** | −34.61 ±3.26 ** | −210.29 ±23.79 ** | −3139.95 ±233.14 ** | −320.04 ±72.92 ** | −20 (0 vs 20) |
| orc only | −57.63 ±5.34 ** | −37.33 ±3.23 ** | −226.90 ±22.92 ** | −2575.39 ±202.74 ** | −186.16 ±61.67 ** | −18 (2 vs 20) |

**Founding with all six beats founding with any one of them, on every metric, at every seed.**
Thirty-four of the thirty-six paired cells above are negative at more than three paired standard
errors; the two that are not are human's instance count (higher, not significantly) and dwarf's
grimoires. This is a monoculture penalty and it is not a small one: the *best* single species loses
sixteen nodes and two thirds of its library depth against the mixed founding.

### Table 2c — between-species spread against between-seed spread

The containment statistic. `sd_between` is the spread of the seven arm means inside one strategy;
`sd_within` is the spread across seeds inside one arm, pooled over arms. **A species difference
smaller than seed noise is not a species difference**, so a ratio below 1 would say the factor is
not worth reading. `F` is the one-way ANOVA statistic beside it, which asks the weaker question of
whether the *means* are distinguishable at this sample size.

| metric | median ratio over the ten strategies | strategies with `sd_between ≥ sd_within` |
|---|---|---|
| nodes known | **1.27** | 7 of 10 |
| library depth | **1.03** | 7 of 10 |
| grimoires | **1.26** | 7 of 10 |
| knowledge instances | **1.35** | 9 of 10 |
| living mages | **1.48** | 8 of 10 |
| population | **1.80** | 8 of 10 |

Worked, for `nodes known`:

| strategy | `sd_between` | `sd_within` | ratio | `F` | arm means, low → high |
|---|---|---|---|---|---|
| archivist | 20.28 | 13.00 | **1.56** | 24.3 | draconic 3.6, dwarf 11.8, orc 14.4, human 31.3, gnome 49.0, elf 49.8, all-six 51.0 |
| passive-control | 18.25 | 14.40 | **1.27** | 16.1 | orc 1.9, draconic 25.0, dwarf 25.2, human 36.6, gnome 49.0, all-six 51.0, elf 51.0 |
| permissive-breadth | 50.86 | 52.62 | **0.97** | 9.3 | orc 57.0, draconic 84.6, human 87.6, dwarf 100.6, elf 141.1, gnome 157.4, all-six 203.9 |
| portal-rush | 18.76 | 10.53 | **1.78** | 31.8 | draconic 0.9, dwarf 2.0, gnome 4.0, elf 5.1, orc 6.9, human 18.6, all-six 53.4 |
| denial-warden | 0.97 | 1.17 | **0.83** | 6.9 | five arms at 0.0, all-six 1.6, dwarf 2.3 |

**The founding species mix moves the game by more than the seed does.** Every `F` above is far past
any conventional critical value, and — the stronger statement — the ratio of a spread of *means* to
a spread of *runs* clears 1 for a majority of strategies on all six metrics. The two strategies
where it does not are the two that are indifferent to who founded the universe for opposite reasons:
`permissive-breadth` because it is dominated by how much of the grid the god unlocks, and
`denial-warden` because it forbids everything and nobody learns anything under any mix.

### Table 2d — the mix decides whether winning is possible, not who wins

| strategy | all six | elf | gnome | human | dwarf | orc | draconic |
|---|---|---|---|---|---|---|---|
| `permissive-breadth` | 10/10 | 10/10 | 9/10 | 3/10 | 1/10 | 2/10 | 0/10 |
| `permit-then-idle` | 10/10 | 10/10 | 8/10 | 3/10 | 1/10 | 0/10 | 0/10 |
| the other eight strategies | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |

The winner's identity is **invariant** across all seven founding mixes: it is `permissive-breadth`
and `permit-then-idle`, or it is nobody. Eight of ten strategies ascend zero times under every mix.
What the mix decides is the *rate*, over the full range from 1.000 to 0.000 — and it is not a
proxy for how much the universe learns. **Elf-only ascends at exactly the control's rate while
knowing 19.4 fewer nodes**, and draconic-only knows more nodes than orc-only and ascends less often.

### Two species facts worth carrying

- **Draconic-only never ascends and barely lives.** 4.26 ±0.07 living mages, a population of 11.86,
  50.6 knowledge instances against the control's 3,190. A `lifespanMonths` of 18,000 with a
  `maturityMonths` of 3,600 and a `fertility` of 96 is a species that cannot found a universe by
  itself, and nothing in the committed record said so because nothing ever founded one.
- **Human-only is the redundancy case.** It holds *more* knowledge instances than the six-species
  control (3,415.93 against 3,190.51) while knowing **half** as many distinct nodes (39.62 against
  73.41) and shelving essentially none (library depth 0.52 against 37.71). A universe can be rich in
  copies and poor in knowledge, and the two metrics disagree about which it is.

### And the caution in the brief is about a different quantity

`loss-shock-recovery.test.ts` records orc at *"a mean of 1.22 living mages across 32 seeds"*. That
is orc's roster **inside the all-six universe**, where it competes with five other species for the
same seats and food. An orc-*only* universe on this build reaches 138.14 ±29.62 living mages and a
population of 5,794.95, and ascends twice in a hundred runs. The two numbers are not in tension;
they are different measurements, and conflating them is exactly the all-six-only error this document
is about.


---

## Recommendation

**Neither factor should be added to a committed gate on this build.** Not because they do nothing —
both move the game more than the seed does — but for three reasons that are about the gate rather
than about the factor.

### 1. A gate's cost is multiplicative and its budget is already spent

`balance-gate.sweep.json` is held to 400 runs by a test whose comment says why: *"a gate that takes
ten minutes gets deleted, and a deleted gate is the failure this whole change is about."* Adding
`tradition` triples the cells; adding `foundingSpeciesMask` at all seven levels multiplies them by
seven; adding both is twenty-one times the current gate. There are four gates. `verify` runs three
of them on every push and `ci-check.sh` must stay equivalent to `verify`.

### 2. Several arms are degenerate, and a degenerate arm is an exact-equality demand

`standard-error.ts` is explicit that a zero standard error is not softened: *"a metric that has
never varied cannot move by chance; if it moves, something changed."* That is the right rule and it
is why single-species arms are dangerous in a gate rather than merely expensive. An orc-only
universe reports 0.0 nodes known under five of ten strategies with zero variance, so the tolerance
is zero and the gate demands exact equality — of a quantity that is zero because the universe is
dying, not because the rule is stable. Any tuning change anywhere would trip it, and the failure
would name orc rather than the thing that moved.

### 3. The thing worth gating is not the factor, it is the instrument that is missing

The most consequential finding here — that under two of three traditions a universe ends holding
nothing it can teach — **is invisible to every gate that could be built out of the current metric
set**, because the observation vector carries no mastery channel. Adding tradition levels to a gate
would add arms that all report plausible `referenceKnowledgeInstances` numbers while differing
absolutely in whether any of that knowledge can move. A gate built now would pass a build in which
teaching had been switched off entirely.

### What to do instead

1. **Keep both factors as measurement sweeps**, which is what this change commits. They are cheap to
   re-run and they are the record against which a later gate would be calibrated.
2. **Give the observation a teachable-instance channel, or give `mc-harness` a teachability metric
   through `armContribution`**, before gating either factor. `knowledgeCensus` already computes the
   number; nothing carries it into a run record.
3. **If one factor has to be gated first, gate `tradition` and not species** — three levels rather
   than seven, no degenerate arm, and the two levels that matter (`acquire` and `store`) are the two
   hooks that reach the simulation at all.
4. **Decide what `castPolicy` and `costPolicy` are for.** Half of `vision.md` §4a's licensed
   extension surface currently has no execution path outside `@mm/rules-raid`, which no package
   depends on. Until that changes, "the tradition axis" means `acquire` and `store`.


---

## What this makes tradition-specific or all-six-specific

Three committed statements are true only under an `acquire: standard` tradition and are stated as
facts about the game. The reference universe runs True Naming, so each is false for **every
measurement this project has taken**. They are reported here and **deliberately not edited on this
branch** — this change's claim to have altered no behaviour rests on its diff being sweep files,
scripts and results, and a prose correction is a separate decision.

### 1. `docs/design/release-plan.md:314–316` — the 0.4.0 degeneracy

> **Teaching stops after world year twenty.** A researched instance is created at `fp(256)` and the
> teach threshold is `fp(512)`, so nothing a mage works out for herself is ever teachable.
> Knowledge spreads only from founding grants, and those are taught out inside the first window.

This is a **release claim**, in the document `CLAUDE.md` calls authoritative for versioning, in the
0.4.0 section, describing the reference universe. Both sentences are properties of `acquire:
standard`. The reference universe resolves `true-naming`, whose `acquire` hook sets `instanceMastery:
1024`. Measured on this build, in the same passive control: 84.3% of post-founding arrivals are
teachable on arrival, teaching runs for the full 2400 ticks and its rate **rises** across the four
quarters (262 → 412 → 687 → 794 lessons). Teaching does not stop after world year twenty; under
Vancian it stops after world year *four*.

The claim is not merely mis-scoped, it is inverted: it describes the two traditions nothing was
measured under and denies the one everything was measured under.

### 2. `packages/scenario/src/species-versatility.ts:45–55` — the rationale under a shipped metric

> Research creates an instance at `DEFAULT_INITIAL_MASTERY` (256), which is below the 512 teach
> threshold and can never climb to it. **Every teachable instance in a universe therefore descends
> from a god's founding grant at 1024** […] So "can this species staff a cell" does not turn on what
> it can learn. It turns on how long it can still pass on what it was handed.

This is the justification for `teachableWindowTicks`, a **field of the committed
`speciesGridVersatility` metric**, and its pinned constant `teachableWindowRule` is recorded in
`docs/design/metric-constants.md:141`. The arithmetic is fine and tradition-independent:

| species | retention | decay/tick | floor | `teachableWindowTicks` |
|---|---|---|---|---|
| draconic | 1536 | 5 | 384 | 102 |
| dwarf | 1536 | 5 | 384 | 102 |
| elf | 1280 | 6 | 320 | 85 |
| human | 1024 | 8 | 256 | 64 |
| orc | 896 | 9 | 224 | 56 |
| gnome | 512 | 16 | 128 | 32 |

What is false is the sentence that makes the window *the* constraint. Under True Naming every
research completion mints a fresh instance at 1024, so the teachable stock is continuously
replenished and the window is a decay time rather than a budget the universe cannot refill. The
probe measures 5,074 arrivals per passive run under True Naming, 4,280 of them teachable — against
a founding grant budget of a handful. **The metric's number is right and its published meaning is a
statement about Vancian and the Art of Memory.**

### 3. Everything species-shaped was measured in the all-six universe

`release-plan.md`'s 0.4.0 `timeToTierBySpecies` table, `loss-shock-recovery.test.ts`'s *"orc
measures a mean of 1.22 living mages across 32 seeds"*, and W61's occupancy work are all readings
taken **inside a universe founded with all six species**, where the species compete for the same
academy seats, shelves and food. They are not statements about what a species does. The
single-species arms below are, and they disagree with the mixed-universe reading — an orc-only
universe is not orc's row in the all-six table.

This is the same class of error as the tradition one, and it has the same cause: a factor that no
committed gate varies becomes invisible, and a constant nobody chose starts reading as a property of
the game.

### 4. The prior measurement of both factors is superseded

`balance/results-integration-r2.txt` and `docs/design/tradition-sweep.md` are the only two places
either factor was ever measured, and neither reproduces on `main`. Eighty-three commits touched
`packages/` between `results-integration-r2.txt` and `e2a15cf`, among them `feat(w69): founding
grants become a budget — scarce, not weak`, which is exactly the constant that decides how much
teachable knowledge a Vancian universe ever gets. `tradition-sweep.md` reported 134.1 Vancian
lessons per passive run; this build reports **4.1**. Neither file's per-run records were committed
— both point at scratchpad paths — so the divergence is visible but not cheaply bisectable.

