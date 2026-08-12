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
| gnome vs human node sets | **not identical** | identical (49 = 49) | see §"the mask arms" | — |

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
