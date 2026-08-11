/*
 * Multiverse Mages — cohort identity, merging, and reclamation.
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

import { NULL_ENTITY } from '@mm/sim-core';
import { OCCUPATION, POPULACE_COHORT } from '@mm/state';

import { MAX_COHORT_COUNT, createCohortStore } from '@mm/rules-world';

const ORCISH = 1;
const LONG_LIVED = 2;

describe('a large population is one cohort', () => {
  it('holds 40,000 of one species, occupation, and birth decade in a single entity', () => {
    // The economy spec's headline scenario. This is `contracts.md` §1.3 as an
    // observable fact rather than a promise: one entity, forty thousand people.
    const store = createCohortStore();
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.laborer, birthTickBucket: 0 }, 40_000);

    expect(store.liveCohortCount).toBe(1);
    expect(store.totalCount()).toBe(40_000);
  });

  it('carries exactly the four fields §1.3 gives a cohort, and no fifth', () => {
    // A per-person field is the failure this contract exists to prevent, and it
    // would arrive as a *component* field long before it arrived as an entity.
    expect(Object.keys(POPULACE_COHORT.fields)).toEqual([
      'speciesId',
      'occupation',
      'count',
      'birthTickBucket',
    ]);
  });
});

describe('cohort identity is unique and collisions merge', () => {
  it('merges a second add of the same key into the same entity', () => {
    const store = createCohortStore();
    const key = { speciesId: ORCISH, occupation: OCCUPATION.laborer, birthTickBucket: 120 };
    const first = store.add(key, 10);
    const second = store.add(key, 15);

    expect(second).toBe(first);
    expect(store.liveCohortCount).toBe(1);
    expect(store.countOf(first)).toBe(25);
  });

  it('buckets a raw birth tick, so two months of the same decade are one cohort', () => {
    const store = createCohortStore();
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 121 }, 3);
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 239 }, 4);

    expect(store.liveCohortCount).toBe(1);
    expect(store.totalCount()).toBe(7);
  });

  it('splits and rejoins back into exactly one entity with the original total', () => {
    // The economy spec's "split and rejoin merges" scenario.
    const store = createCohortStore();
    const key = { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 };
    const origin = store.add(key, 1000);

    const moved = store.transfer(origin, OCCUPATION.laborer, 400);
    expect(moved).toBe(400);
    expect(store.liveCohortCount).toBe(2);

    const laborers = store.find({ ...key, occupation: OCCUPATION.laborer });
    store.transfer(laborers, OCCUPATION.idle, 400);

    expect(store.liveCohortCount).toBe(1);
    expect(store.countOf(store.find(key))).toBe(1000);
    expect(store.totalCount()).toBe(1000);
  });

  it('finds no duplicate keys at end of tick', () => {
    const store = createCohortStore();
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 }, 5);
    store.add({ speciesId: LONG_LIVED, occupation: OCCUPATION.idle, birthTickBucket: 0 }, 5);
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.scribe, birthTickBucket: 0 }, 5);
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 120 }, 5);

    expect(() => {
      store.assertUniqueKeys();
    }).not.toThrow();
    expect(store.reconcile()).toBe(0);
  });

  it('merges a duplicate produced behind its back, keeping the lower slot', () => {
    // The store's own API cannot make a duplicate. Something writing the
    // component directly can — a future system doing a bulk occupation
    // rewrite, say — so the end-of-tick sweep is not decoration. Its survivor
    // rule must be a function of state (lowest slot), never of visit order,
    // because the survivor's handle is the mortality actorKey.
    const store = createCohortStore();
    const key = { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 };
    const first = store.add(key, 100);
    const second = store.add(
      { speciesId: ORCISH, occupation: OCCUPATION.laborer, birthTickBucket: 0 },
      50,
    );
    // Rewrite the second cohort's occupation without telling the index.
    store.cohorts.set(second, 'occupation', OCCUPATION.idle);

    expect(() => {
      store.assertUniqueKeys();
    }).toThrow(/duplicate/i);

    expect(store.reconcile()).toBe(1);
    expect(store.liveCohortCount).toBe(1);
    expect(store.countOf(first)).toBe(150);
    expect(store.isLive(second)).toBe(false);
    expect(() => {
      store.assertUniqueKeys();
    }).not.toThrow();
  });
});

describe('empty cohorts are reclaimed', () => {
  it('destroys the entity at a count of zero and returns the slot to the free list', () => {
    const store = createCohortStore();
    const key = { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 };
    const handle = store.add(key, 7);
    const freedBefore = store.entities.freeCount;

    expect(store.remove(handle, 7)).toBe(7);

    expect(store.liveCohortCount).toBe(0);
    expect(store.isLive(handle)).toBe(false);
    expect(store.entities.freeCount).toBe(freedBefore + 1);
    expect(store.find(key)).toBe(NULL_ENTITY);
  });

  it('reuses the freed slot deterministically for the next cohort', () => {
    const store = createCohortStore();
    const first = store.add(
      { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 },
      1,
    );
    store.remove(first, 1);
    const next = store.add(
      { speciesId: LONG_LIVED, occupation: OCCUPATION.scribe, birthTickBucket: 0 },
      1,
    );

    // Same slot, later generation: the LIFO free list, not a fresh slot.
    expect(next).not.toBe(first);
    expect(store.entities.slotCount).toBe(1);
  });

  it('never leaves a zero-count cohort alive', () => {
    const store = createCohortStore();
    const handle = store.add(
      { speciesId: ORCISH, occupation: OCCUPATION.laborer, birthTickBucket: 0 },
      4,
    );
    store.transfer(handle, OCCUPATION.idle, 4);

    expect(store.isLive(handle)).toBe(false);
    expect(store.liveCohortCount).toBe(1);
  });
});

describe('iteration and totals are slot-ordered, never map-ordered', () => {
  it('visits cohorts in ascending slot index whatever order they were created in', () => {
    const store = createCohortStore();
    const a = store.add({ speciesId: LONG_LIVED, occupation: OCCUPATION.soldier, birthTickBucket: 240 }, 1);
    const b = store.add({ speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 }, 1);
    const c = store.add({ speciesId: ORCISH, occupation: OCCUPATION.student, birthTickBucket: 120 }, 1);

    expect(store.handles()).toEqual([a, b, c]);

    store.remove(b, 1);
    const d = store.add({ speciesId: LONG_LIVED, occupation: OCCUPATION.laborer, birthTickBucket: 0 }, 1);
    // `d` took `b`'s freed slot, so it sorts between `a` and `c`.
    expect(store.handles()).toEqual([a, d, c]);
  });

  it('totals by species without enumerating anybody', () => {
    const store = createCohortStore();
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 }, 900);
    store.add({ speciesId: ORCISH, occupation: OCCUPATION.laborer, birthTickBucket: 120 }, 100);
    store.add({ speciesId: LONG_LIVED, occupation: OCCUPATION.idle, birthTickBucket: 0 }, 40);

    expect(store.totalOfSpecies(ORCISH)).toBe(1000);
    expect(store.totalOfSpecies(LONG_LIVED)).toBe(40);
    expect(store.totalCount()).toBe(1040);
  });
});

describe('counts are refused rather than wrapped', () => {
  it('rejects a merge that would exceed the uint32 the component stores', () => {
    // `ComponentStore.set` checks integer-ness, not range: a sum past 2^32
    // wraps silently in the backing Uint32Array, and a population of four
    // billion would become a population of three with no error anywhere.
    const store = createCohortStore();
    const key = { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 };
    store.add(key, MAX_COHORT_COUNT);

    expect(() => store.add(key, 1)).toThrow(RangeError);
    expect(store.countOf(store.find(key))).toBe(MAX_COHORT_COUNT);
  });

  it('rejects a negative or fractional count', () => {
    const store = createCohortStore();
    const key = { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 };

    expect(() => store.add(key, -1)).toThrow(RangeError);
    expect(() => store.add(key, 1.5)).toThrow(RangeError);
  });

  it('rejects an occupation outside the five contracted values', () => {
    // The economy spec's "no sixth occupation".
    const store = createCohortStore();
    expect(() =>
      store.add({ speciesId: ORCISH, occupation: 5 as 0, birthTickBucket: 0 }, 1),
    ).toThrow(RangeError);
  });

  it('removes no more than the cohort holds', () => {
    const store = createCohortStore();
    const handle = store.add(
      { speciesId: ORCISH, occupation: OCCUPATION.idle, birthTickBucket: 0 },
      5,
    );
    expect(store.remove(handle, 9)).toBe(5);
    expect(store.isLive(handle)).toBe(false);
  });
});
