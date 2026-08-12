<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Ages of magic, and why the game has a mid and late game

**Status: author's design, recorded 2026-08-12.** This is the progression spine. Nothing below is an
agent's invention; the framing and both load-bearing sentences are the author's.

> *"Ages of magic are mostly governed by the interactions of two, and it takes time to develop the
> interactions of three."*
>
> *"You would have to have fully developed magical colleges that get people through their early
> skills **fast** in the later game — but in the early game everyone is working it out for the first
> time and magic is raw and new."*

## 1. The shape

A spell today names exactly one cell of the 5 × 14 grid. A **compound** names a set. The progression
is the size of that set:

| age | a spell is | space over 70 cells | what it feels like |
|---|---|--:|---|
| **first** | one cell | **70** | raw, new, everyone working it out alone |
| **second** | two cells | **2,415** | ages of magic proper — a civilization is known by its pairings |
| **third** | three cells | **54,740** | rare, slow, and mostly institutional |

*(Not every combination is meaningful. You author the ones that are. The point is that the space
opens faster than a civilization can walk it, which is what an unexhausted frontier requires.)*

The author's example: **Creo Ignem + Muto Ignem + Intellego Mentem** — make fire, give it a body,
give it something to see with. A servant. Mechanically nothing like Perdo: a different primitive, a
different envelope, a different picture on the field.

## 2. What a college is *for*

This is the part that changes the rest of the design.

In the first age there are no institutions worth the name and none are needed, because the frontier
is one cell away from a standing start. **In the third age the frontier is unreachable by a person
who has to discover the first two ages for themselves.** So the college's job is not prestige and not
redundancy — it is **throughput through the known**, compressing a novice's passage through singles
and pairs so that they arrive at the frontier with working years left.

That gives three things a purpose they currently lack:

- **§6a's knowledge-capital loop** — *"a university's output scales with the depth of its library…
  knowledge is an input to producing more knowledge"* — is exactly this compression. It has been
  measured as inert and treated as a balance problem. It is not: it had nothing to compress, because
  the frontier was always one step away.
- **Teaching** stops being about redundancy. Its value is **velocity through the known**, and W26's
  finding that teaching adds zero nodes was never a defect — teaching is not supposed to add nodes,
  it is supposed to move people.
- **Scribing and libraries** become the mechanism by which a civilization's second age survives long
  enough to reach its third.

## 2a. The college is the *only* road to the third age

The author, sharpening §2: a fully developed college is **"the only way you can master all the
prereqs needed for complex spells and complex, multi-caster spells."**

Not merely faster. **Only.** That is a stronger claim than throughput and it should be built as
stated, because it is what makes the institution load-bearing rather than optimal. A lone mage in a
wilderness can work out first-age magic and, given enough life, second-age pairings. The third age is
closed to her — not by a rule that says so, but because the prerequisite mass is larger than an
unassisted life can cross.

## 2b. The stationed set: teaching, researching and defending are one set of people

> *"Each university has its stationed mages, so that's the defender set as well."*
> *"The teaching set and the defending set and the researching set are the same."*

This is the tightest coupling in the design and it deserves to be stated on its own, because
everything downstream changes shape once it holds.

**A university's stationed mages are its faculty, its researchers and its garrison at once.** There
is no separate military. The soldier's line — *"The mages go through the portal. Someone's got to be
on this side"* — is about the faculty.

Consequences, and every one of them is a tension the game did not previously have:

- **Every allocation is a subtraction from two other things.** A mage set to teach is a mage not
  researching and not on the wall. There is no slack to find, because the same roster answers all
  three demands.
- **A raid on a university is an attack on its curriculum.** You are not only stealing books; you are
  killing the people who were going to teach them. §5 already makes knowledge individuated and
  mortal — this makes the *transmission* mortal too.
- **Defending well can cost you the age.** Pull your deepest specialists to the wall and the
  frontier stops advancing while they stand there. Leave them at their desks and they may not have
  desks tomorrow. That is the muster decision, and it is genuinely hard rather than arithmetic.
- **It explains why universities are the target.** Not because libraries are valuable loot, but
  because a university is where a civilization's teaching capacity, research capacity and defensive
  capacity are all standing in the same building. W24 sited universities in territory kinds; this is
  what makes a site worth crossing a portal for.

And with compounds it produces the sharpest loss in the game. **A third-age ritual needs several
specialists. If they are stationed together and the university falls, the compound dies with them** —
not the knowledge of its parts, which survives in whoever else holds those cells, but the standing
arrangement that could actually cast it. That is marooning with an edge: the parts live, the whole
does not, and rebuilding it means growing three careers.

## 3. The species split falls straight out, and it is the playstyle difference

Lifespans span **25×** — orc 720 months, draconic 18,000:

| species | lifespan | curiosity | retention |
|---|--:|--:|--:|
| orc | 720 | 384 | 896 |
| human | 960 | 1152 | 1024 |
| dwarf | 3,000 | 512 | 1,536 |
| gnome | 4,200 | 1,792 | 512 |
| elf | 8,400 | 896 | 1,280 |
| draconic | 18,000 | 256 | 1,536 |

Against a three-age frontier this stops being a stat spread and becomes two different games:

- **Long-lived, few (draconic, elf).** One mind can hold a first age, a second age and still reach a
  third. Institutions are optional; the frontier is personal. *"I know it already."* Slow, deep,
  and catastrophically brittle — every death is an age lost.
- **Short-lived, many (orc, human).** A single mind **cannot** cross three ages. The third age is
  reachable **only across generations**, which means it is reachable only through records, teaching
  and colleges. Fast, broad, institutionally dependent — and a burned library does not cost them
  spells, it costs them an *era*.

That is the distinct playstyle per species the design has been reaching for, and it arrives from one
mechanic rather than from tuning six traits. It also makes §6's *"deep specialists"* pillar
mechanical, and it is why the author's earlier direction — that depth should require *"absurd life
extension magic"*, with **logarithmic** returns *"so that the slow dragons are worth it"* — is the
correct curve: a linear return would let long life simply win.

## 4. It retires three measured problems, which is how I know the framing is right

**Content exhaustion was the first age ending.** The campaign's oldest and most-confirmed finding is
that a passive universe learns all 51 v1 nodes by tick 300 of a 2,400-tick run and plateaus. Five
sweeps, six built mechanics, none of which moved it. Under this framing that plateau is not a
ceiling — **it is the first age completing on schedule**, and there was simply nothing after it. The
problem was never that the game ran out of content; it was that the game had one age.

**Width 1 becomes width > 1.** W32 measured the strategy poset at width 1 — one chain, everything
comparable — and named Dilworth width > 1 as the real target. Compounds produce genuine
incomparability: a universe that developed Creo/Ignem pairings builds fire servants, one that
developed Rego/Mentem builds compelled ones, and neither dominates. A single-cell grid cannot produce
that; it can only produce more or less of the same ladder.

**Marooning becomes the late-game's central problem instead of a curiosity.** 93.4% of held knowledge
sits below the mastery threshold at which it could be taught. In a first age that is survivable —
everyone is rediscovering anyway, and W26 measured rediscovery re-deriving teachability at ordinary
price. In a third age it is fatal, because a college that cannot reliably move a novice through the
early skills cannot deliver anyone to the frontier. **The teachable fraction stops being a statistic
and becomes the thing that decides whether your civilization has a future.**

## 5. What has to be settled before this is built

1. **Who holds a compound?** If it spans three cells and per-mage exclusivity means no one mage can
   hold all three, then no *mage* knows it — a standing arrangement between three people does. §5's
   knowledge locations are mind, grimoire, library shelf and memory palace; none of them is a group.
   This is the interesting question, not a detail: **a compound held by three mages dies when any one
   of them dies**, which is marooning with a much sharper edge.
2. **Does a compound have to be discovered, or does it follow from holding its parts?** Following
   automatically makes the ages a formality. Requiring separate discovery, at a cost that scales with
   set size, is what makes the third age *slow*.
3. **The legality mask.** §4.1 fixes the observation block; a compound's legality depends on holding
   *n* cells at once, which the action space was not shaped for.
4. **Does an age gate anything, or is it purely descriptive?** "Ages of magic" may be a lens on what a
   civilization has developed, or it may be a real threshold with rules attached. Descriptive is
   cheaper and probably right first.

## 6. The claim, and what would disprove it

**Claim:** with compounds, a universe's development does not plateau at the end of the first age, and
two universes with the same species and different pairings become incomparable rather than ranked.

**Disproved by:** a sweep in which nodes-known still flattens at the first-age ceiling; or in which
the strategy poset stays width 1 because one pairing dominates; or in which short-lived species reach
the third age as readily as long-lived ones, which would mean institutions are not doing the work
this design assigns them.
