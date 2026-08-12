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

And the negative control, which is the one that says a decision exists rather than that a number
moved: **`permit-then-idle` — a bot that permits the grid for 140 of 2,400 ticks and then submits
literally nothing — must stop winning.** It currently wins 40/40 in the true-naming arm, beating
the strategy that funds, blesses and encourages.

---

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
