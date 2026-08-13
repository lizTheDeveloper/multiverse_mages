<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Varying `researchCost` inside a tier, measured

**Build:** `w80/research-cost-variation`, branched from `main` at `a6b1da8`.
**Instrument:** `tools/w80/` — an inert probe on the reference world schema recording the first world
tick each node id appears in `KNOWLEDGE_INSTANCE`. **Two arms of 84 runs each**, seven scripted
strategies × two starting positions × six replicates, 2,400 world ticks, walking the **identical**
coordinate grid (`rootSeed` 20260811, `sweepId` `w15-dimensionality-v1`, cells 0 and 3, replicates
0–5) so the only difference between the arms is `packages/content/data/node.json`.

Everything below is measured. Where a number is a hypothesis rather than a reading, it says so.

## The headline, in one paragraph

**Varying `researchCost` inside a tier did not buy a strategic dimension. It very slightly cost
one.** Distinct tier-1 discovery orderings fell from **62 to 56** across 84 runs; mean cross-strategy
containment **rose** at every one of the seventeen horizon readings taken, moving *toward* the
within-strategy diagonal rather than away from it; and the across-run standard deviation of tier-1
first-discovery time fell from **30.7 to 21.5 ticks**, meaning universes became *more* synchronised,
not less. The effect is small at every reading and consistent in sign at all of them. **This is a
null on the falsifying measurement, in the mildly adverse direction.**

The mechanism is not mysterious and was predictable from the arithmetic: **a cost surface is a signal
shared by every universe.** Replacing one deterministic tie-break (node id) with another
(deterministic price) cannot raise the number of orderings by itself — orderings differ across runs
only because of terms that differ across runs, and inside a tier those are species affinity, standing
role, age and personality. Strengthening a *shared* term slightly crowds those out.

## First, a correction to the premise

W79 states the finding this branch was cut for: all 300 nodes carry exactly six `researchCost`
values, one per tier. **That is exact and re-verified here** — tier 1: 70 nodes at 2048; tier 2: 71 at
4096; tier 3: 78 at 8192; tier 4: 65 at 16384; tier 5: 15 at 32768; tier 6: 1 at 65536. Not one node
deviated.

Its conclusion, that *"every universe's first seventy research acts are the same permutation of the
same seventy doors"*, **was true when written and is no longer true of `main`.**
`w7/knowledge-capital` merged at `1acf8e5` on 2026-08-11, two days before, and made target selection
the argmax of a six-term utility score rather than a sort. Measured on `main` **before** any content
change:

- **62 distinct tier-1 discovery orderings across 84 runs** (63 tie-grouped), 3–6 distinct inside
  every one of the fourteen `(strategy, starting position)` groups of six runs;
- **cross-strategy containment sits *below* the within-strategy diagonal at every horizon** — −0.133
  at tick 240 falling to −0.031 at 1200 — which **reverses W19's result**, whose stated finding was
  cross *above* within at all twelve horizons, worst at the shortest.

So the queue W79 describes had already been broken by the acquirer. What this branch measures is what
a priced content surface adds **on top of** that, and the answer is: nothing, slightly negative.

## The cost function, and the claim it makes

`tools/w80/price.mjs`. **A node's price is what it commands and where on the grid it sits — not
merely how deep its prerequisites run.**

Tier still sets the octave, `base(t) = 2048 << (t - 1)`. Within a tier the price moves over exactly
one octave centred on that base, `[base/√2, base·√2]`, so **the bands tile without overlapping**: the
dearest tier-1 node costs exactly what the cheapest tier-2 node costs and never more.

That is the deliberate half of the brief's choice. Tier is *prerequisite depth*, and depth is what
every other per-tier term in the game already reads — `speciesTargetTerm` pays curiosity per tier,
`ageTargetTerm` pays age per tier, `withinDepthCeiling` gates on tier outright. Letting a tier-2 node
undercut a tier-1 node would make all four of those ambiguous about what they are paying for.
Overlapping bands are defensible and would give cost a louder voice; they are not worth making four
other mechanisms lie to buy it.

The band is **geometric-mean preserving**, so this is a change to the *order* and not to the *pace*:
measured drift of the per-tier geometric mean is −0.6%, +0.4%, +1.9%, +3.9% at tiers 1–4 (251 of 300
nodes, and 49 of the 51 v1 nodes), rising to +12.3% at tier 5 (15 nodes) and +41.4% at tier 6, whose
single node clamps to the top rail. The deep drift is real and reported rather than corrected: it is
the price terms correlating with depth, which is the claim working as intended.

The grade runs 0..64 from a centre of 32, in five named terms, reading **only fields the node already
authors** — no node id, no hash of one, no randomness:

| term | claim | values |
|---|---|---|
| **reach** | a working that touches the world costs more than one that touches only the caster | widest `target`: `self` −10, `single` −3, `area` +3, `side` +5, `universe` +10 |
| **payload** | doing two things at once is harder than doing one; making an effect persist is harder than making it happen | +3 per effect past the first (cap +6), +3 if any effect has a duration |
| **technique** | seeing is the cheapest verb and making from nothing the dearest | `intellego` −10, `perdo` −3, `rego` 0, `muto` +5, `creo` +10 |
| **form** | the forms run from what a hand can touch to what only a theory can reach | authored rank over all fourteen, less 6 |
| **metis** | tacit craft is picked up in the doing — and the price of the discount is that codification destroys it | `metis` −4 |

`teachCost` and `scribeCost` remain pure functions of tier. Same disease, separate organ; the
teaching and scribing queues are out of this branch's surface.

### The twelve enabled cells' tier-1 roots, cheapest first

All twelve are distinct, which is the point — under the flat surface all twelve tied and node id
decided.

| price | grade | cell | node |
|--:|--:|---|---|
| 1614 | 10 | `intellego-mentem` | `im-weigh-the-attention` |
| 1649 | 12 | `intellego-limen` | `il-sense-the-seam` |
| 1667 | 13 | `intellego-nomen` | `in-hear-the-name-spoken` |
| 1798 | 20 | `perdo-terram` | `pt-crumble` |
| 1838 | 22 | `intellego-terram` | `it-taste-the-soil` |
| 1878 | 24 | `perdo-nomen` | `pn-mispronounce` |
| 1919 | 26 | `rego-limen` | `rl-hold-the-door` |
| 1961 | 28 | `perdo-mentem` | `pm-blunt-the-edge` |
| 2004 | 30 | `perdo-limen` | `pl-fray-the-edge` |
| 2026 | 31 | `rego-mentem` | `rm-hold-the-attention` |
| 2139 | 36 | `rego-terram` | `rt-set-the-stone` |
| 2282 | 42 | `rego-nomen` | `rn-call-by-name` |

### The arithmetic that says why this could only ever be small

`compareTargets` compares **raw `remainingCost`**, so any variation at all fully replaces the node-id
tie-break — that part works completely. But `chooseTarget` is an argmax over `targetAppeal`, whose
effort term is `-floorDiv(remainingCost, 64)` bounded at ±512, against affinity ±384, species ±384,
role ±512, age ±256 and personality ±256. A full-band tier-1 spread of 1448→2896 is **22 fp** of
effort term. The measured spread over the twelve enabled roots is 1614→2282, or **10 fp**.

**Content inside a non-overlapping band cannot outvote a mage's own preferences, and was never going
to.** If content is meant to speak louder than a rounding error in this score, the dial is
`target-effort-divisor` (64) or the band width, and both are balance-harness property rather than
this branch's.

## The measurement

### 1. Distinct tier-1 discovery orderings — the headline number

Canonicalised as sort by `(firstTick, nodeId)`, identically in both arms; founding grants excluded.

| | flat cost | priced |
|---|--:|--:|
| distinct orderings, strict | **62** / 84 runs | **56** / 84 runs |
| distinct orderings, tie-grouped | 63 | 57 |

Per `(strategy, starting position)` group of six runs, the drop is entirely inside the strategies that
walk the enabled twelve to exhaustion:

| group | flat | priced |
|---|--:|--:|
| `denial-warden` cell 0 / cell 3 | 4 / 6 | 3 / 3 |
| `narrow-depth` cell 0 / cell 3 | 3 / 3 | 3 / 2 |
| `passive-control` cell 0 / cell 3 | 6 / 4 | 3 / 3 |
| `worship-maximizer` cell 0 / cell 3 | 6 / 4 | 4 / 3 |
| `permissive-breadth` cell 0 / cell 3 | 6 / 6 | 6 / 6 |
| `portal-rush` cell 0 / cell 3 | 6 / 6 | 6 / 6 |
| `uniform-random-legal` cell 0 / cell 3 | 6 / 6 | 6 / 6 |

The three groups that hold at 6 of 6 are the ones whose ruleset or termination varies run to run.
**Where the universe is simply working through the enabled twelve, a shared price makes it work
through them in a more consistent order.**

### 2. First-discovery time became *less* variable, not more

Mean across-run standard deviation of the tick at which each node is first discovered:

| tier | flat | priced |
|---|--:|--:|
| 1 | 30.7 | **21.5** |
| 2 | 60.1 | **51.4** |
| 3 | 101.3 | **83.4** |
| 5 | 182.7 | 194.9 |

The brief's secondary expectation was that tier-1 spread should be near zero under a flat surface and
rise with variation. It was not near zero — the acquirer already spread it — and it fell.

### 3. Containment — the falsifying measurement

`|A∩B| / min(|A|,|B|)`, cross-strategy pairs taken **universe for universe** at matched coordinates,
within-strategy pairs taken across coordinates. Held sets read off the era grid.

| horizon | cross (flat) | cross (priced) | within (flat) | within (priced) | cross − within (flat → priced) |
|--:|--:|--:|--:|--:|--:|
| 240 | 0.8101 | **0.8299** | 0.9432 | 0.9499 | −0.1331 → **−0.1200** |
| 480 | 0.8561 | **0.8771** | 0.9564 | 0.9632 | −0.1003 → **−0.0861** |
| 720 | 0.8625 | **0.8997** | 0.9825 | 0.9863 | −0.1201 → **−0.0866** |
| 960 | 0.8924 | **0.9243** | 0.9842 | 0.9886 | −0.0918 → **−0.0642** |
| 1200 | 0.9516 | **0.9658** | 0.9827 | 0.9881 | −0.0311 → **−0.0222** |
| 1440–2400 | 0.9903 | **0.9940** | 0.9825 | 0.9884 | +0.0078 → +0.0056 |

And on the ever-known set, which reaches W19's short horizons:

| horizon | cross (flat) | cross (priced) | cross − within (flat → priced) |
|--:|--:|--:|--:|
| 30 | 0.8063 | **0.8178** | −0.1261 → −0.1211 |
| 60 | 0.7453 | **0.7809** | −0.2238 → −0.2011 |
| 120 | 0.7582 | **0.8021** | −0.2206 → −0.1772 |
| 240 | 0.8195 | **0.8342** | −0.1677 → −0.1517 |
| 480 | 0.8564 | **0.8722** | −0.1400 → −0.1251 |
| 960 | 0.8940 | **0.9198** | −0.1044 → −0.0788 |

**Cross-strategy containment rose at every horizon. The gap to the within-strategy diagonal narrowed
at every horizon.** The falsifier asked for cross-strategy containment to *fall* relative to the
diagonal; it did the opposite, by a small and completely consistent margin.

### 4. The first door, which explains the direction

The node discovered earliest in each run, over 84 runs:

| flat | priced |
|---|---|
| 42 × `im-weigh-the-attention` | 42 × `im-weigh-the-attention` |
| 23 × `il-count-the-doors` | **28** × `il-count-the-doors` |
| 12 × `rt-set-the-stone` | **7** × `rt-set-the-stone` |
| 3 × `iim-catch-the-painted-thing` | 5 × `iim-catch-the-painted-thing` |
| 3 × other, incl. two ties | 2 × other |

The tail thinned and the head did not move. `im-weigh-the-attention` is the cheapest of the twelve
roots under the new curve — it is `intellego` (−10), `self`-scoped (−10) and `metis` (−4), so three
discounts stack on it — and it was already the most common first door under the flat surface, where
it won on node id. **The price curve agreed with the interning artifact instead of contradicting it,
which is luck, and then reinforced it, which is the mechanism.**

## What moved that was not asked to move

Both measured on this branch, six seeds, only `node.json` differing.

**Species time to tier 3, in ticks** (`reference-time-to-tier`):

| species | flat | priced |
|---|---|---|
| gnome | [23, 25] | [22, 24] |
| dwarf | [24, 29] | [23, 25] |
| orc | [24, 31] | **[23, 58]** |
| human | [30, 31] | [29, 30] |
| elf | [47, 57] | **[42, 44]** |
| draconic | [26, 298] | **[24, 173]** |

Four of six tightened, elf's spread from eleven ticks to three. Orc left the fast trio and became a
second spanner alongside draconic, which is the one assertion in that test that had to be rewritten —
its fourth rewrite, and the file records each one.

**The cull-shock roster** (`loss-shock-recovery`, one seed):

| species | flat: pre-shock mages | priced |
|---|--:|--:|
| human | 16 | **32** |
| dwarf | 18 | 12 |
| draconic | 11 | 11 |
| gnome | 10 | 10 |
| elf | 8 | 8 |
| **orc** | **3** | **0** |

**Orc has no living mages at the cull tick under the priced surface, where it had three under the
flat one.** Two assertions in `loss-shock-recovery` fail as a result, and they are **left failing on
purpose**: editing them would hide a species going to zero in the reference universe.

Two readings fit the evidence and one seed cannot separate them:

- **(a) the price curve systematically harms the weakest species.** Orc has `depthCeiling` 3 and two
  exhaustible cells of seventy; a priced surface changes which of its few reachable nodes is nearest
  and could plausibly cost it the ones that were carrying it.
- **(b) orc was marginal and any perturbation re-rolls which marginal species survives.** Three mages
  out of sixty-six is inside the noise of a run, and human simultaneously doubled from 16 to 32.

**Taking `loss-shock-recovery` at three or four seeds would separate them.** It has not been taken.

## Baselines this invalidates

`contentRevision` moves from `6973d2c55f6d7788bbaa6886e507bbde` to
`b7775ab8cccdabc8e27b1a26e42ad676`, and every committed balance baseline was measured against the
former:

All three gates now fail closed on the `contentHash` guard before any metric is read — *"the gate
compares two runs of one build; across two builds a delta is not a regression, it is a category
error"* — and the metric deltas beneath it are recorded here so the size of the move is known:

| baseline | metrics outside tolerance |
|---|---|
| `balance-gate-v1` | `referenceKnowledgeInstances` 310.26 → 326.84 (+7.72 SE, tolerance 6.44) |
| `balance-gate-horizon-v1` | `referenceKnowledgeInstances` 1003.9 → 1032.7 (+3.36 SE); `referenceNodesGainedFinalQuarter` 7.645 → 6.105 (**−14.53 SE**, tolerance 0.318) |
| `balance-gate-ascension-v1` | invalidated by the same guard |

`referenceNodesGainedFinalQuarter` is the largest single move in the tree: **research in the last
fifty years of a two-hundred-year run falls by 20%.** That is the mean-preservation caveat arriving —
the drift is +3.9% at tier 4 and +12.3% at tier 5, and the final quarter is where a universe is
working at those depths.

Everything else in the primary gate passed inside tolerance, including `referenceNodesKnown`
(17.06 → 16.95) and `referenceLivingMages` (38.95 → 38.94).

**No baseline has been regenerated and `npm run goldens:regen` has not been run** — the golden replay
fixtures are built on synthetic schemas and carry no shipped content, so they are unaffected either
way.

## What this redirects

The brief pre-registered the reading: *"if that is still true after your change, the content was not
the binding constraint and you should say so plainly."* Saying it plainly, with one qualification
about scope:

**Within-tier price variation over the enabled twelve cells is not the binding constraint on strategy
dimensionality.** It removes a genuine artifact — an ordering decided by alphabetical interning — and
buys nothing measurable for it. The three candidate dials that remain, in the order this measurement
ranks them:

1. **`target-effort-divisor`, or the band width.** Content currently speaks at 10 fp against
   preferences worth 256–512. That is a deliberate consequence of non-overlapping bands, and it is
   testable in an afternoon by re-running these two arms against a lower divisor with the same
   `node.json`.
2. **How much content there is to differentiate over.** These arms measure the v1 square: **51 of 300
   nodes**, twelve of seventy cells, and the shallow end of each. `w72`'s seeded openings reach 194.
   **The same arms run inside a seeded square are the experiment this one could not be** — a priced
   surface has far more room to matter over 194 nodes than over 51, and nothing here bears on that
   case.
3. **Terms that differ between universes rather than between nodes.** Every ordering difference
   measured in either arm comes from species affinity, role, age or personality. A shared signal
   cannot create variance; it can only reweight the ones that already exist. If the goal is that two
   universes on the same opening should walk different queues, the lever has to be something the two
   universes do not share.
