/*
 * Multiverse Mages — the world state schema of contracts.md §1.
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
 * The `state-schema` scenarios that are about the schema itself: the snapshot
 * round-trip, the ban on world-scale coordinates, and the populace being
 * aggregated rather than individual.
 */

import { describe, expect, it } from 'vitest';

import type { ComponentFields, ComponentSpec } from '@mm/sim-core';
import { deserializeState, serializeState, snapshotHash } from '@mm/sim-core';
import {
  COMBATANT,
  ENGAGEMENT_COMPONENTS,
  MAGE,
  OBJECTIVE,
  POPULACE_COHORT,
  POSITION_FIELD_NAMES,
  WORLD_COMPONENTS,
  assertNoWorldPositions,
  componentOf,
  defineWorldStateSchema,
  readRecord,
  worldComponentsWithPosition,
} from '@mm/state';

import { populatedWorld } from './fixtures.js';

describe('state round-trips through a snapshot', () => {
  it('restores a state carrying every component to the same snapshot hash', () => {
    const { state } = populatedWorld();

    const bytes = serializeState(state);
    const restored = deserializeState(bytes, defineWorldStateSchema());

    expect(snapshotHash(restored)).toBe(snapshotHash(state));
    expect(Array.from(serializeState(restored))).toEqual(Array.from(bytes));
  });

  it('restores every field value, not merely a hash that happens to match', () => {
    // A hash comparison alone would pass if both sides serialized nothing at
    // all. This reads a row back out to prove there was something in there.
    const { state, mage, university } = populatedWorld();
    const restored = deserializeState(serializeState(state), defineWorldStateSchema());

    expect(readRecord(restored, MAGE, mage)).toEqual(readRecord(state, MAGE, mage));
    expect(readRecord(restored, MAGE, mage).universityId).toBe(university);
    expect(restored.contentRevision).toBe(state.contentRevision);
  });
});

describe('world-scale entities carry no coordinates', () => {
  it('declares no positional field on any world component', () => {
    expect(worldComponentsWithPosition()).toEqual([]);
    expect(() => {
      assertNoWorldPositions();
    }).not.toThrow();
  });

  it('rejects a world schema that gives a world entity a position', () => {
    // The control: without it, the assertion above would also pass if
    // `worldComponentsWithPosition` looked at the wrong field names.
    const positioned: ComponentSpec<ComponentFields> = {
      name: 'mage-with-a-position',
      fields: { x: 'i32', y: 'i32' },
    };
    expect(worldComponentsWithPosition([...WORLD_COMPONENTS, positioned])).toEqual([
      { component: 'mage-with-a-position', field: 'x' },
      { component: 'mage-with-a-position', field: 'y' },
    ]);
    expect(() => {
      assertNoWorldPositions([...WORLD_COMPONENTS, positioned]);
    }).toThrow(/must not carry coordinates/);
  });

  it('gives a mage no way to hold a coordinate at all', () => {
    const { state, mage } = populatedWorld();
    const store = componentOf(state, MAGE);
    for (const field of POSITION_FIELD_NAMES) {
      expect(store.fieldNames as readonly string[]).not.toContain(field);
      expect(() => {
        store.set(mage, field as never, 0);
      }).toThrow(/has no field/);
    }
  });

  it('positions engagement combatants and objectives in fixed-point metres', () => {
    for (const spec of [COMBATANT, OBJECTIVE]) {
      for (const field of POSITION_FIELD_NAMES) {
        expect(Object.keys(spec.fields)).toContain(field);
        expect((spec.fields as Record<string, string>)[field]).toBe('i32');
      }
    }
    expect(ENGAGEMENT_COMPONENTS.map((spec) => spec.name)).toContain('combatant');
  });
});

describe('populace is aggregated and mages are individual', () => {
  it('holds ten thousand laborers as one cohort with a count', () => {
    const { state, cohort } = populatedWorld();

    expect(componentOf(state, POPULACE_COHORT).size).toBe(1);
    expect(readRecord(state, POPULACE_COHORT, cohort).count).toBe(10_000);
  });

  it('gives a cohort no way to be an individual, and a mage no way to be a cohort', () => {
    // The structural version of "no capability may promote populace to
    // individual entities": a cohort has no personality or vigor to roll, and a
    // mage has no occupation or count to aggregate. Neither layout can stand in
    // for the other by accident.
    const cohortFields = Object.keys(POPULACE_COHORT.fields);
    const mageFields = Object.keys(MAGE.fields);

    expect(cohortFields).toContain('count');
    expect(cohortFields).not.toContain('vigor');
    expect(cohortFields).not.toContain('curiosity');
    expect(mageFields).not.toContain('count');
    expect(mageFields).not.toContain('occupation');
  });
});

describe('the world schema is stable in the way the snapshot format needs', () => {
  it('declares each component exactly once, in a fixed order', () => {
    const names = WORLD_COMPONENTS.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    // Pinned, because component order is the order sections appear in a
    // snapshot: reordering this list changes every serialized byte and
    // therefore every committed golden fixture. Appending is free; reordering
    // is a format change.
    expect(names).toEqual([
      'universe',
      'edict',
      'encouraged-cell',
      'axis-change-counter',
      'mage',
      'populace-cohort',
      'university',
      'university-staff',
      'library',
      'grimoire',
      'knowledge-instance',
      'ever-known',
      // Appended by `mages-and-species`, in the order the two decisions were
      // made. Each is last when it lands, so that a world snapshot written
      // before it existed lines its sections up against the layouts they were
      // written from, and each migration has only to append.
      'goal-commitment',
      'effort-progress',
      // Appended by `god-agency`, together, as world-schema revision 4. They
      // arrive as a group because no build has ever carried a proper subset of
      // them, so there is no snapshot a finer-grained walk could describe.
      'god-state',
      'blessing',
      'upheaval',
      'era-evaluation',
    ]);
  });

  it('shares no component name between the world and engagement scales', () => {
    const world = new Set<string>(WORLD_COMPONENTS.map((spec) => spec.name));
    for (const spec of ENGAGEMENT_COMPONENTS) {
      expect(world.has(spec.name)).toBe(false);
    }
  });
});
