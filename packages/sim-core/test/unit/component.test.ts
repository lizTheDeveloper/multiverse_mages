/*
 * Multiverse Mages — component registration and storage tests.
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

import { EntityStore, NO_ROW, StaleHandleError, handleIndex } from '@mm/sim-core';
import type { EntityHandle } from '@mm/sim-core';

/** contracts.md §1.2 — mages are individuals. */
const MAGE = {
  name: 'mage',
  fields: {
    speciesId: 'u16',
    birthTick: 'i32',
    roleId: 'u8',
    universityId: 'u32',
    curiosity: 'i32',
  },
} as const;

/** contracts.md §1.3 — everyone else is a counted cohort. */
const COHORT = {
  name: 'populaceCohort',
  fields: {
    speciesId: 'u16',
    occupation: 'u8',
    count: 'u32',
    birthTickBucket: 'i32',
  },
} as const;

/** contracts.md §0/§1.6 — only engagement entities have coordinates. */
const POSITION = {
  name: 'position',
  fields: { x: 'i32', y: 'i32' },
} as const;

describe('component registration', () => {
  it('registers components generically over fields the game does not have yet', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const cohort = store.registerComponent(COHORT);

    expect(mage.name).toBe('mage');
    expect(mage.fieldNames).toEqual([
      'speciesId',
      'birthTick',
      'roleId',
      'universityId',
      'curiosity',
    ]);
    expect(store.components.map((component) => component.name)).toEqual(['mage', 'populaceCohort']);
    expect(cohort.size).toBe(0);
  });

  it('rejects a duplicate component name', () => {
    const store = new EntityStore();
    store.registerComponent(MAGE);
    expect(() => store.registerComponent(MAGE)).toThrow(/already registered/);
  });

  it('backs each field with the integer typed array its kind names', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const handle = store.create();
    mage.add(handle);

    expect(mage.field('speciesId')).toBeInstanceOf(Uint16Array);
    expect(mage.field('birthTick')).toBeInstanceOf(Int32Array);
    expect(mage.field('roleId')).toBeInstanceOf(Uint8Array);
    expect(mage.field('universityId')).toBeInstanceOf(Uint32Array);
  });

  it('rejects a non-integer field value, so a float cannot leak into state', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const handle = store.create();
    mage.add(handle);
    expect(() => mage.set(handle, 'curiosity', 0.5)).toThrow(TypeError);
    // Fixed-point values are ordinary integers at scale 1/1024.
    mage.set(handle, 'curiosity', 512);
    expect(mage.get(handle, 'curiosity')).toBe(512);
  });
});

describe('component storage is sparse', () => {
  it('costs nothing for a component no entity carries', () => {
    // The memory contract from contracts.md §0: world-scale entities have no
    // coordinates. Registering `position` on the world store must not allocate
    // two int32 per mage per Monte Carlo run.
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const position = store.registerComponent(POSITION);

    for (let i = 0; i < 1000; i += 1) {
      mage.add(store.create());
    }

    expect(mage.size).toBe(1000);
    expect(position.size).toBe(0);
    expect(position.rowCapacity).toBe(0);
    expect(position.byteLength).toBe(0);
  });

  it('sizes a component to the entities that carry it, not to the store', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const position = store.registerComponent(POSITION);

    const handles: EntityHandle[] = [];
    for (let i = 0; i < 256; i += 1) {
      const handle = store.create();
      mage.add(handle);
      handles.push(handle);
    }
    // Only a handful are ever engaged in a raid.
    for (let i = 0; i < 4; i += 1) {
      position.add(handles[i * 10] as EntityHandle);
    }

    expect(position.size).toBe(4);
    expect(position.rowCapacity).toBeLessThan(store.liveCount);
    expect(position.has(handles[0] as EntityHandle)).toBe(true);
    expect(position.has(handles[1] as EntityHandle)).toBe(false);
    expect(position.tryRowOf(handles[1] as EntityHandle)).toBe(NO_ROW);
    expect(() => position.rowOf(handles[1] as EntityHandle)).toThrow(/position/);
  });

  it('lets mages and aggregate cohorts share one store', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const cohort = store.registerComponent(COHORT);

    const mages: EntityHandle[] = [];
    const cohorts: EntityHandle[] = [];
    for (let i = 0; i < 6; i += 1) {
      // Interleaved, so cohorts and mages are not contiguous in slot order.
      const mageHandle = store.create();
      mage.add(mageHandle);
      mage.set(mageHandle, 'speciesId', i + 1);
      mages.push(mageHandle);

      const cohortHandle = store.create();
      cohort.add(cohortHandle);
      cohort.set(cohortHandle, 'count', 1000 * (i + 1));
      cohort.set(cohortHandle, 'birthTickBucket', -120 * (i + 1));
      cohorts.push(cohortHandle);
    }

    expect(store.liveCount).toBe(12);
    expect(mage.size).toBe(6);
    expect(cohort.size).toBe(6);

    let population = 0;
    cohort.forEach((row, handle) => {
      expect(cohort.has(handle)).toBe(true);
      expect(mage.has(handle)).toBe(false);
      population += cohort.field('count')[row] as number;
    });
    expect(population).toBe(1000 + 2000 + 3000 + 4000 + 5000 + 6000);

    for (const [i, handle] of cohorts.entries()) {
      expect(cohort.get(handle, 'birthTickBucket')).toBe(-120 * (i + 1));
    }
    for (const [i, handle] of mages.entries()) {
      expect(mage.get(handle, 'speciesId')).toBe(i + 1);
    }
  });
});

describe('component iteration', () => {
  it('visits rows in ascending slot order regardless of the order they were added', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);

    const handles: EntityHandle[] = [];
    for (let i = 0; i < 6; i += 1) {
      handles.push(store.create());
    }
    // Add out of slot order on purpose.
    for (const i of [4, 0, 5, 2]) {
      mage.add(handles[i] as EntityHandle);
    }

    const slots: number[] = [];
    mage.forEach((_row, _handle, slot) => {
      slots.push(slot);
    });
    expect(slots).toEqual([0, 2, 4, 5]);
    expect(Array.from(mage.slots())).toEqual([0, 2, 4, 5]);
  });

  it('stays in index order after entities are destroyed and slots are reused', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);

    const handles: EntityHandle[] = [];
    for (let i = 0; i < 12; i += 1) {
      const handle = store.create();
      mage.add(handle);
      mage.set(handle, 'birthTick', i);
      handles.push(handle);
    }
    for (const i of [2, 7, 3, 10]) {
      store.destroy(handles[i] as EntityHandle);
    }
    // These land in freed slots, newest-freed first: 10, 3, 7, 2.
    const reused: EntityHandle[] = [];
    for (let i = 0; i < 4; i += 1) {
      const handle = store.create();
      mage.add(handle);
      mage.set(handle, 'birthTick', 100 + i);
      reused.push(handle);
    }
    expect(reused.map((handle) => handleIndex(handle))).toEqual([10, 3, 7, 2]);

    const visited: number[] = [];
    const births: number[] = [];
    mage.forEach((row, handle, slot) => {
      visited.push(slot);
      expect(store.slotOf(handle)).toBe(slot);
      births.push(mage.field('birthTick')[row] as number);
    });

    expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // Index order, not creation order: the reused slots carry the new values in
    // the position of the slot, not the position they were created in.
    expect(births).toEqual([0, 1, 103, 101, 4, 5, 6, 102, 8, 9, 100, 11]);
  });

  it('keeps every surviving entity’s data intact through row compaction', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);

    const handles: EntityHandle[] = [];
    for (let i = 0; i < 40; i += 1) {
      const handle = store.create();
      mage.add(handle);
      mage.set(handle, 'birthTick', -1000 - i);
      mage.set(handle, 'speciesId', i + 1);
      handles.push(handle);
    }

    const destroyed = new Set<number>();
    for (let i = 3; i < 40; i += 4) {
      store.destroy(handles[i] as EntityHandle);
      destroyed.add(i);
    }
    // Detaching without destroying must compact the same way.
    for (let i = 1; i < 40; i += 8) {
      if (!destroyed.has(i)) {
        expect(mage.remove(handles[i] as EntityHandle)).toBe(true);
        destroyed.add(i);
      }
    }

    expect(mage.size).toBe(40 - destroyed.size);
    for (const [i, handle] of handles.entries()) {
      if (destroyed.has(i)) {
        expect(mage.has(handle)).toBe(false);
      } else {
        expect(mage.get(handle, 'birthTick')).toBe(-1000 - i);
        expect(mage.get(handle, 'speciesId')).toBe(i + 1);
      }
    }
  });
});

describe('component handle validation', () => {
  it('never reports a stale handle as carrying the new occupant’s component', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);

    const original = store.create();
    mage.add(original);
    mage.set(original, 'speciesId', 7);
    store.destroy(original);

    const reused = store.create();
    expect(handleIndex(reused)).toBe(handleIndex(original));
    mage.add(reused);
    mage.set(reused, 'speciesId', 9);

    expect(mage.has(original)).toBe(false);
    expect(mage.tryRowOf(original)).toBe(NO_ROW);
    expect(() => mage.rowOf(original)).toThrow(StaleHandleError);
    expect(() => mage.get(original, 'speciesId')).toThrow(StaleHandleError);
    expect(() => mage.set(original, 'speciesId', 1)).toThrow(StaleHandleError);
    expect(() => mage.add(original)).toThrow(StaleHandleError);
    expect(mage.remove(original)).toBe(false);

    // The new occupant is untouched by any of it.
    expect(mage.get(reused, 'speciesId')).toBe(9);
  });

  it('detaches components when the entity is destroyed, so a reused slot starts clean', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const position = store.registerComponent(POSITION);

    const first = store.create();
    mage.add(first);
    mage.set(first, 'speciesId', 5);
    position.add(first);
    position.set(first, 'x', 2048);
    expect(mage.size).toBe(1);
    expect(position.size).toBe(1);

    store.destroy(first);
    expect(mage.size).toBe(0);
    expect(position.size).toBe(0);

    const second = store.create();
    expect(handleIndex(second)).toBe(handleIndex(first));
    expect(mage.has(second)).toBe(false);
    expect(position.has(second)).toBe(false);

    // A re-added row must not inherit the previous occupant's values.
    mage.add(second);
    expect(mage.get(second, 'speciesId')).toBe(0);
  });

  it('treats add on an entity that already has the component as idempotent', () => {
    const store = new EntityStore();
    const mage = store.registerComponent(MAGE);
    const handle = store.create();
    const row = mage.add(handle);
    mage.set(handle, 'speciesId', 3);
    expect(mage.add(handle)).toBe(row);
    expect(mage.size).toBe(1);
    expect(mage.get(handle, 'speciesId')).toBe(3);
  });
});
