<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Varying `researchCost` inside a tier, measured

**Build:** `w80/research-cost-variation`, branched from `main` at `a6b1da8`.
**Instrument:** `tools/w80/` — an inert probe on the reference world schema recording the first world
tick each node id appears in `KNOWLEDGE_INSTANCE`. **Three arms of 84 runs each** — flat, priced, and
priced-renormalised — seven scripted
strategies × two starting positions × six replicates, 2,400 world ticks, walking the **identical**
coordinate grid (`rootSeed` 20260811, `sweepId` `w15-dimensionality-v1`, cells 0 and 3, replicates
0–5) so the only difference between the arms is `packages/content/data/node.json`.

**Seven strategies rather than W15's eight: `archivist` is excluded from both arms.** Its runs are
roughly fifteen times slower per world tick than any other strategy's and twelve of them would have
cost more wall clock than the other seven arms combined. The exclusion is symmetric — neither arm has
it — so it is a statement about the measurement's scope and not a result. It does mean the
knowledge-hoarding strategy is absent from every containment figure below, which is worth knowing
before reading them.

Everything below is measured. Where a number is a hypothesis rather than a reading, it says so.

## The headline, in one paragraph

**Varying `researchCost` inside a tier did not buy a strategic dimension. It very slightly cost
one.** Distinct tier-1 discovery orderings fell from **62 to 56** across 84 runs; mean cross-strategy
containment **rose** at every one of the seventeen horizon readings taken, moving *toward* the
within-strategy diagonal rather than away from it; and the across-run standard deviation of tier-1
first-discovery time fell from **30.7 to 21.5 ticks**, meaning universes became *more* synchronised,
not less. The effect is small at every reading and consistent in sign at all of them. **This is a
null on the falsifying measurement, in the mildly adverse direction.**

**The result survived renormalising the price levels.** A second priced arm, in which each tier's
prices are scored against that tier's own mean grade so the per-tier geometric mean is *exactly* the
old flat price, reproduces the first to within noise: 56 orderings again, cross-strategy containment
0.8308 against 0.8299 at tick 240, tier-1 sd 21.3 against 21.5. Everything below reports the
renormalised arm; the differences between the two priced arms are given where they exist.

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

### A price is a relative standing, so it is scored against its tier

The first version of this file summed the five terms into an absolute grade and priced straight off
it, expecting the octave to be mean-preserving because the terms are roughly symmetric. **They are
not.** Deep tiers are where the `creo`, `muto`, `vim` and universe-scoped content lives, so their
grades skew dear: the per-tier geometric mean drifted −0.6% / +0.4% / +1.9% / +3.9% at tiers 1–4 but
**+12.3% at tier 5 and +41.4% at tier 6**, and that was enough to move a pacing metric by 20%. A
global change to how fast the late game runs had arrived as a side effect of a content judgement
about individual nodes, and those are two decisions that one edit should not make.

So the grade is not a price. It is scored against the **datum** — the mean grade of the node's own
tier. `deviation = grade − datum(tier)`, clamped to ±32, and the price is `base(t) · 2^(deviation/64)`.
Measured after the change: per-tier geometric mean drift is **−0.00% at every tier**, and **zero
nodes clamp**. The ladder does the pacing on its own and every claim this file makes is a claim about
ordering.

#### What that costs an author, which is the part to read before authoring a node

**Editing one node's grade moves every other price in its tier.** Give one tier-3 node a
`universe`-scoped effect and its own price rises — and the datum rises with it, so the other
twelve tier-3 nodes get *cheaper* without being touched. A one-node diff is a thirteen-price diff,
and the first time it happens it will look like a bug.

It is still the right property, because **the thing a price encodes here is relative standing, and
relative standing is inherently a property of the set.** "This node is dear" is not a statement a node
can make on its own; it means "dearer than its tier-mates". A formula that let a node price itself in
isolation would be smuggling a claim about the whole tier's pace into what reads as a claim about one
node — which is exactly the defect that made this rewrite necessary. The single-member tier proves it
from the other end: `cv-the-made-vis` is the only tier-6 node, has nothing to be dearer than, and
prices at exactly `base(6)`.

The practical rule is short: **regenerate the tier, never hand-edit a price.** That is what
`tools/w80/apply-price.mjs` does, and it is why the generator is committed beside the data rather than
instead of it.

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
| 1624 | 10 | `intellego-mentem` | `im-weigh-the-attention` |
| 1659 | 12 | `intellego-limen` | `il-sense-the-seam` |
| 1677 | 13 | `intellego-nomen` | `in-hear-the-name-spoken` |
| 1810 | 20 | `perdo-terram` | `pt-crumble` |
| 1849 | 22 | `intellego-terram` | `it-taste-the-soil` |
| 1890 | 24 | `perdo-nomen` | `pn-mispronounce` |
| 1931 | 26 | `rego-limen` | `rl-hold-the-door` |
| 1973 | 28 | `perdo-mentem` | `pm-blunt-the-edge` |
| 2017 | 30 | `perdo-limen` | `pl-fray-the-edge` |
| 2039 | 31 | `rego-mentem` | `rm-hold-the-attention` |
| 2152 | 36 | `rego-terram` | `rt-set-the-stone` |
| 2296 | 42 | `rego-nomen` | `rn-call-by-name` |

### The arithmetic that says why this could only ever be small

`compareTargets` compares **raw `remainingCost`**, so any variation at all fully replaces the node-id
tie-break — that part works completely. But `chooseTarget` is an argmax over `targetAppeal`, whose
effort term is `-floorDiv(remainingCost, 64)` bounded at ±512, against affinity ±384, species ±384,
role ±512, age ±256 and personality ±256. A full-band tier-1 spread of 1448→2896 is **22 fp** of
effort term. The measured spread over the twelve enabled roots is 1624→2296, or **10 fp**.

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
| 1 | 30.7 | **21.3** |
| 2 | 60.1 | **51.5** |
| 3 | 101.3 | **78.8** |
| 5 | 182.7 | 198.0 |

The brief's secondary expectation was that tier-1 spread should be near zero under a flat surface and
rise with variation. It was not near zero — the acquirer already spread it — and it fell.

### 3. Containment — the falsifying measurement

`|A∩B| / min(|A|,|B|)`, cross-strategy pairs taken **universe for universe** at matched coordinates,
within-strategy pairs taken across coordinates. Held sets read off the era grid.

**Scope, restated here because it applies to every number in this section: the pool is seven
strategies and `archivist` is not one of them.** It is excluded from both arms, so it cannot bias the
comparison — but the knowledge-hoarding strategy contributes to no containment figure below, and a
reader weighing "do strategies hold different things" should know that the strategy most likely to
hold a *different amount* of the same thing was not asked.

| horizon | cross (flat) | cross (priced) | within (flat) | within (priced) | cross − within (flat → priced) |
|--:|--:|--:|--:|--:|--:|
| 240 | 0.8101 | **0.8308** | 0.9432 | 0.9520 | −0.1331 → **−0.1213** |
| 480 | 0.8561 | **0.8772** | 0.9564 | 0.9633 | −0.1003 → **−0.0861** |
| 720 | 0.8625 | **0.8982** | 0.9825 | 0.9884 | −0.1201 → **−0.0902** |
| 960 | 0.8924 | **0.9220** | 0.9842 | 0.9905 | −0.0918 → **−0.0685** |
| 1200 | 0.9516 | **0.9597** | 0.9827 | 0.9909 | −0.0311 → **−0.0311** |
| 1440–2400 | 0.9903 | **0.9938** | 0.9825 | 0.9913 | +0.0078 → +0.0025 |

And on the ever-known set, which reaches W19's short horizons:

| horizon | cross (flat) | cross (priced) | cross − within (flat → priced) |
|--:|--:|--:|--:|
| 30 | 0.8063 | **0.8176** | −0.1261 → −0.1210 |
| 60 | 0.7453 | **0.7829** | −0.2238 → −0.1983 |
| 120 | 0.7582 | **0.8008** | −0.2206 → −0.1782 |
| 240 | 0.8195 | **0.8351** | −0.1677 → −0.1527 |
| 480 | 0.8564 | **0.8717** | −0.1400 → −0.1256 |
| 960 | 0.8940 | **0.9173** | −0.1044 → −0.0808 |

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

Identical in both priced arms, to the run.

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
| elf | [47, 57] | **[41, 44]** |
| draconic | [26, 298] | **[24, 168]** |

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

Two readings fit a single seed, so the run was taken at five (`tools/w80/orc-seeds.mjs`, seeds
589825–589829, both contents, everything else held):

| species | flat, by seed | mean | zero | priced, by seed | mean | zero |
|---|---|--:|--:|---|--:|--:|
| draconic | 11 11 12 10 10 | 10.8 | 0/5 | 11 11 12 10 10 | 10.8 | 0/5 |
| dwarf | 18 13 12 12 12 | 13.4 | 0/5 | 12 20 13 10 15 | 14.0 | 0/5 |
| elf | 8 8 8 8 10 | 8.4 | 0/5 | 8 8 8 8 10 | 8.4 | 0/5 |
| gnome | 10 21 13 23 8 | 15.0 | 0/5 | 10 10 16 23 11 | 14.0 | 0/5 |
| human | 16 5 12 2 38 | 14.6 | 0/5 | 32 10 19 1 27 | 17.8 | 0/5 |
| **orc** | **3 1 0 1 4** | **1.8** | **1/5** | **0 0 0 2 3** | **1.0** | **3/5** |

**The answer is: ambiguous, and leaning towards noise.** The paired per-seed difference for orc is
**−0.8 mages with a standard error of 0.66** — t = −1.2 on four degrees of freedom, which is not
distinguishable from zero. An independent reading of plain `main` across thirty-two seeds puts orc at
a mean of **1.22 living mages and zero on 11 of 32 seeds with no content change at all**, and both
arms here bracket that figure.

So reading (b) — *orc is marginal at every seed and a perturbation re-rolls it* — fits the evidence
better than reading (a). **Five seeds cannot exclude a real effect of under one mage**, and this
measurement does not claim to. What it does establish is that **the single-seed 3 → 0 is not evidence
of one**, and that `loss-shock-recovery`'s two red assertions are, at this seed count, asserting that
a coin came up heads.

Every species magnitude carries `tuningStatus: "untuned"`, and the species-tuning pass is where this
resolves: either orc gets a roster that survives a century, or the test stops reading one seed of the
most marginal species as an invariant. **The assertions stay red rather than being edited to agree
with whichever content set ran last**, and the test now carries this distribution in a comment beside
them.

## Baselines this invalidates

`contentRevision` moves from `6973d2c55f6d7788bbaa6886e507bbde` to
`b7775ab8cccdabc8e27b1a26e42ad676`, and every committed balance baseline was measured against the
former:

All three gates now fail closed on the `contentHash` guard before any metric is read — *"the gate
compares two runs of one build; across two builds a delta is not a regression, it is a category
error"* — and the metric deltas beneath it are recorded here so the size of the move is known:

| baseline | metrics outside tolerance |
|---|---|
| `balance-gate-v1` | `referenceKnowledgeInstances` 310.26 → 327.05 (+7.82 SE, tolerance 6.44) |
| `balance-gate-horizon-v1` | `referenceKnowledgeInstances` 1003.9 → 1036.7 (+3.82 SE); `referenceNodesGainedFinalQuarter` 7.645 → 6.285 (**−12.83 SE**, tolerance 0.318) |
| `balance-gate-ascension-v1` | invalidated by the same guard, no metric outside tolerance |

Everything else passed inside tolerance, including `referenceNodesKnown` (17.06 → 16.98),
**`referenceNodesGained` over the whole run (39.345 → 39.600, +1.57 SE, passing)** and
`referenceLivingMages` (38.95 → 38.94).

## The pacing move is dispersion, not level — and renormalising cannot remove it

Scoring each price against its tier's own datum was expected to collapse
`referenceNodesGainedFinalQuarter` back toward its baseline. **It did not.** The metric moved from
−1.54 to −1.36 against a tolerance of 0.318 — about **12%** of the effect, which is the level
component, leaving the other 88% unexplained. The level drift was never what was doing it.

First, a fact that reframes the metric: **`balance-gate-horizon-v1` caps runs at 240 world ticks.**
Its "final quarter" is ticks 180–240 of a *twenty-year* run, not the tail of a two-hundred-year one.
Cutting the arms' first 240 ticks into those quarters, `passive-control` only, 12 runs per arm:

| quarter | flat: gained/run | mean cost gained | renormalised: gained/run | mean cost gained |
|---|--:|--:|--:|--:|
| Q1 0–60 | 15.33 | 4519 | 14.67 | 3955 |
| Q2 60–120 | 9.83 | 7706 | **11.75** | 6808 |
| Q3 120–180 | 6.83 | 5694 | **7.67** | 5295 |
| Q4 180–240 | **8.00** | 9472 | **6.33** | **11604** |
| **total** | **39.99** | | **40.42** | |

**The total is unchanged and the shape is not.** Q2 and Q3 gain *more* than under the flat surface;
Q4 gains 21% fewer nodes, and the ones it does gain are **23% dearer** (9472 → 11604). Nothing has
slowed down. A universe works cheapest-first, so on a dispersed surface the cheap nodes are consumed
early and the last window is left with the expensive tail — whereas on a flat surface every node still
outstanding costs exactly what every node already finished cost, so the completion rate is flat across
the run **by construction**.

**That cannot be renormalised away, because it is the dispersion, and the dispersion is the entire
change.** Any within-tier variation at any level produces it. The two priced arms agree on it almost
exactly — Q4 gained 6.25 before renormalising and 6.33 after, at mean costs of 11699 and 11604 — which
is the confirmation that shifting the levels moved this by nothing.

The reading worth taking is about the metric rather than the content. **On a flat cost surface
`referenceNodesGainedFinalQuarter` was measuring elapsed research capacity, because the marginal node
was interchangeable with every other one.** On a priced surface it measures the residual tail, which
is a harder and more informative quantity — but it is a *different* quantity, and its baseline has to
move whatever else is decided about this branch.

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

## Is the curve worth keeping? — a view, labelled as one, and since adopted

The reason it was built is gone: measured above, it does not produce divergence, and it cannot,
because a shared constant is not a source of divergence. What remains is a narrower question the
measurement does not answer, so this is judgement rather than evidence.

**My view was: keep the idea, renormalise the levels, and do not keep it as-is.** The renormalisation
has since been adopted and is what every number above measures. The reasoning is left standing rather
than rewritten, because the half of it that turned out to be wrong is worth keeping visible.

Keep the idea, because the defect it fixes is real independently of containment. A field whose value
is a pure function of another field carries no information, and the ordering it produced was
alphabetical — `intern` walking `node.json`. That is an authoring accident promoted to game
behaviour, and it stays a defect whether or not fixing it moves a metric. `im-weigh-the-attention`
leading 42 of 84 runs is a fact about a hash table under the flat surface and a fact about a design
claim under the priced one, and only one of those is arguable by a person.

Do not keep it as-is, because of the one number in this report that nobody asked for:
**`referenceNodesGainedFinalQuarter` falls 20%.** That is the tier-5 (+12.3%) and tier-6 (+41.4%)
geometric-mean drift arriving, and it is sixteen nodes moving the pace of the whole late game. The
drift is a side effect of the price terms correlating with depth, not a claim anyone made; the claim
was about *which node inside a tier is dearer*, and that claim survives untouched if each tier's
grades are recentred on their own mean before the octave is applied.

That recentring is a real trade and I would take it: it makes a node's absolute price depend on how
its tier-mates are authored, which is a genuine loss of locality — but the within-tier **ordering**,
which is the entire claim, is preserved exactly, and pace is a global property that a content
judgement about individual nodes should not be allowed to move as a by-product. **If the curve is
kept, it should be kept with the per-tier mean pinned rather than approximately preserved.**

### Where that reasoning was wrong, kept rather than deleted

The recommendation was right and the diagnosis behind it was **12% right**. Pinning the per-tier mean
took the level drift to exactly zero and moved the pacing metric by almost nothing, because the cause
is dispersion rather than level — see the section above. That does not retract the change: a formula
that silently sets the late game's pace is still worse than one that cannot, and scoring against the
tier stands on its own argument. It does mean the honest one-line summary of this branch's pacing
effect is **"a dispersed cost surface re-times research within a run and leaves the dear tail for
last"**, which is a property of the idea rather than of this implementation of it, and would be true
of any within-tier variation anyone proposes later.
