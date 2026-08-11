/*
 * Multiverse Mages — staggered evaluation, commitment, and hysteresis, which
 * solve two different problems and are tested apart.
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
 * `mages-and-species/design.md` is explicit that hysteresis alone is not
 * enough: it *"damps flip-flopping but not synchronization, and it does nothing
 * for the cost."* So the stagger and the margin are asserted separately, and
 * the stampede test next door asserts the property that needs both.
 */

import { describe, expect, it } from 'vitest';

import {
  EVAL_PERIOD,
  GOAL,
  HYSTERESIS_MARGIN,
  MIN_COMMITMENT_TICKS,
  displaces,
  isEvaluationTick,
  reevaluationReason,
  selectGoal,
  shouldReevaluate,
} from '../../src/index.js';
import type { GoalCommitment } from '../../src/index.js';

import { outlook, richOutlook, target } from './autonomy-fixtures.js';
import { stepRng } from './mage-fixtures.js';

const commitment = (overrides: Partial<GoalCommitment> = {}): GoalCommitment => ({
  goal: GOAL.researchNode,
  targetNodeId: 11,
  adoptedTick: 0,
  score: 900,
  ...overrides,
});

describe('evaluation is spread across ticks by the mage handle', () => {
  it('gives about one mage in evalPeriod a turn on any given tick', () => {
    const population = 3000;
    let due = 0;
    for (let mage = 1; mage <= population; mage += 1) {
      if (isEvaluationTick(100, mage, 3)) due += 1;
    }
    // Exactly a third, because handles here are consecutive. The point of the
    // assertion is that it is not "all" and not "none".
    expect(due).toBe(population / 3);
  });

  it('phases a mage on its own handle, so two mages differ', () => {
    expect(isEvaluationTick(0, 3, EVAL_PERIOD)).toBe(true);
    expect(isEvaluationTick(0, 4, EVAL_PERIOD)).toBe(false);
    // And the same mage comes round again exactly evalPeriod later.
    expect(isEvaluationTick(EVAL_PERIOD, 3, EVAL_PERIOD)).toBe(true);
  });

  it('refuses a period of zero rather than dividing the hot loop by nothing', () => {
    expect(() => isEvaluationTick(0, 1, 0)).toThrow(/positive integer/u);
  });
});

describe('completion and infeasibility outrank the schedule', () => {
  const held = {
    worldTick: 101,
    mage: 5,
    incumbent: commitment({ adoptedTick: 0 }),
    incumbentFeasible: true,
    incumbentComplete: false,
  } as const;

  it('holds a mage whose phase has not come round', () => {
    expect(isEvaluationTick(held.worldTick, held.mage, EVAL_PERIOD)).toBe(false);
    expect(reevaluationReason(held)).toBe('held');
    expect(shouldReevaluate(held)).toBe(false);
  });

  it('re-evaluates in the same tick when the goal becomes infeasible', () => {
    expect(reevaluationReason({ ...held, incumbentFeasible: false })).toBe('infeasible');
    expect(shouldReevaluate({ ...held, incumbentFeasible: false })).toBe(true);
  });

  it('re-evaluates in the same tick when the goal completes', () => {
    expect(reevaluationReason({ ...held, incumbentComplete: true })).toBe('complete');
  });

  it('re-evaluates a mage who has never chosen anything', () => {
    expect(reevaluationReason({ ...held, incumbent: undefined })).toBe('no-incumbent');
  });
});

describe('a freshly adopted goal is held for the commitment period', () => {
  const onPhase = (tick: number, mage: number): boolean => isEvaluationTick(tick, mage, 1);

  it('holds through an evaluation phase inside the minimum', () => {
    const input = {
      worldTick: MIN_COMMITMENT_TICKS - 1,
      mage: 1,
      incumbent: commitment({ adoptedTick: 0 }),
      incumbentFeasible: true,
      incumbentComplete: false,
      options: { evalPeriod: 1 },
    } as const;
    expect(onPhase(input.worldTick, input.mage)).toBe(true);
    expect(reevaluationReason(input)).toBe('held');
  });

  it('releases exactly at the minimum', () => {
    const input = {
      worldTick: MIN_COMMITMENT_TICKS,
      mage: 1,
      incumbent: commitment({ adoptedTick: 0 }),
      incumbentFeasible: true,
      incumbentComplete: false,
      options: { evalPeriod: 1 },
    } as const;
    expect(reevaluationReason(input)).toBe('scheduled');
  });

  it('does not hold an infeasible goal to the end of its commitment', () => {
    // The failure the mask exists to prevent, arriving through the scheduler.
    const input = {
      worldTick: 1,
      mage: 1,
      incumbent: commitment({ adoptedTick: 0 }),
      incumbentFeasible: false,
      incumbentComplete: false,
      options: { evalPeriod: 1 },
    } as const;
    expect(reevaluationReason(input)).toBe('infeasible');
  });
});

describe('hysteresis governs displacement', () => {
  it('needs a challenger to beat the incumbent by more than the margin', () => {
    expect(displaces(1000, 900, HYSTERESIS_MARGIN)).toBe(false);
    expect(displaces(1000 + HYSTERESIS_MARGIN, 1000, HYSTERESIS_MARGIN)).toBe(false);
    expect(displaces(1000 + HYSTERESIS_MARGIN + 1, 1000, HYSTERESIS_MARGIN)).toBe(true);
  });

  it('keeps a marginally-beaten incumbent through a real evaluation', () => {
    // A universe where teach is slightly better than the incumbent research
    // goal, with the commitment period already elapsed.
    const state = richOutlook({ mage: 3, discoveryTargets: [target(11, 1, 1024)] });
    const selection = selectGoal({
      outlook: state,
      worldTick: 300,
      incumbent: commitment({ adoptedTick: 0 }),
      rng: stepRng(11, 300),
      schedule: { evalPeriod: 1, minCommitmentTicks: 0, hysteresisMargin: 4096 },
    });
    expect(selection.evaluated).toBe(true);
    expect(selection.switched).toBe(false);
    expect(selection.commitment.goal).toBe(GOAL.researchNode);
  });

  it('lets a decisively better challenger through', () => {
    const state = richOutlook({ mage: 3, discoveryTargets: [target(11, 1, 1024)] });
    const selection = selectGoal({
      outlook: state,
      worldTick: 300,
      incumbent: commitment({ goal: GOAL.raidReadiness, targetNodeId: 0, adoptedTick: 0 }),
      rng: stepRng(11, 300),
      schedule: { evalPeriod: 1, minCommitmentTicks: 0, hysteresisMargin: 0 },
    });
    expect(selection.switched).toBe(true);
    expect(selection.commitment.goal).not.toBe(GOAL.raidReadiness);
  });

  it('does not restart the commitment clock when the same goal wins again', () => {
    // A goal that reset its own clock on every evaluation could never be
    // displaced, which turns the commitment floor into a permanent lock.
    const state = richOutlook({ mage: 3, discoveryTargets: [target(11, 1, 1024)] });
    const incumbent = commitment({ adoptedTick: 10 });
    const selection = selectGoal({
      outlook: state,
      worldTick: 300,
      incumbent,
      rng: stepRng(11, 300),
      schedule: { evalPeriod: 1, minCommitmentTicks: 0, hysteresisMargin: 0 },
    });
    expect(selection.commitment.goal).toBe(GOAL.researchNode);
    expect(selection.commitment.adoptedTick).toBe(10);
    expect(selection.switched).toBe(false);
  });
});

describe('a held tick costs nothing and reports as much', () => {
  it('scores no goals and reports no masking', () => {
    const selection = selectGoal({
      outlook: outlook({ mage: 4 }),
      worldTick: 101,
      incumbent: commitment({ goal: GOAL.idle, targetNodeId: 0, adoptedTick: 100 }),
      rng: stepRng(3, 101),
    });
    expect(selection.reason).toBe('held');
    expect(selection.evaluated).toBe(false);
    expect(selection.scores).toHaveLength(0);
    expect(selection.maskedCount).toBe(0);
  });
});
