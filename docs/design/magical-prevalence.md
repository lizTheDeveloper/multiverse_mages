<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Magical prevalence: where mages come from

**Owner's design, 2026-08-14. Recorded verbatim in substance before it is implemented, because the
numbers here are the author's and the reasoning behind them is not recoverable from the code.**

Measured against `main` at `7694528`. `species.json` today carries `curiosity`, `learnRate`,
`retention`, `fertility`, `mageAptitude`, `depthCeiling`, `scribeAffinity`, `rediscoveryAffinity`,
`laborAffinity` and per-form `affinities` — **and nothing that says what fraction of a population can
do magic at all.**

## The pipeline

> *"Students should spawn naturally. From the population. And so they're a factor of the population.
> What's the factor? Different per species. Magic is present in some percentage of the population. So
> you gotta have a population size and that gives you your magic user size. Some number of those
> people never get discovered because their skills are very weak. And some people go to school for
> it."*

Three quantities, and **the gap between them is the game**:

1. **Population** — already modelled.
2. **Latent magic users** = population × **magical prevalence**, a new per-species content field.
3. **Activated mages** = latent × whatever fraction education actually reaches.

## Why the player must be shown the formula

> *"It would be more instructive for the player that they see the population formula and the magical
> prevalence in their species, so they know how many people **should** be magic users versus how many
> they're **finding**. That's the inequality in the population. If magical education is not accessible
> then it's hard."*

**The visible gap between "should be" and "are" is the university's reason to exist.** Not research
throughput — *activation*. A god looking at "12,000 people, 1,200 latent, 340 found" has an
immediately legible problem and an obvious lever, and neither of those exists in the game today.

This also answers a question the university evaluation harness was asked and could not previously
answer well: **what does a university add to the world?** It converts latent magic users into real
ones.

> *"The more universities you have, the more latent magic users you can activate — that would be a
> good thing."*

And it should start low: *"maybe in the beginning it can be lower, because you have less good access
to education."* So early game is *deliberately* leaving talent on the table, and the arc of a run is
closing that gap.

## The authored numbers

> *"All dragons learn magic. All elves learn magic. Few orcs learn magic. I would say like one in ten
> humans can do magic, and maybe eight out of those ten actually attend school."*

| species | prevalence | attend, at full access |
| --- | --- | --- |
| draconic | **all** | — |
| elf | **all** | — |
| human | **~1 in 10** | **~8 of 10** |
| orc | **few** | — |
| dwarf | unstated | unstated |
| gnome | unstated | unstated |

Dwarf and gnome are **deliberately left blank rather than guessed.** Two of the six are unspecified
and inventing them would put an author's number and a machine's number in the same table with nothing
to tell them apart. `tuningStatus` exists for exactly this distinction.

**Note what "all dragons learn magic" does to the existing draconic problem.** Draconic fertility is
96 and its maturity is 3,600 months against a 2,400-tick run, so *no draconic born in a run becomes a
mage in it*. Prevalence of 1.0 against a tiny, slow population is a completely different shape from
human's 0.1 against a large fast one — **and that is a differentiation lever the campaign has never
tried.**

## Students are mages

> *"Students are immediately mages. They're just student mages — until they become battle mages,
> populace mages who just have a job, and then people you can send through the portal, or people who
> are able to defend at any given random time."*

There is no separate student entity. A student **is** a mage in an early role, which means the
existing role machinery is the right home for this and no new entity kind is needed.

The named end states:

- **student mage** — the entry role
- **battle mage**
- **populace mage** — has an ordinary job
- **portal-goer** — can be sent through
- **defender** — able to defend at any random time

Today's roles are `researcher`, `warden`, `professor`, `raider`, and `DEFENDING_ROLES` is all four —
**every living mage defends.** So "able to defend at any given random time" is already true of
everyone, and the taxonomy above is a *reshaping* of the role set, not an addition to it. Whoever
implements this must reconcile the two lists deliberately rather than appending.

## The two halves are different kinds of thing, and that is the design

> *"'Is magic user' is a species-level thing, and 'will access education' is population × university
> count / capacity."*

**Prevalence is content; access is state.** Your species sets the ceiling and your buildings set how
much of it you reach. That separation is what makes the gap legible to a player and what makes
university-building the lever that closes it:

    latent      = population × prevalence[species]        <- content, fixed for a run
    activated   = f(population, university count, capacity)  <- state, the god's to move

The exact functional form is **not decided here** — *"population × university count / capacity"* reads
most naturally as *access is bounded by how much seating exists relative to the people who need it*,
but whether that is `min(1, seats / latent)`, something with diminishing returns per additional
university, or something else is the author's. **Writing a plausible formula into code is how a
placeholder becomes a balance constant nobody remembers inventing.**

## Class capacity is species-shaped, and `species.json` already says so

> *"A class of 12 is the practical limit for humans. Gnomes forget, dwarves remember — so gnomes have
> smaller classes and are more curious than dwarves, but dwarves have larger class capacity because of
> their better bookkeeping."*

**The shipped content already encodes this, unprompted.** On `main`:

| species | `retention` | `curiosity` | `scribeAffinity` |
| --- | ---: | ---: | ---: |
| dwarf | **1536** | 512 | **1792** |
| draconic | 1536 | 256 | 640 |
| elf | 1280 | 896 | 1024 |
| **human** | **1024** | 1152 | 1024 |
| orc | 896 | 384 | 384 |
| gnome | **512** | **1792** | 896 |

Gnome is **lowest retention and highest curiosity**; dwarf is **high retention, lowest-but-one
curiosity, and best scribing by a wide margin**; human sits at exactly `1024`, the fixed-point unit —
which is the species the author named the baseline of 12 for.

So class capacity has an obvious candidate derivation rather than a new authored field:

    capacity = 12 × retention / 1024

giving **dwarf and draconic 18, elf 15, human 12, orc 10, gnome 6.** That is a real spread, it is
already in the data, and nobody has to invent it.

Two things to decide, both the author's: whether *"better bookkeeping"* means `retention` alone or
`retention` combined with `scribeAffinity` — dwarf leads both, so the two are indistinguishable on
dwarf and differ sharply on **draconic**, which has high retention and poor scribing. And whether
capacity is per class, per professor, or per university.

**Note what the gnome case buys.** Highest curiosity and smallest classes is a genuine strategic
identity — gnomes find things fastest and can teach them to the fewest people — and it is exactly the
kind of per-species plurality task 9.9 has failed twice to produce by tuning rates. It comes for free
from numbers already shipped.

### Capacity is a base, not a ceiling — and that is where humans win

> *"Humans, once they build a big university system, can accommodate larger class sizes. Like, when
> you have administrative golems — aka AIs — you can manage more students at a time."*

So `12 × retention / 1024` is a **starting point**, and the interesting quantity is how it *grows*.
That turns a static species table into three distinct strategic identities:

| species | shape |
| --- | --- |
| **dwarf** | starts large (18) on memory, and grows least — the advantage is innate and already spent |
| **gnome** | starts smallest (6) but finds things fastest — teaches few people a great deal |
| **human** | starts at the baseline (12) and **scales through administration** — the only one whose capacity is a *build order* |

**That is per-species plurality of exactly the kind task 9.9 has failed twice to produce**, and it is
better than what either failed attempt tried, because it differentiates on **trajectory** rather than
on a rate. A species that is worse at tick zero and better at tick two thousand is a strategy; a
species with a 1.2× multiplier is a stat.

**Administrative golems are a discoverable technology, not a species trait.** That matters: it means
the human advantage is *available* rather than granted, it gives the god something to permit and fund,
and it is a natural home for grid cells that currently do nothing — a golem is plausibly *Rego* over
*Terram* or *Imaginem*, both of which have authored nodes and no consumer.

Design questions left open, all the author's: whether golems are a node effect on a new
`class-capacity` primitive or a modifier on an existing one; whether the scaling is per university or
universe-wide; and whether other species can build them at all, or merely build them worse. **"Humans
scale, dwarves start ahead" is a much sharper claim if the other species can also try and do it
badly.**

## Graduation: a student until the university has nothing left to teach

> *"They're students until they learn everything that the university they enrolled in can teach them."*

A crisp, implementable condition, and it does more work than it looks like:

- **University depth becomes the thing that matters**, not just capacity. A shallow university
  graduates people quickly and shallowly; a deep one holds them. That is a real tradeoff for a god
  deciding where to spend.
- **Transferring between institutions becomes meaningful.** A graduate of a shallow school has
  somewhere to go, which gives `affiliate`'s *transfer* case — priced at 64 against a first
  affiliation's 512 in #134 — an actual population to act on.
- **It couples to the telephone problem.** A university whose library has decayed to low mētis can
  only graduate students into what its books still carry, so an institution that stops teaching from
  living holders degrades what it can produce, not merely what it holds.
- **It gives the university harness a natural output column**: time-to-graduation as a function of
  library depth and staff, which is exactly the "does a university have increasing XYZ" question the
  manual mode was asked for.

The obvious failure mode to design against: a university with *nothing* to teach graduates its
students instantly, which would make a bare founding a mage factory. Whether the floor is a minimum
tenure, a minimum node count, or something else is not decided here.

## The content is over-weighted to battle tech, and here is the measurement

> *"Some of these would be great new tech, right? It's one of those things that upgrades your
> capabilities and improves your universe — and it's not like a battle tech. Need more of that."*

Counted from `node.json` and `cell.json` on `main` at `7694528`:

| category | primitives | authored effects | inside the v1 rectangle |
| --- | ---: | ---: | ---: |
| **combat** | **7** | **187** | **33** |
| economic | 3 | 103 | 12 |
| academic | 3 | 93 | 16 |
| **demographic** | 2 | 22 | **0** |
| traversal | 1 | 2 | 2 |

**Seven of sixteen primitives are combat, and they carry 46% of every authored effect in the game.**
Against that, *"upgrades your capabilities and improves your universe"* has three economic and three
academic primitives, and the two most obviously civilisational ones — `fertility` and `lifespan` —
carry **22 authored effects with no node-driven consumer at all** and **zero presence in the enabled
twelve**.

So the observation is right and it is worse than it looks: the game is not merely light on civil tech,
**its two purest civil primitives are the only two in the whole registry that nothing reads.** A god
who wants to make their people more numerous or longer-lived is authoring against a wall.

And there is **no primitive at all** for institutional capacity — the thing administrative golems
would move. That is a gap in the registry, not just in the content.

### Where the room is

Three of these need no new primitive, only a consumer:

- **`fertility`** (5 authored effects, 0 in v1, no consumer) — population is the input to *everything*
  in the prevalence pipeline above. Magic that makes a people more numerous makes every latent mage
  count larger.
- **`lifespan`** (17 authored, 0 in v1, no consumer) — and this one is sharp, because a longer-lived
  mage is more teaching generations before the telephone problem takes the knowledge. It is civil tech
  that directly counters knowledge loss.
- **`build-rate`** already works but **stops mattering entirely** under seventy open cells — the
  magnitudes reaching construction fall from `{128,192,256,384}` to `{128,192}` because nobody gets
  deep enough into *Rego Terram*.

And at least one wants a new primitive: **institutional capacity**, which golems, larger classes, and
plausibly library shelving all move.

**The cheapest real win here is `lifespan` and `fertility` getting consumers**, because the effects are
already authored and the pipeline that would use them is the one being designed on this page.

## Implementation record: what W193 and W197 actually shipped

**Added 2026-08-14, measured on `w197/aptitude-sorts-careers`. This section is dated because the
rest of this page is the author's design and the numbers below are a machine's measurements of one
ref — the two must not be read as the same kind of statement.**

Two changes landed against this page, and the second corrected the first:

- **W193 (#181)** made students `MAGE` entities in a `student` role, moved the crossing from the
  aggregate into the individual from *graduation* to *enrolment*, and made student demand
  `min(universityCapacity, latentMagicUsers)` instead of `universityCapacity`. It read
  *"some never get discovered because their skills are weak"* as a **second gate** and applied
  `prevalence × mageAptitude` at enrolment.
- **W197** removed `mageAptitude` from that gate entirely, on the owner's design: *"the point of
  the mage aptitude was to create something for the other half of people to do."* Aptitude now
  decides **what kind of mage a graduate becomes**, never whether she becomes one.

### Where the taxonomy landed

The page above says the named end states are *"a reshaping of the role set, not an addition to it"*
and that whoever implements it *"must reconcile the two lists deliberately rather than appending"*.
The reconciliation, recorded:

| named end state | shipped as |
| --- | --- |
| student mage | `MAGE_ROLE.student` (W193) |
| **populace mage** | **`MAGE_ROLE.populace` (W197)** — a new role, because all four standing roles are institutional and none of them meant *"has an ordinary job"* |
| battle mage | `warden` / `raider`, assigned by the god's action 10 out of the academic pool |
| portal-goer | `raider` |
| defender | every standing role, `populace` included — `DEFENDING_ROLES` is now five |

`populace` is **not** god-assignable. Graduation sorts mages down into it and action 10 is how one
comes back out, which is the *"who gets to keep going"* decision this page asks for, at no cost to
the action-10 candidate space every trained policy is sized against.

### `prevalence` was being applied twice, and that is why seats never bound

Found while retuning, and it is W193's code rather than W197's design: `latentMagicUsers` applied
`prevalence` to size student demand, and `enrolMaturedStudents` then applied it **again** to the
pool demand had just sized. A universe therefore enrolled roughly a tenth of the people it had just
decided were latent, and `unseated` — the number this page calls the god's half of the gap — was
**zero on every tick of a 1,200-tick run**. University capacity constrained nothing.

W197 applies it once, in the demand controller, which is the pipeline this page draws.

### The numbers, four seeds, 1,200 ticks each

| ref | living mages | **working mages** | population | enrolments | seats ever bind |
| --- | ---: | ---: | ---: | ---: | --- |
| `main` at `cf5a73a7` (pre-#181) | 60.8 | 60.8 | 5,518 | — | n/a |
| `w193/students-are-entities` at `a5aeb8f6` | 33.5 | 30.5 | 7,168 | 47.8 | **never** |
| `w197/aptitude-sorts-careers` | 81.0 | 58.3 | 3,953 | 186.5 | **every seed** |

Means over seeds 589825, 1234567, 42424242, 7777777. *Working* excludes students, so it is the
column comparable with pre-#181, and it lands within 4% of it — **with `species.json` prevalence
left at the values quoted above.** No authored number was moved to get there.

**Population fell 45% against W193 and 28% against `main`, and the mechanism is on this page's own
terms:** an enrolled student is `cohorts.remove`d from the populace permanently, at exactly
reproductive age, and W197 enrols four times as many of them. Activating latent mages therefore has
a demographic price that compounds over a run. That is a real coupling and it is not tuned; whether
it is the intended shape is the author's call.

## What this bears on

- **Task 9.9, species differentiation** — unmet on every ref tested, with two approaches tried and
  neither moving it. **Both were measured on a fixed population pipeline.** Per-species prevalence
  changes *how many mages a species gets at all*, which is structurally larger than any rate
  multiplier tried so far. This is the most promising untried lever.
- **The university harness** — "what does a university add to the world" now has a first-class
  answer to measure.
- **`scribingQueueDepth`** and the telephone problem — a separate decision, recorded elsewhere.

## What is deliberately not decided here

The functional form of *access* — whether activation is a fraction of university capacity, a function
of seats, or something else — and the dwarf and gnome numbers. Both are the author's to set, and
**guessing them in code is how a placeholder becomes a balance constant nobody remembers inventing.**

## Not all mages should be equal — the population needs a base, not a peak

> *"Not all mages are the same or should be created equal. You need low-level spellcasters to stay in
> the population to continuously cast — identify objects, so they can keep the economy running or
> whatever the hell."*

**The distribution of mage depth matters, not just the count.** A universe of all-archmages starves:
nobody is doing the small continuous work the economy runs on. So the shape of the pyramid is a thing
a god manages, and *"my mages are all very advanced"* should be a *failure state* as legible as
*"my mages are all novices."*

This is already half-built and pointing the right way:

- **`GOAL.applyMagic`** (#127) is exactly this verb — a mage spends the month casting a node she holds
  *at the world*, costing her the month and her rations and putting materials into the stocks. It was
  the first goal in the game that *uses* magic rather than accumulating it.
- Its measured null is the same story from the other side: **five of 59 `resource-yield` effects are in
  enabled cells and all five route to stone**, and stone buys nothing without a god action. **The base
  of the pyramid has nothing useful to cast.** That is a content gap, not a mechanism gap.
- And the **populace mage** role named earlier — *"who just have a job"* — is the population this
  applies to.

So three things line up: a role that exists, a verb that exists, and **nothing worth casting at the
bottom of the tree.** *"Identify objects"* is the archetype and there is nothing like it authored —
low-tier, endlessly repeatable, individually trivial, collectively load-bearing.

**That is the sharpest content ask to come out of this conversation**, and it is cheap: it needs no new
primitive and no new mechanic, only low-tier nodes whose effects feed the economy, in cells a starting
universe can actually reach.

### It also changes what graduation means

If students graduate when their university has nothing left to teach, and most students only ever reach
the shallow end, then **most graduates are permanently the base of the pyramid** — and that is correct
rather than a bug. The interesting question becomes *who gets to keep going*, which is a decision a god
makes with limited seats, and it is exactly the inequality the visible prevalence formula is meant to
expose.
