/*
 * Multiverse Mages — W20: reading what each *mage* actually holds.
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
 * `tools/w15/composition.mjs` reads `collectRecords(state, KNOWLEDGE_INSTANCE)`
 * and reports the **universe's** node composition — one bag of instances,
 * without asking whose head any of them are in. That is exactly the level at
 * which `compositional-content.md` §6's headline claim cannot be checked:
 * claim 0 is *"two mages in one universe hold incomparable sets"*, and a
 * universe-level bag has already thrown away which mage held what.
 *
 * `compositional-content.md` §3.2.1 is explicit that the exclusion binds **per
 * mage, never per universe** — a universe may accumulate every school across
 * many lifetimes, but an individual mage's reachable set is bounded by what she
 * committed to. The measurement has to be taken at the level the mechanic
 * operates on, or it cannot see the mechanic at all.
 *
 * ## How the state is reached, without touching production code
 *
 * Identical approach to `w15/composition.mjs`, restated rather than imported so
 * this file's probe is legible on its own: `defineWorld` rebuilds the reference
 * schema with one extra system appended, which draws no randomness, mutates
 * nothing, and keeps a reference to the working state. Everything else is the
 * production path verbatim.
 *
 * `POOL` and `ERA_TICKS` are re-used from `w15/composition.mjs` rather than
 * redeclared — one sweep pool and one era grid, not two that could drift apart.
 *
 * ## Where a mage's knowledge lives
 *
 * `contracts.md` §1.5's `LOCATION_KIND`: `mind` and `palace` are the two kinds
 * that mean "this mage personally knows it" (`vision.md` §5), and for both,
 * `locationId` is the mage's own entity handle — confirmed by
 * `@mm/coordination`'s `isHeldAtMind`, reused here rather than reimplemented so
 * this probe cannot drift from what the gateway itself treats as "held at
 * mind". `grimoire` and `library` locations are knowledge written down, not
 * knowledge a mage holds, and are excluded.
 *
 * Only **living** mages count (`MAGE.alive`), per the task: a dead mage's
 * entity may be retained for other records to reference her by, but she is not
 * one of the two mages the claim is about.
 */

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  KNOWLEDGE_INSTANCE,
  MAGE,
  collectRecords,
} from '../../packages/state/dist/index.js';
import {
  defineWorldSimulation,
  isHeldAtMind,
} from '../../packages/coordination/dist/index.js';
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

import { ERA_TICKS, POOL } from '../w15/composition.mjs';

export { ERA_TICKS, POOL };

/**
 * Every living mage's held-node set, read off one state.
 *
 * Every living mage is represented, including one who has learned nothing —
 * `nodeIds: []` — because "mean/min/max nodes per living mage" and "the count
 * of living mages" both need the mages who hold nothing counted, not silently
 * dropped. Pairwise comparisons then filter to non-empty sets themselves,
 * because an empty set is a subset of everything and carries no compositional
 * information — the same reasoning `w15/analyse.mjs`'s `containment` doc
 * comment gives for excluding size-zero denominators.
 */
function mageCompositionOf(state, registry) {
  const perMage = new Map();
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (!row.alive) continue;
    perMage.set(handle, { handle, speciesId: row.speciesId, nodeIds: new Set() });
  }
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (!isHeldAtMind(row.locationKind)) continue;
    const entry = perMage.get(row.locationId);
    // Not a living mage: either the record predates her death (a mind entry
    // should not outlive her, but this is a read-only probe, not an
    // enforcement point) or the handle belongs to no mage at all. Either way,
    // silently excluding it is the correct read of "only living mages count".
    if (entry === undefined) continue;
    entry.nodeIds.add(row.nodeId);
  }
  return [...perMage.values()]
    .map(({ handle, speciesId, nodeIds }) => ({
      handle,
      speciesId,
      // Resolved here, once, because `w20/analyse-mages.mjs` reads only the
      // arm JSON — it never touches a `ContentRegistry` — and the species
      // breakdown is unreadable without a human-legible label.
      speciesName: registry.idOf('species', speciesId) ?? `species#${String(speciesId)}`,
      nodeIds: [...nodeIds].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.handle - b.handle);
}

/**
 * One run, with per-mage composition sampled every era boundary and at
 * termination — the same grid `w15/composition.mjs` samples on, so a horizon
 * comparison across the two instruments is possible without resampling either.
 *
 * `probe: false` runs the identical episode through the unmodified schema,
 * which is what {@link probeIsInert} compares against.
 */
export function runOne(input) {
  const {
    content,
    strategyId,
    coordinates,
    options = {},
    worldTickCap = 2400,
    probe = true,
    sampleEveryTicks,
  } = input;

  const eraTicks = sampleEveryTicks ?? ERA_TICKS;

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
            name: 'w20-mage-composition-probe',
            run(ctx) {
              liveState = ctx.state;
              // `ctx.tick` is the tick before this step's advance, so the era
              // grid is read off it directly, matching w15's rationale exactly:
              // sampling inside the step rather than between them is what lets
              // a run that terminates mid-loop still leave a final reading.
              if (ctx.tick % eraTicks === 0 && ctx.tick !== sampledAt) {
                sampledAt = ctx.tick;
                samples.push({
                  worldTick: ctx.tick,
                  mages: mageCompositionOf(ctx.state, content.registry),
                });
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

  const terminal =
    liveState === undefined
      ? { worldTick: 0, mages: [] }
      : { worldTick: episode.ticksRun, mages: mageCompositionOf(liveState, content.registry) };

  return {
    strategyId,
    coordinates,
    runSeed,
    options,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    samples,
    terminal,
  };
}

/**
 * The probe's own validity check, identical in shape to `w15`'s.
 *
 * A probed run and an unprobed run at the same coordinates must be the same
 * run. Reported rather than asserted, so a failure appears in the writeup as a
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
