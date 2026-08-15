<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Running the strategy search

*Written 2026-08-13 against `w100/quality-diversity-search`. The design and its reasoning are in
`self-evolving-search.md`; this is the operating manual. If a number here disagrees with the code,
**the code is right** — re-verify against a ref before acting.*

## What it does

    node packages/mc-harness/bin/search-strategies.mjs \
      --scenario ./packages/scenario/bin/scenario.mjs \
      --seeds 8 --ticks 1200 --workers 4 \
      --out ./balance/search/archive.json

It evaluates every strategy in `BOT_POOL` — candidates **and** the four nulls — over the same seeds,
bins each one's behaviour into an archive coordinate, and reports three numbers:

```
[search] WIDTH 1   margin-over-null 1
[search] reachable-not-worth-playing 2
  not-worth denial-warden        asc 0/2  bar 0  nodesKnown:0|universities:0|libraryDepth:1|…
  not-worth archivist            asc 0/2  bar 0  nodesKnown:2|universities:0|libraryDepth:3|…
  OCCUPIED  allocate-concentrate asc 1/2  bar 0  nodesKnown:4|universities:0|libraryDepth:3|…
```

- **`WIDTH`** — cells occupied by a strategy that beats doing nothing. **This is the score.**
- **`margin-over-null`** — best elite's ascensions minus the best null's, on the same seeds. **If this
  is not growing, nothing else in the archive matters.** It can be negative, and is reported that way.
- **`reachable-not-worth-playing`** — cells something reached and nothing worth playing did.

## The four rules you must not break

**1. One `sweepId` for the whole comparison.** `seed.ts` derives a run's seed from
`(rootSeed, sweepId, cellIndex, replicateIndex)`. Give each round its own id and every candidate plays
a *different* set of universes, so a candidate-versus-null difference carries a seed-set difference
too. `tune-balance.mjs` records that two earlier searches did exactly this. **The ladder is more
sensitive to it than a tuner is**, because the entire comparison is candidate-against-null on the same
worlds. The constant is `SWEEP_ID` and it is constant on purpose.

**2. Never store the null bar.** The nulls run every round. Doing-nothing's score changes as the
content and the mechanics change, and a cached number would rot exactly the way this project's stale
documents have — one on `main` misled two agents in a single day.

**3. Never add an axis that is not already a registered metric.** An axis whose descriptor cannot move
produces a one-cell archive that looks like a finding. Ten instruments in this project have read as
healthy constants while being structurally incapable of moving. **If you want a new axis, first show
the metric moves** — that is what `w98/metric-reachability` is for.

**4. It does not commit, and must not be made to.** Baseline conflicts grow quadratically with
branches in flight; the queue hit fourteen `DIRTY` at once. And a merge here caught a compile-level
defect **git did not flag, because it was not a conflict**. Promotion is a batched PR a person reads.

## How to extend it, in the order that will actually work

**Adding a behaviour axis** — edit `axes` in the bin script. Each entry is
`{ id, edges }`, `edges` ascending interior boundaries. A descriptor falls in bin `i` when it is below
`edges[i]`. Two strategies one node apart inside a bin are **one** way to play, which is the point of
binning at all. `universities` and `ascensionPath` are currently wired to `0` — **they are placeholders
and the archive is narrower than it looks until they carry real values.** Wiring them is the single
highest-value change to this file.

**Mutating strategies** — `mutateOrder` swaps two entries of a preference list. That is the whole
genome today and it is deliberately small; a preference list is what a strategy *is*. The mutation
draw comes from `searchRng`, seeded by `--search-seed`, and **not** from the simulation's PRNG:
appending an RNG stream forces a re-baseline event (`contracts.md` §6), and the search must be free to
change how it explores without invalidating every committed measurement.

**Evaluating a mutant** — this is the gap. `BOT_POOL` entries are resolved by id, so a mutated
preference list has nowhere to live until the pool can take a supplied definition. Until then the loop
re-evaluates the shipped pool, which still measures width honestly but cannot *grow* it.

## What it currently says about the game, and what that is worth

At 1200 ticks on reference content: **width 1, margin +1.** One strategy beats doing nothing, and
`denial-warden` and `archivist` occupy cells nothing worth playing reached.

**Do not read that as a verdict on those strategies.** The horizon is short, the replicate count is
small, two axes are placeholders, and the pool is the shipped one rather than an evolved one. It is a
statement that the instrument works and reports a defensible number — which, in a project that has
shipped ten instruments incapable of moving, is the thing worth establishing first.

## When you get a result you like

**Check it against the null before believing it.** Every one of the four nulls has beaten a designed
strategy here, and each time it was found by accident rather than by a standing check. That is what
the ladder exists to make impossible, and a result that skips it is the failure mode this whole
apparatus was built to end.
