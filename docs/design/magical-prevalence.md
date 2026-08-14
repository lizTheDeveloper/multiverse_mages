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
