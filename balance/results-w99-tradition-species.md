<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W99 — the two factors no committed gate varies

**Build:** `w99/tradition-species-sweep` off `main` (`e2a15cf`), reference-universe-v1, scenario
build `0.3.0`, record format 3.
**Instruments:** the `integration-r2` sweep family re-run in full on this build, plus two scripts
that answer questions a sweep physically cannot.
**This changed no simulation behaviour.** The diff is four sweep JSON files, three scripts and this
document. No package source, no gate, no baseline, no golden fixture.

`REFERENCE_FACTOR_IDS` offers eight factors. Every committed gate — `balance-gate`,
`balance-gate-horizon`, `balance-gate-agency`, `balance-gate-ascension` — varies exactly two of
them, `cohortSize` and `foundingNodes`. `balance-full` adds `foundingMages`. **No committed gate
varies `foundingSpeciesMask` or `tradition`**, so every universe in every gate is founded with all
six species under one tradition, and that tradition is True Naming by an accident of the alphabet.

## The result in six lines

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
5. **The founding species mix is a real factor and it is bigger than seed noise.** See Table 3.
6. **Neither factor should be added to a committed gate yet**, and the reason is in the
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

<!-- TRADITION TABLES -->

---

## Question 2 — does the species mix change the game?

<!-- SPECIES TABLES -->

---

## Recommendation

<!-- RECOMMENDATION -->

---

## What this makes tradition-specific or all-six-specific

<!-- CORRECTIONS -->
