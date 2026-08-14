<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Scribing fidelity: the telephone problem

**Owner's design, 2026-08-14, recorded before implementation.** Measured against `main` at `7694528`.

> *"Every time they scribe a book, they lose some of the mētis in the book. At some point the mētis
> becomes 0%, and it's very hard to learn from those books — whereas something freshly transcribed
> from a magic user, or one copy out, is fine. And dwarves are better at literally carving things into
> stone instead of literal books."*

## This corrects something I wrote yesterday

`campaign-plan.md` W159 records the telephone problem as *"distinct from `metis-knowledge`… different
mechanics and should not be merged into one."* **The owner has since named mētis as the quantity that
degrades, so that note is wrong as written** — but the resolution is more interesting than either
version, because the two live at **different levels**:

| | level | question it answers | status |
| --- | --- | --- | --- |
| `knowledgeKind` | **node** | can this knowledge survive being written down *at all*? | **already shipped** — 271 `episteme`, 29 `metis` across 300 nodes |
| mētis fraction | **instance** | how much of the practitioner's knowledge does *this particular book* still carry? | new |

So they are one concept at two scales, not two mechanics and not one field. `knowledgeKind` is
authored and binary; the fraction is emergent and continuous. **A node's `knowledgeKind` decides
whether a book can exist; the book's mētis fraction decides whether it is worth reading.**

## The curve, in the owner's terms

- **Fresh from a living holder: full.**
- **One copy out: fine.** So this is *not* linear decay from the first generation — there is real
  tolerance early, and the loss bites on copies-of-copies.
- **Eventually 0%**, at which point the book is *"very hard to learn from"* — **not impossible**. The
  owner said hard, and that distinction should survive into the implementation: a 0% book is a worse
  teacher, not a brick.

The shape this implies is a plateau then a fall, rather than a constant per-generation multiplier.
The exact curve is unset and is the author's.

## What it makes true, which is the point

- **A library that only ever copies from itself dies of its own success.** The more a scriptorium
  runs, the worse its output, unless it is refreshed from minds.
- **Scribing from a living holder beats scribing from a grimoire** — a real reason to keep the person
  alive rather than merely the book.
- **An unbroken teaching lineage becomes worth something the archive cannot replace.** That is the
  game's stated premise — *knowledge is physical and mortal* — expressed as a mechanic rather than as
  flavour.
- It gives the **archivist strategy** a real ceiling. `archivist` builds enormous book counts and
  still loses; this says why that *should* be true.

## Dwarves carve stone

> *"Dwarves are better at literally carving things into stone instead of literal books."*

**The existing content already half-encodes this instinct, which is a good sign for it.** On `main`,
`species.json`:

| species | `scribeAffinity` | `retention` |
| --- | ---: | ---: |
| **dwarf** | **1792** | **1536** |
| elf | 1024 | 1280 |
| human | 1024 | 1024 |
| draconic | 640 | 1536 |
| gnome | 896 | 512 |
| orc | 384 | 896 |

Dwarf is **already the best scribe by a wide margin** and joint-best at retention. So "carving stone"
is not a new species trait so much as **a medium whose fidelity loss per generation is lower**, which
dwarves are best placed to use.

Whether that is modelled as a distinct storage medium alongside `grimoire` and `library`, or as
`scribeAffinity` reducing the per-generation loss, is **not decided here**. The first is more
expressive and costs a world-schema revision; the second is nearly free and reuses a field that
already exists. That is the author's call, and it is worth noting that the cheap option may be enough
to get the behaviour and the expensive one buys the *fiction*.

## Also required, and separate

`scribingQueueDepth` is **hardcoded `0`** at `world-step.ts:774`, so scribe demand is permanently zero
and a universe's only scribes are the ones its founding seeded — traced, 3 cohorts at tick 60 → 0 by
tick 600, and books per 20-year window running `633 / 209 / 44 / 6 / 0 / 0 / 5 / 6 / 9 / 7`. **A
scriptorium that stops after one century.** The owner's instruction is to *"allow however long."*

**Fixing that first would make the telephone problem measurable**, and doing them in the other order
would add fidelity loss to a scriptorium that has already stopped running.

## Corrupted grimoires

> *"There's also some error rate. If a grimoire is one spell, let's say it becomes a grimoire that is
> **silently wrong**. And then if a person tries to learn from it, they can't, but they don't know
> why. You don't know that your library is corrupted until a magic user tries to read it and marks the
> book corrupted when they cannot. Someone could sneak into your library, corrupt all your books, and
> leave — and then suddenly you've got to go in with a bunch of curious gnomes to fix the situation."*

**This is a different failure from fidelity loss and should be a different field.** Mētis decay is
*gradual and legible* — a book worth less than it was. Corruption is *binary and hidden* — a book that
looks fine and teaches nothing.

### Answering the question in the quote: a grimoire holds many nodes

Verified on `main` at `7694528`. `KNOWLEDGE_INSTANCE` is
`{ nodeId, locationKind, locationId, acquiredTick, mastery }`, and `locationId` is *"mage, grimoire,
library, or mage handle, per `locationKind`."* **Many instances can name the same grimoire handle**, so
a grimoire is a container of nodes, not a synonym for one. Whether the scribing operation actually
writes more than one node into a grimoire today is a separate question and was not checked.

That matters for the mechanic: corrupting *a grimoire* is a broader attack than corrupting *a spell*,
and the author should choose which the verb targets.

### The state already has a per-instance quality scalar

`mastery` is documented as *"`0` just learned; `fp(1024)` teachable without loss"* — a continuous
per-instance quality that already exists. On a **grimoire-located** instance, "mastery" is most
naturally read as **how good this copy is**, which is exactly the quantity the telephone problem
degrades.

So mētis fraction may need **no new field at all**. Corruption probably does need one, because it is
hidden — and hiddenness is state about *who knows*, which `mastery` cannot express. A `corrupted` flag
plus a `discovered` flag is the minimum, and the second is the interesting one.

### Curiosity is the defence, and that produces a real species tragedy

> *"Very curious species can probably read a somewhat corrupted grimoire, but extremely prescriptive
> species like dwarves or dragons are gonna struggle."*

From shipped `species.json`:

| species | `curiosity` | `scribeAffinity` | reads corruption | writes books |
| --- | ---: | ---: | --- | --- |
| gnome | **1792** | 896 | **best** | middling |
| human | 1152 | 1024 | good | baseline |
| elf | 896 | 1024 | fair | baseline |
| dwarf | 512 | **1792** | **poor** | **best** |
| orc | 384 | 384 | poor | worst |
| draconic | 256 | 640 | **worst** | poor |

**Dwarf is the best scribe in the game and the second-worst reader of a damaged text.** They build the
finest libraries and are the least able to recover them. Draconic is worse still — best retention,
worst curiosity. That drama is *already latent in the shipped numbers* and this mechanic is what would
make it visible, which is a strong sign it is the right mechanic rather than an invented one.

And it gives **gnomes a job nobody else can do.** *"A bunch of curious gnomes to fix the situation"* is
a sentence the current game cannot express; under this it is a build order.

### Corruption as an attack — the part that is not authored

A raid objective that is neither theft nor damage: **enter, corrupt, leave undetected.** Its properties
are unusual and good:

- **The victim does not know it happened.** Loss is discovered later, one book at a time, by whoever
  fails to learn — so the *cost* is deferred and the *diagnosis* is gameplay.
- **It scales with library size**, which makes the archivist's own advantage into a liability. That is
  a real answer to why `archivist` builds enormous book counts and still loses.
- **It has a counter that is a species and a strategy**, not a stat: send the curious in to triage.
- Vision §5 already gates theft behind *Intellego Mentem* and *Rego Nomen*. **Corruption is plausibly
  *Perdo* over *Nomen*** — unmaking the true name of a thing is precisely what a silently-wrong book
  is — and `perdo-nomen` is one of the twelve v1 cells.

`knowledge-steal` has 6 authored effects and 4 in v1. **There is no corruption primitive**, and this
would be one — the first genuinely new primitive proposed in this campaign rather than a consumer for
an existing one.

### Two failure modes to design against

- **Undiscoverable corruption is indistinguishable from a bug.** If a player can never learn *why*
  learning failed, the mechanic reads as broken software. The "mark it corrupted when you fail" step is
  not flavour — it is the feedback that makes the rest legible, and it must be reliable.
- **Total corruption is a griefing move.** *"Corrupt all your books and leave"* is a great story and a
  bad steady state if it is cheap and unbounded. Cost, detectability, or a cap on how much one raid can
  touch is the author's call, but something has to bound it.
