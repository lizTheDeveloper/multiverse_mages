/*
 * Multiverse Mages — adversarial: materials burned for building that was never
 * done, with nothing recording it.
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
 * # THESE TESTS FAIL ON PURPOSE
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `advanceConstruction` charges `affordableMonths × MATERIALS_PER_LABOR_MONTH`
 * for every month of labour it was handed, then clamps the progress it credits
 * to what the site still needed:
 *
 *     const progressAdded = Math.min(scaled, remaining);
 *
 * The clamp is applied to the *progress* and never to the *charge*. On the tick
 * a university completes, the surplus labour is billed at full price and
 * delivers nothing. Offering ten thousand person-months to a site one month
 * from done deducts forty thousand materials to buy two `fp` of progress.
 *
 * Two things follow. The overcharge is unbounded in the labour offered — twice
 * the workforce is twice the bill for identically zero extra building — which
 * is what the tests below assert. And it is **invisible**: `labourStalled` is
 * documented as *"Person-months that went unused for want of materials"* and is
 * `0` here, because the materials were not short, so nothing in
 * `ConstructionOutcome` reports labour that went unused for want of *work*.
 * That second half is deliberately **not** asserted — which field should carry
 * it is a design choice a fixer should be free to make, and pinning it to
 * `labourStalled` would contradict that field's own docstring.
 *
 * ## (b) The lines that say it should be otherwise
 *
 * The `universities` spec, "Universities are built before they function":
 *
 *   > #### Scenario: Construction consumes materials
 *   > - **WHEN** laborer cohort-months are applied to a university under
 *   >   construction
 *   > - **THEN** materials are deducted in the same tick, **and progress
 *   >   advances by the deducted amount scaled by `laborAffinity` and the
 *   >   `build-rate` multiplier**
 *
 * The scenario ties the deduction and the progress together as one quantity
 * seen twice. On the completing tick they are not one quantity: the deduction
 * corresponds to a hundred months and the progress to one.
 *
 * `construction.ts`'s own header states the same invariant as the reason the
 * order of operations is what it is:
 *
 *   > So the affordable amount of labour is computed first and **the progress
 *   > is derived from what was actually paid for**.
 *
 * On the completing tick the progress is *not* derived from what was paid for.
 * It is derived from what was left to do, and the payment is left behind.
 *
 * The `economy` spec's "Materials are produced by labor and consumed by
 * everything" requires that when demand cannot be met *"the shortfall is
 * recorded"*. A charge that buys nothing is the same class of information —
 * `capacity.ts` in this very directory makes the argument at length: *"a bound
 * that is never observed to bind is a bound nobody can tune."*
 *
 * ## (c) Why the asserted values are the right ones
 *
 * With `laborAffinity` at `fp(1024)` and no `build-rate` bonuses, one
 * person-month is exactly `BUILD_PROGRESS_PER_LABOR_MONTH` of progress. A site
 * standing at `BUILD_COMPLETE - BUILD_PROGRESS_PER_LABOR_MONTH` therefore needs
 * exactly one month and can consume exactly one month's materials. So
 * `MATERIALS_PER_LABOR_MONTH` is not a tolerance or a guess — it is the
 * arithmetic the module's own constants give for the work actually delivered,
 * and it is the number a correct implementation must produce whether it was
 * offered one month or ten thousand.
 *
 * The assertions are mutually satisfiable. An implementation that caps
 * `affordableMonths` at the months the remaining progress can absorb produces,
 * for both labour offers: `progressAdded` `2`, `completed` `true`,
 * `materialsSpent` `MATERIALS_PER_LABOR_MONTH`. Nothing below asks for a value
 * that contradicts another — the second test asserts only that the two offers
 * agree with each other, which is weaker than the first and would also be
 * satisfied by a fix that charged some other consistent amount.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { UniversityRecord } from '@mm/state';

import {
  BUILD_COMPLETE,
  BUILD_PROGRESS_PER_LABOR_MONTH,
  MATERIALS_PER_LABOR_MONTH,
  advanceConstruction,
} from '../../src/index.js';
import type { ConstructionInput } from '../../src/index.js';

import { buildRatePrimitive } from '../unit/universities-fixtures.js';

/** A site one person-month from done, at neutral affinity and no bonuses. */
function nearlyFinished(): UniversityRecord {
  return {
    libraryId: 0,
    capacity: 40,
    buildProgress: BUILD_COMPLETE - BUILD_PROGRESS_PER_LABOR_MONTH,
  };
}

function site(laborMonths: number): ConstructionInput {
  return {
    laborMonths,
    laborAffinity: FP_ONE,
    // Far more than any of these ticks could legitimately need, so that
    // nothing below is limited by the stock.
    materials: 1_000_000,
    buildRate: buildRatePrimitive(),
    buildRateBonuses: [],
  };
}

describe('the last tick of construction bills for labour it cannot use', () => {
  it('charges one month of materials for the one month of work it did', () => {
    const record = nearlyFinished();
    const outcome = advanceConstruction(record, site(100));

    // Control: the work really was one month's worth, and the site finished.
    expect(outcome.progressAdded).toBe(BUILD_PROGRESS_PER_LABOR_MONTH);
    expect(outcome.completed).toBe(true);
    expect(record.buildProgress).toBe(BUILD_COMPLETE);

    expect(outcome.materialsSpent).toBe(MATERIALS_PER_LABOR_MONTH);
  });

  it('does not make the bill depend on how much surplus labour showed up', () => {
    const modest = advanceConstruction(nearlyFinished(), site(100));
    const enormous = advanceConstruction(nearlyFinished(), site(10_000));

    // Control: both offers deliver exactly the same building.
    expect(enormous.progressAdded).toBe(modest.progressAdded);
    expect(enormous.completed).toBe(modest.completed);

    expect(enormous.materialsSpent).toBe(modest.materialsSpent);
  });
});
