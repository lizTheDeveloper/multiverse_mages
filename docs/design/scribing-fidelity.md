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
