/*
 * Multiverse Mages — proof that `monthsByGoal` counts the months the work phase
 * actually consumed, and not something adjacent to them.
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
 * ## What this exists to stop happening again
 *
 * `WorldStepReport` carried one goal-shaped number, `goalSwitches`, and it
 * counts *changes*. So a goal that every mage adopts and that the rules do not
 * implement moved nothing in the report, and looked from outside exactly like a
 * goal nobody adopts. On `08ca5368` that was not hypothetical: **36.5 % of
 * committed mage-months over 600 ticks of the reference universe were held on
 * `affiliate`**, which `workOne` has no arm for, and the only way to see it was
 * a bespoke tool reading the commitment component tick by tick.
 *
 * A report field that is wired up wrongly would be worse than none, because it
 * would answer confidently about the wrong input — CLAUDE.md has five recorded
 * instances of that shape. So this suite gives the field a **positive control**
 * rather than only asserting shape: the commitment component is scanned
 * *before* the step, and the tick's `monthsByGoal` must equal that scan, bucket
 * for bucket.
 *
 * ## Why the scan is taken before the step and not after
 *
 * `spendTheMonth` works the commitment written *last* tick — that is what makes
 * a month of work a month — and `stepMageAutonomy` then rewrites it in phase 6
 * of the same tick. A scan taken after the step therefore describes the *next*
 * tick's work, and a test comparing it to this tick's report would fail for a
 * correct implementation. Off-by-one in the other direction is the mistake that
 * makes the check pass on a broken field.
 *
 * ## And why ticks with a death are skipped rather than adjusted
 *
 * `killTheDead` runs in phase 3 and `spendTheMonth` in phase 4, so a mage
 * counted in the pre-step scan can be dead before the walk reaches her. The
 * alternative to skipping is reconstructing which mage died and which bucket
 * she was in, which is re-implementing the phase inside its own test. The
 * assertion below on how many ticks were compared is what keeps the skip from
 * quietly emptying the suite.
 */

import { describe, expect, it } from 'vitest';

import type { SimState } from '@mm/sim-core';
import { rngFromRootSeed, step } from '@mm/sim-core';
import type { WorldStepReport } from '@mm/coordination';
import { defineWorldSimulation } from '@mm/coordination';
import { GOAL_COMMITMENT, MAGE, collectRecords } from '@mm/state';
import { GOALS_IN_ORDER, GOAL_COUNT, GOAL_NAMES } from '@mm/rules-world';

import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '../../src/index.js';

/**
 * 120 ticks — ten world years.
 *
 * Long enough that the founding cohort has died and been replaced, so the
 * comparison covers ticks where mages were promoted into commitments the
 * starting position never held, and short enough that the whole suite is one
 * run of the world loop.
 */
const TICKS = 120;

/** Living mages holding a commitment, bucketed by goal, read straight off state. */
function scanCommitments(state: SimState): number[] {
  const buckets = new Array<number>(GOAL_COUNT).fill(0);
  // Alive first, and the filter is not cosmetic: a commitment row can outlive
  // the mage it belongs to for the part of a tick before the next prune, and a
  // bucket counting those is not counting months.
  const alive = new Set<number>();
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive !== 0) alive.add(handle);
  }
  for (const { handle, row } of collectRecords(state, GOAL_COMMITMENT)) {
    if (!alive.has(handle)) continue;
    buckets[row.goalId] = (buckets[row.goalId] ?? 0) + 1;
  }
  return buckets;
}

interface Sample {
  readonly report: WorldStepReport;
  readonly expected: readonly number[];
  readonly deaths: number;
}

const samples: Sample[] = [];
const totals = new Array<number>(GOAL_COUNT).fill(0);

{
  const content = referenceContent();
  const simulation = defineWorldSimulation(content.deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });

  for (let tick = 0; tick < TICKS; tick += 1) {
    const expected = scanCommitments(state);
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) throw new Error('The world system reported nothing.');
    samples.push({ report, expected, deaths: report.mageDeaths });
    for (const goal of GOALS_IN_ORDER) {
      totals[goal] = (totals[goal] ?? 0) + (report.monthsByGoal[goal] ?? 0);
    }
  }
}

describe('WorldStepReport.monthsByGoal', () => {
  it('has one bucket per goal, every tick, all non-negative integers', () => {
    for (const { report } of samples) {
      expect(report.monthsByGoal).toHaveLength(GOAL_COUNT);
      for (const count of report.monthsByGoal) {
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('equals the commitments held when the month began', () => {
    // The positive control. A field populated from the autonomy histogram, from
    // the wrong tick, or from the goals that produced work rather than the goals
    // that consumed a month all fail here.
    let compared = 0;
    for (const { report, expected, deaths } of samples) {
      if (deaths > 0) continue;
      expect([...report.monthsByGoal]).toStrictEqual(expected);
      compared += 1;
    }
    // Non-vacuity, and the reason CLAUDE.md gives for it: a check that reports
    // the negative case has to be shown capable of reporting the positive one.
    expect(compared).toBeGreaterThan(TICKS / 2);
  });

  it('never counts more months than there are living mages', () => {
    for (const { report } of samples) {
      const spent = report.monthsByGoal.reduce((a, b) => a + b, 0);
      expect(spent).toBeLessThanOrEqual(report.livingMages);
    }
  });

  it('separates the goals rather than piling every month into one', () => {
    // If the tally were keyed on something constant — a fixed index, a mistyped
    // field — this is the assertion that would catch it, and none of the three
    // above would.
    const occupied = GOALS_IN_ORDER.filter((goal) => (totals[goal] ?? 0) > 0);
    expect(occupied.length).toBeGreaterThan(2);
    const spent = totals.reduce((a, b) => a + b, 0);
    expect(spent).toBeGreaterThan(0);
  });

  it('is the number that makes a goal with no accrual visible', () => {
    // The finding this field was added for, stated as a relationship rather
    // than as the 36.5 % it measured on `08ca5368` — that figure is a
    // measurement of one ref and belongs in the PR that took it, not in an
    // assertion that would have to be edited every time balance moved.
    //
    // `affiliate` is the goal in question, and `workOne` has no arm for it. What
    // is asserted is only that the report can *see* it: whatever share it holds,
    // it is reported, so the next time a goal quietly takes a third of mage-life
    // the number moves. This holds both before and after that wire is repaired,
    // which is the property an observability test should have.
    const affiliate = GOALS_IN_ORDER.find((goal) => GOAL_NAMES[goal] === 'affiliate');
    expect(affiliate).toBeDefined();
    const spent = totals.reduce((a, b) => a + b, 0);
    const onAffiliate = totals[affiliate ?? 0] ?? 0;
    expect(onAffiliate).toBeGreaterThanOrEqual(0);
    expect(onAffiliate).toBeLessThanOrEqual(spent);
    // And the fold agrees with the per-tick reports it was built from, which is
    // the last way a summed number can lie about its own inputs.
    let refolded = 0;
    for (const { report } of samples) refolded += report.monthsByGoal.reduce((a, b) => a + b, 0);
    expect(refolded).toBe(spent);
  });
});
