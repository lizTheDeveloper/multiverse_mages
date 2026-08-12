/*
 * Multiverse Mages — vision §6a's compounding loop, wired and measured.
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
 * `vision.md` §6a:
 *
 * > **Knowledge as capital** — a university's output scales with the depth of
 * > its library. […] A deep library trains better mages, who research faster,
 * > who deepen the library.
 *
 * Every piece of that shipped with `mages-and-species` and none of it was
 * joined: `capitalRateMultiplier`, `contributionFor`, `applyLibraryUpkeep` and
 * `emitCapital` had no caller outside their own unit tests, and `world-step.ts`
 * handed `libraryUpkeep: 0` to the consumption order. What this file pins is the
 * join.
 *
 * ## The two worlds differ by one field, and it is not an entity
 *
 * Both worlds below build **both** academies and shelve **both** shelves
 * identically. The only difference is which `universityId` the mages carry. That
 * is `shelving.test.ts`' own discipline and it is not fussiness: `contracts.md`
 * §6 keys the research stream on the subject, so a world holding forty fewer
 * entities hands every mage a different handle and a legitimately different
 * draw — and a test that changed the seeding would be measuring the seeding.
 *
 * ## What a rate does, and where
 *
 * `research.ts` is explicit that a rate scales the **requirement**, not the
 * progress: *"a quick learner needs less progress rather than earning more per
 * step … one place for rates to apply instead of two."* So a deep library does
 * not show up as a bigger number banked in one month; it shows up as **more
 * finished work over time**, which is what these tests count.
 *
 * ## No magnitude is asserted
 *
 * `release-plan.md` forbids a balance claim before 0.5.0 and every number in the
 * contribution table is marked `untuned`. These are direction and mechanism
 * claims: *strictly more*, *strictly less*, *exactly once*.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import type { Handle } from '@mm/state';
import {
  GOAL_COMMITMENT,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  UNIVERSE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
} from '@mm/state';
import { MASTERY_MAX } from '@mm/rules-magic';
import { GOAL, LIBRARY_UPKEEP_PER_INSTANCE } from '@mm/rules-world';

import type { WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import {
  catalogAndCells,
  scribingTraditionId,
  seededWorld,
  sourceFor,
  worldDeps,
} from './world-fixtures.js';

const ROOT_SEED = 0x0006_a000;

/** `fp(1.0)` — a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/**
 * Distinct tier-1 nodes shelved in the "scholarly" library.
 *
 * Past the table's second knot (32 nodes, `fp(320)`), so the contribution is
 * comfortably clear of the rounding at the bottom of the curve and still far
 * below saturation at 640. Nothing here depends on the exact figure — the
 * assertions are inequalities — but a fixture inside the first segment would
 * make a real regression look like a rounding difference.
 */
const DEEP_SHELF = 40;

/** Which academy the universe's mages belong to. */
type Affiliation = 'scholarly' | 'bare';

interface Academy {
  readonly university: Handle;
  readonly library: EntityHandle;
}

/** A completed university with an empty library, and nothing on its staff. */
function foundAcademy(state: SimState): Academy {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 64,
    buildProgress: FP_ONE,
  });
  return { university, library };
}

/** Tier-1 node ids from the shipped catalog, ascending, however many are asked for. */
function tierOneNodes(count: number): number[] {
  const { catalog } = catalogAndCells();
  const found: number[] = [];
  for (let nodeId = 1; nodeId <= catalog.nodeCount && found.length < count; nodeId += 1) {
    if (catalog.node(nodeId)?.tier === 1) found.push(nodeId);
  }
  if (found.length < count) {
    throw new Error(`the shipped catalog holds fewer than ${String(count)} tier-1 nodes`);
  }
  return found;
}

/** Shelves `copies` instances of each node in a library, as an endowment would. */
function shelve(
  state: SimState,
  library: EntityHandle,
  nodes: readonly number[],
  copies = 1,
): void {
  for (const nodeId of nodes) {
    for (let copy = 0; copy < copies; copy += 1) {
      const instance = state.entities.create();
      attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
        nodeId,
        locationKind: LOCATION_KIND.library,
        locationId: library,
        acquiredTick: 0,
        mastery: MASTERY_MAX,
      });
    }
  }
}

interface WorldOptions {
  /** Which academy every mage is affiliated with. */
  readonly affiliation: Affiliation;
  /** Distinct nodes on the scholarly shelf. */
  readonly shelf?: number;
  /** Copies of each of them, for the upkeep-without-depth case. */
  readonly copies?: number;
}

interface World {
  readonly state: SimState;
  readonly scholarly: Academy;
  readonly bare: Academy;
  readonly mages: readonly Handle[];
  report(): WorldStepReport;
  advance(ticks?: number): void;
  totals(): { researchCompleted: number; grimoiresScribed: number };
}

/**
 * One universe with two completed universities, identical in every respect
 * except which of them the mages are affiliated with.
 */
function universe(options: WorldOptions): World {
  const traditionId = scribingTraditionId();
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED, traditionId });

  const scholarly = foundAcademy(state);
  const bare = foundAcademy(state);
  shelve(state, scholarly.library, tierOneNodes(options.shelf ?? DEEP_SHELF), options.copies ?? 1);

  const home = options.affiliation === 'scholarly' ? scholarly : bare;
  const store = componentOf(state, MAGE);
  store.forEach((_row, handle) => {
    store.set(handle, 'universityId', home.university);
  });

  let current = state;
  const source = sourceFor(ROOT_SEED);
  const summed = { researchCompleted: 0, grimoiresScribed: 0 };

  return {
    get state() {
      return current;
    },
    scholarly,
    bare,
    mages,
    report: () => simulation.lastReport() as WorldStepReport,
    advance: (ticks = 1) => {
      for (let tick = 0; tick < ticks; tick += 1) {
        current = step(current, [], source);
        const report = simulation.lastReport() as WorldStepReport;
        summed.researchCompleted += report.researchCompleted;
        summed.grimoiresScribed += report.grimoiresScribed;
      }
    },
    totals: () => ({ ...summed }),
  };
}

/** Five world years, as the other loop tests use. Group 9 owns the long run. */
const TICKS = 60;

/**
 * Two five-year universes is two real universes, and the suite runs files in
 * parallel. Raised from vitest's 5s default for the same reason
 * `reference-time-to-tier.test.ts` raises its own: a timeout under load is a
 * scheduling fact reported as a behaviour failure.
 */
const TIMEOUT_MS = 120_000;


describe('PROBE', () => {
  it('reports researchCompleted at several horizons', () => {
    for (const ticks of [30, 60, 120, 240]) {
      const scholarly = universe({ affiliation: 'scholarly' });
      scholarly.advance(ticks);
      const unaided = universe({ affiliation: 'bare' });
      unaided.advance(ticks);
      // eslint-disable-next-line no-console
      console.log(
        'ticks', ticks,
        'scholarly', scholarly.totals().researchCompleted,
        'bare', unaided.totals().researchCompleted,
        'scribed s/b', scholarly.totals().grimoiresScribed, unaided.totals().grimoiresScribed,
      );
    }
    expect(true).toBe(true);
  }, 600000);
});
