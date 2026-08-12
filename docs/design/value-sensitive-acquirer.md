<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The value-sensitive acquirer, and what it did and did not move

**Build:** `w17/value-sensitive-acquirer`, branched from `main` at `6e5ecee`, then merged with
`w15/strategy-dimensionality` (the instrument) and `w7/knowledge-capital` (which had already changed
the same function). **Instrument:** W15's, verbatim — `tools/w15/{run-arm,composition,analyse}.mjs`,
`ReferenceOptions.foundingSpeciesMask`, and the inert composition probe. Nothing here is a second
instrument.

**Arms:** 96 runs each, eight strategies × 12, 2,400 world ticks, common random numbers, identical
coordinates (`rootSeed` 20260811, `sweepId` `w15-dimensionality-v1`, cells 0 and 3, replicates 0–5).
Three of them: **before** = `main`, **w7only** = `w7/knowledge-capital`, **after** = this branch.
Plus founding-species-mask arms for gnome (8) and human (16).

## The one-paragraph answer

The acquirer is now value-sensitive: target selection is a six-term utility score shaped by species
(including the authored `affinities` that no rule had ever read), age, personality and standing role,
exactly as vision §7 specifies. It reorders. **And the four pre-registered claim thresholds are not
met.** Prefix fidelity fell only 0.943 → 0.909, the spectrum still needs one component for 80% of
the variance, and cross-strategy containment among unrestricted strategies is still 1.000.

**The reason is measurable and it is not "the selector is still blind."** Every unrestricted strategy
still ends holding **all 51** reachable v1 nodes — mean 51.0, union 51, intersection 51, in twelve
runs each. *When the endpoint is the whole reachable set there is no composition to choose, and no
ordering of the queue can change a set that contains everything.* Reordering shows up exactly where a
reordering can: in the **transient** composition and in the strategies that never reach the ceiling.

That is the same shape W15 predicted for the other lever, now confirmed from this side:
**value-sensitive selection is necessary and, on its own, not sufficient.** Both this and a real
acquisition cost are required, and neither substitutes for the other.

## What changed in the code

`compareTargets` ordered candidates by `remainingCost`, then `nodeId`. **In the v1 content set
`researchCost` is a pure function of tier** — 2048, 4096, 8192, 16384, 32768 for tiers 1–5, with no
within-tier variation at all across 12/13/13/11/2 nodes. So the old order was exactly *"tier, then
node id"*: one fixed total order shared by every mage of every species in every universe. That single
fact is the whole of W15's prefix fidelity 0.943, and it was established before a line was written.

`chooseTarget` is now the argmax of `targetAppeal` — six additive terms, each bounded on its own
axis, one clamp after summation, the same shape `scoring.ts` uses for goal scores and for the same
stated reason (additive terms are individually ablatable; a product cannot be interrogated).

| term | reads | the vision sentence it traces to |
|---|---|---|
| `effort` | `remainingCost` | §5 *"**Research** — a mage derives a new node from prerequisites they hold. **Slow.**"* |
| `affinity` | species `affinities`, cell key then form key | §6 *"Tuned on: lifespan, curiosity … and **technique/form affinities**."* |
| `species` | `curiosity` × tier | §6 *"**curiosity** (rate of self-directed research)"*, and the species table's *"Gnome … highest curiosity"* / *"Draconic … barely curious"* |
| `age` | age-band weight × tier | §7 *"utility-scored goals shaped by species, **age**, personality"* |
| `personality` | ambition and caution × tier | §7 *"… species, age, **personality** …"* |
| `role` | the node's authored effect primitives | §7 *"and their assigned standing **role** (researcher, warden, professor, raider)"* |

The `effort` term is the old behaviour, kept and **demoted** from being the whole ordering to being
one term of six. Deleting it would have produced a mage indifferent to how long her life's work
takes.

**`nodeId` remains the final tie-break.** Ties on appeal fall to `compareTargets` — cheapest, then
node id — so the order is total, **no draw is taken, and no RNG stream moves.** A draw added here
would have re-rolled stream 7 for every mage on every evaluation and silently rotted every committed
balance baseline.

### Which terms can reorder, stated in advance and then observed

- Terms proportional to **tier** — curiosity appetite, age, ambition, caution — bend or reverse the
  tier gradient and can create an interior optimum, but on their own each yields *another total order
  over tiers*. They change where a universe stops and how it gets there. They cannot, alone, make two
  universes hold different sets of the same size.
- Terms keyed on **which cell a node is in** (species `affinities`) or **what a node does** (its
  authored effect primitives, for the role term) are *orthogonal to tier*. **These two are the
  load-bearing ones.**

## Every constant added, and where it lives

`packages/content/data/autonomy-weight.json` — 36 records, each with a `gloss` and
`tuningStatus: "untuned"`. Nothing is hardcoded. Fifteen scalars:

| id | value | what it does |
|---|--:|---|
| `target-effort-divisor` | 64 | Divides remaining mage-months into the (negative) effort term. Makes the deepest v1 node spend the whole effort bound and a tier-1 node one sixteenth of it. |
| `target-affinity-divisor` | 2 | Divides an affinity's deviation from `fp(1)`. Puts a dwarf's terram 1536 at +256 — about two tiers of effort. |
| `target-curiosity-divisor` | 8 | Curiosity deviation into a per-tier appetite for depth. Gnome +96/tier, human +16/tier. |
| `target-ambition-divisor` | 4 | Ambition into a per-tier pull toward the summit. |
| `target-caution-divisor` | 4 | Caution into a per-tier push away from it. Opposite sign on purpose. |
| `target-age-young-per-tier` | 64 | A young mage has a life in which to finish a deep project. |
| `target-age-prime-per-tier` | 0 | Zero written out rather than absent, as `AGE_TERM`'s prime row is. |
| `target-age-senescent-per-tier` | −64 | A mind's instance dies with its holder (§5). |
| `target-bound-effort` | 512 | Per-term bounds. Conditioning on each input axis before summation; |
| `target-bound-affinity` | 384 | not the one clamp, which is applied once to the sum. |
| `target-bound-species` | 384 | |
| `target-bound-age` | 256 | |
| `target-bound-personality` | 256 | |
| `target-bound-role` | 512 | **Checked at load to be strictly below the sum of the other five (1792).** |
| `target-appeal-ceiling` | 4096 | Symmetric clamp on the sum. Does not bind: the six bounds sum to 2304. |

Plus 21 role × primitive rows — researcher 4, warden 5, professor 4, raider 8 — each naming a role
from `contracts.md` §1.2 and a primitive from `primitive.json`, both cross-checked at load, with an
id the loader requires to agree with the fields.

**The dominance check is the design pillar, not tuning hygiene.** `role-bias.ts` makes the argument at
the goal level and it is the same one here: a bias with no bound reintroduces role-as-filter by the
back door and would arrive as a tuning edit rather than as a decision anyone reviewed. So the loader
refuses a role bound at or above the sum of the other five, and refuses any row outside the role
bound. Vision §7's *"you set the role; they decide everything else"* now fails a content load rather
than an intention.

## The four claim measurements, before and after

Arm A, 84 runs, seven strategies, 51 node columns, `permissive-breadth` excluded because it edits the
ruleset. `before` reproduces W15 exactly, which is the check that the instrument is the same one.

| claim | threshold | before | after | met |
|---|---|--:|--:|:--:|
| prefix fidelity | **< 0.7** | 0.9433 (exact 65/84) | **0.9085** (exact 60/84) | **no** |
| components for 80% of variance | **≥ 2** | 1 | **1** | **no** |
| cross-strategy containment | **< 1.000** | 1.000 | **1.000** | **no** |
| gnome vs human node sets | **not identical** | identical (49 = 49) | still identical as **unions** (49 = 49); per-run sets fully separated | **no** |

### What did move, and by how much

| measure | before | after |
|---|--:|--:|
| top-5 variance share, binary | 0.914, 0.037, 0.020, 0.010, 0.004 | 0.911, 0.030, 0.018, 0.011, 0.008 |
| components for 95%, binary | 2 | **3** |
| participation ratio, binary-shape | 2.28 | **2.70** |
| components for 80%, binary-shape | 2 | **3** |
| participation ratio, effort-weighted | 2.79 | **3.28** |
| participation ratio, effort-shape | 2.39 | **4.89** |
| components for 80%, effort-shape | 3 | **5** |
| min pairwise containment at tick 240 | 0.742 | **0.612** |
| min pairwise containment at tick 480 | 0.771 | **0.643** |
| min pairwise containment at tick 960 | 0.708 | **0.769** |
| `denial-warden` ↔ `narrow-depth` containment | 0.771 | **0.643** |
| `denial-warden` within-strategy Jaccard | 0.674 | **0.378** |
| `denial-warden` union / ∩ across 12 seeds | 4 / 1 | **15 / 0** |
| `narrow-depth` mean ticks | 920 | **1773** |
| `archivist` mean instances | 3389 | **2117** |

Read together these say one thing: **the queue is genuinely reordered, and the reordering is visible
in every measure that is not saturated.** The effort-shape participation ratio — how much of a
universe's *investment* is spread across distinct directions — **doubled**, 2.39 → 4.89. Transient
composition separates by a further 0.13 of containment at both early horizons. The two strategies
that never reach the ceiling stop being nested at 0.771 and become nested at 0.643.

And the binary held-set spectrum is unmoved, because 51 of 51 is 51 whatever order you collect it in.

## Why the headline claim failed, in one table

| strategy | mean nodes | union | ∩ | reaches the ceiling? |
|---|--:|--:|--:|:--:|
| `archivist` | 51.0 | 51 | 51 | yes |
| `passive-control` | 51.0 | 51 | 51 | yes |
| `portal-rush` | 51.0 | 51 | 51 | yes |
| `worship-maximizer` | 51.0 | 51 | 51 | yes |
| `uniform-random-legal` | 50.9 | 51 | 50 | almost |
| `narrow-depth` | 8.1 | 14 | 3 | no |
| `denial-warden` | 5.1 | 15 | 0 | no |

Fifty-one is the entire reachable set under the v1 ruleset. Five of seven strategies exhaust it, and
a set that contains everything is contained in every other set by definition. **Containment 1.000 and
prefix fidelity near 1 are, for those five, arithmetic facts about the ceiling rather than
observations about the selector.**

There is a second reason, and it is worth stating because it bounds what arm A could ever have shown:
**seven of the eight pooled strategies never assign a role at all.** `assignRole` appears in exactly
one strategy definition (`archivist`, rotating round-robin), so for the other seven every mage is the
default `researcher` and the role term is *identical across strategies*. Species, age and personality
vary richly *within* each universe — all six species found every arm-A universe — and are identical
*across* strategies under common random numbers. Arm A was therefore always going to be a weak
instrument for the role term specifically, and the mask arms and a role-varying pool are where that
term can be seen.

## Attribution: W7 or W17?

`w7/knowledge-capital` landed mid-flight and had already changed `compareTargets` — a novelty-first
tie-break for *scribing*. A third arm at the same coordinates separates the two.

| measure | before (`main`) | **w7 only** | **after (w7+w17)** |
|---|--:|--:|--:|
| prefix fidelity | 0.9433 (65/84 exact) | 0.9445 (67/84) | **0.9085 (60/84)** |
| participation ratio, binary | 1.19 | 1.21 | 1.20 |
| participation ratio, binary-shape | 2.28 | 2.34 | **2.70** |
| participation ratio, effort-weighted | 2.79 | 2.89 | **3.28** |
| participation ratio, effort-shape | 2.39 | **3.36** | **4.89** |
| `denial-warden` ↔ `narrow-depth` containment | 0.771 | 0.768 | **0.643** |
| min containment at tick 240 | 0.742 | 0.759 | **0.612** |

W7 left prefix fidelity and cross-strategy containment untouched — it changes *what gets copied*, not
*what gets learned* — and moved the effort-shape spectrum a long way on its own (2.39 → 3.36),
because novel-first scribing spreads a universe's writing across distinct nodes. W17 moved prefix
fidelity (the only arm that did), moved the shape spectrum again (3.36 → 4.89), and is the whole of
the containment change. **The two are separable and neither is doing the other's work.**

## The two mechanisms in `compareTargets`, and why they were not merged

W7's novelty rule is a **binary fact about redundancy** on one goal. W17's appeal is a **magnitude
about value** on all five target-taking goals. They are composed rather than merged: `compareNovelty`
is factored out and applied **first** in `compareAppeal`, so novelty partitions the candidate list and
the utility score decides inside the partition.

Folding the binary into the bounded additive sum has exactly two outcomes, and both are bad. A bound
small enough to be outvoted restores the 1,263-books-and-two-distinct-nodes defect W7 measured. A
bound large enough to dominate is a lexicographic prefix wearing a magnitude's clothes, and it would
lie in the ablation report — `contracts.md` §7's whole methodology is removing one term and seeing
what changed.

## The founding-species-mask arms — gnome against human

`ReferenceOptions.foundingSpeciesMask` 8 (gnome) and 16 (human), two strategies, 6 replicates,
24 runs each. W15's finding was that these two — sharing only `depthCeiling: 4` — reached the
**identical 49 nodes**, with paired containment 1.000 in all six coordinate pairs.

| arm | mean nodes | min | max | union | ∩ across seeds | within-strategy Jaccard |
|---|--:|--:|--:|--:|--:|--:|
| `archivist` gnome | 49.0 | 49 | 49 | 49 | 49 | 1.000 |
| `archivist` human | 37.3 | **0** | 49 | 49 | **0** | 0.605 |
| `passive-control` gnome | 49.0 | 49 | 49 | 49 | 49 | 1.000 |
| `passive-control` human | 40.8 | **0** | 49 | 49 | **0** | 0.694 |

**Criterion 4 fails on the union and passes on the run.** The *unions* are still byte-identical —
49 nodes each, intersection 49, nothing in either that is not in both — for the same reason as arm A:
49 is the entire set reachable at `depthCeiling: 4`, and both species exhaust it in their good seeds.
But the per-run sets have come apart completely: human's cross-seed intersection fell from 37 to
**0**, its within-strategy Jaccard is 0.605/0.694 where gnome's is 1.000, and some human-founded
universes now stagnate at **zero** nodes. Human runs are no longer a stable prefix; gnome runs still
are, because gnome's curiosity of 1792 makes it want the deep node at every tier and it simply takes
everything.

At fixed horizons the two separate on count and on shape: at tick 240, `archivist` gnome 44.9 against
human 42.8, minimum pairwise containment **0.945**; at tick 480, 48.8 against 42.2, containment
**0.976**. Both were 1.000 throughout in W15.

## Q2 answered: the candidate bound does not bind inside v1

`gatherFrontier` truncates each bucket at `MAX_CANDIDATE_TARGETS = 16` **in cost order**, before any
value is computed, so a frontier larger than sixteen would let the old cost queue quietly pre-filter
the new score's inputs. Computed exhaustively over the v1 prerequisite graph, walking it in the old
cheapest-first order, in deepest-first order, and in 400 pseudo-random orders: **the maximum frontier
any walk ever reaches is exactly 16**, and a list of exactly sixteen is not truncated. The bound is
touched and never exceeded, so inside v1 the utility score sees the whole frontier at every step.

It certainly binds for `permissive-breadth`, whose ruleset admits 282 nodes. That is a caveat on the
one strategy already excluded from the primary tables.

## What the three balance gates say

All three were regenerated; `contentRevision` moved `2512ea02…` → `d37624e3…` when
`autonomy-weight.json` was added, so every baseline was invalid by provenance regardless of any
metric. What moved beyond that:

| gate | metric | before | after | SE |
|---|---|--:|--:|--:|
| **v1** (200 runs, 600 ticks) | `referenceNodesKnown` | 22.115 | **29.440** | +48.6 |
| | `referenceLibraryDepth` | 7.145 | **10.435** | +11.8 |
| | `referenceKnowledgeInstances` | 379.87 | **406.01** | +8.8 |
| | `referenceGrimoires` | 96.01 | **85.76** | −6.7 |
| | every population metric | — | — | inside tolerance |
| **horizon** (200 runs, 2400 ticks) | `referenceNodesKnown` | 46.930 | 46.855 | −0.6 |
| | `referenceKnowledgeInstances` | 1155.88 | **1036.95** | −15.0 |
| | `referenceNodesGainedFinalQuarter` | 3.625 | **1.910** | −15.4 |
| **ascension** (32 runs) | every metric | — | — | inside tolerance |

Those two `referenceNodesKnown` rows are the whole finding in two numbers. At 600 ticks a universe
knows **a third more**; at 2400 ticks it knows **the same amount**. The value-scored acquirer reaches
the frontier much sooner and stops in exactly the same place, because the place it stops is the
ruleset's reachable set rather than a decision. `referenceNodesGainedFinalQuarter` halving is the same
fact from the other end.

`capitalSnowball` is not recomputed here and remains W7's **0.502**, above the 0.35 guard
`worshipSnowball` is held to. That threshold belongs to `god-agency` and is untouched.

## The species finding, which was not on the claim list

`reference-time-to-tier` measures ticks to tier 3 per founding species over six seeds. It had to be
rewritten, and the rewrite is a **positive** result nobody asked for:

| species | before (w7) | after (w17) |
|---|---|---|
| gnome | [39, 53] | **[20, 21]** |
| dwarf | [41, 54] | **[21, 25]** |
| orc | [42, 63] | **[21, 27]** |
| human | [44, 57] | **[28, 37]** |
| elf | [54, 110] | **[35, 58]** |
| draconic | [68, 245] | **[26, 380]** |

Every species is about **twice as fast** to tier 3, *and the spread reopened*. Where the previous
build supported exactly one strict separation — draconic after four ordinary species, with elf
bridging — this one supports three bands: a fast trio (gnome, dwarf, orc) that overlaps internally,
human strictly after all three, elf strictly after all three again, and draconic no longer a band at
all but a bridge spanning from inside the fast trio to five times elf's slowest seed. **No species
magnitude was touched**; the species table simply became legible to the thing that decides what to
learn.

Task 9.9 wants **four species** separated by more than the cross-seed spread. This build separates
three groups. It stays unchecked, and it is closer than it has ever been.

## What this does not say

- It does not say the selector is still value-blind. It demonstrably is not: the effort-shape
  participation ratio doubled, early-horizon containment fell, and the unit tests show a warden and a
  raider taking different nodes from one candidate list, an elf and a dwarf splitting on the authored
  affinity table, and a gnome and a human ordering one list differently on curiosity alone.
- It does not say the content graph is flat. That is the other branch of the negative result and this
  measurement cannot separate it from the ceiling effect, because the ceiling is reached first.
- It does not say the weights are right. Every one of them is `untuned` and the balance harness owns
  them. A tuning pass that widened the affinity and role bounds relative to effort would move these
  numbers, and that is a legitimate experiment rather than a fix.

## The forced next step

W15 named three changes in the order their dependencies force. This was the first. The second and
third are now unblocked *and are now the binding constraints*:

> 2. **Make node value depend on what else you hold.**
> 3. **Give the choice an opportunity cost.**

To which this measurement adds a fourth, which it discovered rather than assumed:

> 4. **A universe must not be able to exhaust the reachable set.** While five of seven strategies end
>    holding all 51 nodes, composition is not a decision for them and no selector can make it one.
>    This is the campaign's original thesis — *"acquisition is too easy"* — arriving as the thing that
>    now blocks the measurement rather than as the thing the measurement was about.
