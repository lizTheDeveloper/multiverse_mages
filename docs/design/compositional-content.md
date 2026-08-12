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

**Both are enforced per mage, not per universe.** Vision §5 puts a knowledge instance in exactly
one place, and `mind:<mageId>` is one of them. A universe may still hold both lines — at the price
of spending two different mages on them, and mages are mortal, slow and scarce. That is the
opportunity cost, and it is paid in the resource the game is actually about.

**The relation is symmetric, declared once.** `load.ts` normalises it, so holding either member
blocks the other whichever arrived first. Declaring it on both sides is not an error.

**The loader refuses unsatisfiable content.** A track whose own prerequisites lie inside a track
that excludes it is dead content — nobody can ever enter it — and that is a load failure, not a
warning. The check is stated in §5.

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
| `research-cost-is-tier-alone` | a v1 tier whose nodes all share one `researchCost` |
| `effect-gloss-missing` | an effect in a v1 cell with no `gloss` |

---

## 6. The claim this change is making

Measured on the eight-strategy 2,400-tick sweep, with W15's instrument reused unchanged:

| # | claim | before |
|---|---|---|
| 1 | effective dimensionality ≥ 3 for 80% of variance | 1 |
| 2 | prefix fidelity < 0.5 | 0.943 |
| 3 | cross-strategy containment < 0.9 | 1.000 |
| 4 | gnome and human reach different node sets | identical 49 |
| 5 | no strategy holds the entire reachable set | every one did |
| 6 | two mages in one universe hold **incomparable** sets | *not previously measured* |

And the negative control, which is the one that says a decision exists rather than that a number
moved: **`permit-then-idle` — a bot that permits the grid for 140 of 2,400 ticks and then submits
literally nothing — must stop winning.** It currently wins 40/40 in the true-naming arm, beating
the strategy that funds, blesses and encourages.

---

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
