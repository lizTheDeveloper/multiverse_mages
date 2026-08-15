<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# A harness and a UI for every subsystem, and a meta UI over both

**Owner's ask, 2026-08-14.** Measured against `main` at `7694528`.

> *"I want to see harnesses for each sub-game, and also a UI for each sub-component, and a meta UI
> that shows the harness run on each of the UIs for the sub-components."*

Three layers, and the third is the one that does not exist anywhere yet.

## What already exists, so nobody rebuilds it

**Harnesses:**

| subsystem | harness | state |
| --- | --- | --- |
| raids | `rules-raid` isolation harness | **landed** (#122); `RaidRecord` now carries `actionEconomy` (#145) |
| universities | `university-harness.ts` | on #125, and being extended to the full state space now |
| whole world | `mc-harness` sweeps + the QD archive | landed |
| species separation | `bin/species-separation.mjs` | landed (#143) |
| **economy** | — | **none** |
| **knowledge / magic** | — | **none** |
| **god / worship** | — | **none** |

**UIs** — `ui/` already holds eleven prototypes: `ascension`, `commitments`, `console`, `edicts`,
`glow`, `knowledge`, `mage`, `raid`, `ruleset`, `ruleset-symmetry`, `targets`, `tempo`, over a shared
`session.js` and theme. #121 wired them to a real session, and `ui/session.json` is a recorded 401-frame
run pinned by a byte-for-byte test.

**So the UI layer is further along than the harness layer**, and the gap is not "build UIs" — it is
that **the UIs read a *recorded whole-world session* and the harnesses run *isolated subsystems*, and
nothing joins them.**

## The three asks, restated as work

### 1. A harness per sub-game

Missing: **economy**, **knowledge/magic**, **god/worship**. Each should follow the shape `rules-raid`
and `university-harness` established — construct the subsystem's entire input surface without running
the world loop, sweep it, and report.

The economy one is the most urgent, for a reason below.

### 2. A UI per sub-component

Mostly present. What is missing is that a UI cannot currently be pointed at *a harness run* — only at a
recorded session. Making `session.js` accept a subsystem harness's output as a source, alongside
`session.json`, is the smaller half of this.

### 3. The meta UI — new, and the interesting one

*"A meta UI that shows the harness run on each of the UIs for the sub-components."* One surface that
runs a subsystem harness and renders its output through that subsystem's own UI, so a sweep is
*watchable* rather than a table. `ui/console/index.html` is the natural host.

This is the piece with no precedent in the repository, and it is what turns the harnesses from a
regression net into a design instrument — the difference between *"the numbers moved"* and *"I can see
what the universe did."*

**Constraint that must not be lost:** the UIs are browser code in no build and no tsconfig, read as
text by their tests, and the simulation core has zero runtime dependencies and does no I/O. **The meta
UI must not become a reason to link the core to a renderer.** Harness → file → UI, the way
`session.json` already works.

## Worship from daily economy magic

> *"We get worship when mages usefully use economy magic in daily life. When economy magic happens we
> get worship, so the god can enable more magic. That part needs to happen, and I think it should be
> somewhere in the economy section."*

**This is the loop that makes the whole game compound**, and it is the reason the economy harness is
the urgent one: *cast → economy improves → worship rises → god permits more magic → more casting.*

Two things already exist and one is measured:

- **Worship already depends on what magic is *for***: daily-relevance magic produced **+48.8%** worship
  against spectacle's **+23.0%**. So the *principle* is in the game.
- **PR #63** (`w60/daily-relevance`) is exactly this feature — *"Daily relevance, the missing
  `permits()` call, and a declared knob on the compounding loop"* — and it reports itself as
  **built, tested, behaviour-preserving, and measurably inert against the current bot pool at a
  twelve-cell opening.**

**Read that last part against everything else decided today.** #63 is inert *because the opening is
twelve cells and the base of the pyramid has nothing worth casting* — five of 59 `resource-yield`
effects in enabled cells, all routing to stone, and stone buys nothing. It is not a broken mechanic; it
is **a mechanic waiting on the content and the opening square that are now being built**.

So the sequence is already implied: **low-tier economy nodes worth casting → the opening square that
makes reaching them a choice → #63's loop stops being inert → the economy harness measures the
compounding.** #63 should be re-measured, not rewritten, once the first two land.

## Suggested order, and why

1. **Economy harness** — it is the missing one that the compounding loop runs through, and #63 cannot
   be judged without it.
2. **Point one existing UI at one harness run** — smallest possible proof that the join works, before
   generalising.
3. **The meta UI**, once there are two harnesses to switch between.
4. **Knowledge and god harnesses**, which have more of their surface already exercised by the
   whole-world sweeps.

Nothing here is scheduled ahead of the owner's existing sequence — land #72, sweep the opening square,
v1 versus all nodes, universities. This is what comes after, or beside it where it does not compete for
the same files.
