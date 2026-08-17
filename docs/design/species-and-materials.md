<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# You are one species, and the market is what your legality does to it

**Measured 2026-08-16 on branch `docs/invention-and-machines` @ `0ca9ad69`**, the fully
integrated campaign tree. Every `file:line` below was read on that ref. Where a document and
the code disagree, the code is believed and the disagreement is named. Nothing here reads,
writes or reasons about a balance baseline, and no proposal below is a balance proposal —
each carries a **falsifying measurement** instead.

This is a design proposal, in the shape `openspec/changes/material-economy/` uses: a
measured **Why**, a **What Changes** that names its schema cost, and a stated way to be
wrong. It specifies four things the author asked for — species-first identity, aptitude by
domain, a materials tree, and a market a self-managing populace runs — and it says for each
one what already exists, what is missing, and what it costs to add.

---

## 0. Two corrections that must travel with this document

### 0.1 "A market is a mechanic nobody asked for" is not an author ruling

`packages/rules-world/src/economy/materials.ts:57`:

> *"**There is no substitution between kinds, deliberately.** Letting a hungry universe eat
> its quarry would be a market, and **a market is a mechanic nobody asked for** that
> dissolves the differentiation the three kinds exist to create."*

And a second copy, `packages/rules-world/src/economy/kinds.ts:159`, inside `totalAmount`'s
docstring:

> *"Nothing may pay a claimant out of a total: that would be cross-kind substitution, which
> is a market, and **a market is a mechanic nobody asked for** that would undo the
> differentiation this module exists to create."*

**The author did not say this.** Verbatim: *"that's not something that I said. You could
have a market."* The sentence is an agent's self-restraint written into a source file in the
register of a decision, and it has since been quoted back as authority at least twice — the
propagation is already visible outside the code, in a sibling audit
(`implied-objects-creo-intellego.md`) which records it under the heading *"There is no
market and it is a **deliberate refusal**."* That audit is reading the comment correctly;
the comment is what is wrong.

**Recommendation, not made here (this document changes no code):** amend both sites. Keep
the mechanical claim — *there is no substitution between kinds in this module, and
`totalAmount` must not be spent from* — which is true and load-bearing. Delete the clause
that attributes the absence to nobody having asked for it, and replace it with what is
actually true: *no converter exists yet; when one is added it belongs on an explicit edge
with its own rate, not as a silent fallback inside a spend order.* The distinction matters
because the current wording forecloses §3 and §4 of this document by citation rather than by
argument.

### 0.2 The glosses are a specification in prose, not decoration

301 nodes carry a `name` and a `gloss`. Three sibling audits read all 301 and found roughly
240 implying at least one object the simulation does not have. That reads as drift only if
the glosses were written after the mechanics; they were not. They were written *in response
to conversations about mechanics*, and the mechanics were never built. So the audits are not
an inventory of decoration to be trimmed — they are **the most complete written record of
intended mechanics this project has**, and §3 below is built entirely out of them.

Every stage proposed in §3 is quoted from a gloss. A stage with no quote is not proposed.

### 0.3 One brief-level correction, from the code

The brief said the populace demand inputs are *"hardcoded to zero."* **That is true of
exactly one of six.** `packages/coordination/src/world-step.ts:1428-1501` passes:

| input | value on this ref | live? |
|---|---|---|
| `constructionBacklog` | `constructionBacklog(state)` | yes |
| `scribingQueueDepth` | `unwrittenNodeCount(state)` | yes |
| `universityCapacity` | `min(admissions.granted, completedCapacity(...))` | yes |
| `latentMagicUsers` | `latentMagicUsers(cohorts, deps, worldTick)` | yes |
| `materialsObligation` | `subsistenceDemand(cohorts.totalCount()) + upkeepOwed` | yes |
| **`standingSoldierTarget`** | **`NO_STANDING_ARMY` = 0** (`world-step.ts:1462`) | **no** |

And the zero is cited rather than stubbed: `packages/rules-world/src/populace/demand.ts`
carries a forty-line argument for it from `ages-of-magic.md` §2b — *"A university's
stationed mages are its faculty, its researchers and its garrison at once. There is no
separate military"* — plus the three things that would have to exist before it becomes a
number. The reallocation governor is **being driven**, by five real quantities. That changes
§4's problem from *"wire it up"* to *"give it a trade dimension."*

---

## 1. Species-first identity: you *are* one species

### 1.1 What exists

**Nothing marks a species as the player's.** `git grep` over `packages` for
`playerSpecies`, `homeSpecies`, `ownSpecies` returns zero (positive control: `speciesId`
appears on five components in `packages/state/src/components.ts`). The reference scenario's
own header, `packages/scenario/src/reference-universe.ts:16-17`, states the current design
as a task quotation:

> *"`mages-and-species` task 9.1 — **"author the committed reference scenario seeded with
> all six species and zero player input"** — expressed as `agent-api`'s Scenario"*

`vision.md` §6 opens *"Six **playable** species plus the non-magical populace"*, and that
adjective is the only trace of the author's intent anywhere in the repository.

Three pieces of the mechanism nevertheless already exist, which is why §1 is mostly
assembly rather than construction:

1. **`foundingSpeciesMask`** (`reference-universe.ts:316-332`, read at `:601`, applied at
   `:928-938`) — *"Bit *i* selects the *i*th species `speciesTable` enumerates. **Zero
   selects every species**."* It is documented as an **instrument**, explicitly for the
   question *"varying the founding species mix changes which strategy wins"* (`:323`). A
   single-species universe is one integer away today.
2. **`inviteScholar`, god action 16** (`packages/agent-api/src/actions.ts:78`, cost row
   `invite-scholar` in `packages/content/data/god-cost.json`, dispatched at
   `packages/coordination/src/god/interventions.ts:526`) — the only verb by which a mage of
   a species the universe does not have can arrive.
3. **`POPULACE_COHORT`** (`packages/state/src/components.ts:902-910`) is keyed
   `(speciesId, occupation, birthTickBucket)`, so a universe holding several species is
   already representable; nothing needs to change for a second species to appear.

What is missing is a *distinguished* species, and everything that should follow from being
distinguished.

### 1.2 What "being" a species means mechanically

**Proposal.** `UNIVERSE` gains one field, `foundingSpeciesId: u16`. It is not a lens. Four
things read it, and each is a mechanic that does not exist today:

| reader | effect |
|---|---|
| **Seeding** | Tick 0 seeds cohorts and founding mages of the founding species **only**. This is `foundingSpeciesMask` with one bit set, promoted from an instrument to the default. |
| **Arrival** | Every other species enters through `inviteScholar` (action 16, a god spend) or through a portal. There is no tick at which a second species is simply present. |
| **Worship and favour** | `god-agency`'s worship accrues from a populace that is *yours*. A founding-species cohort worships at full weight; an arrived species at a reduced weight until some tenure condition. This is the mechanical content of *"you are one species, and that is what you are"* — the god of magic for a universe is, first, the god of a people. |
| **Ascension** | §2.4's clock. Whether a long run is neutral or losing is a property of the founding species. |

The other five species at tick 0: **absent, not idle**. They are not seeded, hold no
cohorts, and do not appear in the observation's population block until one arrives. That is
a stronger statement than "seeded at zero", because a zero row and an absent row already
mean different things in this codebase — `territory-holdings.ts` makes exactly that
distinction for land (*"A universe that holds no ground carries rows saying `landUnits: 0`
… the two are different states"*), and the same idiom applies.

### 1.3 What was rejected

- **Seed all six, flag one as "yours."** This is the cheapest change and it makes the
  author's sentence cosmetic. If the other five are already present and already producing,
  "you are one species" is a label on a save file. Rejected because the whole interest of
  the statement is that a second species is an **event** with a cost.
- **A species-specific god action set.** Tempting — dwarven gods get a quarry verb — and it
  breaks §4.2's fixed action space, which `contracts.md` protects because a resize
  invalidates every trained agent. Aptitude belongs in content, not in the verb list.
- **A `speciesId` on `GOD_STATE` rather than `UNIVERSE`.** `god-state` is lazily created;
  a founding species is a fact about the world at tick 0 and must exist before any god acts.

### 1.4 Schema cost

One `u16` on `UNIVERSE` → `WORLD_SCHEMA_VERSION` **11 → 12** (`packages/state/src/migrations.ts:165`).
An absent value on an older snapshot means *"founded by all six"*, preserving every existing
save and hand-built test world — the `grant-budget` idiom, which `CLAUDE.md` records as the
established way to add a field without moving behaviour underneath old data. **`SNAPSHOT_VERSION`
does not move**, so no golden fixture reports a version error instead of a behaviour diff.

### 1.5 Falsifying measurement

`packages/scenario/src/species-separation.ts` and its driver
`packages/scenario/bin/species-separation.mjs` already run K independent seed sets and
report which pairwise separations survive a re-roll — and
`docs/design/species-separation-spread.md` records that on `main` @ `cc20d54` **only three
species form a chain**, not the four task 9.9 wants.

**Pre-registered null:** run `foundingSpeciesMask` with one bit set, six arms, same seed
sets. If "being a species" is real, the six single-species universes must be **structurally**
distinguishable — different population-curve shape, not merely different arrival ticks — and
the number of surviving pairwise separations must exceed the four measured on `main`. If
single-species runs reproduce the same four relations with the same spread, the founding
species is a lens and this section is wrong.

---

## 2. Aptitude by domain, and the 100 %-magic species

### 2.1 The load-bearing fact: species aptitude never touches the economy

`packages/content/data/species.json` authors an `affinities` map per species — dwarf
`{terram: 1536, ignem: 1152}`, elf `{herbam: 1536, mentem: 1280}`, orc
`{terram: 1280, corpus: 1280}`, human `{}`. **Every consumer of that map is in the research
path.** `git grep -n "affinities" -- packages`, excluding tests (positive control: 24 files
match overall):

- `packages/rules-world/src/autonomy/target-appeal.ts:48,301-314,365` — *"The affinity term:
  §6's 'technique/form affinities', consulted for the …"* — this decides **what a mage
  chooses to study**.
- `packages/rules-world/src/autonomy/outlook.ts:59-68`, `packages/coordination/src/outlook.ts:78-145`,
  `packages/coordination/src/node-facets.ts:23`, `packages/coordination/src/world-step.ts:304-312,1628`
  — the plumbing that carries it there.

**Zero hits under `packages/rules-world/src/economy/` or `.../universities/`.** Production
reads exactly one species trait:

    packages/rules-world/src/economy/materials.ts:285
      const base = mul(input.laborerCount * MATERIALS_PER_LABORER, input.laborAffinity);

and construction reads the same one (`universities/construction.ts:392`). So today:

> **Dwarven `terram: 1536` biases what dwarves *discover*. It does not change one unit of
> what they *produce*.** A dwarf and a human laborer standing on the same land differ by
> `laborAffinity` (1280 vs 1024) and by nothing else — a flat 25 % on all three land kinds
> at once, identical in shape.

`vision.md` §6 says species are *"Tuned on: lifespan, curiosity …, and technique/form
affinities"* and does not claim affinities reach the economy. So this is a gap in the
design, not a contradiction between doc and code — but it is the whole of §2's problem.

### 2.2 The second load-bearing fact: which trade a laborer practises is a property of the land

`materialsProduced` splits one scalar across `food/stone/vellum` by `input.shares`, and
those shares are `deps.yieldShares`, computed **once, from content**, at
`packages/scenario/src/content-set.ts:869`:

    yieldShares: territoryYieldShares(registry.territories.map((entry) => entry.record)),

`territoryYieldShares` takes `TerritoryRecord[]` — content — not holdings.
`TERRITORY_HOLDING` (world revision 5) is read in exactly one place in the world step,
`world-step.ts:1688`, and it feeds `heldTerritoryExtent` → **carrying capacity only**.

> **Conquest changes how many people the land carries. It never changes what the land
> yields.** And a run-global constant mix means a universe cannot re-specialise: a dwarf
> universe that permits nothing but Terram still produces `food` in the shipped proportion,
> because the *shares* are fixed and only the per-kind multiplier moves.

A sibling audit put the consequence sharply: *"which trade a laborer practises is a property
of the land, not of the person."*

### 2.3 The third fact, and it is the sharpest: **mages do not eat**

Two lines, four hundred apart:

- `world-step.ts:3246` — `if (admitted.length > 0) cohorts.remove(entry.cohort, admitted.length);`
  An admitted student **leaves the cohort store** and becomes a `MAGE` entity. Mages and
  cohorts are disjoint populations.
- `world-step.ts:1672` and `:1751` —
  `subsistenceDemand(cohorts.totalCount()) + applicationRationsOwed`.
  The food bill is charged on **cohorts**, plus rations for the mages who spent this month
  casting at the world.

`SUBSISTENCE_PER_PERSON = 1` (`materials.ts:89`) and `subsistenceDemand(population) =
population * SUBSISTENCE_PER_PERSON` (`materials.ts:304`). So:

> **A mage who is not casting this tick eats nothing.**

The brief said *"subsistence is per person regardless."* On this ref it is not; it is per
*cohort member*, with a casting surcharge. This is fine today because mages are tens against
tens of thousands — `world-step.ts:1497` says so in its own words. **It stops being fine the
moment a species is 100 % mages**, because that species' entire population falls off the
food bill. A 100 %-magic species implemented naively is not fragile and expensive; it is
**free to feed**, which is the exact opposite of the design.

This is the collision the correction predicted, and it is a code fact rather than a
speculation.

### 2.4 Do the existing knobs express "100 % magic"? Partly — and one of them already says it

**`prevalence` already says it.** `packages/content/data/species.json`: elf `prevalence: 1024`,
draconic `prevalence: 1024`, human `102`, orc `51`; dwarf and gnome author none and fall
back to `PREVALENCE_WHEN_UNAUTHORED = 102` (`packages/rules-world/src/mages/enrolment.ts:81`,
which is careful to say *"This is not an authored number"*). `enrolmentFraction(prevalence)`
is *"The fraction of this species born able to do magic at all"* — and `1024` is `fp(1.0)`.

> **Every elf and every dragon is already authored as born able to do magic.** "100 % magic"
> is half-shipped, in content, and nobody wrote it down in `vision.md`.

What blocks it from being *actual* rather than *latent* is the pipeline, not the trait.
Between latent and mage stand: a seat at a completed university
(`world-step.ts:3234-3246`), a per-tick intake cap `classCapacityOf(species) =
12 × retention / 1024` (elf 15, `enrolment.ts:170`), and `admissions.granted`. A universe of
elves with no universities produces zero mages from a wholly magical people — which is a
*good* mechanic and should be kept, but it is not the same claim.

**What the existing knobs do *not* express, and what must be added:**

| the claim | expressed today? | by what |
|---|---|---|
| every member born able | **yes** | `prevalence: 1024` |
| the labourer *is* the caster | **no** | admission **removes** her from the cohort (`world-step.ts:3246`) |
| baseline output is enchanted, not amplified | **no** | production reads only `laborAffinity`; magic arrives as a separate `resourceYieldBonuses` multiplier |
| every member is on the food bill | **no** | §2.3 |
| aptitude by domain | **no** | `affinities` never reaches `economy/` (§2.1) |

**And the existing tuning already disagrees with the brief's first framing.** Elf
`laborAffinity` is **768**, not near-zero; draconic is **512**. A species whose output
arrives entirely through casting would have been authored at or near zero. The author's
correction — *"they have laborers, but all the laborers are also mages"* — matches the
shipped numbers better than "no labour" does: an elf labours at three-quarters of a human's
rate **and** casts, and the deficit is the price of being the same person twice.

### 2.5 Proposal: two kinds of species, not two coefficient sets

**Species carry a `magicalPopulace: boolean` (or, better, a `magicalPopulaceFraction: fp`).**
It changes structure, not magnitude:

1. **Mages are not removed from the cohort.** For a magical-populace species,
   `world-step.ts:3246`'s `cohorts.remove` does not fire; the `MAGE` entity carries a
   back-reference to the cohort it belongs to. The cohort and the roster describe the same
   people, and `cohorts.totalCount()` remains the true population — which fixes §2.3's food
   hole **for free**, because subsistence is already charged on that number.
2. **Their base production is form-routed and `permits()`-gated.** A non-magical species'
   output is `laborAffinity × shares`, amplified by `resourceYieldBonuses`. A magical
   species' output *is* the applied-magic path: routed by `routeYieldByForm` through the
   forms its members know, so that **a god who forbids a form does not slow an elf economy,
   it removes part of it.** This is the mechanically interesting half of "craft and magic
   are the same act" and it is the one thing in this document that cannot be expressed by
   any tuning of existing numbers.
3. **The occupation split still applies.** An elf scribe is a mage who scribes. This is the
   likeliest breakage point and it was checked: `packages/rules-world/src/populace/` — 
   `buckets.ts`, `cohort-store.ts`, `occupations.ts`, `reallocation.ts`, `births.ts`,
   `mortality.ts`, `demand.ts`, `step.ts` — contains **no branch on whether a cohort member
   is a mage**. Cohorts are `(speciesId, occupation, birthTickBucket, count)` and nothing
   else; `cohort-store.ts` explicitly forbids per-cohort scratch state (*"§1.3's field table
   has exactly four columns"*). So the populace layer is already indifferent, and the
   assumption lives one layer up, in `world-step.ts`'s admission call. That is a smaller
   blast radius than expected and it is the main reason this proposal is affordable.
4. **Dwarf → underground/stone, human → agrarian, as a `domainAffinity` on the *production*
   path.** The minimal honest version is not a new table: it is to let
   `species.affinities` — which already exists, is already authored, and already carries
   `terram: 1536` for dwarves — reach `materialsProduced` as a **per-kind** term beside
   `input.shares`, routed by `routeYieldByForm` over the forms the affinity names. Dwarves
   then bias toward `stone`, elves (`herbam`) toward `food`/`vellum`, orcs (`terram`,
   `corpus`) toward `stone`/`labor`. Humans author `{}` and stay the neutral baseline, which
   is exactly how `vision.md` §6 describes them (*"broad average aptitude"*). **No new
   content field is required for domain aptitude.**

### 2.6 The Tolkien reading, and the clock

The author's calibration is that elves *"can grow … they aren't in the age of decline in the
beginning"*, and separately that *"they do get to that point if they don't ascend."*

**Growth, not decay.** Slow breeding is a rate. `species.json` already carries it: elf
`fertility: 256` against human `1280` — a factor of five — with `lifespanMonths: 8400`
against `960`. Nothing needs a decay curve; low fertility and long life produce a slowly
growing, slowly turning-over population out of the existing `births.ts`/`mortality.ts`.

**`vision.md` §6 already writes half of this and should be quoted rather than rewritten.**
Human: *"Wins on volume and breadth; loses knowledge constantly to mortality."* Elf:
*"Moderate curiosity, high depth ceiling, slow to learn. **Deep specialists.**"* Draconic:
*"**Few, ancient, and terrifying.**"* The depth-per-capita half is shipped. What §6 does not
say is that this makes elves and dragons **irreplaceable**: one death costs a labourer, a
caster, and centuries of accumulated knowledge in a single event, and under §5's loss
channels that is a categorically different risk profile from a human universe that absorbs
the same cull and regrows.

**The clock is the failure state for not ascending, and it prices an action that is
currently free.** `packages/content/data/god-cost.json:124-129`:

    { "id": "declare-ascension", "actionId": 15, "favorCost": 0,
      "gloss": "Free, and gated. Charging for the ending would make a god who spent well
                unable to stop." }

**Proposal.** Decline is not a species trait; it is what a *long unended run* does to a
species that cannot replace its losses. Compose it with what exists rather than adding a
subsystem. The three pieces are built: `qualifyingPath`, `eraBoundaryPassed` and
`stepStagnation` are defined in `packages/coordination/src/god/ascension.ts:203,299,339` and
called each tick from `packages/coordination/src/god/system.ts:501,466,513`; eras are 20
world years. Let sustained stagnation past N eras apply a fertility or retention penalty
**scaled by `1 / fertility`** — which is near-nothing for humans and orcs, and severe for
elves and dragons — so that the fade arrives only for the species the fiction gives it to,
and only in the branch where the ending was not reached.

**How it composes with the ascension legacy carry: it does not, and that is correct.**
`packages/scenario/src/legacy.ts` is the succession layer — `legacyRecordOf` closes a run
into a `LegacyRecord` and `seedLegacy` spends four channels into the next run's tick zero —
and its header states the constraint that settles this: *"every channel below lands as a
quantity that is spent, eaten, aged out or looted. **Nothing here touches a regeneration
rate, a cap, a budget or a species trait.**"* A fade scaled by `1 / fertility` **is** a
species-trait effect, so it must be a **within-run** penalty applied by the god system, never
a legacy channel. Stated here because the natural implementation — "carry the decline into
the successor" — would violate a rule `legacy.ts` already asserts and
`god-conformance.test.ts` already checks one package down.

The design consequence is the reason to do it: **a long run is neutral for a human god and
losing for an elven one.** That is a much stronger reason to price the ending than any
balance argument, and it leaves the gloss's concern intact — the price should be a
*condition*, not a favour cost, since a favour cost is exactly the *"god who spent well
unable to stop"* the gloss refuses.

**Caution, carried:** none of the above may be implemented as a buff. Elves get more
knowledge per head and a clock; they do not get more knowledge. If a tuning pass leaves the
elf arm simply ahead of the human arm on every metric, the wrong half of the archetype has
been taken.

### 2.7 Population scale: the ceiling is the land, not the integers

The author's magnitudes — *"dragons, a few thousand at their peak … with elves, a few
million"* — are a thousandfold spread. **Checked against the machinery, in order of how
much they bind:**

| bound | value | verdict at "a few million" |
|---|---|---|
| `POPULACE_COHORT.count` field | `u32`, refused above `MAX_COHORT_COUNT = 4_294_967_295` (`cohort-store.ts:86`) | **fine**, three orders of headroom |
| cohort **entity** bound, §1.3 | `6 species × 5 occupations × ceil(maxLifespan/120)` = **4,500 entities**, and `cohort-store.ts:36-38` says explicitly *"for a population of any size"* | **fine**, independent of headcount |
| observation encoding | `saturate()` clamps at `INT32_MAX` (`packages/agent-api/src/layout.ts:835`) | **fine** |
| `maxPromotableCount(1024)` | `min(FP_INT_MAX, FP_MAX/1024)` = **2,097,151** per single decade-bucket cohort (`promotion.ts:112`) | **fine in practice** — an elf lifespan of 8,400 months spreads a population over 70 decade buckets — but a *founding* cohort seeded into one bucket would throw |
| `material-stock` fields | `i32`, values in `fp` | fine at a few million (≈`3.6e7` fp of production); strains around a few hundred million |
| reallocation governor | `TRANSFER_RATE_PER_TICK = FP_ONE/16`, applied as `cohortShare(count, rate)` = `count × rate` rounded up (`reallocation.ts:145,333-354`) | **fine, and unchanged in character** — the rate is *proportional*, so 6.25 % of a million is 62,500 people a tick and the controller retunes in the same number of ticks it does at 25,000. The one size-dependent behaviour, the round-up that keeps a cohort below `1/rate` from freezing, binds only under 16 members and is numerically invisible at 10⁶ |
| **carrying capacity** | `Σ landUnits × capacityPerLandUnit` = **56,217,600 fp = 54,900 people**, × `MAX_PROVISIONING = 2048` = **109,800 people absolute** | **fails by ~30×** |

**The finding, and it is worth more than any tuning:** the integers are nowhere near their
limits. What cannot carry a few million elves is the **shipped territory**.
`packages/content/data/territory.json` endows 6,000 land units whose summed
`landUnits × capacityPerLandUnit` is 56,217,600 fp, so
`maxCarryingCapacity` (`carrying-capacity.ts:256-258`, `MAX_PROVISIONING = FP_ONE + 512 + 512
= 2048`) is **109,800 people, for the whole universe, all species together, at maximum
provisioning.** A few thousand dragons fits comfortably. A few million elves is thirty times
the hard ceiling, and *"entire cities and armies"* is not expressible on this land at any
tuning.

So the author's spread is a **content** question — territory endowment — before it is a
species question, and the correct move is to say so rather than to author species population
targets the world cannot hold. `landUnits` has a schema maximum of 1,000,000 per row
(`territory.schema.json:27`), so the endowment can be raised without a schema change; whether
it *should* be is a separate decision with its own consequences for every rate denominated in
population.

### 2.8 Does `vision.md` need amending? Yes — §6 and §6a both

§6 opens: *"Six playable species **plus the non-magical populace**."* §6a: *"Mages are a
thin, expensive layer on top of a large ordinary population."*

Neither sentence can carry a species for which the populace *is* the mages. This is not a
reinterpretation available at the margin — §6a's sentence is the load-bearing description of
the whole economy, and for elves and dragons it is simply false. **Recommended amendment**
(to be made by the author, not here):

- **§6** — after the species table, a paragraph: *most species have a non-magical populace
  that magic amplifies; elves and dragons do not, and for them the labourer and the caster
  are the same person.* Add the shipped `prevalence` figures, since §6 lists the tuned
  traits and omits the one that already says "100 % magic".
- **§6a** — qualify *"a thin, expensive layer"* as the **majority** case rather than the
  universal one, and state the consequence: for a magical-populace species the populace and
  the mage roster are one population, so it is charged subsistence once and produces at a
  magical rate.
- **§6** — invert §6's human sentence explicitly for elves, which it currently only implies.

### 2.9 Falsifying measurements

**The pre-registered null from the sibling, generalised.** `packages/content/data/form.json`,
read whole and machine-diffed on this ref: **14 forms yield only 9 distinct yield vectors.**

    animal  = herbam            {food:512, vellum:512}
    ignem   = terram            {stone:1024}
    imaginem= mentem            {insight:1024}
    umbra   = fatum = limen     {passage:1024}

So there are **five** provable identities in the yield table today, not one.

**The identity is in the routing, not in whole runs — checked, because the stronger claim is
the tempting one.** Counting nodes and summing `resource-yield` magnitudes per form over
`packages/content/data/node.json` on this ref:

| pair | nodes | `resource-yield` effects | Σ magnitude |
|---|---|---|---|
| animal / herbam | 21 / 20 | 10 / 11 | 2240 / **2304** |
| ignem / terram | 21 / 20 | 7 / 9 | 1216 / **2368** |
| imaginem / mentem | 21 / 21 | 1 / 1 | 128 / 128 |
| umbra / fatum / limen | 21 / 25 / 21 | 1 / 1 / 1 | 128 / 128 / 128 |

**The paired cells are not authored alike**, so an Animal-only and a Herbam-only universe do
*not* run identically today — Terram carries nearly twice Ignem's yield magnitude. The exact
claim is narrower and is the one that matters:

> **The forms are economically indistinguishable *through the yield table*.** One unit of
> `resource-yield` routed through `animal` and one routed through `herbam` produce the same
> basket, to the integer. Every difference an Animal-only run shows against a Herbam-only run
> today comes from **how many nodes somebody authored in those cells**, not from the two
> forms meaning different things about the economy.

**Pre-registered null, stated so it is controlled rather than confounded:** hold the node
content equal — one probe node per cell at identical magnitude — and the two arms are
bit-identical. **If species aptitude and the materials tree are real, that controlled pair
must separate** — a herder is not a farmhand and a forge is not a quarry — and the god who
permits Terram in a dwarf universe must beat the one who permits Ignem there for a reason
other than Terram having been authored more generously.

**The 100 %-magic arm.** Two runs at the same seed: `foundingSpeciesMask` = elf-only vs
human-only. Today they differ in coefficients only. If §2.5 is real they must diverge in
**kind**: (a) elf `cohorts.totalCount()` and living-mage count converge on the same number
while the human arms stay an order of magnitude apart; (b) the elf food bill scales with
total population while the human one does not; (c) forbidding a single form removes a
measurable slice of elf production and only attenuates human production.

**The loss-shock arm, whose instrument already exists.**
`packages/scenario/test/unit/loss-shock-recovery.test.ts` culls half the mage roster at tick
1200 with no RNG draw, runs a same-seed control, and reports `recoveryTicks` per species. An
earlier run is reported to have returned draconic and elf at `recoveryTicks: null,
censored: true` against dwarf 252 and gnome 72. **That result was not re-run here and must
be re-measured before it is quoted** — but if it holds, slow breeding *already* makes the
two 100 %-magic species structurally unable to recover from a cull, the irreplaceability
half of §2.6 is shipped, and nobody has drawn the conclusion.

**The falsifier for the clock:** run a stagnating universe past N eras with an elf founding
species and a human one. If the elf arm's population curve is indistinguishable from the
human arm's after the stagnation penalty, the clock is decoration.

---

## 3. The materials tree

### 3.1 The admission rule, taken from the literature this project already read

`docs/design/economy-flow-models.md` §4 settles this and should be the gate:

> *"**The defensible rule is Cook's, not a count:** a resource earns its slot when it has
> **its own sink and its own scarcity regime**. Fourteen materials sharing one sink is not
> fourteen resources — it is one resource with fourteen labels, and it will add bookkeeping
> without adding decisions."*

and, from the same section, Wube on opt-in depth: *"Generally, just adding a huge amount of
recipes isn't really adding to the game … we wanted to add some complexity, and also, make
the related complications **explicitly opt-in**."*

So the tree below is proposed in **three tiers of cost**, and only the cheapest is
recommended for the first change. Every stage is quoted; a stage with no gloss behind it is
not here.

The vocabulary is §1.1's, verbatim from Dormans: a **converter** *"convert[s] one resource
into another … act[s] exactly as a drain that triggers a source"* and **breaks
conservation**; a **trader** *"cause[s] Resources to change ownership"* and preserves it.
Every edge below is a converter. There are no traders in a single-universe economy — traders
appear only at the portal, between universes, which is §4.5.

### 3.2 The evidence, by stage

Nine ladders are authored in the glosses. Each row is one edge of the tree.

| # | stage edge | verbatim gloss | node |
|---|---|---|---|
| 1 | **worthless rock → poor ore → good ore** | *"Change **worthless rock** into **ore that is merely bad**. **Never into good ore**: the working **improves a thing by one step** and has never once been made to take two."* | `mt-turn-the-poor-ore` |
| 1b | (the same ladder by another technique) | *"Change the true name of **poor rock** to the true name of **iron**."* | `mn-call-it-iron-until-it-is` |
| 1c | (ore in the ground as a found thing) | *"Make **ore in the ground, in the shape ore takes**, where **a survey** would expect to find it … whether **conjured silver is silver**; the mints hold their own view."* | `ct-the-conjured-vein` |
| 2 | **ore + fuel → iron** (the smelt) | *"**Smelters** who have it **waste no charge and no charcoal**, and **can say beforehand what a furnace will yield**."* | `rig-bank-the-forge` |
| 2b | (the converter's throughput term) | *"Smiths have always read heat by colour and always argued about it. This settles the argument, and **a smithy that stops arguing produces roughly a third more**."* | `iig-the-colour-of-ready-iron` |
| 2c | (the converter's setpoint) | *"Keep **a kiln, a forge, or a crucible** at exactly one heat for as long as the work takes. **Fire's entire practical literature is about holding a number still**."* | `cig-hold-the-temperature` |
| 2d | (fuel as a graded input) | *"Change **what a fire counts as fuel**. Stone will do … **the fire is slower about stone**."* | `mi-teach-the-fire-what-to-eat` |
| 3 | **green timber → seasoned timber → beam** | *"Turn **green timber** into **seasoned timber** without spending the years on it. **The beam is honest about having been hurried**, and a good carpenter can hear it in the tap of a mallet."* | `mh-season-the-green-wood` |
| 3b | (the same edge by Rego) | *"Compel **green timber** to hold the shape of **seasoned timber**."* | `rh-the-standing-timber` |
| 3c | (the sized-stock edge) | *"Hold a wood to **the lengths a builder asked for** … so that **the poles come out of it already straight and already the right size**."* | `rh-the-obedient-coppice` |
| 4 | **sand/riverbank → ashlar → laid course** | *"Turn **a riverbank into ashlar**."* | `mt-the-stone-that-was-sand` |
| 4b | (dressed stone as a distinct state) | *"Turn **cut stone** briefly workable … **The masons have the length of an afternoon and no more**."* | `mt-soften-the-stone` |
| 4c | (the assembly edge) | *"**Lay a whole course of a wall** as one working."* / *"Put **a block exactly where it belongs**, on the first attempt, without a crane."* | `rt-raise-the-course`, `rt-set-the-stone` |
| 4d | (the converter priced against the trade) | *"at **a price in mage-months** no quarry would survive being compared to."* | `ct-make-the-brick` |
| 5 | **straw → grain**, with a conversion loss | *"Nothing is created; **a field of straw becomes a smaller field of grain**."* | `mh-the-second-harvest` |
| 6 | **beast → skins → vellum**, with a grade | *"the first thing every scriptorium calls for is **skins**, and why **the quality is a standing joke** … it does not specify **in what condition**."* | `rn-call-by-name` |
| 7 | **foul water → water** (potability rung) | *"Turn **foul water** into **water**. **Not clean water — water**, which is a lower standard than the phrase suggests."* | `maq-sweeten-the-cistern` |
| 8 | **composite artifacts with a material bill** | *"**Spears become spearheads, ladders become rungs, and a siege engine becomes a great deal of rope and a heap of fittings.**"* | `ph-take-the-haft` |
| 9 | **ink, distinct from the page** | *"**Take the water out of ink.** The page is not burned, the binding is not cut, and the book is **a stack of blank leaves taking up exactly as much shelf as it did**."* | `paq-unwrite` |

**What exists against all of it:** seven undifferentiated `i32` pools
(`packages/state/src/components.ts:209-220`), no grade on any of them, and **no conversion
operation of any kind** — foreclosed by name at `materials.ts:57`, which §0.1 shows is not a
ruling.

### 3.3 Tier 1 — a grade, and no new kind (recommended first)

**Nine of the nineteen rows above are a quality ladder, not a new substance.** `mt-turn-the-poor-ore`
states the rule for all of them and states it as a **rate limit**: *"the working improves a
thing by one step and has never once been made to take two."*

**Proposal.** One `qualityFp` per land kind beside the stock — three `i32` fields, a
weighted average that rises when a converter fires and falls as unimproved stock arrives.
Grade multiplies what the stock **buys**, not how much of it there is: high-grade `vellum`
scribes at a better fidelity, high-grade `stone` builds faster, high-grade `food` feeds
further. That gives rows 1, 3, 4, 6, 7 a target at once, and it is the version that satisfies
Cook's rule without adding a slot: grade has its own scarcity regime (it decays toward the
mean) and its own sinks (three that already exist).

It also delivers the author's *"discovering strange magic actually does something niche that
ends up mattering later"* at the lowest possible cost: `maq-sweeten-the-cistern` and
`mt-soften-the-stone` are niche today because they have nothing to move. A grade gives every
one of them exactly one number to move, and the *"improves a thing by one step"* rule gives
depth a reason — a three-rung ladder needs three discoveries.

**Schema cost.** Three `i32` fields on `MATERIAL_STOCK` → **`WORLD_SCHEMA_VERSION` 11 → 12**
(shareable with §1.4's revision if both land in one change). **`landTotal` does not move**,
`territoryYieldShares` does not move, `LAND_MATERIAL_KINDS` does not move, and no existing
share changes. `SNAPSHOT_VERSION` unmoved.

### 3.4 Tier 2 — one new kind, on the one chain whose terminal sink already exists

Cook's rule admits **`hide`** and nothing else today.

    territory ──(land)──▶ hide ──[converter: the tanner]──▶ vellum ──▶ grimoire, library upkeep

- **Its own scarcity regime:** hide comes from `animal`-form land and from herds; vellum
  comes only from hide. Today `animal` yields `vellum` directly at 512 and so does `herbam`,
  which is why the two forms are numerically identical (§2.9). Inserting the stage is what
  *breaks that identity*: `animal` yields hide, `herbam` yields raw fibre/rag, and the two
  reach vellum by different converters at different rates.
- **Its own sink, already built:** vellum is spent by scribing and by library upkeep, in a
  contested order this codebase already adjudicates (`materials.ts:44-52` — *"only the vellum
  pair still competes"*). The chain terminates in a sink that exists and is already the
  interesting one.
- **Its gloss:** row 6 above, verbatim, including the grade — *"the quality is a standing
  joke … it does not specify in what condition"* — which is why Tier 1 must land first.

Everything else is **rejected for now, by the same rule**: `ore`/`iron` has no sink (no
tools, no equipment, no weapon bill — `ph-take-the-haft`'s composite artifacts do not
exist); `fuel`/`charcoal`'s only sink would be the smelt that does not exist; `timber`'s sink
is construction, which is denominated in `stone`, so adding timber without re-denominating
construction gives one sink two labels — Cook's failure case exactly. Each becomes admissible
the moment its sink is built, and §3.2's table is the standing evidence for when that day
comes.

**Schema cost, stated precisely, because the brief's version overstates it.**

1. `MATERIAL_KINDS` +1 → `MATERIAL_STOCK` gains a field → **`WORLD_SCHEMA_VERSION` +1**.
2. `LAND_MATERIAL_KINDS` +1 → `landTotal` sums four instead of three. **This does not by
   itself change any territory share.** `territoryYieldShares`'s denominator is
   `landTotal(weighted)` where `weighted[kind] += landUnits × yieldPerLandUnit[kind]`
   (`kinds.ts:218-234`), and `packages/content/data/territory.json` authors exactly three
   keys per row. A fourth land kind with zero weight everywhere leaves `weighted[hide] = 0`
   and every existing share **bit-identical**. The shares move on the tick a territory row
   authors a nonzero `hide` weight — which is a content edit, separable from the schema
   change, and therefore the point at which the behaviour diff should be reviewed.
3. `territory.schema.json`'s `yieldPerLandUnit` must gain the key. Content revision.
4. `landTotal` is also read by the mage autonomy outlook (`kinds.ts:171-186` — *"A mage's
   'can this universe afford to do things' term"*). Adding a fourth land kind changes that
   sum **as soon as the stock is nonzero**, which changes mage behaviour. This is the hidden
   cost the brief was pointing at, and it lands one step later than the brief placed it.
5. `form.json`'s `yieldWeights` gains a key for all fourteen forms. Content revision.
6. The observation's `materials` slot already sums kinds into one number
   (`observation.ts:264`) and is fixed at §4.1's block width, so **no observation resize** —
   the existing known limitation (*"an agent cannot yet tell a food shortage from a vellum
   one"*) simply widens by one.

### 3.5 Tier 3 — the converter as a trade, and the machine as its multiplier

Row 2 is not a stage; it is a **converter with an operator**. *"Smelters who have it waste no
charge and no charcoal, and can say beforehand what a furnace will yield"* names a person, an
input loss, and a predictability. `iig-the-colour-of-ready-iron`'s *"roughly a third more"*
is a **per-trade productivity multiplier** and there is no trade to attach it to: five
occupations exist (`packages/state/src/enums.ts`: `laborer, scribe, student, soldier, idle`)
and `laborer` stands in for mason, carter, carpenter, quarryman, miller, smelter and farmer
alike.

This is where `invention-and-machines.md` §6's enhancement stack lands on the tree:

| stage | on this tree |
|---|---|
| base | the converter fired by a trade's labour, at its own rate |
| magic | a permitted node raising that converter's rate via `resource-yield` routed by form |
| machine | invention magic spent once (`insight`), raising the rate thereafter without casting |
| magic machine | both multipliers live, under the existing `fp(4096)` cap |

And it inherits that document's open question unchanged: whether *"super"* is genuinely
super-additive or is two multipliers stacking under `stackMagnitudes`. The cheaper reading
should be measured before any new mechanism is proposed.

**Cost:** one occupation enum member per trade, plus a demand term in
`packages/rules-world/src/populace/demand.ts` per trade. Cheap individually; the design
question `demand.ts` itself raises is whether the populace model wants more than five
buckets at all. A trade dimension is what §4 needs something to attach a market to, so this
is Tier 3 rather than Tier 4.

### 3.6 Falsifying measurements

- **Tier 1.** Pre-registered null: today, two universes differing only in which of
  `mt-soften-the-stone` / `maq-sweeten-the-cistern` they can reach are **bit-identical in
  every material number**, because neither node can move any stock. If grade is real they
  must differ in what the same stock buys — same `stone` count, different build progress.
- **Tier 2.** The Animal/Herbam routing identity (§2.9) is the direct falsifier, and it must
  be run **controlled**, because the shipped cells are not authored alike (21 vs 20 nodes,
  Σ`resource-yield` 2240 vs 2304). Give each arm one probe node of identical magnitude in
  `creo-animal` and `creo-herbam` respectively: the `food` and `vellum` series are equal
  tick-for-tick today, and after the hide stage they must separate. Running it uncontrolled
  measures the node authoring and reports it as a mechanism.
- **Tier 3.** `iig-the-colour-of-ready-iron` claims *"roughly a third more."* If a trade
  dimension is real, an arm that permits Intellego Ignem must show a measurable rise in the
  smelting converter's throughput and **no rise anywhere else**. If it moves every kind, the
  multiplier has been attached to `laborer` again and the trade is cosmetic.
- **Any tier.** Cook's own test: if a new kind's stock accumulates unspent across a long run,
  it has no sink and does not earn its slot. That is a per-kind flow check, not a level
  check, and `economy-flow-models.md` §5.2 already records that *"every current metric is a
  level metric"* — so the check has to be added with the kind.

---

## 4. The market, and the populace that runs itself

### 4.1 What the author asked for

> *"There's like **a market** and stuff. **The populace should auto-manage itself.** It's not
> something that you enable or do stuff with, but you as the god of magic **allow things to
> happen and that improves how the market performs.**"*

Three claims, and each maps onto something that exists or is one edge away.

### 4.2 The populace already manages itself, and it is already driven

`packages/rules-world/src/populace/reallocation.ts:145`:

    export const TRANSFER_RATE_PER_TICK: Fixed = floorDiv(FP_ONE, 16);

**6.25 % of a cohort per tick**, with a per-cohort share rounded up so that a cohort below
`1/rate` is not frozen (`cohortShare`, `:333-354`). Nobody allocates; the controller moves
people toward demand and the god cannot touch it. That **is** the author's self-management,
and per §0.3 it is being driven by five live inputs, not by zeros.

What it cannot currently express is **which trade**, because `materialsProduced` splits one
laborer scalar by `input.shares`, and the shares are land's. So the populace self-manages
along the axis *how many laborers* and never along *what kind of laborer*. §3.5's trade
dimension is the missing axis, and it is a precondition for §4.4.

**One caution the literature already recorded and this design must respect.**
`economy-flow-models.md` §3.4: occupation reallocation is a stock-management structure with a
material delay, and *"a rule that reads only the current gap and ignores transfers already in
flight is `w_SL = 0` — the textbook oscillation generator."* Adding trades multiplies the
number of such loops. Any market proposal that widens this controller must carry a
supply-line term or an explicit argument for not having one.

### 4.3 What a market is here — converters with legality-gated rates, not a price table

The wrong version is a **trader**: a table of exchange rates that lets a hungry universe eat
its quarry. `materials.ts` is right to refuse that, for the reason it gives (it dissolves
differentiation) even though the authority it claims is not real (§0.1). A trader also
preserves conservation and changes owner, which is not what is wanted — inside one universe
there is only one owner.

The right version is a **converter graph**: §3's tree, with each edge carrying a **rate**
rather than a price. Dormans, verbatim: *"Converters act exactly as a drain that triggers a
source, consuming one resource to produce another"*, and *"with a converter resources are
actually consumed and produced, and therefore the total number of resources in the game
might change."* That is the mechanism the glosses describe — *"a field of straw becomes a
**smaller** field of grain"* is a converter with a stated loss, in one sentence.

**A price is then a derived reading, not a stored number.** The implied price of stone in
food is the ratio of the two converters' marginal rates at the current allocation. It is a
*report*, computed for the UI and the observation, and it responds to scarcity automatically
because the rates do. Nothing is stored, no new stock, no new component — which is what
keeps this inside the determinism constraints.

**And no spills.** `economy-flow-models.md` §3.3, verbatim: an inflow exceeding a ceiling
*"should be an explicit spill flow, never a silent truncation — `stock = min(stock + inflow,
CAP)` both breaks conservation and destroys the signal."* A converter that cannot fire for
want of input must record the shortfall as an explicit unmet flow, the way
`materials.ts`'s claimants already record theirs.

### 4.4 How legality moves it — the mechanism that turns the author's sentence into a number

Each converter edge has **two paths and one gate**:

1. **The labour path.** A trade fires the converter at a base rate from allocated
   person-months. Always available, poor, and the reason a universe with no magic still has
   an economy.
2. **The magical path.** A node in a permitted cell whose form routes onto that edge fires
   the same converter at a better rate, or with a smaller loss, or with a grade gain. Gated
   by `permits()` — bitmask-only, so an unopened column is a **starting position rather than
   a wall** (`invention-and-machines.md` §4).

> *"You as the god of magic allow things to happen and that improves how the market
> performs"* = **permitting a cell adds an edge, or raises an edge's rate, in the converter
> graph.** Forbidding one removes it. The god never allocates, never prices, and never
> touches a stock; the god changes the *shape of the graph* and the populace controller
> re-solves against it at 6.25 % per tick.

This composes exactly with §2.5's magical-populace species: for a non-magical species the
magical path is a multiplier on the labour path, so forbidding a form **slows** the economy;
for a magical-populace species the magical path *is* the labour path, so forbidding a form
**removes** that edge outright. Same mechanism, two structurally different consequences —
which is the differentiation-in-kind the author asked for, expressed once.

### 4.5 The one place a trader belongs

Between universes. `vision.md` §3's portal rule already makes the host's ruleset govern, and
a trade across a portal changes **owner** while preserving quantity — Dormans' trader
exactly. That is out of scope here and is named only so that a later reader does not
implement a trader inside one universe by analogy.

### 4.6 Schema cost

**Zero new components for the market itself.** Converter edges are content (a `converter.json`
alongside `form.json`, naming input kind, output kind, loss, base rate, and the form that
routes onto it). Rates are computed per tick from the same `stackMagnitudes` path
`resource-yield` already uses. What §4 costs is entirely §3's tiers and §3.5's occupation
enum members — which is the argument for doing §3 first, and it is why this section proposes
no revision of its own.

The one thing that would cost a revision is recording per-edge unmet flow in state rather
than in the tick's report. It should not be: `economy-flow-models.md` §5.2's flow metrics
belong in telemetry, not in the hashed world.

### 4.7 Falsifying measurements

- **The direct null, provable today.** No stock can become any other stock; total conversions
  across every run is **exactly zero**, by construction (`materials.ts:57`). Any market
  implementation must show a nonzero conversion flow, and that flow must change when a cell
  is forbidden. If forbidding the cell that carries the converter node leaves the flow
  unchanged, legality is not reaching the market and §4.4 is wrong.
- **The mix null.** Today `deps.yieldShares` is computed once at
  `packages/scenario/src/content-set.ts:869` and never re-read, so **no god action can change
  the production *mix* by changing the land**; only the per-kind `resource-yield` multipliers
  can move the ratio. Pre-registered: after §4, a run that forbids a converter's cell must
  change the mix through a **different channel** than the yield multiplier — measurable by
  ablating `resource-yield` (the mask already exists, `ProductionInput.ablation`) and
  checking that the mix still moves. If ablating `resource-yield` freezes the mix completely,
  the "market" is the old multiplier wearing a new name.
- **The oscillation check.** Per §4.2 and `economy-flow-models.md` §3.4, the current test
  detects period-2 only and *"a 1,400-tick starvation cycle is invisible to a period-2
  detector."* Any widening of the reallocation controller must be checked with
  autocorrelation over the existing 12-tick census grid, not with the period-2 assertion.

---

## 5. Schema cost, collected

| proposal | component change | `WORLD_SCHEMA_VERSION` | moves `landTotal` / shares? | `SNAPSHOT_VERSION` |
|---|---|---|---|---|
| §1 founding species | `UNIVERSE` + `foundingSpeciesId: u16`; absent = "all six" | 11 → 12 | no | unmoved |
| §2 magical populace | `SPECIES` content field + `MAGE` back-reference to its cohort | +1 (the `MAGE` field) | no | unmoved |
| §2 domain aptitude | **none** — reuse `species.affinities`, already authored | none | no | unmoved |
| §2 ascension clock | none in state; composes with `stepStagnation` / `eraBoundaryPassed` | none | no | unmoved |
| §3 Tier 1 grade | `MATERIAL_STOCK` + 3 × `i32` | +1 (shareable) | **no** | unmoved |
| §3 Tier 2 `hide` | `MATERIAL_STOCK` + 1 field; `LAND_MATERIAL_KINDS` +1; `territory.schema.json` + key; `form.json` + key | +1 | **only when a territory authors nonzero weight** | unmoved |
| §3 Tier 3 trades | `OCCUPATION` enum members | none (enum widening) | no | unmoved |
| §4 market | none; converters are content | none | no | unmoved |

None of these moves `sim-core`'s `SNAPSHOT_VERSION`, which is inside the hashed header —
`CLAUDE.md`'s rule: moving it *"would break every golden fixture with a version error instead
of a behaviour diff."* Every revision above should arrive with the absent-row idiom
(`grant-budget`'s) so that older saves and hand-built test worlds keep the behaviour they
were written against.

---

## 6. What would falsify this document

- **§0.1** — an author statement establishing the no-market comment as a ruling after all.
  Then §4 is out of scope and the comment should stay.
- **§1** — a single-species run that is structurally indistinguishable from the all-six run
  at the same seed. Then founding species is a lens.
- **§2.1** — any consumer of `species.affinities` inside `packages/rules-world/src/economy/`
  or `.../universities/`. The claim that domain aptitude never reaches production rests on a
  grep with a positive control; one counter-example and §2.5's fourth item is already built.
- **§2.3** — a subsistence claim that bills mages. If one exists on a ref this document did
  not read, the food hole is closed and §2.5's item 1 loses half its motivation.
- **§2.7** — a territory endowment, on any ref, whose summed
  `landUnits × capacityPerLandUnit × MAX_PROVISIONING` exceeds a few million. Then the
  ceiling finding is a statement about the shipped content only, which is how it is written,
  and the scale question is a tuning question after all.
- **§2.9** — a form authored with a yield vector that breaks one of the four duplicate
  groups. The five identities are exact on this ref; one edit and the pre-registered nulls
  are gone and must be re-derived.
- **§3** — a gloss-supported stage this document missed, or a stage here whose quote does not
  bear the reading given. Every row of §3.2 is quoted so that this check is one file away.
- **§4** — a demonstration that a converter graph reproduces the substitution
  `materials.ts:57` was actually worried about: a universe that survives a famine by eating
  its quarry. If the converter edges permit that in practice, the mechanical half of the
  comment is right even though its authority is not, and the edges need an explicit
  no-food-from-stone constraint.
