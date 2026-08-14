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

**The specific mechanism is deliberately not fixed here.** Candidates, in the order I would test them:
a university's *dominant cell* determining which neighbouring cells it can open; total university
capacity setting how many cells may be open at once; or a university being required to *hold* a cell
for it to remain permitted. **The third is the most interesting** — it makes width something a
civilisation maintains rather than accumulates, and it means a collapse *narrows the world.*

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
