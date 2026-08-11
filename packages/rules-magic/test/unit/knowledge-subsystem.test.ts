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

import {
  ENGAGEMENT_COMPONENTS,
  EVER_KNOWN,
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  WORLD_COMPONENTS,
  attachRecord,
  collectRecords,
} from '@mm/state';

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

  it('reports the node as existing again the moment an instance returns', () => {
    // `knowledge-instances`: *"Existence returns when an instance returns"*. The
    // index is a count, so this ought to be free — but the ever-known record is
    // written on first creation and never cleared, and an implementation that
    // answered existence from it, or that latched a "lost" state to avoid
    // re-emitting a loss event, would pass every assertion above and fail here.
    const knowledge = subsystem();
    const grant = {
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 41,
      acquiredTick: 0,
      mastery: 512,
    };

    const first = knowledge.createInstance(grant);
    expect(knowledge.destroyInstance(first, 11)).toBeDefined();
    expect(knowledge.exists(ROOT_NODE)).toBe(false);

    knowledge.createInstance({ ...grant, locationId: 42, acquiredTick: 12 });
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
    // The node came back; that it was once lost did not.
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
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
    //
    // This is the *runtime* half, and on its own it saw almost nothing: one
    // row of one component, matched against one literal string. The schema
    // scan below is the half that covers the rest.
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

/**
 * `contracts.md` §1.5: current existence is derived, and **nothing may cache it
 * in state**.
 *
 * ## Why a schema scan and not a row inspection
 *
 * The check that used to stand alone read one `KNOWLEDGE_INSTANCE` row's keys
 * and asserted the literal string `'exists'` was not among them. That catches
 * exactly one spelling of the mistake, on exactly one component. A per-node
 * boolean named `known`, `present` or `alive`, or one added to `UNIVERSE`
 * instead, walked past it in silence — and the whole reason §1.5 forbids the
 * cache is that a cached flag is *serialized*, so any disagreement with the
 * instances it was derived from is persisted, restored, and carried forward
 * forever. The place to catch that is the schema, before a row exists.
 *
 * ## Two rules, because the mistake has two shapes
 *
 * **A flag on a node-bearing component.** `KNOWLEDGE_INSTANCE`, `GRIMOIRE`,
 * `EVER_KNOWN` and `PREPARED_SPELL` all carry a `nodeId`, and a boolean beside
 * it saying whether the node is *currently* here is the cache §1.5 names. This
 * rule is scoped to node-bearing components on purpose: `MAGE.alive` is a
 * legitimate field about a mage, and a check that failed on it would be deleted
 * within a week.
 *
 * **A node-existence field anywhere.** `UNIVERSE.nodesKnown`, a `knownNodes`
 * bitmask on a university, a `nodeExists` byte on anything: a name pairing a
 * node word with an existence word is the same cache wearing a different hat,
 * and it does not need a `nodeId` beside it to be one.
 *
 * Neither rule can see a cache smuggled in under an innocuous name — a
 * conformance check catches drift, not an adversary. What it does catch is the
 * shape the mistake is actually written in.
 */

/** Words that assert a thing is here *now*. Forbidden beside a `nodeId`. */
const EXISTENCE_WORDS = [
  'exists',
  'existing',
  'extant',
  'known',
  'isknown',
  'present',
  'alive',
  'live',
  'current',
  'discovered',
  'remembered',
  'surviving',
];

/** Words that mean the subject is a knowledge node. */
const NODE_WORDS = ['node'];

interface ScannedComponent {
  readonly name: string;
  readonly fields: Readonly<Record<string, string>>;
}

/**
 * Component fields that cache current node existence.
 *
 * Exported shape kept simple — `component.field` strings — so a failure names
 * the thing to delete rather than describing it.
 */
export function cachedExistenceFields(components: readonly ScannedComponent[]): string[] {
  const found: string[] = [];
  for (const spec of components) {
    const fields = Object.keys(spec.fields);
    const carriesNode = fields.some((field) => NODE_WORDS.includes(field.toLowerCase()) || field === 'nodeId');
    for (const field of fields) {
      const lowered = field.toLowerCase();
      const existence = EXISTENCE_WORDS.includes(lowered);
      const compound =
        NODE_WORDS.some((word) => lowered.includes(word)) &&
        EXISTENCE_WORDS.some((word) => lowered.includes(word));
      if ((carriesNode && existence) || compound) found.push(`${spec.name}.${field}`);
    }
  }
  return found.sort();
}

describe('no component caches current node existence', () => {
  const ALL_COMPONENTS = [...WORLD_COMPONENTS, ...ENGAGEMENT_COMPONENTS];

  it('scans every world and engagement component, not one row of one of them', () => {
    // "No offenders" and "the scanner read nothing" are the same green run
    // otherwise, and the components it most needs in view are the ones that
    // carry a node.
    expect(ALL_COMPONENTS.length).toBeGreaterThan(10);
    const carryingNode = ALL_COMPONENTS.filter((spec) =>
      Object.keys(spec.fields).includes('nodeId'),
    ).map((spec) => spec.name);
    expect(carryingNode).toEqual(
      expect.arrayContaining(['grimoire', 'knowledge-instance', 'ever-known', 'prepared-spell']),
    );
  });

  it('finds no cached existence flag in the schema', () => {
    expect(
      cachedExistenceFields(ALL_COMPONENTS),
      'contracts.md §1.5: current node existence is derived from the surviving instances and ' +
        'nothing may cache it in state. A cached flag is serialized, so a disagreement with the ' +
        'instances is persisted and restored rather than recomputed. Ask the subsystem index.',
    ).toEqual([]);
  });

  it('would catch a flag beside a nodeId, whatever it is called', () => {
    for (const field of ['exists', 'known', 'present', 'alive', 'extant', 'discovered']) {
      expect(
        cachedExistenceFields([{ name: 'probe', fields: { nodeId: 'u16', [field]: 'u8' } }]),
        field,
      ).toEqual([`probe.${field}`]);
    }
  });

  it('would catch a node-existence field on a component carrying no nodeId', () => {
    // The `UNIVERSE.nodesKnown` shape — the cache one level up, which the
    // per-row inspection could never have seen.
    expect(cachedExistenceFields([{ name: 'universe', fields: { nodesKnown: 'i32' } }])).toEqual([
      'universe.nodesKnown',
    ]);
    expect(cachedExistenceFields([{ name: 'university', fields: { knownNodes: 'i32' } }])).toEqual([
      'university.knownNodes',
    ]);
  });

  it('permits the fields that are legitimately about something else', () => {
    // `MAGE.alive` is the control that matters: a mage's liveness is a fact
    // about a mage, and a check that rejected it would be relaxed until it
    // meant nothing. `EVER_KNOWN` is the other one — §1.5 requires that
    // component to exist, and it is *not* current existence.
    expect(cachedExistenceFields([{ name: 'mage', fields: { speciesId: 'u16', alive: 'u8' } }])).toEqual(
      [],
    );
    expect(cachedExistenceFields([{ name: 'ever-known', fields: { nodeId: 'u16' } }])).toEqual([]);
    expect(
      cachedExistenceFields([{ name: 'probe', fields: { nodeId: 'u16', acquiredTick: 'i32' } }]),
    ).toEqual([]);
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

  /**
   * The half of §1.5 that has no schema to enforce it: a grimoire's holder and
   * its instance's location are two fields that must say the same thing, and
   * nothing in the component layout notices when they do not.
   */
  it('refuses a written instance whose location disagrees with its book’s holder', () => {
    const knowledge = subsystem();
    const grimoire = knowledge.state.entities.create();
    attachRecord(knowledge.state, GRIMOIRE, grimoire, {
      nodeId: ROOT_NODE,
      durability: 1024,
      holderKind: HOLDER_KIND.library,
      holderId: 900,
    });

    expect(() =>
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.grimoire,
        locationId: grimoire,
        acquiredTick: 0,
        mastery: 0,
        grimoire,
      }),
    ).toThrow(/a shelf the library cannot see/u);

    // And the location the holder does name is accepted.
    expect(
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.library,
        locationId: 900,
        acquiredTick: 0,
        mastery: 0,
        grimoire,
      }),
    ).toBeGreaterThan(0);
  });

  it('destroys the book when its contents are destroyed', () => {
    const knowledge = subsystem();
    const grimoire = knowledge.state.entities.create();
    attachRecord(knowledge.state, GRIMOIRE, grimoire, {
      nodeId: ROOT_NODE,
      durability: 1024,
      holderKind: HOLDER_KIND.mage,
      holderId: 41,
    });
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.grimoire,
      locationId: grimoire,
      acquiredTick: 0,
      mastery: 0,
      grimoire,
    });

    knowledge.destroyInstance(instance, 12);
    expect(collectRecords(knowledge.state, GRIMOIRE)).toEqual([]);
    expect(knowledge.instanceForGrimoire(grimoire)).toBe(0);
  });

  /**
   * The load-path repair, exercised directly because no operation in this
   * package can still produce its input: a grimoire row that outlived its
   * instance. Left alone it would be matched against the *next* book's instance
   * on the same shelf, since state says nothing that tells the two apart.
   */
  it('discards a grimoire left without contents when the world is reloaded', () => {
    const knowledge = subsystem();
    const contentless = knowledge.state.entities.create();
    attachRecord(knowledge.state, GRIMOIRE, contentless, {
      nodeId: ROOT_NODE,
      durability: 1024,
      holderKind: HOLDER_KIND.library,
      holderId: 900,
    });
    const shelved = knowledge.state.entities.create();
    attachRecord(knowledge.state, GRIMOIRE, shelved, {
      nodeId: ROOT_NODE,
      durability: 1024,
      holderKind: HOLDER_KIND.library,
      holderId: 900,
    });
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.library,
      locationId: 900,
      acquiredTick: 5,
      mastery: 0,
      grimoire: shelved,
    });

    const restored = KnowledgeSubsystem.fromState(knowledge.state, TEST_NODE_COUNT);

    // One book, one instance, and the book can be burned — which is the whole
    // of it. Which of the two identical rows survived is not recoverable from
    // state and is not asserted; that they cannot both survive is.
    expect(collectRecords(restored.state, GRIMOIRE)).toHaveLength(1);
    const survivor = collectRecords(restored.state, GRIMOIRE)[0]?.handle as number;
    expect(restored.instanceForGrimoire(survivor)).toBe(instance);
    expect(restored.instanceCount(ROOT_NODE)).toBe(1);
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
