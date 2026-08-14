/*
 * Multiverse Mages — goal ids are permanent, and renumbering one rewrites
 * history rather than breaking a build.
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
 * The `mage-autonomy` spec makes renumbering a scenario of its own: *"WHEN an
 * existing goal's id is changed THEN the goal-registry test fails and its error
 * explains the balance-baseline consequence."* The second clause is why this
 * file pins the table against a literal copy rather than asserting some
 * structural property — a structural check would pass a renumbering, and a
 * diff of two arrays does not tell the person reading CI output why the project
 * cares.
 */

import { describe, expect, it } from 'vitest';

import {
  GOAL,
  GOALS_IN_ORDER,
  GOALS_NEEDING_A_TARGET,
  GOAL_COUNT,
  GOAL_NAMES,
  isGoalId,
  needsTarget,
} from '../../src/index.js';

/**
 * The registry as shipped at 0.4.0.
 *
 * A second copy, on purpose. Every other pinned table in this repository is
 * pinned the same way — `WORLD_COMPONENTS` in `state-schema.test.ts`,
 * `GOLDEN_ACTION` in the fixture worlds — because the point of a pin is that
 * changing the thing requires changing the pin, and a pin derived from the
 * thing changes with it silently.
 */
const AS_SHIPPED: readonly (readonly [string, number])[] = [
  ['idle', 0],
  ['research-node', 1],
  ['rediscover-node', 2],
  ['seek-teaching', 3],
  ['teach', 4],
  ['scribe', 5],
  ['affiliate', 6],
  ['ward-duty', 7],
  ['raid-readiness', 8],
  // Appended by `apply-magic` (w107). Nothing above it moved, which is the only
  // thing this pin is here to check.
  ['apply-magic', 9],
];

const BASELINE_CONSEQUENCE =
  'A goal id is recorded as a number in every committed Monte Carlo baseline and in the per-tick ' +
  'goal histogram. Renumbering one does not break a build -- it silently makes every historical ' +
  'run mean something different, and the symptom is a balance finding nobody can reproduce. The ' +
  'registry in goals.ts is append-only: a new goal takes the next unused id and nothing already ' +
  'there moves.';

describe('the goal registry is append-only', () => {
  it('holds exactly the goals shipped, at exactly their ids', () => {
    const actual = GOALS_IN_ORDER.map((goal) => [GOAL_NAMES[goal], goal] as const);
    // The message is attached to the assertion rather than left to the diff so
    // that a renumbering explains itself where CI prints it.
    expect(actual, BASELINE_CONSEQUENCE).toEqual(AS_SHIPPED);
  });

  it('numbers the goals consecutively from zero, so an append has an obvious next id', () => {
    GOALS_IN_ORDER.forEach((goal, index) => {
      expect(goal, BASELINE_CONSEQUENCE).toBe(index);
    });
    expect(GOAL_COUNT).toBe(AS_SHIPPED.length);
  });

  it('reuses no id between two goals', () => {
    expect(new Set(GOALS_IN_ORDER).size).toBe(GOALS_IN_ORDER.length);
  });

  it('gives every id in the enumeration a name and nothing else one', () => {
    expect(Object.keys(GOAL_NAMES).length).toBe(GOAL_COUNT);
    for (const goal of GOALS_IN_ORDER) {
      expect(GOAL_NAMES[goal]).toBeTypeOf('string');
      expect(GOAL_NAMES[goal].length).toBeGreaterThan(0);
    }
  });

  it('detects a renumbering rather than a rename', () => {
    // The control this file needs: the pin must fail on a permuted table and
    // pass on a renamed one, or it is not testing what it claims. Simulated
    // against a copy, since the shipped table is frozen by the assertions
    // above.
    const renumbered = AS_SHIPPED.map(([name, id]) => [name, id === 1 ? 9 : id] as const);
    expect(renumbered).not.toEqual(AS_SHIPPED);

    const renamed = AS_SHIPPED.map(([name, id]) => [name === 'idle' ? 'resting' : name, id] as const);
    expect(renamed.map(([, id]) => id)).toEqual(AS_SHIPPED.map(([, id]) => id));
  });
});

describe('idle is id zero and is the goal nothing can remove', () => {
  it('is the first goal in the enumeration', () => {
    expect(GOAL.idle).toBe(0);
    expect(GOALS_IN_ORDER[0]).toBe(GOAL.idle);
  });

  it('needs no target, so a zeroed selection reads as a real decision', () => {
    // contracts.md §0: absent references are 0. A commitment of (goal 0,
    // target 0) is "idle, at nothing", which is a state the world can be in --
    // as opposed to a sentinel meaning "nobody has decided", which is the state
    // the design says must not exist.
    expect(needsTarget(GOAL.idle)).toBe(false);
  });
});

describe('goals that need a node say so once', () => {
  it('lists exactly the target-taking goals', () => {
    expect([...GOALS_NEEDING_A_TARGET]).toEqual([
      GOAL.researchNode,
      GOAL.rediscoverNode,
      GOAL.seekTeaching,
      GOAL.teach,
      GOAL.scribe,
      // `apply-magic` names the node she casts. It is the one target-taking goal
      // with no project behind it — every candidate's `remainingCost` is zero,
      // because she already knows them all.
      GOAL.applyMagic,
    ]);
  });

  it('agrees with needsTarget for every goal in the registry', () => {
    for (const goal of GOALS_IN_ORDER) {
      expect(needsTarget(goal)).toBe(GOALS_NEEDING_A_TARGET.includes(goal));
    }
  });
});

describe('isGoalId', () => {
  it('accepts every shipped id', () => {
    for (const goal of GOALS_IN_ORDER) expect(isGoalId(goal)).toBe(true);
  });

  it('rejects the next unused id, a negative, and a non-integer', () => {
    expect(isGoalId(GOAL_COUNT)).toBe(false);
    expect(isGoalId(-1)).toBe(false);
    expect(isGoalId(1.5)).toBe(false);
  });
});
