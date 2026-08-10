/*
 * Multiverse Mages — teaching, its eligibility threshold, and its losses.
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

import { LOCATION_KIND } from '@mm/state';

import { DEFAULT_TEACH_THRESHOLD, MASTERY_MAX } from '../../src/instances/constants.js';
import type { TeachingInputs } from '../../src/instances/teaching.js';
import { teach } from '../../src/instances/teaching.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  CHILD_NODE,
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

const TEACHER = 100;
const STUDENT = 200;

function fixture(teacherMastery: number, nodeId = ROOT_NODE): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: TEACHER,
    acquiredTick: 0,
    mastery: teacherMastery,
  });
  return knowledge;
}

function inputs(
  knowledge: KnowledgeSubsystem,
  overrides: Partial<TeachingInputs> = {},
): TeachingInputs {
  return {
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(5, 8),
    teacher: TEACHER,
    student: STUDENT,
    nodeId: ROOT_NODE,
    worldTick: 8,
    ...overrides,
  };
}

describe('teaching', () => {
  it('transmits without reduction from a fully masterful teacher', () => {
    const knowledge = fixture(MASTERY_MAX);
    const outcome = teach(inputs(knowledge));

    expect(outcome.refusal).toBeUndefined();
    expect(outcome.mastery).toBe(MASTERY_MAX);
    const created = knowledge.read(outcome.instance);
    expect(created.locationKind).toBe(LOCATION_KIND.mind);
    expect(created.locationId).toBe(STUDENT);
    expect(created.acquiredTick).toBe(8);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
  });

  it('transmits with reduction proportional to the teacher’s shortfall', () => {
    const knowledge = fixture(768);
    const outcome = teach(inputs(knowledge));

    expect(outcome.refusal).toBeUndefined();
    expect(outcome.mastery).toBeGreaterThan(0);
    expect(outcome.mastery).toBeLessThan(768);
  });

  it('degrades across a chain of mediocre teachers', () => {
    const knowledge = fixture(768);
    const second = teach(inputs(knowledge));
    const third = teach(
      inputs(knowledge, { teacher: STUDENT, student: 300, rng: stepRng(5, 9), worldTick: 9 }),
    );

    expect(second.mastery).toBeLessThan(768);
    expect(third.mastery).toBeLessThan(second.mastery);
  });

  it('refuses a teacher below the eligibility threshold, naming it', () => {
    const knowledge = fixture(DEFAULT_TEACH_THRESHOLD - 1);
    const outcome = teach(inputs(knowledge));

    expect(outcome.refusal).toEqual({
      reason: 'teacher-below-threshold',
      nodeId: ROOT_NODE,
      mastery: DEFAULT_TEACH_THRESHOLD - 1,
      threshold: DEFAULT_TEACH_THRESHOLD,
    });
    expect(outcome.instance).toBe(0);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
  });

  it('refuses when the student lacks a prerequisite, naming it', () => {
    const knowledge = fixture(MASTERY_MAX, CHILD_NODE);
    const outcome = teach(inputs(knowledge, { nodeId: CHILD_NODE }));

    expect(outcome.refusal).toEqual({
      reason: 'unsatisfied-prerequisite',
      nodeId: CHILD_NODE,
      prerequisiteId: ROOT_NODE,
      subject: STUDENT,
    });
  });

  it('refuses a forbidden cell, so a dormant instance cannot be taught', () => {
    const knowledge = fixture(MASTERY_MAX);
    const outcome = teach(inputs(knowledge, { ruleset: interdicting(HOME_CELL) }));

    expect(outcome.refusal).toEqual({
      reason: 'forbidden-cell',
      nodeId: ROOT_NODE,
      cellId: HOME_CELL,
    });
  });

  it('refuses a node no instance of which survives, and says so', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: TEACHER,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });
    knowledge.destroyInstance(instance, 4);

    const outcome = teach(inputs(knowledge));
    expect(outcome.refusal).toEqual({ reason: 'node-lost', nodeId: ROOT_NODE });
  });

  it('refuses a teacher who holds the node nowhere in mind', () => {
    const knowledge = fixture(MASTERY_MAX);
    const outcome = teach(inputs(knowledge, { teacher: 999 }));

    expect(outcome.refusal).toEqual({ reason: 'node-not-held', nodeId: ROOT_NODE, subject: 999 });
  });

  it('resolves against the index alone, so handles need name no mage record', () => {
    const knowledge = fixture(MASTERY_MAX);
    const outcome = teach(inputs(knowledge, { student: 123456 }));

    expect(outcome.refusal).toBeUndefined();
    expect(knowledge.read(outcome.instance).locationId).toBe(123456);
  });

  it('draws from stream 4 keyed on the teacher, reproducibly', () => {
    const first = teach(inputs(fixture(768), { rng: stepRng(31, 8) }));
    const same = teach(inputs(fixture(768), { rng: stepRng(31, 8) }));
    const other = teach(inputs(fixture(768), { rng: stepRng(32, 8) }));

    expect(same.mastery).toBe(first.mastery);
    expect(other.mastery).not.toBe(first.mastery);
  });
});
