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

## 2c. Knowledge decay is publish-or-perish — and we shipped the perish half

> *"Publish or perish, baby — which is what knowledge decay is. We already have it, but that's what
> it's called."*

The mechanic exists: mastery falls every tick, and below `DEFAULT_TEACH_THRESHOLD` a mage can no
longer pass on what she knows. The name is the design. It is not forgetting in the ordinary sense —
it is **a scholar losing the standing to supervise a subject she has stopped working in.**

W26 measured the consequence: **93.4% of held instances sit below the threshold**, and 28 of 51 nodes
have no teachable copy anywhere, at an instant when every redundancy metric reports the library
healthy.

**And there is no publish.** `decay.ts` says so in its own prose, about itself:

> *"Nothing in this subsystem restores mastery; **practice does, and practice is an operation
> somebody has to perform.**"*

W26 confirmed it from the other side: §5 lists six operations on knowledge and practice is not one of
them. Research re-derives a node at full ordinary price, which is the only path back to teachability
that exists — an expensive accident standing in for the mechanic.

So the game has **perish without publish**, and 93.4% is what that number looks like. It is not a
balance problem and it will not be tuned away; the counterweight was never built.

This closes the college loop. A college is where novices are moved through the known **and** where
established mages keep their standing by working — the same building, the same stationed set, the
same hours competing. That makes the allocation in §2b sharper still: a mage set to teach is not
researching, not on the wall, **and not maintaining her own frontier**. Publish or perish is what the
clock is doing to her while she does any of the other three.

### RULED: a new spell is the publication, and teaching is what makes it possible

The author, closing the open question below:

> *"I learn a lot by teaching. I learn new stuff and it keeps the fundamentals fresh — **it's what
> informs my research into new spells.** Research into new spells is publish. **New spell =
> publish.**"*

So the loop, and every arrow in it already exists in the game except the last:

    teach the fundamentals  ->  the fundamentals stay fresh
                            ->  fresh fundamentals inform research at the frontier
                            ->  research yields a new spell
                            ->  THE NEW SPELL IS THE PUBLICATION
                            ->  standing maintained
                            ->  and standing is what lets you teach

**Publish or perish, exactly: the publication is a new node, and a scholar who has not produced one
in long enough loses the standing to supervise.** That is what a mastery below the teach threshold
*means*. The 93.4% are not people who forgot things — they are **faculty who have not had a new
result in twenty years**, which is both funnier and more accurate.

Two consequences, and the second reverses something this document said an hour ago:

**Mastery is maintained by use, and there are two uses.** Teaching what you know keeps *those* nodes
fresh — it is the prerequisites, the low tiers, the fundamentals, which is exactly the mass that
marooning eats. Discovering what you do not know is the other, and it is the one that counts for
standing. A scholar who only teaches still perishes; a scholar who tries to research on stale
fundamentals cannot reach the frontier. **You need both, which is the academic life stated as a
resource loop.**

**Teaching is an input to research, not a subtraction from it.** §2b calls the stationed set the
tightest coupling in the design, because a mage set to teach is not researching and not on the wall.
The first half of that is now wrong: **teaching feeds research.** The wall still competes. So the
real tension is not three-way — it is *teach-and-research* against *defend*, and defending is the
only thing that is purely a cost.

### Which finally says what a college is *for*, mechanically

§2 argued a college compresses a novice's passage through the known. True, and secondary. The real
function:

> **The faculty need the students.** Teaching the first age is what keeps a scholar's fundamentals
> live enough to research the third.

Students are not the product. **They are the mechanism.** That is a far better argument for §2a than
throughput ever was — a lone genius in a tower cannot reach the third age not because she is slow,
but because she has nobody to teach and her fundamentals go stale underneath her.

And it preserves §3b's amendment rather than undoing it: the requirement is **teaching**, not an
institution. A master with one apprentice satisfies the loop. That is precisely the *"slow, fragile,
attrition-based"* alternative road — one death ends it — while a college is the industrial form of the
same mechanism.

### It also puts a joke inside paced teaching

Under §2e a mismatched student repeats a class several times. Every repetition is another pass over
the fundamentals **for the teacher**. So a dragon sitting a human's brisk class four times is a mild
inconvenience to the dragon and **four reinforcements for the human** — mismatched pairs are lossy for
the student and *good* for the teacher, which is a tension worth having and is also how it actually
works.

### RULED: discovery refreshes only the new node — the frontier is detached from the base

> *"I think it's detached. ML doesn't make you better at git or programming necessarily."*

**Research refreshes what you researched and nothing underneath it.** A scholar working at the
frontier keeps her standing *there* and lets everything she climbed through go stale.

That is true to life and it is the harsher of the two readings, and taking it produces the trap the
whole design needed:

    publish at the frontier   ->  standing at the frontier maintained
    stop teaching             ->  the fundamentals maroon underneath you
                              ->  you can no longer teach them
                              ->  and new research needs fresh fundamentals
                              ->  so you can no longer extend your own specialty

**A specialist who stops teaching eventually cannot advance her own subject.** Not through
punishment, and not through a decay number someone tuned — through the same mechanism that produced
the measured 93.4%, pointed at the person who is doing the most impressive work in the building.

Three things fall out, and each one closes something that was open:

**Knowledge does not decay uniformly. It decays by disuse**, and there are exactly two uses — teaching
the fundamentals and researching the frontier. So a deep specialist has a sharp peak on a rotting
base, and that shape is legible, drawable, and a genuinely alarming thing to watch happen to your best
mage.

**It is why a compound needs a university** rather than a prodigy, and it completes §3b's ruling.
A compound is a pattern of overlapping *teachable* knowledge across a faculty; teachable means fresh;
fresh means recently taught. **Only people who teach broadly keep enough cells live at once to hold up
a third-age spell.** The specialist cannot be part of the overlap, however deep she goes — which is
why the roster is the unit and the genius is not.

**And it is why the college is the fast road** (§2a as amended). Not efficiency. A college is the only
arrangement where enough people are teaching enough of the base, often enough, that somebody's
fundamentals are always live. The master-and-apprentice road still works and is still fragile — one
student, one subject, one death.

The cost of specializing is now a mechanic rather than a flavour note, and it is charged in the
currency the game is about: **you can be the best in the world at one thing and unable to teach
anyone how to get there.** Making it a side effect is cheaper and means a
working scholar is automatically a maintained one. Making it separate creates a fourth demand on a
roster that already has three, which is either the best tension in the game or one too many.

## 2d. A university's curriculum is whatever its faculty can still teach

> *"For now, students take all available classes at the university. That's what the university **is**."*

Ruled as a v1 simplification, and it is a good one. There is **no course selection and no student
scheduling.** A student takes everything on offer. The university offers whatever its stationed mages
can teach — which, under §2c, means whatever they hold *above the teach threshold*.

So a curriculum is not authored and not chosen. It is **emergent from the roster**, and that has one
consequence worth stating plainly because it is the sharpest thing in this document:

> **A university's curriculum is not what it knows. It is what its faculty can still teach.**

The library can be deep and the curriculum thin. Under W26's measured 93.4%, that is the ordinary
case rather than the pathological one — a university holding fifty-one nodes may be able to offer
three. **Publish-or-perish decides the curriculum**, and the library only decides what could be
recovered if someone went back and did the work.

This also removes a whole class of interface the game does not need. The player never schedules a
class. The levers stay what they already are: who is stationed where, what they are set to do, and
what the constitution permits. The curriculum follows from those, which is exactly the "you shape
who they are, then find out what they do" contract §4 is built on.

## 2e. A class has a length, and both species set it

> *"The species' learning speed is the length of the time they must spend in class, or some
> derivative of that. And the teacher's species is the length of the class — so a dragon might have
> to repeat a human's short class a few times to really get it."*

Two species set two different numbers, and teaching is what happens where they meet:

- **The student's species sets the contact time required** to actually hold the material.
- **The teacher's species sets the length of the class offered.**

If the requirement exceeds the offer, the student **repeats**. A dragon sitting a human's short,
brisk class takes it three or four times before it sticks.

**And it is lossy in both directions.** A human in a dragon's class has what she needs long before it
ends, and the remainder is a life she does not have to spare — 960 months against 18,000. Mismatched
pace wastes time whichever way the mismatch runs, which is what makes it a *tension* rather than a
ranking.

### Why this is the most valuable small mechanic in the design

**It makes the founding species mix decide outcomes**, which is `D7` — *varying the founding species
mix changes which strategy wins* — the campaign's own strongest test that the species table has
become load-bearing, and the one that has been unreachable from the start. Under paced teaching, D7
is close to true by construction: a homogeneous faculty teaches its own kind efficiently and
everyone else badly; a mixed faculty covers more students and wastes more hours.

**It gives §6a's compression an actual unit.** A college's job (§2, §2a) is moving a novice through
the known fast enough to reach the frontier with working years left. Now "fast enough" is a number
with two species in it, and a college's real output is *matched* teaching hours rather than hours.

**It gives the long-lived species their weakness.** Draconic already has the longest life and,
tellingly, the **lowest curiosity — 256 against a human's 1,152**, the trait most naturally read as
learning speed. So the dragon's advantage is time and its cost is that time is exactly what it needs
more of. It is not simply a better human. The same table that gives it 18,000 months gives it the
slowest passage through anything anyone else teaches — which is precisely why §2a's *"the college is
the only road"* does not simply hand the third age to whoever lives longest.

### Open

- **Which trait is learning speed?** `curiosity` is the obvious candidate and is currently read only
  by `outlook.ts`'s personality scoring, so it is nearly free to repurpose — but "curious" and "quick
  to learn" are not the same idea, and conflating them is the kind of thing that reads fine now and
  is confusing in six months. It may want its own trait.
- **What sets class length?** Lifespan is the intuitive answer for a teacher's pace, but the derived
  quantity matters more than the source; author it rather than deriving it silently.
- **Does repeating cost the teacher as well?** If a repeated class occupies the teacher again, a
  badly-matched faculty burns the roster that §2b already has three claims on. If it does not,
  repetition is only the student's problem and the mechanic is half as sharp.

## 2f. Alliances: visiting mages, and sending yours away

> *"Alliances between realms are the way that you get visiting mages and send your mages to learn
> other places' things."*

The peaceful counterpart to the portal. A raid takes knowledge from a universe that did not consent;
an alliance moves scholars in both directions with consent, and it is the only channel that does.

The existing transfer channels are research (derive it yourself), teaching (within one universe),
theft (raid loot, written at `mastery: 0`) and **witnessed** (W37's exposure — the attacker's casts
teaching the host's academics as a side effect of being attacked). Study abroad is a fifth, and the
only one that is chosen by both sides.

### It is the answer to §2e's pacing problem, which is what makes it a mechanic and not a menu

Paced teaching means a faculty teaches its own kind well and everyone else badly. **An alliance is
how a mismatched student gets a matched teacher.** Send your dragon to a realm of dragons and she
sits one long class instead of repeating a human's brisk one four times. That is a concrete, legible
reason to want an ally, and it falls out of a mechanic authored for a different purpose.

It also gives a short-lived civilization a second route to the third age. §2a says the college is the
only road; §3 says a human cannot cross three ages in one life. An alliance does not repeal either —
but a realm that cannot yet build the college can borrow one.

### What it costs, and the cost is already built

An alliance should not be strictly better than raiding, and it is not, because of §2b: **a mage sent
abroad is subtracted from a stationed set that already answers three demands.** She is not teaching,
not researching, and **not on the wall** — and unlike a defender she is on the far side of a portal
when the raid comes. Exchange is paid in exactly the currency defence is paid in.

The second cost is symmetric: **a visiting mage is a witness.** Exposure already exists as the
attacker's price for casting in a host's universe; a guest scholar is the same channel opened
deliberately. **You teach your allies your magic by hosting them**, which is why an alliance is a
commitment about who your rivals will be rather than a free trade agreement.

### Open, and the first one is sharp

1. **Can a mage bring home what her host permits and her own god forbids?** §3 governs *casting* by
   the host's ruleset, not *learning*. W30 already found the same hole from the other end — looted
   grimoires bypass `permits()`, so a universe can hold what it forbids and wake it later. Study
   abroad makes that a strategy rather than an artifact: **forbid a school at home, learn it abroad,
   permit it the moment it pays.** That is either the best diplomatic mechanic in the design or a
   loophole that guts the constitution, and which one depends on a rule nobody has written.
2. **Does an alliance survive a raid?** In a persistent multiverse the interesting case is the ally
   who raids you anyway, and whether the scholars you are hosting are guests, hostages, or already
   gone.
3. **Is there a bubble-scoped diplomacy layer?** The prestige design has you conquering a bubble
   before promoting. Alliances imply a non-conquest path through the same bubble, and whether both
   routes reach promotion is a real design question.

## 2g. Familiarity: what training with another species buys

> *"Training with another species gives you affinity for a species, resistance to its damage, and a
> bonus to your damage against that species, up to 1.15."*

Three effects on one accumulating quantity, per *(your species, their species)* pair:

| effect | what it does |
|---|---|
| **affinity** | you learn from, and teach, that species better — directly against §2e's pacing mismatch |
| **resistance** | you take less from their magic |
| **advantage** | you deal more to them |

Capped at **1.15**, and the cap is what keeps it seasoning rather than a snowball.

### The affinity term closes §2e's loop

Paced teaching says a dragon repeats a human's brisk class several times. Familiarity says **she
repeats it fewer times the longer she has been among humans.** So the mismatch is not a permanent tax
on mixed institutions — it is a cost that a mixed institution *pays down*. A university that has
taught both kinds for a century becomes good at teaching both kinds, and a newly-mixed one is
genuinely worse than either homogeneous parent. That is a real reason to keep a faculty together and
a real cost to reorganising one.

### And it makes an alliance the best possible preparation for betrayal

The combat half is the sharp bit, and it should be built exactly as stated rather than softened.
**Studying alongside a species teaches you how to fight it.** So the realm you have exchanged
scholars with for fifty years is the realm you are most dangerous to — and most resistant to.

Everything follows from that one line:

- **Today's exchange partner is tomorrow's target**, and both sides know it, which is the correct
  amount of paranoia for a persistent multiverse.
- **An alliance is not a safe move.** §2f already costs you a stationed mage and teaches your ally
  your magic by hosting them; familiarity adds that you are *arming them against yourself* at the
  same rate they arm you.
- **It is symmetric, so it does not decide a war — it decides a matchup.** Against a species you have
  never met you are ordinary. That makes a *third* party genuinely dangerous to two long-standing
  rivals, which is the shape that keeps a multiverse from settling into two blocs.
- It is the mechanical form of the thing academia actually does: you know your rivals' work better
  than anyone, because you trained with them.

### Making the tragedy perceivable, which is the whole point of having it

A modifier the player never notices is not a tragic mechanic, it is arithmetic. Three places where
familiarity should surface, cheapest first:

- **A bark on recognising a former classmate.** The voice banks are already a de-facto specification —
  *"This one's dwarven. It'll outlive us both."* — and a line spoken by a mage who trained with the
  people she is now casting at is the single cheapest way to land this. It costs one bank and it is
  the moment the mechanic becomes a story.
- **The mage panel** (`ui/mage/`) already answers *"why did this mage choose what she chose."* Where
  she studied, and who she is consequently good at fighting, belongs in that same answer.
- **The raid view**, when the defender is an ally or former ally: the resistance and advantage terms
  are already being applied, and showing *why* the numbers are what they are turns a shrug into a
  wince.

The line the design is reaching for, and it should be findable in the game and not only in this file:
**you know your rivals' work better than anyone, because you trained with them.**

### Two things to get right in the build

**1.15 is not representable in this project's fixed point.** At scale 1/1024, `1.15 × 1024 = 1177.6`.
The nearest values are **fp 1177 = 1.149414** and **fp 1178 = 1.150391**. The cap must be authored as
one of those exactly, in validated content with `tuningStatus: "untuned"`, and the doc should say
which — a constant that reads 1.15 in prose and rounds differently in two places is precisely how a
determinism bug gets in.

**Familiarity is per-pair and accumulating, which means it is state.** `(species × species)` is 36
entries for six species, small enough to carry per universe. But it accrues from an interaction that
happens over time, so it needs a home in the world schema, a decay rule or an explicit decision that
it never decays, and — if it can be lost — a reason. Whether familiarity is a property of a
*universe*, an *institution*, or an individual *mage* is open, and the three give different games:
per-mage makes it die with her, per-university makes it a raid objective, per-universe makes it
history.

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

## 3a. Necromancy is the third road, and Corpus is already written

> *"Oh, also — just bringing up necromancy."*

**It is not a new school. It is Corpus, and all 23 nodes are authored**, in the institutional register
and darker than anything anyone would have specified on request:

| node | tier | its own gloss |
|---|--:|---|
| `creo-corpus` **The Long Tenure** | 3 | *"Twenty more years of working life for everyone who holds it."* |
| `creo-corpus` **The Unfinished Death** | 5 | *"Hold one scholar at the point where the body has finished and the…"* |
| `rego-corpus` **The Lengthened Term** | 4 | *"Compel a failing body to keep the arrangement it already has."* |
| `rego-corpus` **The Unclaimed Body** | 5 | *"Bind a body whose owner has gone, and set it to work that nobody…"* |
| `muto-corpus` **The Long Body** | 4 | *"Rearrange a body so that it wears at a different rate."* |
| `perdo-corpus` **The Hand That Wrote It** | 4 | *"**The standard answer to a scholar who is the last surviving instance.**"* |

*The Long Tenure. The Lengthened Term. The Unfinished Death.* The academic joke is already fully
written, and it is not a joke about magic — it is a joke about **faculty who will not retire**.

### Why this matters structurally rather than as flavour

This document argues there are two roads to the third age: **live long enough** (draconic, elf — one
mind holds all three ages) or **build the college** (human, orc — reachable only across generations,
through records and teaching). §2a rules that the college is *"the only way"* for the short-lived.

**Necromancy is the third road, and it is the one that cheats.** It does not extend a life and it
does not cross a generation. It refuses to let the generation end. A universe that permits Corpus
deeply does not need libraries the way §3 says it must, because its faculty never leaves — and the
prerequisite mass that §2a says an unassisted life cannot cross is crossed by a scholar who has been
working for four hundred years and is, technically, deceased.

That makes Corpus the **direct assault on the game's central premise**. Everything in this project is
about knowledge being mortal: §5 individuates it, decay marooned 93.4% of it, publish-or-perish names
the mechanism, and a mage who dies takes with her every node held only in her head. **Necromancy is
the answer to all of it, and it should be horrifying and expensive precisely because it works.**

### And Corpus is also the weapon against knowledge, which is the elegant part

`perdo-corpus` **The Hand That Wrote It** — *"the standard answer to a scholar who is the last
surviving instance"* — is targeted, permanent knowledge destruction, described as routine
professional practice.

So the same form both **preserves knowledge past death and destroys it at the source.** Permitting
Corpus arms your archivists and arms every assassin who comes through a portal, which is §3's
*"permitting something arms your defense **and** arms anyone who invades you"* with the sharpest
possible example. A universe that permits Corpus has made its own scholars killable in a way a
universe that forbids it has not.

**This is also the exclusivity pair the author asked for**, and it arrives with its reason attached
rather than needing one invented: a tradition built on *The Long Tenure* and one built on *The Hand
That Wrote It* are doing incompatible things to the same body, and the same faculty cannot hold both.

### Taboo is per species, and that is what lets the schools share a building

> *"Probably some races would have a taboo against it and others wouldn't, and so that would enable
> schools of necromancy to coexist in the same university as other schools."*

**This replaces the exclusivity reading above, and it is better.** The exclusion is not a rule of
magic — a tradition built on *The Long Tenure* and one built on *The Hand That Wrote It* are not
metaphysically incompatible. They are **culturally** incompatible, per species, and a species that
holds no taboo can study either.

Four consequences, and the third amends §2d:

- **A necromancy school and a healing school can stand in the same university**, taught by different
  faculty, because the constraint lives in the *person* rather than in the institution or the
  ruleset. That is the author's own point and it is the interesting one: exclusivity that does not
  fragment the map.
- **This is the per-mage exclusivity the design asked for, arriving with a reason.** The original
  direction was that *"individual mages can't learn all the magic, because the different schools are
  somehow mutually exclusive"*, with the ruling that the reason must be *"a lore / mechanic / making
  sense thing"*. A species taboo is exactly that, and it is authored data rather than a rule in code
  — the same shape as `species.json`'s existing `affinities` map, which is authored and (per W41)
  read by nothing but the key validator.
- **It breaks §2d as written.** That section rules *"students take all available classes at the
  university — that's what the university **is**."* Under a taboo, a class is offered and a given
  student **cannot take it.** So the curriculum is emergent from the faculty *and* filtered per
  student by species. That is a small change to the rule and a large one to what a mixed university
  produces: two students in the same institution graduate having learned different things, without
  anyone scheduling anything.
- **It gives mixed universities a reason to exist that is not charity.** §2e made mixed faculty
  *costly* — a teacher's pace suits her own kind and wastes everyone else's time. Taboo makes them
  *capable*: only a mixed faculty can offer a curriculum spanning a taboo. Breadth against friction is
  a real trade, and it is the first argument this design has produced for deliberately founding a
  mixed institution.

**And it lets the god's ruleset diverge from the people's culture**, which nothing else in the design
does. You may permit Corpus and find that your dwarves simply will not touch it, so only your orcs
research it — the constitution says yes and the faculty says no. That is a second, softer denial
mechanism sitting underneath §4's permit verb, and it is not one the player controls.

Two hazards worth naming now. **A taboo cannot be routed around by alliance** (§2f) — sending a
taboo-holding student abroad to a realm with no taboo should not work, or the taboo is a formality
and the whole mechanic evaporates. And a taboo species in a universe whose *only* road to the third
age is necromancy is simply locked out; whether that is a tragedy worth having or a trap depends on
there being another road, which §2a and §3 say there is.

### Open

1. **Is a bound scholar a knowledge location?** §5 has mind, grimoire, library shelf and memory
   palace. *The Unfinished Death* and *The Unclaimed Body* both imply a fifth: **a mind that has
   stopped and is still being read.** Whether it decays, whether it can still teach, and whether it
   can be looted are three different rulings and each is a different game.
2. **Does a bound scholar still publish-or-perish?** If mastery decays in the dead, necromancy buys
   time and not permanence, which is a better mechanic. If it does not, tenure is genuinely forever
   and the price has to be somewhere else entirely.
3. **Corpus is dark in v1** — the enabled rectangle is `{intellego, perdo, rego} × {limen, mentem,
   nomen, terram}`. None of these 23 nodes is reachable today.

## 3b. Outside review, and two rulings taken on it

An external model was given the nine mechanics cold and asked where they break. Three of its findings
land, and I have ruled on two as delegated author.

### It found a contradiction I wrote myself

> *"Item 2 says the college is the **only** road to the third age. Item 7 calls necromancy the **third
> road**. So it is either a second road *through* the college, a road *around* it, or item 7 is
> overselling it."*

Correct, and mine. §2a and §3a contradict each other flatly.

### RULED: the college is the *fast* road, not the only one

> *"'Only road' is a trap. It converts a strategic question — how do I reach the third age? — into a
> binary gate: build college or lose. There is no decision, no tension, no interesting failure…
> **A rule that tells the player their job is to stop playing is a bad rule.**"*

**§2a is amended: a fully developed college is the fast, reliable road. It is not the only one.** The
alternative is slow, fragile and attrition-based — scattered independent researchers who may die
before they teach anyone, which is exactly the loss channel the game already models.

That preserves the thing §2a was protecting (an institution is *load-bearing*, not optional-feeling)
while restoring a decision: invest in the institution, or gamble on geniuses. It also removes the
contradiction — necromancy is then a third road among several rather than an exception to a rule that
said there were none.

The reviewer's sharper version of the same point is the one to keep in view:

> *"The optimal strategy is: permit everything, build a college, then do nothing. The design hands the
> player a god-role with seventy cells of veto power, then proves that exercising it is strictly worse
> than not. **Either the college system self-optimizes, in which case the player is unnecessary, or
> active intervention is broken, in which case the player is punished.**"*

That is the measured `permit-then-idle` result restated as a design problem rather than a balance
one, and it is the sharpest framing of it anyone has produced.

### RULED: a compound is held by the *university*, not by a mage or a named group

`ages-of-magic.md` §5 listed "who holds a compound" as an open question and my own answer — a standing
arrangement between named mages — was worse than the reviewer's:

> *"The university holds it. A compound spell isn't a thing any one mage possesses — it is a **pattern
> of overlapping partial knowledge across the faculty**. No single mage needs to hold all cells; the
> compound exists as long as enough mages hold enough of its cells in a teachable state
> simultaneously."*

**Adopted.** Four reasons, all of which connect mechanics that were separate:

- **A raid attacks the *distribution*, not a target.** There is no scroll to steal and no one mage to
  assassinate — you degrade a faculty until an overlap fails.
- **Fragility is organic rather than authored.** Lose three faculty and a triple-compound collapses
  not because they held specific cells, but because the remaining overlap drops **below
  teachability** — which routes the whole thing through publish-or-perish and the measured 93.4%.
- **It is why colleges are necessary**, and it says so mechanically rather than by fiat: only an
  institution sustains the density of overlapping knowledge a compound needs. That is a much better
  argument for §2a than §2a made for itself.
- **The third age becomes a property of a roster**, not of a prodigy — which is precisely the
  long-lived-versus-institutional split §3 draws.

It also composes with §2d exactly: a curriculum is what the faculty can still teach, and a compound is
what the faculty can still *combine*. Same quantity, one order higher.

### Not ruled, and the one I think is most dangerous

> *"The 93.4% fact kills paced teaching. **The university doesn't compress the passage to the frontier
> — it compresses the passage to forgetting.** You have built a system where the act of teaching
> destroys the thing being taught, and the pacing rules control the speed of erosion."*

I do not think this is right as stated — teaching does not consume the teacher's mastery in the
current model — but the shape of it is: **with no `publish` operation, every hour a scholar spends
teaching is an hour she is not spending keeping her own standing**, and paced teaching makes those
hours longer for mismatched pairs. The reviewer's conclusion stands either way and matches §2c's:
**build `publish` before building paced teaching.** Ordering matters here and it was not obvious
before.

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
