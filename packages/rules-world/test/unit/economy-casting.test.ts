/*
 * Multiverse Mages — a month of magical work is not free.
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
 * `substrate.md` §6's `casting` claim. The design decisions this pins are in
 * `CLAIMANT_KIND`'s own note; what is asserted here is the arithmetic and, more
 * importantly, that the **shortfall has teeth** — a cost nothing can refuse is
 * not a cost.
 */

import { FP_ONE } from '@mm/sim-core';
import { describe, expect, it } from 'vitest';

import {
  CLAIMANT_KIND,
  CONSUMPTION_ORDER,
  affordableMageMonths,
  castingDemand,
  consumeMaterials,
  zeroAmounts,
} from '../../src/index.js';

const weights = { vellumPerMonth: 16 } as const;

describe('a month of magical work is charged for', () => {
  it('prices mage-months at the authored rate', () => {
    expect(castingDemand(FP_ONE, weights)).toBe(16);
    expect(castingDemand(4 * FP_ONE, weights)).toBe(64);
    expect(castingDemand(0, weights)).toBe(0);
  });

  it('refuses a negative demand, which would pay vellum into the stock', () => {
    // The same refusal `consumeMaterials` makes, for the reason it gives: a
    // negative cost is how a rounding error becomes free materials.
    expect(() => castingDemand(-FP_ONE, weights)).toThrow(RangeError);
  });

  it('grants every month when the archive can carry them', () => {
    expect(affordableMageMonths(4 * FP_ONE, 1024, weights)).toBe(4 * FP_ONE);
  });

  it('grants a proportional share when it cannot, rather than an arbitrary subset', () => {
    // Ten months wanted, enough vellum for five. Proportional rather than
    // all-or-nothing because an arbitrary subset would depend on iteration
    // order, and `contracts.md` §6 spends real effort keeping iteration order
    // out of outcomes.
    const wanted = 10 * FP_ONE;
    const half = castingDemand(wanted, weights) / 2;
    expect(affordableMageMonths(wanted, half, weights)).toBe(5 * FP_ONE);
  });

  it('grants nothing when the archive is empty, and never overdraws it', () => {
    expect(affordableMageMonths(4 * FP_ONE, 0, weights)).toBe(0);
    // A partial month floors down, so the stock is never overdrawn by rounding
    // and the remainder stays in the stock rather than being granted free.
    const granted = affordableMageMonths(10 * FP_ONE, 17, weights);
    expect(castingDemand(granted, weights)).toBeLessThanOrEqual(17);
  });

  it('is free when content prices it at zero, so an older world keeps its behaviour', () => {
    expect(affordableMageMonths(9 * FP_ONE, 0, { vellumPerMonth: 0 })).toBe(9 * FP_ONE);
  });
});

describe('casting takes its vellum before the library does', () => {
  it('is paid out of vellum, which is the contended stock', () => {
    expect(CLAIMANT_KIND.casting).toBe('vellum');
  });

  it('ranks ahead of libraryUpkeep and scribing, and behind subsistence', () => {
    const order = [...CONSUMPTION_ORDER];
    expect(order.indexOf('casting')).toBeLessThan(order.indexOf('libraryUpkeep'));
    expect(order.indexOf('casting')).toBeLessThan(order.indexOf('scribing'));
    expect(order.indexOf('subsistence')).toBeLessThan(order.indexOf('casting'));
  });

  it('starves the library rather than the populace, which is the whole decision', () => {
    // **The assertion that makes `substrate.md` §7.1 true rather than merely
    // stated.** `consumeMaterials` tracks `remaining` per KIND, so
    // `CONSUMPTION_ORDER` only ranks claimants that share a stock. Casting on
    // vellum competes with the archive; casting on stone would have competed
    // with construction and left §7.1's sentence false with nothing to catch it.
    const stock = { ...zeroAmounts(), food: 10_000, stone: 10_000, vellum: 100 };
    const out = consumeMaterials(stock, {
      subsistence: 500,
      casting: 80,
      teaching: 0,
      refining: 0,
      constructionLabor: 0,
      libraryUpkeep: 80,
      scribing: 0,
      construction: 40,
    });
    expect(out.spent.casting).toBe(80);
    // The library goes short by exactly what casting took ahead of it.
    expect(out.shortfall.libraryUpkeep).toBe(60);
    // And the populace is untouched: food is a different stock entirely.
    expect(out.shortfall.subsistence).toBe(0);
    expect(out.spent.construction).toBe(40);
  });
});
