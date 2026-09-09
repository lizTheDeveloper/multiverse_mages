<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The magic system, projected

*Status: projection, drafted 2026-08-12 for W30. `docs/design/vision.md` remains the vision of
record. Nothing here is decided. This document takes each rule of the magic system completely
seriously and extrapolates what follows from it, the way a hard-SF author extrapolates a
technology — and then tries to pay for each extrapolation in a mechanic that already exists.*

---

## 0. How to read this

Two marks, applied on every claim:

- **`[V §n]`** — already stated in `vision.md`, or in `contracts.md`, `invariants.md`,
  `sound-design.md`, or the campaign's measurement documents, at the section given. Not a new
  claim. Cited so a reader can check that the projection is standing on the vision rather than
  beside it.
- **`[P]`** — a projection. New, undecided, and rejectable on its own without taking anything else
  down with it. Where a `[P]` depends on another `[P]`, it says so.

Every chain in this document is required to terminate on one of: a primitive id from
`packages/content/data/primitive.json`, a field of `species.json` or `territory.json`, a function
in the built tree, or a metric in `contracts.md` §7's registry. A consequence that ends in an
adjective is atmosphere and has been cut.

**The register this is written in.** Not *"body magic is unsettling"* — **what does the census look
like in year eighty.** The question asked of every switch is: *a universe where this is permitted,
and mages are numerous and autonomous, and the god cannot command any of them — what is that place
actually like, and what follows mechanically?*

---

## 1. Permitting is currently a purchase. It should be a commitment.

### 1.1 The arithmetic

All nineteen primary switches, flipped once each:

```
5 techniques × 8192  =  40,960
14 forms     × 4096  =  57,344
                        ------
                        98,304 favor
```

Against a measured run income of **6,531,264** favor over 2,400 world ticks — **1.51%**
[`campaign-plan.md`, closing section; prices confirmed in `packages/content/data/god-cost.json`].
The whole ruleset costs a week and a half of a two-hundred-year income, and `permit-then-idle` — a
probe that presses permit buttons for 140 ticks and then submits an empty preference list for the
remaining 2,260 — ascends **40/40**, against 38/40 for the strategy that also funds universities,
blesses mages and encourages research [`integration-round-2-results.md`].

The obvious reading is that the price is too low. It is the wrong reading, or at least the shallow
one. Raise the price tenfold and `permit-then-idle` buys the grid by tick 1,400 instead of tick 140
and still wins, because the thing it buys is unconditionally good and the favor it spends has
nowhere else to go — W9 measured **9.1–12.4M favor discarded per run** at the pool cap. A currency
you cannot spend down is not a price.

### 1.2 The asymmetry, which is the actual defect

`packages/content/src/god.ts:191–206` enforces, at content load, that permitting costs *exactly*
what forbidding costs, on both axes, with this reason attached:

> vision pillar 1 rests on the permit/forbid decision being symmetric, and a price asymmetry
> converts denial from a peer strategy into a penalty

The favor price is symmetric by enforced invariant. **The total price is not.** Two mechanisms
attach real cost to an axis flip, and both fire only on forbidding:

1. **The worship shock.** `packages/coordination/src/god/interventions.ts:390–393`:
   ```ts
   const stranded = permitting
     ? { inert: 0, known: 0 }
     : strandedByAxis(state, universe, axisKind, bit, deps);
   ```
   Forbidding an axis the civilization was built on approximately halves worship for two years.
   Permitting is exempt by construction.
2. **The decay floor.** `packages/rules-magic/src/instances/decay.ts:74–77` — a dormant instance
   loses its mastery floor and decays all the way to destruction, and re-permitting stops further
   loss without restoring what was lost. That file's own comment calls this *"the whole mechanism
   by which forbidding a cell actually costs a civilization something."*

Read those two sentences together. There is an explicit, carefully built, documented mechanism for
*"forbidding costs a civilization something"* and **no counterpart whatsoever for permitting.**
Vision §3 says *"prohibiting something is a real strategic option, not a penalty."* In the built
tree it is a penalty, and it is the only priced side of a decision the loader goes out of its way to
keep symmetric. `permit-then-idle` is not exploiting a mispriced button; it is playing the only side
of the decision that has consequences, and taking none of them.

### 1.3 What a commitment would be

The god cannot command a mage [V §7]. So a permit cannot be made costly by ordering anyone to
behave differently — that would be the god issuing an order by another name. What a permit *can*
change is the option set the civilization's autonomous machinery runs over, and there are exactly
six of those, all of which exist in the built tree today. Call them the **six currencies a permit
is paid in**:

| Currency | What it is | Where it lives |
|---|---|---|
| **Attention** | Scholar-years are finite. Permitting adds candidates to every mage's queue and you cannot tell them not to look. | `autonomy-weight.json`'s six-term target score; `research-rate` |
| **Composition** | The populace has five occupations allocated by demand. Some magics want a differently-shaped people. | `computeOccupationDemand`, `reallocateOccupations` |
| **Custody** | Where knowledge can live, and how long it survives there. | the four `LOCATION_KIND` values; `knowledgeHalfLife`, `libraryDependence` |
| **Substrate** | Materials, subsistence, and a carrying capacity derived from land that nothing in a run creates. | `carrying-capacity.ts`; `resource-yield`, `build-rate` |
| **Legitimacy** | Worship comes from mages, universities **and populace** [V §7] — and there are two hundred laypeople per mage. | `worship-yield`; the `UPHEAVAL` machinery |
| **Exposure** | [V §3] What you permit, your invader casts, in your sky. | `rules-raid/src/arbitration.ts:422` |

Every projection below is required to name which currency it spends. A projection that spends none
of the six is atmosphere.

### 1.4 The precondition nobody can dodge

**None of this binds while the reachable set is exhaustible.** `value-sensitive-acquirer.md`:
*"Every unrestricted strategy still ends holding all 51 reachable v1 nodes… When the endpoint is
the whole reachable set there is no composition to choose."* Attention is not a currency in a
universe that can afford everything. This document is therefore the *content* of that document's
forced step 4 — what the tradeoffs should be once there are tradeoffs — and not a competing
proposal. **[V] Order is forced: content first, commitments second.**

### 1.5 What the v1 subset actually is, and why it changes the reading of everything below

[V §4] promises *"a playable subset of the grid — 3 techniques × 4 forms — against a schema built
for all 70 cells."* The subset that shipped is a **strict rectangle**, enforced by
`checkV1Subset()` at content load:

> **{ Intellego · Perdo · Rego } × { Mentem · Terram · Limen · Nomen }**

Twelve cells, holding **51 of the grid's 300 authored nodes**. Three facts follow, and each one
matters more than it looks:

1. **Creo and Muto are dark, and so is Corpus.** The two techniques this projection is most often
   asked about, and the form the brief names first, are all outside v1. The exclusion is recorded
   and reasoned in `packages/rules-magic/src/effects/coverage.ts:59–70`: `lifespan` and `fertility`
   are *"Corpus- and Animal-bound; including `corpus` in the v1 form set would have cost either
   Nomen — stranding True Naming with no form to bite on — or Terram."* That is a good reason and
   it has a consequence nobody has stated.
2. **Nothing in the v1 grid makes anything.** Every one of the twelve cells perceives, unmakes, or
   controls. There is no creation and no transformation anywhere in the shipped subset. **[P] Three
   of the six currencies in §1.3 — Composition, Substrate, and most of Legitimacy — have no cell to
   bite on**, because the switches that would change what a civilization *is* are exactly the ones
   that are dark. A universe whose only verbs are *perceive, destroy, control* cannot become
   different from another such universe in any way except how much of it there is. That is the
   measured result [`strategy-dimensionality.md`: containment 1.000, one principal component
   carrying 91.4% of variance] restated as a fact about the content rather than about the acquirer.
   The node census says the same thing: across the 51 v1 nodes the most-authored primitive is
   `direct-damage` at **11**, every one of those in a Perdo cell, and `lifespan` and `fertility`
   appear **zero** times.
3. **The rectangle makes permitting cheaper than the headline number.** All twelve v1 cells open on
   **seven** switches, not nineteen: `3 × 8192 + 4 × 4096 = 40,960` favor, **0.63%** of a run's
   income. The other twelve switches buy nodes outside the v1 subset, which is why
   `permissive-breadth` reaches 217 nodes against the 51-node plateau everything else settles on.

**So this document is doing two jobs at once**, and they should not be confused. §§2–4 project the
whole grid, including the Creo and Muto rows the author asked about, which do not currently exist
in play. §5's commitment table covers all nineteen switches for the same reason — the table is a
statement about the design, not a work order against the build. Each of the five mechanics in §6
therefore carries a **Subset** line saying whether it can be built and measured against the twelve
cells that exist today. Two can, in full; two partly; one cannot without widening the subset.

---

## 2. The five techniques

### 2.1 Creo — the surplus you did not plan for

**A Creo universe is one where making things stops being work.**

1. Anything Creo makes is something a laborer used to make. `resource-yield` is *"multiplier on
   materials per world tick"* with a cap of `fp(4096)` — **4×** [V primitive.json]. A Creo
   civilization at that cap gets the material output of four populations from one.
2. → **Therefore the laborer stops being the marginal producer.** `computeOccupationDemand` derives
   laborers from `constructionBacklog × LABORERS_PER_BUILD_UNIT` and scribes from queue depth; it
   does not derive them from need, so the demand does not fall — but the *value* of meeting it
   does. `idle` is the residual, and `idle` is explicitly *"not economically productive"* while
   still drawing subsistence. **[P] A Creo universe's characteristic pathology is a fed, idle,
   growing majority.** Currency: **Composition**.
3. → **Therefore Creo runs straight into the wall that `carrying-capacity.ts` was rebuilt to put
   there.** Materials enter `K` as a *bounded multiplier* on a territory base, deliberately, because
   the previous unbounded form reached `K = 289,997` and still accelerating. Creo can quadruple
   materials and move `K` by the width of one capped modulator. **Creo's ceiling is its land.**
4. → **And Creo cannot make land.** [V §7a] world-scale entities carry no coordinates, and §2.7
   makes territory *"the fixed resource, and that is its entire job… nothing a universe does during
   a run creates land."* So *Creo Terram* must not create `landUnits`, and a content author will
   try to author exactly that on their first attempt. **[P] The one technique with no natural limit
   is bounded by the one quantity the simulation refuses to represent spatially.** That is a real
   hard-SF shape: the limit is not moral, it is cadastral.

**What permitting Creo commits you to:** a population larger than its purpose, pressed against a
ceiling you cannot raise by playing well.

### 2.2 Intellego — the universe that can be read

**An Intellego universe is one where nothing is private, starting with itself.**

1. Intellego's only product is information, and in this game information has a location [V §5]. So
   an Intellego civilization *writes*: `scribe-rate`, `SCRIBES_PER_QUEUED_GRIMOIRE = 2`, and the
   measured pathology that the reference run's shelf holds **two distinct nodes across 1,263
   books** because the scribable list is ordered by cost [V §13]. Currency: **Custody**.
2. → **Therefore the archive becomes the civilization's centre of gravity, and its single point of
   failure.** [V §6a] *"burning a rival's library is not just a loss of stored spells, it is an
   attack on their rate of future production."* An Intellego universe is one that can be ended in a
   night, and `libraryDependence` is the metric that would say so.
3. → **Therefore Intellego cannot be permitted defensively.** [V §5] `knowledge-steal` is
   concentrated in *Intellego Mentem*; [V §3] the host ruleset governs, so permitting Intellego
   arms every raider standing in your sky with the reading of your mages' minds. Currency:
   **Exposure**. This is the purest instance of §3's rule in the whole grid: Intellego's value at
   home is almost entirely the enemy's value at your home.
4. → **Third order: an Intellego universe stops teaching.** Teaching is mind→mind, requires a living
   teacher and a student who already holds the prerequisites, and is gated by `permits()` at
   `teaching.ts:154`. Reading a mind is none of those things. **[P] Where perception substitutes for
   pedagogy, the teaching graph thins, and the teaching graph is what [V §5] calls the thing that
   makes a civilization feel mortal.** A universe with high node counts and no lessons has an
   archmage generation with no successors, and `knowledgeHalfLife` is the metric — *which does not
   currently have an instrument* [`integration-round-2-results.md`: "instrument absent"].
   The tell would be `teach-rate` bonuses accumulating on a civilization that runs no lessons:
   five v1 nodes carry the primitive (three in *Rego Mentem*, two in *Intellego Mentem*) and
   `tradition-sweep.md` already measured an **11× difference in lessons per run between True Naming
   and Vancian that bought zero extra nodes known.** A throughput multiplier on a channel nobody
   uses is the exact shape this projection predicts.

**What permitting Intellego commits you to:** being legible. To yourself, which is useful, and to
whoever comes through the portal, which is not.

### 2.3 Muto — the census in year eighty

*This is the author's own case, and it is the deepest chain in the document.*

1. **Bodies are editable → labour is editable.** A quarryman can be built for quarrying.
   `species.json` carries `laborAffinity` (orc 1536, draconic 512 — a **3×** spread) and
   `mageAptitude` (orc 192, draconic 896 — **4.7×**) as *species constants*. Muto Corpus makes them
   *settings*. Currency: **Composition**.
2. → **Therefore the populace stops being a demographic and becomes capital.** The five occupations
   stop being an allocation of people to jobs and become a *manufacturing* of people for jobs. Two
   meanings change with it:
   - `fertility` — *"multiplier on cohort birth rate"*, cap `fp(3072)` = **3×** — is no longer how
     you get more people. It is how you get more **substrate**.
   - `lifespan` — additive months, cap **+50% of species base** — becomes an amortization schedule
     on an edit. And `RETIREMENT_NORMALIZED_AGE = fp(768)` is stated in *normalized* age
     (`occupations.ts`), so extending a life extends the *working* life proportionally. A body you
     paid to modify works three-quarters of however long you make it last.
   Both of those primitives are **declared exclusions from the coverage check today — authored and
   never exercised.** Muto Corpus is the cell that would exercise them.
3. → **Therefore species distinctions blur, and the six-species table starts describing starting
   conditions rather than kinds.** This is checkable and it is checkable *against an invariant*:
   **INV-23 requires that species stay measurably distinct over time**, and it exists specifically
   to guard against *"species converging on each other as later tuning passes average them
   together."* **[P] Muto Corpus permitted is a licensed, player-chosen violation of INV-23** — the
   invariant would fire on a mechanic working exactly as intended. See §7.2; this needs a carve-out
   or the projection is rejected.
4. → **And a universe that can edit bodies can edit them badly.** There is no *Perdo Muto*: the grid
   has one technique per verb, so undoing a transformation means destroying the body (Perdo) or
   transforming it again (Muto). **Error is cumulative and has no inverse operator.** **[P] A Muto
   Corpus civilization therefore accumulates failed lineages — a population fraction that is
   neither its original species nor a working design.** The honest place to put that is *not* a
   sixth occupation — `contracts.md` §1.3 says *"a sixth is a contract change, not a content
   addition"* — but a **species**, because species are already validated data with their own
   `laborAffinity`, `mageAptitude`, `fertility` and `depthCeiling`. A botched lineage is a
   `species.json` row. See §4.5 for the cell that names it.
5. → **And you can be raided by someone who edits yours.** [V §3] Muto permitted at home means Muto
   works for the invader. **[P] Muto Corpus is the only cell in the grid where a raider's objective
   can be your populace rather than your library or your archmage** [V §8 lists the three
   objectives; this would be a fourth]. Currency: **Exposure**.

**What permitting Muto commits you to:** your species table becoming a starting condition, and an
error channel with no undo.

### 2.4 Perdo — the only technique that makes knowledge mortal

1. **Perdo is the only technique whose product is negative.** Everything else adds an instance, a
   building, a person. Perdo removes. It therefore has no economy: a Perdo-heavy library is a
   library of weapons, and `scribe-rate` applied to it produces stockpile, not capital. [V §6a]'s
   compounding loop — deep library → better mages → deeper library — does not close over Perdo.
2. → **Therefore a Perdo universe's mages have nothing to do in peacetime except get better at it,
   and mage autonomy means they will.** `autonomy-weight.json` carries a `role × primitive` appeal
   table, and `contracts.md` §2.11 requires `target-bound-role` to be *strictly below the sum of the
   other five term bounds* so that *"any combination of effort, affinity, species, age and
   personality can outvote any role."* That is the pillar stated as arithmetic — and it means
   permitting Perdo raises the appeal of destructive work for **every** role, not just raiders,
   because the role term is by construction the weakest one. Currency: **Attention**.
3. → **Third order, and this is the one worth the whole section: Perdo is the mechanism by which a
   universe forgets.** [V §5] loss is the destruction of the last instance; `hard-magic.md`
   measured *"nothing is ever the last copy"* at roughly **55 redundant copies per node**, and named
   *"the loss channel must be able to reach a last copy"* as forced step 2 of three. **[P]
   Permitting Perdo is what makes the loss channel reachable at all.** So Perdo's commitment cost is
   negative in the near term and it is simultaneously the only switch that makes [V pillar 2] —
   *"knowledge is physical… this is what makes a civilization feel mortal"* — true rather than
   aspirational. That is a genuine reason to permit it and a genuine reason to be afraid of it,
   which is exactly what a switch should feel like.
4. → **And forbidding Perdo makes your archive fireproof.** [V §3 + INV-19] *"Host-ruleset
   arbitration is absolute. A spell whose cell the host universe forbids never resolves there, for
   attacker or defender."* A universe that forbids Perdo cannot have its library unmade by magic —
   **not by a raider, not by an accident, not ever, and it does not need to defend it.** **[P] This
   is the strongest denial play in the game and it has never been measured**, because portals are
   permanently masked in single-universe sweeps [`probable-strategies.md`]. See §6.5.

**What permitting Perdo commits you to:** knowledge that can actually be lost — yours included, by
your own mages, at home, before anybody raids you.

### 2.5 Rego — the god who permitted generals

1. **Rego neither creates nor destroys; it directs.** Its outputs are `build-rate`, `teach-rate`,
   `ward`, `blink` and `portal` — the infrastructure technique, and the one that shares a language
   with the player's own interventions [`sound-design.md` §4.1: *"control is what the god does
   too"*]. Note what that list is: three world-scale multipliers and two raid-scale movements, and
   nothing that produces a thing. **[P] Rego is the technique whose entire output is rate.** A Rego
   universe does everything faster and invents nothing, which is why it pairs so badly with the
   ascension paths and so well with everything else.
2. → **Rego is the only technique that acts on people as agents.** *Rego Mentem* is enchantment,
   *Rego Corpus* is puppetry, *Rego Nomen* is [V §4] *"naming as compulsion."* **[P] A god who
   cannot command a mage has, by permitting Rego, permitted mages to command everyone else.** [V §7]
   *"You are a god, not a general."* Rego Mentem permitted creates generals — 88 of them, over
   18,713 people [V §13]. Currency: **Legitimacy**.
3. → **Therefore a Rego universe hits its occupation targets.** `reallocateOccupations` already
   returns `unmetDemand` per occupation; a compelled populace has less of it. This is a large,
   real, immediate economic benefit and it is *measurable with an existing return value*.
4. → **Third order: a compelled populace is not a worshipping one.** [V §7] worship is *"the number
   and devotion of mages, universities, and populace revering you."* Compliance and devotion are
   different quantities, and worship reads the second. **[P] Rego Mentem buys labour and spends
   legitimacy** — and W16 measured the populace worship term at **94.8% of its cap**, meaning today
   there is nothing there to spend. See §6.1.
5. → **And Rego holds the door.** [V §8] *"Entry requires Rego Limen — the portal cell — and
   favor."* Forbidding Rego forbids the portal, which forbids raiding. Whether it also forbids being
   *raided* is undecided and decides an entire archetype — see §7.4, which is the most valuable open
   question in this document.

**What permitting Rego commits you to:** an authority structure between your mages and your people
that you did not create and cannot revoke by fiat.

---

## 3. The forms that carry weight

Depth here is deliberately uneven. Corpus, Mentem, Nomen and Limen are where knowledge-location and
the portal rule interact and they get the space; Terram, Herbam, Animal and Ignem are tighter. The
remaining six appear in the commitment table (§5) with one consequence each, which is what they
currently earn.

### 3.1 Corpus — and the discovery that the same permit is worth 25× more to some universes

Corpus is the form the author named, and most of it is projected under Muto (§2.3). Three things
belong to the form rather than the technique:

1. **`Creo Corpus` is the cell that would activate `lifespan`,** which is authored and inert. The
   cap is *"fraction-of-species-base, 512"* — **+50%**. Now read that against `species.json`:

   | Species | Base months | At the cap | Months gained |
   |---|---:|---:|---:|
   | Orc | 720 | 1,080 | **+360** |
   | Human | 960 | 1,440 | **+480** |
   | Dwarf | 3,000 | 4,500 | **+1,500** |
   | Elf | 8,400 | 12,600 | **+4,200** |
   | Draconic | 18,000 | 27,000 | **+9,000** |

   **[P] The same switch is worth twenty-five times more to a draconic universe than to an orcish
   one, and nobody has ever said so.** Because the cap is a *fraction of species base* rather than a
   flat month count, life-extension magic is a rich-get-richer permit — and it compounds with
   `depthCeiling` (draconic 7, orc 3), because the tier a mage can reach is worthless if she dies
   before reaching it. Currency: **Composition**. See §6.3.
2. **`Perdo Corpus` makes raids demographic rather than institutional.** [V §8] the three attacker
   objectives are a library, a university, an archmage — all singular, all institutional. Perdo
   Corpus is the cell that puts the *cohorts* in range, and cohorts are where `fertility` and `K`
   live. Currency: **Exposure**.
3. **Fertility magic is worth nothing in the wrong country.** `fertility`'s cap is 3×; `K` is
   territory-derived and capped; and `capacityPerLandUnit` spans **80×**, from `highland-waste` at
   512 to `river-delta` at 40,960. **[P] A river-delta universe should permit fertility magic. A
   highland-waste universe should permit lifespan magic instead, because it cannot feed more people
   but it can keep the ones it has.** That is regime differentiation that costs nothing to author —
   both numbers are already in content and the arithmetic already runs. See §6.3.

### 3.2 Mentem — the form that addresses the storage layer

**Mentem is the only form whose object is a location.** [V §5] a knowledge instance lives at
`mind:<mageId>`, `grimoire:<itemId>`, `library:<universityId>` or `palace:<mageId>`. Every other
form acts on things in the world. Mentem acts on where the game keeps its state. It is also the only
form with **no reverb** in the audio design — *"it sounds like it is happening inside the listener's
head rather than in the world, which is where it is happening"* [`sound-design.md` §4.2].

1. Permitting Mentem makes minds a **public medium**. Currency: **Custody**.
2. → **Therefore redundancy stops being protection.** 55 copies of a node in 55 minds is 55 doors,
   not 55 backups. Currency: **Exposure**.
3. → **Therefore writing things down becomes defensive, which inverts what `libraryDependence`
   measures.** A book can be burned but it cannot be interrogated; a mage can be read. **[P] In a
   Mentem universe the library is the *safe* place, and high `libraryDependence` is a strength
   rather than a fragility.** The metric's sign flips with the ruleset, which means the metric is
   currently measuring a thing whose meaning is not constant — worth knowing before a baseline is
   committed against it.
4. → **Fourth order, and it is a live danger to the only tradition that works:** [V §5] the memory
   palace is *"unburnable, unlootable, un-loanable, and utterly lost when its holder dies."*
   `tradition-sweep.md` found Art of Memory is **the only tradition that produces a different
   game** — *"the split runs between `store` hooks rather than `acquire` hooks."* §5's word is
   *"unstealable by looting."* **Mind-reading is not looting.** If *Intellego Mentem* reaches a
   palace, the single differentiated tradition in the game loses its identity to one permit. See
   §7.3.

### 3.3 Nomen — where knowing and controlling are the same operation

**Nomen collapses the distinction between the knowledge and the spell.** [V §4a] under True Naming
*"the knowledge instance **is** a name, and holding a thing's name grants power over the named
thing."* It is the only form using human vocal formants — *"naming is speech"* [`sound-design.md`
§4.2] — and the only one where possessing an instance is itself the effect.

1. Therefore `knowledge-steal` against a Nomen universe is not theft of capability but theft of
   **sovereignty**: the name of a mage, of a university, of a species. [V §5] *"A True Naming
   universe makes this far more dangerous in both directions."* Currency: **Exposure**.
2. → **Therefore a written record is a list of vulnerabilities.** A Nomen universe should not
   scribe. Currency: **Custody**.
3. → **And that puts Nomen in direct opposition to its own win condition.** W6's *canon* ascension
   predicate requires written records. `integration-round-2-results.md` already found this exact
   shape once, by a different route: *"the canon predicates require written records that Art of
   Memory's `store` hook can't produce — a W6×W13 interaction neither branch could have seen."*
   **[P] Nomen permitted plus the canon path is a universe that must write down the thing that
   destroys it when written.** Both halves already exist. This is the cheapest genuine strategic
   dilemma available in the current tree and it requires no new mechanism, only the decision that
   names are instances.
4. Draconic carries `nomen: 1280` — few, ancient, long-named, and the species with the most to lose
   from being named.

### 3.4 Limen — the only switch that is a foreign policy

Every other switch changes what happens inside. **Limen changes whether there is an outside.**
`Rego Limen` is the portal cell [V §8], and in audio it is *"a gated snap plus an abrupt room
change… no travel, no whoosh"* [`sound-design.md` §4.3].

1. Forbidding Limen forbids opening a portal. That is settled: `portalPlan`
   (`interventions.ts:913`) requires a living mage holding a **permitted** node carrying the
   `portal` primitive.
2. → **Whether it also forbids a portal opening *into* you is not settled, and it decides a whole
   archetype.** See §7.4. If the host's ruleset gates the arrival, then **[P] forbidding Limen is
   total isolation**, and it is a player-chosen answer to the problem [V §8] names as *"a live-PvP
   death sentence dressed as a strategic cost"* — it drives `inboundRaidTempoLoss` to zero by
   decision rather than by tuning. Currency: **Exposure**, spent to zero.
3. → **Third order: the hermit kingdom has exactly one available ending.** A sealed universe cannot
   take a library by conquest and cannot lose one, so [V §8a] leaves it the endurance and canon
   paths or stagnation. And prestige carries forward. **[P] A sealed run is a slow, safe prestige
   farm, and "safe and slow" beats "risky and fast" in every immature meta** — which is precisely
   the runaway [V §8a] demands be tested adversarially.

### 3.5 Terram — the switch that raises the mage ceiling

[V §7a] forbids world coordinates, so Terram cannot be about ground. What it lands on is
`build-rate`, `resource-yield`, and buildings.

1. [V §13] the reference run's mage roster — **88 living mages, peak 91** — is bounded not by magic
   and not by mortality but by **student seats**: the founding academy has 64, the occupation
   controller fills them to exactly 64 from world year thirty, and `computeOccupationDemand` sets
   student demand equal to `universityCapacity` outright.
2. → **Therefore [P] *Rego Terram* is the only magic in the grid that raises the mage population**,
   because it is the only one that shortens `constructionBacklog` and therefore adds seats. Every
   other permit changes what mages can do; this one changes how many there are. Currency:
   **Substrate**.
3. → **Third order: the Terram civilization is over-built and under-fed.** More seats → more
   students (who consume without producing materials) → more grimoires → more materials drawn →
   subsistence shortfall → `K` falls. This is measured, not projected: with the shortfall share
   wired, the reference run's `K` falls from **57,205 to 29,831** across two centuries while
   population rises to 18,722 [`contracts.md` §2.7].
4. Dwarves carry `terram: 1536` and `scribeAffinity: 1792`. **[P] A dwarf-founded Terram universe is
   the archivist civilization** — it builds and it writes — **and it is therefore the universe with
   the most to lose to Perdo and Ignem.** The two switches interact through the species table
   without either knowing about the other.

*Every link in that chain is correct ~~and none of them is wired: `advanceConstruction` has no
caller and construction is passed a hardcoded zero materials claim~~ — **corrected 2026-08-15 at
`08ca5368`: every link is also connected.** `advanceConstruction` is called at `world-step.ts:1302`
and construction claims `construction.stoneOwed` at `:1011`. See §7.5a — this is still the largest
projected payoff in the document, and it is now a magnitude question rather than a wiring one.*

### 3.6 Herbam — the quiet permit, and what it proves

Herbam is agriculture, and agriculture in this simulation is `carrying-capacity.ts`'s subsistence
term. **[P] Herbam is the switch that does nothing visible and raises the population ceiling** —
the only one whose payoff is entirely in a denominator.

Its second consequence is a finding rather than a fantasy: more people should mean more worship [V
§7], but W16 measured the populace term at **94.8% of its cap**, where *"absorbing an entire rival
civilization adds +0.76%."* **Herbam is the switch that proves the worship formula is saturated**,
because it is the one whose only conceivable benefit runs through the saturated term.

Elves carry `herbam: 1536` and `fertility: 256`. **[P] An elven Herbam universe farms brilliantly
and does not reproduce** — the clearest single case that a permit's value is a function of who
holds it.

### 3.7 Animal — the cheapest permit in the game, and that is a content problem

Animal's primitives are `summon` (capped at **8 per side**, engagement scale) and food. It has
almost no world-scale reading at all. **[P] A universe that permits Animal alone acquires a raid
capability and no civilization change whatsoever**, which makes it the switch with the lowest
commitment cost in the grid.

That is worth stating plainly rather than inventing a cost for it: **not every switch should carry
the same weight, and Animal is honestly light.** Its one deep consequence is borrowed — *Muto
Animal* beside *Muto Corpus* is where [V §6]'s boundary between populace and livestock becomes a
policy rather than a fact, and where *"a quarryman can be built for quarrying"* stops being a
metaphor. See §4.1.

### 3.8 Ignem — fire, and what fire is for in a game about books

The obvious reading of Ignem is `direct-damage`. The consequential one is that **fire is how
grimoires and libraries stop existing.**

1. **[P] Ignem and Perdo are the two switches that make an archive mortal, by different routes** —
   Perdo unmakes the instance, Ignem burns the object it lives in.
2. → [V §3 + INV-19] permitting either arms every raider in your sky to do it. **Forbid both and
   your archive cannot be destroyed by magic at all.** That is the *Sealed Archive* regime, and its
   price is that it cannot field a raid worth running. See §6.5.
3. Draconic `ignem: 1792`, dwarf `ignem: 1152`, dwarf `scribeAffinity: 1792`. `hard-magic.md`'s
   forced step 3 is *"grimoire durability by species — dwarven grimoires resist destruction."*
   **[P] Dwarven books are the counter to Ignem, and that is a species trait rather than a ruleset
   one — the one case where the answer to a permit is demographic.**

---

## 4. The pairs that are more than the sum

[`sound-design.md` §4.3] already does this for audio — *Perdo Fatum* is *"a pre-echo of a
subtraction: you hear the absence before the thing is gone."* These are the mechanical counterparts.

### 4.1 Muto Corpus + Muto Animal — the boundary becomes a setting

Separately: edit people, edit beasts. Together: **the line between a populace cohort and livestock
is a policy.** `contracts.md` §1.3 already models the populace as *"a counted cohort"* with an
`occupation` and a `count` — the same shape a herd would take. **[P] The emergent thing is that
`laborAffinity` becomes a *purchase decision* rather than a species fact,** and the demand-driven
reallocation in `reallocation.ts` starts pulling from a supply someone manufactured.

### 4.2 Muto Corpus + Creo Corpus — people as durable goods

Edit a body; then extend it by up to +50% of species base. `RETIREMENT_NORMALIZED_AGE` is
normalized, so the added years are *working* years. **[P] The emergent thing is amortization: an
edit that is not worth making to a 60-year orc is worth making to a 700-year elf, and the same
two permits produce a completely different census depending on the founding species.** Year eighty
in a human Muto+Creo universe has more people; year eighty in an elven one has *the same people,
modified twice.*

### 4.3 Intellego Mentem + The Art of Memory — the tradition-killer

Covered at §3.2.4. The pair is emergent because neither half is dangerous alone: Intellego Mentem
against a grimoire universe steals what could be stolen by looting anyway, and the Art of Memory
against every other form is invulnerable. Together they decide whether the game's only
differentiated tradition has a mechanical identity. `metis-knowledge`'s own design document already
asks *"whether mind-reading theft is too easy a workaround for succession pressure."*

### 4.4 Perdo Fatum — the only way to make a loss permanent

Perdo removes. Fatum is the form that *"arrives before it happens"* — the only form whose effect
precedes its cause [`sound-design.md` §4.2]. The honest mechanical reading of a pre-emptive
subtraction is not damage. It is **removal from the ever-known record**.

[V §5] rediscovery is *"re-deriving a lost node from prerequisites, at a cost far above learning it
from a teacher"* — INV-17 pins that at **≥3×**, and `godState` already carries `lastEverKnown`.
**[P] Perdo Fatum removes a node from the ever-known set, so it cannot be rediscovered at 3× — it
must be researched from nothing, as though the universe had never held it.** Perdo makes things
lost; Fatum makes them un-findable. That is strictly more than the sum, and it is the only operation
in the projected grid that produces an *irreversible* civilizational loss.

Gnomes carry `rediscoveryAffinity: 1792` — the species built to recover from loss is the species
this cell is built to defeat.

### 4.5 Creo Nomen — how a botched lineage becomes a species

[`sound-design.md` §4.3] says of this cell: *"Reserve this one; it should be rare enough to be
unsettling."* Mechanically, creating a true name is creating a thing that did not previously exist
*as a kind*.

Chain it to §2.3.4: Muto Corpus edits bodies → the errors have no inverse operator → a population
fraction is neither its original species nor a working design → **Creo Nomen names it, and a named
kind is a `species.json` row with its own `lifespanMonths`, `fertility`, `laborAffinity`,
`mageAptitude` and `depthCeiling`.** That completes the author's own projection with a mechanism
that requires no new state: **[P] the six-species table becomes a starting condition because a
universe can add rows to it.**

INV-23 sits directly across this. See §7.2.

### 4.6 Intellego Limen — seeing who is coming

[V §8]'s griefing surface — *"a player who is raided repeatedly loses world time others are
spending"* — is currently to be solved by bounding inbound raid frequency in `raid-engagement` and
`god-agency`, i.e. by tuning. **[P] *Intellego Limen* is the in-fiction counter: perceiving a
threshold before it opens.** It lands on `inboundRaidTempoLoss`, which is already in the metric
registry with pinned constants. A player-side answer to a griefing problem is worth more than a
tuned bound, because a tuned bound is invisible and this is a decision.

### 4.7 Creo Terram — the pair that must be authored to do nothing

Named here so a content author does not author it. Creo makes; Terram is earth; **land is fixed by
[V §7a], by `territory.json`'s contract, and by the deliberate rebuild of `carrying-capacity.ts`
after `K` reached 289,997 and was still accelerating.** *Creo Terram* must produce **materials** and
**structures**, never `landUnits`. It is the single most natural content mistake in the grid.

### 4.8 Muto Vim — the cell that would edit the rules

Vim is *"the carrier itself, unfiltered — raw synthesis, the audio engine showing through"*
[`sound-design.md` §4.2]. *Muto Vim* is transformation applied to magic itself, and the honest
projection of that is a universe changing how its own primitives stack. **INV-15 forbids exactly
that**: stacking and caps are computed once from the registry, and *"inline magnitude arithmetic in
any capability"* disproves it. **[P] Muto Vim must be authored as counter-magic — altering an
effect in flight at engagement scale — and never as altering the primitive registry.** Recorded as a
trap rather than a proposal.

---

## 5. The commitment table

**This is the deliverable that changes the game.** One row per primary switch. The claim each row
makes is: *permitting this is not free, and here is the account it is charged to.* Every cost is
expressed in something that exists; none of them is favor.

Everything in this table is **[P]** unless a cited section says otherwise. The "Avoided by" column
matters as much as the cost: a commitment with no mitigation is a tax, and a tax is just a price
with extra steps.

### 5.1 The five techniques

| Switch | What permitting commits you to | Currency | Lands on | Avoided by |
|---|---|---|---|---|
| **Creo** | A surplus you did not plan for and a ceiling you cannot raise: material output up to 4× against a `K` derived from land, and an `idle` residual that still eats. | Composition, Substrate | `resource-yield` cap 4096; `carrying-capacity.ts` provisioning term; `OCCUPATION.idle` | Holding territory with a high `capacityPerLandUnit`; permitting Herbam so the surplus has somewhere to go |
| **Intellego** | Being legible — to yourself, usefully, and to anyone standing in your sky, ruinously. Plus a teaching graph that thins as perception substitutes for pedagogy. | Custody, Exposure | `scribe-rate`; `knowledge-steal` [V §5]; `knowledgeHalfLife` | Forbidding Mentem (keeps Intellego's economy, drops its theft cell); the Art of Memory `store` hook |
| **Muto** | Your species table becoming a starting condition, and an error channel with no inverse operator. | Composition | `species.json` all fields; `fertility`, `lifespan` (both inert today) | Interdicting *Muto Corpus* specifically — the canonical use of an edict [V §4] |
| **Perdo** | Knowledge that can genuinely be lost, by your own mages, at home, before anyone raids you. Also the only thing that makes [V pillar 2] true. | Custody, Exposure | last-instance loss [V §5]; INV-17's 3× rediscovery; `direct-damage` | Nothing, and that is the point. Perdo is the switch with no mitigation |
| **Rego** | An authority structure between your 88 mages and your 18,713 people that you did not create and cannot revoke. | Legitimacy | `worship-yield`; `unmetDemand` from `reallocateOccupations` | Interdicting *Rego Mentem* and *Rego Corpus*, keeping *Rego Terram* and *Rego Limen* |

### 5.2 The fourteen forms

| Switch | What permitting commits you to | Currency | Lands on | Avoided by |
|---|---|---|---|---|
| **Animal** | Very little, honestly (§3.7) — a raid capability and no civilizational change. Its weight is borrowed from *Muto Animal* beside *Muto Corpus*. | Exposure | `summon`, cap 8/side | n/a — this is the cheap switch |
| **Aquam** | Concentration. Water magic pays most where water already is, so an Aquam universe's value collects in its highest-`capacityPerLandUnit` territory — which is one raid objective. | Substrate | `resource-yield`; `territory.json` `river-delta` at 40,960 | Territory diversity, which is an endowment rather than a choice |
| **Auram** | Indiscriminacy. Weather is the one effect nobody aims; an Auram universe's yields move for reasons no mage chose. | Substrate | `area-denial`; `resource-yield` | Nothing available — recorded as the weakest projection in the table (§8) |
| **Corpus** | The census. Bodies as editable capital, `lifespan` worth **25× more** to a draconic universe than an orcish one, and `fertility` worth nothing in a highland waste. | Composition | `lifespan` cap +50% of base; `fertility` cap 3×; `capacityPerLandUnit` span 80× | Choosing which of the two primitives your territory can actually use (§6.3) |
| **Herbam** | Almost nothing, visibly. It raises the ceiling and the ceiling's payoff runs through a worship term already at 94.8% of cap. | Substrate | subsistence in `carrying-capacity.ts` | n/a — the quiet switch |
| **Ignem** | An archive that can burn, in your sky, cast by a raider, and INV-19 makes that absolute in both directions. | Exposure | `direct-damage`; grimoire and library destruction | Forbidding it — the Sealed Archive (§6.5); dwarven `scribeAffinity` durability |
| **Imaginem** | **Your own observation.** `concealment` is one of only two primitives with `scale: "both"`, capped at 85%. A universe that permits illusion has a census that is wrong, and the god's institution block is fixed at four slots [V §6]. | Legitimacy, Custody | `concealment` cap 870 | Forbidding it. There is no partial version — concealment does not distinguish friend from god |
| **Mentem** | Minds as a public medium: redundancy becomes attack surface, `libraryDependence` inverts sign, and the memory palace may stop being private (§7.3). | Custody, Exposure | `knowledge-steal`; `LOCATION_KIND` mind and palace | Interdicting *Intellego Mentem* and *Perdo Mentem* — vision's own worked example [V §4] |
| **Terram** | More mages than you planned for, and a `K` that falls while the population rises — measured at 57,205 → 29,831 over two centuries. | Substrate | `build-rate`; `universityCapacity` → student demand; subsistence shortfall | Permitting Herbam alongside; not funding what you cannot feed |
| **Vim** | A ruleset that is arguable inside your own sky. Vim is magic acting on magic, so every other permit becomes contestable rather than settled. | Exposure | `ward` cap 90%; counter-magic | Forbidding it, at the cost of having no answer to anything a raider brings |
| **Umbra** | Knowledge whose location is uncertain. Shadow's audio signature is *tail only* — a thing you never hear directly [`sound-design.md` §4.2] — and the mechanical counterpart is knowledge held without a recorded instance. Adjacent to `metis-knowledge`. | Custody | `concealment`; `LOCATION_KIND` | Forbidding it; the Art of Memory already occupies this space by another route |
| **Fatum** | An editable history. Fatum acts on the record rather than the world, so your own past becomes writable — by you, and by whoever is standing in your sky. | Custody, Exposure | `godState.lastEverKnown`; INV-17's rediscovery multiplier | Forbidding it. §4.4 is the reason this row is the most dangerous in the table |
| **Limen** | Whether there is an outside at all. If arrival is host-gated (§7.4), this switch is the entire foreign policy and the only player-chosen bound on `inboundRaidTempoLoss`. | Exposure | `portal`; `inboundRaidTempoLoss`; `raidInitiationCost` | Forbidding it — total isolation, with stagnation as the likeliest ending |
| **Nomen** | A civilization whose records are a list of its own vulnerabilities, in direct opposition to the canon ascension path that requires records. | Custody, Exposure | `knowledge-steal`; the True Naming `acquire` hook | Choosing the apotheosis ascension path instead; the Art of Memory's `store` hook |

### 5.3 What the table is claiming, in one paragraph

Nineteen switches, six currencies, and **no two switches charged to the same account in the same
proportion**. That is what would make a ruleset a *regime* rather than a shopping list: permitting
everything means paying into all six accounts at once, and the six are not independent — Creo's idle
surplus, Terram's seat expansion and Corpus's fertility all draw on the same territory-bounded `K`,
while Intellego's archive, Ignem's fire and Perdo's unmaking all resolve against the same library.
**A universe that permits everything is a universe with a large, idle, modified, mind-readable
population living on land it has outgrown, holding an archive anyone can burn.** That is a
civilization, and it is a bad one, and today it is the winning strategy.

---

## 6. Five mechanics the projection implies

Each names the primitive it uses and the measurement that would show it working — and states
whether that measurement exists today, because a mechanic whose instrument is absent is a mechanic
nobody can accept or reject.

### 6.1 The two constituencies

**Mechanic.** Worship splits into a mage term and a populace term, and each primary switch carries a
per-constituency sentiment in content — a new `permit-sentiment.json` on the pattern of §2.8/§2.9,
values `fp`, allowed to be negative, `tuningStatus: "untuned"`. Permitting *Muto Corpus* delights 88
mages and alarms 18,713 people. The two terms are summed weighted by count, which means the
populace dominates by two orders of magnitude and the god who permits everything is governing
against his own worshippers.

**Why it is the first one.** It is the direct answer to the negative control. `permit-then-idle`
wins because worship accrues from *existing* rather than from *governing*, and W16 measured the
populace term at 94.8% of cap where absorbing a whole rival civilization adds +0.76%.

**Primitive:** `worship-yield`. **Also touches:** the existing `UPHEAVAL` component, which already
models exactly this shape — a multiplicative, expiring worship shock — and is currently reachable
only by forbidding.

**Measurement:** `worshipSnowball` (**exists**, Gini at ticks 60/120/240/480/1200) and the negative
control itself. **Falsifiable claim:** with sentiment wired, `permit-then-idle` stops winning 40/40.
**Disproved by:** it still does — in which case the magnitudes are too small and the mechanism is
not the problem.

**Subset: mostly.** All seven of the v1 rectangle's switches can carry sentiment, and *Rego Mentem*
already holds the two `worship-yield` nodes in the subset. What is outside is the illustration —
the alarming permits are Corpus-shaped, so the effect will be muted until the subset widens.

### 6.2 The attention budget

**Mechanic.** Permitting adds candidates to every mage's target queue, and scholar-years are finite:
88 mages, bounded by 64 seats [V §13]. A permitted axis the civilization does not specialize in
dilutes rather than adds. This is not a new subsystem — it is `autonomy-weight.json`'s six-term
score doing its job over a candidate set that has become large enough for ordering to matter.

**The precondition is external and already named.** `value-sensitive-acquirer.md`: *"When the
endpoint is the whole reachable set there is no composition to choose, and no ordering of the queue
can change a set that contains everything."* Attention costs nothing while everything is affordable.

**Primitive:** `research-rate`.

**Measurement:** **prefix fidelity** and **participation ratio** from `strategy-dimensionality.md`
(**both exist as instruments, and both have pre-registered thresholds that have already been missed
once**): prefix fidelity must fall below **0.7** (currently 0.909 after W17, from 0.943) and
components-for-80%-variance must reach **≥2** (currently 1). Cross-strategy containment must leave
1.000. **Disproved by:** breadth costing attention and containment staying at 1.000, which would
mean the reachable set is still exhaustible and the cost is nominal.

**Subset: fully.** Nothing here needs a cell that does not exist — it needs the 51 nodes to stop
being affordable in one lifetime.

### 6.3 Territory selects your permits

**Mechanic.** Activate `lifespan` and `fertility` — the two primitives that are *declared exclusions
from the coverage check, authored and never exercised* — and their value becomes territory- and
species-dependent **by arithmetic alone, with no new rule**:

- `fertility` (cap 3×) buys nothing against a `K` derived from `Σ landUnits × capacityPerLandUnit`
  and already falling. In `highland-waste` (512/unit) it is worthless; in `river-delta`
  (40,960/unit, **80×**) it is decisive.
- `lifespan` (cap +50% *of species base*) is worth **+360 months to an orc and +9,000 to a dragon**,
  and `RETIREMENT_NORMALIZED_AGE = fp(768)` makes three-quarters of the gain productive.

**This is the cheapest of the five.** Both primitives are authored; both territory and species
tables are authored; the arithmetic already runs. What is missing is nodes that carry the two
primitives and a reason for a mage to want them.

**Primitives:** `lifespan`, `fertility`. **Measurement:** `timeToTierBySpecies` (**exists**, with
pinned constants) crossed with `foundingSpeciesMask` (**exists**, added by W15) and a territory
arm — the territory arm is **new** and would need pinning per `metric-constants.md`'s discipline.
**Falsifiable claim:** the winning permit set differs by territory. **Disproved by:** the same
permit set winning across all five territory kinds.

**Subset: no.** `lifespan` and `fertility` are Corpus- and Animal-bound and neither form is in the
v1 rectangle — that is exactly why they are the two declared coverage exclusions. This mechanic is
an argument for widening the subset, and `coverage.ts:59–70` already records the trade that
widening would cost: Corpus displaces either Nomen, which strands True Naming with no form to bite
on, or Terram. **[P] The honest resolution is a 3×5 subset rather than a 3×4 one**, at the cost of
one more form's worth of authoring.

### 6.4 The ruleset shapes the populace

**Mechanic.** `computeOccupationDemand` currently takes four inputs — `constructionBacklog`,
`scribingQueueDepth`, `universityCapacity`, `standingSoldierTarget`. Add a fifth: the permitted
ruleset. Permitting Perdo or Ignem raises the standing soldier target because a universe that has
made unmaking lawful garrisons against it; permitting Intellego raises scribes; permitting Terram
raises laborers. `idle` is the residual, so a ruleset that demands nothing produces an idle
majority, and an idle majority is what §6.1 charges to legitimacy.

This is the mechanic that makes the phrase *"what your civilization becomes"* literal: the
occupation census in year eighty is a readout of the ruleset.

**Primitives:** `scribe-rate` and `build-rate` (via met and unmet demand). **Measurement:**
occupation mix by ruleset — `reallocateOccupations` **already returns `movedInto` and
`unmetDemand` per occupation**, so the data exists; there is **no registered metric** over it, and
adding one goes through `metric-constants.md`'s pin-and-digest discipline. **Falsifiable claim:**
two universes with different rulesets and identical territory and species have measurably different
occupation mixes at tick 2400. **Disproved by:** the mixes converging, which would mean demand is
dominated by construction backlog and the ruleset term is decorative.

**Subset: fully.** Perdo, Intellego and Terram are all in the v1 rectangle, so all three demand
shifts are expressible today. ~~One caution: construction demand is derived from a backlog that `advanceConstruction` never
advances (§7.5a), so the laborer term is currently the least trustworthy of the four.~~ **Corrected
2026-08-15 at `08ca5368`:** `advanceConstruction` advances the backlog every tick
(`world-step.ts:1302`), so the laborer term is expressible on the same footing as the other three.

### 6.5 The sealed archive

**Mechanic.** No new code — a *strategy*, made measurable. INV-19: *"Host-ruleset arbitration is
absolute. A spell whose cell the host universe forbids never resolves there, for attacker or
defender. Expected occurrences: zero."* A universe that forbids **Perdo** and **Ignem** therefore
holds an archive that cannot be destroyed by magic, by anyone, ever, including itself. It pays for
that by having nothing to raid with.

This exists in the rules today and has never been played, because portals are permanently masked in
single-universe sweeps [`probable-strategies.md`]. It is the concrete form of [V §3]'s *"prohibiting
something is a real strategic option, not a penalty — it is a denial play"*, and adding it to the
strategy pool is a harness change rather than a rules change.

**Primitive:** `direct-damage` — **the mechanic is its absence.** The only one of the five whose
lever is a primitive that cannot fire.

**Measurement:** `libraryDependence` (**exists**), `knowledgeHalfLife` (**instrument absent** —
`integration-round-2-results.md` records that it needs a node-identity census in
`packages/scenario/src/census.ts`), and `raidLengthDistribution` (**exists**). **Falsifiable
claim:** a sealed-archive strategy shows measurably longer knowledge half-life *and* worse raid
outcomes. **Disproved by:** it showing both better — in which case denial is strictly dominant and
the asymmetry of §1.2 has simply been inverted rather than fixed.

**Subset: partly.** Perdo is in the v1 rectangle and Ignem is not, so today the sealed archive is a
one-switch strategy rather than a two-switch one. That is still enough to run it: forbidding Perdo
removes **11 of the 51 v1 nodes' worth of `direct-damage` and 6 of `area-denial`** from every
raider in your sky, which is the largest single legality decision available in the shipped subset.
It also requires portals to be unmasked, which is a harness prerequisite rather than a rules one.

---

## 7. Contradictions and open questions

*The most valuable output of a projection is the place where it collides with something already
built. Each of these is recorded as found rather than reconciled.*

### 7.1 Forbidding pays a cost. Permitting pays none. The loader enforces that they cost the same.

Stated in full at §1.2. In summary: `packages/content/src/god.ts:191–206` refuses to load content in
which permitting and forbidding cost different favor, citing vision pillar 1's symmetry — while
`interventions.ts:390–393` exempts permitting from the worship shock by construction and
`decay.ts:74–77` charges only forbidding with irreversible mastery loss, in a comment that calls
itself *"the whole mechanism by which forbidding a cell actually costs a civilization something."*

**The favor price is symmetric by enforced invariant and the total price is asymmetric by
construction, entirely against denial.** This is a direct, sufficient mechanical explanation for the
negative control, and it is the highest-value finding in this document. **It does not require any of
the projections to be accepted in order to be worth fixing.**

### 7.2 INV-23 fires on Muto Corpus working correctly

INV-23 requires species to *"stay measurably distinct over time"*, guarding against tuning passes
averaging them together. §2.3.3 and §4.5 project that Muto Corpus permitted deliberately blurs them
and Creo Nomen adds rows to the table. **An invariant written to catch a tuning accident would fire
on a mechanic working as designed.** Either the invariant needs a clause excluding universes that
permit *Muto Corpus*, or the projection is rejected. Recorded rather than resolved because the
choice belongs to the author.

### 7.3 "Unstealable by looting" does not say "unreadable"

[V §5] the memory palace is *"unburnable, unlootable, un-loanable."* `tradition-sweep.md` finds Art
of Memory is **the only tradition that produces a different game**. Mind-reading is not looting, and
`knowledge-steal` is concentrated in *Intellego Mentem*. **If Intellego Mentem reaches a palace, one
permit erases the only differentiated tradition in the game.** `metis-knowledge`'s design document
raises the adjacent question and does not answer it either. Unresolved, and it should be resolved
before any content author writes an *Intellego Mentem* node.

### 7.4 Whose ruleset gates a portal's arrival? — the most valuable open question here

[V §8] *"Entry requires Rego Limen — the portal cell — and favor."* [V §3] *"The host universe's
ruleset governs all magic cast inside it, for both attacker and defender."* The opening of a portal
*into* a host is a spell that begins outside and ends inside, and the vision does not say which
ruleset judges it. `portalPlan` (`interventions.ts:913`) checks the **initiator's** ruleset, which
is necessary and does not settle the arrival.

The two answers are different games:

- **Host-gated:** forbidding Limen is **total isolation**. `inboundRaidTempoLoss` goes to zero by
  player decision, [V §8]'s griefing surface acquires a player-side answer, and the hermit kingdom
  becomes a real archetype with stagnation as its likely ending.
- **Attacker-gated:** forbidding Limen only disarms you. It is a strictly bad move, and the griefing
  surface stays a tuning problem.

This one decision determines whether Limen is the most interesting switch in the grid or the least.
It is the cheapest thing in this document to resolve and the most expensive to get wrong.

### 7.5 Three of sixteen node-authored effects reach the simulation, and one of the three ignores the ruleset

> **Corrected 2026-08-15, verified at `08ca5368`.** This section said *"the only node-authored effect
> that reaches the simulation is the one that ignores the ruleset"* and rested on
> *"`gatherEffects` … has no non-test caller anywhere in `packages/`"*. **That is false and has been
> for some time.** `metis-from-use-results.md` §9 already flagged the claim as *"stale everywhere it
> appears"* on `main`, naming four documents plus `scripts/check-primitive-consumption.mjs` and
> `packages/rules-magic/src/effects/consumption.ts`'s header — this is one of the four, and it is the
> one people read. The corrected reading follows; it is narrower, not gone.

This is the sharpest form of the campaign's own question, and it is worth stating exactly.

**14 of 16 primitives are authored on v1 nodes** — `checkPrimitiveCoverage` enforces it in
`npm run verify` and both CI jobs, with `lifespan` and `fertility` as the two declared exclusions.
`packages/content/data/primitive.json` still holds exactly **16** at `08ca5368`, so the denominator
is unchanged.

**3 of 16 are node-driven at runtime.** `gatherEffects`
(`packages/rules-magic/src/effects/gather.ts:96`) — the single legality point for turning a node's
`effects[]` into a contribution — is imported at `packages/coordination/src/universe-effects.ts:123`
and **called at `:330`**. It does not appear among the 125 pinned findings of
`scripts/reachability-baseline.json`, which is the independent confirmation. What it drives is
deliberately narrow: `ECONOMIC_PRIMITIVES` (`universe-effects.ts:183`) is the two-member set
`{resource-yield, build-rate}`, reaching `world-step.ts:1114` (`resourceYieldBonuses: economy.resourceYield`)
and `:986` (`buildRateBonuses: economy.buildRate`). Add `worship-yield`, which reaches favor
regeneration by its own path, and three of sixteen move a number from authored content.

**Two hardcoded empties survive** and are the residue worth chasing: `fertilityBonuses: []`
(`world-step.ts:1849`) and `scribeRateBonuses: []` (`:2017`). `resourceYieldBonuses` is no longer one
of them. Three more primitives — `research-rate`, `teach-rate`, `lifespan` — are reachable but
driven only by god-blessing constants and, since the capital loop closed, by library depth
(`world-step.ts:1580`); no node's authored magnitude enters them.

**Eight primitives are raid-locked** behind a package that still never calls `gatherEffects`:
`direct-damage`, `ward`, `area-denial`, `blink`, `summon`, `concealment`, `knowledge-steal`, and
`portal` itself. That is **half the registry**. The lock has changed shape rather than opened:
`rules-raid` is no longer an orphan — `packages/scenario/package.json` lists it,
`packages/scenario/src/raids.ts:423` calls `openPortal`, and `REFERENCE_MECHANICS.raidEngagement` is
`true` — so `portal` executes. But `audit-vision.md` measures **zero combat attempts on either
path** [given, not re-derived here], so the other seven remain unobserved for the same practical
reason. `direct-damage` alone carries 11 of the 51 v1 nodes and `area-denial` 6, so **a third of the
shipped subset's authored effects have still never fired in a measurement.** Any claim that
"permitting doesn't matter" is, to that extent, a claim about the harness rather than about the
game.

Of the three that are node-driven, **`worship-yield` is the one whose accounting skips
`permits()`** (§7.7) — re-verified at `08ca5368`: `yieldSources` (`god/system.ts:649–656`) still
tests only `instanceCount(nodeId) > 0`. The other two are gated correctly, and gated at *application*
time: `universe-effects.ts` requires a node be **known** (an instance at a mind or memory palace at
or above `MASTERY_ACTIVATION_THRESHOLD`) **and** its cell `permits()`-permitted when the contribution
is applied, so an interdiction switches the economy off without destroying what anyone knows.

Read as one sentence: **the economy now knows what the universe knows, along two primitives, and a
favor trickle that does not care whether the god permitted it runs alongside them.** That is a
narrower complaint than this section used to make, and it is a different one. The negative control
this section was written to explain cannot any longer be explained by *"nothing authored reaches the
simulation"*; if permitting still fails to pay, the reason is now a magnitude or a content question
rather than a missing wire.

So: §2.1's Creo chain lands on `resource-yield` and §3.5's Terram chain on `build-rate`, and **both
are connected end to end**. §3.1's Corpus chain lands on `lifespan` and `fertility`, and **those two
are the ones still severed** — `lifespan` is a god-blessing input only, `fertilityBonuses` is the
hardcoded `[]` at `world-step.ts:1849`, and `fertility` is one of `checkPrimitiveCoverage`'s two
declared exclusions on the content side as well. Read every projection in this document as *"once the
primitive is connected"* **only where the primitive is one of those** — for `resource-yield` and
`build-rate` the correct reading is now *"connected; the open question is the magnitude"*.

**One correction to a claim in circulation:** the *species* table is not inert. Every one of the
thirteen tuned fields has a live call site — `depthCeiling` gates which node tiers a mage may
target (`autonomy/candidates.ts:70`), `laborAffinity` feeds `materialsProduced`, `retention` drives
decay per holder, `affinities` biases target appeal, and species `fertility` feeds
`expectedBirths`. What is inert is the `fertility` *primitive's* bonus channel, which is a different
thing wearing the same word. `hard-magic.md` carries a claim-and-retraction pair on exactly this
point, and the corrected version is the narrower one: the fields are read, and the reference
scenario never creates the scarcity under which reading them would change an outcome.

### 7.5a Construction pays for itself now — the chain is connected, and the open question is its magnitude

> **Corrected 2026-08-15, verified at `08ca5368`.** This section read *"`construction` is passed a
> hardcoded `0`, and `advanceConstruction` has no non-test caller at all"*, and called that
> **"the highest-leverage single disconnection in the tree"**. Both halves are false at this ref, and
> `vision-audit.md`'s ranked gap #2 carried the same claim four days after its own table rows were
> retracted. Anyone acting on the old text would go looking for a caller that exists.

`materials.ts` declares four claimants in a fixed consumption order — `subsistence`,
`libraryUpkeep`, `scribing`, `construction` — and **three of them now genuinely claim.** `scribing`
is still paid earlier at the desk and passed as `0` so it is not double-charged. `construction` is
passed `construction.stoneOwed` (`world-step.ts:1011`), and `libraryUpkeep` is charged through
`applyLibraryUpkeep` (`world-step.ts:1737`) over the per-tick reading of every library.
`advanceConstruction` is imported at `world-step.ts:148` and **called at `:1302`**, taking
`buildRateBonuses: input.buildRateBonuses` — fed from `economy.buildRate` at `:986`, which is
node-authored `build-rate` gathered by `universe-effects.ts`.

So §3.5's chain — Terram raises `build-rate`, `build-rate` shortens `constructionBacklog`, a shorter
backlog adds student seats, seats are what bound the mage roster — is correct in every link **and
connected in every link.** What is not settled is whether it *matters*: the projected payoff was the
largest in this document and no sweep in this repository has yet isolated the Terram → seats → roster
effect at its shipped magnitudes. That measurement is the open item, and it is a run, not a wire.

*(The parenthetical that used to sit here said `w29/city-and-supply-chain` carried no unique commits
and that nobody was differentiating the material scalar into a supply chain. Also stale: that branch
head, `d5a3357c`, is an ancestor of `origin/main` at `08ca5368` — the split landed, `material-stock`
took world-schema revision 5, and the four claimants above spend three different stocks.)*

### 7.6 A raider can import knowledge into a cell her own universe forbids

`packages/rules-raid/src/consequences.ts:182–190`: looted grimoires arrive at the raider's universe
at zero mastery with **no `permits()` check at the moment of looting** — knowledge *"arrives real
and inert"* and is then subject to the ordinary dormancy and decay path. This is documented as
deliberate: raiding can reach cells domestic research never could.

It is also, projected forward, a **smuggling mechanic nobody has named**: a universe can hold what
it forbids, dormant, and permit the axis later to wake it. **[P] That makes a permit a *retrieval*
as well as a licence, and it means the order of permits matters in a way the current model does
not represent** — permitting Perdo in year 10 and permitting it in year 90 after two centuries of
looting are entirely different acts. Worth deciding whether that is a feature.

### 7.7 A forbidden node keeps paying worship

`system.ts:649–656`'s `yieldSources` counts a node's `worship-yield` contribution whenever
`instanceCount(nodeId) > 0` and **does not call `permits()`**. A forbidden-but-still-held
worship-yield node keeps generating favor until its instances finish decaying. Small, but it is a
gap between *"forbidden"* and *"no longer paying off"*, and it sits on the same side of the ledger
as everything else in §7.1.

---

## 8. What this does not answer, and where it is weakest

- **The Auram row is the weakest in the commitment table.** Weather has no distinct world-scale
  reading in a simulation with no map, and the "indiscriminacy" cost is the one place where the
  projection reached for a consequence rather than finding one. If a row should be cut, cut that
  one.
- **The Aquam and Umbra rows are thin** for the same reason: their forms have no unique primitive.
  Umbra's is honestly `concealment`, which Imaginem already owns; Aquam's is `resource-yield`,
  which Creo already owns. **[P] Two forms sharing one primitive with no differentiator is a content
  problem the grid's own shape produces**, and it will recur wherever fourteen forms are mapped onto
  sixteen primitives.
- **The two-constituency mechanic (§6.1) is the highest-variance proposal here.** It is the one that
  most directly answers the negative control and also the one that most changes the feel of the
  game: it makes the god unpopular for governing. If it is wrong, it is wrong in the direction of
  making permissiveness *always* bad rather than *conditionally* bad, which would be a worse game
  than the current one.
- **Nothing here has been measured.** Every number cited is someone else's measurement. The
  projections themselves are arguments, and the campaign's own standard — *"an engineered success is
  worth less than an honest failure"* — applies to them: each one names the observation that would
  disprove it, and none of those observations has been made.
- **The ordering claim in §1.4 is load-bearing and external.** If the reachable set stays
  exhaustible, none of this binds, and the commitment table is a decorative document. That is not a
  risk this workstream can retire.
- **Most of the document is about magic that is not in the game yet.** Eleven of the nineteen
  commitment rows name forms outside the v1 rectangle, and two of the five techniques — the two the
  brief asked about hardest — are dark. That is a legitimate thing for a projection to be, but it
  is worth being explicit that §5 is a design argument and not a backlog. **The subset question in
  §6.3 is upstream of most of it**: until Corpus is in, "what your civilization becomes" has no
  cell that acts on a civilization.
- **The one finding here that stands without accepting any projection is §7.1.** The permit/forbid
  asymmetry is a fact about the built tree, it is a sufficient explanation for the negative control
  on its own, and fixing it does not require agreeing with a single word of §§2–6.

---

*Read next: `docs/design/hard-magic.md` for why the species do not yet matter,
`docs/design/strategy-dimensionality.md` for why the nodes are fungible, and
`docs/design/integration-round-2-results.md` for the god who wins by doing nothing.*
