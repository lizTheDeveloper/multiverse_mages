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

### The naive form of this rule was tested and refuted — by the content itself

**Implemented 2026-08-15 in `load.ts` as the `technique-sign` diagnostic, and the shape it took was
decided by measurement rather than by argument.**

The obvious rule — *"a Perdo node may not carry a positive magnitude"* — fails against shipped
content in 18 places. Every one is an **engagement** primitive: `direct-damage`, `area-denial`,
`concealment`, `ward`. Those measure a **consequence**, not a flow of vis. Unmaking a scent trail
produces concealment; the concealment is positive because it is what the unmaking *achieved*, and
the operation is still destructive.

So the rule binds where the primitive names a flow, which is **world scale**, and it leaves
engagement alone.

**Intellego is deliberately unconstrained, and that is Maxwell's demon rather than an exemption.**
19 Intellego nodes carry positive `resource-yield` — *"know how many, of what ages, and which of
them will not see the winter"* — and not one of them creates food. They are information reducing
waste in a process that was already running, so the same labour yields more. Extracting more useful
work from an existing flow is not adding to it, and that is precisely what perception is allowed to
do under conservation. §2's *"reads, moves nothing"* was too strong; this is the correction.

### The rule was obeyed before it existed

Measured over all 300 shipped nodes:

| technique | world-scale effects | signs |
|---|--:|---|
| Creo | 64 | **all positive** |
| Intellego | 72 | all positive |
| Muto | 44 | all positive |
| Rego | 40 | all positive |
| **Perdo** | **1** | **negative** |

No Perdo node has ever carried a positive `resource-yield`. **Nothing enforced any of that.** The
authors were following the cosmology before it was written down, which is the strongest available
evidence that this was discovered rather than invented — and it is why the check landed with zero
content churn.

It could not have been violated earlier, either: before signed magnitudes every magnitude had to be
positive, and a positive Perdo world effect is incoherent, so authors simply never wrote one. **Signed
magnitudes is what admitted Perdo to the world economy at all**, and the single Perdo world-scale
effect in the game is the `teach-rate: -192` on `pn-the-nameless`.

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

## 7. Decisions taken, and how to overturn them

**The author was offered these and had no strong preference, so they are taken here with reasoning
and with the measurement that would reverse each.** None is expensive to change; all are recorded so
that changing one is a deliberate diff rather than a drift.

### 7.1 `casting` goes after `subsistence` and before `libraryUpkeep`

`CONSUMPTION_ORDER` is a priority: earlier claimants are paid first. The three candidate positions
are not equally interesting.

- **First** — mages eat before the populace. A research push starves the country, which is dramatic
  and is a death spiral rather than a tradeoff.
- **Last** — magic happens only from surplus. It never binds, and the failure is silent: casting
  quietly stops in exactly the situations a player would want to know about.
- **Second** — **taken.** Magic competes with the **library**, not with bread.

A civilization that casts hard lets its books rot. That is the opposing term aimed at the loop this
game is actually about — §5's knowledge that has a location and can be lost — rather than at the
food supply, which every strategy game already prices. It also gives `libraryUpkeep` a rival, which
it has never had.

**Overturn it if:** a sweep shows library depth collapsing in the median run rather than in the
aggressive one. That is casting outcompeting preservation everywhere instead of only where a player
chose it.

### 7.2 The fourteen order ranks are derived from dispersal, not authored

Ranking fourteen forms by hand is fourteen balance decisions with no argument behind them. Derive
instead: **a form's rank is how strongly it resists dispersal.** Terram holds its shape; Ignem is
the canonical disordered state; Aquam and Auram flow and diffuse between them. Living forms —
Corpus, Animal, Herbam — sit high because a living thing maintains order against the gradient, which
is §3's pump seen from the other side.

Transformation *down* the gradient releases vis and *up* costs it, so `Creo Terram` is expensive for
a reason a physicist would recognise rather than because someone tuned it.

Every rank ships `tuningStatus: "untuned"`, like every other magnitude before 0.5.0.

**Overturn it if:** the ranks make one column of the grid strictly dominant. The derivation is a
starting position, not a claim to have got the numbers right.

### 7.3 Conservation is hard, and the pump is the tunable part

Soft conservation is the safe choice and it is the wrong one: if vis can be created outside the
pump, *conserved* means nothing, the substrate stops constraining anything, and it becomes exactly
the decoration §8 warns about. A law with an exception per convenience is not a law.

So: **hard.** The only source of new vis is §3's pump — life descending the entropy gradient
locally. That makes populace, buildings, libraries and worship the *generators* of magic rather than
its beneficiaries, which is the claim worth testing.

**Overturn it if** — and this is the real risk, stated as a measurement rather than a worry — **a
universe's total vis fails to grow over a 2,400-tick run.** Hard conservation with too weak a pump
produces a civilization that cannot get richer, and this is a game about civilizations getting
richer. The fix is then to strengthen the pump, not to soften the law, because the pump is the
mechanic and the law is the substrate.

### 7.4 Two smaller ones, taken the same way

- **A world-scale `direct-damage` produces or destroys according to its `target`.** `universe`
  produces into your own stock — unmaking stone is carving a door. `area` and `side` destroy
  someone else's. That reuses a field every effect already carries rather than adding one.
- **`nomen` stays among the material forms.** It yields `vellum: 1024` today, which reads as an
  authoring convenience, and under a gradient it needs a rank. Taken as: a true name *is* a
  substance in this cosmology — that is what makes True Naming's theft mechanic coherent — so it
  ranks high and keeps its yield.

## 8. The risk worth stating plainly

This is a large, elegant idea, and elegant substrates have a way of being adopted in prose and
ignored in code — which is precisely the failure `check:consumption` exists to catch, one level up.
**The test of this document is whether the sign rule and the conservation invariants end up in
`load.ts` as diagnostics.** If they do not, it is worldbuilding, and it should be labelled as such.

**Status of that test, 2026-08-15: half passed.**

- **The sign rule is in `load.ts`** as the `technique-sign` diagnostic, with six tests in
  `packages/content/test/unit/technique-sign.test.ts` — two refusals, three permissions that pin the
  rule's *shape* so it cannot be tightened back into the naive form the content refuted, and one
  sweep over all 300 shipped nodes. It landed with zero content churn, for the reason §2 records.
- **The conservation invariants are not**, and are not claimed. *Muto* summing to zero across kinds
  and *Rego* across holders needs the direct-stock channel — the `casting` claimant of §7.1 — which
  does not exist yet. Until it does there is nothing for a conservation check to sum over, and
  writing one against an absent mechanism would be the decoration this section warns about.

So: one half is a mechanic and one half is still prose, and this document should be read that way.
