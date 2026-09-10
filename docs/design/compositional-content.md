<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The compositional content graph (W20)

**Status:** in flight on `w20/compositional-content`. Every magnitude here is `tuningStatus:
"untuned"` and awaits the balance harness.

This document is the specification the schema, the loader and the authored v1 content are built
against. It exists because five independent measurements located the game's one-dimensionality in
the **content** rather than in the code, and because the fix is a set of constructs that have to
agree with each other across four packages.

---

## 1. The defect, restated in one paragraph

`docs/design/strategy-dimensionality.md` measured the v1 knowledge graph and found twelve parallel
staircases with a few footbridges: 12 enabled cells holding 51 of 300 authored nodes, **10 of the
12 strict ladders** with one node per tier and no choice in them at all; 25 of 51 nodes unlocking
exactly one successor; `researchCost` a **pure function of tier** (2048/4096/8192/16384/32768,
zero within-tier variation), so acquisition order was literally *"tier, then id"* — one queue for
every mage in every universe; and effects that do not compose, 201 of 300 nodes carrying exactly
one `{primitive, magnitude, target, durationTicks}` scalar buff. Nodes were stat modifiers, not
spells. The consequences measured: effective dimensionality **1**, prefix fidelity **0.943**,
cross-strategy containment **1.000**, gnome and human reaching the *identical* 49 nodes.

## 2. Why a deeper prerequisite graph alone cannot fix it

**A prerequisite graph is a partial order.** Every mage climbs it in a compatible direction, and a
long enough life reaches all of it. Deepening the tree changes how far down the queue a run gets;
it cannot change *which* queue. That is precisely what the measurement observed — eight strategies
producing eight *prefixes of one ordering*, which is what containment 1.000 means.

The first construct in this game that makes a choice **irreversible** is an exclusion. Two
repertoires that are mutually unreachable are not two points on one axis, and two mages holding
incomparable sets are not the same mage at different speeds.

---

## 3. The constructs

Five, and they are meant to be read together.

### 3.1 Tracks — a named route through the grid

`packages/content/data/track.json`, schema `track.schema.json`, `contracts.md` §2.12.

A **track** is a path through the grid, not a region of it. Its nodes cross cells freely: that is
what turns twelve parallel staircases into one web. A node names its track with the optional
`track` field; a node with no track belongs to the shared body of magic that every mage can reach.

A track exists so that exclusion can be declared once, at the scale a player actually reasons
about — *"I am a warden, not a thief"* — rather than node by node.

> **A track is a property of the knowledge graph and not of a tradition.** See §7 for the open
> question this leaves, and why it is left open rather than answered here.

### 3.2 Anti-requisites — the inverse of `prerequisites`

Two granularities, one meaning: *knowledge you hold can close a door.*

- **Node level.** `node.antirequisites: string[]` — nodes this one may never be held alongside
  **in one mind**.
- **Track level.** `track.excludes: [{ track, threshold, gloss }]` — a mage holding `threshold`
  nodes of the named track may not learn anything on this one. `threshold: 1` shuts the door on
  first contact; a higher value lets a mage sample before committing.

### 3.2.1 The level the exclusion binds, which is the whole design

**Both are enforced per mage. Neither is ever enforced per universe.** The author's two sentences
have to be read together:

> *"Enough time means you should be able to eventually reach all the spells — which is what makes
> the dragon so powerful."*
>
> *"Make sure that individual mages can't learn all the magic, because the different schools are
> somehow mutually exclusive."*

They are not in tension; they operate at two levels, and the gap between them is the mechanic:

- **The universe** may eventually hold every school, accumulated across many mages over many
  lifetimes. Nothing here caps a civilization.
- **An individual mage may not.** Her reachable set is bounded by what she committed to, and she
  cannot unlearn.
- **The dragon is powerful because it lives long enough to reach the *bottom* of the schools it
  chose** — depth, not breadth. A 1,500-year draconic mage and a 60-year orc are then different
  pieces rather than the same piece at different speeds, and `depthCeiling` becomes the load-bearing
  species trait it was always drawn as.

A universe holding a school must therefore **never** block a different mage from learning the school
that excludes it. That is an explicit anti-requirement with a test against it.

### 3.2.2 What this finally makes load-bearing

Vision §5 — *"Knowledge Has a Location"* — is decorative while every node exists in eighty places
(the measured figure is ~55 copies each). Bound each mage to a fraction of the tree and three things
become true at once:

- **A mage's death destroys a school's worth of depth**, not one of eighty interchangeable copies.
- **Which mage goes through the portal matters**, because they cannot all cast the same things —
  which is what gives §7's `raider` role and the looting path something to be about.
- **Teaching is constrained.** A teacher can only pass on what the *student's* own commitments
  permit her to receive. That is a second exclusion check, at the teaching seam rather than the
  research seam, and it runs against the student's held set.

### 3.2.3 Two hazards, handled

1. **A mage must not be able to soft-lock into uselessness.** Tiers 1 and 2 of every v1 cell are the
   **untracked shared trunk**: no node there belongs to a track, so nothing a mage learns in her
   first decades commits her to anything. Commitment begins at tier 3, by which point she has a
   frontier to choose from. The loader enforces the general form of this — see
   `track-excluded-by-trunk` and `track-unreachable-from-trunk` in §5.
2. **`grantFoundingKnowledge` cannot silently commit a mage.** Founding grants land tier-1 nodes,
   which are trunk, which are untracked. If a later change lets the god grant a tracked node, that
   grant *does* commit the recipient — which would be a real consequence for a verb currently
   measured to be worth nothing, and should be adopted deliberately rather than discovered.

### 3.2.4 Symmetry is derived from the reason, never chosen

The author's ruling:

> *"It depends on why. It should be a **lore / mechanic / making-sense thing**. E.g. if you use light
> magic you can't also use dark magic."*

So an exclusion's shape **follows from its justification**. Two things opposed *in kind* — making
and unmaking, light and dark — exclude each other mutually. A one-way reason gives a one-way lock.
`TrackExclusion` therefore carries a required `symmetric: boolean` beside a required `gloss`, and
the gloss is not decoration: it is the justification the shape was derived from, and it must be
legible to a reader who sees only the data.

Three rules follow, and they are enforced:

- **No arbitrary exclusions.** If the reason cannot be stated in one sentence, the exclusion does not
  belong in the content. `exclusion-reason-missing` is the loader half of that.
- **The reason determines the shape**, not the designer's convenience.
- **The reason lives in the data**, beside the mechanism, in the same voice as a node gloss.

All five v1 exclusions are `symmetric: true`, because every opposition that could be motivated from
`sound-design.md` §4.1/§4.2 turned out to be opposed in kind. The one-directional form is
implemented and tested, and no v1 content uses it — which is a fact about this content, not a
limitation of the mechanism.

### 3.2.5 The oppositions this grid actually wanted are outside v1 — stated plainly

`sound-design.md` §4.1 and §4.2 gave every technique and form a semantic identity, and the
oppositions fall out of them. The two cleanest are:

- **Creo ↔ Perdo.** Creo is *"the only technique whose energy increases across its duration"*; Perdo
  is *"subtractive… its signature is a hole"*. Making against unmaking. This is the clearest
  symmetric pair in the game.
- **Umbra ↔ Imaginem.** The game's literal light and dark, and the author's own example. Umbra is
  *"the negative — everything in the reverb tail, nothing in the dry signal"*; Imaginem is *"other
  sounds — convolution, doubled and detuned copies"*, the form of images.

**Neither is expressible in v1.** The v1 rectangle is `intellego`/`perdo`/`rego` ×
`limen`/`mentem`/`nomen`/`terram`, and Creo, Muto, Umbra, Imaginem and Fatum are all outside it.

This is the second design conclusion in this workstream to point outside the rectangle — the first
is life extension, whose authored home is the `creo-corpus` ladder (`cc-close-the-wound`,
`cc-the-mended-decade`, `cc-the-long-tenure`, `cc-the-unfinished-death`), also outside v1, also
structurally unreachable, with `lifespan` sitting in `PRIMITIVE_COVERAGE_EXCLUSIONS` *because*
nothing in v1 used it.

**Two independent conclusions pointing at the same boundary is evidence about the boundary.** The
honest reading is that the v1 rectangle may be the wrong scope for *proving* this design, and that
is a legitimate finding rather than a failure. The alternatives, with costs:

| option | cost |
|---|---|
| **Widen v1 to include Creo and Corpus** | 3×4 → 4×5 = **8 new cells**, against vision §12's deliberate v1 scoping. Buys Creo↔Perdo and the authored life-extension ladder outright, and both are already written. |
| **Widen v1 to include Umbra and Imaginem** | two more forms; 3×6 = 6 new cells. Buys the author's own light/dark example. |
| **Author equivalents inside the twelve cells** (what this branch does) | no scope change. Life extension is re-homed in `rego-nomen` — defensible, because sound-design §4.2 makes Nomen *"the only voice… naming is speech"* and vision §5 puts compulsion-by-name there, so keeping your own true name is keeping yourself. The exclusions become the five authored tracks, whose oppositions are real but weaker than making-against-unmaking. **What is lost is the two best-motivated exclusions in the game, and a ladder that is already written.** |

This branch takes the third option so that the measurement can be taken without a scope change. The
recommendation is the first: **Creo and Corpus buy more design per cell than anything else
available**, and the content for both already exists.

One interaction found while considering the alternatives, and deliberately not shipped:
**Intellego ↔ Perdo is expressible inside v1** — *"a reveal, not an event; nothing is struck"*
against *"a hole where there was content"* — and it was rejected rather than authored, because
Intellego is the **reveal key** that switches on every latent effect (§3.4). Excluding Intellego
from Perdo-committed mages would leave every Perdo latent structurally dead for exactly the mages
who hold them. That is a real coupling between the exclusion system and the condition system, and it
is the kind of thing that would have looked like a balance problem for months.

### 3.3 Effect modes — sound-design §4.1's envelopes, made mechanical

`sound-design.md` §4 is the design source, and its semantics are the game's semantics. Every
effect carries a required `mode`, and the mode is the **technique's** envelope, not the node's:

| technique | mode | `sound-design.md` §4.1, verbatim | what it does to the fold |
|---|---|---|---|
| Creo | `create` | *"The attack is backwards. Something arrives that was not there… The only technique whose energy increases across its duration."* | contributes `+magnitude` |
| Intellego | `reveal` | *"No impact at all; a filter opens… Nothing is struck. Something becomes audible that was always present."* | contributes **no magnitude**; activates latent effects matching its `reveals` descriptor |
| Muto | `transform` | *"Bend mid-flight… It begins as one material and ends as another."* | contributes `−magnitude` to `primitive` and `+magnitude` to `transformTo` |
| Perdo | `remove` | *"A sound is removed from the mix… Perdo's signature is a hole."* | contributes `−magnitude`; on a `presence` primitive, suppresses it outright |
| Rego | `control` | *"Snap, lock, gate. Zero attack, gated release, rhythmically rigid."* | contributes **no magnitude**; contributes a `{floor, ceiling}` clamp |

`remove` is one verb at two scales, which is the point: at engagement scale Perdo subtracts hit
points and already did; at world scale it subtracts from a rate. Both are the same hole.

`control` is a genuine trade rather than a bonus — a floor is reliability bought, a ceiling is
upside sold — and it is the mechanical reading of *"gated release"*.

**Coherence is enforced at load**, and only where a cell is flagged `v1: true`, with the diagnostic
naming that the check extends the moment another cell is enabled. That keeps the 58 unenabled cells
loadable while making it impossible to enable one without authoring it to this standard.

### 3.4 Conditions — value that depends on what else you hold

`effect.when`, a closed three-member enum:

- `{ "kind": "always" }` — the default, and what every effect authored before this change means.
- `{ "kind": "revealed" }` — latent. Contributes only while a held `reveal` effect names it. This
  is the other half of Intellego: *"something becomes audible that was always present"* is a
  statement about a thing that was already there and inert.
- `{ "kind": "holds-cell", "cell", "minNodes" }` — contributes only while the holder has at least
  `minNodes` of that cell.

This is the construct `strategy-dimensionality.md` §"What would move the number" names as
prediction 2: *"Make node value depend on what else you hold."*

### 3.5 Cost curves — what replaces `researchCost = f(tier)`

The author's instruction is that **techniques' envelopes should become real cost curves**, so
§4.1's five shapes are read a second time, as functions of tier:

| technique | envelope | cost curve | rationale, from §4.1 |
|---|---|---|---|
| Creo | reverse-swell, energy increases across duration | **back-loaded** — steeply superlinear in tier | the only envelope whose energy rises across its own duration |
| Intellego | a filter opens; nothing is struck | **flat** — nearly tier-independent, and cheap | a reveal costs little to learn and is worth nothing alone |
| Muto | bends mid-flight between two materials | **bridged** — the mean of the two primitives' bands, plus a crossing toll | it is priced as what it spans, not where it sits |
| Perdo | subtractive; its signature is a hole | **front-loaded** — expensive to start, cheaper with depth | unmaking is hard to learn and then hard to stop |
| Rego | hard-quantized: snap, lock, gate | **quantized** — costs snap to a small ladder of fixed values | the one envelope that refuses a smooth gradient |

On top of the technique curve, a node's cost is modulated by what it actually does — the breadth of
its target (`self` < `single` < `area` < `side` < `universe`) and the number of primitives it
touches. Two nodes at one tier in one cell therefore differ in cost, which is the whole point: the
`effort` term in `target-appeal.ts` and the `role` term now disagree with each other instead of
being redundant.

**The loader enforces the outcome rather than the formula:** across the v1 set, within each tier,
`min(researchCost) !== max(researchCost)`. A content set that regresses to a ladder fails to load.

---

## 4. Depth, and why the dragon is powerful

Species depth ceilings are human 4, gnome 4, orc 3, dwarf 5, elf 6, draconic 7. The v1 content set
as measured tops out at **tier 5, with exactly two nodes there and none above** — so the elf's
ceiling of 6 and the dragon's of 7 bought nothing at all, and `depthCeiling`, the *only* structural
species trait in the game, was inert for two of six species.

v1 is authored to **tier 7**. Enough time reaches everything a ceiling permits, which is what makes
a 1,500-year draconic mage a different piece rather than the same piece at a different speed.

---

## 5. What the loader refuses

Every one of these is a hard load failure with a named diagnostic code, per `contracts.md` §2's
rule that invalid content is never a warning.

| code | refuses |
|---|---|
| `mode-technique-incoherent` | an effect in a v1 cell whose `mode` is not its technique's |
| `mode-payload-missing` | `reveal` without `reveals`, `control` without `control`, `transform` without `transformTo` |
| `mode-payload-extraneous` | any of those three payloads on a mode that does not take it |
| `mentem-is-not-in-the-world` | an effect in a Mentem cell with `target: "universe"` — sound-design §4.2, *"the only form with no reverb at all… it is happening inside the listener's head rather than in the world"* |
| `antirequisite-unknown` | an `antirequisites` entry naming no node |
| `antirequisite-self` | a node excluding itself |
| `antirequisite-contradicts-prerequisite` | a node that is both a prerequisite and an anti-requisite of the same node, transitively — an unreachable node |
| `track-unknown` | a `track` or `excludes.track` naming no track record |
| `track-exclusion-unsatisfiable` | a track with a prerequisite inside a track that excludes it — dead content nobody can enter |
| `track-exclusion-self` | a track excluding itself |
| `track-excluded-by-trunk` | a track excluded by a track holding any tier-1 or tier-2 node. Tiers 1-2 are the shared trunk every mage learns, so a school excluded by trunk knowledge is a school nobody can ever enter |
| `track-unreachable-from-trunk` | a track no node of which has all its prerequisites outside the tracks that exclude it — the same dead end by a different route: an entrance nobody can walk through |
| `research-cost-is-tier-alone` | a v1 tier whose nodes all share one `researchCost` |
| `effect-gloss-missing` | an effect in a v1 cell with no `gloss` |

---

## 6. The claim this change is making

Measured on the eight-strategy 2,400-tick sweep, with W15's instrument reused unchanged:

The **primary** measure is the per-mage one, and it is listed first deliberately: cross-strategy
containment 1.000 was the campaign's central symptom, and per-mage containment is the same
measurement one level down — where the fix has to show up first, and where it is caused rather than
merely correlated.

| # | claim | before, re-measured on this branch |
|---|---|---|
| **0** | **two mages in one universe hold incomparable sets** — neither a subset of the other, by construction | *never measured* |
| 1 | effective dimensionality ≥ 3 for 80% of variance | **2** (binary spectrum; participation ratio 1.95) |
| 2 | prefix fidelity < 0.5 | **0.9088**, exact on 60/96 runs |
| 3 | cross-strategy containment < 0.9 | **1.000** for every pair but `permissive-breadth` (0.840) |
| 4 | gnome and human reach different node sets | identical |
| 5 | no strategy holds the entire reachable set | five of eight sit at exactly 51.0 of 51 |

The "before" column is this branch measured with W15's instrument unchanged, not the figures in
`strategy-dimensionality.md` — those predate W17's value-sensitive acquirer, which moved
dimensionality from 1 to 2 and prefix fidelity from 0.943 to 0.9088 and moved nothing else.

### 6.1 Four arms, because two would have confounded the answer

The campaign policy is that a metric must be able to tell a system you *know* is broken from one you
*know* is working. The corollary here is that a single after-measurement cannot separate **more
content** from **better-shaped content**, and this workstream changed both. So four arms, each
differing from its neighbour in one thing:

| arm | content | grid permitted at founding | what it isolates |
|---|---|---|---|
| **A — before** | 300 nodes, 51 in v1, ladders | v1 rectangle (12 cells) | the recorded baseline |
| **B — wide-old** | *unchanged from A* | whole 5 × 14 grid | **enablement alone** |
| **C — after** | 357 nodes, 108 in v1, compositional | v1 rectangle (12 cells) | **shaping alone** |
| **D — wide-new** | 357 nodes, compositional | whole 5 × 14 grid | both together |

Arm B was run in a **separate git worktree pinned to the campaign base**, carrying only the
`fullGridAtFounding` instrument and the measurement tools, so that no other W20 change — not the
schema, not the species affinities — could leak into the arm that is supposed to isolate enablement.

### 6.2 What each arm measured

| metric | A: before | B: enablement only | C: shaping only | target |
|---|--:|--:|--:|---|
| effective dimensionality, 80% of variance | **2** | **23** | **3** | ≥ 3 |
| participation ratio | 1.95 | 4.02 | 2.72 | — |
| prefix fidelity | **0.9088** | **0.7866** | **0.8523** | < 0.5 |
| runs predicted exactly from their size | 60 / 96 | **1 / 96** | 5 / 96 | — |
| cross-strategy containment, large-set pairs | **1.000** | **0.836 – 0.892** | 0.808 – 0.975 | < 0.9 |
| within-strategy Jaccard across seeds | 1.000 | 0.67 | 0.70 – 0.73 | — |
| mean nodes held, `passive-control` | 51.0 of 51 | 190.5 | 65.3 of 108 | — |
| any strategy holding the whole reachable set | **five of eight** | none | **none** | none |

**The honest headline is that enablement did more than shaping did.** Permitting the whole grid, with
the ladder content completely unchanged, moved effective dimensionality from 2 to 23 and dropped the
number of runs predictable from their size alone from 60/96 to **1/96**. That is arm B, and it
contains none of this workstream's design work.

**Two caveats keep that from being the whole story**, and both are visible in the same table:

1. **Arm B's dimensionality is largely unstructured.** Its between-strategy variance share is
   **0.512**, against arm A's 0.912 and arm C's 0.778 — so a large part of those 23 components is
   *within*-strategy seed variation rather than strategy-driven choice. Within-strategy Jaccard of
   0.67 says two runs of the *same* strategy now differ almost as much as two different strategies
   do. More content bought variety; it did not by itself buy *decisions*.
2. **Shaping is what stopped the set being exhausted.** In arm A, five of eight strategies sat at
   exactly 51.0 of 51 nodes — the content ceiling, reached and held. In arm C the same strategies sit
   at 62–67 of 108 with a union of 89–95, so no strategy holds everything and the strategies disagree
   about which two-thirds they hold. That is claim 5, and it is the claim that says a *choice* was
   made rather than a queue drained.

**Prefix fidelity did not reach its target in any arm.** 0.8523 after shaping, 0.7866 after
enablement, against a target of 0.5. One ordering still predicts a great deal of what a run holds
from its size alone. That target was not met and is reported as not met.

### 6.3 Arm D, and the number that decides whether shaping was worth it

| metric | B: enablement only | D: both | reading |
|---|--:|--:|---|
| effective dimensionality, 80% | 23 | **5** | fewer components… |
| **between-strategy variance share** | **0.512** | **0.759** | **…but far more of it is strategy** |
| prefix fidelity | 0.7866 | 0.8292 | comparable |
| runs predicted exactly from size | 1 / 96 | **0 / 96** | none |
| cross-strategy containment, large sets | **0.836 – 0.892** | **0.94 – 0.98** | **worse** |
| mean nodes, `passive-control` | 190.5 | **318.0 of 347** | **worse** |

This is the comparison the workstream turns on, and it does **not** read the way the raw
dimensionality count does. Arm B's 23 components are mostly noise: barely half its variance is
between strategies, and two runs of the *same* strategy differ nearly as much as two different ones.
Arm D has fewer components and **three quarters of its variance is between strategies** — so the
axes it has are axes a player could steer, which is what "a strategy space" means and what a count of
principal components on its own never says.

The plain statement: **enablement produced variety, shaping produced structure, and the two are not
substitutes.** A campaign that had only run arm B would have recorded dimensionality 23 and declared
the problem solved, at 0.512 between-strategy share.

**But two of arm D's numbers are worse than arm B's, and they are the ones about exhaustion.**
Containment rose to 0.94–0.98 and `passive-control` reached **318 of the 347 nodes anyone reached at
all**. Both mechanisms combined make acquisition *faster*, not slower: richer content raises what a
mage wants, the wired effects raise the rates she does it at, and enablement raises what there is to
get. The campaign's original diagnosis — *"the 51-node passive baseline is content exhaustion"* —
**returns at 318 instead of 51**, and an idle universe that learns 92% of the reachable grid is the
same defect at six times the scale.

This is the clearest single thing this workstream measured, and it was not what it set out to test:

> **Content exhaustion is not a content-quantity problem.** Six times the content, better shaped,
> with real exclusions, still exhausts — because nothing in the world *removes* knowledge or makes
> holding it cost anything. The exclusions bind one mage; the universe simply spends more mages.

Arm C is the only arm where a strategy does not approach the ceiling — 65 of 108, union 95 — and the
difference is that its content ceiling is small enough that per-mage exclusion and mortality still
bite before the universe covers it. That is a hint about ratios rather than about totals: what
matters is the reachable set per living mage, not the reachable set.

### 6.4 Two behavioural changes large enough to be findings

**Species time-to-tier bands collapsed rather than sharpened.** The hypothesis was that authoring to
tier 7 would let the high-ceiling species (elf 6, draconic 7) separate, since v1 previously stopped
at tier 5 with two nodes there. That is not what happened. Every species' *own* spread widened,
because at each tier a mage now chooses among many roughly-equally-costed nodes rather than one, and
which she reaches for depends on her own `curiosity` and `affinities`. Measured at tier 3, in ticks:
gnome went `[20, 21] → [30, 68]`, dwarf `[21, 25] → [31, 48]`, human `[28, 37] → [33, 52]`, while elf
held at `[35, 58] → [35, 59]`. The fast trio that used to sit strictly below elf now overlaps it
completely.

**Two mages of one species, differing only by seed, now diverge about as much as two species used
to.** That is the per-mage variety this design was aimed at, and it arrived at the cost of the
between-species separation the campaign's D7 wants. Both are true and they pull against each other;
which one is wanted is a design decision this workstream should not make alone.

**Universes ascend much earlier in the wide configuration.** Several arm-D strategies terminate
around tick 600–720 against arm A's full 2,400. More reachable content reaches the ascension
predicates sooner, which is very likely to push `ascensionRate` out of `contracts.md` §7's 0.05–0.20
band in the wide configuration — the campaign's D1. Not measured here; flagged because it is the
predictable consequence of the enablement decision and it belongs to whoever takes that decision.

And the negative control, which is the one that says a decision exists rather than that a number
moved: **`permit-then-idle` — a bot that permits the grid for 140 of 2,400 ticks and then submits
literally nothing — must stop winning.** It currently wins 40/40 in the true-naming arm, beating
the strategy that funds, blesses and encourages.

---

## 6.45 Claim 0, the primary measure — and it is a negative result

Two instruments, and they disagree in a way that is worth reading carefully.

**The deterministic tests pass, and they are the ones that prove the claim as stated.** Claim 0 is
*incomparable **by construction**, not by luck*, and construction is not a thing a sampling estimate
can demonstrate:

- `packages/rules-magic/test/unit/exclusion.test.ts` — two mages ending with incomparable held sets
  by construction, named as the workstream's primary acceptance test.
- `packages/rules-magic/test/unit/rituals.test.ts` — the **greedy-mage proof**: a mage pursuing both
  of a ritual's roles, in *either* pursuit order, checked against the real `acquisitionExclusion`
  gate that research and teaching use, never reaches both. That is a proof of impossibility, which
  is what "by construction" means.

**The Monte Carlo fraction moved the wrong way**, and reporting the deterministic pass without this
would be exactly the kind of selective reading this campaign was burned by three times:

| strategy | incomparable, before | after | nodes/mage, before | after |
|---|--:|--:|--:|--:|
| `passive-control` | 0.4409 | **0.3506** | 3.0 | 20.3 |
| `archivist` | 0.3946 | **0.3536** | 2.4 | 18.8 |
| `portal-rush` | 0.5043 | **0.3375** | 4.0 | 20.8 |
| `worship-maximizer` | 0.4091 | **0.3297** | 3.2 | 21.3 |
| `uniform-random-legal` | 0.2395 | **0.2110** | 3.3 | 22.2 |
| `permissive-breadth` | 0.5216 | **0.7687** | 39.9 | 122.7 |

**The before-number was noise.** At a mean of **3 nodes per mage**, two mages' sets are incomparable
about as often as two coin flips differ — 0.42 measures nothing. After, mages hold 20 and the
fraction falls to 0.35 with mean containment rising to 0.90–0.94. So the honest statement is not
*"incomparability got worse"*; it is:

> **Mages now hold seven times as much, and what they hold nests. The per-mage exclusions are real,
> tested, and live in the loop — and they are not reached.**

**The mechanism is measurable and it is the trunk.** The v1 graph is 39 untracked trunk nodes and 69
tracked ones. A mage holding a mean of 20 nodes has, on average, **never left the trunk** — and the
trunk is deliberately shared, because §3.2.3 made tiers 1–2 commitment-free so that no mage could
soft-lock into uselessness. That safety rail is now the thing preventing the mechanic from firing.

`permissive-breadth` is the exception that confirms it: at 122.7 nodes per mage it is far past any
trunk, and its incomparable fraction is the only one that rose — **0.5216 → 0.7687**, the largest
single movement in this workstream.

**So the finding is a ratio, not a mechanism failure.** Exclusivity binds at tier 3 and above; the
median mage dies before she gets there. Whatever raises nodes-per-mage — longer teachable windows,
cheaper depth, a smaller trunk, a mastery-raising verb — will make the exclusions bite without any
change to the exclusions themselves. That is a cheaper next move than anything in the graph.

## 6.47 Claim 4: gnome and human now reach different node sets — met

Measured the way the original finding was: two founding-species masks (gnome = 8, human = 16, in
content order), two strategies, three replicates over both starting corners, on the new content.

| | gnome-only | human-only |
|---|--:|--:|
| `passive-control`, mean nodes | **65.7** | **38.8** |
| `archivist`, mean nodes | **69.0** | 45.5 |
| Jaccard, gnome ↔ human, same strategy | **0.572** / 0.565 | |
| mean ticks to termination | **826 / 835** | 2400 / 2400 |

`strategy-dimensionality.md` recorded the defect as *"cross-species containment 1.00 — two ceiling-4
species reach the **identical** forty-nine"*. They now share about **57%** of their nodes and differ
by a factor of **1.7 in how many they reach at all**, which is the sharpest single before/after in
this workstream.

**And the run ends differently, not just differently-sized.** Gnome-only universes terminate around
tick 830 — they ascend — while human-only universes run the full 2,400 and do not. That is the
campaign's **D7** (*"varying the founding species mix changes which strategy wins"*) showing a signal
where it previously had none, and it comes from species affinities that had nothing to read before:
human declared no affinities at all and gnome's two named forms outside the v1 rectangle, so
`target-appeal.ts`'s affinity term — one of only two terms orthogonal to tier — was blind to both.

**The caveat, stated because it is load-bearing:** containment stays high (0.90–0.97), because the
human set is close to a subset of the larger gnome one. The species differ in *how far* they get more
than in *which way* they go. Combined with §6.4's finding that time-to-tier bands collapsed, the
honest summary is that species now differ in **reach** rather than in **direction** — which is
progress on D7 and not yet plurality.

## 6.5 The negative control: `permit-then-idle` still wins, and that is the headline

**It still wins. 12/12, rate 1.0000.** Measured on the true-naming arm with the same sweep file,
same `sweepId`, same `rootSeed` and the same reporter the committed
`balance/results-integration-r2.txt` was produced with — reduced to 120 runs because the machine was
shared, and since a run seed is a pure function of `(rootSeed, sweepId, cellIndex, replicateIndex)`
under round-robin assignment, **these 120 runs are exactly the first 120 of the committed 400, seed
for seed.**

| strategy | before (40 runs) | after (12 runs) | nodes known, after |
|---|--:|--:|--:|
| `permit-then-idle` *(probe)* | **40/40 = 1.0000** | **12/12 = 1.0000** | 299.6 |
| `permissive-breadth` | 38/40 = 0.9500 | 12/12 = 1.0000 | 297.9 |
| every other strategy | 0/40 | **0/12** | 57–68 |

The brief said that if this bot does not lose, no decision has been created. Taken literally, no
decision has been created **at the god layer**, and that is the honest answer. But the numbers say
something sharper than "nothing changed", and it is worth stating exactly.

**`permit-then-idle` is not idle in the way that matters.** It permits every technique and every form
across its first 140 ticks and then submits nothing. So it is not a do-nothing bot — it is a bot that
plays the game's **one consequential verb** and then stops. Look at what it buys: 299.6 nodes known,
against 60.2 for `passive-control` and 60.2 for `idle-then-declare`, which is the honest idle control
and ascends 0/12. The gap between 300 nodes and 60 is entirely the permit.

So the finding is not *"acting is worthless"*. It is:

> **The god has exactly one lever that matters, and it is `permit`. Everything W20 built is a
> decision *inside* the knowledge graph — which nodes a mage takes, which school she commits to,
> which key she cuts — and none of it is a decision *between god strategies*, because the god has no
> verb that reaches it.**

That is a different and more actionable defect than the one the campaign started with, and it is
consistent with everything else measured here: arm B showed enablement doing most of the work, and
`permit` is the enablement verb. A god who permits the grid and walks away gets 300 nodes; one who
funds, blesses and encourages gets 300 nodes too.

**What did move, and it is not nothing:**

- **`ascensionRate` is back inside `contracts.md` §7's band.** 0.1250 excluding probes, 0.2000
  including them, against the campaign's measured **0.79**. D1 passes.
- **D6 passes**: no strategy ascends at or below the passive knowledge baseline. Before, an idle
  universe learned everything there was.
- **D3 still fails**: only 2 of 10 strategies ascend at all, at 50% each. Three strategies winning at
  materially different rates remains unmet, and it will stay unmet while `permit` is the only verb.

**The next change this points at is not more content and not a better graph.** It is giving the god
a second verb whose payoff is not dominated by permitting — or making permitting cost something. The
edict budget (§4's dispensations and interdictions) is the mechanism the vision already has for that,
and it is currently free to ignore.

## 6.6 The balance baselines, regenerated once, and what moved

Regenerated at the end of the workstream with a written rationale naming all five mechanisms — the
51 → 108 v1 graph, `researchCost` ceasing to be a function of tier, `knowledgeEffectHooks` making
held knowledge live, `lifespan` moving from `additive` to `diminishing` stacking, and per-mage
exclusions refusing acquisitions that were previously legal. **No golden replay fixture was
regenerated**, and none needed to be: the goldens are pure `sim-core` scenarios with zero content
dependency, which is worth knowing the next time a content change looks like it should move them.

The horizon gate (240 ticks) carries the two numbers worth reading:

| metric | before | after | delta |
|---|--:|--:|--:|
| `referenceNodesKnown` | 46.91 | **66.855** | **+19.9** |
| **`referenceNodesGainedFinalQuarter`** | **2.055** | **5.345** | **+3.29** |
| `referenceGrimoires` | 361.33 | 410.93 | +49.6 |
| `referenceKnowledgeInstances` | 1015.77 | 1049.225 | +33.5 |
| `referenceLibraryDepth` | 25.09 | **22.765** | **−2.33** |
| `referenceLivingMages` | 37.785 | 37.87 | +0.09 |
| `referencePopulation` | 211.685 | 212.3 | +0.62 |

**`referenceNodesGainedFinalQuarter` is the one to read.** It more than doubled. That metric exists
to detect a plateau — a universe that has stopped learning because it has run out of things to learn
— and the campaign's diagnosis was that it sits near zero because 51 nodes exhaust in about a quarter
of a run. A universe still gaining five nodes in its final quarter has not finished, which is the
first direct evidence that the exhaustion plateau moved rather than merely shifted upward. Set beside
§6.3's finding that the *wide* configuration exhausts at 318, it says the same thing twice: the v1
rectangle's new size is roughly right, and enablement overshoots it.

**Population is unmoved** (+0.62, 0.47 SE) and **living mages are unmoved** (+0.09), which is the
control this set of changes needed: nothing here was supposed to touch the demographic loop, and it
did not. `referenceLibraryDepth` fell by 2.33, which is the one movement pointing the wrong way and
is consistent with §6a's scribing gap — the real per-tick scribing accrual is still hardcoded
`NO_BONUSES`, so more nodes to write about did not buy more writing.

## 6a. What the build found on the way, recorded rather than smoothed over

Six things surfaced while implementing this that are worth more than the code that fixed them.

**The declared effect pipeline had no callers.** `rules-magic/src/effects/` documents
`instances → gatherEffects → contributions → stackContributions → outcomes`, and `gatherEffects` and
`stackContributions` had **zero production callers** — every reference was inside that directory or
its own tests. A mage holding a `research-rate` node got nothing from it. The world-tick bonus arrays
were god-blessings-only (`research-rate`, `teach-rate`, `lifespan`) or literally `[]`
(`resource-yield`, `fertility`, `scribe-rate`). So most authored magnitudes in the game were inert,
and had been through every measurement the campaign has taken.

**`build-rate` is worse than inert: its consumer has no caller either.** `advanceConstruction` in
`rules-world/src/universities/construction.ts` is called only from inside its own file. Wiring
`buildRateBonuses` would have been dead code, so it was deliberately not wired — and 14 authored
`build-rate` effects are therefore still asleep. That is a finding for whoever owns construction, not
something to paper over here.

**Engagement scale re-implements the gather gates.** `rules-raid/src/arbitration.ts` reads
`node.effects` magnitudes through its own copy of the location/mastery/legality checks rather than
through `gatherEffects`. That is why adding `mode` had to touch the raid layer separately: a
`control`-mode effect with a placeholder magnitude would otherwise have stacked as a 100% ward and a
guaranteed knowledge-steal. Two implementations of one rule is the defect; this change makes them
agree rather than merging them, and the merge is still owed.

**Two pre-existing content defects fell out of the new checks.** `cell.json`'s `nodes` lists had
drifted from `node.json`, and `creo-mentem`'s `cm-the-made-scholar` declared an effect targeting the
whole universe — which contradicts sound-design §4.2's *"the only form with no reverb at all… it is
happening inside the listener's head rather than in the world"*. Neither is in the v1 rectangle, so
neither had ever been executed. `mentem-is-not-in-the-world` is enforced for **all** cells precisely
because it is a statement about the form.

**The schema interpreter grew one documented deviation.** `packages/content/src/json-schema.ts`
enforces a closed keyword list on purpose — *"a constraint that enforces nothing while reading as
though it did is worse than its absence"*. `oneOf` was added for the `when` condition, and it folds
the matching branch's `properties` into the parent before running `additionalProperties`, which is
what `unevaluatedProperties` would do in a stricter dialect. The deviation is **stricter than the
alternative**, not looser: declaring the variant fields at the parent level would have let a
`holds-cell` field ride on an `always` condition.

**The wiring reaches `target: "universe"` effects only, and most authored effects are not that.**
This is the sharpest limitation in the workstream and it is measured, not estimated. Across the v1
rectangle's 63 world-scale effects: **27 target `universe`**, and 36 target `self`, `single`, `area`
or `side`. `knowledgeEffectHooks` filters to `universe`, because applying a `self`-scoped effect
correctly means a **per-mage effect channel that does not exist**. So of the v1 content:

| primitive | universe-target v1 effects | reaches the world stack? |
|---|--:|---|
| `resource-yield` | 11 | **yes** |
| `build-rate` | 14 | no — `advanceConstruction` has no caller |
| `portal` | 2 | yes, by its own path |
| `research-rate`, `teach-rate`, `scribe-rate`, `lifespan` | **0** | **no** — all authored `self`/`single`/`area` |

**Eleven effects.** That is how much of the authored v1 world-scale content is live. In particular
**the life-extension ladder targets `self`, so it does not reach the wiring at all** — the depth axis
the design asks for is authored, validated, loader-checked and disconnected. `lifespanEffectsFor`
already takes a mage argument, so the fix is narrow and real: route a `self`-target effect to the
mage who holds it. It was not done here because doing it after the arms were taken would have
invalidated every number in §6.2, and a measurement of a system that no longer exists is worse than a
gap that is written down.

**Rate primitives should probably not be authorable at `universe` scope at all**, which is the
deeper version of the same finding: `research-rate` is *"multiplier on research progress"* and
progress belongs to a mage. The scope enum was inherited from an engagement-shaped vocabulary
(`self`/`single`/`area`/`side`) and the world scale has only ever needed two: *this mage* and *the
universe*. That is a §2.3 question worth answering before more content is authored against it.

**Raid theft bypasses both enforcement seams.** `knowledge-steal` creates instances through
`createInstance` directly, so a mage can be handed, by theft, a node her own commitments forbid her
to learn. It is recorded in `exclusion.ts`'s module comment rather than fixed, because the right
answer is a design question — theft that can violate a commitment is arguably *correct*, and a very
good reason to steal — and it belongs with whoever owns the raid layer.

## 6b. Rituals: spells that require more than one mage

**This mechanic is not traceable to any existing section, and that is stated first rather than
last.** `vision.md`, `contracts.md` and `sound-design.md` contain nothing on rituals, covens or
co-casting. It arrives as a new design decision from the author, it is built here, and **it needs a
`vision.md` amendment** — `CLAUDE.md` is explicit that work not traceable to the vision is scope
creep, and the honest way to hold that line is to name the exception rather than to let it pass.

### 6b.1 Why it is the keystone rather than an addition

Everything else in W20 says *no single mage can learn everything*. That produces **incomparable**
mages, which the campaign wanted, and which on its own has no mechanical consequence — two mages who
know different things are still just two mages.

Rituals are the consequence. **The deepest magic requires casters who between them hold what no one
of them could hold alone.** That inverts exclusivity from a limitation into the reason a faculty
exists, and it is the first mechanic in the game that makes a *university* the unit of play rather
than a worship generator.

### 6b.2 The five decisions, and why each went the way it did

**1. The gate is mutually exclusive tracks — the strong version.** A ritual declares two or more
caster roles, each naming a `track` and a `minNodes`, and **the roles' tracks must be mutually
exclusive of one another**. The ritual is therefore uncastable by any one mage *by construction,
forever*, however long she lives.

The weak alternative — *"any N mages who between them hold the prerequisites"* — was rejected because
a long-lived mage plus time defeats it, which makes it a scheduling constraint rather than a
structural one. The strong version is also self-enforcing: the loader refuses a ritual whose roles
are not mutually exclusive (`ritual-castable-by-one`), because such a thing is not a ritual, it is an
expensive spell wearing the word.

**2. Co-location is "the same university".** `vision.md` §7a is explicit that world-scale entities
**carry no coordinates at all**, so proximity cannot be spatial without inventing a map the vision
deliberately does not have. Shared affiliation is the non-spatial expression, and it keeps §7a
intact.

**3. No ritual state is stored.** Availability is a **derived check at cast time** over the
university's living, affiliated mages. It is cheaper, it cannot desynchronise, and — the actual
reason — it makes a caster's death instantly consequential: the capability stops existing on the tick
she dies, with nothing to clean up and no half-assembled team to reconcile. That is `sound-design.md`
§3.3's *"a bar of silence where the scribing used to be"* at the level of a capability rather than a
layer.

**4. World time only, in v1.** `contracts.md` §4.2 masks nearly every action during engagement, and
the raid model has no expression of "same university" to check against. A raid-time ritual is a
genuinely different mechanic — under §3's portal rule the *host's* ruleset governs what a visiting
team may cast — and it needs the co-location question answered again in a model that has none of the
same furniture. Deferred deliberately, not overlooked.

**5. Every caster pays, and the tradition `cost` hook applies per caster.** §4a defines cost as
*"what casting takes out of the caster"*, and a ritual has several. Across a portal, cost is
host-governed, so a visiting team would each pay the host's price — moot in v1 by decision 4, and
stated so it is not re-derived differently later.

### 6b.3 The seventh acceptance measure

> **A capability exists that no single mage can ever hold, and a universe demonstrably loses it when
> one caster dies.**

This one is asserted as a **named deterministic test** rather than a Monte Carlo metric, and that is
the right instrument for it: it is a claim about what is *possible*, not about what is *frequent*, and
a sweep can only ever fail to observe something. A test that builds two mages on mutually exclusive
tracks in one university, asserts the ritual is available, kills one, and asserts it is not, settles
the claim exactly.

## 6c. Three proposed mechanics, judged and costed rather than adopted

`docs/design/content/spell-glosses.md` (on `pm/campaign-plan`) carries 25 gloss drafts, and three of
them propose **mechanics** rather than prose. Each is good. **None is adopted here**, and the reason
is the same for all three: the graph is the deliverable, the prose attaches to it, and this repo
treats a gloss that promises what the code does not do as a defect. Placing any of these without
implementing it would put a lie in the content. What each would cost is recorded so the decision is
cheap next time.

**1. The Indexed Ash** *(Perdo Herbam)* — *"reduces the physical text to clean soot while leaving its
indexing data perfectly intact."* **Destruction that leaves rediscovery cheaper.** This is a genuinely
new shape: the game has only ever had *destroyed* and *intact*, and vision §5's rediscovery is priced
purely from content (`rediscoveryMultiplier` × species affinity, floored). It rhymes with the dwarf
bark — *"cross-referenced twice; the second one is for after the first one burns."*
**Cost:** new state. Rediscovery cost is currently a pure function of the node record, so
"this node was lost *while indexed*" is a per-node, per-universe fact nothing stores. That is a
world-schema revision, which is `WORLD_SCHEMA_VERSION` and a golden-fixture conversation. **Highest
value of the three and the most expensive.**

**2. The Duplicate Hand** *(Rego Herbam)* — halves scribe labour, *"but the master copy must be
intact, which is rarely the case."* **Scribe rate gated on redundancy** — a spell that helps only if
you already kept a spare, which is a real decision and points straight at the concentration problem.
**Cost:** small — one new `when` kind, `holds-instances`, alongside the existing `revealed` and
`holds-cell`. **But it would be inert.** `scribe-rate` has **zero** universe-target effects in
shipped content and the real per-tick scribing accrual is hardcoded `NO_BONUSES` (§6a). Implement
the scribe channel first, or this is a gloss describing a spell that does nothing.

**3. The Endowed Chair** *(Creo Vim)* — *"tethers a tenured mage's failing breath to the ambient
magical reservoir, effectively outsourcing their heartbeat to the endowment."* **Life extension with
a running economic cost** rather than a flat grant, which is the shape the author asked for when they
said returns should be logarithmic so slow dragons stay worth having.
**Cost:** an upkeep mechanism, which does not exist — every effect in the game is either instantaneous
or a standing modifier, and nothing pays per tick to keep a modifier alive. Also blocked by the same
gap as the authored ladder: `lifespan` effects target `self` and the per-mage effect channel does not
exist (§6a).

**A note on where they sit.** All three are outside the v1 rectangle — Perdo Herbam, Rego Herbam,
Creo Vim — so adopting them also means deciding the enablement question in §7a. Two of the three are
blocked on the same wiring gap, which is worth reading as a signal: **the cheapest next move is not
more content, it is connecting the content that exists.**

## 6d. Two technique-semantics questions, put up together

### 6d.1 Perdo on `concealment` is inverted, and which way to fix it is a design decision

A gloss audit found ~9–10 Perdo nodes carrying `{primitive: "concealment", target: "self", mode:
"remove"}`, every one glossed as the caster becoming **more** hidden — *"the caster is a little
harder to call"*. The mechanic does the opposite: `remove` contributes `−magnitude`, `concealment` is
*"fp probability of evading targeting or detection"*, so those nodes **lower their own caster's
concealment**.

This is not a gloss overstating a mechanic. It is an **inversion**, and rewriting the prose would
silently pick a side in a real ambiguity:

> **Perdo is subtraction. On concealment, does it destroy the *shadow* — revealing you — or destroy
> the *observation* — hiding you?**

§4.1 says *"Perdo's signature is a hole"* without saying a hole in what. §4.2 pulls the other way:
Umbra is *"the negative — everything in the reverb tail, nothing in the dry signal"*, which makes
concealment a **presence** that Perdo would remove. The authored intent is clearly the second reading
— Perdo Nomen unmakes your name and so you cannot be found — but the primitive is framed as a benefit
*you hold*, so subtracting it subtracts your safety.

**The deeper cause is the strict `mode` ↔ technique rule this workstream introduced**, and this is
the first place it bites. `remove` reads cleanly on a primitive that measures *harm done to a target*
(`direct-damage`, `area-denial`) and incoherently on one that measures *a good the holder has*
(`concealment`, `ward`). The rule needs a refinement or the content needs re-homing, and the choice
changes what Perdo means across all fourteen forms. **Raised, not decided.** Nothing was rewritten;
the glosses and the mechanic still disagree, visibly, in the data.

### 6d.2 Intellego's cost curve — settled, and there is no conflict

W21 (`w21/timing-and-envelopes`) objects that calling Intellego's curve *"flat"* would make it
identical to Rego's *"zero attack, gated release, rhythmically rigid"* and collapse two of §4.1's five
shapes. **The objection is right about the word and wrong about the collision, and both curves should
ship.**

They act on different axes. W21's curves are a function of **progress within one acquisition** — the
envelope over a node's research duration. The curves in §3.5 are a function of **tier** — what a node
costs at all. On the tier axis these two are not close:

| technique | tier-on-tier cost growth |
|---|---|
| intellego | 1.75, 1.71, 1.67, 1.60, 1.75, 1.71 |
| rego | **2.00, 2.50, 2.00, 2.40, 2.00, 2.00** |

Intellego grows at about 1.7× a tier; Rego at 2.0–2.5× in a three-value ladder. **"Flat" was a bad
label for a curve that is not constant but merely the shallowest** — the intent was *flattest
growth*, and §3.5 says so now. On W21's axis, *late-opening* is plainly the better reading of *"no
impact at all; a filter opens"*, and nothing here contradicts it.

Also confirmed: `technique.json` is byte-identical to base across this branch's whole history, so
there is no content collision between the two workstreams.

## 6e. Depth, and the trunk rule — both answered with numbers

### 6e.1 The expansion went deep, and `depthCeiling` now separates five ways

*"If everything is reachable then nothing is differentiatable."* The measured version of that was
that `depthCeiling` ranges 3–7 against content that topped out at tier 6 with **one node there and
none above**. Three of six species had functionally identical ceilings.

| tier | 1 | 2 | 3 | 4 | **5** | **6** | **7** |
|---|--:|--:|--:|--:|--:|--:|--:|
| v1, before | 12 | 13 | 13 | 11 | **2** | **0** | **0** |
| **v1, after** | 12 | 24 | 24 | 24 | **12** | **6** | **6** |
| whole game, before | 70 | 71 | 78 | 65 | **15** | **1** | **0** |
| **whole game, after** | 70 | 82 | 89 | 78 | **25** | **7** | **6** |

**The game had zero tier-7 nodes. It now has six**, all inside the v1 rectangle. Twenty-four v1 nodes
sit above tier 4 where two did.

What that buys, which is the whole point:

| `depthCeiling` | species | v1 nodes reachable, before | **after** |
|--:|---|--:|--:|
| 3 | orc | 38 | **60** |
| 4 | human, gnome | 49 | **84** |
| 5 | dwarf | 51 | **96** |
| 6 | elf | 51 | **102** |
| 7 | draconic | 51 | **108** |

**Three distinguishable outcomes became five.** Dwarf, elf and draconic previously reached the
identical 51; they now reach 96, 102 and 108. A dragon's ceiling is worth six nodes an elf cannot
reach, and an elf's is worth six a dwarf cannot — which is the first time the trait has meant
anything.

### 6e.2 The trunk rule: intact for Rego, deliberately not for Perdo

The verified rule in the base content was that **all 11 of 11 cross-cell prerequisite edges
originate in Intellego** — *you must perceive a thing before you can unmake or command it*. Measured
on the expanded graph, over 87 v1 cross-cell edges:

- **Every one of the 36 Rego nodes has an Intellego ancestor.** The rule holds completely for Rego,
  including at tier 1: no Rego node is a root.
- **12 of the 36 Perdo nodes do not** — the four Perdo tier-1 roots (`pm-blunt-the-edge`,
  `pt-crumble`, `pl-fray-the-edge`, `pn-mispronounce`) and their tier-2 successors. Perdo keeps four
  independent entry points into the graph.
- By edge count the rule is diluted rather than broken: 48 of 87 cross-cell edges originate in
  Intellego, against 26 in Perdo and 13 in Rego.

**Whether Perdo should also be gated is a design question, and it is worth asking rather than
assuming.** There is a real argument that it should not be: breaking a thing is the one act that
does not require understanding it, and *Blunt the Edge* — taking the sharpness out of an attention —
plainly does not need Intellego Mentem first. Keeping Perdo's roots free also means a universe that
forbids Intellego is not left with literally nothing, which matters given §4's technique switches.

**But it was not a decision, it was an authoring accident**, and that is the honest report. It should
be made deliberately in one direction or the other before the Muto and Creo columns are authored,
because those will need the same call and will otherwise inherit whichever way this fell.

### 6e.3 The expansion made Intellego a much stronger chokepoint, and that settles which pair to use

The base content's chokepoint was measured as *"strip every Intellego node and 18 of 51 v1 nodes stay
reachable"* — perception gating depth rather than entry, since every Perdo and Rego cell kept a
tier-1 root. The same computation on the expanded graph:

| | base content | **after W20** |
|---|--:|--:|
| v1 nodes surviving the removal of every Intellego node | 18 of 51 (35%) | **12 of 108 (11%)** |
| techniques surviving | perdo + rego | **perdo only** |
| deepest tier still reachable | — | **3** |

**No Rego node survives at all**, because the expansion gave every Rego tier-1 node an Intellego
tier-1 prerequisite. So on this graph perception gates *entry* for Rego and *depth* for Perdo, and
**89% of the v1 rectangle sits behind Intellego**.

Three conclusions follow, and they are the useful part:

1. **An exclusive pair containing Intellego is disqualified**, decisively and on a measured number
   rather than an overstatement. A mage locked out of Intellego reaches 12 nodes, none past tier 3,
   and no Rego at all. That is not a specialist, it is a cripple — and it is exactly what
   `track-excluded-by-trunk` exists to refuse.
2. **Perdo ↔ Rego is the structurally cheapest pairing**, and this measurement is why: both keep a
   viable route in — Perdo through its four independent roots, Rego through the entire Intellego
   trunk — so the exclusion removes a **branch** rather than a **start**. That is the property an
   exclusion needs, and none of the three v1 pairs authored here have it as cleanly.
3. **`rl-open-the-portal` requires `il-read-the-binding`**, so raid access runs through perception.
   Any exclusion touching Intellego Limen has consequences past the knowledge graph, into whether a
   universe can open a portal at all. Worth checking before any future pairing goes near that cell.

## 6.7 What `npm run verify` says, stated exactly

Every stage passes. The single combined invocation does not exit zero, and the reason is not this
branch.

| stage | result |
|---|---|
| `typecheck` | pass |
| `lint` | pass |
| `check:purity` | pass — the eight core packages declare no third-party runtime dependency |
| `check:content` | pass — 357 nodes, 70 cells, 12 flagged v1 |
| `check:audio` | pass |
| `check:coverage` | pass — `lifespan` left the exclusion list, `fertility` stayed |
| `test` | **283 / 283 files, 4134 / 4134 tests pass** |
| `balance:gate` | **exit 0** |
| `balance:gate:horizon` | **exit 0** |
| `balance:gate:ascension` | **exit 0** |
| **`npm run verify` (combined)** | **exit 1** |

The combined run exits 1 on *"Unhandled Errors — `[vitest-worker]: Timeout calling onTaskUpdate`"*
while reporting every test passed. That is vitest's **reporter RPC** timing out, not a test failing:
a worker running a long synchronous simulation loop cannot service the main process's task-update
call, and the main process is itself starved.

**The machine was at a load average of 264** during the run, from three other workstreams executing
Monte Carlo sweeps concurrently. The three balance gates were therefore executed separately, on the
same tree, and all three returned exit 0 — which is the part of `verify` the combined run never
reached, since `&&` stops at the first non-zero.

**The diagnosis is proven rather than inferred.** The same suite, same tree, same load, run as
`npx vitest run --maxWorkers=2`:

    LOWWORKERS_EXIT=0
    Test Files  283 passed (283)
         Tests  4134 passed (4134)

**Exit 0, zero errors.** Halving the worker count is not a change to any test — it changes only how
many workers compete for a machine that already has none to spare. So the combined run's exit 1 is
contention, and the suite is green.

**This is reported rather than worked around.** Two things are true at once and both belong in the
record: nothing in this branch fails, and W20 did make the loop heavy enough that two tests crossed
vitest's 30s default and had their bounds raised with the measurement written beside them (§6a). A
plain `npm run verify` on an idle machine is the check that would close it, and it is owed before
this merges.

## 7. The open question, raised rather than answered

The author's instruction says *"author a complex web of nodes **per tradition**"*. Tracks as
specified here are a property of the **knowledge graph**, shared by every universe whatever its
tradition, and that is a deliberate reading rather than an oversight.

The reason is `vision.md` §4a, which is explicit:

> **A tradition may hook exactly four points, and no others.** … This cap is deliberate — bespoke
> tradition code is the fun, and it is also precisely what defeats Monte Carlo balancing.

Gating which tracks *exist* on the universe's tradition would be a **fifth hook**, and
`contracts.md` §2.5 restates the cap normatively with a character-for-character conformance test
behind it. Two further consequences follow that the vision does not settle:

1. **`changeTradition` exists** (vision §7, *"rarely and ruinously"*). If tracks belonged to
   traditions and tracks exclude one another, changing tradition would have to say what becomes of
   knowledge on a track the new tradition does not have — destroyed, dormant, or grandfathered.
   Nothing in `vision.md` or `contracts.md` answers this.
2. **Across a portal, `acquire` and `store` stay with the mage's home tradition** (§4a). A raider
   holding tradition-owned tracks in a foreign sky would need a rule for whether her repertoire
   still functions, and that rule is `cast`/`cost` — host-governed — which would put tradition-owned
   content on both sides of the portal split at once.

**This is the design decision to escalate.** The implementation ships tracks as graph-level so that
the measurement can be taken; if the answer is that tracks *are* tradition-owned, §4a's four-hook
cap has to be amended deliberately, in that document, with these two consequences answered — not
quietly widened by content.
