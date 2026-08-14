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

## Resolved: one species, and portal magic is the way out

*Owner, 2026-08-13, superseding the two-species reading above.*

**A universe founds with one species.** To get another, it needs an **alliance**. To get an alliance,
it needs **portal magic**.

That last link is the one that matters, because it turns a measured curiosity into the game's central
constraint.

### Portal magic stops being a raid feature

Today `portal` is what you use to go and take things. Under this rule it is **how a civilisation stops
being alone** — the prerequisite for every academic your own species cannot produce, for every
cross-species affinity `ages-of-magic.md` caps at 1.15, and for the whole trade in scholars.

**A universe without portal magic is a universe that will only ever have its founding species.**

### Which makes a measured fact into an existential one

W82 measured the reachability of `portal` across openings, and recorded it as a raid concern:

> Both `portal` nodes sit in `rego-limen` behind an `intellego-limen` prerequisite. **0 of 70 possible
> 1×1 openings and 13 of 910 2×2 openings can ever raid.**

Under one-species founding, reread that: **almost no opening can ever acquire a second species.** The
overwhelming majority of starting positions are permanently, structurally alone — not badly balanced,
*sealed*.

**That is the sharpest content-placement finding this project has, and it changes what has to be
fixed.** It is no longer "raids are hard to reach." It is: **the entire mid-game pivot hangs off two
nodes in one cell.**

Three ways out, and they are not equivalent:

1. **Author `portal` effects into more cells.** Cheapest, and it is data. It also weakens the identity
   of `rego-limen` as *the* threshold cell, which may be worth keeping.
2. **Guarantee portal reachability in the opening.** Every legal opening includes a path to a portal
   node — a constraint on square selection rather than on content. Preserves the cell's identity and
   makes the guarantee explicit.
3. **Accept sealed universes as a legitimate outcome** — some worlds never meet anyone. **Honest, and
   the most interesting of the three**, but it needs the sealed path to be *playable* rather than just
   losing, and today a single-species universe ascends between 0/100 and 20/100.

**Option 2 is the recommendation** — the guarantee is checkable, the cell keeps its meaning, and it
does not require judging 300 nodes.

### Alliances do not exist, and that is the build

Stated plainly because it is the whole cost of this design:

- **There is no alliance verb.** The god's sixteen actions do not include one.
- **There is no inter-realm channel at all.** `contracts.md` §1.1 puts **one universe per simulation
  instance**, which is the same constraint that made `openPortal` unreachable for most of this
  campaign.
- **`affiliate` never fires in any run** — the goal that would move a mage between institutions is
  scored ≈640 against research's ≈832 and has never been chosen.

**So this rule makes one-species universes the permanent state until three things are built**:
portal reachability, an alliance verb, and a second universe to ally *with*. The rule is right and the
escape hatch is unbuilt, and they have to land together or the game is one way to be alone.

### What is now free to be measured

The species arms become **six legal openings** rather than a sweep of an exotic factor, and their
spread is the real starting-position space: **0/100 to 20/100 ascension**, with `elf` matching the
old illegal all-six control while knowing 19.4 fewer nodes.

**Do not read `draconic` never ascending as a species that needs buffing.** Under this rule it is a
species that needs *allies*, and whether that is a fair trade is the question the alliance mechanic
exists to answer.
