<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Discoverable traditions, and the sorcerer

*Proposal, 2026-08-13, from the owner: some traditions should be **discovered** rather than chosen at
founding — and wild magic and sorcerers are not expressible at all today.*

## What cannot currently be said

`packages/state/src/components.ts` puts `traditionId` on the **universe** row, with the comment
*"Exactly one tradition; never 0."* A tradition is resolved into `WorldStepDeps` **before
`Scenario.create` is called**, and content is memoised per tradition for the life of the process.

So today a tradition is: **one per universe, fixed at founding, known before the first tick.**

**A sorcerer is a mage practising a tradition her universe does not have.** That sentence has no
representation. Not "is unimplemented" — *unsayable*, because the only place a tradition can live is
the universe.

## The two shapes this actually needs

They are different changes and should not be conflated:

**1. A tradition discovered by the universe.** Still universe-scoped, but arriving *during* a run
rather than at founding. Cheaper: `traditionId` already exists on the row, and nothing about the
schema forbids writing it twice. What it costs is the memoised content — content is resolved per
tradition **before any task is seen**, so a universe that changes tradition mid-run needs content it
was not built with.

**2. A tradition held by a mage.** This is the sorcerer, and it is the larger change: a second
`traditionId`, on `MAGE`, optional, meaning *"this one, not the universe's."* Every hook resolution
becomes per-mage rather than per-universe. **That is a world-schema revision and a hot-path change**,
and the hooks are the one licensed exception to content-lives-in-data, so it touches the most
carefully-guarded seam in the project.

## Why the sorcerer is worth the larger change

`mvee` has the two archetypes already authored, and both share the property that makes them sorcerers:

| paradigm | techniques × forms | teachable | writable |
|---|---|---|---|
| `wild` | 3 × **13** | **no** | **no** |
| `talent` | 7 × 12 | **no** | **no** |

**`wild` reaches thirteen of the fourteen forms with three techniques.** That is the widest form
coverage of any paradigm in that set, and it cannot be taught or written down. Eleven of `mvee`'s
thirty-seven paradigms are `teach=false`, so this is a populated region of the space rather than one
odd entry.

**And it is the answer to a problem the campaign has already measured.** W105 found that under the two
standard-acquire traditions the universe ends with **zero teachable instances** — teaching totals 4.1
lessons in 2400 ticks. That reads as a defect while a tradition is a universe-wide constant, because
the whole universe becomes untransmittable at once.

**Per-mage, the same property is a character.** A sorcerer in an academic universe is one mage whose
knowledge dies with her, surrounded by scholars whose does not. **The thing that is a catastrophe at
universe scope is a tragedy at mage scope** — and the owner has already named that tragedy as the
tone they want.

It also answers *"the mid and late game are governed by the interactions of two"*: a universe with one
tradition has one set of rules; a universe with a sorcerer in it has two, and the interaction is the
game.

## Where discovery would come from, without inventing a mechanism

Three routes exist already and none needs new machinery:

- **Birth.** Personality is rolled at birth from species means. A rare innate tradition is the same
  draw, on its own stream.
- **Rediscovery.** The 3× rediscovery multiplier already models a mage recovering something lost. A
  tradition recovered rather than taught is the same shape at a different scope.
- **Raid.** `foreignMagicPolicy` — `compatible` · `hostile` · `incompatible` · `absorbs` — is `mvee`'s
  enumeration of what happens when foreign magic arrives. **`absorbs` is a discovered tradition, and
  §3's Portal Rule is already the place it would happen.**

The third is the most interesting because it makes raiding a way to *acquire a paradigm*, not only to
steal nodes — and W93 found `rules-raid` currently has nothing worth stealing.

## Order, and the honest cost

1. **Import the paradigms as content first** — they are already authored, and a tradition that exists
   as data is testable before anything about scope changes.
2. **Then universe-scope discovery**, which needs only the content-resolution fix.
3. **Then the per-mage tradition**, which is the schema revision, and should not be started until 1
   and 2 have shown the content is worth the seam.

**Do not do this before the founding rule lands.** One-species founding plus alliances is a larger
change to the same starting position, and two schema-adjacent changes to how a universe begins should
not be in flight together.

---

## The late game: the world fills with magic, and something comes through

*Owner, 2026-08-13. This is where sorcerers belong, and it resolves the scoping question above by
making it a question about **when** rather than **whether**.*

**Sorcerers are not a starting choice. They are what happens to a world that has become saturated.**

    early    one species, a small square, magic is raw and new
    mid      worship, universities, prodigies, alliances through portals
    late     the world is full of magic
               → sorcerers appear — untaught, innate, unteachable
               → portal magic opens holes it did not mean to
               → demons, fae, things not (yet) playable come through
               → and pact magic becomes available

**That is the late game having its own character rather than being the mid game with bigger numbers**,
which is the thing the phase weighting (late 3 : mid 2 : early 1) was written to reward and which
nothing has yet supplied.

### Portal magic gains a second consequence, and that is what makes it a decision

Portal magic is already the gate on alliances — *"dragons have to make friends"* runs through it. **Now
it is also how you get holes.**

**One verb, two consequences, one of them unintended.** That is a real strategic decision rather than
a prerequisite to be satisfied: a civilisation that opens itself to other peoples has opened itself,
and cannot choose to be open only to the ones it likes. **The species you wanted and the things you
did not are the same door.**

It also gives forbidding its late-game job. `perdo-limen` or a prohibition on portal cells becomes a
real move — *close the doors* — with a real cost, because the doors are how your allies come too.

### Why pact magic specifically, and why it can only be late

`mvee`'s `pact` paradigm is `allowsTeaching: false`, `allowsScrolls: false`, `sources: divine`,
4 techniques × 4 forms. **Power granted by an entity in exchange for something.**

**It cannot exist before there is an entity to bargain with**, which is exactly why it is late-game:
the holes are what bring the counterparty. So pact is not a tradition a universe founds under — it is
one that becomes *available* when something arrives that can grant it.

And its properties are severe in a way the campaign has already measured. Under standard-acquire
traditions a universe ends 2400 ticks with **zero teachable instances** and teaching totals **4.1
lessons** — which reads as a catastrophe when it is the whole world's rule. **Per-mage, and late, it
is a bargain a particular scholar made**: her power is real, it is hers, and it dies with her. That is
the tragedy this design keeps reaching for, and it lands correctly only at mage scope.

### What this resolves about the two shapes above

The document above separated *a tradition discovered by the universe* (cheap) from *a tradition held by
a mage* (a schema revision). **The late game needs both, and in that order:**

- **Sorcerers are per-mage.** A sorcerer in an academic universe is one mage playing by different
  rules, which is precisely what the universe-scoped `traditionId` cannot say.
- **Pact is per-mage too**, and for the same reason — it is a bargain someone made, not a law of the
  world.
- **But what changes at the universe level is that the world became saturated**, and that is
  universe-scoped and cheap: a threshold on how much magic exists, which the worship-to-width
  progression is already computing.

So the sequence is: **universe-scoped saturation state → which makes per-mage traditions possible →
which is what sorcerers and pact are.** The expensive change is still expensive, and it now has a
reason to happen that is bigger than "sorcerers would be nice."

### Two things to be careful of

**Non-playable species are a new category and should stay one.** Demons and fae that *arrive* are not
a seventh and eighth entry in `species.json` — they are things a universe deals with, not things it
founds as. **"Not (yet) playable" is the owner's phrasing and the parenthesis should be respected:**
the design should not foreclose them becoming playable, and should not assume it.

**And the late game must not be only bad.** Sorcerers, holes and pacts are all *pressure*. If the late
game is exclusively things going wrong, the arc is a decline rather than an age — and the owner's
framing elsewhere is *ages of magic*, which is a thing to reach, not to survive. **The saturated world
should also be where the best magic finally exists**, and the search's phase weighting will report
which of those two it actually is.
