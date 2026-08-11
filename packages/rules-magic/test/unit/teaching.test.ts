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
import { teach, transmittedMastery } from '../../src/instances/teaching.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type { PersonalStore } from '../../src/traditions/store.js';
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

  it("refuses when the *student's* store is full, and teaches on when the teacher's is", () => {
    const store: PersonalStore = {
      kind: 'palace',
      personalLocationKind: LOCATION_KIND.palace,
      slotsPerMage: 2,
    };
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    // The teacher's palace is full to bursting. She is transmitting, not
    // acquiring, so her own bound has nothing to say about it.
    for (let held = 0; held < 9; held += 1) {
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.palace,
        locationId: TEACHER,
        acquiredTick: 0,
        mastery: MASTERY_MAX,
      });
    }

    const taught = teach(inputs(knowledge, { store }));
    expect(taught.refusal).toBeUndefined();
    expect(knowledge.read(taught.instance).locationKind).toBe(LOCATION_KIND.palace);

    // One more fills the student to her two slots; the third is refused, and
    // the refusal names her count and not her teacher's nine.
    expect(teach(inputs(knowledge, { store, worldTick: 9 })).refusal).toBeUndefined();
    const refused = teach(inputs(knowledge, { store, worldTick: 10 }));

    expect(refused.refusal).toEqual({
      reason: 'personal-store-full',
      nodeId: ROOT_NODE,
      subject: STUDENT,
      storeKind: 'palace',
      held: 2,
      slotsPerMage: 2,
    });
    expect(refused.instance).toBe(0);
    expect(knowledge.instancesAt(LOCATION_KIND.palace, STUDENT)).toHaveLength(2);
  });

  it('resolves against the index alone, so handles need name no mage record', () => {
    const knowledge = fixture(MASTERY_MAX);
    const outcome = teach(inputs(knowledge, { student: 123456 }));

    expect(outcome.refusal).toBeUndefined();
    expect(knowledge.read(outcome.instance).locationId).toBe(123456);
  });

  it('loses at least one unit at the smallest possible shortfall, for every jitter', () => {
    // The regression this file did not have. `transmittedMastery` claimed
    // strict loss below full mastery and did not deliver it: at a shortfall of
    // one unit, `mul(1, FP_ONE + jitter)` floors to 0 for every negative
    // jitter, which is roughly half of the real [-256, 256] draw range, and the
    // student then received the teacher's mastery unchanged.
    //
    // A teacher at 1023 is not a hand-picked impossibility: full mastery
    // decayed one ordinary tick at a high retention lands near 1020. What
    // settled it: `knowledge-instances`' "Degradation compounds across a chain"
    // scenario words the THEN clause with strict "lower than" twice, and a
    // plateau at the top of the curve would mean an archmage chain never
    // degrades — exactly the effect `knowledgeHalfLife` exists to detect.
    for (let jitter = -256; jitter <= 256; jitter += 1) {
      expect(transmittedMastery(1023, jitter), `jitter=${String(jitter)}`).toBeLessThan(1023);
    }
  });

  it('still transmits a fully masterful teacher exactly, for every jitter', () => {
    // The other half of the same property, and the reason the fix clamps the
    // jittered *shortfall* rather than the transmitted mastery: at full mastery
    // there is no shortfall to clamp, so losslessness stays exact rather than
    // becoming "lossless on average".
    for (let jitter = -256; jitter <= 256; jitter += 1) {
      expect(transmittedMastery(MASTERY_MAX, jitter), `jitter=${String(jitter)}`).toBe(MASTERY_MAX);
    }
  });

  it('degrades a chain that starts one unit below full, tick after tick', () => {
    // The chain scenario at the values that used to flatten it entirely.
    let mastery = MASTERY_MAX - 1;
    for (let link = 0; link < 8; link += 1) {
      const next = transmittedMastery(mastery, -1);
      expect(next, `link=${String(link)}`).toBeLessThan(mastery);
      mastery = next;
    }
  });

  it('draws from stream 4 keyed on the teacher, reproducibly', () => {
    const first = teach(inputs(fixture(768), { rng: stepRng(31, 8) }));
    const same = teach(inputs(fixture(768), { rng: stepRng(31, 8) }));
    const other = teach(inputs(fixture(768), { rng: stepRng(32, 8) }));

    expect(same.mastery).toBe(first.mastery);
    expect(other.mastery).not.toBe(first.mastery);
  });
});
