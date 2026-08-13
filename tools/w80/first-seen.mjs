/*
 * Multiverse Mages — W80: when each node is first discovered, and in what order.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * ## The question this instrument exists for
 *
 * W79's claim is that `researchCost` is a pure function of tier, so
 * `compareTargets`' "cheapest first" degenerates to "lowest node id first" and
 * **every universe walks the same doors in the same order**. That is a claim
 * about an *order*, and no committed record in this repository carries one:
 * `referenceNodesKnown` is a count, `CensusSample.existingNodeIds` has no
 * production caller, and `collectRunMetrics` has no production caller on `main`
 * either (the wiring is on `w62`, unmerged). So the order is read at the source
 * of truth, exactly as `tools/w15/composition.mjs` reads composition: an extra
 * system appended to the reference world schema, drawing no randomness and
 * mutating nothing, recording the **first world tick at which each node id
 * appears in `KNOWLEDGE_INSTANCE`**.
 *
 * The probe runs every tick rather than on the era grid, because a discovery
 * order sampled every 240 ticks is not a discovery order.
 *
 * ## Founding grants are excluded from the order
 *
 * `foundingNodes` puts whole instances into minds at tick 0 — a grant, not a
 * discovery. Everything first seen at the first probed tick is therefore
 * recorded separately as `founded` and never enters the ordering, or the
 * ordering would mostly measure the seeding routine.
 *
 * ## Ties are canonicalised, identically before and after
 *
 * Two nodes finished on the same tick have no order between them. The sequence
 * is therefore always `sort by (firstTick, nodeId)`, and the *tie-grouped*
 * sequence — same tick collapsed to a sorted set — is reported beside it. Any
 * comparison of before against after must use the same rule for both, or a
 * change that merely spreads completions across ticks would present itself as
 * new orderings.
 */

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import { KNOWLEDGE_INSTANCE, collectRecords } from '../../packages/state/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { createSession } from '../../packages/agent-api/dist/index.js';
import {
  BOT_POOL_REGISTRY,
  adaptAgentSession,
  deriveRunSeed,
  policiesForRun,
  runEpisode,
} from '../../packages/mc-harness/dist/index.js';
import {
  REFERENCE_SCENARIO_ID,
  buildReferenceState,
  referenceContent,
  referenceOptions,
} from '../../packages/scenario/dist/index.js';

/** `ERA_TICKS` in `contracts.md` §1.1. Held-set horizons are read off this grid. */
export const ERA_TICKS = 240;

/** The eight scripted strategies the campaign's sweep pool holds, in sweep order. */
export const POOL = Object.freeze([
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
]);

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w15-dimensionality-v1';

/** The root seed, matching W15 so before and after walk universes already characterised. */
export const ROOT_SEED = 20260811;

/** W15's two starting positions — the committed ascension sweep's corner cells. */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/** Distinct node ids held right now, with instance counts. */
function compositionOf(state) {
  const counts = new Map();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    counts.set(row.nodeId, (counts.get(row.nodeId) ?? 0) + 1);
  }
  const nodeIds = [...counts.keys()].sort((a, b) => a - b);
  return { nodeIds, counts: nodeIds.map((id) => counts.get(id)) };
}

/** One run, with per-tick first-appearance recording and era-grid held-set samples. */
export function runOne(input) {
  const {
    content,
    strategyId,
    coordinates,
    options = {},
    worldTickCap = 2400,
    probe = true,
    sampleEveryTicks = ERA_TICKS,
  } = input;

  const runSeed = deriveRunSeed(coordinates);
  const simulation = defineWorldSimulation(content.deps);

  const firstSeen = new Map();
  const samples = [];
  let liveState;
  let sampledAt = -1;
  let firstProbedTick = -1;

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          {
            name: 'w80-first-seen-probe',
            run(ctx) {
              liveState = ctx.state;
              if (firstProbedTick < 0) firstProbedTick = ctx.tick;
              for (const { row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
                if (!firstSeen.has(row.nodeId)) firstSeen.set(row.nodeId, ctx.tick);
              }
              if (ctx.tick % sampleEveryTicks === 0 && ctx.tick !== sampledAt) {
                sampledAt = ctx.tick;
                samples.push({ worldTick: ctx.tick, ...compositionOf(ctx.state) });
              }
            },
          },
        ],
        ...(simulation.schema.maxSlots === undefined
          ? {}
          : { maxSlots: simulation.schema.maxSlots }),
      })
    : simulation.schema;

  const scenario = {
    scenarioId: REFERENCE_SCENARIO_ID,
    catalogue: content.catalogue,
    create: (seed, config) =>
      buildReferenceState({
        runSeed: seed,
        options: referenceOptions(config),
        content,
        schema,
      }),
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);

  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    policies: policiesForRun({
      registry: BOT_POOL_REGISTRY,
      strategies: [strategyId],
      runSeed,
    }),
    worldTickCap,
  });

  const founded = [];
  const discovered = [];
  for (const [nodeId, tick] of firstSeen) {
    (tick <= firstProbedTick ? founded : discovered).push({ nodeId, tick });
  }
  founded.sort((a, b) => a.nodeId - b.nodeId);
  discovered.sort((a, b) => a.tick - b.tick || a.nodeId - b.nodeId);

  const terminal =
    liveState === undefined
      ? { worldTick: 0, nodeIds: [], counts: [] }
      : { worldTick: episode.ticksRun, ...compositionOf(liveState) };

  return {
    strategyId,
    coordinates,
    runSeed,
    options,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    firstProbedTick,
    founded: founded.map((entry) => entry.nodeId),
    discovered,
    samples,
    terminal,
  };
}

/** A probed and an unprobed run at the same coordinates must be the same run. */
export function probeIsInert(content, strategyId, coordinates, worldTickCap) {
  const withProbe = runOne({ content, strategyId, coordinates, worldTickCap, probe: true });
  const without = runOne({ content, strategyId, coordinates, worldTickCap, probe: false });
  return {
    strategyId,
    agrees:
      withProbe.snapshotHash === without.snapshotHash &&
      withProbe.terminalReason === without.terminalReason &&
      withProbe.ticksRun === without.ticksRun,
    probed: {
      snapshotHash: withProbe.snapshotHash,
      terminalReason: withProbe.terminalReason,
      ticksRun: withProbe.ticksRun,
    },
    unprobed: {
      snapshotHash: without.snapshotHash,
      terminalReason: without.terminalReason,
      ticksRun: without.ticksRun,
    },
  };
}

/** The shipped content, resolved once per process. */
export function content() {
  return referenceContent();
}
