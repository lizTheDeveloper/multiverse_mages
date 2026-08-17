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
  disownGrimoire,
  grimoiresIn,
  shelveGrimoire,
  withdrawGrimoire,
} from '../../src/instances/location.js';
import { scribe } from '../../src/instances/scribing.js';
import { STANDARD_STORE } from '../support/store-hooks.js';
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

  it('releases a book to nobody without destroying it', () => {
    // `contracts.md` §1.5's state for a dead unaffiliated mage's books. The
    // holder goes to `unowned` — which is `0`, so that a zeroed row means this
    // and not "held by mage 0" — and the contents come back to the book itself,
    // because an unowned book is an unshelved one. Nothing is lost: the node
    // still has both copies, and burning it still takes a fire.
    const { knowledge, grimoire, instance } = written();
    shelveGrimoire(knowledge, grimoire, LIBRARY);

    disownGrimoire(knowledge, grimoire);

    const record = readRecord(knowledge.state, GRIMOIRE, grimoire);
    expect(record.holderKind).toBe(HOLDER_KIND.unowned);
    expect(record.holderKind).not.toBe(HOLDER_KIND.inTransit);
    expect(record.holderId).toBe(0);

    const loose = knowledge.read(instance);
    expect(loose.locationKind).toBe(LOCATION_KIND.grimoire);
    expect(loose.locationId).toBe(grimoire);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
    // And it is off the shelf it was on, rather than on two at once.
    expect(knowledge.instancesAt(LOCATION_KIND.library, LIBRARY)).toHaveLength(0);
  });

  it('keeps an unowned book destroyable, and its link across a reload', () => {
    const { knowledge, grimoire, instance } = written();
    disownGrimoire(knowledge, grimoire);

    const restored = KnowledgeSubsystem.fromState(knowledge.state, TEST_NODE_COUNT);
    expect(restored.instanceForGrimoire(grimoire)).toBe(instance);
    expect(destroyGrimoire(restored, grimoire, 70)).toBeUndefined();
    expect(restored.instanceCount(ROOT_NODE)).toBe(1);
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

  it('pairs a shelf of duplicates one book to one instance across a reload', () => {
    // The case the reload's pairing pass is bucketed for. A real universe shelves
    // hundreds of copies of a handful of nodes in one library — which is what the
    // reference run does — so this is the ordinary shape, not a corner. The pass
    // may swap two copies of one node in one library (the `rebuild` note says
    // so and says why it is unobservable), but it must never hand two books the
    // same instance or leave one holding nothing: the first makes a burn destroy
    // a row twice, the second makes it throw.
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SCRIBE,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });
    const copies = 8;
    const books: number[] = [];
    for (let index = 0; index < copies; index += 1) {
      const outcome = scribe({
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
        holderKind: HOLDER_KIND.library,
        holderId: LIBRARY,
      });
      books.push(outcome.grimoire);
    }

    const restored = KnowledgeSubsystem.fromState(knowledge.state, TEST_NODE_COUNT);
    const paired = books.map((book) => restored.instanceForGrimoire(book));
    expect(paired).toHaveLength(copies);
    expect(paired.every((instance) => instance !== 0)).toBe(true);
    expect(new Set(paired).size).toBe(copies);

    // And every one of them burns, which is the property the pairing exists for.
    for (const book of books) destroyGrimoire(restored, book, 61);
    expect(restored.instancesAt(LOCATION_KIND.library, LIBRARY)).toHaveLength(0);
    expect(restored.instanceCount(ROOT_NODE)).toBe(1);
  });
});
