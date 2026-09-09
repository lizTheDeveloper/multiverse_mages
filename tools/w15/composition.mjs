/*
 * Multiverse Mages — W15: reading the node composition a run actually ends with.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * ## Why this exists at all
 *
 * Nothing wired into a real run carries node **ids**. `referenceNodesKnown`
 * comes from `scenario/census.ts`, which sums seventy per-cell *counts* decoded
 * out of the §4.1 observation; `agent-api`'s `digestKnowledge` builds a `Set` of
 * node ids per cell and discards it. `mc-harness`'s
 * `CensusSample.existingNodeIds` is exactly the right shape and no production
 * code calls `KnowledgeCensus.offer`. So a strategy's node *composition* — the
 * thing the dimensionality question is about — is not obtainable from any
 * committed record, and inferring it from aggregate counts is precisely what
 * this measurement must not do.
 *
 * The composition is therefore read at the source of truth:
 * `collectRecords(state, KNOWLEDGE_INSTANCE)`, the component every instance
 * lives in.
 *
 * ## How the state is reached, without touching production code
 *
 * `WorldSchema` exposes its component and system lists, and `defineWorld`
 * accepts them. So this tool rebuilds the reference schema with one extra
 * system appended — a probe that draws no randomness, mutates nothing, and
 * keeps a reference to the working state. Everything else is the production
 * path verbatim: `buildReferenceState`, `createSession`, `adaptAgentSession`,
 * `runEpisode`, `BOT_POOL_REGISTRY`, `policiesForRun`.
 *
 * The probe is a claim that can be checked, and {@link probeIsInert} checks it:
 * a probed and an unprobed run at the same coordinates must agree on the
 * snapshot hash, the terminal reason and the tick count. If they do not, every
 * number this tool produces is void and it says so.
 */

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  KNOWLEDGE_INSTANCE,
  collectRecords,
  findUniverse,
  readUniverse,
} from '../../packages/state/dist/index.js';
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

/** `ERA_TICKS` in `contracts.md` §1.1. Composition is sampled on this grid. */
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

/**
 * Distinct node ids held, and instances per node, read off one state.
 *
 * Both, because the critique's vector is *"fraction of effort invested in each
 * node"*: a held-set alone cannot tell the archivist's four thousand grimoires
 * from passive control's eleven hundred, and those are copies of the same set.
 */
/**
 * How much of the grid the god has actually bought, read off the ruleset masks.
 *
 * **Additive, and W158 is why.** Node count alone cannot distinguish *"the god
 * could not afford a permit"* from *"the god bought the grid and the universe
 * did not use it"* — the two produce the same terminal composition for opposite
 * reasons. `permits()` reads exactly these two masks, so a popcount of them is
 * the ruleset the run finished under, with no second notion of "open" anywhere.
 *
 * Nothing that existed before this function reads its output, so every number
 * every earlier tool produced is unchanged.
 */
function openAxesOf(state) {
  const universe = findUniverse(state);
  if (universe === undefined) return { techniques: 0, forms: 0 };
  const record = readUniverse(state, universe);
  const popcount = (bits) => {
    let n = 0;
    for (let value = bits; value !== 0; value >>>= 1) n += value & 1;
    return n;
  };
  return {
    techniques: popcount(record.permittedTechniques),
    forms: popcount(record.permittedForms),
  };
}

function compositionOf(state) {
  const counts = new Map();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    counts.set(row.nodeId, (counts.get(row.nodeId) ?? 0) + 1);
  }
  const nodeIds = [...counts.keys()].sort((a, b) => a - b);
  return { nodeIds, counts: nodeIds.map((id) => counts.get(id)) };
}

/**
 * One run, with composition sampled every era boundary and at termination.
 *
 * `probe: false` runs the identical episode through the unmodified schema, which
 * is what {@link probeIsInert} compares against.
 */
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

  const samples = [];
  let liveState;
  let sampledAt = -1;

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          {
            name: 'w15-composition-probe',
            run(ctx) {
              liveState = ctx.state;
              // `ctx.tick` is the tick before this step's advance, so the era
              // grid is read off it directly. Sampling inside the step rather
              // than between them is what lets a run that terminates mid-loop
              // still leave a final reading.
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

  // The raw session is kept beside the adapted one: `adaptAgentSession` narrows
  // to what the episode loop needs, and `snapshotHash()` — the probe's own
  // validity check — is on the `agent-api` interface underneath it.
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

  const terminal =
    liveState === undefined
      ? { worldTick: 0, nodeIds: [], counts: [], openAxes: { techniques: 0, forms: 0 } }
      : {
          worldTick: episode.ticksRun,
          ...compositionOf(liveState),
          openAxes: openAxesOf(liveState),
        };

  return {
    strategyId,
    coordinates,
    runSeed,
    options,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    // Additive (W158). `runEpisode` has always returned this; it was simply
    // dropped here. It is the only reading that says whether a submission was
    // *refused* rather than never made, which is what separates a price that
    // slows a god down from one that deletes the verb.
    accounting: episode.accounting,
    samples,
    terminal,
  };
}

/**
 * The probe's own validity check.
 *
 * A probed run and an unprobed run at the same coordinates must be the same run.
 * Reported rather than asserted, so that a failure appears in the writeup as a
 * refusal to report numbers instead of as a stack trace nobody kept.
 */
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
