/*
 * Multiverse Mages — a shared input changing does not move the whole mage
 * population in one tick.
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
 * The scenario: *"WHEN a shared input changes such that one goal becomes
 * globally more attractive THEN mages switch to it over at least `evalPeriod`
 * ticks rather than all within one tick."*
 *
 * `mages-and-species/design.md` explains why the failure matters more than it
 * looks: a synchronized switch *"looks like a bug, oscillates, and poisons
 * every metric with harmonics that have nothing to do with balance."* A
 * harmonic in `timeToTierBySpecies` is indistinguishable from a real balance
 * finding until somebody spends a week on it.
 *
 * The population is stepped through a small driver rather than through the
 * simulation, because no world tick exists to step yet. That is honest about
 * what is being asserted: the *scheduler* spreads the switch. Whether the world
 * loop calls the scheduler correctly is task group 9's to demonstrate.
 */

import { describe, expect, it } from 'vitest';

import { EVAL_PERIOD, GOAL, GoalHistogram, selectGoal } from '../../src/index.js';
import type { MageGoalCommitment, MageOutlook } from '../../src/index.js';

import { appealWeights, richOutlook, target } from './autonomy-fixtures.js';
import { stepRng } from './mage-fixtures.js';

const POPULATION = 300;

/** Before the change: research is the obvious thing to do. */
function calmOutlook(mage: number): MageOutlook {
  return richOutlook({
    mage,
    discoveryTargets: [target(11, 1, 512), target(12, 1, 600), target(13, 1, 700), target(14, 1, 800)],
    teachableByMe: [],
    teachableToMe: [],
    scribableTargets: [],
    scribeThroughput: 0,
    betterAffiliationAvailable: false,
  });
}

/** After the change: a shared input makes teaching globally better. */
function excitedOutlook(mage: number): MageOutlook {
  return richOutlook({
    mage,
    normalizedAge: 900,
    discoveryTargets: [target(11, 1, 512)],
    teachableByMe: [target(41), target(42), target(43), target(44)],
    teachableToMe: [],
    scribableTargets: [],
    scribeThroughput: 0,
    betterAffiliationAvailable: false,
  });
}

describe('no synchronized goal stampede', () => {
  it('spreads the switch over at least evalPeriod ticks', () => {
    const commitments = new Map<number, MageGoalCommitment>();

    // Settle the population on research first, so the switch below is a
    // displacement rather than a first choice.
    for (let tick = 0; tick < 12; tick += 1) {
      for (let mage = 1; mage <= POPULATION; mage += 1) {
        const selection = selectGoal({
      appeal: appealWeights,
          outlook: calmOutlook(mage),
          worldTick: tick,
          incumbent: commitments.get(mage),
          rng: stepRng(31337, tick),
        });
        commitments.set(mage, selection.commitment);
      }
    }
    const settled = [...commitments.values()].filter(
      (commitment) => commitment.goalId === GOAL.researchNode,
    ).length;
    expect(settled).toBe(POPULATION);

    // The shared input changes at tick 12 and stays changed.
    const switchesPerTick: number[] = [];
    for (let tick = 12; tick < 12 + EVAL_PERIOD * 4; tick += 1) {
      const histogram = new GoalHistogram();
      for (let mage = 1; mage <= POPULATION; mage += 1) {
        const selection = selectGoal({
      appeal: appealWeights,
          outlook: excitedOutlook(mage),
          worldTick: tick,
          incumbent: commitments.get(mage),
          rng: stepRng(31337, tick),
        });
        commitments.set(mage, selection.commitment);
        histogram.record(1, 0, selection.commitment.goalId, {
          switched: selection.switched,
          evaluated: selection.evaluated,
          maskedCount: selection.maskedCount,
        });
      }
      switchesPerTick.push(histogram.goalSwitches);
    }

    const total = switchesPerTick.reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(0);

    // The property, stated two ways. No single tick carries the whole
    // population...
    for (const count of switchesPerTick) {
      expect(count).toBeLessThan(POPULATION);
    }
    // ...and the switching is spread across at least evalPeriod distinct ticks.
    const ticksWithSwitches = switchesPerTick.filter((count) => count > 0).length;
    expect(ticksWithSwitches).toBeGreaterThanOrEqual(EVAL_PERIOD);
  });

  it('would fail if every mage shared one evaluation phase', () => {
    // The control. With evalPeriod 1 and no commitment period, every mage is
    // due on every tick and the whole population moves at once -- which is the
    // behaviour the stagger exists to prevent, demonstrated rather than
    // asserted about in prose.
    const commitments = new Map<number, MageGoalCommitment>();
    for (let mage = 1; mage <= POPULATION; mage += 1) {
      commitments.set(mage, {
        goalId: GOAL.researchNode,
        targetNodeId: 11,
        adoptedTick: 0,
        score: 900,
      });
    }
    let switched = 0;
    for (let mage = 1; mage <= POPULATION; mage += 1) {
      const selection = selectGoal({
      appeal: appealWeights,
        outlook: excitedOutlook(mage),
        worldTick: 50,
        incumbent: commitments.get(mage),
        rng: stepRng(31337, 50),
        schedule: { evalPeriod: 1, minCommitmentTicks: 0 },
      });
      if (selection.switched) switched += 1;
    }
    expect(switched).toBe(POPULATION);
  });
});
