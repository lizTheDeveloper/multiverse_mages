/*
 * Multiverse Mages — where a written copy lives, and what burning it costs.
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

import { GRIMOIRE, HOLDER_KIND, LOCATION_KIND, readRecord } from '@mm/state';

import { MASTERY_MAX } from '../../src/instances/constants.js';
import {
  destroyGrimoire,
  destroyLibrary,
  grimoiresIn,
  shelveGrimoire,
  withdrawGrimoire,
} from '../../src/instances/location.js';
import { STANDARD_STORE, scribe } from '../../src/instances/scribing.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  CHILD_NODE,
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SCRIBE = 300;
const LIBRARY = 900;

function written(nodeId = ROOT_NODE): {
  knowledge: KnowledgeSubsystem;
  grimoire: number;
  instance: number;
} {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: SCRIBE,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  const outcome = scribe({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(3, 2),
    scribe: SCRIBE,
    nodeId,
    worldTick: 2,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 4096,
    materials: 4096,
  });
  return { knowledge, grimoire: outcome.grimoire, instance: outcome.instance };
}

describe('shelving and withdrawal', () => {
  it('rewrites the instance location and leaves the count alone', () => {
    const { knowledge, grimoire, instance } = written();
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);

    shelveGrimoire(knowledge, grimoire, LIBRARY);

    const shelved = knowledge.read(instance);
    expect(shelved.locationKind).toBe(LOCATION_KIND.library);
    expect(shelved.locationId).toBe(LIBRARY);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
    expect(readRecord(knowledge.state, GRIMOIRE, grimoire).holderKind).toBe(HOLDER_KIND.library);
    expect(readRecord(knowledge.state, GRIMOIRE, grimoire).holderId).toBe(LIBRARY);
  });

  it('reverses the rewrite on withdrawal', () => {
    const { knowledge, grimoire, instance } = written();
    shelveGrimoire(knowledge, grimoire, LIBRARY);
    withdrawGrimoire(knowledge, grimoire, SCRIBE);

    const back = knowledge.read(instance);
    expect(back.locationKind).toBe(LOCATION_KIND.grimoire);
    expect(back.locationId).toBe(grimoire);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
    expect(readRecord(knowledge.state, GRIMOIRE, grimoire).holderKind).toBe(HOLDER_KIND.mage);
  });

  it('never double-counts a shelved copy', () => {
    const { knowledge, grimoire } = written();
    shelveGrimoire(knowledge, grimoire, LIBRARY);

    knowledge.destroyInstancesHeldBy(SCRIBE, 5);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
    expect(knowledge.instancesAt(LOCATION_KIND.library, LIBRARY)).toHaveLength(1);
  });
});

describe('destroying written knowledge', () => {
  it('destroys the instance a shelved grimoire holds, and nothing else', () => {
    const { knowledge, grimoire, instance } = written();
    const other = written();
    void other;
    shelveGrimoire(knowledge, grimoire, LIBRARY);

    const mind = knowledge.instancesHeldBy(SCRIBE);
    const event = destroyGrimoire(knowledge, grimoire, 40);

    expect(event).toBeUndefined();
    expect(knowledge.isInstance(instance)).toBe(false);
    expect(knowledge.instancesHeldBy(SCRIBE)).toEqual(mind);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
  });

  it('reports the loss when the burned book was the last copy', () => {
    const { knowledge, grimoire } = written();
    knowledge.destroyInstancesHeldBy(SCRIBE, 3);
    shelveGrimoire(knowledge, grimoire, LIBRARY);

    const event = destroyGrimoire(knowledge, grimoire, 41);
    expect(event).toEqual({
      nodeId: ROOT_NODE,
      worldTick: 41,
      location: LOCATION_KIND.library,
    });
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  it('burns a whole library, naming the library location kind for each loss', () => {
    const { knowledge, grimoire } = written();
    const second = scribe({
      knowledge,
      catalog: testCatalog(),
      cells: testCells,
      ruleset: permissiveRuleset(),
      rng: stepRng(3, 2),
      scribe: SCRIBE,
      nodeId: ROOT_NODE,
      worldTick: 2,
      store: STANDARD_STORE,
      scribeAffinity: 1024,
      scribeCapacity: 4096,
      materials: 4096,
    });
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SCRIBE,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });
    shelveGrimoire(knowledge, grimoire, LIBRARY);
    shelveGrimoire(knowledge, second.grimoire, LIBRARY);
    knowledge.destroyInstancesHeldBy(SCRIBE, 6);

    const lost = destroyLibrary(knowledge, LIBRARY, 50);
    expect(lost).toEqual([
      { nodeId: ROOT_NODE, worldTick: 50, location: LOCATION_KIND.library },
    ]);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(knowledge.instancesAt(LOCATION_KIND.library, LIBRARY)).toHaveLength(0);
  });

  it('lists the grimoires a library holds, and refuses to shelve an empty book', () => {
    const { knowledge, grimoire } = written();
    expect(grimoiresIn(knowledge, LIBRARY)).toEqual([]);
    shelveGrimoire(knowledge, grimoire, LIBRARY);
    expect(grimoiresIn(knowledge, LIBRARY)).toEqual([grimoire]);

    const stray = knowledge.state.entities.create();
    expect(() => shelveGrimoire(knowledge, stray, LIBRARY)).toThrow(/associates no instance/u);
  });

  it('rebuilds the grimoire link for a shelved book after a reload', () => {
    const { knowledge, grimoire, instance } = written();
    shelveGrimoire(knowledge, grimoire, LIBRARY);

    const restored = KnowledgeSubsystem.fromState(knowledge.state, TEST_NODE_COUNT);
    expect(restored.instanceForGrimoire(grimoire)).toBe(instance);
    expect(destroyGrimoire(restored, grimoire, 60)).toBeUndefined();
    expect(restored.instanceCount(ROOT_NODE)).toBe(1);
  });
});
