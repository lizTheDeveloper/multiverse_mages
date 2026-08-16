/*
 * Multiverse Mages — the per-tick goal histogram, available without turning
 * anything on.
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
 * Two spec scenarios: the histogram exists every tick, and a monoculture is
 * detectable from it *without re-running the simulation*. The second is the one
 * that shapes the class — a detector that needed the run replayed would be a
 * detector nobody uses on the run that went wrong.
 */

import { describe, expect, it } from 'vitest';

import { MAGE_ROLE } from '@mm/state';

import {
  GOAL,
  GOAL_COUNT,
  GoalHistogram,
  MONOCULTURE_SHARE,
  MONOCULTURE_SUSTAINED_TICKS,
  histogramCellCount,
  selectGoal,
} from '../../src/index.js';

import { appealWeights, goalAppealWeights, richOutlook } from './autonomy-fixtures.js';
import { stepRng } from './mage-fixtures.js';

describe('the histogram counts by species, role, and goal', () => {
  it('separates two species that chose the same goal', () => {
    const histogram = new GoalHistogram();
    histogram.record(1, MAGE_ROLE.researcher, GOAL.teach);
    histogram.record(2, MAGE_ROLE.researcher, GOAL.teach);
    histogram.record(2, MAGE_ROLE.researcher, GOAL.teach);

    expect(histogram.countIn(1, MAGE_ROLE.researcher, GOAL.teach)).toBe(1);
    expect(histogram.countIn(2, MAGE_ROLE.researcher, GOAL.teach)).toBe(2);
    expect(histogram.countOf(GOAL.teach)).toBe(3);
  });

  it('separates two roles within one species', () => {
    const histogram = new GoalHistogram();
    histogram.record(1, MAGE_ROLE.researcher, GOAL.scribe);
    histogram.record(1, MAGE_ROLE.warden, GOAL.scribe);
    expect(histogram.countIn(1, MAGE_ROLE.researcher, GOAL.scribe)).toBe(1);
    expect(histogram.countIn(1, MAGE_ROLE.warden, GOAL.scribe)).toBe(1);
  });

  it('reports cells in ascending packed order, never in insertion order', () => {
    const histogram = new GoalHistogram();
    histogram.record(9, MAGE_ROLE.raider, GOAL.raidReadiness);
    histogram.record(1, MAGE_ROLE.researcher, GOAL.idle);
    histogram.record(5, MAGE_ROLE.professor, GOAL.teach);

    const order = histogram.entries().map((cell) => cell.speciesId);
    expect(order).toEqual([1, 5, 9]);
  });

  it('round-trips a cell address through packing, for a large species id', () => {
    // The multiplication-not-shift argument in histogram.ts. A species id near
    // the top of its uint16 range shifted left by 16 would come back negative.
    const histogram = new GoalHistogram();
    histogram.record(65000, MAGE_ROLE.raider, GOAL.wardDuty);
    const [cell] = histogram.entries();
    expect(cell).toEqual({
      speciesId: 65000,
      roleId: MAGE_ROLE.raider,
      goal: GOAL.wardDuty,
      count: 1,
    });
  });
});

describe('switches and masking are counted alongside', () => {
  it('counts a switch only when the goal changed', () => {
    const histogram = new GoalHistogram();
    histogram.record(1, MAGE_ROLE.researcher, GOAL.teach, { switched: true });
    histogram.record(1, MAGE_ROLE.researcher, GOAL.teach, { switched: false });
    expect(histogram.goalSwitches).toBe(1);
    expect(histogram.total).toBe(2);
  });

  it('separates mages who evaluated from mages who held', () => {
    const histogram = new GoalHistogram();
    histogram.record(1, MAGE_ROLE.researcher, GOAL.teach, { evaluated: true, maskedCount: 3 });
    histogram.record(1, MAGE_ROLE.researcher, GOAL.teach, { evaluated: false });
    expect(histogram.evaluationCount).toBe(1);
    expect(histogram.maskedGoalCount).toBe(3);
  });

  it('takes its inputs straight off a selection, with no debug mode to enable', () => {
    const histogram = new GoalHistogram();
    for (let mage = 1; mage <= 30; mage += 1) {
      const selection = selectGoal({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
        outlook: richOutlook({ mage }),
        worldTick: 4,
        incumbent: undefined,
        rng: stepRng(808, 4),
      });
      histogram.record(1, MAGE_ROLE.researcher, selection.commitment.goalId, {
        switched: selection.switched,
        evaluated: selection.evaluated,
        maskedCount: selection.maskedCount,
      });
    }
    expect(histogram.total).toBe(30);
    expect(histogram.entries().length).toBeGreaterThan(0);
  });
});

describe('a monoculture is visible as a number', () => {
  it('reports a total agreement as the full share', () => {
    const histogram = new GoalHistogram();
    for (let index = 0; index < 50; index += 1) {
      histogram.record(1, MAGE_ROLE.researcher, GOAL.scribe);
    }
    const dominant = histogram.dominant();
    expect(dominant.goal).toBe(GOAL.scribe);
    expect(dominant.share).toBe(1024);
    expect(dominant.share).toBeGreaterThan(MONOCULTURE_SHARE);
  });

  it('stays under the threshold for a mixed population', () => {
    const histogram = new GoalHistogram();
    for (let index = 0; index < 50; index += 1) {
      histogram.record(1, MAGE_ROLE.researcher, index % 2 === 0 ? GOAL.scribe : GOAL.teach);
    }
    expect(histogram.dominant().share).toBeLessThan(MONOCULTURE_SHARE);
  });

  it('reports an empty tick as no agreement rather than as total agreement', () => {
    // An empty universe is not a monoculture. Reporting it as one would fire
    // the alarm on a universe with no mages left, which is a worse problem with
    // its own signal.
    expect(new GoalHistogram().dominant().share).toBe(0);
  });

  it('documents the sustained-tick threshold as a number, not as prose', () => {
    expect(Number.isInteger(MONOCULTURE_SUSTAINED_TICKS)).toBe(true);
    expect(MONOCULTURE_SUSTAINED_TICKS).toBeGreaterThan(0);
  });
});

describe('the histogram is small enough not to need a flag', () => {
  it('is bounded by species × roles × goals', () => {
    expect(histogramCellCount(6, 4)).toBe(6 * 4 * GOAL_COUNT);
    // Eleven goals: nine at 0.4.0, `apply-magic` on `main`, `practice` on this
    // branch. Both sides of the merge pinned ten, each counting its own append
    // and not the other's, so the literal is re-measured here rather than
    // taken from either. Written against the constant rather than a literal
    // above, because the claim is that the histogram is bounded by the goal
    // set and not that the goal set is a particular size.
    expect(GOAL_COUNT).toBe(11);
    // Written as `GOAL_COUNT` rather
    // than as a literal, because the bound is a claim about the shape of the
    // histogram and not about how many goals happen to exist today — and the
    // pin that a goal count may not change silently is `goal-registry.test.ts`'s
    // job, stated there once.
    expect(histogramCellCount(6, 4)).toBe(6 * 4 * GOAL_COUNT);
  });
});
