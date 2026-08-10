/*
 * Multiverse Mages — the instance index, the ever-known record, and loss.
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

import { EVER_KNOWN, KNOWLEDGE_INSTANCE, LOCATION_KIND, collectRecords } from '@mm/state';

import { describeRefusal } from '../../src/instances/outcomes.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { CHILD_NODE, ROOT_NODE, TEST_NODE_COUNT, testWorld } from '../support/scenario.js';

function subsystem(): KnowledgeSubsystem {
  return new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
}

describe('the instance index', () => {
  it('counts instances per node and follows the last one out', () => {
    const knowledge = subsystem();
    expect(knowledge.exists(ROOT_NODE)).toBe(false);

    const first = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    const second = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 42,
      acquiredTick: 0,
      mastery: 512,
    });

    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
    expect(knowledge.destroyInstance(first, 10)).toBeUndefined();
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.destroyInstance(second, 11)).toBeDefined();
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  it('records no current-existence flag in state', () => {
    const knowledge = subsystem();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });

    // The only §1 components a created instance writes are the instance itself
    // and the persisted ever-known record. Existence is answerable only through
    // the index, per contracts.md §1.5.
    const instances = collectRecords(knowledge.state, KNOWLEDGE_INSTANCE);
    expect(instances).toHaveLength(1);
    expect(Object.keys(instances[0]?.row ?? {})).not.toContain('exists');
  });

  it('enumerates single-instance nodes for libraryDependence', () => {
    const knowledge = subsystem();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 42,
      acquiredTick: 0,
      mastery: 512,
    });

    expect(knowledge.singleInstanceNodes()).toEqual([ROOT_NODE]);
  });

  it('returns held instances in ascending slot order, never insertion order', () => {
    const knowledge = subsystem();
    const held = [41, 41, 42].map((locationId, index) =>
      knowledge.createInstance({
        nodeId: index === 2 ? ROOT_NODE : ROOT_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId,
        acquiredTick: 0,
        mastery: 512,
      }),
    );
    expect(knowledge.instancesHeldBy(41)).toEqual([held[0], held[1]]);
    expect(knowledge.instancesHeldBy(42)).toEqual([held[2]]);
  });
});

describe('the ever-known record', () => {
  it('is written on first instance creation and survives total loss', () => {
    const knowledge = subsystem();
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(false);

    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);

    knowledge.destroyInstance(instance, 12);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });

  it('writes exactly one record however many instances appear', () => {
    const knowledge = subsystem();
    for (const locationId of [41, 42, 43]) {
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId,
        acquiredTick: 0,
        mastery: 512,
      });
    }
    expect(collectRecords(knowledge.state, EVER_KNOWN)).toHaveLength(1);
  });

  it('is a component in state, so a snapshot carries it', () => {
    const knowledge = subsystem();
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    const rows = collectRecords(knowledge.state, EVER_KNOWN);
    expect(rows.map((entry) => entry.row.nodeId)).toEqual([CHILD_NODE]);
  });
});

describe('rebuilding from state', () => {
  it('recovers the index, the ever-known set, and the grimoire link', () => {
    const knowledge = subsystem();
    const grimoire = knowledge.state.entities.create();
    const written = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.grimoire,
      locationId: grimoire,
      acquiredTick: 3,
      mastery: 1024,
      grimoire,
    });
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 3,
      mastery: 512,
    });

    const restored = KnowledgeSubsystem.fromState(knowledge.state, TEST_NODE_COUNT);
    expect(restored.instanceCount(ROOT_NODE)).toBe(1);
    expect(restored.instanceCount(CHILD_NODE)).toBe(1);
    expect(restored.wasEverKnown(ROOT_NODE)).toBe(true);
    expect(restored.instanceForGrimoire(grimoire)).toBe(written);
  });
});

describe('the written-copy invariant', () => {
  it('refuses to create a written instance with no grimoire behind it', () => {
    const knowledge = subsystem();
    expect(() =>
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.grimoire,
        locationId: 7,
        acquiredTick: 0,
        mastery: 0,
      }),
    ).toThrow(/one instance per written copy/u);
  });

  it('refuses to put a book in a mind', () => {
    const knowledge = subsystem();
    const grimoire = knowledge.state.entities.create();
    expect(() =>
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId: 41,
        acquiredTick: 0,
        mastery: 0,
        grimoire,
      }),
    ).toThrow(/no grimoire/u);
  });
});

describe('refusal messages', () => {
  it('name what stopped the operation', () => {
    expect(describeRefusal({ reason: 'node-lost', nodeId: ROOT_NODE })).toContain(
      'no instance of node 1 survives',
    );
    expect(
      describeRefusal({ reason: 'forbidden-cell', nodeId: ROOT_NODE, cellId: 32 }),
    ).toContain('cell 32');
    expect(
      describeRefusal({
        reason: 'teacher-below-threshold',
        nodeId: ROOT_NODE,
        mastery: 100,
        threshold: 512,
      }),
    ).toContain('512');
  });
});

describe('loss events', () => {
  it('name the node, the world tick, and the location kind', () => {
    const knowledge = subsystem();
    const grimoire = knowledge.state.entities.create();
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.library,
      locationId: 90,
      acquiredTick: 1,
      mastery: 1024,
      grimoire,
    });

    const event = knowledge.destroyInstance(instance, 77);
    expect(event).toEqual({ nodeId: ROOT_NODE, worldTick: 77, location: LOCATION_KIND.library });
  });

  it('are not emitted while another instance survives', () => {
    const knowledge = subsystem();
    const handles = [41, 42, 43].map((locationId) =>
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId,
        acquiredTick: 0,
        mastery: 512,
      }),
    );

    expect(knowledge.destroyInstance(handles[0] as number, 5)).toBeUndefined();
    expect(knowledge.destroyInstance(handles[1] as number, 6)).toBeUndefined();
    expect(knowledge.destroyInstance(handles[2] as number, 7)).toBeDefined();
  });

  it('destroy every instance a holder carries, reporting each node it empties', () => {
    const knowledge = subsystem();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    });
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 42,
      acquiredTick: 0,
      mastery: 512,
    });

    const lost = knowledge.destroyInstancesHeldBy(41, 30);
    expect(lost.map((event) => event.nodeId)).toEqual([ROOT_NODE]);
    expect(knowledge.exists(CHILD_NODE)).toBe(true);
  });
});
