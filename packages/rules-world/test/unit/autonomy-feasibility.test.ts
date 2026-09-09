/*
 * Multiverse Mages — feasibility removes a goal from consideration; it never
 * scores it low.
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
 * Every scenario under the `mage-autonomy` spec's *"Feasibility is a mask, not
 * a weight"* requirement, plus the one property that makes the difference
 * observable rather than philosophical: **a masked goal cannot be selected at
 * any score.** The negative-weight implementation the design rejects would pass
 * every "is it masked" test written as an assertion about a number, and fail
 * this one.
 */

import { describe, expect, it } from 'vitest';

import {
  GOAL,
  GOALS_IN_ORDER,
  GOAL_COUNT,
  isFeasible,
  maskGoals,
  scoreGoals,
  selectGoal,
} from '../../src/index.js';

import { appealWeights, goalAppealWeights, outlook, richOutlook, speciesNamed, target } from './autonomy-fixtures.js';
import { stepRng } from './mage-fixtures.js';

describe('goals a mage cannot pursue are removed', () => {
  it('masks research when the mage has no frontier, however curious she is', () => {
    const incurious = outlook({ species: speciesNamed('dwarf'), discoveryTargets: [] });
    const curious = outlook({
      species: speciesNamed('gnome'),
      personality: { curiosity: 2048, ambition: 1024, caution: 1024 },
      discoveryTargets: [],
    });

    for (const state of [incurious, curious]) {
      expect(isFeasible(GOAL.researchNode, state)).toBe(false);
      expect(maskGoals(state).feasible).not.toContain(GOAL.researchNode);
    }
  });

  it('masks seek-teaching when nobody can teach her anything', () => {
    expect(isFeasible(GOAL.seekTeaching, outlook({ teachableToMe: [] }))).toBe(false);
    expect(isFeasible(GOAL.seekTeaching, outlook({ teachableToMe: [target(3)] }))).toBe(true);
  });

  it('masks scribing when the materials stock is under the cheapest option', () => {
    const cheapest = target(1, 1, 900);
    const dearer = target(2, 1, 4096);
    const poor = outlook({
      scribeThroughput: 1024,
      scribableTargets: [dearer, cheapest],
      materials: 899,
    });
    const solvent = outlook({
      scribeThroughput: 1024,
      scribableTargets: [dearer, cheapest],
      materials: 900,
    });

    expect(isFeasible(GOAL.scribe, poor)).toBe(false);
    // Affordable for the cheapest and not for the dearest is still feasible:
    // the spec's threshold is "the cost of the cheapest available scribing".
    expect(isFeasible(GOAL.scribe, solvent)).toBe(true);
  });

  it('masks scribing at a university with no scribe staff, however rich the universe', () => {
    const unstaffed = outlook({
      scribeThroughput: 0,
      scribableTargets: [target(1, 1, 8)],
      materials: 1_000_000,
    });
    expect(isFeasible(GOAL.scribe, unstaffed)).toBe(false);
  });

  it('masks ward-duty for an unaffiliated mage, who has no library to stand over', () => {
    expect(isFeasible(GOAL.wardDuty, outlook({ universityId: 0 }))).toBe(false);
    expect(isFeasible(GOAL.wardDuty, outlook({ universityId: 4 }))).toBe(true);
  });

  it('masks affiliate when no better university is on offer', () => {
    expect(isFeasible(GOAL.affiliate, outlook({ betterAffiliationAvailable: false }))).toBe(false);
  });
});

describe('a masked goal is unreachable, not merely unattractive', () => {
  it('is never selected even when every other goal is at the floor', () => {
    // Nothing to do anywhere: every goal but idle and raid-readiness is masked,
    // and both surviving goals sit at their base appeal. If masking were a
    // large negative weight instead, research would still be *in* the score
    // list -- so this asserts over the list, not only over the winner.
    const barren = outlook();
    const mask = maskGoals(barren);
    const scores = scoreGoals(mask.feasible, barren, goalAppealWeights);

    expect(scores.map((entry) => entry.goal)).not.toContain(GOAL.researchNode);
    const chosen = selectGoal({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
      outlook: barren,
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(99, 0),
    });
    expect(mask.feasible).toContain(chosen.commitment.goalId);
  });
});

describe('idle is always feasible', () => {
  it('survives an outlook in which nothing else does', () => {
    const mask = maskGoals(outlook());
    expect(mask.feasible).toContain(GOAL.idle);
  });

  it('leaves the argmax with something to return, so no "no goal" state exists', () => {
    const selection = selectGoal({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
      outlook: outlook(),
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(1, 0),
    });
    expect(GOALS_IN_ORDER).toContain(selection.commitment.goalId);
  });
});

describe('masking is counted, not only applied', () => {
  it('reports the number removed and the goals it removed', () => {
    const mask = maskGoals(outlook());
    expect(mask.maskedCount).toBe(mask.masked.length);
    expect(mask.maskedCount + mask.feasible.length).toBe(GOAL_COUNT);
    expect(mask.maskedCount).toBeGreaterThan(0);
  });

  it('reports zero when everything is available', () => {
    const mask = maskGoals(richOutlook());
    expect(mask.maskedCount).toBe(0);
    expect([...mask.feasible]).toEqual([...GOALS_IN_ORDER]);
  });

  it('surfaces the count on a selection, which is where an aggregate reads it', () => {
    const selection = selectGoal({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
      outlook: outlook(),
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(2, 0),
    });
    expect(selection.maskedCount).toBeGreaterThan(0);
  });

  it('returns the feasible set ascending by goal id, never in evaluation order', () => {
    const mask = maskGoals(richOutlook());
    const ascending = [...mask.feasible].sort((a, b) => a - b);
    expect([...mask.feasible]).toEqual(ascending);
  });
});

describe('an unknown goal id is a defect, not a default', () => {
  it('throws rather than answering false', () => {
    // Answering `false` would mask an unrecognised goal, which is the friendly
    // behaviour and the wrong one: a goal id that fell out of the registry
    // would silently stop being selected and the histogram would show a
    // population that had simply lost interest in it.
    expect(() => isFeasible(GOAL_COUNT as never, outlook())).toThrow(/not a goal id/u);
  });
});
