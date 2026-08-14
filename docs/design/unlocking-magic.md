<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Worship widens the grid, and universities are how

*Decision, 2026-08-13, from the owner. It supersedes worship's briefly-held role as the species cap —
species is now one at founding with alliances as the route — and gives worship a better job.*

## The progression

A universe **starts narrow and earns width.**

    one species · a small square of the grid
        ↓  worship accrues
    more kinds of magic become possible
        ↓  and it is universities that unlock them
    a very magical world — many cells open, and forbidding one finally costs something

**Worship buys grid width.** Not tempo, not species — **what magic can exist at all.**

## Why this is worship's right job

Worship is the project's most complete economic loop and has never had a structural consequence.
`favor-cap-base`'s own gloss admits it: the cap *"converts a worship lead from power into tempo — a
high-worship god cannot do more things, only sooner."* **Tempo is not a consequence. It is a rate.**

And the loop is already built to carry this: three saturating classes — mage, university, populace —
each with a per-head rate and a half-cap, plus `dailyRelevance` scaling worship **per cell** by what
that magic is *for* (measured: `daily` versus `spectacle` widens +23.0% → **+48.8%**).

**So the loop closes on itself, and it is legible:** open cells that serve daily life → earn more
worship → unlock more cells. **What you allow decides what you may later allow.** A god who permits
spectacle grows slowly; a god who permits water and crops grows into a wider grid.

## Universities as the unlock, which fixes them too

The owner's instruction is that the unlock runs *through universities*, and that is the part which
repairs a subsystem rather than adding one.

**Universities currently have exactly one growth axis: library depth.** Everything else about them is
either unbuilt or unreached — `universityProfile` and `dominantCell` have no production caller,
`admitStudents` and `effectiveCapacity` are built and unwired, `UNIVERSITY_STAFF` is declared and never
read so every university draws from one global scribe pool. **W85 and W89 found five such subsystems.**

Making universities the gate on grid width gives them **the second growth axis ep 41 asked for**, and
it is a better one than the "coordinated non-magical throughput" I had queued: it is not a parallel
number to grow, it is *the reason the institution exists*.

It also gives an answer to a question the campaign could not: **why found a second university?** Today
`archivist` builds roughly thirteen hundred of them and reaches the same 51 nodes that doing nothing
reaches. If universities are what convert worship into permitted cells, a second one is a second
frontier rather than a second pile.

### The mechanism: a great person, and you get the student you get

*Owner, 2026-08-13, resolving what the previous paragraph left open.*

**A new kind of magic is discovered the way a new kind of science is: by a person.** Not by a
threshold quietly opening a cell. Worship accrues into a charge; the charge is spent on **a student at
a university**; that student founds a discipline.

**This is Civilization's great-person mechanism, with one change that makes it better: you pick a
random student.** You do not groom the prodigy you wanted. You get the ones you have, at the
universities you built, of the species you founded with — and one of them becomes the person who
opened a cell of the grid forever.

That single constraint does a lot of work at once:

- **It makes the roster matter.** Who is at your universities decides what magic your civilisation can
  invent. A god with two students has two futures.
- **It makes universities the gate without inventing a gate.** The student must be *somewhere*. That is
  the unlock running through universities, exactly as instructed, using nothing new.
- **It makes species choice permanent in a second way.** Under one-species founding, the discipline
  your civilisation invents is invented by a member of the only species you have.
- **And it is how sciences are actually founded** — a person, at an institution, at the frontier, and
  which person it turns out to be is substantially luck.

### The verb already exists, and it is the one nobody uses

**`grantFoundingKnowledge` — action 8 — is this button.** It is on the UI branches, it takes a mage
handle and a node, and W83 measured its exact problem:

> The verb is not unreachable, it is **unchosen**. `narrow-depth` sees action 8 legal on **76% of ticks
> and asks zero times**. Nine of ten strategies never submit it. And founding knowledge is worth about
> **1% of outcome** — remove all of it and `permit-then-idle` goes 194.5 → 193.5 nodes.

**Because it seeds a node.** A node is worth 1%. **A discipline is worth a column of the grid.**

Reframing action 8 from *"seed one node in one mind"* to *"elevate one student, who founds a kind of
magic"* is the same verb, the same handle, the same UI button — and it goes from a 1% channel nobody
chooses to the most consequential act a god performs.

**And `w69/grant-budget` already built the scarcity.** It made grants a budget that accrues from
*nodes the mages discovered for themselves*, deliberately so that a god's own grant could not be read
as a discovery. **Swap that accrual to worship and the mechanism is finished** — the budget, the mask
edge, the refusal-when-spent and the swept constants are all landed and tested.

### Two questions this leaves, both worth measuring rather than deciding

**How random is "a random student"?** Fully random makes the roster a lottery; weighted by aptitude or
by the university's dominant cell makes it a consequence of play. **Weighted is more likely right** —
it rewards building the right institution — but a lottery is more likely *fun*, and this project has
no measurement of fun. Sweep the weighting, with pure-random and pure-deterministic as the ends.

**What exactly does the student open?** *Resolved by the owner, and the answer is better than either
option here was.*

**One node — but a node of a kind that has not been done before.** A new type of magic, a new
technique, a new material, a school nobody has founded. **The foundational-ness is not in the size of
the grant. It is in whether that kind of thing has ever existed here.**

That is a *derived* property, not an authored one, which is the same discipline this project already
applies to age and to era: **a grant is foundational if it is unprecedented, and ordinary if it is
not.** Grant a node in a cell your mages already work and you have helped a student. Grant the first
node of a technique nobody has used and that student founded a discipline.

Three things fall out of it, all good:

- **`w69`'s budget arithmetic survives unchanged.** One grant is still one node. The scarcity, the
  accrual, the mask edge and the swept constants all stand.
- **The mechanism already half-exists.** `compareNovelty` reads a `libraryHolds` flag to prefer
  copying what a library lacks, and `w69`'s accrual already tracks `everKnown` against `seededNodes`
  precisely so a god's own grant is not counted as a discovery. **Both are the same question —
  *has this been seen before?* — asked at different scopes.**
- **And it matches how a science is actually founded.** The first paper in a field is foundational
  because it is *first*, not because it is long. A god does not hand down a discipline; a god hands a
  student one unprecedented thing, and the discipline is what the civilisation builds on it.

**What remains to define is the equivalence class** — *what counts as "of a kind not done before"*:
cell, technique, form, material, or some conjunction. **That is a real design question and it decides
how often a grant is foundational**, so it should be measured rather than picked: a class so narrow
that every grant is foundational makes the distinction meaningless, and one so wide that none ever is
makes it decoration.

## What this does to forbidding, which is the late game

**Forbidding is currently almost free and almost pointless.** The whole grid costs 84 favor, once. The
symmetry check in `god.ts` refuses content where permitting and forbidding cost different favor —
citing pillar 1 — while the *total* price is asymmetric anyway: permitting is exempt from the worship
shock, and only forbidding charges irreversible mastery loss.

**Under this progression, forbidding acquires a real price for the first time**: you are giving back
width you *earned*. Early, with four cells open, forbidding one is a quarter of your world. Late, with
forty, it is a scalpel — and by then there is enough magic that some of it is worth refusing.

**That is where "forbidden magic" becomes a design rather than a flavour.** A cell you have unlocked,
staffed, and then outlawed is a different object from a cell that was never open — the knowledge
exists, the mages who hold it exist, and now it is illegal. `decay.ts`'s irreversible mastery loss is
already the mechanism; it has simply never had a world rich enough to matter in.

## What it needs, honestly

1. **The opening square**, so that a universe starts narrow at all — `w72`, measured, ruled 3×3.
2. **A worship-to-width function**, swept rather than guessed, with both degenerate ends as controls: a
   threshold nobody reaches makes this the opening square with extra steps, and one reached immediately
   makes it decoration.
3. **Universities to be reachable and to matter** — at minimum `advanceConstruction` producing
   universities the god did not personally fund, and `universityProfile` having a caller.
4. **Content in the cells being unlocked.** 249 of the 300 authored nodes have never been exercised,
   and the campaign's central finding is that content is the binding constraint. **Unlocking a cell
   whose nodes are wrong is unlocking nothing.**

## The one thing to watch

**This makes the early game narrower than it has ever been measured**, and the early game is already
the most constrained. A universe with one species, a 3×3 square and no allies has very few legal moves,
and the phase weighting (late 3 : mid 2 : early 1) says diversity there is cheap — **but a phase with
*no* diversity is not cheap, it is a cutscene.**

Measure `widthByPhase.early` before and after. If it goes to 1, the opening is a tutorial rather than a
decision, and the fix is to start wider rather than to make the unlock faster.
