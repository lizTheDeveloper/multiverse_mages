<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The substrate: what magic is made of, and why a civilization can make more of it

**Status: author's design, recorded 2026-08-14. Not implemented.** This is the cosmology
`vision.md` never had. It is written to be argued against §3 (effect primitives), §4 (the grid) and
§6a (the economy) before anything is built.

## Why this document exists

There is no account anywhere of what magic **is**. Grep `vision.md` for *substrate* and every hit
means the simulation substrate — entity-updates/sec — or materials as physical stuff. The game has
a grid, an economy, and sixteen primitives, and no statement about what the grid is a grid *of*.

That was survivable while every effect could only add. It stops being survivable the moment
magnitudes are signed, because a sign is an assertion about opposition and the game has no account
of what opposes what. *"Clamps have to be mechanical, not naive"* is the same problem stated from
the arithmetic side: a bound is only mechanical if there is a mechanism to derive it from.

**Almost all of this is already latent in the shipped content.** What follows mostly connects
things that are already written and have never been joined.

## 1. Vis is conserved

**Vim — raw magic — is the conserved quantity.** Every working moves it: in, out, sideways, or
somewhere else. Nothing creates it.

The lore is already authored, at `creo-vim` tier 5, and it is the deepest node in the game:

> **The Made Vis.** *"Magic made rather than gathered. Every economy in the multiverse is priced on
> the assumption that this is impossible, and the four universities that hold it have each
> independently decided not to publish."*

That node is the exception that fixes the rule. Vis is **gathered**, not made — and the single
working that breaks conservation is tier 5, suppressed, and known to four institutions.

## 2. The five techniques are five operations on that quantity

`technique.json` already carries the opposition, unconnected to any arithmetic:

| technique | gloss | operation | sign |
|---|---|---|---|
| **Creo** | make, create, heal | value **in** | **+** |
| **Perdo** | unmake, destroy, wither | value **out** | **−** |
| **Muto** | transform | same total, different **form** | conservative |
| **Rego** | control, bind, compel | same total, different **holder or place** | conservative |
| **Intellego** | perceive, know, scry | reads, moves nothing | **zero** |

This is not lore decorating mechanics. It is the same statement twice, which is the point.

**Consequences that are checkable rather than decorative:**

- **The sign is derived, not authored.** A *Perdo* node may not carry a positive `resource-yield`;
  that would be unmaking that creates. The loader can enforce this the way it already enforces
  anti-requisite symmetry — one content invariant, and the class of authoring error that produced
  four disagreeing sign filters becomes unrepresentable.
- **Muto and Rego get conservation invariants.** Their magnitudes must sum to zero — across kinds
  for *Muto*, across holders for *Rego*. That is what stops transformation being a free lunch, and
  it is a real constraint on content rather than a comment.
- **Intellego cannot be excluded** (§4b already rules this) for a reason the substrate now supplies:
  reading is the only operation that moves nothing, so every other operation needs it to aim.

## 3. Where new vis comes from: entropy, and life as the exploit

Conservation alone gives a universe a fixed ceiling, and this is a game about civilizations getting
richer. So gathering has to bring vis in from somewhere, and this is the one place the substrate
has to make a choice rather than describe one.

**The choice: entropy increases, and life is the exception that pays.**

A closed system runs down. But a living thing finds *order* more energy-efficient than disorder —
it is cheaper for it to arrange the world than to leave it arranged badly — so life locally
descends the entropy gradient while raising it elsewhere. **That local descent is what vis is, and
harvesting it is what magic does.**

What this buys, and why it is worth the complication:

- **A civilization generates magic by being a civilization.** Populace, buildings, libraries,
  institutions — these are ordered states, and ordering is the pump. §6a's economy stops being a
  parallel system beside the magic and becomes its source.
- **A dead universe has no magic**, which is what `stagnation-mageless-ticks` already asserts
  mechanically and has never explained.
- **Raiding has a physical reading.** Sacking a library releases stored order. That is why looting
  pays, and why §8's *"knowledge whose last instance dies is lost"* is a thermodynamic statement
  rather than a bookkeeping one.
- **The worship loop gets a basis.** Worship is a populace ordering itself around a god.

## 4. The forms are the gradient — which is where "more than five verbs" lives

Five techniques are five verbs. **Fourteen forms are where the substrate actually differentiates**,
and today they carry nothing but `yieldWeights`.

The shipped split is already suggestive: seven forms carry material yield — *animal, aquam, auram,
herbam, ignem, terram, nomen* — and seven are all-zero: *corpus, imaginem, mentem, vim, umbra,
fatum, limen*.

**Proposal: each form carries an order rank.** *Terram* is dense and highly ordered; *Ignem* is heat
and highly disordered. Then:

- **Transformation down the gradient releases vis.** Stone to fire pays you.
- **Transformation up the gradient costs vis.** Fire to stone is expensive, and *Creo Terram* is
  expensive for a reason a physicist would recognise rather than because someone tuned it.
- **A form's rank prices every cell it appears in**, so all fourteen become mechanically distinct
  instead of being a naming convention over one behaviour.

That is the mathy, Witch Hat-ish version of the grid: a working is a verb applied to a position on
a gradient, and its cost falls out of the two rather than being authored per node.

## 4a. A spell is a tree, and the ages are its depth

*Prompted by Odrzywołek, ["All elementary functions from a single binary
operator"](https://arxiv.org/abs/2603.21852) (arXiv:2603.21852). The paper shows that
`eml(x, y) = exp(x) − ln(y)`, together with the constant `1`, generates every function on a
scientific calculator — constants, arithmetic, transcendentals — under the grammar
`S → 1 | eml(S, S)`. Every expression is a binary tree of identical nodes, and what varies is
**depth**.*

Three things follow, in descending order of how load-bearing they are.

### The grammar is already §1 of `ages-of-magic.md`

| age | a spell is | space over 70 cells |
|---|---|--:|
| first | one cell | 70 |
| second | two cells | 2,415 |
| third | three cells | 54,740 |

That is tree depth, written down before the analogy existed. It means a compound is not *"a spell
that names several cells"* — it is an **application**, and the third age is not more content but
deeper composition. The frontier opens faster than a civilization can walk it for a combinatorial
reason rather than an authored one, which is exactly what §1's *"the point is that the space opens
faster than a civilization can walk it"* asks for and does not currently have a mechanism behind.

### Research becomes a search, which is the divergence problem's answer

This is the part worth building rather than admiring. The paper recovers exact closed forms from
numerical data by descending a gradient over tree structures.

`campaign-plan.md`'s W15 measured cross-strategy containment at **1.000** — a single fixed node
ordering predicts each run's held set from its count alone, because acquisition walks a sorted
queue. W17 made the queue value-scored and containment did not move. The author's stated goal is
*"it should feel like you're maybe going to discover deep magic that no other player has found"*,
and a longer queue cannot produce that however it is ordered.

**If research is a search for a composition that produces an observed effect, two universes
searching from different held knowledge land on different trees.** Divergence stops being a thing
to engineer and becomes what search does. It also gives **rediscovery** a meaning it has never had:
you retain the *effect* and have lost the *tree*, so you search again — and may find a different
one. A gnome's `rediscoveryAffinity` becomes *better search* rather than a cost multiplier.

### The operator is a making minus an unmaking

`exp(x) − ln(y)` is a growth term minus its inverse. One operator, and it is
**Creo minus Perdo** — which is §2's table with the two signs composed into a single node rather
than kept apart.

`muto-vim` tier 5 already claims this exists: *"change any working into any other by way of what the
two were before they were told apart."* The paper is a constructive proof that a common root of that
kind can exist — one operation, differentiated by composition rather than by kind. That is
suggestive rather than binding, and it is listed third for that reason.

### What does **not** transfer, and this is not a caveat

**The arithmetic.** `exp` and `ln` compose into stiff surfaces, which is why the paper needs Adam
and shallow depth. `CLAUDE.md`'s first non-negotiable constraint is fixed-point integers at 1/1024
with **no floating point in the rules path**, and that constraint exists because live PvP and
committed balance baselines both depend on bit-exact determinism. Nothing here is worth relaxing it
for.

So the **structure** transfers and the **operator** does not: a spell is a tree over one composition
rule, and what that rule computes at each node is this project's design decision, not `exp − ln`.

**And the search must not be literal.** A gradient optimizer per mage per tick would be the most
expensive thing in the simulation, in a codebase whose research frontier is already bounded by
`MAX_CANDIDATE_TARGETS = 16` for cost reasons. The cheap analogue is a bounded neighbourhood —
search the trees reachable in one or two applications from what this mage already holds — which
plausibly buys the divergence without the price. **Whether that is enough to move W15's numbers is
a measurement, not an argument**, and its falsifiable form already exists: prefix fidelity below
0.7, dimensionality above 1, containment below 1.000, and gnome ≠ human.

## 5. Sign inversion is a player-facing operation, and it is already written

*Muto Vim* — transform raw magic — is the sign-inversion cell, authored tier 1 through 5 and
currently a `research-rate` stack:

| tier | node | what it is |
|---|---|---|
| 1 | **Turn the Working** | change a small spell into a different one mid-cast |
| 2 | **Convert the Form** | *"change what a working is about without changing what it does — Ignem to Aquam"* — move along the gradient, keep the verb |
| 3 | **Turn the Incoming** | *"change a hostile working, in flight, into a harmless one of the same size"* — **sign inversion, in combat** |
| 5 | **The Common Root** | *"change any working into any other by way of what the two were before they were told apart"* |

That last gloss is a description of **undifferentiated vis** — the substrate before it has a form.
It was authored before this document existed and it is the strongest evidence the cosmology was
already implicit.

## 6. What this makes buildable that was not

- **Spell materials.** A fifth claimant on `CONSUMPTION_ORDER` — `casting`. Working costs vis, vis
  is finite because it is conserved, and magic is finally priced against the economy instead of
  free. **Where `casting` sits in the priority order decides whether a magical civilization is a
  parasite or a luxury**, and that is the author's call, not a derivation.
- **Combat primitives at world scale.** `scale: "both"` already exists — `concealment` uses it, and
  the code's own reason is that *"a raider who cannot be detected at world scale and a raider who
  cannot be targeted in combat are two different mechanics."* Extend it: `direct-damage` × *Terram*
  in world time is **excavation** — unmaking stone is carving a door. The gate is a fifteen-line
  function; the world-scale consumer is the work.
- **Curses.** The persistent case: an effect with a long `durationTicks` on a named holder, running
  at world scale. `durationTicks` exists on every effect today and is nearly unused outside raids,
  and a curse is where a *negative* magnitude finally has an obvious home.
- **Anti-stone stops being an edge case.** It is *Perdo* doing exactly its job, through a direct
  claim on the stock rather than through a multiplier that scales with headcount.

## 7. What this document does not decide

1. **Where `casting` sits in `CONSUMPTION_ORDER`.** Above subsistence and mages eat the populace's
   food during a research push; below construction and magic stops the moment anything else wants
   materials. One line, and it decides what a magical civilization *is*.
2. **The order ranks themselves.** Fourteen numbers, and they price the whole grid.
3. **Whether conservation is hard or soft.** Hard conservation with life as the only pump is
   elegant and may make an economy that cannot grow fast enough to be a game. The escape hatches
   are territory, worship, and the aura — each of which is an existing mechanic that would become
   load-bearing.
4. **Whether a world-scale `direct-damage` produces or destroys.** Probably the `target` field
   already decides: `universe` produces into your stock, `area`/`side` destroys theirs. That reuses
   a field every effect has rather than adding one.
5. **Whether `nomen` belongs among the material forms.** It yields `vellum: 1024`, which reads as an
   authoring convenience rather than a claim that a true name is a substance. Under a gradient it
   needs a rank, and that forces the question.

## 8. The risk worth stating plainly

This is a large, elegant idea, and elegant substrates have a way of being adopted in prose and
ignored in code — which is precisely the failure `check:consumption` exists to catch, one level up.
**The test of this document is whether the sign rule and the conservation invariants end up in
`load.ts` as diagnostics.** If they do not, it is worldbuilding, and it should be labelled as such.
