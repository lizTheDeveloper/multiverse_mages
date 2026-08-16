/*
 * Multiverse Mages — materials are produced by labour on differing land, spent
 * per kind in a documented order, and never negative.
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
  CLAIMANT_KIND,
  CONSUMPTION_ORDER,
  MATERIALS_PER_LABORER,
  NO_MATERIALS,
  NO_YIELD_BONUSES,
  SUBSISTENCE_PER_PERSON,
  assertMaterialsNonNegative,
  consumeMaterials,
  materialsProduced,
  resourceYieldMultiplier,
  subsistenceDemand,
  totalAmount,
} from '../../src/index.js';
import type { ConsumptionDemand, MaterialAmounts, MaterialKind } from '../../src/index.js';

import { primitiveNamed, speciesNamed } from './universities-fixtures.js';

/**
 * Shares chosen so `MATERIALS_PER_LABORER` (16) divides evenly into every
 * kind: 8 food, 4 stone, 4 vellum per laborer at neutral affinity.
 *
 * The shipped territory's shares (482/241/301 in `fp`, computed by
 * `territoryYieldShares` over `territory.json` — see `economy-kinds.test.ts`)
 * do not divide 16 exactly in any kind, so `materialsProduced` under them
 * rounds per kind and the old exact "N laborers produce exactly N × the rate"
 * assertions would become off-by-a-few inequalities for a reason that has
 * nothing to do with what this file is testing. This file is about
 * `materialsProduced`'s own arithmetic — linearity, affinity, capped
 * resource-yield — so an exact synthetic mix is the honest fixture; the
 * shipped mix's own arithmetic (that it sums to `FP_ONE`) is asserted where it
 * is produced, in `economy-kinds.test.ts`.
 */
const EXACT_SHARES: MaterialAmounts = { food: 512, stone: 256, vellum: 256 };

const production = (
  laborerCount: number,
  laborAffinity = FP_ONE,
  resourceYieldBonuses: Readonly<Record<MaterialKind, readonly number[]>> = NO_YIELD_BONUSES,
): Parameters<typeof materialsProduced>[0] => ({
  laborerCount,
  laborAffinity,
  shares: EXACT_SHARES,
  resourceYield: primitiveNamed('resource-yield'),
  resourceYieldBonuses,
});

const demand = (overrides: Partial<ConsumptionDemand> = {}): ConsumptionDemand => ({
  casting: 0, subsistence: 0,
  libraryUpkeep: 0,
  scribing: 0,
  construction: 0,
  ...overrides,
});

describe('materials are produced by laborers', () => {
  it('scales linearly with the laborer count, and routes into the three kinds', () => {
    // Exact, because EXACT_SHARES was chosen to divide MATERIALS_PER_LABORER
    // (16) with no remainder: 8 food, 4 stone, 4 vellum per laborer.
    expect(materialsProduced(production(1))).toEqual({ food: 8, stone: 4, vellum: 4 });
    expect(totalAmount(materialsProduced(production(1)))).toBe(MATERIALS_PER_LABORER);
    expect(materialsProduced(production(100))).toEqual({ food: 800, stone: 400, vellum: 400 });
    expect(totalAmount(materialsProduced(production(100)))).toBe(MATERIALS_PER_LABORER * 100);
  });

  it('gives the better-laboring species strictly more from the same headcount, in total', () => {
    const better = speciesNamed('orc');
    const worse = speciesNamed('draconic');
    expect(better.laborAffinity).toBeGreaterThan(worse.laborAffinity);

    // Asserted on the total rather than per kind: `laborAffinity` scales the
    // whole basket uniformly, since it multiplies the base before the
    // territory shares split it, so "strictly more" holds kind by kind too --
    // but the total is what the old single-stock test actually meant to say,
    // and asserting it there keeps the claim from being read as being about
    // any one kind in particular.
    expect(totalAmount(materialsProduced(production(1000, better.laborAffinity)))).toBeGreaterThan(
      totalAmount(materialsProduced(production(1000, worse.laborAffinity))),
    );
  });

  it('produces nothing from nobody, in every kind', () => {
    expect(materialsProduced(production(0))).toEqual(NO_MATERIALS);
  });

  it('routes resource-yield through the shared capped accumulator, per kind independently', () => {
    expect(resourceYieldMultiplier(production(1), 'food')).toBe(FP_ONE);
    expect(
      resourceYieldMultiplier(
        production(1, FP_ONE, { food: [256, 256], stone: [], vellum: [] }),
        'food',
      ),
    ).toBe(FP_ONE + 512);

    const counters = new ClampCounters();
    const saturatedFood = production(1, FP_ONE, { food: [9999], stone: [], vellum: [] });
    expect(resourceYieldMultiplier({ ...saturatedFood, counters }, 'food')).toBe(4096);
    expect(counters.count('resource-yield')).toBe(1);

    // The property that would not exist under a single shared cap: a food
    // bonus large enough to saturate the food multiplier leaves stone's
    // multiplier at neutral, because each kind is capped by its own call to
    // the shared accumulator rather than by one accumulator shared across
    // kinds. A shared cap would make a universe saturated on food magic unable
    // to benefit from any quarrying magic at all, which `materials.ts` names
    // as the defect this independence avoids.
    expect(resourceYieldMultiplier({ ...saturatedFood, counters }, 'stone')).toBe(FP_ONE);
  });

  it('refuses a fractional laborer count', () => {
    expect(() => materialsProduced(production(1.5))).toThrow(/non-negative integer/u);
  });
});

describe('subsistence is a claim on the food stock like any other', () => {
  it('is one demand per person per tick', () => {
    expect(subsistenceDemand(0)).toBe(0);
    expect(subsistenceDemand(1000)).toBe(1000 * SUBSISTENCE_PER_PERSON);
  });
});

describe('consumption follows a documented priority order', () => {
  it('pays in the order the module declares', () => {
    // `casting` joined on 2026-08-15 (`substrate.md` §6), second: after the
    // populace eats and ahead of the archive. The position is the decision —
    // `remaining` is tracked per kind, so a claimant only ranks against the
    // ones sharing its stock, and casting on vellum is what makes §7.1's
    // *"magic competes with the library, not with bread"* a true sentence.
    expect([...CONSUMPTION_ORDER]).toEqual([
      'subsistence',
      'casting',
      'libraryUpkeep',
      'scribing',
      'construction',
    ]);
  });

  it('names a kind for every claimant, checked by the type and again here', () => {
    // `CLAIMANT_KIND` is typed as `Record<ConsumptionKind, MaterialKind>`, so a
    // missing entry is already a compile error -- this test is the runtime
    // half, the one a reviewer can run rather than trust the type checker did
    // its job, and it pins the actual mapping `materials.ts` documents rather
    // than merely its totality.
    for (const claimant of CONSUMPTION_ORDER) {
      expect(CLAIMANT_KIND[claimant]).toBeDefined();
    }
    expect(CLAIMANT_KIND).toEqual({
      subsistence: 'food',
      casting: 'vellum',
      libraryUpkeep: 'vellum',
      scribing: 'vellum',
      construction: 'stone',
    });
  });

  it("pays everyone when every kind's stock covers its own claimants", () => {
    const stock: MaterialAmounts = { food: 200, stone: 200, vellum: 200 };
    const outcome = consumeMaterials(
      stock,
      demand({ casting: 0, subsistence: 100, libraryUpkeep: 50, scribing: 25, construction: 10 }),
    );
    expect(outcome.spent).toEqual({
      casting: 0, subsistence: 100,
      libraryUpkeep: 50,
      scribing: 25,
      construction: 10,
    });
    expect(outcome.anyShortfall).toBe(false);
    expect(outcome.shortKinds).toEqual({ food: false, stone: false, vellum: false });
    expect(outcome.remaining).toEqual({ food: 100, stone: 190, vellum: 125 });
  });

  it('pays library upkeep before scribing, within the vellum stock they share', () => {
    // The single surviving cross-claimant priority. The old test here was
    // called "feeds people before it maintains libraries, and builds last" --
    // a claim about subsistence, upkeep, scribing and construction all
    // contending for one stock. That claim cannot be restated: subsistence and
    // construction no longer share a stock with anything, so there is no
    // "before" between them to test. What survives is the one pair that still
    // shares a stock -- upkeep and scribing both spend vellum -- and that
    // ordering is still a documented decision (`materials.ts`: "knowledge
    // already held before knowledge not yet written").
    const stock: MaterialAmounts = { food: 1_000_000, stone: 1_000_000, vellum: 60 };
    const outcome = consumeMaterials(
      stock,
      demand({ casting: 0, subsistence: 100, libraryUpkeep: 50, scribing: 25, construction: 10 }),
    );
    // Ample food and stone: both paid in full, untouched by vellum's shortage.
    expect(outcome.spent.subsistence).toBe(100);
    expect(outcome.spent.construction).toBe(10);
    // Vellum is short: upkeep is paid first and in full, scribing gets what is
    // left over, and the shortfall lands entirely on scribing.
    expect(outcome.spent.libraryUpkeep).toBe(50);
    expect(outcome.spent.scribing).toBe(10);
    expect(outcome.shortfall.scribing).toBe(15);
    expect(outcome.shortKinds).toEqual({ food: false, stone: false, vellum: true });
  });

  it("a shortage in one kind leaves the other kinds' claimants fully paid", () => {
    // The replacement for the cross-kind ordering claim above, and the
    // stronger property the three-kind split exists to make true: a universe
    // out of food can still finish its buildings and keep its libraries,
    // because construction and library upkeep are not drawn from food.
    // `shortKinds` names exactly the kind that ran out.
    const stock: MaterialAmounts = { food: 0, stone: 1000, vellum: 1000 };
    const outcome = consumeMaterials(
      stock,
      demand({ casting: 0, subsistence: 50, libraryUpkeep: 10, scribing: 10, construction: 10 }),
    );
    expect(outcome.spent.subsistence).toBe(0);
    expect(outcome.shortfall.subsistence).toBe(50);
    expect(outcome.spent.libraryUpkeep).toBe(10);
    expect(outcome.spent.scribing).toBe(10);
    expect(outcome.spent.construction).toBe(10);
    expect(outcome.shortKinds).toEqual({ food: true, stone: false, vellum: false });
  });

  it('splits demand into spent and shortfall with nothing lost between them, in every kind', () => {
    for (const level of [0, 7, 63, 175, 400]) {
      const stock: MaterialAmounts = { food: level, stone: level, vellum: level };
      const wanted = demand({ casting: 0, subsistence: 100, libraryUpkeep: 50, scribing: 25, construction: 10 });
      const outcome = consumeMaterials(stock, wanted);
      for (const claimant of CONSUMPTION_ORDER) {
        expect(outcome.spent[claimant] + outcome.shortfall[claimant]).toBe(wanted[claimant]);
      }
    }
  });

  it('never leaves any kind negative, at any stock and any demand', () => {
    for (const level of [0, 1, 5, 999]) {
      const stock: MaterialAmounts = { food: level, stone: level, vellum: level };
      const outcome = consumeMaterials(
        stock,
        demand({ casting: 0, subsistence: 10_000, libraryUpkeep: 10_000, scribing: 10_000, construction: 10_000 }),
      );
      assertMaterialsNonNegative(outcome.remaining);
      for (const claimant of CONSUMPTION_ORDER) {
        expect(outcome.spent[claimant]).toBeLessThanOrEqual(stock[CLAIMANT_KIND[claimant]]);
      }
      expect(outcome.anyShortfall).toBe(true);
    }
  });

  it('treats a negative stock as empty rather than as credit, per kind', () => {
    const outcome = consumeMaterials({ food: -500, stone: 0, vellum: 0 }, demand({ casting: 0, subsistence: 10 }));
    expect(outcome.remaining.food).toBe(0);
    expect(outcome.shortfall.subsistence).toBe(10);
  });

  it('refuses a negative demand rather than paying into the stock', () => {
    expect(() =>
      consumeMaterials({ food: 100, stone: 100, vellum: 100 }, demand({ scribing: -5 })),
    ).toThrow(/negative demand/u);
  });
});

describe('the non-negative invariant is asserted per kind, not assumed', () => {
  it('accepts an all-zero stock and rejects any one kind below it, naming which', () => {
    // The property a single undifferentiated stock could not have: the error
    // names the kind that went negative, so "vellum ran out" and "food ran
    // out" are distinguishable from the exception message alone.
    expect(() => assertMaterialsNonNegative(NO_MATERIALS)).not.toThrow();
    expect(() => assertMaterialsNonNegative({ food: -1, stone: 0, vellum: 0 })).toThrow(
      /the food stock is -1.*never to go below zero/u,
    );
    expect(() => assertMaterialsNonNegative({ food: 0, stone: -1, vellum: 0 })).toThrow(
      /the stone stock is -1/u,
    );
    expect(() => assertMaterialsNonNegative({ food: 0, stone: 0, vellum: -1 })).toThrow(
      /the vellum stock is -1/u,
    );
  });
});
