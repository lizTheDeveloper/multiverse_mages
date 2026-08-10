/*
 * Multiverse Mages — a lost node still costs rediscovery after a save and load.
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

import { deserializeState, mul, serializeState } from '@mm/sim-core';
import { LOCATION_KIND, defineWorldStateSchema } from '@mm/state';

import { MASTERY_MAX, REDISCOVERY_MULTIPLIER_FLOOR } from '../../src/instances/constants.js';
import { research } from '../../src/instances/research.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SUBJECT = 500;

/** A universe that learned a node and then lost every copy of it. */
function universeThatLostANode(): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const instance = knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: SUBJECT,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  knowledge.destroyInstance(instance, 12);
  return knowledge;
}

function requiredProgress(knowledge: KnowledgeSubsystem): number {
  return research({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(2, 20),
    subject: SUBJECT,
    nodeId: ROOT_NODE,
    worldTick: 20,
    progress: 0,
    effort: 0,
    learnRate: 1024,
    researchRate: 1024,
    rediscoveryAffinity: 1024,
  }).required;
}

describe('the ever-known record across a snapshot', () => {
  it('still costs rediscovery after a round trip', () => {
    const before = universeThatLostANode();
    expect(requiredProgress(before)).toBe(mul(4096, 4096));

    const bytes = serializeState(before.state);
    const restoredState = deserializeState(bytes, defineWorldStateSchema());
    const after = KnowledgeSubsystem.fromState(restoredState, TEST_NODE_COUNT);

    expect(after.wasEverKnown(ROOT_NODE)).toBe(true);
    expect(after.exists(ROOT_NODE)).toBe(false);
    expect(requiredProgress(after)).toBe(requiredProgress(before));
    expect(requiredProgress(after)).toBeGreaterThanOrEqual(mul(4096, REDISCOVERY_MULTIPLIER_FLOOR));
  });

  it('is what distinguishes a lost node from one never known', () => {
    const neverKnown = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const bytes = serializeState(neverKnown.state);
    const after = KnowledgeSubsystem.fromState(
      deserializeState(bytes, defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );

    expect(after.wasEverKnown(ROOT_NODE)).toBe(false);
    expect(requiredProgress(after)).toBe(4096);
    expect(requiredProgress(after)).toBeLessThan(mul(4096, REDISCOVERY_MULTIPLIER_FLOOR));
  });

  it('survives a round trip taken while the node still exists', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SUBJECT,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });

    const after = KnowledgeSubsystem.fromState(
      deserializeState(serializeState(knowledge.state), defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );
    expect(after.instanceCount(ROOT_NODE)).toBe(1);
    expect(requiredProgress(after)).toBe(4096);

    // And losing it *after* the restore is still expensive, which is what the
    // rebuilt index and the persisted record have to agree about.
    const restoredInstance = after.instancesOf(ROOT_NODE)[0];
    expect(restoredInstance).toBeDefined();
    after.destroyInstance(restoredInstance as number, 30);
    expect(requiredProgress(after)).toBe(mul(4096, 4096));
    void instance;
  });
});
