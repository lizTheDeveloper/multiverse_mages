<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W22 — knowledge observability: where the physical knowledge is kept

**Branch:** `w22/knowledge-observability`. **Role:** instrument-builder. **Changes no constant, no
rule, no magnitude, and no world state.** Never runs `goldens:regen`; regenerates no balance
baseline. If a golden or a baseline moves, that is a bug in this change and gets reported, not
absorbed.

## The ask, and the defect underneath it

> "The player should be able to see the number of spells that your crew has discovered and knows,
> and **where the physical knowledge is kept**." — the author

Vision §5 is entirely about knowledge *having a location*: a mind that dies with its mage, a
grimoire that is lootable and burnable, a library that is a raid objective, a memory palace lost
utterly when its holder dies. None of that is visible from anywhere a player or a harness can
reach.

What exists today, measured:

- The §4.1 observation's `knowledge` block is **70 cells × 3** — nodes known, deepest tier,
  instance redundancy. It is **per-cell, never per-node**, and carries no location split at all.
- `agent-api`'s `digestKnowledge` builds a `Set` of node ids per cell and **throws it away**
  (W15 measured this).
- `scenario/census.ts` re-derives `referenceNodesKnown` by summing the 70 per-cell counts back out
  of the observation vector — a census built on top of the lossy projection.
- `mc-harness`'s `KnowledgeCensus.offer` is the right shape and **has no production caller**.
- `explain.ts` is types with no producer; `metricDeltas` is always `{}`.

So a game about the preservation of rare skills cannot say which skill is rare, cannot say which
node is one copy from loss, and cannot say what any individual mage knows.

## What gets built

A read-only, per-node, location-aware **knowledge census**, with four outputs:

1. **Per-node census** — for each node the universe holds: total instances, and the count at each
   `LOCATION_KIND` (mind 1 / grimoire 2 / library 3 / palace 4). §1.5 defines existence as instance
   count ≥ 1; this is that number, disaggregated.
2. **Fragility** — the set of nodes standing at exactly one instance, plus the minimum redundancy
   over held nodes, plus the two sharper questions a raw count cannot ask: which nodes have **no
   written copy at all**, and which nodes have every copy in **one place**. Singletons are boring
   today — zero at tick 2400 — so It is reported anyway, because it is the number that becomes
   interesting the moment copies get scarce, and W20 and W8 are both pushing on that.
3. **Per-mage repertoire** — the node set a named mage holds, and the pairwise **containment**
   relation over mages: whether two mages in one universe can hold *incomparable* knowledge sets,
   neither a subset of the other. This is the instrument W20 (compositional content, anti-requisites,
   per-mage coverage) and W21 (technique envelopes as cost curves) will be measured with, so it
   ships as a callable function, not a number buried in a report.
4. **Where the physical knowledge is kept** — the aggregate the author asked for: the universe-wide
   split of instances across mind / grimoire / library / palace. That single ratio is the
   archivist's whole strategy and it is currently invisible.

## The home, and the three options weighed

The §4.1 observation vector is a **fixed-width contract** with a pinned layout digest; `gym-bridge`
refuses to start when the digest moves, precisely so a trained policy cannot be handed
differently-shaped numbers. Vision §6 records the same reasoning for institutions. So a per-node
channel for 300 nodes is not obviously affordable and must not be added by accident.

**Option A — widen the observation vector.** Add a per-node or fragility channel; bump the layout
digest; accept that every trained policy is invalidated. **Rejected, with the counter-argument
answered rather than ignored.** The honest argument *for* it is that there are no trained policies
today, so now is the cheap moment and the cost is zero. That argument is real. It loses on a
different ground: **the channel would be very nearly a constant.** Measured with the instrument
this change ships: **zero single-instance nodes at tick 2400**, minimum redundancy 4, mean 42.6
copies per node, and one singleton at tick 240 that is gone by tick 500. A fragility input today
feeds an RL agent a column that is zero almost everywhere — it teaches nothing, and it commits the
layout to a shape chosen before anyone has seen a non-degenerate distribution to shape it around.
The cheap moment is not lost by waiting, because it is only cheap while there are no policies, and
there will be none until fragility is non-trivial. What waiting *does* risk is that the widening
gets deferred forever, so it is **pre-priced** below rather than left as "revisit later".

**Option B — a fixed-width fragility digest inside the observation** (the audit's own suggestion).
Same objection as A, at smaller width. Kept as the pre-priced follow-up.

**Option C — a diagnostic projection outside the observation vector. Chosen.**
`contracts.md` §4.4 already licenses exactly this shape, for exactly these reasons:

> It is **not** part of the RL observation. It is emitted on request, is never an input to any
> rules computation, and no simulation behaviour may depend on whether it was requested.

The census is a second projection under §4.4's guarantees. It is **not** the explain channel:
`explain.ts` is decision-shaped (`ExplainedDecision` carries `goalId` and utility `scores`) and
waits on `rules-world`'s goal vocabulary. Shoehorning a census into it would misuse a type that is
already correct. It ships as a sibling module in `@mm/agent-api` under the same contract, and it
gives §4.4's channel-family its **first producer** — which is the half of the audit's "types with no
producer" finding this workstream can honestly close.

**What Option C costs, stated plainly.** An RL agent cannot see fragility, cannot see the
mind/book/shelf split, and cannot learn "protect the last copy" or "scribe before she dies". Any
policy that needs those must be trained against a widened vector, and this change does not provide
one. The human client, the Monte Carlo harness, W20 and W21 all get the numbers; the learner does
not.

**The pre-priced follow-up, so the deferral is a decision and not a drift.** When singleton count
first goes above zero on the reference universe, add a **4-slot fixed-width fragility digest** to
§4.1: `[singletonNodeCount, minRedundancyOverHeldNodes, mindShare, writtenShare]`. Cost: observation
width +4, one `OBSERVATION_LAYOUT_DIGEST` bump, `contracts.md` §4.1 table edited, `gym-bridge`'s
refusal fires once for every consumer, and **every trained policy in existence at that moment is
invalidated**. That is the whole bill. It is four slots because §4.1's own institutions precedent is
four, and because a digest is what survives a fixed width — a per-node channel never will.

## What this change does *not* touch, said explicitly

- **No world state added** → no `WORLD_SCHEMA_VERSION` revision. The census is derived, every field
  of it, from `KNOWLEDGE_INSTANCE` and `MAGE` rows that already exist. §1.5's "derived, never
  stored" rule is respected: nothing caches existence.
- **No observation change** → `OBSERVATION_LAYOUT_DIGEST` does not move, `gym-bridge` does not
  refuse, no policy is invalidated.
- **No golden regenerated, no balance baseline regenerated.** `verify` must show zero delta on every
  gate metric.
- **No rules-path float.** The census is a read on the boundary side; `@mm/agent-api` is already the
  one package §4.1 permits floats in, and the census emits integers and `fp` anyway.
- §5 module boundaries hold: `KNOWLEDGE_INSTANCE`, `MAGE` and `LOCATION_KIND` all live in
  `@mm/state`, which `@mm/agent-api` already depends on. Nothing in the rules path imports the
  census.

## One census story, not three

The repo would otherwise end with three: `scenario/census.ts` (per-cell, decoded back out of the
observation), `mc-harness`'s uncalled `KnowledgeCensus`, and this one. This change **supersedes the
lossy derivation** by reading state at the source of truth, and says so where each of the others
lives. It does not delete them in this change — `scenario/census.ts` feeds committed baselines and
removing it is a baseline-moving act, which this workstream is forbidden from doing.

## Inertness, proved not asserted

A census is a read. It must not perturb the simulation, and W15's standard is the one to match: a
run **with** census calls interleaved and a run **without**, at identical coordinates, must produce
the **same `snapshotHash()` and the same terminal reason**. If they differ, every number below is
void. This is a committed test, not a one-off script.

## Tasks

- [x] Read vision §5 / §7a, contracts §1.5 / §4.1 / §4.4, `campaign-plan.md`, `vision-audit.md`, `CLAUDE.md`
- [x] Trace `KNOWLEDGE_INSTANCE`, `LOCATION_KIND`, `MAGE`, the observation layout digest, `explain.ts`
- [x] Commit and push this plan
- [x] `packages/agent-api/src/knowledge-census.ts` — the projection, pure, one pass
- [x] Unit tests: per-node counts, location split, singleton detection, per-mage repertoire, containment
- [x] Inertness test: snapshot-hash and terminal-reason identity, censused vs uncensused
- [x] Digest-stability test: `OBSERVATION_LAYOUT_DIGEST` unchanged by this branch
- [x] Reference-universe numbers via a `tools/w22` reporter, cross-checked against audit Proof 3
- [x] `npm run verify` green, reported exactly, with per-gate deltas
- [x] Report `illegalActionRate` (audit C7) and `metricDeltas` findings; fix neither

## What the census found on the first run

The instrument's first use turned up a defect no committed measurement can see.
Coordinates: reference universe, seed `0x00090001`, zero god input, `cohortSize 4`,
`foundingNodes 4`. The audit's Proof 3 used **six** founding grants against these four, so
these numbers sit *beside* Proof 3 rather than superseding it.

### The written record collapses, and the universe ends up holding nothing in writing

| tick | mind | grimoire | library | nodes held |
|--:|--:|--:|--:|--:|
| 101 | 315 | 0 | 86 | 35 |
| 501 | 499 | 0 | **521** | 51 |
| 601 | 591 | 0 | 125 | 51 |
| 1201 | 2252 | 0 | 15 | 51 |
| 2001 | 1451 | 0 | **0** | 51 |
| 2400 | 2172 | 0 | **0** | 51 |

At tick 2400 the universe holds 2,172 instances of 51 nodes and **not one of them is written
down**: 1000‰ mind, 0‰ grimoire, 0‰ library, 0‰ palace. Every node is on the unwritten list.

**It is not raids.** With `raids: false` the same collapse runs on the same schedule
(663 → 226 across ticks 561–588) and ends at 15 library instances rather than 0; the six raids
add discrete drops at ticks 88, 546, 744, 1227 on top. **It is not decay** — `decay.ts:198`
skips anything that is not `isHeldLocation`, and its header says so: *"Only minds decay… A
book's fragility is `durability`, not forgetting."*

Two additive mechanisms, both traced to code:

1. **`scribingQueueDepth` is hardcoded to `0`** at `packages/coordination/src/world-step.ts:581`,
   so `computeOccupationDemand`'s scribe demand (`rules-world/src/populace/demand.ts:112`) is
   permanently zero. `reallocateOccupations` therefore treats the entire founding scribe cohort
   as exportable surplus and drains it, with no backfill. Measured: **24 scribes at tick 0,
   14 by tick 500, 8 by tick 1800, 5 at tick 2400.** The field's own name says it should track
   queued scribing work; nothing computes that count.
2. **Library upkeep shortfall destroys shelved copies** — `degradeLibrary`
   (`coordination/src/gateway.ts:863`), fed by `applyLibraryUpkeep`
   (`rules-world/src/universities/capital.ts:298`), destroys
   `floorDiv(shortfall, DEGRADATION_PER_SHORTFALL)` instances a tick. Upkeep is charged per
   instance and paid after subsistence, so a library that grows past what materials support
   erodes geometrically — which is exactly the 561–588 shape.

**No committed metric would have caught this.** `capitalSnowball` is a Gini over library node
counts and reports `0` for "perfectly equal" and for "everything is gone" alike;
`libraryDependence` counts single-instance nodes without regard to *where*; `knowledgeHalfLife`
sees 51 nodes alive throughout. And the balance gates cap at `worldTickCap: 60`, four hundred
ticks before the collapse begins. `libraryDepth` **is** an observation channel and does fall to
zero — but nothing runs long enough to look, and no committed record carries node identity, so
*which* nodes lost their written form is visible nowhere but here.

This is reported, not fixed. It is `rules-world`/`coordination` territory and two workstreams
deep.

### Per-mage containment — the W20/W21 instrument's first reading

| coordinates | living holders | pairs | incomparable | strict containment | identical | intersection |
|---|--:|--:|--:|--:|--:|--:|
| tick 240 | 18 | 153 | **91 (0.595)** | 60 | 2 | 6 |
| tick 2400 | 56 | 1540 | **309 (0.201)** | 1081 | 150 | 0 |

Two mages in one universe **can** hold incomparable knowledge, and today most young pairs do.
The interesting part is the trajectory: idiosyncratic coverage is high early and **converges**
as everyone eventually learns everything, from 0.595 down to 0.201, with repertoires spanning
2–51 nodes against a 51-node ceiling. W15 measured cross-*strategy* containment at 1.000 —
strategies nest. Per-*mage* containment does not, and that is a different and more hopeful
answer. It is also the number W20's anti-requisites and W21's cost curves should move: if they
work, the terminal figure rises instead of falling.

## Two adjacent findings, reported and not fixed

- **`illegalActionRate` under-reports (audit C7).** Three call sites increment the state
  counter — `agent-api/src/gate.ts:190`, `coordination/src/god/interventions.ts:240`, and
  `sim-core/src/step.ts:158` — but `collectIllegalActionRate`
  (`mc-harness/src/metrics-collectors.ts:959`) reads `telemetry.accounting`, which only the
  first of the three ever touches. The audit measured 494 dispatch refusals against 76 reported.
  Nothing in this change goes near those counters, so it stays a report.
- **`metricDeltas` is always `{}`** — `agent-api/src/outcome.ts:114` and `:127`, both
  `Object.freeze({})`, honestly so: §7 puts the metric registry in the `agent-interface`
  capability and the file says populating it here would invent definitions that capability owns.
  `campaign-plan.md` line 56 records this as W4's.

## Status

**Done.** Instrument at `packages/agent-api/src/knowledge-census.ts`, reporter at
`tools/w22/census-report.mjs`.
