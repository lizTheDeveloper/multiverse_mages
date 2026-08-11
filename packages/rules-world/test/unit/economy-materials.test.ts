/*
 * Multiverse Mages — materials are produced by labour, spent in a documented
 * order, and never negative.
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

import { FP_ONE } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';

import {
  CONSUMPTION_ORDER,
  MATERIALS_PER_LABORER,
  SUBSISTENCE_PER_PERSON,
  assertMaterialsNonNegative,
  consumeMaterials,
  materialsProduced,
  resourceYieldMultiplier,
  subsistenceDemand,
} from '../../src/index.js';
import type { ConsumptionDemand } from '../../src/index.js';

import { primitiveNamed, speciesNamed } from './universities-fixtures.js';

const production = (
  laborerCount: number,
  laborAffinity = FP_ONE,
  resourceYieldBonuses: readonly number[] = [],
): Parameters<typeof materialsProduced>[0] => ({
  laborerCount,
  laborAffinity,
  resourceYield: primitiveNamed('resource-yield'),
  resourceYieldBonuses,
});

const demand = (overrides: Partial<ConsumptionDemand> = {}): ConsumptionDemand => ({
  subsistence: 0,
  libraryUpkeep: 0,
  scribing: 0,
  construction: 0,
  ...overrides,
});

describe('materials are produced by laborers', () => {
  it('scales linearly with the laborer count', () => {
    expect(materialsProduced(production(1))).toBe(MATERIALS_PER_LABORER);
    expect(materialsProduced(production(100))).toBe(MATERIALS_PER_LABORER * 100);
  });

  it('gives the better-laboring species strictly more from the same headcount', () => {
    const better = speciesNamed('orc');
    const worse = speciesNamed('draconic');
    expect(better.laborAffinity).toBeGreaterThan(worse.laborAffinity);

    expect(materialsProduced(production(1000, better.laborAffinity))).toBeGreaterThan(
      materialsProduced(production(1000, worse.laborAffinity)),
    );
  });

  it('produces nothing from nobody', () => {
    expect(materialsProduced(production(0))).toBe(0);
  });

  it('routes resource-yield through the shared capped accumulator', () => {
    expect(resourceYieldMultiplier(production(1))).toBe(FP_ONE);
    expect(resourceYieldMultiplier(production(1, FP_ONE, [256, 256]))).toBe(FP_ONE + 512);

    const counters = new ClampCounters();
    expect(
      resourceYieldMultiplier({ ...production(1, FP_ONE, [9999]), counters }),
    ).toBe(4096);
    expect(counters.count('resource-yield')).toBe(1);
  });

  it('refuses a fractional laborer count', () => {
    expect(() => materialsProduced(production(1.5))).toThrow(/non-negative integer/u);
  });
});

describe('subsistence is a claim on the stock like any other', () => {
  it('is one demand per person per tick', () => {
    expect(subsistenceDemand(0)).toBe(0);
    expect(subsistenceDemand(1000)).toBe(1000 * SUBSISTENCE_PER_PERSON);
  });
});

describe('consumption follows a documented priority order', () => {
  it('pays in the order the module declares', () => {
    expect([...CONSUMPTION_ORDER]).toEqual([
      'subsistence',
      'libraryUpkeep',
      'scribing',
      'construction',
    ]);
  });

  it('pays everyone when the stock covers everyone', () => {
    const outcome = consumeMaterials(
      1000,
      demand({ subsistence: 100, libraryUpkeep: 50, scribing: 25, construction: 10 }),
    );
    expect(outcome.spent).toEqual({
      subsistence: 100,
      libraryUpkeep: 50,
      scribing: 25,
      construction: 10,
    });
    expect(outcome.anyShortfall).toBe(false);
    expect(outcome.materialsRemaining).toBe(815);
  });

  it('feeds people before it maintains libraries, and builds last', () => {
    const outcome = consumeMaterials(
      120,
      demand({ subsistence: 100, libraryUpkeep: 50, scribing: 25, construction: 10 }),
    );
    expect(outcome.spent.subsistence).toBe(100);
    expect(outcome.spent.libraryUpkeep).toBe(20);
    expect(outcome.spent.scribing).toBe(0);
    expect(outcome.spent.construction).toBe(0);
    expect(outcome.shortfall.libraryUpkeep).toBe(30);
    expect(outcome.shortfall.construction).toBe(10);
  });

  it('splits demand into spent and shortfall with nothing lost between them', () => {
    for (const stock of [0, 7, 63, 175, 400]) {
      const wanted = demand({ subsistence: 100, libraryUpkeep: 50, scribing: 25, construction: 10 });
      const outcome = consumeMaterials(stock, wanted);
      for (const kind of CONSUMPTION_ORDER) {
        expect(outcome.spent[kind] + outcome.shortfall[kind]).toBe(wanted[kind]);
      }
    }
  });

  it('never leaves the stock negative, at any stock and any demand', () => {
    for (const stock of [0, 1, 5, 999]) {
      const outcome = consumeMaterials(
        stock,
        demand({ subsistence: 10_000, libraryUpkeep: 10_000, scribing: 10_000, construction: 10_000 }),
      );
      expect(outcome.materialsRemaining).toBeGreaterThanOrEqual(0);
      const spent = CONSUMPTION_ORDER.reduce((sum, kind) => sum + outcome.spent[kind], 0);
      expect(spent).toBeLessThanOrEqual(stock);
      expect(outcome.anyShortfall).toBe(true);
      assertMaterialsNonNegative(outcome.materialsRemaining);
    }
  });

  it('treats a negative stock as empty rather than as credit', () => {
    const outcome = consumeMaterials(-500, demand({ subsistence: 10 }));
    expect(outcome.materialsRemaining).toBe(0);
    expect(outcome.shortfall.subsistence).toBe(10);
  });

  it('refuses a negative demand rather than paying into the stock', () => {
    expect(() => consumeMaterials(100, demand({ scribing: -5 }))).toThrow(/negative demand/u);
  });
});

describe('the non-negative invariant is asserted, not assumed', () => {
  it('accepts zero and rejects anything below it', () => {
    expect(() => assertMaterialsNonNegative(0)).not.toThrow();
    expect(() => assertMaterialsNonNegative(-1)).toThrow(/never to go below zero/u);
  });
});
