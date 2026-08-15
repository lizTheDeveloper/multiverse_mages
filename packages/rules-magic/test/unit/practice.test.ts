/*
 * Multiverse Mages — practice: the operation that raises mastery, and its ceiling.
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

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import {
  DEFAULT_INITIAL_MASTERY,
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_MAX,
  PRACTICE_CEILING_BASE,
  PRACTICE_CEILING_PER_TIER,
  PRACTICE_GAIN_PER_MONTH,
} from '../../src/instances/constants.js';
import { decayedMastery, masteryDecayPerTick } from '../../src/instances/decay.js';
import type { PracticeInputs } from '../../src/instances/practice.js';
import { practice, practiceCeiling, practicedMastery } from '../../src/instances/practice.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { teach } from '../../src/instances/teaching.js';
import {
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const MAGE = 100;
const STUDENT = 200;

/** A mage holding one node at a given mastery, in mind. */
function fixture(mastery: number, holder = MAGE): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: holder,
    acquiredTick: 0,
    mastery,
  });
  return knowledge;
}

function inputs(
  knowledge: KnowledgeSubsystem,
  overrides: Partial<PracticeInputs> = {},
): PracticeInputs {
  return {
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    subject: MAGE,
    nodeId: ROOT_NODE,
    effort: FP_ONE,
    // Two tiers of headroom over the fixture's tier-1 node, so the ceiling is
    // full mastery unless a test says otherwise.
    depthCeiling: 3,
    ...overrides,
  };
}

describe('practice — the defect it exists to close', () => {
  it('carries a self-researched node across the teach threshold, which nothing else could', () => {
    // The exact starting point `research` creates an instance at, and the exact
    // threshold `teach` refuses below. Before this operation existed the
    // interval between them was empty: `setMastery`'s only rules-path caller
    // was the decay sweep and it lowers.
    const knowledge = fixture(DEFAULT_INITIAL_MASTERY);
    let months = 0;
    let mastery = DEFAULT_INITIAL_MASTERY;
    let crossings = 0;

    while (mastery < DEFAULT_TEACH_THRESHOLD && months < 200) {
      const outcome = practice(inputs(knowledge));
      expect(outcome.refusal).toBeUndefined();
      if (outcome.crossedTeachThreshold) crossings += 1;
      mastery = outcome.mastery;
      months += 1;
    }

    expect(mastery).toBeGreaterThanOrEqual(DEFAULT_TEACH_THRESHOLD);
    expect(crossings).toBe(1);
    expect(months).toBeLessThan(200);
  });

  it('makes her a teacher: the same instance that could not teach now can', () => {
    const knowledge = fixture(DEFAULT_INITIAL_MASTERY);
    const teaching = {
      knowledge,
      catalog: testCatalog(),
      cells: testCells,
      ruleset: permissiveRuleset(),
      rng: stepRng(5, 8),
      teacher: MAGE,
      student: STUDENT,
      nodeId: ROOT_NODE,
      worldTick: 8,
    };

    const before = teach(teaching);
    expect(before.refusal?.reason).toBe('teacher-below-threshold');

    for (let i = 0; i < 40; i += 1) practice(inputs(knowledge));

    const after = teach(teaching);
    expect(after.refusal).toBeUndefined();
    expect(after.instance).not.toBe(0);
  });

  it('outruns decay at the same retention, or it would be a slower loss', () => {
    // The bracket `PRACTICE_GAIN_PER_MONTH`'s docstring claims. A gain below the
    // per-tick loss would make a month of practice a month of falling behind.
    expect(PRACTICE_GAIN_PER_MONTH).toBeGreaterThan(masteryDecayPerTick(FP_ONE));
    const drilled = practicedMastery(400, MASTERY_MAX, PRACTICE_GAIN_PER_MONTH);
    const decayed = decayedMastery(drilled, 1, FP_ONE, false);
    expect(decayed).toBeGreaterThan(400);
  });
});

describe('practice — the ceiling that keeps a population stratified', () => {
  it('gives a node at the top of a mage’s reach exactly the teach threshold', () => {
    expect(practiceCeiling(4, 4)).toBe(DEFAULT_TEACH_THRESHOLD);
    expect(practiceCeiling(7, 7)).toBe(DEFAULT_TEACH_THRESHOLD);
    expect(PRACTICE_CEILING_BASE).toBe(DEFAULT_TEACH_THRESHOLD);
  });

  it('rises by one step per tier of headroom and stops at full mastery', () => {
    expect(practiceCeiling(3, 4)).toBe(DEFAULT_TEACH_THRESHOLD + PRACTICE_CEILING_PER_TIER);
    expect(practiceCeiling(1, 4)).toBe(MASTERY_MAX);
    expect(practiceCeiling(1, 7)).toBe(MASTERY_MAX);
  });

  it('is monotone in headroom and never exceeds full mastery', () => {
    for (let ceiling = 0; ceiling <= 7; ceiling += 1) {
      let previous = -1;
      for (let tier = 7; tier >= 1; tier -= 1) {
        const value = practiceCeiling(tier, ceiling);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeLessThanOrEqual(MASTERY_MAX);
        previous = value;
      }
    }
  });

  it('treats a node above her reach as no headroom rather than as negative', () => {
    expect(practiceCeiling(7, 3)).toBe(PRACTICE_CEILING_BASE);
  });

  it('refuses to level a granted instance down to what she could have reached', () => {
    // A god grants at 1024. A mage at her limit has a ceiling of 512. Practice
    // must not take the difference away: it is an operation that raises.
    const knowledge = fixture(MASTERY_MAX);
    const outcome = practice(inputs(knowledge, { depthCeiling: 1 }));
    expect(outcome.gained).toBe(0);
    expect(outcome.mastery).toBe(MASTERY_MAX);
    expect(knowledge.read(outcome.instance).mastery).toBe(MASTERY_MAX);
  });

  it('stops a mage at her limit at exactly teachable, not above it', () => {
    const knowledge = fixture(DEFAULT_INITIAL_MASTERY);
    let instance = 0;
    for (let i = 0; i < 100; i += 1) instance = practice(inputs(knowledge, { depthCeiling: 1 })).instance;
    expect(knowledge.read(instance).mastery).toBe(DEFAULT_TEACH_THRESHOLD);
  });
});

describe('practice — what it refuses', () => {
  it('refuses a node the subject does not hold in mind or palace', () => {
    const knowledge = fixture(DEFAULT_INITIAL_MASTERY, 999);
    const outcome = practice(inputs(knowledge));
    expect(outcome.refusal?.reason).toBe('node-not-held');
    expect(outcome.gained).toBe(0);
  });

  it('refuses an interdicted cell, and writes nothing', () => {
    const knowledge = fixture(DEFAULT_INITIAL_MASTERY);
    const held = knowledge.instancesHeldBy(MAGE)[0] ?? 0;
    const outcome = practice(inputs(knowledge, { ruleset: interdicting(HOME_CELL) }));
    expect(outcome.refusal?.reason).toBe('forbidden-cell');
    expect(knowledge.read(held).mastery).toBe(DEFAULT_INITIAL_MASTERY);
  });

  it('adds nothing for a month nobody spent', () => {
    const knowledge = fixture(DEFAULT_INITIAL_MASTERY);
    const outcome = practice(inputs(knowledge, { effort: 0 }));
    expect(outcome.gained).toBe(0);
    expect(outcome.mastery).toBe(DEFAULT_INITIAL_MASTERY);
  });

  it('reports a crossing as a transition and not as a level', () => {
    const knowledge = fixture(DEFAULT_TEACH_THRESHOLD);
    const outcome = practice(inputs(knowledge));
    expect(outcome.mastery).toBeGreaterThan(DEFAULT_TEACH_THRESHOLD);
    expect(outcome.crossedTeachThreshold).toBe(false);
  });
});

describe('practice — species differentiation', () => {
  it('gives a faster learner more per month, and neither less than zero', () => {
    const quick = fixture(DEFAULT_INITIAL_MASTERY);
    const slow = fixture(DEFAULT_INITIAL_MASTERY);
    const fast = practice(inputs(quick, { learnRate: 1536 }));
    const plodding = practice(inputs(slow, { learnRate: 512 }));

    expect(fast.gained).toBeGreaterThan(plodding.gained);
    expect(plodding.gained).toBeGreaterThan(0);
  });

  it('is monotone non-decreasing in mastery for every input', () => {
    for (const current of [0, 1, 255, 512, 1023, MASTERY_MAX]) {
      for (const gain of [-100, 0, 1, 4096]) {
        expect(practicedMastery(current, MASTERY_MAX, gain)).toBeGreaterThanOrEqual(current);
      }
    }
  });
});
