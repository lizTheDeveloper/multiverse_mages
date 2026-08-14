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
