<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Machines, and what they are allowed to change

**Status: author's design, recorded 2026-08-16. Not implemented.** Written against `vision.md` §6a
(the economy), `ages-of-magic.md` (the progression spine) and `substrate.md` (what magic is made
of). Every measurement below was taken by execution and names its build.

## There is no machine in this game today

Grep `vision.md` for *machine* and every hit means **machine play** — RL agents discovering the meta
before humans do. There is no machine entity, no machine component, no machine primitive, and no
magic that improves one. The nearest thing is `build-rate`, and #191 measured it as **39 sources
stacked every tick against nothing under construction**: a live consumer with nothing to consume.

## The author's two rulings, which this document is built on

> *"Machines are what changes the economy."*
>
> *"That stuff should be later magic — the hard thing is actually preserving info in the beginning."*

The second is the sharper one and it constrains the first more than it looks. It says the early game
is about **preservation**, and preservation is what `vision.md` §5 already builds: knowledge has a
location, it decays, it dies with its holder, and the last instance leaving is a real loss.

So the first machine anyone reaches for — **a printing press** — is exactly the wrong one. A machine
that copies books cheaply does not enrich the early game; it deletes it. Whatever machines are, they
must not solve preservation, and they must not arrive early.

## What a machine is

**A machine is a standing multiplier on an occupation's throughput, owned by a place, that costs
materials to raise and materials to keep.**

Three clauses, each doing work:

- **On an occupation, not on a mage.** A machine makes *laborers* or *scribes* more productive. It
  is the non-magical half of the economy getting better at its job, which is what keeps a
  civilization's growth from being purely a function of how much magic it knows.
- **Owned by a place.** It sits in a territory or a university, it can be raided, and it does not
  travel. That makes it a raid objective in the way §8 already means — a thing worth crossing a
  portal for that is not a book.
- **Costs to raise and to keep.** Raising it consumes `stone` through the existing `construction`
  claimant. Keeping it consumes materials every tick through a new claimant, in the shape
  `libraryUpkeep` already has. **A machine that costs nothing to keep is a permanent free
  multiplier, which is the "rate mechanic with no opposing term" this project has spent a campaign
  learning to refuse.**

## Why this makes `build-rate` mean something

`build-rate` is authored on 33 nodes, gathered every tick, and applied to nothing once the starting
academy is complete. It is not structurally broken — it has a real consumer in
`universeEconomyBonuses` — it simply has nothing to build.

Machines are the thing to build. A civilization that has finished its university currently has no
use for construction at all; with machines it has a permanent one, and the 33 authored nodes stop
being decorative. **That is a wire repaired by content and design rather than by code**, which is
rare here: #191's split was eighteen structural to zero content-scoped.

## Where they sit in the progression

`ages-of-magic.md` §1 makes the ages the *size of a compound*: one cell, then two, then three.
Machines belong to the second and third.

| age | what a civilization does about throughput |
|---|---|
| **first** | nothing. Labour is hands. The hard problem is that knowledge dies with the people who hold it, and no machine helps. |
| **second** | **machines exist and are mundane.** A mill, a kiln, a scriptorium bench. Raised with `stone` and kept with materials; no magic required to build or run one. |
| **third** | **magic improves machines.** This is the author's "later magic", and it is a *compound*: a working that names both the machine's form and the improvement. |

The first row is the ruling that matters. **A first-age civilization gets no machines**, so the
early game keeps the shape it has: the problem is preservation, and the answer is institutions —
teaching chains, libraries, a curriculum — not apparatus.

## What machine-improvement magic may and may not do

May: raise the multiplier, lower the upkeep, let one machine serve two places, keep it running
through a season that would stop it.

**May not: copy knowledge, hold knowledge, or reduce the cost of scribing below what a human
scribe pays.** That is the printing-press exclusion, stated as a rule so it survives someone
authoring an obviously-good node in two years. Preservation stays a people problem.

The natural cells, none of which need new content shape:

- **Rego Terram** — the mill that does not need tending.
- **Creo Ignem** — the kiln that holds its own heat (`cig-the-standing-furnace` already exists at
  tier 4 and reads exactly like this).
- **Muto Terram** — the ore that was never mined, feeding a machine that could not otherwise run.
- **Intellego Vim** — knowing *why* a machine fails before it does. Maxwell's demon again, and
  `substrate.md` §2's reading of Intellego as the operation that moves nothing and wastes less.

## Why this is worth building, measured

The opening square was widened experimentally on `main` @ `ad7f80c2`, 2,400-tick reference run, one
seed per arm. The positive control is `nodes`, which must grow with the square:

| square | nodes | library depth | books | vellum left | ticks short vellum | ticks short food | population |
|---|--:|--:|--:|--:|--:|--:|--:|
| **3×4** (shipped) | 51 | 50 | 86 | 387 | 266 | 1,174 | 18,731 |
| **4×5** +creo +animal | 84 | 84 | **643** | 120 | 270 | 1,860 | 25,014 |
| **4×10** +herbam | 172 | **149** | 462 | **7,916** | 248 | 1,728 | 22,986 |
| **5×14** full grid | 263 | 103 | 528 | **568,221** | 326 | 1,621 | 23,328 |

Two things follow, and the second is why machines matter.

**The vellum shortage is a content artefact.** The shipped square has *no Creo at all* — a universe
can perceive, unmake and control, and cannot make. All five of its `resource-yield` nodes are
Terram, so it has five magical sources of stone and **zero of vellum**, against three claimants on
vellum. Opening the square to Herbam brings `ch-paper-without-rags` into reach and the end stock
moves 387 → 7,916.

**But the shortage does not go away — it relocates.** Ticks-short-vellum barely moves (266 → 248)
while the end stock grows twentyfold, because the economy expands to consume whatever it can make.
And food gets *worse*: 1,174 → 1,860 ticks short, because population grows 18.7k → 25.0k. **The
binding constraint moves from parchment to bread**, and nothing in the game currently lets a
civilization answer a bread problem by getting better at farming rather than by knowing more magic.

That is the gap machines fill. Magic raises the *ceiling*; machines raise the *floor*, and a
civilization that has run out of magic to learn should still have something to do.

## What this document does not decide

1. **The upkeep claimant's material and its rank.** `casting` took vellum and ranks above
   `libraryUpkeep`; a machine claim is more plausibly `stone`, which is in permanent surplus
   (4.4M by tick 2,400) and therefore currently a *bad* place to put a cost — see the note in
   `CLAIMANT_KIND`. That surplus may be the argument for machines rather than against.
2. **Whether a machine is an entity or a component on a place.** An entity costs a world-schema
   revision; a component on `TERRITORY` or `UNIVERSITY` may not.
3. **Whether the opening square should ship wider.** The table above is an argument, not a decision.
   4×5 is the cheapest step that turns Creo on; 4×10 is the one that answers the vellum question.
   Both move every balance baseline.
4. **Whether machines are raidable in v1.** §8's objectives are a library, a university, an
   archmage. A fourth is a change to the raid, not to the economy.
