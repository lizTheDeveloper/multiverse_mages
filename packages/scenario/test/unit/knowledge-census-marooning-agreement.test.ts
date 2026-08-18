/*
 * Multiverse Mages — the census's countdown is the tick teaching actually stops.
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
 * W26 publishes a floor, a per-tick loss and a countdown so that a renderer
 * never derives them. The price of publishing them out of `@mm/agent-api` —
 * which may not import `@mm/rules-magic` — is that the arithmetic arrives as an
 * *argument*, and an argument can be wired wrong in a way a type cannot catch.
 *
 * This file is that price. It runs a real universe, reads the census at every
 * tick, and requires:
 *
 * 1. **The published constants are `rules-magic`'s**, not a lookalike — floor
 *    and decay per tick compared against the exported functions directly.
 * 2. **`teachable` is what `teach()` would decide** — compared against
 *    `DEFAULT_TEACH_THRESHOLD`, the value `teaching.ts` defaults to.
 * 3. **The countdown is right against the sweep**, which is the claim that
 *    matters and the only one a static check cannot make. A prediction taken at
 *    tick *T* says the instance stops being teachable at *T + n*; the run is
 *    then watched to see whether it does.
 *
 * Without (3), a census could publish an internally consistent countdown that
 * simply did not describe `decayHeldKnowledge`, and every panel built on it
 * would be confidently wrong in a way no test would notice. The countdown is
 * the whole deliverable, so it is the thing measured against the rules rather
 * than against itself.
 *
 * ## Why a short run
 *
 * Long enough that the first human cohort crosses (65 ticks) with room after —
 * a run that ended before anything crossed would pass vacuously, which the
 * first assertion refuses.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import type { InstanceMastery } from '@mm/agent-api';
import { knowledgeCensus } from '@mm/agent-api';
import {
  DEFAULT_TEACH_THRESHOLD,
  masteryDecayPerTick,
  masteryFloor,
} from '@mm/rules-magic';
import { referenceContent, referenceMasteryModel, referenceScenario } from '@mm/scenario';

const TICKS = 200;
const SEED = 0x0009_0001;
const CONFIG = { worldTickCap: TICKS, options: { cohortSize: 4, foundingNodes: 4 } } as const;

const content = referenceContent();
const mastery = referenceMasteryModel(content.registry);

/**
 * An instance's identity across ticks.
 *
 * Not the entity handle alone: `destroyInstance` returns handles to the entity
 * store, so a handle seen at tick 40 and again at tick 90 need not be the same
 * instance. `acquiredTick` and `nodeId` pin it — a reused handle carrying a
 * different node or a later acquisition is a different key and is simply
 * tracked separately, which is the safe direction.
 */
function keyOf(row: InstanceMastery): string {
  return `${String(row.instanceHandle)}:${String(row.nodeId)}:${String(row.acquiredTick)}`;
}

interface Observation {
  /** What the census predicted, and the tick it predicted it on. */
  readonly predictedAt: number;
  readonly predictedFlip: number;
}

/** One zero-input run, censused at every tick. */
function observe(): {
  readonly predictionsChecked: number;
  readonly crossingsSeen: number;
  readonly constantMismatches: string[];
  readonly teachableMismatches: string[];
  readonly flipMismatches: string[];
  /** Flips that came later than projected, because the holder practised. */
  readonly flipsDeferredByPractice: number;
} {
  const run = referenceScenario(content);
  let state = run.scenario.create(SEED, CONFIG);

  const pending = new Map<string, Observation>();
  const constantMismatches: string[] = [];
  const teachableMismatches: string[] = [];
  const flipMismatches: string[] = [];
  let predictionsChecked = 0;
  let crossingsSeen = 0;
  let flipsDeferredByPractice = 0;

  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const worldTick = state.clock.worldTick;
    const rows = knowledgeCensus(state, { mastery }).marooning?.byInstance ?? [];

    for (const row of rows) {
      // (1) The published constants are rules-magic's own outputs.
      const dormant = row.condemned;
      if (
        row.floor !== masteryFloor(row.retention, dormant) ||
        row.decayPerTick !== masteryDecayPerTick(row.retention)
      ) {
        constantMismatches.push(
          `${keyOf(row)}: floor ${String(row.floor)} vs ${String(masteryFloor(row.retention, dormant))}, ` +
            `decay ${String(row.decayPerTick)} vs ${String(masteryDecayPerTick(row.retention))}`,
        );
      }

      // (2) `teachable` is the decision `teach()` makes.
      const teachableByRules = row.mastery >= DEFAULT_TEACH_THRESHOLD;
      if (row.teachable !== teachableByRules) {
        teachableMismatches.push(`${keyOf(row)} at tick ${String(worldTick)}`);
      }

      const key = keyOf(row);
      const forecast = pending.get(key);
      if (forecast !== undefined && !row.teachable) {
        // (3) The instance has stopped being teachable. Did it happen on the
        // tick the census said it would?
        crossingsSeen += 1;
        predictionsChecked += 1;
        // ## The projection is a floor, since `w196/mastery-rises`
        //
        // `ticksToUnteachable` projects **decay alone**, which was the whole of
        // what could happen to a mastery when this test was written:
        // `setMastery`'s one rules-path caller was the decay sweep. `practice`
        // is a second caller and it raises, so an instance whose holder went
        // back to the desk outlives the projection.
        //
        // A late flip is therefore the census being *conservative* and is
        // counted rather than failed. An **early** flip is still a hard
        // mismatch: nothing in the rules removes mastery faster than the decay
        // this projection is made of, so the census promising a tick the sweep
        // beats would mean the two disagree about the sweep itself.
        if (worldTick < forecast.predictedFlip) {
          flipMismatches.push(
            `${key}: predicted at tick ${String(forecast.predictedAt)} to stop on ` +
              `${String(forecast.predictedFlip)}, actually stopped EARLY on ${String(worldTick)}`,
          );
        } else if (worldTick > forecast.predictedFlip) {
          flipsDeferredByPractice += 1;
        }
        pending.delete(key);
        continue;
      }

      // Record the *earliest* forecast for each instance and never revise it, so
      // the check is a genuine prediction over many ticks rather than a
      // one-tick-ahead restatement that could not be wrong.
      if (row.teachable && row.ticksToUnteachable !== null && !pending.has(key)) {
        pending.set(key, {
          predictedAt: worldTick,
          predictedFlip: worldTick + row.ticksToUnteachable,
        });
      }
    }
  }

  return {
    predictionsChecked,
    crossingsSeen,
    constantMismatches,
    teachableMismatches,
    flipMismatches,
    flipsDeferredByPractice,
  };
}

describe('the census publishes the rules, not a second opinion of them', () => {
  const result = observe();

  it('watched enough instances actually stop being teachable to mean something', () => {
    // The vacuity guard. A run in which nothing crossed would pass every
    // assertion below by never evaluating any of them.
    expect(result.crossingsSeen).toBeGreaterThan(0);
    expect(result.predictionsChecked).toBeGreaterThan(0);
  });

  it('publishes rules-magic’s floor and per-tick loss, not a re-derivation', () => {
    expect(result.constantMismatches).toEqual([]);
  });

  it('agrees with teach()’s threshold about which instances can teach', () => {
    expect(result.teachableMismatches).toEqual([]);
  });

  it('never promises a tick the decay sweep beats', () => {
    // The claim the whole projection rests on: `ticksToUnteachable` describes
    // `decayHeldKnowledge`, not merely itself. Since `w196/mastery-rises` it is
    // a **lower bound** rather than an exact tick, because `practice` can raise
    // a mastery the projection assumed would only fall. Early is a mismatch;
    // late is the census being conservative about an operation it does not
    // model, and `flipsDeferredByPractice` counts those so the deferral is
    // visible rather than absorbed.
    expect(result.flipMismatches).toEqual([]);
  });

  it('is visibly deferred by practice, so the bound is not vacuously exact', () => {
    // The vacuity guard for the loosened assertion above. If nothing ever
    // outlived its projection, the bound would be untested and the exact
    // equality it replaced should come back.
    expect(result.flipsDeferredByPractice).toBeGreaterThan(0);
  });
});
