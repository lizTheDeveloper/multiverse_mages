<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The dimensionality of the strategy space, measured

**Build:** `w15/strategy-dimensionality`, branched from `main` at `6e5ecee`, reference-universe-v1.
**Instrument:** 96 runs, eight strategies × 12 runs, 2,400 world ticks (200 years), under common
random numbers — arm A. Plus arm B, varying the founding species mix: **168 runs**, four strategies
× seven founding mixes × 6 runs, all 28 `(strategy, mix)` groups complete.

Everything below is measured. Where a number is a hypothesis rather than a reading, it says so.

## The question, and the answer in one paragraph

The campaign's thesis is *"the v1 subset is not too small — acquisition is too easy. Twelve cells of
contested, hard-won magic would be plenty to fight over."* An external review attacked it: the 51 v1
nodes are fungible, so making acquisition hard would leave the optimal play as *"acquire everything,
slowly"* and the six species would change only the speed of convergence. The proposed test was to
compute the effective dimensionality of the strategy space over the nodes.

**Measured: within the v1 ruleset the strategy space has one effective dimension.** The first
principal component of the runs × nodes matrix carries **91.4%** of the variance; one component
reaches the 80% threshold and two reach 95%; the participation ratio is **1.19**. Every pair of
strategies is **perfectly nested** — mean containment `|A∩B| / min(|A|,|B|)` is **1.000** for every
cross-strategy pair inside v1. Strategies do not pick different subsets of the fifty-one; they stop
at different points along **one queue**. **The critique is correct and the thesis, as stated, is
insufficient.**

## What was measured, and how the node sets were obtained

**Not inferred from aggregate counts.** They could not have been: `referenceNodesKnown` is a sum of
seventy per-cell counts decoded out of the §4.1 observation, `agent-api`'s `digestKnowledge` builds
the per-cell node-id set and discards it, and `mc-harness`'s `CensusSample.existingNodeIds` — which
is exactly the right shape — has **no production caller** (`KnowledgeCensus.offer` is called only
from tests). No committed record in this repository carries node identity.

So `tools/w15/composition.mjs` rebuilds the reference world schema with **one extra system
appended** — a probe that draws no randomness and mutates nothing — and reads
`collectRecords(state, KNOWLEDGE_INSTANCE)` directly, keeping both the distinct node ids and the
instance count per node. Everything else is the production path verbatim: `buildReferenceState`,
`createSession`, `runEpisode`, `BOT_POOL_REGISTRY`, `policiesForRun`.

**The probe's inertness is measured, not assumed.** A probed and an unprobed run at the same
coordinates agree on snapshot hash, terminal reason and tick count. Taken at a 1,200-tick cap to keep
the check cheap, which is why `passive-control` reads 1200 here and 2400 in the tables below:

| strategy | snapshot hash | terminal reason | ticks |
|---|---|--:|--:|
| `passive-control` | `6623c6eb66b9a4b9` (both) | 0 (both) | 1200 (both) |
| `permissive-breadth` | `c5e2ef47071ccbcb` (both) | 2 (both) | 962 (both) |
| `narrow-depth` | `eb2edaa0dfda1a5a` (both) | 3 (both) | 525 (both) |

### Common random numbers, and the trap that was avoided

`deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex, replicateIndex)`. The committed
`balance-gate-ascension` sweep assigns strategies **round-robin**, which deals each strategy a
*disjoint* set of replicate indexes — so no two strategies in it ever play the same universe, and an
arm comparison taken from it would compare seeds rather than strategies.

Every arm here walks the **identical** coordinate grid (`rootSeed` 20260811, `sweepId`
`w15-dimensionality-v1`, cells 0 and 3 of the ascension sweep's expansion, replicates 0–5), and the
factor under test is supplied out of band. Two starting positions rather than one, so within-strategy
variance carries both seed noise and starting-position noise: cell 0 is `cohortSize 4, foundingNodes
1`, cell 3 is `cohortSize 12, foundingNodes 4`.

Pairwise overlaps are computed **universe for universe** — a run is compared with the run at the same
coordinates in the other arm, never with an arm mean.

## 1. Per-strategy node composition

| strategy | n | mean nodes | min | max | union across seeds | ∩ across seeds | mean instances | mean ticks | terminal reasons |
|---|--:|--:|--:|--:|--:|--:|--:|--:|---|
| `archivist` | 12 | 51.0 | 51 | 51 | 51 | 51 | 3389 | 1224 | 6 apotheosis, 6 canon |
| `denial-warden` | 12 | 2.7 | 1 | 4 | 4 | 1 | 59 | 1072 | 6 canon, 5 stagnation, 1 cap |
| `narrow-depth` | 12 | 7.7 | 4 | 11 | 14 | 3 | 1359 | 920 | 7 canon, 5 stagnation |
| `passive-control` | 12 | 51.0 | 51 | 51 | 51 | 51 | 3168 | 2400 | 12 reached the cap |
| `permissive-breadth` | 12 | 212.8 | 175 | 242 | 275 | 154 | 5207 | 951 | 5 apotheosis, 7 canon |
| `portal-rush` | 12 | 51.0 | 51 | 51 | 51 | 51 | 2734 | 962 | 12 canon |
| `uniform-random-legal` | 12 | 49.8 | 45 | 51 | 51 | 44 | 2767 | 734 | 12 apotheosis |
| `worship-maximizer` | 12 | 50.9 | 50 | 51 | 51 | 50 | 2803 | 993 | 2 apotheosis, 10 canon |

Three strategies hold **the identical fifty-one nodes in all twelve runs** — union, intersection and
mean all equal 51. That is not a discovery; it was pre-registered as forced. Fifty-one is the entire
reachable set under the v1 ruleset, so a strategy that reaches it has no composition to choose.

## 2. Dimensionality — the eigenvalue spectrum

Rows are **runs**, not strategy means, so between-strategy and within-strategy variance can be
separated. The matrix is mean-centred and eigendecomposed via cyclic Jacobi on the runs × runs Gram
matrix. Four variants are reported because the naïve one answers the wrong question: a spectrum taken
on unnormalized rows finds *"how much a universe knows"* and can present it as a compositional
dimension. Row-normalizing to unit length removes magnitude and leaves shape.

### Inside the v1 ruleset — 84 runs, seven strategies, 51 node columns

| matrix | top-5 variance share | 80% | 95% | participation ratio | variance between strategies |
|---|---|--:|--:|--:|--:|
| binary held-set | 0.914, 0.037, 0.020, 0.010, 0.004 | **1** | **2** | **1.19** | 0.946 |
| binary, shape only | 0.627, 0.180, 0.108, 0.028, 0.018 | 2 | 5 | 2.28 | — |
| effort-weighted | 0.516, 0.256, 0.149, 0.056, 0.022 | 3 | 4 | 2.79 | 0.548 |
| effort, shape only | 0.596, 0.190, 0.160, 0.034, 0.014 | 3 | 4 | 2.39 | — |

**One component carries 91.4% of the variance.** 94.6% of the total variance is between strategies,
so the strategy label explains almost everything — along a single axis.

### Including `permissive-breadth` — 96 runs, eight strategies, 282 node columns

| matrix | top-5 variance share | 80% | 95% | participation ratio | variance between strategies |
|---|---|--:|--:|--:|--:|
| binary held-set | 0.638, 0.260, 0.028, 0.016, 0.010 | **2** | **5** | **2.10** | — |
| binary, shape only | 0.469, 0.249, 0.123, 0.075, 0.019 | 3 | 7 | 3.30 | — |
| effort-weighted | 0.476, 0.233, 0.143, 0.102, 0.020 | 3 | 4 | 3.20 | — |
| effort, shape only | 0.490, 0.162, 0.123, 0.099, 0.048 | 4 | 6 | 3.39 | — |

Adding one strategy that **changes the ruleset** adds exactly one component. That is the whole of the
difference between the two tables, and it is the point: the second axis is not a second way to play,
it is the same permission lever pushed the other way.

**Caveat, stated so nobody over-reads the spectrum:** eight strategies bound strategy-level structure
at seven components regardless of what the nodes do. The measurement can only ever have found ≤ 7,
and it found 1–2.

## 3. Do strategies converge on the same subset? — yes, and worse than "same"

Jaccard cannot answer this question on its own. A two-node set wholly inside a fifty-one-node set
scores 0.04 and reads as *"almost nothing in common"* when in fact it carries **no compositional
information at all** — only a size difference. So containment is reported beside it.

### Mean pairwise containment, `|A∩B| / min(|A|,|B|)`, paired universe for universe

| | archivist | denial-warden | narrow-depth | passive-control | permissive-breadth | portal-rush | uniform-random | worship-max |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **archivist** | 1.000 | 1.000 | 1.000 | 1.000 | 0.644 | 1.000 | 1.000 | 1.000 |
| **denial-warden** | 1.000 | 1.000 | 0.771 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| **narrow-depth** | 1.000 | 0.771 | 0.817 | 1.000 | 0.896 | 1.000 | 1.000 | 1.000 |
| **passive-control** | 1.000 | 1.000 | 1.000 | 1.000 | 0.644 | 1.000 | 1.000 | 1.000 |
| **permissive-breadth** | 0.644 | 1.000 | 0.896 | 0.644 | 0.966 | 0.644 | 0.660 | 0.645 |
| **portal-rush** | 1.000 | 1.000 | 1.000 | 1.000 | 0.644 | 1.000 | 1.000 | 1.000 |
| **uniform-random** | 1.000 | 1.000 | 1.000 | 1.000 | 0.660 | 0.999 | 1.000 | 1.000 |
| **worship-max** | 1.000 | 1.000 | 1.000 | 1.000 | 0.645 | 1.000 | 1.000 | 1.000 |

Every entry that does not involve `permissive-breadth` is **1.000** or, for the two smallest sets
compared with each other, 0.771. `denial-warden`'s 2.7 nodes are a subset of `narrow-depth`'s 7.7,
which are a subset of the 51, which are a subset of nothing else. **The strategy space is a chain.**

### Mean pairwise Jaccard, for completeness

| | archivist | denial-warden | narrow-depth | passive-control | permissive-breadth | portal-rush | uniform-random | worship-max |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **archivist** | 1.000 | 0.052 | 0.150 | 1.000 | 0.142 | 1.000 | 0.977 | 0.998 |
| **denial-warden** | 0.052 | 0.674 | 0.256 | 0.052 | 0.012 | 0.052 | 0.054 | 0.052 |
| **narrow-depth** | 0.150 | 0.256 | 0.576 | 0.150 | 0.032 | 0.150 | 0.155 | 0.151 |
| **passive-control** | 1.000 | 0.052 | 0.150 | 1.000 | 0.142 | 1.000 | 0.977 | 0.998 |
| **permissive-breadth** | 0.142 | 0.012 | 0.032 | 0.142 | 0.825 | 0.142 | 0.143 | 0.142 |
| **portal-rush** | 1.000 | 0.052 | 0.150 | 1.000 | 0.142 | 1.000 | 0.977 | 0.998 |
| **uniform-random** | 0.977 | 0.054 | 0.155 | 0.977 | 0.143 | 0.977 | 0.962 | 0.979 |
| **worship-max** | 0.998 | 0.052 | 0.151 | 0.998 | 0.142 | 0.998 | 0.979 | 0.997 |

Note the diagonal. It is the **within-strategy** figure across seeds, and it is the pre-registered
niche test.

### Prefix fidelity — the sharpest single number

Rank the nodes by how many runs hold them, descending. For a run holding `k` nodes, predict *"the top
`k`"*. Measured over the 84 v1 runs: mean overlap **0.943**, exact on **65 of 84** runs. Over all 96
including `permissive-breadth`: **0.929**, exact on 65 of 96.

**A run's node set is very nearly a function of its node count.** One fixed ordering of the fifty-one
nodes predicts what every strategy ends up holding. That is a one-dimensional strategy space in the
only sense the question cares about — and no amount of making acquisition harder adds a dimension to
it, because harder acquisition moves the stopping point along the queue and does not reorder it.

*(The `worst 0.000` figure in the tooling is a single-node `denial-warden` run holding a node that is
not the globally most frequent. Single-node sets are noisy; containment is the robust statement.)*

### The pre-registered niche test: do the restricting strategies pick a repeatable subset?

**No.** `narrow-depth` holds a mean of 7.7 nodes, but the union across its twelve runs is **14** and
the intersection is **3**; its within-strategy Jaccard is **0.576**. `denial-warden` holds 2.7 with a
union of 4, an intersection of 1, and a within-Jaccard of **0.674**.

Their small sets are not a chosen niche. They are a different handful each seed — noise wearing a
niche's clothes, which is exactly what the pre-registration named as the thing nobody had measured.

### The one genuine compositional trade in the build, and where it comes from

`permissive-breadth` is the sole exception, and it is worth stating precisely because it is the one
place opportunity cost exists today. Its containment against the v1-bound strategies is **0.644**, not
1.000: its ~213 nodes do **not** contain the 51. In all twelve runs it holds only 25–38 of them, and
**seven specific v1 nodes are missed in 12 of 12 runs** while 22 are held in all 12.

That is a real trade — breadth bought with v1 depth, consistently, not by chance. But it is bought by
**editing the ruleset**, not by playing differently within one. It is the permission axis the campaign
already knew was the only live one, seen from the composition side.

## 4. Composition at fixed horizons — speed against shape

Runs terminate anywhere from tick 525 to the 2,400 cap, so a terminal-only comparison conflates
duration with choice. Composition sampled on the era grid:

| tick | archivist | denial-warden | narrow-depth | passive-control | permissive-breadth | portal-rush | uniform-random | worship-max | min pairwise containment |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 240 | 46.5 | 3.9 | 7.7 | 46.8 | 65.2 | 46.6 | 46.8 | 47.1 | 0.202 |
| 480 | 48.8 | 2.7 | 7.7 | 48.6 | 132.1 | 48.8 | 48.3 | 49.0 | 0.437 |
| 960 | 50.9 | 3.3 | 9.1 | 50.9 | 203.4 | 51.0 | — | 50.9 | 0.620 |
| 1440 | 51.0 | 3.5 | — | 51.0 | — | — | — | — | 1.000 |

Five of the eight strategies are within 0.6 nodes of one another **by tick 240** — one fifth of the
run — and stay there. The plateau is not something the strategies race toward at different speeds; it
is reached in the first twenty world years by everyone who does not forbid something.

## 5. Varying the founding species mix — D7 and D9

### The instrument did not exist, and this is what was added

`buildReferenceState` seeded **every** species with the same cohort size and had no founding-mix
knob at all, so D7 — *"varying the founding species mix changes which strategy wins"* — was not
measurable even in principle. `ReferenceOptions.foundingSpeciesMask` was added: a scalar bitmask over
species in content order, where **zero means every species**. Zero rather than
`(1 << speciesCount) - 1` because `CLAUDE.md` puts species in validated content data and a default
must not hardcode how many there are; the absent option and the default build the byte-identical
universe, asserted by snapshot hash in `reference-universe.test.ts`. A mask selecting nobody is
refused rather than run. It is an **instrument**: no constant turned, no rule changed.

**Disclosed CRN caveat.** Holding the coordinates constant across masks does not make two arms *the
same universe*: removing a species changes founding entity creation order and therefore every
downstream draw. That is inherent to the factor under test — you cannot vary who founds a universe
and keep the universe — and it is why the species comparison leans on composition set-theory rather
than on paired numeric deltas.

### Outcome by founding mix

Content order is draconic, dwarf, elf, gnome, human, orc — masks 1, 2, 4, 8, 16, 32.

| strategy | founding mix | n | mean nodes | union | ∩ | mean instances | mean ticks | endings |
|---|---|--:|--:|--:|--:|--:|--:|---|
| `passive-control` | all six | 6 | 51.0 | 51 | 51 | 3115 | 2400 | 6 reached cap |
| `passive-control` | draconic | 6 | 26.7 | 51 | 1 | 162 | 1441 | 3 cap, 3 stagnation |
| `passive-control` | dwarf | 6 | 47.0 | 51 | 31 | 1836 | 2004 | 4 cap, 2 stagnation |
| `passive-control` | elf | 6 | 50.2 | 51 | 46 | 306 | 1334 | 6 stagnation |
| `passive-control` | gnome | 6 | **49.0** | **49** | **49** | 460 | 939 | 6 stagnation |
| `passive-control` | human | 6 | 44.7 | **49** | 37 | 4753 | 2400 | 6 reached cap |
| `passive-control` | orc | 6 | 0.5 | 1 | 0 | 19 | 1459 | 3 cap, 3 stagnation |
| `permissive-breadth` | all six | 6 | 214.3 | 268 | 173 | 5142 | 1011 | 2 apotheosis, 4 canon |
| `permissive-breadth` | draconic | 6 | 72.8 | 143 | 1 | 73 | 1441 | 3 cap, 3 stagnation |
| `permissive-breadth` | dwarf | 6 | 101.5 | 170 | 1 | 1875 | 1421 | 4 canon, 1 cap, 1 stagnation |
| `permissive-breadth` | elf | 6 | 112.7 | 118 | 105 | 655 | 962 | 6 canon |
| `permissive-breadth` | gnome | 6 | 168.7 | 186 | 153 | 855 | 962 | 6 canon |
| `permissive-breadth` | orc | 6 | 0.2 | 1 | 0 | 12 | 1835 | 3 cap, 2 canon, 1 stagnation |
| `permissive-breadth` | human | 6 | 96.7 | 159 | 48 | 10708 | 1375 | 6 apotheosis |
| `archivist` | all six | 6 | 51.0 | 51 | 51 | 3357 | 1248 | 3 apotheosis, 3 canon |
| `archivist` | draconic | 6 | 3.2 | 8 | 1 | 8 | 507 | 6 stagnation |
| `archivist` | dwarf | 6 | 19.3 | 51 | 2 | 755 | 728 | 2 canon, 4 stagnation |
| `archivist` | elf | 6 | 50.8 | 51 | 50 | 346 | 1585 | 3 canon, 2 stagnation, 1 cap |
| `archivist` | gnome | 6 | 49.0 | 49 | 49 | 398 | 859 | 6 stagnation |
| `archivist` | orc | 6 | 0.0 | 0 | 0 | 0 | 1215 | 2 canon, 3 stagnation, 1 cap |
| `archivist` | human | 6 | 43.8 | **49** | 36 | 4333 | 1254 | 5 apotheosis, 1 canon |
| `narrow-depth` | all six | 6 | 7.2 | 12 | 3 | 1308 | 863 | 3 canon, 3 stagnation |
| `narrow-depth` | draconic | 6 | 1.5 | 3 | 0 | 2 | 530 | 6 stagnation |
| `narrow-depth` | dwarf | 6 | 4.2 | 7 | 1 | 402 | 518 | 6 stagnation |
| `narrow-depth` | elf | 6 | 3.7 | 5 | 3 | 264 | 554 | 6 stagnation |
| `narrow-depth` | gnome | 6 | 3.0 | 3 | 3 | 203 | 526 | 6 stagnation |
| `narrow-depth` | orc | 6 | 1.3 | 5 | 0 | 3 | 640 | 1 canon, 5 stagnation |
| `narrow-depth` | human | 6 | 4.0 | 5 | 3 | 402 | 530 | 6 stagnation |

Founding mix changes outcomes enormously — an orc-only universe learns essentially nothing and an
elf-only one reaches 50.2 nodes. That is real signal, and it is the first time it has been measurable.

### But it changes speed and ceiling, not shape

Mean paired containment between founding mixes, same strategy, `|A∩B| / min(|A|,|B|)`:

| `passive-control` | draconic | dwarf | elf | gnome | orc |
|---|--:|--:|--:|--:|--:|
| **draconic** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **dwarf** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **elf** | 1.00 | 1.00 | 1.00 | 0.99 | 1.00 |
| **gnome** | 1.00 | 1.00 | 0.99 | 1.00 | 1.00 |
| **orc** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

Under the `archivist` the same matrix is **1.00 everywhere**. Every species' node set is nested inside
every other species' node set. Six species with a twenty-five-fold spread in lifespan, retention from
512 to 1536 and rediscovery affinity from 512 to 1792 produce **the same nodes in the same order**,
stopping at different points.

### The confirming test: two species with the same ceiling reach the identical set

Gnome and human both have `depthCeiling: 4`. If composition were species-specific, two different
species with the same ceiling would hold *different* sets of the same size. Measured:

- gnome, 6 runs: mean 49.0, union 49, intersection 49 — **the identical 49 nodes every seed**.
- human, 6 runs: per-run counts 37, 43, 41, 49, 49, 49; **union 49**.
- gnome ∪ vs human ∪: **identical**, 49 = 49, intersection 49, nothing in either that is not in both.
- and independently under the `archivist`: gnome union 49, human union 49 — the same ceiling, the
  same 49, under a different strategy.
- paired containment gnome ↔ human across all six coordinate pairs: **1.000, 1.000, 1.000, 1.000,
  1.000, 1.000**.

And the two v1 nodes neither can reach are `221` and `278` — checked against the catalog,
`pm-the-empty-room` and `rl-the-standing-gate`, both tier 5, and **the only two tier-5 nodes in the
v1 set**. The v1 tier histogram is 12 / 13 / 13 / 11 / 2 across tiers 1–5. The depth ceiling is not a
hypothesis about why the sets differ; it is the whole of the difference, exactly.

Both of those are also **summit nodes** — the deepest node of `perdo-mentem` and of `rego-limen`. So a
gnome or human universe can reach only 10 of the 12 Apotheosis keys instead of 12, and that costs it
nothing whatsoever, because the predicate is an OR and any one key suffices. That is the fungibility
finding of §6 arriving from the species side.

**D7's instrument now exists. The answer it gives is the critique's: species change how far and how
fast, not which.** The species table cannot produce compositional variety on its own, because the
only species trait that touches composition at all is the depth ceiling, and a ceiling truncates one
ordering rather than selecting a different one.

**D9 — more than one viable playstyle per species — is not reachable from this position.** Every
species is offered the same queue; the only decision available is where to stop.

## 6. Are the 51 nodes fungible? — read off the predicates

The critique said *"all 51 nodes are fungible — they all contribute to the same achievement scalar"*.
Read literally against the code, that is **false**, and the true answer is more damaging.

### Where node identity does matter, today, in the build

1. **Apotheosis (`ascension.ts:121`)** requires a living mage to hold `deepest.get(cellId) === nodeId`
   — *the* deepest node of its cell, one specific id, ties broken by node id. Only **12 of the 51**
   can ever satisfy it; the other 39 can never. The twelve, with their tiers:

   | cell | summit node | tier | | cell | summit node | tier |
   |---|---|--:|---|---|---|--:|
   | intellego-mentem | `im-open-the-locked-room` | 4 | | perdo-nomen | `pn-the-nameless` | 4 |
   | intellego-terram | `it-find-the-deep-seam` | 3 | | rego-mentem | `rm-the-shared-mind` | 4 |
   | intellego-limen | `il-stand-in-the-doorway` | 4 | | rego-terram | `rt-the-vaulted-hall` | 4 |
   | intellego-nomen | `in-catalogue-of-names` | 4 | | rego-limen | `rl-the-standing-gate` | 5 |
   | perdo-mentem | `pm-the-empty-room` | 5 | | rego-nomen | `rn-the-bound-servant` | 4 |
   | perdo-terram | `pt-the-swallowed-hall` | 4 | | perdo-limen | `pl-nothing-holds` | 4 |

2. **Prestige** scales linearly with `deepestTier` — the maximum tier any living mage holds
   (`god/system.ts:636`, `ascension.ts:250`) — and that carries into the next universe's starting
   stocks through `carriedPrestige` and `legacyGrant`.
3. **God-action cost**: `grantFoundingKnowledge` costs `base × node.tier` (`god/favor.ts:154`).
4. **Two live effect primitives**: `portal` gates raiding on holding a specific node
   (`interventions.ts:898`), and `worship-yield` nodes feed favor regeneration (`god/system.ts:604`).

### Why that differentiation buys no compositional variety

Every one of those is **disjunctive or maximizing**, never additive over a set:

- Apotheosis is an **OR across twelve interchangeable keys**. Holding two summits is worth exactly
  what holding one is worth. There is no subset of summits that is better than another subset.
- Prestige reads the **maximum** tier held, not a sum. A universe holding five tier-4 nodes scores
  what a universe holding one tier-4 node scores.
- **Enduring Canon (`canonSatisfied`) is entirely content-blind** — `goodEraRun >= eraCount`. Which
  nodes you hold is not an input. In this measurement Canon is the modal ending: 6/12 of `archivist`,
  7/12 of `permissive-breadth`, 12/12 of `portal-rush`.

And the mechanism that decides *which* nodes get acquired **cannot see any of it**:

    // packages/rules-world/src/autonomy/candidates.ts:82
    export function compareTargets(a: KnowledgeTarget, b: KnowledgeTarget): number {
      if (a.remainingCost !== b.remainingCost) return a.remainingCost - b.remainingCost;
      return a.nodeId - b.nodeId;
    }

**Cheapest first, node id to break the tie. A mage's utility function never asks what a node is worth
to hold** — only what it costs. Most of the node-authored `effects` array is inert besides:
`gatherEffects` and `stackContributions` have no caller outside `rules-magic`'s own tests, and
`world-step.ts` hardcodes `resourceYieldBonuses: []` (line 637) and `fertilityBonuses: []` (line 957),
so authored `resource-yield`, `fertility`, `build-rate`, `scribe-rate` and `concealment` magnitudes
change nothing.

**That is the mechanism behind prefix fidelity 0.943.** The acquisition order is a fixed, value-blind
cost queue. Making acquisition harder moves the stopping point down that queue; it cannot reorder it,
because nothing in the ordering reads value. The verdict:

> Nodes are **differentiated in the win condition and fungible in play**. Twelve are special and
> mutually interchangeable; tier is read as a maximum, never summed; and the only agent that chooses
> what to learn is blind to all of it.

## The verdict

**The campaign's thesis does not survive as stated.** *"The v1 subset is not too small — acquisition
is too easy"* is necessary and demonstrably insufficient. The measurement the review asked for was
performed and it returned the review's answer:

| claim | measured |
|---|---|
| effective dimensions inside the v1 ruleset | **1** for 80% of variance, 2 for 95%, participation ratio **1.19** |
| do strategies converge on the same subset | worse — they **nest**: containment **1.000** for every cross-strategy pair |
| is a run's node set predictable from its size alone | **yes**, prefix fidelity **0.943**, exact on 65/84 |
| does species change composition | **no** — cross-species containment 1.00; two ceiling-4 species reach the **identical** 49 |
| are the nodes fungible | differentiated in the win condition, **fungible in play** — the acquirer is value-blind |

The three effective dimensions the raw effort-weighted spectrum reports decompose into **breadth**
(how far down the queue), **concentration** (how many copies of the leading nodes), and
**permission-dilution** (`permissive-breadth`'s consistent trade of ~19 v1 nodes for ~180 outside).
All three are facets of one lever: what the god permits. None is a choice about *which magic to
invest in* under a fixed ruleset, because no such choice exists.

### Which of the two branches the campaign is on

The brief laid out two readings in advance. This is the first:

> **1–2 effective dimensions** → the thesis is wrong, or at least insufficient: no amount of making
> acquisition harder produces distinct playstyles, and the game needs *compositional value* — subsets
> that are better at different things, with opportunity cost forcing a choice.

Making acquisition hard, on its own, moves every strategy's stopping point earlier along the same
queue. Eight strategies at 51 nodes become eight strategies at 20 nodes — the **same** 20, in the
same order, since `compareTargets` is unchanged. That is a slower speedrun leaderboard, not six
playstyles.

### What would move the number, stated as a prediction that can be checked

Three changes, in the order their dependencies force, each with the measurement that would confirm it:

1. **Make the acquirer value-sensitive.** `compareTargets` orders by `remainingCost` then `nodeId`.
   Until a mage's target choice reads *something about what a node is worth to this universe*, no
   ruleset change can reorder acquisition. *Confirmed by:* prefix fidelity falling below ~0.7.
2. **Make node value depend on what else you hold** — a subset that is good at one thing and bad at
   another, so holding A makes B worth less and C worth more. Today `gatherEffects` has no caller and
   `resourceYieldBonuses`/`fertilityBonuses` are empty arrays; wiring them is the smallest existing
   path to it. *Confirmed by:* cross-strategy containment leaving 1.000 while both sets stay large.
3. **Give the choice an opportunity cost.** Composition can only vary if effort spent on A is effort
   not spent on B. `permissive-breadth` is the one place this exists today (containment 0.644) and it
   arrives from the ruleset, not from play. *Confirmed by:* two strategies with **equal** node counts
   and containment well below 1.0 — the signature this measurement never once observed.

Note the ordering is forced, and it is the same shape `hard-magic.md` found for the loss channel:
value-blind selection makes (2) and (3) unobservable no matter how well they are implemented.

### What this measurement does **not** say

- It does not say the twelve v1 cells are too few. The dimensionality is 1 at 51 nodes and it is 2 at
  282 (`permissive-breadth`); more content did not buy proportionally more axes, and the second axis
  came from the permission lever rather than from the extra nodes.
- It does not say making acquisition harder is worthless. Harder acquisition is what would make the
  stopping point a *decision* instead of a formality. It is necessary. It is measured here as not
  sufficient.
- It does not measure win rates by species mix. That is the board's D7 and it needs the full
  eight-strategy pool; this ran four strategies against seven mixes, and reports composition, which is
  what the dimensionality question asked for.

## Reproducing this

    npm run typecheck                       # tools/ load packages/*/dist
    node tools/w15/run-arm.mjs --strategies <id> --replicates 6 --out .w15/arm-a --tag arm-a
    node tools/w15/run-arm.mjs --strategies <ids> --masks <mask> --replicates 3 --out .w15/arm-b --tag arm-b
    node tools/w15/analyse.mjs .w15/arm-a strategyId
    node tools/w15/analyse.mjs .w15/arm-a strategyId --exclude permissive-breadth

A 2,400-tick run takes about 57 s single-threaded on the reference machine; the 96-run arm A was
executed as eight parallel processes.
