/*
 * Multiverse Mages — a university is built before it functions, and it is built
 * with materials it has.
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
 * Every scenario under *"Universities are built before they function"*, plus
 * the two properties that make them safe rather than merely correct: materials
 * never go negative, and the `build-rate` multiplier goes through the shared
 * capped accumulator rather than around it.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, createState } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';
import { UNIVERSITY, defineWorldStateSchema, readRecord } from '@mm/state';
import type { UniversityRecord } from '@mm/state';

import {
  BUILD_COMPLETE,
  MATERIALS_PER_LABOR_MONTH,
  admitStudents,
  advanceConstruction,
  buildRateMultiplier,
  createUniversity,
  effectiveCapacity,
  isComplete,
  readUniversity,
} from '../../src/index.js';

import { buildRatePrimitive, speciesNamed, worldState } from './universities-fixtures.js';

const university = (buildProgress: number, capacity = 40): UniversityRecord => ({
  libraryId: 0,
  capacity,
  buildProgress,
});

const site = (overrides: Partial<Parameters<typeof advanceConstruction>[1]> = {}) => ({
  laborMonths: 20,
  laborAffinity: FP_ONE,
  materials: 1_000_000,
  buildRate: buildRatePrimitive(),
  buildRateBonuses: [] as readonly number[],
  ...overrides,
});

describe('a new university is a building site', () => {
  it('is created with buildProgress 0 and no effective capacity', () => {
    const state = worldState();
    const handle = createUniversity(state, { capacity: 40 });
    const record = readUniversity(state, handle);

    expect(record.buildProgress).toBe(0);
    expect(record.capacity).toBe(40);
    expect(effectiveCapacity(record)).toBe(0);
  });

  it('admits nobody at half-built, whatever its designed capacity says', () => {
    const half = university(FP_ONE / 2, 500);
    expect(effectiveCapacity(half)).toBe(0);
    expect(admitStudents(half, 0, 10)).toEqual({ admitted: 0, refused: 10, hosted: 0 });
  });

  it('refuses a negative designed capacity rather than storing one', () => {
    expect(() => createUniversity(worldState(), { capacity: -1 })).toThrow(/non-negative/u);
  });
});

describe('construction consumes materials in the tick it credits progress', () => {
  it('deducts materials and advances by the deducted amount, scaled', () => {
    const record = university(0);
    const outcome = advanceConstruction(record, site({ laborMonths: 10 }));

    expect(outcome.materialsSpent).toBe(10 * MATERIALS_PER_LABOR_MONTH);
    expect(outcome.progressAdded).toBeGreaterThan(0);
    expect(record.buildProgress).toBe(outcome.progressAdded);
  });

  it('scales progress by the species laborAffinity', () => {
    const high = university(0);
    const low = university(0);
    const hardWorking = speciesNamed('orc');
    const idle = speciesNamed('draconic');
    expect(hardWorking.laborAffinity).toBeGreaterThan(idle.laborAffinity);

    advanceConstruction(high, site({ laborAffinity: hardWorking.laborAffinity }));
    advanceConstruction(low, site({ laborAffinity: idle.laborAffinity }));
    expect(high.buildProgress).toBeGreaterThan(low.buildProgress);
  });

  it('scales progress by the build-rate multiplier', () => {
    const plain = university(0);
    const boosted = university(0);
    advanceConstruction(plain, site());
    advanceConstruction(boosted, site({ buildRateBonuses: [FP_ONE] }));
    expect(boosted.buildProgress).toBeGreaterThan(plain.buildProgress);
  });
});

describe('the build-rate multiplier goes through the shared accumulator', () => {
  it('is (1 + Σ) with no bonuses at all', () => {
    expect(buildRateMultiplier(site())).toBe(FP_ONE);
  });

  it('sums bonuses additively rather than multiplying them', () => {
    expect(buildRateMultiplier(site({ buildRateBonuses: [512, 512] }))).toBe(FP_ONE + 1024);
  });

  it('clamps at the contracted cap and counts the clamp', () => {
    const counters = new ClampCounters();
    const value = buildRateMultiplier(site({ buildRateBonuses: [8192, 8192], counters }));
    expect(value).toBe(4096);
    expect(counters.count('build-rate')).toBe(1);
  });
});

describe('construction stalls rather than overdrawing', () => {
  it('leaves buildProgress unchanged when nothing is affordable', () => {
    const record = university(0);
    const outcome = advanceConstruction(record, site({ laborMonths: 10, materials: 0 }));

    expect(outcome.progressAdded).toBe(0);
    expect(outcome.materialsSpent).toBe(0);
    expect(record.buildProgress).toBe(0);
    expect(outcome.labourStalled).toBe(10);
  });

  it('never spends more materials than there are, at any labour offer', () => {
    for (const materials of [0, 1, MATERIALS_PER_LABOR_MONTH - 1, MATERIALS_PER_LABOR_MONTH, 39]) {
      const outcome = advanceConstruction(university(0), site({ laborMonths: 1000, materials }));
      expect(outcome.materialsSpent).toBeLessThanOrEqual(materials);
      expect(materials - outcome.materialsSpent).toBeGreaterThanOrEqual(0);
    }
  });

  it('builds with what it can afford and reports the rest as stalled', () => {
    const record = university(0);
    const outcome = advanceConstruction(
      record,
      site({ laborMonths: 10, materials: MATERIALS_PER_LABOR_MONTH * 3 }),
    );
    expect(outcome.materialsSpent).toBe(MATERIALS_PER_LABOR_MONTH * 3);
    expect(outcome.labourStalled).toBe(7);
    expect(record.buildProgress).toBeGreaterThan(0);
  });

  it('treats a negative stock as empty rather than as credit', () => {
    // Materials must never be negative, but a caller that has one has a defect
    // somewhere else; construction is not the place to compound it by building
    // on it.
    const outcome = advanceConstruction(university(0), site({ materials: -500 }));
    expect(outcome.materialsSpent).toBe(0);
    expect(outcome.progressAdded).toBe(0);
  });
});

describe('completion unlocks capacity', () => {
  it('never overshoots fp(1024)', () => {
    const record = university(0);
    for (let tick = 0; tick < 200 && !isComplete(record); tick += 1) {
      advanceConstruction(record, site({ laborMonths: 100 }));
    }
    expect(record.buildProgress).toBe(BUILD_COMPLETE);
  });

  it('turns on the designed capacity in the tick it completes', () => {
    const record = university(BUILD_COMPLETE - 1, 40);
    expect(effectiveCapacity(record)).toBe(0);

    const outcome = advanceConstruction(record, site({ laborMonths: 1 }));
    expect(outcome.completed).toBe(true);
    expect(effectiveCapacity(record)).toBe(40);
    expect(admitStudents(record, 0, 5).admitted).toBe(5);
  });

  it('spends nothing further once complete', () => {
    const record = university(BUILD_COMPLETE);
    const outcome = advanceConstruction(record, site({ laborMonths: 500 }));
    expect(outcome).toEqual({
      progressAdded: 0,
      materialsSpent: 0,
      labourStalled: 0,
      // The five hundred months were not short of materials -- they were short
      // of anything to build. That is `labourSurplus`, and it is reported here
      // rather than dropped, because a caller still staffing a finished
      // university is the waste the field exists to show.
      labourSurplus: 500,
      completed: false,
    });
  });
});

describe('a university row round-trips through state', () => {
  it('reads back exactly what construction wrote', () => {
    const state = createState({ schema: defineWorldStateSchema(), rootSeed: 1 });
    const handle = createUniversity(state, { capacity: 12, libraryId: 5 });
    const record = readUniversity(state, handle);
    advanceConstruction(record, site({ laborMonths: 3 }));

    // The mutation is on the read-out record, so the store is unchanged until
    // somebody writes it back -- stated here because a test that assumed
    // otherwise would pass for the wrong reason.
    expect(readRecord(state, UNIVERSITY, handle).buildProgress).toBe(0);
    expect(record.libraryId).toBe(5);
  });
});
