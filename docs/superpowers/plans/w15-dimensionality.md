<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W15 — strategy space dimensionality

**Branch:** `w15/strategy-dimensionality`. **Role:** measurer. **Changes no constant, no rule, no
magnitude.** Never runs `goldens:regen`; regenerates no balance baseline.

## The thesis under test

> "The v1 subset is not too small — acquisition is too easy. Twelve cells of contested, hard-won
> magic would be plenty to fight over."

The external attack: all 51 v1 nodes are **fungible** — they feed one achievement scalar — so making
acquisition hard leaves the optimal play as "acquire everything, slowly", and six species only change
the *speed* of convergence, not the *shape* of the strategy.

The test: model each strategy as a vector over nodes; compute the effective dimensionality of the
strategy space. 1–2 dimensions refutes the thesis; 3+ with convergence supports it.

## Pre-registered expectations, written before the numbers

Recorded so that a confirming result cannot be claimed as a discovery after the fact.

1. **The pigeonhole.** Any v1 strategy sitting at 51 nodes holds the *entire reachable set*.
   Identical composition there is **forced by the content boundary, not chosen**. A rank-1 result over
   those strategies is therefore not evidence about the thesis — it is arithmetic. The measurement is
   only informative where it discriminates: `narrow-depth` (7.7 nodes), `denial-warden` (10.5), and
   `permissive-breadth` (217).
2. **Within-strategy consistency is the real niche test.** "Six distinguishable niches" requires each
   strategy to pick the *same* subset across seeds. A strategy whose 7.7 nodes are a different 7.7
   every seed has noise, not a niche. Nobody has measured this. It is reported explicitly.
3. **Rank cap.** Eight strategies bound strategy-level structure at 7 components no matter what the
   nodes do. Stated in the writeup so no reader over-reads the spectrum.
4. **Effort weighting.** The critique's vector is "fraction of effort invested". Held-set alone hides
   the archivist's 4096 grimoires against passive's 1156. Both are measured: a binary held-set matrix
   and an instance-count (effort-weighted) matrix.

## Instrument

### How per-node composition is obtained — no inference from aggregate counts

Measured, from the trace: **nothing wired into a real run carries node ids.** `referenceNodesKnown`
comes from `scenario/census.ts`, which sums 70 per-cell *counts* decoded out of the §4.1 observation;
`agent-api`'s `digestKnowledge` builds a `Set` of node ids per cell and throws it away.
`mc-harness`'s `CensusSample.existingNodeIds` is the right shape and **no production code calls
`KnowledgeCensus.offer`**.

So the node set is read off the simulation state directly, at the source of truth:
`collectRecords(state, KNOWLEDGE_INSTANCE)` → distinct `row.nodeId`, plus per-node instance counts.

The state is reached with a **probe system appended to the world schema in the analysis tool only**:

    const sim = defineWorldSimulation(content.deps);
    const probed = defineWorld({
      components: sim.schema.components,
      systems: [...sim.schema.systems, probeSystem],   // draws no RNG, mutates nothing
    });

and a `Scenario` built over `buildReferenceState({ schema: probed, ... })`. The episode is then driven
through the *same* `runEpisode` / `BOT_POOL_REGISTRY` / `policiesForRun` path `executeReferenceRun`
uses. **Zero production changes for measurements 1, 2, 3 and 5.**

Validity check, run as part of the tool: a probed run and an unprobed run at the same coordinates must
produce the **same `snapshotHash()` and the same terminal reason**. If they differ, the probe perturbs
the run and every number below is void.

### Common random numbers — the trap, named

`deriveRunSeed(rootSeed, sweepId, cellIndex, replicateIndex)`. The committed sweep's
`assignment: "round-robin"` hands each strategy a **disjoint** set of replicate indexes, so no two
strategies ever play the same universe. Comparing arms from it would compare seeds, not strategies.

This tool therefore constructs its `RunTask`s directly: **every arm uses the identical
`(rootSeed, sweepId, cellIndex, replicateIndex)` set**, and the factor under test (strategy, later
species mix) is supplied out-of-band, never through an index. Pairwise Jaccard then reflects strategy.

### Analysis

Rows are **runs**, not strategy means, so between-strategy and within-strategy variance can be
separated. Mean-centre, eigendecompose the runs×runs Gram matrix with a hand-rolled cyclic Jacobi
(no new dependency — an npm package here would be an AGPL-compatibility question for nothing).
Floats are fine: this is analysis, outside the rules path.

## Tasks

- [x] Read `campaign-plan.md`, `probable-strategies.md`, `hard-magic.md`, `CLAUDE.md`
- [x] Trace where per-node knowledge lives (`KNOWLEDGE_INSTANCE`, `NodeExistenceIndex`)
- [x] Read `packages/coordination/src/god/ascension.ts` for the fungibility verdict
- [ ] Commit and push this plan
- [ ] Write `tools/w15-dimensionality.mts`: probe, CRN task construction, node-set extraction
- [ ] Probe-validity check: probed vs unprobed snapshot hash identical
- [ ] Time one 2400-tick run; size the replicate budget from the measurement
- [ ] Arm 1 — eight strategies, common seeds, per-era + terminal composition
- [ ] Eigenvalue spectrum, components for 80% / 95%
- [ ] Pairwise Jaccard and cosine, between and within strategy
- [ ] Arm 2 — founding species mix (needs the additive `foundingSpeciesMask` option below)
- [ ] Direct fungibility verdict from the ascension predicates
- [ ] Write `docs/design/strategy-dimensionality.md`
- [ ] `npm run verify` green, reported exactly

## The one additive production change, and why it is needed

`buildReferenceState` seeds **every** species with the same `cohortSize`; there is no founding-mix
knob, so D7/D9 cannot be measured with the instrument as it stands. Added:
`ReferenceOptions.foundingSpeciesMask`, a scalar bitmask over species in content order, default
"all species" — byte-identical behaviour when unset. Scalar because `ScenarioConfig.options` is
scalars only. Tested; disclosed in the writeup. This is an **instrument**, not a magnitude: it changes
no constant and no rule.

If it proves larger than it looks, D7 is reported as "instrument absent, here is the change needed"
rather than silently dropped.

## Status

In flight. Findings will land in `docs/design/strategy-dimensionality.md`.
