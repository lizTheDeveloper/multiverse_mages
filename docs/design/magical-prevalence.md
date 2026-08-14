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
