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

## The open question the owner left

*"You shouldn't be able to start with more than two species that are on one planet."*

**One or two?** The stated rule is one species with allies; the aside allows two. They are different
games:

- **One** makes every alliance a first alliance, and makes the second species a genuine event.
- **Two** gives a universe an internal partner from tick zero — a domestic teaching pair — and makes
  alliances about the *third* species onward.

**Two is the safer starting point** and it is measurable: the sweep already has single-species arms,
and pair arms are 15 more cells. **Do not guess.** This is the same shape as the grant budget and the
opening square, and the same rule applies — sweep it, with both ends as controls, and let the curve
decide. The pairs also answer something the singles cannot: whether two *weak* species together beat
one strong one, which is the whole question alliances exist to pose.
