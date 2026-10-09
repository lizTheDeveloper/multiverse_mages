/*
 * Multiverse Mages — a raid settles its own dead, and only its own.
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
 * `settleRaidCasualties` finishes a raid death the way an ordinary death is
 * finished — goal, lessons, workings, affiliation — for exactly the handles it
 * is given. It must not sweep every dead mage: `long-run.ts`'s `applyLossShock`
 * kills without clearing those rows, and a sweep would settle its dead too.
 */

import { describe, expect, it } from 'vitest';

import { settleRaidCasualties } from '@mm/coordination';
import { rngFromRootSeed, step, type SimState } from '@mm/sim-core';
import { GOAL_COMMITMENT, MAGE, collectRecords, componentOf } from '@mm/state';

import { referenceContent, referenceScenario } from '@mm/scenario';

/** A reference universe a year in: mages committed to goals and affiliated. */
function settledWorld(): SimState {
  const run = referenceScenario(referenceContent(), { telemetry: false });
  let state = run.scenario.create(7000, { worldTickCap: 400 });
  for (let tick = 0; tick < 12; tick += 1) state = step(state, [], rngFromRootSeed(state.rootSeed));
  return state;
}

function affiliatedCommitted(state: SimState): number[] {
  const commitments = componentOf(state, GOAL_COMMITMENT);
  return collectRecords(state, MAGE)
    .filter(({ handle, row }) => row.alive === 1 && row.universityId !== 0 && commitments.has(handle))
    .map(({ handle }) => handle);
}

describe('settleRaidCasualties', () => {
  it('settles exactly the casualties it is handed, and leaves other dead untouched', () => {
    const state = settledWorld();
    const [raidDead, otherDead, living] = affiliatedCommitted(state);
    expect(raidDead).toBeDefined();
    expect(otherDead).toBeDefined();
    expect(living).toBeDefined();
    const mages = componentOf(state, MAGE);
    const commitments = componentOf(state, GOAL_COMMITMENT);
    // Two deaths: one by a raid, one by some other path that clears nothing.
    mages.set(raidDead as number, 'alive', 0);
    mages.set(otherDead as number, 'alive', 0);

    // `living` is passed too: a handle that is not a dead mage is skipped.
    const settled = settleRaidCasualties(state, [raidDead as number, living as number]);
    expect(settled).toBe(1);

    expect(mages.get(raidDead as number, 'universityId')).toBe(0);
    expect(commitments.has(raidDead as number)).toBe(false);

    // The other death is not this raid's: still affiliated, still committed.
    expect(mages.get(otherDead as number, 'universityId')).not.toBe(0);
    expect(commitments.has(otherDead as number)).toBe(true);
    // And the living mage is untouched.
    expect(mages.get(living as number, 'universityId')).not.toBe(0);
    expect(commitments.has(living as number)).toBe(true);
  });
});
