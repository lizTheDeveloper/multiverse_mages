<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Founding is one species, and alliances are how you get the others

*Decision, 2026-08-13, from the owner. This is a rule change, and it invalidates a control the
campaign has been measuring against.*

## The rule

**A universe founds with one species.** Not six, not "all". Getting academics of another species
requires an **alliance** — visiting mages, sent mages, and the trade of scholars between realms.

## What it invalidates, and this is the important part

The species sweep (W105) measured seven arms and reported: *"founding with all six beats founding with
any one, 34 of 36 paired cells negative at >3 paired SE."*

**That result was measured against a control that should not be legal.** `all six` is the shipped
default — `DEFAULT_FOUNDING_SPECIES_MASK = 0`, and zero means every species — and every per-species
number in this project is an all-six number.

Read under the new rule, the table says something completely different:

| founding mix | ascended | nodes known | living mages |
|---|--:|--:|--:|
| ~~all six~~ *(no longer legal)* | ~~20/100~~ | ~~73.41~~ | ~~324.30~~ |
| **elf** | **20/100** | 54.03 | 2.84 |
| **gnome** | 17/100 | 56.63 | 30.28 |
| **human** | 6/100 | 39.62 | 174.68 |
| **dwarf** | 2/100 | 30.30 | 29.56 |
| **orc** | 2/100 | 15.78 | 138.14 |
| **draconic** | **0/100** | 26.88 | 4.26 |

**The real starting positions span 0/100 to 20/100** — and `elf` matches what the illegal control
managed while knowing **19.4 fewer nodes**. That is not "single species is weak." That is a
**twenty-fold spread across legal openings**, which is a far more interesting game than the one where
you start with everybody.

**And it is exactly the pressure alliances need.** A draconic universe that never ascends alone has a
reason to seek allies that no amount of tuning could manufacture. The weakness *is* the mechanic.

## Why this is the right shape, in the design's own terms

`ages-of-magic.md` already specifies the payoff: *"alliances between realms are the way that you get
visiting mages and send your mages to learn other places' things"*, and *"training with another species
gives you affinity for a species, resistance to its damage, and a bonus to your damage against that
species, up to 1.15."*

**That mechanic had nothing to bite on while every universe already held every species.** Affinity for
a species you already have is worth nothing. Under the new rule, cross-species affinity is only
obtainable through alliance, which is what makes it a reward rather than a table.

It also gives the teaching boundary (`w78`, merged) something to hold apart. W87 found universities
converge because they have nothing to hold different; **an allied visitor from a species you do not
have is exactly a difference an institution can hold.**

## What has to change

1. **`DEFAULT_FOUNDING_SPECIES_MASK` stops meaning "all six."** A mask selecting more than one species
   should be **refused at scenario build**, the way a mask selecting none already is — with the
   two-species case as the open question below.
2. **Every all-six measurement in this project is re-scoped, not deleted.** They remain true of a
   configuration that is no longer a legal opening. `campaign-plan.md`'s per-species readings,
   `loss-shock-recovery`'s figures, and the containment statistics all inherit this.
3. **The species arms become the baseline set**, not a sweep of an exotic factor. Six legal openings,
   each with its own balance profile — that *is* the game's starting-position space.
4. **Alliance needs to exist as a verb before this is playable.** Today `affiliate` never fires in any
   run and there is no inter-realm channel at all. **The rule makes single-species universes weak by
   design and the escape hatch is unbuilt** — so these land together or the game is six ways to lose.

## Resolved: two, and it is a divine capacity

*Owner, 2026-08-13, closing the question this section previously left open.*

**A universe founds with two species, and the limit is the god's — not the world's.** You can support
two until people start worshipping you. **Species capacity is a function of worship.**

That is a better answer than either of the ones I had, and the reason is that it makes the limit
**diegetic and dynamic instead of arbitrary and fixed.** "Two species per planet" is a rule a player
obeys. "I can only hold up two peoples until enough of them believe in me" is a rule a player *feels*,
and it grows.

### Why it fits what is already built

Worship is the project's most complete economic loop and its least load-bearing one. `god-constant.json`
implements it as **three saturating classes — mage, university, populace — each with a per-head rate
and a half-cap**, and `favor-cap-base`'s own gloss says what it currently buys: the cap *"converts a
worship lead from power into tempo — a high-worship god cannot do more things, only sooner."*

**Worship currently buys speed. Under this rule it also buys breadth.** That is the first structural
thing worship has ever done, and it arrives without a new resource, a new curve, or a new verb — the
accrual, the classes and the caps all already exist and are already measured.

It also composes with W81's daily-relevance work, which made worship depend on *what magic is for*: a
god whose permitted cells serve daily life accrues faster, and therefore reaches a third species
sooner. **What you allow decides who you can hold.**

### What it implies

1. **The founding mask admits exactly two**, and a mask of one or three-plus is refused at scenario
   build — the way a mask of none already is.
2. **Capacity is read, not stored.** A god's supportable species count is derived from worship at the
   tick it is asked, like every other derived quantity; a stored count would rot the way a stored null
   bar would.
3. **Crossing a threshold is an event worth surfacing.** Reaching the worship to hold a third people is
   exactly the kind of thing the interface prototypes exist to make legible, and it is a better use of
   an event feed than most of what is currently in one.
4. **The species arms become pair arms.** Six species give **fifteen** legal openings rather than six —
   which is a wider starting-position space than the singles, and it answers what the singles cannot:
   **whether two weak species together beat one strong one.** That is the question alliances exist to
   pose, and now it is also the question the *opening* poses.

### The threshold is a swept parameter, not a guess

**How much worship buys the third species is exactly the kind of scalar this project has been wrong
about before.** Sweep it — with "never reachable" and "reachable by tick 100" as the two controls —
and let the curve say. A threshold nobody can reach makes the rule a two-species cap with extra steps;
one reached immediately makes it decoration.

**And the alliance channel still does not exist**, so the note above stands: this makes two-species
universes the ceiling until alliances are built, and the two land together or the rule is a
restriction with no escape.
