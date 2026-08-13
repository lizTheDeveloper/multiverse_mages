<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The opening square, built and swept

**Build:** `w70/opening-square`, branched from `main` at `a6b1da8`.
**Instrument:** five arms — the v1 rectangle plus seeded 1×1, 2×2, 3×3 and 3×4 openings — over
eight strategies × two starting positions × six replicates, 1,200 world ticks, under common random
numbers. Plus a static audit of all 300 authored nodes over all 14,630 candidate squares.

Everything below is measured. Where a number is a hypothesis rather than a reading, it says so.

---

## 0. What was built, in one paragraph

A universe used to open on the twelve `v1` cells — `{intellego, perdo, rego} × {limen, mentem,
nomen, terram}` — identically, for everyone, forever. It now opens on a **technique-count ×
form-count sub-rectangle of the grid**, either drawn from its own seed or named outright.

**There is no new notion of "is this cell open."** `permits()` was already
`technique ∈ mask AND form ∈ mask` modulo edicts, so an opening square *is* those two masks at tick
zero, and growing the square is `permitTechnique` / `permitForm`, which `god/interventions.ts`
already prices in favor. That is why this change costs **no component, no `WORLD_SCHEMA_VERSION`
bump and no §1.2 deviation** — the state to express it was already there and nobody had varied it.

The one thing it does cost is `RNG_STREAM.openingSquare: 12`, and §5 is about what that costs.

---

## 1. Q1 — who chooses the square? **Both, and the scenario layer already expressed both.**

The question was posed as god *or* seed *or* species, with a note that god-and-seed are not
exclusive if the scenario layer can express both. **It can, and the two arrive at the rules path in
the same shape**, which is the part worth reporting:

- `seededOpeningAxes(registry, size, stream)` — the harness answer. Draws a permutation of both
  axes off stream 12 and takes a prefix.
- `explicitOpeningAxes(registry, techniqueIds, formIds)` — the play answer. Names the axes by
  content id, for the same reason `referenceContent` names a tradition by string rather than by
  ordinal: an ordinal is a fact about the order of a data file.

Both return a `RulesetAxes`. No mode flag reaches the rules path, and nothing downstream can tell
which one built the universe. **God-chosen for play and seed-chosen for the harness is therefore
not a compromise, it is one mechanism with two callers.**

**Species-chosen is not recommended and was not built.** A species affinity is already a modifier
on how well a mage works *within* a cell; making species also decide *which* cells exist would put
two different kinds of claim on one content field, and the founding mix is a sweep factor
(`foundingSpeciesMask`) whose whole point is that it can be varied independently of the grid. If
species chose the square, that factor and this one would be the same factor.

---

## 2. Q2 — must the square stay contiguous? **No. It must stay *rectangular*, and it already does.**

Take the position: **contiguity in grid coordinates is not a property worth having, and the shipped
game does not have it.**

Three readings, measured:

1. **The shipped "3×4 block" is not geometrically contiguous.** Its technique bits are `{1, 3, 4}`
   — skipping `muto` at 2 — and its form bits are `{7, 8, 12, 13}` — skipping `vim`, `umbra` and
   `fatum` at 9, 10, 11. The doc's phrase "a small contiguous sub-block" describes something v1
   never was.
2. **Axis order carries no metric anywhere in the rules.** `technique.json` orders Creo, Intellego,
   Muto, Perdo, Rego — which is alphabetical, and Ars Magica's convention. `form.json` orders
   Animal … Vim then the three invented forms Umbra, Fatum, Limen, Nomen appended after. There is no
   rule anywhere that reads adjacency. "Contiguous" would therefore be a constraint on an authoring
   convention, and inserting a technique would silently re-shape which openings were legal.
3. **The property that actually makes a technique an axis is rectangularity**, and `permits()`
   enforces it structurally: the permitted set is always a full technique-set × form-set product.
   A universe that permits Creo and Rego and permits Ignem and Terram permits *all four* of
   Creo-Ignem, Creo-Terram, Rego-Ignem, Rego-Terram. It could not permit three of them without an
   edict. **That is what makes "you learned Rego" an axis rather than a token** — Rego multiplies
   against every form you hold — and it is true today, for free, with no new rule.

So the recommendation: read the plan's "contiguous" as **"rectangular product"**, which is already
guaranteed, and do not add a geometric-adjacency constraint. Growth then means *adding an axis*,
which multiplies against everything already held — the prefix growth the seeded arms use is exactly
this, and it is the concrete growth model this change ships.

---

## 3. Q3 — do the twelve v1 cells survive as a standard opening? **Yes, but they are not the best one, and the other 249 nodes are worse than expected.**

### 3a. The v1 rectangle is a deliberately safe square, and the measurement says how safe

Over all **10,010** possible 3×4 squares:

| property | the v1 rectangle | all 3×4 squares |
|---|---|---|
| nodes inside the square | 51 | mean 51.4 |
| nodes actually **reachable** (prerequisite closure inside the square) | **51 (100%)** | mean 44.5 (86.5%) |
| squares with at least one unreachable node | **none** | 9,420 of 10,010 (94%) |
| distinct primitives reachable | 14 of 16 | mean 11.5 |
| can ever open a portal | **yes** | 858 of 10,010 (8.6%) |

Only **126 of 10,010** 3×4 squares are both prerequisite-closed *and* raid-capable. The v1
rectangle is one of them, and ranks **175th of 10,010** by reachable primitives. So it survives as a
standard opening — it was clearly chosen with care — but it is not optimal:
`{intellego, muto, rego} × {aquam, fatum, limen, nomen}` is closed, raid-capable, holds 55 nodes and
reaches **all 16** primitives.

### 3b. What is broken in the 249 unexercised nodes

**Finding 1 — the prerequisite graph escapes cells, and it escapes overwhelmingly toward
Intellego.** There are **36 cross-cell prerequisite edges** among the 300 nodes. Twenty-four of them
point into an `intellego-*` cell: `intellego-nomen` is required by 10 nodes elsewhere,
`intellego-mentem` by 6, `intellego-limen` by 6, `intellego-terram` by 3. A square without Intellego
loses a large fraction of its own content, and the effect compounds with square size because a
larger square holds more nodes with prerequisites:

| square size | squares | mean nodes in square | mean reachable | reachable share | squares holding dead nodes |
|---|--:|--:|--:|--:|--:|
| 1×1 | 70 | 4.3 | 3.4 | 79.7% | 32 (46%) |
| 2×2 | 910 | 17.1 | 14.2 | 82.7% | 726 (80%) |
| 3×3 | 3,640 | 38.6 | 33.2 | 86.0% | 3,338 (92%) |
| 3×4 | 10,010 | 51.4 | 44.5 | 86.5% | 9,420 (94%) |
| **v1 3×4** | 1 | 51 | **51** | **100%** | **0** |

**This is not purely a defect.** A prerequisite that escapes the square is exactly what makes
growing the square *directional* — you permit Intellego not for its own cells but because it
unlocks nodes you already hold cells for. That is the best argument this measurement produces for
the mechanic. What *is* a defect is that nothing checks it: the loader's
`v1-unreachable-prerequisite` diagnostic hard-fails a node whose prerequisite is outside the v1
flag, and there is **no general version of that check**. Under an opening square, "reachable" is
relative to the square, and 249 nodes have never been asked the question.

**Finding 2 — raiding is content-gated to a single cell pair, and it is a sharper gate than
anything in the design says.** Both `portal` nodes live in `rego-limen`, and `rl-open-the-portal`
requires `il-read-the-binding` from `intellego-limen`. So a universe can raid only if its square
holds **both** `rego-limen` and `intellego-limen` — techniques ⊇ {rego, intellego}, forms ∋ limen:

- **0 of 70** 1×1 openings can ever raid.
- **13 of 910** (1.4%) 2×2 openings.
- **234 of 3,640** (6.4%) 3×3 openings.
- **858 of 10,010** (8.6%) 3×4 openings.

`contracts.md` §8 already requires `rego-limen` in any v1 build for exactly this reason, but the
requirement is written against the *v1 flag*, not against whatever square a universe actually opens
on. **A 2×2 opening makes PvP unreachable for 98.6% of universes**, and PvP is the vision's core.
This is the single strongest argument found against a 2×2 opening as shipped, and it is a content
placement problem rather than a mechanic problem — two portal nodes in one cell is a thin thread for
the game's headline feature to hang from.

**Finding 3 — `fertility` and `lifespan` have zero v1 nodes, and that fully explains the campaign's
"one genuine null."** The campaign records, as its one surviving null result, that *knowledge does
not convert into population* — η²(strategy) 0.01–0.04 while η²(seed) runs 0.6–1.0. The cause is
visible in the content:

- every `fertility` effect is in `creo-animal` (3), `creo-corpus` (1) or `muto-fatum` (1);
- every `lifespan` effect is in `creo-corpus`, `intellego-{aquam,corpus,fatum,herbam}`,
  `muto-{corpus,fatum}` or `rego-{corpus,fatum}`.

Creo is not a v1 technique. Corpus, Animal and Fatum are not v1 forms. **No node inside the twelve
enabled cells touches population at all**, so the god's play could not move it whatever the god did.
That is not a null about the mechanic; it is a null about the opening. An opening square elsewhere on
the grid reaches those primitives, which makes this the most interesting single prediction the change
generates.

**Finding 4 — `lifespan` magnitudes look like the fixed-point trap, latent.** `primitive.json`
declares `lifespan` as `additive-months`, and its 17 authored magnitudes run **18 to 480 — a 26.7×
spread, the widest of any primitive**, against a cap of 50% of species base lifespan (360–9,000
months). Read as `Fp`, magnitude 18 is 0.0176 months — about thirteen hours — and magnitude 480 is
under half a month. Read as raw months they are 1.5 to 40 years, which is the only reading in which
the numbers mean anything. `npm run check:consumption` confirms no node effect reaches `lifespan`
today (it is moved only by god blessing/curse constants), so **nothing is currently wrong at
runtime** — but the day that consumer is wired, all 17 nodes will be four orders of magnitude too
small, and it will read as a balance problem rather than a units problem.

**What is *not* broken.** The 249 are uniform with the 51 on every axis that could have drifted:
`researchCost`, `teachCost`, `scribeCost` and `rediscoveryMultiplier` share the same ranges and
medians; no node is below the `fp(5376)` authoring floor or the `fp(3072)` hard floor; there are no
dangling prerequisite references and no cycles; every one of the seventy cells holds **exactly one**
prerequisite-free node. That last fact has a direct mechanical consequence: **a 1×1 square offers
exactly one founding-grant candidate however many a sweep asks for**, which is why
`foundingCandidates` deals what exists rather than refusing.

---

## 4. Q4 — the balance baselines. **All three invalidate, at the identity level, before any number moves.**

Measured, not predicted:

```
current rngRegistryHash: 2bc5d131f2a7423ce439ee6ca933d74316f48eac1d214b23259aa4559b18c2c9
baselines were recorded at: 80608208d3325be1ffb3dba4ef810caac712eccb0a1b5f35c585fcb6d31d9cab
```

`gate.ts`'s `PROVENANCE_KEYS` compares `rngRegistryHash` as a **block-level refusal**, and that hash
is `canonicalHash(RNG_STREAM)` — taken over the whole registry table. Appending
`openingSquare: 12` changes it. Therefore `balance-gate-v1`, `balance-gate-horizon-v1` and
`balance-gate-ascension-v1` all refuse, and `npm run verify` is red at its last three steps.

**Three things are true at once and they must not be collapsed:**

1. **The refusal is correct behaviour.** The registry genuinely changed. The gate is conservative by
   design and is doing what it was built to do.
2. **The behavioural delta at the default opening is zero, and that is proved rather than argued.**
   Sixteen paired runs — four strategies × two starting positions × two replicates, against
   unmodified `main` — agree on **snapshot hash, terminal reason and tick count**, every one. The
   default path through `resolveOpeningSquare` is structurally draw-free: it returns the cached v1
   axes without touching stream 12 at all. `contentHash`, `buildVersion`,
   `observationLayoutDigest` and `observationSchemaVersion` all still match; `rngRegistryHash` is
   the *only* key that moved.
3. **Nothing here regenerated a baseline, and the provenance field was not hand-edited.** A baseline
   is a claim that *these metrics were measured under this build identity*. Editing the identity and
   keeping the metrics would record a measurement nobody ran — strictly worse than regenerating.
   **Re-baselining is the owner's decision.**

**The generalisable finding, which is bigger than this change:** under the current gate design,
**any** future RNG subsystem addition forces a re-baseline event, however provably inert. `sim-core`
documents the registry as append-only and promises that "adding a subsystem takes the next free
number and nothing else moves" — that promise holds for the *simulation* and does not hold for the
*gate*. Stream 12 is the first append since the baselines were committed, so this is the first time
anyone has paid the bill. It is now recorded in `contracts.md` §6.

---

## 5. The containment curve by square size

*(Section filled from the sweep; see `tools/w70/analyse.mjs`.)*

---

## 6. What this does and does not deliver against `ages-of-magic.md`

The campaign plan argues that the opening square is *"the rule underneath the fiction"* of
`ages-of-magic.md`. **Checked against the doc rather than against the abstraction: it is a partial
match, and the half it misses is the half the doc is actually about.**

`ages-of-magic.md` §1 defines its ages by **compound-spell arity**, not by how many cells a universe
holds:

| age | a spell is | space over 70 cells |
|---|---|--:|
| first | one cell | 70 |
| second | two cells | 2,415 |
| third | three cells | 54,740 |

*"Ages of magic are mostly governed by the interactions of two"* means a spell that names Creo Ignem
**and** Muto Ignem **and** Intellego Mentem. **That mechanic does not exist in the engine.** A node
names exactly one cell (`node.json` has a single `cell` field), and `agent-api`'s legality mask is
not shaped for a legality that depends on holding *n* cells at once — which the doc's own §5.3 lists
as an open problem.

What the opening square **does** deliver, and it is real:

- **§1's first-age texture, honestly.** "Raw, new, everyone working it out alone" is a description of
  a universe that genuinely holds four cells. Today's universe holds twelve from tick zero and the
  first age is over by tick 300. Measured here: a 1×1 opening reaches a mean of 3.4 nodes, a 2×2
  reaches 14.2.
- **§2's compression having something to compress.** The doc says the knowledge-capital loop "had
  nothing to compress, because the frontier was always one step away." A square that has to grow puts
  distance between a novice and the frontier for the first time.
- **§4's "content exhaustion was the first age ending" reading**, structurally rather than as
  interpretation: the 51-node plateau is now one square's ceiling among many, not the game's.

What it **does not** deliver, and should not be claimed to:

- **"A civilization is known by its pairings."** Two universes with different squares hold different
  *cells*, not different *pairings*. Compounds are what make pairings a thing to be known by.
- **The third age, or the college as the only road to it.** §2a's claim — that a lone mage cannot
  cross the third age's prerequisite mass — needs a prerequisite mass that scales with set size.
  Growing a square is priced in favor by `permitTechnique`, which is the *god's* resource, not the
  university's.
- **Mage-driven discovery of techniques and forms.** The plan's phrase is *"the rest is reached by
  discovering techniques and forms."* What ships here is **god-permitted, favor-priced** growth,
  which is the existing `permitTechnique` / `permitForm` path. An academic cannot discover a
  technique. That is a real gap between the sentence and the build, and it is future work.

**The honest summary: the opening square is the first age's floor, and compounds are the second and
third ages' ceiling. They are complementary, not the same rule.**
