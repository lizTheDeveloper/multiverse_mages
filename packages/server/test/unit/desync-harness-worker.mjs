/*
 * Multiverse Mages — the worker half of the 1,000-match desync harness.
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
 * A bare Node worker that runs a batch of desync-detection matches.
 *
 * Each match creates two independent `AgentSession` instances from the same
 * seed, steps both through the same ticks with the same action, and compares
 * snapshot hashes at every tick. A mismatch is a desync — a proof that the
 * simulation is not a pure function of its inputs, which violates the §0
 * determinism constraint and makes PvP impossible.
 *
 * ## Why this file is `.mjs` and imports from `dist/`
 *
 * A bare `worker_threads` worker knows nothing of Vitest's alias table, so
 * `@mm/*` specifiers resolve through the workspace symlinks in `node_modules/`,
 * which point to each package's `dist/`. The test file asserts the build exists
 * before spawning workers, exactly as `multi-process-match.test.ts` does.
 *
 * ## Why the probe scenario is rebuilt here rather than imported from fixtures
 *
 * `fixtures.ts` imports from `../../src/index.js`, which under the TypeScript
 * convention points at the `.ts` source. Node's type stripping does not rewrite
 * `.js` specifiers to `.ts`, so a bare worker cannot `import './fixtures.ts'`
 * without hitting a resolution failure on the fixture's own imports. Rebuilding
 * the scenario from the same pieces — `@mm/sim-core`, `@mm/state`,
 * `@mm/agent-api` — avoids transitive resolution and keeps the worker
 * self-contained. The scenario is byte-identical to the fixture's
 * `probeScenario`: same system, same initial state, same action-echo rule.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { createSession, EMPTY_CATALOGUE } from '@mm/agent-api';
import { createState, TIME_MODE } from '@mm/sim-core';
import {
  MATERIAL_STOCK,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSE,
  attachRecord,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
  findUniverse,
} from '@mm/state';

/** Fixed point at scale 1/1024, as §0 pins it. */
const FP = 1024;

/**
 * One system that folds the tick's submitted actions into world state.
 *
 * Identical to `fixtures.ts`'s `actionEchoSystem` — the value mixes the
 * previous one with each action's id, so two universes given different actions
 * diverge and stay diverged.
 */
function actionEchoSystem() {
  return {
    name: 'action-echo',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      const universe = findUniverse(ctx.state);
      if (universe === 0) return;
      const store = componentOf(ctx.state, UNIVERSE);
      let value = store.get(universe, 'worship');
      for (const action of ctx.actions) {
        value = (value * 31 + action.kind * 7 + 1) % (16 * FP);
      }
      store.set(universe, 'worship', value);
    },
  };
}

/**
 * A universe with one cohort and one number that remembers what was submitted.
 *
 * Byte-identical to `fixtures.ts`'s `probeScenario`. Rebuilt here because a
 * bare worker cannot import the fixture — see the module doc.
 */
function probeScenario() {
  const schema = defineWorldStateSchema([actionEchoSystem()]);
  return {
    scenarioId: 'desync-harness',
    catalogue: EMPTY_CATALOGUE,
    create(runSeed) {
      const state = createState({ rootSeed: runSeed, schema });
      const universe = createUniverse(state, {
        permittedTechniques: 0,
        permittedForms: 0,
        edictBudget: 4,
        traditionId: 1,
        favor: 20 * FP,
        worship: 0,
        worshipTier: 1,
        prestige: 0,
        prestigeEarned: 0,
        terminalReason: 0,
        favorCap: 100 * FP,
        ascended: 0,
      });
      attachRecord(state, MATERIAL_STOCK, universe, {
        food: 100 * FP,
        stone: 0,
        vellum: 0,
        labor: 0,
        essence: 0,
        insight: 0,
        passage: 0,
      });
      const cohort = state.entities.create();
      attachRecord(state, POPULACE_COHORT, cohort, {
        speciesId: 1,
        occupation: OCCUPATION.laborer,
        count: 5_000,
        birthTickBucket: -60,
      });
      return state;
    },
  };
}

// ─── Run the assigned batch ─────────────────────────────────────────────────

const { seeds, ticksPerMatch } = workerData;
const desyncs = [];
const finalHashes = [];
let matchesRun = 0;

for (const seed of seeds) {
  const scenario = probeScenario();

  // Two independently constructed sessions from the same seed. If the
  // simulation is deterministic, they produce the same hash at every tick.
  const sessionA = createSession({ scenario, agentSlotIndex: 0 });
  const sessionB = createSession({ scenario, agentSlotIndex: 0 });

  sessionA.reset(seed, { worldTickCap: ticksPerMatch });
  sessionB.reset(seed, { worldTickCap: ticksPerMatch });

  // Compare the initial state hash before any tick runs.
  const hashA0 = sessionA.snapshotHash();
  const hashB0 = sessionB.snapshotHash();
  if (hashA0 !== hashB0) {
    desyncs.push({ seed, tick: -1, hashA: hashA0, hashB: hashB0 });
    finalHashes.push({ seed, hash: hashA0 });
    matchesRun += 1;
    continue;
  }

  for (let tick = 0; tick < ticksPerMatch; tick += 1) {
    // Submit the same action to both. The no-op (kind 0) is always legal in
    // the probe universe; varying the kind by seed would be a stronger test
    // but would need a mask check the harness does not own.
    const action = { kind: 0 };
    sessionA.submit(action);
    sessionB.submit(action);

    const hashA = sessionA.snapshotHash();
    const hashB = sessionB.snapshotHash();
    if (hashA !== hashB) {
      desyncs.push({ seed, tick, hashA, hashB });
      break;
    }
  }

  // Record the final hash for the distinctness check.
  finalHashes.push({ seed, hash: sessionA.snapshotHash() });
  matchesRun += 1;
}

parentPort.postMessage({ desyncs, matchesRun, finalHashes });
