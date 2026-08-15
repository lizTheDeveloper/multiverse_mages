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

### It targets a spell, and it is *supposed* to be griefable

> *"It targets a spell, because then a scribe can mess up one spell but not others for that grimoire.
> Realistically it needs to be a griefable move for people who build giant stoic libraries that they
> share with no one — because if no one is constantly turning over your books, you have no idea if
> they're good or not. So I think it should be expensive. All spells cost something that the raiders
> are using up, and so it should cost something."*

**Per-instance, not per-grimoire.** One `knowledge-instance` is corrupted, not the container. A scribe
can ruin one spell and leave the rest of the volume sound, and a raider can pick a target rather than
razing.

**And this corrects a caution I wrote above, which was wrong.** I listed *"total corruption is a
griefing move"* as a failure mode to design against. **It is the mechanic, not a failure of it.** The
design intent is precisely that a hoarded, uncirculated library is *vulnerable in a way its owner
cannot see*, because **the only way to know a book is good is that someone recently read it.** A
library nobody turns over is a library whose state is unknown to its owner — that is the point, and
softening it would delete the idea.

So the bound is **cost, not a cap on damage**. Every spell costs the raider something they are
spending; corruption should too. That makes it a *choice under a budget* rather than a free action, and
it means a mass-corruption raid is possible and expensive — which is exactly the shape that punishes
hoarding without making it a dominant opening.

The one caution that survives: **undiscoverable corruption is indistinguishable from a bug.** If a
player can never learn *why* learning failed, the mechanic reads as broken software. The "mark it
corrupted when a reader fails" step is not flavour — it is the feedback that makes the deferred cost
legible, and it has to be reliable. **Hidden until read is the design; hidden forever is a defect.**

## Can the raid subsystem model this? Not yet — and here is the gap

> *"If the raid sub-component isn't able to answer these questions by modeling them out, we need to
> roadmap that."*

Checked on `main` at `7694528`. The pieces that exist:

- `OBJECTIVE_KIND` is `{ library: 1, university: 2, archmage: 3 }` — **a library is already a raid
  objective**, so the target exists.
- `Intent.kind` is `'cast' | 'steal' | 'move' | 'objective' | 'withdraw' | 'guard'` — **there is a
  `steal` and an `objective` interaction, and no `corrupt`.**
- `spatial.ts` and `arbitration.ts` exist, so position and contest are modelled.

What is missing, and each item is a roadmap entry rather than a patch:

1. **No corrupt intent and no corruption primitive.** `knowledge-steal` has 6 authored effects; there
   is nothing for corruption. This would be the first genuinely new primitive of the campaign.
2. **No cost model for a per-spell action inside a raid.** The owner's requirement — *"all spells cost
   something the raiders are using up"* — needs the raid to price a repeated per-instance action, which
   is different from pricing one objective interaction.
3. **No detection or stealth model at all.** *"Sneak in, corrupt, leave"* has no representation:
   nothing in `rules-raid` models being seen or not seen, so "leave undetected" cannot currently be a
   distinct outcome from "leave."
4. **Raids resolve inside one world step**, which is why no raider has ever come home and why the
   withdrawal margin sits at tick ~2,600 against raids ending near tick 65. A raid that *sneaks* wants
   duration.
5. **And nothing exercises combat at all today**: across all eight shipped strategies at two seeds —
   61 raids, 80,615 combatant-ticks — **zero combat attempts**, because no strategy puts a combat node
   in a combatant's hands. Any corruption measurement would inherit that emptiness.

So the honest answer to the question in the quote is **no**, and the roadmap is those five items in
roughly that order — with (5) first, because until something arms a raider the other four cannot be
measured, only asserted.

## Who can discover corruption, and why that makes deep knowledge the most fragile

> *"The newest students can't discover corruption, right? But they're most likely all learning the
> lowest level spells."*

Discovery is gated by the reader, not by the book. A novice failing to learn cannot tell *"this text is
wrong"* from *"I am not good enough yet"* — which is exactly right, and it produces a consequence
worth stating on its own:

**Your deepest, rarest knowledge is the most likely to be silently gone.**

A corrupted tier-1 book sits in a stream of students and is found almost immediately. A corrupted
tier-6 book can only be discovered by someone already near tier 6 — of whom a universe has very few,
who have other things to do, and who may not exist at all for decades. So corruption's expected time
to discovery **rises steeply with tier**, and the loss is worst exactly where the library was most
valuable.

Two consequences fall out without being designed for:

- **Circulation is the defence, and it is naturally weakest where it matters most.** The books nobody
  reads are the books nobody *can* read.
- It gives the **archmage** a job besides research: walking the deep shelves is the only audit that
  exists. That is a use for a scarce, expensive mage that is not "cast a bigger spell".

The novice's failure should probably still record *something* — an unresolved failure rather than a
corruption mark — or the same book will be failed against repeatedly with no memory. Whether that is
modelled or simply left as wasted months is the author's call, but silence is the expensive option for
the player to reason about.
