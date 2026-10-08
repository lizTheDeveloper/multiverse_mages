/*
 * Multiverse Mages — a kind-denominated bill, restated for the labour market.
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

import { MATERIALS_PER_LABORER, computeOccupationDemand, laborObligation } from '../../src/index.js';
import { OCCUPATION } from '@mm/state';

/** The shipped territory's food share — `materials.ts` quotes it as `470/1024`. */
const SHIPPED = { food: 470, vellum: 300 };

const laborersFor = (obligation: number): number =>
  computeOccupationDemand({
    constructionBacklog: 0,
    scribingQueueDepth: 0,
    universityCapacity: 0,
    latentMagicUsers: 0,
    standingSoldierTarget: 0,
    materialsObligation: obligation,
  })[OCCUPATION.laborer];

describe('laborObligation', () => {
  it('asks for enough laborers that their food covers the food bill', () => {
    const population = 22_342;
    const laborers = laborersFor(laborObligation({ food: population, vellum: 0 }, SHIPPED));
    // What those laborers actually grow, at the shipped share.
    const grown = Math.floor((laborers * MATERIALS_PER_LABORER * SHIPPED.food) / FP_ONE);
    expect(grown).toBeGreaterThanOrEqual(population);
  });

  it('the plain sum it replaced asked for under half of that (the defect, as a control)', () => {
    const population = 22_342;
    const old = laborersFor(population);
    const grown = Math.floor((old * MATERIALS_PER_LABORER * SHIPPED.food) / FP_ONE);
    expect(grown / population).toBeLessThan(0.5);
  });

  it('takes the larger of the two bills, not their sum', () => {
    const food = laborObligation({ food: 4_700, vellum: 0 }, SHIPPED);
    const vellum = laborObligation({ food: 0, vellum: 300 }, SHIPPED);
    expect(laborObligation({ food: 4_700, vellum: 300 }, SHIPPED)).toBe(Math.max(food, vellum));
  });

  it('is the old sum exactly when the land yields one kind and the bill is in it', () => {
    expect(laborObligation({ food: 1_000, vellum: 0 }, { food: FP_ONE, vellum: 0 })).toBe(1_000);
  });

  it('skips a kind the land yields none of rather than dividing by zero', () => {
    expect(laborObligation({ food: 100, vellum: 50 }, { food: FP_ONE, vellum: 0 })).toBe(100);
    expect(laborObligation({ food: 0, vellum: 50 }, { food: FP_ONE, vellum: 0 })).toBe(0);
  });

  it('rounds up, so a bill of one still asks for somebody', () => {
    expect(laborObligation({ food: 1, vellum: 0 }, SHIPPED)).toBeGreaterThan(0);
  });
});
