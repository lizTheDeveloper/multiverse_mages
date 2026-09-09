<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The opening position: what exists before magic does, and when each people arrives

**Measured 2026-08-16 on `docs/invention-and-machines` @ `38495600`**, the fully integrated
campaign tree. Every number below was taken on that ref with `npm ci` and `npx tsc --build` run in
this worktree first. Runs are **single-seed** (`20260813`) unless stated; they are observations of
one universe, not distributions, and nothing here is a baseline or asks for one. Each proposal
carries the measurement that would kill it.

This document answers two questions the author asked in one breath:

> *"At the very very very beginning, what is the smallest system that exists before you have
> anything else? … and then we discover magic somewhere, sometime. Maybe it's different for
> different creatures."*

and

> *"There's orcs, I don't know if orcs are newer than humans or older. Do a little comparative
> stuff on orcs and give me a verdict."*

---

# Part 1 — The smallest system

## 1. The game currently starts after the interesting part, and that is legitimate where it happens

`packages/scenario/src/reference-universe.ts` seeds a **finished** civilization:

- `packages/scenario/src/reference-universe.ts:1068` — `buildProgress: FP_ONE`. The academy is
  complete at tick zero; no laborer ever raises it.
- `packages/scenario/src/reference-universe.ts:966` —
  `createMage(rng, mage, species, speciesId, -species.maturityMonths, academy)`. Every founding
  mage is created **already affiliated**, and created **already mature** (born one maturity before
  tick 0).
- `packages/scenario/src/reference-universe.ts:986` — `grantFoundingKnowledge(state, {…})`. God
  action 8 is spent before the world exists.

The file argues for this itself, and the argument is sound where it is made:

> *"`coordination`'s world loop deliberately founds no universities and grants no founding
> knowledge: both are god actions (`contracts.md` §4.2, actions 11 and 8) and a loop that quietly
> did them would be a rules layer taking the player's turn. This file does both — and that is
> legitimate here in a way it would not be there, because a scenario *is* the set of initial
> conditions. Nothing below runs during a tick; it all happens before tick 0 exists."*

**That is right, and it is exactly why the opening the author is asking about has to be written as
a scenario and not as a rule.** A pre-magic opening is a different set of initial conditions, not a
different world loop. Nothing in Part 1 below asks `coordination` to change.

There is a second, harder guard in the same file:

    packages/scenario/src/reference-universe.ts:886
      if (options.foundingUniversities < 1) {
        throw new Error(
          `foundingUniversities is ${String(options.foundingUniversities)}. A universe with no ` +
            'academy can never teach and never scribe, so a run taken from one would record two ' +
            'centuries of silence as an ordinary observation.',
        );
      }

**A universe with no university is currently unrepresentable.** Not unmeasured — refused. §6 comes
back to whether that refusal is still earned.

## 2. What exists at tick 0 with no magic at all — measured, four arms

The scenario already accepts `foundingNodes: 0` and `foundingMages: 0`: both go through
`readCount` (`reference-universe.ts:557`), which refuses only non-integers and negatives. So the
pre-magic opening can be *run* today even though it cannot be *founded* without an academy.

Four arms, 600 world ticks (50 years), no god actions, seed `20260813`. Control arm is today's
universe, and it must end with non-zero `EVER_KNOWN` or the probe cannot tell "no magic" from "the
probe reads the wrong component":

| arm | options | pop 0 → 600 | mages at 600 | ever-known nodes | grimoires |
|---|---|---|---|---|---|
| **full** (control) | — | 72 → 211 | 22 | **147** | 584 |
| **noNodes** | `foundingNodes: 0` | 72 → 429 | 9 | **137** | 595 |
| **noMages** | `foundingMages: 0` | 72 → 80 | **0** | **0** | 0 |
| **neither** | both 0 | 72 → 80 | **0** | **0** | 0 |

Three readings, and the third is the design finding.

**(a) The populace, occupations and materials already exist and already run without magic.** The
`noMages` arm is a functioning world: 72 people at tick 0 in three seeded occupations
(`SEEDED_OCCUPATIONS = [laborer, student, scribe]`, `reference-universe.ts:278`, `cohortSize` 4 per
species per occupation), settling by tick 600 to **45 laborers, 24 scribes, 11 idle and zero
students**, with food, stone and vellum all sitting just above their `STARTING_MATERIALS` of
1,000 × fp1 (`reference-universe.ts:144`). Nothing errors. **Shelter, subsistence and a little
feudalism are already the substrate; they are simply never observed alone.**

> **There is no farmer, and that is a ruling rather than a gap.** The author's question names
> farming directly. `contracts.md` §1.3 gives five occupations — laborer, scribe, student, soldier,
> idle (`packages/state/src/enums.ts:150-156`) — and `labour-by-trade-spec.md`, written the same
> night as this document, **rejects adding farmhand, herder, quarrier and stoneworker** as
> occupations: a `quarrier` only means something if quarriers produce differently, and production
> already varies by *form*, not by job title. So subsistence farming in the opening is `laborer`
> plus the `food` stock, and the fiction should say so rather than ask for a sixth cohort.
> (That spec also states `latentMagicUsers` as `Σ count × prevalence × mageAptitude`. On
> `38495600` it is `prevalence` alone — `world-step.ts:3497` — the same W197 staleness §11.3
> records.)

**(b) `noMages` and `neither` are identical in every field.** Granting founding nodes to an empty
founder list is a no-op — the grant is dealt round-robin over `founders` and there are none. So
*"the god has permitted magic"* and *"the god has permitted nothing"* are the same world when
nobody can hold a node. **Knowledge with no mind to sit in does not exist**, which is §5's
"knowledge has a location" arriving as a degenerate case.

**(c) Magic is discovered without the god, and fast.** From `foundingNodes: 0` — six mages, no
granted knowledge:

| world tick | ever-known nodes | mages | populace |
|---|---|---|---|
| 0 | 0 | 6 | 72 |
| 2 | 0 | 6 | 72 |
| **5** | **2** | 6 | 73 |
| 23 | 10 | 6 | ~77 |
| 100 | 42 | 5 | 91 |
| 600 | 137 | 9 | 429 |

**The first two nodes are discovered at world tick 5 — five months — by mages who were granted
nothing.** At 600 ticks the ungranted universe holds 137 nodes against the granted one's 147.

## 3. The actual bottleneck is not knowledge. It is the first mage.

`noMages` runs 600 ticks and creates **zero** mages. Not one. There is no path in the shipped
build from a populace to a first mage, because the enrolment pipeline requires a *student cohort*
and the demand controller sizes student demand from latent magic users:

    packages/coordination/src/world-step.ts:3471   latent += latentInCohort(count, species);
    packages/coordination/src/world-step.ts:3497   return floorDiv(count * enrolmentFraction(prevalenceOf(species)), FP_ONE);

and `enrolmentFraction` is now the bare field —
`packages/rules-world/src/mages/enrolment.ts:111-113`, *"born able, and nothing else"*. The gate is
`prevalence` alone since W197; `mageAptitude` moved off it and now decides *what kind* of mage a
graduate becomes (`packages/rules-world/src/mages/careers.ts:38`, `world-step.ts:3428`).

So the pre-magic question has a precise arithmetic answer. `floorDiv(count × prevalence, 1024) ≥ 1`
requires `count ≥ 1024 / prevalence`:

| species | `prevalence` | smallest cohort yielding one latent mage |
|---|---|---|
| elf | 1024 | **1** |
| draconic | 1024 | **1** |
| human | 102 | **11** |
| dwarf | *(absent → 102)* | 11 |
| gnome | *(absent → 102)* | 11 |
| orc | 51 | **21** |

**This table is the pre-magic opening.** A hamlet of elves has a mage in it. A hamlet of ten humans
does not, and a hamlet of twenty orcs does not. That is the author's fiction, already in the
arithmetic, and nobody wrote it down.

> **A stale comment, found on the way.** `packages/coordination/src/world-step.ts:3488` says
> *"at the shipped numbers an orc cohort under about 114 people contributes nobody."* At the
> shipped numbers the figure is **21**. 114 is the two-factor arithmetic —
> `prevalence × mageAptitude / 1024` = 51 × 192 / 1024 ≈ 9.6, and 1024/9.6 ≈ 107 — which W197
> removed from `enrolmentFraction`. **Believe the code**: the comment describes arithmetic the
> function no longer does, and it overstates the orc threshold by 5×.

## 4. Does the god precede magic? Yes — and the fiction and the code disagree about why

**The fiction is unambiguous.** `vision.md` §1: *"you bless, you fund, you grant founding knowledge
to a chosen scholar so that a body of magic can exist in your world for the first time."* §7,
line 360: *"grant founding knowledge (the only way to introduce a body of magic nobody in your
world knows)."* The god is there first; magic arrives through her.

**The code says otherwise, and the code wins.** §2(c) above: six mages granted nothing hold two
nodes at world tick 5 and 137 by tick 600. **God action 8 is not "the only way" and is not even the
usual way** — it is a head start worth 10 nodes out of 147 at 600 ticks on this seed.

This is not a contradiction to resolve by editing one of them. It is the distinction
`packages/content/src/types.ts:295-309` already draws and neither doc uses:

- **`prevalence` is who is *born able*.** Content, fixed for a run.
- **Founding knowledge is what is *known*.** State, and the god's to move.

Elves and dragons at `prevalence: 1024` are *born able* — every one of them — and still know
nothing at tick 0. **A world can be wholly magical and hold no magic.** That is the pre-magic
condition, exactly, and it is already expressible.

So the god does precede magic, but not because she is its only source. She precedes it because
**being able** and **knowing** are different quantities, and she is the only actor who can move the
second one instantly. Everyone else has to work.

### The bootstrap, stated

Recommended reading of §1 and §7, which requires no code change and one sentence of vision edit:

> A god exists before her mages know anything. She does not create magical *people* — species
> arrive able or not able, and that is `prevalence`. What she creates is the **first thing known**.
> A universe left alone will find magic on its own, in months, if it has anyone able. A universe
> with nobody able waits forever.

**Falsifier:** set `foundingNodes: 0` on the reference scenario and run 600 ticks. The reading above
fails if `EVER_KNOWN` is empty at tick 600 — i.e. if the god's grant really is the only source.
Measured today: 137 nodes, first at tick 5.

## 5. How magic is discovered, and where `unlocking-magic.md` cannot reach

`docs/design/unlocking-magic.md` already owns the *second and every subsequent* discovery, from the
owner, 2026-08-13:

> *"A new kind of magic is discovered the way a new kind of science is: by a person. … Worship
> accrues into a charge; the charge is spent on **a student at a university**; that student founds
> a discipline."*

and its equivalence class is settled:

> *"A grant is foundational when it is the **first node held in a cell this universe has never held
> anything in**."*

**That mechanism cannot produce the first discovery, and the reason is structural, not a bug.** It
requires *a student at a university*. A pre-magic world has no university — `foundAcademy` is the
only thing that creates one at tick 0, and `fundUniversity` is god action 11, which costs favor,
which comes from worship, which comes from mages. **Every route into the loop runs through the
loop.** That is the bootstrap the author's question opens, and `unlocking-magic.md` does not close
it because it never had to: it assumed the opening square was already drawn.

### Proposal: the opening is a scenario, and the first grant is the only one outside the loop

Three initial conditions, all expressible in `ReferenceOptions` shape, none of them a rule change:

1. **`foundingUniversities: 0` — no academy.** Shelter, food, laborers, scribes, territory
   holdings, materials. Today's `noMages` arm is already exactly this world minus the guard at
   `reference-universe.ts:886`.
2. **`foundingNodes: 0` — nothing known.** Not *"magic is forbidden"* — the ruleset is untouched
   and every permitted cell is still permitted. Simply: nobody has ever done any of it.
3. **`foundingMages: n` for a species-appropriate `n`** — see §8. This is the one that has to be
   non-zero, and §3 is why.

**Then the god's first move is god action 8**, and it is the only grant in the game that is made
outside the great-person mechanism, because it is the only one made before a university exists.
Every later one runs through `unlocking-magic.md`'s student. In `unlocking-magic.md`'s own terms
the first grant is *maximally* foundational — the first node held in the first cell this universe
has ever held anything in — so the two mechanisms agree on what the act means and differ only on
where the recipient comes from.

**Is a god with nothing to permit yet playable?** On the measurement in §2: a god of a universe
with *mages* has plenty to do from tick 0, because they are discovering at tick 5 whether she acts
or not, and what they discover is bounded by what she permits. A god of a universe with *no mages*
has nothing at all — 600 ticks of 45 laborers and 24 scribes. **So the god does not arrive before
the first mage; she arrives with her.** The playable opening is "a people, able, knowing nothing",
not "a people".

**Falsifier for the whole of §5:** build the three-condition opening and run it passive for 1,200
ticks. It fails if the universe never founds a university at all — if favor never crosses
`found-university-cost` without a university to worship from, the opening is unplayable and the
bootstrap needs a rule, not a scenario. `balance/results-w119-founding.md`'s probe trace says the
price is crossed at world tick 9 from zero favor, which is the reason to expect this to work; that
trace was taken on a universe that *had* an academy, which is the reason it must be re-taken.

## 6. `w119/start-with-no-university`: what it measured, and whether it is re-landable

**What it is.** `origin/w119/start-with-no-university` is two commits.
`a2782db6` — *"a founding instrument, so 'nobody founds a university' can be measured"* — **is
already an ancestor of this tree** (`git merge-base --is-ancestor a2782db6 HEAD` → yes). Its
`FoundingAudit`, `WorldStepReport.universitiesStanding` and the four `tools/w119/*.mjs` are all
present here. Only the tip `1afb9e68` — *"MEASURED, NOT FOR MERGE: remove the founding academy from
the reference universe"* — is not.

**What it measured.** `balance/results-w119-founding.md`, 600 ticks, thirteen strategies. The
finding it exists for:

> *"`permissive-breadth` submits action 11 four times in 600 ticks and names slot 0 **zero** times.
> It founds nothing — and not because it cannot afford to: it could have paid the founding price on
> 566 of 600 ticks. The promotion that was added to fix this is conditional on
> `universityCount === 0`, and the starting position seeds a completed academy, so the condition is
> false before tick 0 exists. **The fix is gated on a condition the scenario permanently
> falsifies.**"*

Plus the pacing number Part 1 leans on: from zero favor with nothing standing, the founding price
is crossed at **world tick 9**, and a second university at **tick 17**.

**Its stated blocker.** The tip commit's own body:

> *"the passive control freezes at world-year 80 with 11 mages, 0 research and 0 teaching, because
> `completeAffiliation` has no caller and no mage born after tick 0 ever affiliates — so no
> university the god founds is ever staffed by a mage who can scribe. Wire `affiliate` first, then
> re-land this."*

**Half the blocker is discharged; the other half is not, and I measured it.**

`completeAffiliation` now has a production caller —
`packages/coordination/src/world-step.ts:2749`, `const destination = completeAffiliation(record, {`
— installed during tonight's campaign. That is true as code reachability.

It is not true as *exercise*. Probe on this tree, 600 ticks, both arms, positive control =
tick-0 affiliated count must equal the founding-mage count (6, one per species):

| arm | control: affiliated at tick 0 | mages ever created | mages first seen **unaffiliated** | unaffiliated mage-ticks | 0→non-zero transitions | uni→uni transitions |
|---|---|---|---|---|---|---|
| passive | 6 / 6 ✓ | 30 | **0** | **0** | **0** | **0** |
| god funds (action 11 every tick, 1 → 6 universities) | 6 / 6 ✓ | 30 | **0** | **0** | **0** | **0** |

**In 600 ticks of the reference universe no mage is ever unaffiliated for a single tick.** Every
mage is created holding a university, so the *first-affiliation* branch of `completeAffiliation` —
the one w119 needed — is never exercised, because no mage is ever eligible for it. In the funding arm the god founds five further
universities and **not one mage ever joins any of them**: all 22 living mages at tick 600 sit in the
tick-0 academy.

This is the shape `CLAUDE.md` warns about — *"the engagement branch is evaluated zero times"* —
arriving a second time. The wiring is real; the path w119 was blocked on has simply never been
reached from a starting position that hands every mage an academy. **What is measured is
eligibility, not evaluation** — zero unaffiliated mage-ticks means the branch never had an input,
which is a weaker and more honest claim than *the branch ran and did nothing*.

**Verdict: re-landable, but not as a merge — as a scenario option, and the guard is what has to
move.** Concretely:

- The mechanism w119 needed **now exists** and the "no caller" half of its blocker is gone.
- Whether it *works* is **unmeasured**, and unmeasurable from the shipped starting position,
  because that position never produces an unaffiliated mage for it to act on.
- `1afb9e68`'s approach — delete the academy from `buildReferenceState` — should **not** be
  re-landed as written. `foundingUniversities` (`reference-universe.ts:389`) already exists as the
  instrument, and deleting the academy unconditionally would also break the founder round-robin at
  `reference-universe.ts:961`, which indexes `universities[founders.length % universities.length]`
  and divides by zero at zero universities.
- **The change is to the guard at `reference-universe.ts:886-892`, and it is one sentence of
  reasoning, not one line of code.** That guard refuses zero for a stated reason —
  *"A universe with no academy can never teach and never scribe"* — which was true when
  `completeAffiliation` had no caller and is now **unverified rather than known**. Lifting it is a
  code change and out of this document's scope; it is proposed here with its falsifier.

**Falsifier:** permit `foundingUniversities: 0` (handling the round-robin at zero), run the passive
arm 1,200 ticks, and count 0→non-zero `universityId` transitions into a university founded after
tick 0. The proposal fails — and `1afb9e68`'s "NOT FOR MERGE" stands — if the run still freezes with
0 research and 0 teaching, or if that transition count is zero. It succeeds if a god-founded
university is ever staffed by a mage who was not founded into it.

## 7. A second finding the same probes turned up: one species does not currently work

`unlocking-magic.md` states the founding rule as *"one species · a small square of the grid"* and
*"under one-species founding, the discipline your civilisation invents is invented by a member of
the only species you have."* `foundingSpeciesMask` (`reference-universe.ts:332`) is the instrument
for it.

Measured, 1,200 ticks (100 world years), `foundingNodes: 0`, passive, seed `20260813`. **Population
is controlled**: a single-species arm at `cohortSize: 384` starts with 1,152 people, which is
exactly what the six-species arm starts with at `cohortSize: 64`.

| founding | founding mages | mages ever created | ever-known nodes at 1200 | populace at 1200 |
|---|---|---|---|---|
| human only | 1 | **1** | **0** | 1,314 |
| elf only | 1 | **1** | 1 | 1,721 |
| dwarf only | 1 | **1** | 145 | 3,077 |
| draconic only | 1 | **1** | 39 | 1,871 |
| gnome only | 1 | **1** | 40 | 2,074 |
| orc only | 1 | **1** | 1 | 2,298 |
| **all six** (`cohortSize: 64`, same 1,152 people) | 1 each = 6 | **65** | 205 | 25,062 |

**No single-species universe creates a second mage in a century, at any population I tried** —
`cohortSize` 4, 64 and 384, i.e. 12, 192 and 1,152 people of one kind. The six-species control at
the same tick-0 headcount creates 65. It is not population.

It is **founder count**, and the same probe separates them. Single-species, `cohortSize: 384`, with
six founders instead of one:

| founding | mages ever created | mages alive at 1200 | ever-known nodes | populace |
|---|---|---|---|---|
| human ×6 | 6 | 6 | **1** | 1,320 |
| elf ×6 | **47** | 42 | **1** | 17,628 |
| dwarf ×6 | 6 | 6 | 76 | 3,037 |
| draconic ×6 | **18** | 15 | **187** | 22,392 |
| gnome ×6 | **115** | 55 | 93 | 23,323 |
| orc ×6 | **110** | 34 | **1** | 26,470 |

Six founders of one species unblocks the mage pipeline for elf, draconic, gnome and orc, and does
**not** unblock it for human or dwarf — the two whose `prevalence` is the 102 stand-in.

**So the smallest currently-viable universe is not one species with one mage.** Either the founding
population must be much larger than any of these, or one-species founding needs more than one
founder, or the pipeline has a defect at low mage counts. **I did not isolate which**, and this is
one seed per cell; it is reported as an observation, not a diagnosis.

**Falsifier:** run each single-species arm across a seed set with `foundingMages` swept 1…6. The
observation fails if any one-founder single-species arm produces a second mage — in which case
this is seed luck, not structure.

---

# Part 2 — The six-species timeline, and the orc verdict

## 8. Three sources, read whole

**Source 1 — the author's stated ordering.** Elves and dragons begin with magic; dwarves discover
it at some point; gnomes sit post-dwarf pre-human and are more magical *only because they are far
more curious*, not innately; humans late; orcs undecided.

**Source 2 — `packages/content/data/species.json`, every field, read on `38495600`.** All six carry
`"tuningStatus": "untuned"`, so no magnitude below is balanced and none may be claimed to be
(`release-plan.md`). `prevalence` is present on four and **absent on dwarf and gnome**, which
`contracts.md:662-666` makes load-bearing:

> *"OPTIONAL fp <= 1024; share of this species born able to do magic at all
> (magical-prevalence.md). **ABSENT IS MEANINGFUL:** the author authored four of the six species and
> left dwarf and gnome unstated rather than mix an author's number with a machine's. An absent value
> reads as rules-world's `PREVALENCE_WHEN_UNAUTHORED`, which is not authored content."*

`packages/rules-world/src/mages/enrolment.ts:81` — `export const PREVALENCE_WHEN_UNAUTHORED: Fixed = 102;`
— whose own gloss at `:70-72` says *"**This is not an authored number.** It is the human figure —
one in ten — standing in for dwarf and gnome, which `magical-prevalence.md` leaves blank on
purpose."*

| field | human | elf | dwarf | draconic | gnome | orc |
|---|---|---|---|---|---|---|
| `lifespanMonths` | 960 (80y) | 8400 (700y) | 3000 (250y) | **18000 (1500y)** | 4200 (350y) | **720 (60y)** |
| `maturityMonths` | 216 | 1800 | 600 | 3600 | 900 | **168** |
| `curiosity` | 1152 | 896 | 512 | **256** | **1792** | 384 |
| `depthCeiling` | 4 | 6 | 5 | **7** | 4 | **3** |
| `learnRate` | 1024 | 640 | 1024 | **384** | **1280** | 768 |
| `retention` | 1024 | 1280 | **1536** | **1536** | **512** | 896 |
| `fertility` | 1280 | **256** | 768 | **96** | 896 | **1536** |
| `scribeAffinity` | 1024 | 1024 | **1792** | 640 | 896 | **384** |
| `rediscoveryAffinity` | 1024 | 896 | 768 | 640 | **1792** | 512 |
| `mageAptitude` | 512 | 768 | 448 | **896** | 640 | **192** |
| `laborAffinity` | 1024 | 768 | 1280 | **512** | 768 | **1536** |
| **`prevalence`** | **102** | **1024** | *absent* | **1024** | *absent* | **51** |
| `affinities` | *(none)* | herbam 1536, mentem 1280 | terram 1536, ignem 1152 | ignem 1792, vim 1536, nomen 1280 | imaginem 1408, vim 1280 | terram 1280, corpus 1280 |

**Source 3 — `vision.md` §6, quoted verbatim** (lines 313-318):

> | **Human** | ~80y | High curiosity, high fertility, broad average aptitude. Wins on volume and breadth; loses knowledge constantly to mortality. |
> | **Elf** | ~700y | Moderate curiosity, high depth ceiling, slow to learn. Deep specialists. |
> | **Dwarf** | ~250y | Low curiosity, exceptional retention and scribing — dwarven grimoires resist destruction. The archivists. |
> | **Draconic** | ~1500y | Barely curious, highest depth ceiling, very slow learning, very low fertility. Few, ancient, and terrifying. |
> | **Gnome** | ~350y | Highest curiosity, discovery and *rediscovery* bonuses, poor retention. Erratic geniuses. |
> | **Orc** | ~60y | Low magical aptitude, high build-rate and martial capability, high fertility. |

**Every lifespan in §6 matches `species.json` exactly** (960/8400/3000/18000/4200/720 months), and
every character adjective matches its field's rank. §6 and the table do not disagree anywhere I
could find.

### The gnome claim is directly testable, and it holds

The author: gnomes are more magical than dwarves and humans *"largely not because they're
inherently more magic"* but *"because they're way more curious."*

- `curiosity`: gnome **1792, the highest of all six** — 1.56× human, 3.5× dwarf, 7× draconic.
- `rediscoveryAffinity`: gnome **1792, the highest of all six**.
- `prevalence`: gnome **authored nowhere**, falling back to the *human* figure. Gnomes are not
  authored as more innately magical than humans. They are authored as **exactly as innately magical
  as humans, and unauthored at that**.

**Confirmed, and by the strongest possible kind of evidence: the trait the claim denies is the one
the author declined to write.**

One friction to name rather than smooth over: gnome `mageAptitude` is **640** against human **512**,
which reads as "more innately magical". It is not, any more, and W197 is why. `mageAptitude` left
the enrolment gate; `enrolmentFraction(prevalence)` is now *"born able, and nothing else"*
(`enrolment.ts:95-96, 111`), and aptitude decides *what kind* of mage a graduate becomes
(`careers.ts:38` — *"`mageAptitude` (species content) | **what kind** of mage a graduate becomes"*;
`world-step.ts:3428`). **Gnome 640 now means a different career mix, not a wider door.** The claim
survives; the field that appeared to contradict it stopped meaning what it used to mean.

## 9. The timeline

Position is *when a people can have arrived*, and it matters mechanically: `inviteScholar` (god
action 16, `packages/agent-api/src/actions.ts:78`, cost 8 at `:164`) and portals are how a species
arrives at all. An older species is one whose knowledge you might inherit; a younger one is one
that might arrive later in a run.

Three columns, and the disagreements are in the rows.

| # | species | author's ordering | what the tuning votes | `vision.md` §6 | verdict |
|---|---|---|---|---|---|
| 1 | **Draconic** | *"dragons start off with it"* | `prevalence: 1024` — every dragon born able. `depthCeiling` **7**, the deepest. `curiosity` **256**, the lowest. `fertility` **96**, the lowest. `maturityMonths` 3600 = **300 years**, longer than most runs. | *"Few, ancient, and terrifying."* | **First, and first by a long way.** Nothing in the table is arranged for a dragon to *learn* magic; it is arranged for a dragon to already have it and hardly bother. Measured: draconic ×6 reaches **187 nodes**, the most of any single-species arm, on the second-lowest mage count. All three sources agree. |
| 2 | **Elf** | *"For elves they start off [with it]"* | `prevalence: 1024`. `depthCeiling` 6. `learnRate` **640** — slow. `retention` 1280. `fertility` **256**. `affinities` herbam 1536, mentem 1280 — the living world and the mind. | *"Deep specialists."* | **Second, and effectively co-first.** Elf and draconic are the only two authored at fp(1.0), and that is the one field that means *begins with it*. The separation between them is depth and time, not access. All three agree. |
| 3 | **Dwarf** | *"The dwarves gotta discover it at some point"* | **`prevalence` absent** → the human stand-in 102. `scribeAffinity` **1792**, the highest by a wide margin. `retention` 1536. `curiosity` 512, second-lowest. `affinities` terram 1536, ignem 1152 — stone and fire. | *"The archivists."* | **Third — and the tuning agrees by declining to speak.** An absent `prevalence` is precisely *"they had to discover it"*: not born to it, no authored number for how many of them are. What the table gives dwarves instead is **the machinery for keeping it once found** — best scribing, second-best retention, lowest curiosity. **A people who discover slowly and lose nothing.** |
| 4 | **Gnome** | *"post-dwarves pre-human … more magical … only because they're way more curious"* | **`prevalence` absent** → 102, the same as human. `curiosity` **1792** and `rediscoveryAffinity` **1792**, both the highest. `retention` **512**, the lowest. `learnRate` **1280**, the highest. | *"Erratic geniuses."* | **Fourth, and the position is *earned by curiosity alone*** — see §8. Gnomes are post-dwarf because they too must discover it, and pre-human because they discover **3.5× faster** at the same innate access. Measured: gnome ×6 produces **115 mages**, the most of any arm. All three agree, and this is the row where the tuning most clearly *tells the author's story back to him*. |
| 5 | **Human** | *"humans late"* | `prevalence` **102** — one in ten, the author's own figure from `magical-prevalence.md`. `curiosity` 1152, second-highest. `fertility` 1280. `depthCeiling` 4. `lifespanMonths` 960 — the shortest but one. | *"Wins on volume and breadth; loses knowledge constantly to mortality."* | **Fifth.** One in ten born able, a short life to use it in, and volume as the compensation. Measured: the human ×6 arm reaches **1 node in a century** — the worst of the six — which is what "late and numerous" looks like before the numbers arrive. All three agree. |
| 6 | **Orc** | *undecided — the question* | `prevalence` **51**, the lowest, exactly half of human. `mageAptitude` **192**, the lowest. `depthCeiling` **3**, the lowest. `curiosity` 384. `scribeAffinity` **384**, the lowest. `rediscoveryAffinity` 512. `lifespanMonths` **720** — the shortest, *shorter than human*. `fertility` **1536** and `laborAffinity` **1536**, both the highest. `affinities` terram 1280, corpus 1280. | *"Low magical aptitude, high build-rate and martial capability, high fertility."* | **Sixth. Youngest. See §10.** |

## 10. The orc verdict

### The comparative

**Tolkien.** Orcs are corrupted stock. *The Silmarillion*: Melkor takes captives from among the
Quendi at Cuiviénen and ruins them; the Orcs descend from Elves. Tolkien was never settled on it —
later notes in *Morgoth's Ring* push toward corrupted Men, or toward beasts given speech, precisely
because the Elvish origin made orcs immortal and gave them *fëar*, which he found intolerable. Two
things hold across every version: orcs are **derivative** and orcs are **later** than whatever they
were made from. On the awakening order the author half-remembered correctly — Elves wake first,
Aulë's Dwarves were made earlier but *slept* until after the Elves woke, Men come last — orcs land
after Elves and before Men. (And the author's instinct on gnomes is right for a nice reason:
Tolkien did use "Gnomes", but as an early rendering of *Noldor*. The gnome of the tinkering,
curious, small-and-clever kind is D&D's, not his.)

**D&D.** Orcs are their own creation — Gruumsh's people, a peer species, not a ruin of anything.
Not corrupted, not derivative, and no more or less recent than dwarves or humans in most settings.

**Warcraft.** Orcs are an independent species from another world with a genuine native magic —
shamanism, and a good one. Their corruption is a *fall*, and it arrives late and from outside.

**Warhammer.** Orks are engineered — fungal soldiery built by the Old Ones. Ancient, but
manufactured, and possessed of a real (psychic, collective) magic of their own.

**So "orcs are corrupted elves" is a Tolkien position, not a genre one**, and it is the one position
Tolkien himself kept trying to get out of.

### What each story predicts about the table

**Corruption predicts residue.** A ruined lineage keeps the marks of what it was ruined from:

- elf-shaped `affinities` — some echo of herbam or mentem;
- a `prevalence` that is *high and broken* rather than low. Corruption damages what you can do with
  the gift, not whether you are born with it. Tolkien's orcs cast, curse and forge;
- a `lifespan` anomaly — longer than a natural creature's, because that is the thing that troubled
  Tolkien about the origin;
- a **collapsed** `depthCeiling` and **wrecked** `retention` against an intact access — the shape of
  something that once reached further.

**The shipped table has none of that. It has a uniform floor.** Orcs are last or nearly last in
`prevalence` (51), `mageAptitude` (192), `depthCeiling` (3), `scribeAffinity` (384),
`rediscoveryAffinity` (512) and `lifespanMonths` (720), and first in `fertility` (1536) and
`laborAffinity` (1536). The `affinities` are **terram and corpus** — earth and body — with no
herbam, no mentem, no echo of elf anywhere. And `retention` is **896**, not wrecked; a corrupted
people who kept nothing would sit at gnome's 512 or below.

The lifespan is the decisive one. **Orc 720 months is shorter than human's 960.** Corruption from a
700-year people does not land you *below* the unrelated baseline; a shortened-but-still-long life is
what a ruin looks like, and 60 years is what a *young, fast, fertile, mortal* people looks like.

And the number that settles it: **51 is exactly half of human's 102.** It is a figure written
relative to *humans*, not a fraction of elf's 1024. Whoever authored it was answering
`magical-prevalence.md`'s *"few orcs learn magic"* against the human one-in-ten, not modelling a
fall from 100%.

### Verdict

> **Orcs are the youngest of the six. They are their own lineage, not corrupted stock, and they
> never had much magic to lose.**
>
> Not Tolkien's orcs. D&D's and Warcraft's — a people of their own, arriving last, numerous and
> short-lived and strong, whose relationship to magic is thin because it has always been thin and
> because they have had the least time. Their `terram` and `corpus` affinities say what kind of
> magic they do have: **earth and body, worked directly.** Not a scholar's magic; a smith's and a
> shaman's. `scribeAffinity` 384, the lowest of the six, says the rest — **orcish magic is not
> written down**, so orcs are the one species whose knowledge does not survive them, and the one
> whose grimoires you cannot inherit.

**The tuning has already committed the game to this**, and it committed before anyone asked the
question. Four fields would have to move to tell the other story — `prevalence` up toward elf's,
`lifespan` up past human's, `affinities` re-pointed at herbam or mentem, `depthCeiling` and
`retention` re-shaped into ruin — and a fifth question would open behind them: **why did elf
`prevalence: 1024` survive the corruption intact?** It is far easier to write fiction to the number.

**The timeline consequence, which is the mechanical stake.** Orcs are the youngest, so:

- an orc universe is the one most likely to *inherit* rather than discover — `inviteScholar`
  (action 16) and portal arrival matter more to orcs than to anyone;
- no other species can inherit orcish knowledge, because `scribeAffinity` 384 means there is rarely
  a book;
- and **an orc hamlet under 21 people contains no mage at all** (§3), which is the largest such
  threshold in the game and the most literal possible statement of "few orcs learn magic".

**Falsifier for the verdict:** it is a fiction ruling, so what can falsify it is the *tuning* moving
against it. It fails if a future authored `prevalence` for orcs rises above human's 102, or if orc
`lifespanMonths` is raised above 960 — either would make the corruption reading cheaper than the
independent-lineage one, and this section should then be rewritten rather than defended.

## 11. Where the tuning table and the fiction disagree

Five, in the order they cost the most.

1. **`vision.md` §7:360 says founding knowledge is *"the only way to introduce a body of magic
   nobody in your world knows."* It is not.** Measured §2(c): six mages granted nothing hold two
   nodes at world tick 5 and 137 at tick 600. **Believe the code.** §4 proposes the reconciliation
   (born-able vs known) and it needs one sentence in §1 and one in §7.

2. **`unlocking-magic.md` states one-species founding as the rule. No single-species universe
   produces a second mage in a century** at 12, 192 or 1,152 people, on this seed (§7). The
   six-species control at the same headcount produces 65. Cause not isolated; reported as an
   observation.

3. **`packages/coordination/src/world-step.ts:3488` says an orc cohort under about 114 contributes
   nobody. The shipped figure is 21.** The comment describes the two-factor gate W197 removed.
   **Believe the code.**

4. **`docs/design/macro-university-model.md:282` says *"Orc prevalence = 0.02 quantifies 'few
   orcs'. The only invented prevalence used anywhere."*** The authored figure is `51 / 1024` =
   **0.0498**, two and a half times that, and it is **not invented** — it is one of the four the
   author wrote. **Believe `species.json`.** The model is running an orc arm at less than half the
   shipped access.

5. **`docs/design/audit-world.md:50` records `prevalence` as **ABSENT** from `packages`,** with a
   positive control showing `git grep prevalence -- packages` returning 0. That was true on the ref
   it names; it is false here. On `38495600`, `prevalence` is in `species.json` (4 rows), in the
   schema (`packages/content/schema/species.schema.json:45,65`), in the types
   (`packages/content/src/types.ts:309`) and **wired into the world loop** at
   `world-step.ts:3497`. `CLAUDE.md`'s rule applies: a document is a statement about the tree it was
   taken on, and this row has rotted.

## 12. The falsifiers, collected

| # | proposal | falsifying measurement | fails if |
|---|---|---|---|
| 1 | The god precedes magic but is not its only source (§4) | `foundingNodes: 0`, 600 ticks passive, count `EVER_KNOWN` | the set is empty at tick 600 (measured today: 137, first at tick 5) |
| 2 | The pre-magic opening is three scenario conditions, not a rule change (§5) | build it, run 1,200 ticks passive | no university is ever founded — favor never crosses `found-university-cost` without a university to worship from |
| 3 | `w119` is re-landable via `foundingUniversities: 0` rather than by deleting the academy (§6) | permit zero, run the passive arm 1,200 ticks, count 0→non-zero `universityId` transitions **into a university founded after tick 0** | the count is zero, or the run still freezes at 0 research and 0 teaching. `1afb9e68`'s "NOT FOR MERGE" then stands |
| 4 | The god arrives with the first mage, not before her (§5) | `foundingMages: 0`, 600 ticks | any mage is ever created (measured today: zero, and `noMages` is byte-identical to `neither`) |
| 5 | One-species founding does not currently work (§7) | each single-species arm across a seed set, `foundingMages` swept 1…6 | any one-founder single-species arm produces a second mage — then it is seed luck, not structure |
| 6 | Gnomes are magical through curiosity, not innate access (§8) | re-read `species.json` | an authored gnome `prevalence` appears above 102 |
| 7 | Orcs are a young independent lineage, not corrupted stock (§10) | the tuning moving against it | orc `prevalence` is authored above 102, or `lifespanMonths` above 960 |

## 13. What this document does not settle

- **Which species the smallest system is founded as.** §7 says one species does not work today and
  does not say why. That has to be answered before the opening can be authored, and it is a
  measurement, not a decision.
- **How many founding mages a pre-magic opening needs.** §3 gives the arithmetic floor per species
  (1 / 1 / 11 / 11 / 11 / 21 people to contain one latent mage); it does not give the number of
  *actual* founders a playable opening needs.
- **The dwarf and gnome `prevalence` numbers.** They remain the author's to write, and
  `contracts.md:662-666` is right that a stand-in is better than a guess dressed as content. But
  note what §9 found: **the absence is itself the timeline evidence** — it is what says "these two
  discovered it." Filling them in should preserve that reading, which means both belong below elf
  and draconic and neither has to be exactly 102.
- **Whether `foundingUniversities: 0` should stay refused.** The guard's stated reason is now
  unverified rather than known. Lifting it is code, and code is out of scope here.
