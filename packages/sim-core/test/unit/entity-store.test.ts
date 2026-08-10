/*
 * Multiverse Mages — entity store allocation, free list, and iteration tests.
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
  EntityStore,
  MAX_ENTITY_GENERATION,
  NO_SLOT,
  NULL_ENTITY,
  StaleHandleError,
  handleGeneration,
  handleIndex,
  makeHandle,
} from '@mm/sim-core';
import type { EntityHandle } from '@mm/sim-core';

/**
 * A create/destroy script expressed against positions in the issue order, so
 * the same script can be replayed against any number of independently
 * constructed stores. `['create']` allocates; `['destroy', n]` destroys the
 * entity issued by the n-th create.
 */
type ScriptStep = readonly ['create'] | readonly ['destroy', number];

const CHURN_SCRIPT: readonly ScriptStep[] = [
  ['create'],
  ['create'],
  ['create'],
  ['destroy', 1],
  ['destroy', 0],
  ['create'],
  ['create'],
  ['create'],
  ['destroy', 2],
  ['destroy', 5],
  ['create'],
  ['create'],
];

const runScript = (store: EntityStore, script: readonly ScriptStep[]): EntityHandle[] => {
  const issued: EntityHandle[] = [];
  for (const step of script) {
    if (step[0] === 'create') {
      issued.push(store.create());
    } else {
      const target = issued[step[1]];
      expect(target).toBeDefined();
      store.destroy(target as EntityHandle);
    }
  }
  return issued;
};

describe('EntityStore allocation', () => {
  it('never issues the reserved null handle', () => {
    const store = new EntityStore();
    // Slot 0 at generation 1 is the pairing that would collide with 0 if
    // generations started at 0.
    const first = store.create();
    expect(first).not.toBe(NULL_ENTITY);
    expect(handleIndex(first)).toBe(0);
    expect(handleGeneration(first)).toBe(1);

    expect(store.isAlive(NULL_ENTITY)).toBe(false);
    expect(store.isStale(NULL_ENTITY)).toBe(false);
    expect(store.destroy(NULL_ENTITY)).toBe(false);
    expect(store.trySlotOf(NULL_ENTITY)).toBe(NO_SLOT);
    expect(() => store.slotOf(NULL_ENTITY)).toThrow(StaleHandleError);
  });

  it('assigns fresh slots in ascending order', () => {
    const store = new EntityStore();
    for (let expected = 0; expected < 8; expected += 1) {
      expect(handleIndex(store.create())).toBe(expected);
    }
    expect(store.liveCount).toBe(8);
    expect(store.slotCount).toBe(8);
  });

  it('reuses freed slots from the free list, most recently freed first', () => {
    const store = new EntityStore();
    const a = store.create();
    const b = store.create();
    const c = store.create();

    expect(store.destroy(a)).toBe(true);
    expect(store.destroy(c)).toBe(true);

    // LIFO: c's slot (2) comes back before a's slot (0).
    expect(handleIndex(store.create())).toBe(2);
    expect(handleIndex(store.create())).toBe(0);
    // Free list exhausted; the next allocation extends the store.
    expect(handleIndex(store.create())).toBe(3);
    expect(handleIndex(b)).toBe(1);
  });

  it('bumps the generation of a reused slot so old and new handles differ', () => {
    const store = new EntityStore();
    const first = store.create();
    store.destroy(first);
    const second = store.create();

    expect(handleIndex(second)).toBe(handleIndex(first));
    expect(handleGeneration(second)).toBe(handleGeneration(first) + 1);
    expect(second).not.toBe(first);
  });

  it('refuses to allocate beyond the configured slot ceiling', () => {
    const store = new EntityStore({ maxSlots: 3 });
    const a = store.create();
    store.create();
    store.create();
    expect(() => store.create()).toThrow(RangeError);

    // Freeing makes room again, without changing the ceiling.
    store.destroy(a);
    expect(handleIndex(store.create())).toBe(0);
    expect(() => store.create()).toThrow(RangeError);
  });
});

describe('EntityStore allocation is reproducible', () => {
  it('assigns identical identifiers and generations across two runs of one script', () => {
    const first = runScript(new EntityStore(), CHURN_SCRIPT);
    const second = runScript(new EntityStore(), CHURN_SCRIPT);
    expect(second).toEqual(first);
  });

  it('matches a committed known-answer vector, so a policy change is a visible diff', () => {
    // Derived by hand from the documented policy: fresh slots ascend from 0 at
    // generation 1; freed slots return LIFO; a slot's generation is bumped when
    // it is freed. A change to any of those three shows up here as a diff, not
    // as a silent desync months later.
    const expected: readonly number[] = [
      makeHandle(0, 1),
      makeHandle(1, 1),
      makeHandle(2, 1),
      makeHandle(0, 2),
      makeHandle(1, 2),
      makeHandle(3, 1),
      makeHandle(3, 2),
      makeHandle(2, 2),
    ];
    expect(runScript(new EntityStore(), CHURN_SCRIPT)).toEqual(expected);
  });

  it('assigns the same identifiers regardless of initial capacity', () => {
    // Capacity is an allocation detail. If it leaked into slot assignment, two
    // peers that sized their stores differently would desync on entity IDs.
    const tight = runScript(new EntityStore({ initialCapacity: 1 }), CHURN_SCRIPT);
    const roomy = runScript(new EntityStore({ initialCapacity: 4096 }), CHURN_SCRIPT);
    expect(roomy).toEqual(tight);
  });

  it('assigns the same identifiers under a long randomised-looking churn', () => {
    // A deterministic pseudo-shuffle: no PRNG dependency, but enough
    // interleaving that an ordering bug in the free list would show.
    const script: ScriptStep[] = [];
    let created = 0;
    for (let i = 0; i < 400; i += 1) {
      if (created > 3 && (i * 7 + 3) % 5 < 2) {
        script.push(['destroy', (i * 13 + 5) % created]);
      } else {
        script.push(['create']);
        created += 1;
      }
    }
    const first = runScript(new EntityStore({ initialCapacity: 2 }), script);
    const second = runScript(new EntityStore({ initialCapacity: 512 }), script);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe('EntityStore stale handle detection', () => {
  it('reports a handle whose slot has been reused as stale, not as the new occupant', () => {
    const store = new EntityStore();
    const original = store.create();
    const slot = store.slotOf(original);
    store.destroy(original);
    const reused = store.create();

    expect(handleIndex(reused)).toBe(slot);
    expect(store.isAlive(reused)).toBe(true);
    expect(store.slotOf(reused)).toBe(slot);

    expect(store.isAlive(original)).toBe(false);
    expect(store.isStale(original)).toBe(true);
    expect(store.trySlotOf(original)).toBe(NO_SLOT);
    expect(() => store.slotOf(original)).toThrow(StaleHandleError);

    try {
      store.slotOf(original);
      expect.unreachable('slotOf should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StaleHandleError);
      const stale = error as StaleHandleError;
      expect(stale.handle).toBe(original);
      expect(stale.index).toBe(slot);
      expect(stale.generation).toBe(handleGeneration(original));
      expect(stale.slotGeneration).toBe(handleGeneration(reused));
    }
  });

  it('reports a handle to a freed but not yet reused slot as stale', () => {
    const store = new EntityStore();
    const handle = store.create();
    store.destroy(handle);
    expect(store.isAlive(handle)).toBe(false);
    expect(store.isStale(handle)).toBe(true);
    expect(store.handleAt(0)).toBe(NULL_ENTITY);
  });

  it('treats a never-allocated slot index and a forged handle as stale', () => {
    const store = new EntityStore();
    store.create();
    // A bare slot index used as a handle decodes to generation 0.
    expect(store.isAlive(0)).toBe(false);
    expect(store.isAlive(makeHandle(99, 1))).toBe(false);
    expect(store.isAlive(makeHandle(0, 2))).toBe(false);
  });

  it('destroys once: a second destroy is a no-op and does not double-free the slot', () => {
    const store = new EntityStore();
    const handle = store.create();
    expect(store.destroy(handle)).toBe(true);
    expect(store.destroy(handle)).toBe(false);
    expect(store.liveCount).toBe(0);

    // A slot pushed onto the free list twice would hand the same slot to two
    // live entities at once.
    const a = store.create();
    const b = store.create();
    expect(handleIndex(a)).not.toBe(handleIndex(b));
    expect(store.liveCount).toBe(2);
  });

  it('retires a slot rather than wrapping its generation', () => {
    const store = new EntityStore();
    const issued: EntityHandle[] = [];
    // Each destroy bumps slot 0's generation. The last reuse it can encode is
    // MAX_ENTITY_GENERATION; past that the slot is retired instead of aliasing.
    for (let i = 0; i < MAX_ENTITY_GENERATION; i += 1) {
      const handle = store.create();
      expect(handleIndex(handle)).toBe(0);
      issued.push(handle);
      store.destroy(handle);
    }
    expect(new Set(issued).size).toBe(issued.length);

    const afterRetirement = store.create();
    expect(handleIndex(afterRetirement)).toBe(1);
    // Every handle ever issued against slot 0 stays stale forever.
    for (const handle of issued) {
      expect(store.isStale(handle)).toBe(true);
    }
    store.destroy(afterRetirement);
    expect(handleIndex(store.create())).toBe(1);
  });
});

describe('EntityStore iteration', () => {
  it('visits entities in ascending slot index order, not creation order', () => {
    const store = new EntityStore();
    const issued = runScript(store, CHURN_SCRIPT);
    const live = issued.filter((handle) => store.isAlive(handle));

    const visitedSlots: number[] = [];
    const visitedHandles: EntityHandle[] = [];
    store.forEach((handle, slot) => {
      visitedSlots.push(slot);
      visitedHandles.push(handle);
    });

    expect(visitedSlots).toEqual([...visitedSlots].sort((a, b) => a - b));
    expect(visitedSlots).toEqual([0, 1, 2, 3]);
    expect(visitedHandles.length).toBe(store.liveCount);
    expect(new Set(visitedHandles)).toEqual(new Set(live));

    // The churn ends with the entity in slot 3 created before the one in slot
    // 2, so index order and creation order genuinely disagree here.
    const creationOrder = visitedHandles.map((handle) => issued.indexOf(handle));
    expect(creationOrder).toEqual([3, 4, 7, 6]);
    expect(creationOrder).not.toEqual([...creationOrder].sort((a, b) => a - b));
  });

  it('keeps iteration in index order after heavy churn', () => {
    const store = new EntityStore();
    const issued: EntityHandle[] = [];
    for (let i = 0; i < 200; i += 1) {
      issued.push(store.create());
    }
    for (let i = 0; i < 200; i += 3) {
      const handle = issued[i];
      store.destroy(handle as EntityHandle);
    }
    for (let i = 0; i < 40; i += 1) {
      issued.push(store.create());
    }

    const slots = store.liveSlots();
    expect(slots.length).toBe(store.liveCount);
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i] as number).toBeGreaterThan(slots[i - 1] as number);
    }

    const viaForEach: number[] = [];
    store.forEach((handle, slot) => {
      expect(store.isAlive(handle)).toBe(true);
      expect(store.slotOf(handle)).toBe(slot);
      viaForEach.push(slot);
    });
    expect(viaForEach).toEqual(Array.from(slots));
  });

  it('resolves a slot back to the handle that currently occupies it', () => {
    const store = new EntityStore();
    const a = store.create();
    const b = store.create();
    expect(store.handleAt(0)).toBe(a);
    expect(store.handleAt(1)).toBe(b);
    expect(store.handleAt(2)).toBe(NULL_ENTITY);
    expect(store.handleAt(-1)).toBe(NULL_ENTITY);
  });
});
