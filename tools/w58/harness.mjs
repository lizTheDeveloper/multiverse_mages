/*
 * Multiverse Mages — W58: instrumenting a run before anything scores it.
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
 * ## What this is for
 *
 * Two falsification tests, both of which two external reviewers asked for
 * *before* any further mechanism work:
 *
 * 1. Does `uniform-random-legal` — a bot that plays no strategy at all — reach
 *    the summit at the same rate as the deliberate strategies? If it does, the
 *    campaign's eight nulls are about the **victory condition**, not about mage
 *    autonomy.
 * 2. Do two opposed strategies produce trajectories that differ *at all* before
 *    anything scores them, and do the differences persist to roughly tick 300?
 *    Divergent-but-identically-scored means the evaluator is broken. Convergent
 *    means the simulation really is insensitive.
 *
 * Neither question can be answered from a committed record: the sweep records
 * carry aggregate metrics at termination, and both questions are about the
 * *middle* of a run and about quantities nobody aggregates.
 *
 * ## How the state is reached, without touching production code
 *
 * Exactly `tools/w15/composition.mjs`'s trick, and the credit is its: `WorldSchema`
 * exposes its component and system lists, and `defineWorld` accepts them, so the
 * reference schema is rebuilt with one extra system appended. That system draws
 * no randomness, mutates nothing, and only reads. Everything else — `buildReferenceState`,
 * `createSession`, `adaptAgentSession`, `runEpisode`, `BOT_POOL_REGISTRY`,
 * `policiesForRun` — is the production path verbatim.
 *
 * **W15's `probeIsInert` does not vouch for this probe**, because this probe is a
 * different function on a different sampling grid. {@link probeIsInert} here runs
 * the equivalent check against *this* schema, and every result file records its
 * verdict. If it fails, the numbers are void and the analysis says so rather than
 * quietly reporting them.
 *
 * ## The one wrapper that is not a system
 *
 * The god-side action histogram is not in any component: it is what the policy
 * *submitted*, and the session only counts what it *rejected*
 * (`IllegalActionAccounting.byActionId`). {@link runInstrumented} therefore wraps
 * each policy in a counting closure. The closure calls the policy exactly once,
 * with the same arguments, and returns its value unchanged — it is a tally, not a
 * decision — so the episode is bit-identical, which is the property
 * {@link probeIsInert} checks end to end.
 */

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  BLESSING,
  EDICT,
  EFFORT_PROGRESS,
  ENCOURAGED_CELL,
  EVER_KNOWN,
  GOAL_COMMITMENT,
  GOD_STATE,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  MAGE,
  POPULACE_COHORT,
  UNIVERSITY,
  UNIVERSE,
  collectRecords,
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

/** `ERA_TICKS` in `contracts.md` §1.1. */
export const ERA_TICKS = 240;

/** The eight scripted strategies the committed ascension sweep's pool holds, in sweep order. */
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

/** The probe, named once. Matches `mc-harness`'s `EXPLOIT_PROBE`. */
export const PROBE = 'uniform-random-legal';

/** The sweep id every W58 run shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w58-falsification-v1';

/** Matches the committed ascension sweep, so the universes are familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * All four starting positions of the committed ascension sweep, in its canonical
 * cell order (`cohortSize` × `foundingNodes`, levels [4,12] and [1,4]).
 *
 * W15 used only cells 0 and 3. The mandate here is explicitly *"report per
 * starting position"*, and a prior workstream found the probe's behaviour is
 * position-dependent, so all four are run rather than the two corners.
 */
export const CELLS = Object.freeze([
  { cellIndex: 0, label: 'cohort4-founding1', options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 1, label: 'cohort4-founding4', options: { cohortSize: 4, foundingNodes: 4 } },
  { cellIndex: 2, label: 'cohort12-founding1', options: { cohortSize: 12, foundingNodes: 1 } },
  { cellIndex: 3, label: 'cohort12-founding4', options: { cohortSize: 12, foundingNodes: 4 } },
]);

/**
 * The sampling grid.
 *
 * Dense early and sparse late, because the reviewers' question is whether
 * differences *persist or reconverge by roughly tick 300* — an era grid of 240
 * gives exactly one reading before that, which cannot answer it. The probe draws
 * no randomness, so a finer grid costs wall clock and nothing else.
 */
export function isSampleTick(tick) {
  if (tick <= 600) return tick % 30 === 0;
  return tick % ERA_TICKS === 0;
}

function first(state, component) {
  for (const { row } of collectRecords(state, component)) return row;
  return undefined;
}

function tally(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function fromMap(map) {
  const out = {};
  for (const key of [...map.keys()].sort((a, b) => a - b)) out[String(key)] = map.get(key);
  return out;
}

/** Bits set in a mask, as an ascending list. Permitted axes are bitfields. */
function bits(mask) {
  const out = [];
  for (let index = 0; index < 32; index += 1) {
    if ((mask & (1 << index)) !== 0) out.push(index);
  }
  return out;
}

/**
 * One reading of the world, taken inside the step and mutating nothing.
 *
 * Everything here is a count, a set, or a scalar already in a component. No
 * quantity is derived by a formula this file invents, because a derived number
 * that turns out to be constant cannot be told apart from a channel that is
 * dead — and telling those apart is half the assignment.
 */
export function sampleOf(state, worldTick) {
  const universe = first(state, UNIVERSE);
  const god = first(state, GOD_STATE);

  const nodeInstances = new Map();
  let masteryTotal = 0;
  const byLocationKind = new Map();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    tally(nodeInstances, row.nodeId);
    masteryTotal += row.mastery;
    tally(byLocationKind, row.locationKind);
  }

  let magesAlive = 0;
  let magesTotal = 0;
  let vigorTotal = 0;
  const bySpecies = new Map();
  const byRole = new Map();
  for (const { row } of collectRecords(state, MAGE)) {
    magesTotal += 1;
    if (row.alive !== 0) {
      magesAlive += 1;
      vigorTotal += row.vigor;
      tally(bySpecies, row.speciesId);
      tally(byRole, row.roleId);
    }
  }

  const goalHistogram = new Map();
  const goalTargets = new Set();
  for (const { row } of collectRecords(state, GOAL_COMMITMENT)) {
    tally(goalHistogram, row.goalId);
    if (row.targetNodeId !== 0) goalTargets.add(row.targetNodeId);
  }

  const effortHistogram = new Map();
  const effortTargets = new Set();
  let effortProgressTotal = 0;
  for (const { row } of collectRecords(state, EFFORT_PROGRESS)) {
    tally(effortHistogram, row.kind);
    if (row.nodeId !== 0) effortTargets.add(row.nodeId);
    effortProgressTotal += row.progress;
  }

  let populace = 0;
  const byOccupation = new Map();
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    populace += row.count;
    byOccupation.set(row.occupation, (byOccupation.get(row.occupation) ?? 0) + row.count);
  }

  let grimoires = 0;
  const grimoireNodes = new Set();
  for (const { row } of collectRecords(state, GRIMOIRE)) {
    grimoires += 1;
    grimoireNodes.add(row.nodeId);
  }

  let universities = 0;
  let universityCapacity = 0;
  for (const { row } of collectRecords(state, UNIVERSITY)) {
    universities += 1;
    universityCapacity += row.capacity;
  }

  let libraries = 0;
  for (const record of collectRecords(state, LIBRARY)) if (record !== undefined) libraries += 1;

  const everKnown = new Set();
  for (const { row } of collectRecords(state, EVER_KNOWN)) everKnown.add(row.nodeId);

  const edicts = [];
  for (const { row } of collectRecords(state, EDICT)) edicts.push([row.cellId, row.kind]);
  edicts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const encouraged = [];
  for (const { row } of collectRecords(state, ENCOURAGED_CELL)) encouraged.push(row.cellId);
  encouraged.sort((a, b) => a - b);

  let blessings = 0;
  for (const record of collectRecords(state, BLESSING)) if (record !== undefined) blessings += 1;

  const nodeIds = [...nodeInstances.keys()].sort((a, b) => a - b);

  return {
    worldTick,
    // Ruleset — what the god permitted.
    permittedTechniques: universe?.permittedTechniques ?? null,
    permittedForms: universe?.permittedForms ?? null,
    permittedTechniqueBits: universe === undefined ? [] : bits(universe.permittedTechniques),
    permittedFormBits: universe === undefined ? [] : bits(universe.permittedForms),
    edicts,
    encouragedCells: encouraged,
    blessings,
    edictBudget: universe?.edictBudget ?? null,
    traditionId: universe?.traditionId ?? null,
    // Economy.
    favor: universe?.favor ?? null,
    worship: universe?.worship ?? null,
    worshipTier: universe?.worshipTier ?? null,
    materials: universe?.materials ?? null,
    favorCap: universe?.favorCap ?? null,
    favorWasted: god?.favorWasted ?? null,
    // Population.
    populace,
    populaceByOccupation: fromMap(byOccupation),
    magesAlive,
    magesTotal,
    mageVigorTotal: vigorTotal,
    magesBySpecies: fromMap(bySpecies),
    magesByRole: fromMap(byRole),
    // Institutions.
    universities,
    universityCapacity,
    libraries,
    grimoires,
    grimoireNodeCount: grimoireNodes.size,
    // Knowledge.
    nodesKnown: nodeIds.length,
    nodeIds,
    instances: [...nodeInstances.values()].reduce((sum, value) => sum + value, 0),
    instancesByLocationKind: fromMap(byLocationKind),
    masteryTotal,
    everKnownCount: everKnown.size,
    // Mage-level behaviour.
    goalHistogram: fromMap(goalHistogram),
    goalTargetCount: goalTargets.size,
    goalTargets: [...goalTargets].sort((a, b) => a - b),
    effortHistogram: fromMap(effortHistogram),
    effortTargetCount: effortTargets.size,
    effortProgressTotal,
    // Ascension progress, as the simulation itself tracks it.
    ascensionPath: god?.ascensionPath ?? null,
    ascensionFirstMetTick: god?.ascensionFirstMetTick ?? null,
    stasisTicks: god?.stasisTicks ?? null,
    lowWorshipTicks: god?.lowWorshipTicks ?? null,
    peakWorshipTier: god?.peakWorshipTier ?? null,
    deepestTier: god?.deepestTier ?? null,
    goodEraRun: god?.goodEraRun ?? null,
    eraNodesLost: god?.eraNodesLost ?? null,
  };
}

/** The shipped content, resolved once per process. */
export function content() {
  return referenceContent();
}

/**
 * One run.
 *
 * `probe: false` runs the identical episode through the unmodified schema and
 * counts no actions, which is what {@link probeIsInert} compares against.
 */
export function runInstrumented(input) {
  const {
    content: resolved,
    strategyId,
    coordinates,
    options = {},
    worldTickCap = 2400,
    probe = true,
    keepSamples = true,
  } = input;

  const runSeed = deriveRunSeed(coordinates);
  const simulation = defineWorldSimulation(resolved.deps);

  const samples = [];
  let liveState;
  let sampledAt = -1;

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          {
            name: 'w58-trajectory-probe',
            run(ctx) {
              liveState = ctx.state;
              if (!keepSamples) return;
              // `ctx.tick` is the tick before this step's advance, so the grid is
              // read off it directly. Sampling inside the step rather than between
              // them is what lets a run that ends mid-loop still leave a reading.
              if (ctx.tick !== sampledAt && isSampleTick(ctx.tick)) {
                sampledAt = ctx.tick;
                samples.push(sampleOf(ctx.state, ctx.tick));
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
    catalogue: resolved.catalogue,
    create: (seed, config) =>
      buildReferenceState({
        runSeed: seed,
        options: referenceOptions(config),
        content: resolved,
        schema,
      }),
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);

  const basePolicies = policiesForRun({
    registry: BOT_POOL_REGISTRY,
    strategies: [strategyId],
    runSeed,
  });

  // The submitted-action histogram. A tally around the policy, never instead of
  // it: one call, same arguments, value returned unchanged.
  const submitted = new Map();
  const parameters = new Map();
  const policies = probe
    ? basePolicies.map((policy) => (observation, mask, slot) => {
        const chosen = policy(observation, mask, slot);
        const action = typeof chosen === 'number' ? chosen : chosen.action;
        tally(submitted, action);
        const parameter = typeof chosen === 'number' ? undefined : chosen.parameter;
        if (parameter !== undefined) {
          const key = `${String(action)}:${String(parameter)}`;
          parameters.set(key, (parameters.get(key) ?? 0) + 1);
        }
        return chosen;
      })
    : basePolicies;

  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    policies,
    worldTickCap,
  });

  const terminal = liveState === undefined ? null : sampleOf(liveState, episode.ticksRun);

  return {
    strategyId,
    coordinates,
    runSeed,
    options,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    accounting: episode.accounting,
    submittedByAction: fromMap(submitted),
    submittedParameters: Object.fromEntries([...parameters.entries()].sort()),
    samples,
    terminal,
  };
}

/**
 * This probe's own validity check.
 *
 * A probed run and an unprobed run at the same coordinates must be the same run.
 * Reported rather than asserted, so a failure appears in the writeup as a refusal
 * to report numbers instead of as a stack trace nobody kept.
 */
export function probeIsInert(resolved, strategyId, coordinates, options, worldTickCap = 2400) {
  const withProbe = runInstrumented({
    content: resolved,
    strategyId,
    coordinates,
    options,
    worldTickCap,
    probe: true,
  });
  const without = runInstrumented({
    content: resolved,
    strategyId,
    coordinates,
    options,
    worldTickCap,
    probe: false,
  });
  return {
    strategyId,
    cellIndex: coordinates.cellIndex,
    agrees:
      withProbe.snapshotHash === without.snapshotHash &&
      withProbe.terminalReason === without.terminalReason &&
      withProbe.ticksRun === without.ticksRun &&
      withProbe.status === without.status,
    probed: {
      snapshotHash: withProbe.snapshotHash,
      status: withProbe.status,
      terminalReason: withProbe.terminalReason,
      ticksRun: withProbe.ticksRun,
    },
    unprobed: {
      snapshotHash: without.snapshotHash,
      status: without.status,
      terminalReason: without.terminalReason,
      ticksRun: without.ticksRun,
    },
  };
}

/** Command-line `--key value` pairs, as the W15 tools parse them. */
export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}
