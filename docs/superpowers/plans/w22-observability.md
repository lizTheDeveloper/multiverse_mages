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
   over held nodes. Currently **zero singletons at 80.2 mean copies per node** (audit Proof 3), so
   the number is boring today. It is reported anyway, because it is the number that becomes
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
different ground: **the channel would be a constant.** Fragility on the reference universe is
identically zero singletons across every strategy in the shipped pool, and mean redundancy is 80.2.
A fragility input today feeds an RL agent a column of zeros — it teaches nothing, and it commits the
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

- [ ] Read vision §5 / §7a, contracts §1.5 / §4.1 / §4.4, `campaign-plan.md`, `vision-audit.md`, `CLAUDE.md`
- [ ] Trace `KNOWLEDGE_INSTANCE`, `LOCATION_KIND`, `MAGE`, the observation layout digest, `explain.ts`
- [ ] Commit and push this plan
- [ ] `packages/agent-api/src/knowledge-census.ts` — the projection, pure, one pass
- [ ] Unit tests: per-node counts, location split, singleton detection, per-mage repertoire, containment
- [ ] Inertness test: snapshot-hash and terminal-reason identity, censused vs uncensused
- [ ] Digest-stability test: `OBSERVATION_LAYOUT_DIGEST` unchanged by this branch
- [ ] Reference-universe numbers via a `tools/w22` reporter, cross-checked against audit Proof 3
- [ ] `npm run verify` green, reported exactly, with per-gate deltas
- [ ] Report `illegalActionRate` (audit C7) and `metricDeltas` findings; fix neither unless trivial

## Status

In progress.
