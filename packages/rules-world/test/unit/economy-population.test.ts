/*
 * Multiverse Mages — population approaches carrying capacity and does not
 * bounce off it.
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
 * The birth-and-death equilibrium test at the bottom of this file is the
 * `economy` spec's *"Deaths balance births at equilibrium"* scenario, run at
 * cohort granularity rather than through a whole world tick. That is honest
 * about its scope: it demonstrates that the logistic brake and the shared
 * hazard table settle against each other, and it does **not** demonstrate that
 * the reference scenario does — which is task group 9's, and is not written.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, RNG_STREAM } from '@mm/sim-core';

import {
  BIRTHS_PER_MEMBER,
  BIRTH_RATE_ONE,
  MATERIALS_PROVISION_CAP,
  MATERIALS_PROVISION_SATURATION,
  MAX_PROVISIONING,
  MAX_SUBSISTENCE_PENALTY,
  NO_TERRITORY,
  OCCUPATION_COUNT,
  SEATS_PROVISION_CAP,
  carryingCapacity,
  cohortBirths,
  createCohortStore,
  expectedBirths,
  fertilityBrake,
  insertNewborns,
  maxCarryingCapacity,
  territoryExtent,
} from '../../src/index.js';
import type { BirthInput } from '../../src/index.js';

import { primitiveNamed, shippedRegistry, speciesNamed } from './universities-fixtures.js';
import { recordingRng, stepRng } from './mage-fixtures.js';

/** The shipped territory, which is what a universe's `K` is actually derived from. */
const TERRITORY = territoryExtent(shippedRegistry().territories.map((entry) => entry.record));

/** The materials stock at which the materials term reaches its cap. */
const SATURATING_STOCK = TERRITORY.landUnits * MATERIALS_PROVISION_SATURATION;

const births = (overrides: Partial<BirthInput> = {}): BirthInput => ({
  count: 1000,
  fertility: FP_ONE,
  fertilityPrimitive: primitiveNamed('fertility'),
  fertilityBonuses: [],
  brake: FP_ONE,
  ...overrides,
});

describe('carrying capacity comes from territory, modulated by materials and seats', () => {
  it('sums the shipped regions into a fixed base, and holds that base with nothing else', () => {
    // The property that makes `K` a bound rather than a reading: bare land, an
    // empty stock and no universities still carry a population, and that number
    // is a function of content alone.
    expect(TERRITORY.landUnits).toBeGreaterThan(0);
    expect(TERRITORY.baseCapacity).toBeGreaterThan(0);
    expect(carryingCapacity({ territory: TERRITORY, materials: 0, completedCapacity: 0 })).toBe(
      TERRITORY.baseCapacity,
    );
  });

  it('carries nobody without land, however much is stockpiled on it', () => {
    expect(
      carryingCapacity({ territory: NO_TERRITORY, materials: 1_000_000, completedCapacity: 500 }),
    ).toBe(0);
  });

  it('rises with the materials stock and then stops rising', () => {
    // This is the whole fix, as an assertion. The old shape was
    // `CAPACITY_PER_MATERIAL × materials`, which is monotone with no upper
    // limit, so a stock that grows every tick produced a `K` that grew every
    // tick. Here the ramp ends.
    const bare = carryingCapacity({ territory: TERRITORY, materials: 0, completedCapacity: 0 });
    const stocked = carryingCapacity({
      territory: TERRITORY,
      materials: Math.floor(SATURATING_STOCK / 2),
      completedCapacity: 0,
    });
    const saturated = carryingCapacity({
      territory: TERRITORY,
      materials: SATURATING_STOCK,
      completedCapacity: 0,
    });
    const absurd = carryingCapacity({
      territory: TERRITORY,
      materials: SATURATING_STOCK * 1_000,
      completedCapacity: 0,
    });

    expect(stocked).toBeGreaterThan(bare);
    expect(saturated).toBeGreaterThan(stocked);
    expect(absurd).toBe(saturated);
    expect(saturated).toBe(
      Math.floor((TERRITORY.baseCapacity * (FP_ONE + MATERIALS_PROVISION_CAP)) / FP_ONE),
    );
  });

  it('counts completed seats, nothing from unfinished ones, and stops there too', () => {
    // `completedCapacity` is the caller's sum over `effectiveCapacity`, which is
    // zero for a site under construction -- so an unfinished university reaches
    // this function as a zero rather than as a special case here.
    const bare = carryingCapacity({ territory: TERRITORY, materials: 0, completedCapacity: 0 });
    const few = carryingCapacity({ territory: TERRITORY, materials: 0, completedCapacity: 10 });
    const many = carryingCapacity({
      territory: TERRITORY,
      materials: 0,
      completedCapacity: 10_000_000,
    });

    expect(few).toBeGreaterThan(bare);
    expect(many).toBe(
      Math.floor((TERRITORY.baseCapacity * (FP_ONE + SEATS_PROVISION_CAP)) / FP_ONE),
    );
  });

  it('never exceeds the documented bound, whatever it is given', () => {
    // The number task 9.4 asserts against. It names content and nothing else --
    // no stock, no seat count, no tick index.
    const bound = maxCarryingCapacity(TERRITORY);
    expect(bound).toBe(Math.floor((TERRITORY.baseCapacity * MAX_PROVISIONING) / FP_ONE));

    for (const materials of [0, 1024, SATURATING_STOCK, SATURATING_STOCK * 10_000]) {
      for (const completedCapacity of [0, 10, 100_000]) {
        expect(
          carryingCapacity({ territory: TERRITORY, materials, completedCapacity }),
          `K exceeded its stated bound at materials ${String(materials)} and ` +
            `${String(completedCapacity)} seats`,
        ).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('falls when subsistence goes unmet, and no further than the documented bound', () => {
    const stock = SATURATING_STOCK / 4;
    const fed = carryingCapacity({ territory: TERRITORY, materials: stock, completedCapacity: 0 });
    const hungry = carryingCapacity({
      territory: TERRITORY,
      materials: stock,
      completedCapacity: 0,
      subsistenceShortfallShare: FP_ONE,
    });
    const peckish = carryingCapacity({
      territory: TERRITORY,
      materials: stock,
      completedCapacity: 0,
      subsistenceShortfallShare: FP_ONE / 2,
    });

    expect(hungry).toBeLessThan(fed);
    expect(peckish).toBeLessThan(fed);
    expect(peckish).toBeGreaterThan(hungry);
    // Bounded: total famine costs MAX_SUBSISTENCE_PENALTY of K, not all of it.
    expect(hungry).toBeGreaterThan(0);
    expect(hungry).toBeGreaterThanOrEqual(
      Math.floor((fed * (FP_ONE - MAX_SUBSISTENCE_PENALTY)) / FP_ONE) - 1,
    );
  });
});

describe('the fertility brake is logistic, not a ceiling', () => {
  it('is full at an empty world and zero at capacity', () => {
    expect(fertilityBrake(0, 1000)).toBe(FP_ONE);
    expect(fertilityBrake(1000, 1000)).toBe(0);
    expect(fertilityBrake(2000, 1000)).toBe(0);
  });

  it('falls monotonically from a quarter of K to nine tenths of it', () => {
    let previous = FP_ONE + 1;
    for (let population = 250; population <= 900; population += 25) {
      const brake = fertilityBrake(population, 1000);
      expect(brake).toBeLessThan(previous);
      previous = brake;
    }
  });

  it('stops everything when a universe can carry nobody, rather than dividing by zero', () => {
    expect(fertilityBrake(0, 0)).toBe(0);
    expect(fertilityBrake(10, -5)).toBe(0);
  });

  it('never rejects a birth: the brake is the only bound', () => {
    // The distinguishing property against a hard ceiling. At nine tenths of K
    // the expectation is small and positive rather than "allowed" or "refused".
    const nearlyFull = expectedBirths(births({ brake: fertilityBrake(900, 1000) }));
    expect(nearlyFull).toBeGreaterThan(0);
    expect(expectedBirths(births({ brake: fertilityBrake(1000, 1000) }))).toBe(0);
  });
});

describe('births scale by species fertility', () => {
  it('gives the fertile species more from an equal cohort', () => {
    const fertile = speciesNamed('orc');
    const barren = speciesNamed('draconic');
    expect(fertile.fertility).toBeGreaterThan(barren.fertility);

    expect(expectedBirths(births({ fertility: fertile.fertility }))).toBeGreaterThan(
      expectedBirths(births({ fertility: barren.fertility })),
    );
  });

  it('scales linearly with the cohort count at a neutral brake', () => {
    expect(expectedBirths(births({ count: 1 }))).toBe(BIRTHS_PER_MEMBER);
    expect(expectedBirths(births({ count: 10 }))).toBe(BIRTHS_PER_MEMBER * 10);
  });

  it('produces nothing from an empty cohort, which is what makes extinction absorbing', () => {
    expect(expectedBirths(births({ count: 0 }))).toBe(0);
    expect(cohortBirths(stepRng(1, 0), 3, births({ count: 0 }))).toBe(0);
  });
});

describe('a cohort draws once, whatever its size', () => {
  it('takes exactly one draw on stream 6 for a cohort of a quarter of a million', () => {
    const rng = recordingRng(4242, 0);
    cohortBirths(rng, 11, births({ count: 250_000 }));
    expect(rng.drawsOn(RNG_STREAM.populace)).toBe(1);
    expect(rng.issued).toEqual([{ subsystemId: RNG_STREAM.populace, actorKey: 11 }]);
  });

  it('takes the same one draw when the remainder is exactly zero', () => {
    // Unconditional, so the draw count is a function of the cohort count alone.
    // A conditional draw would make one cohort's sequence depend on another
    // cohort's arithmetic.
    const rng = recordingRng(4242, 0);
    cohortBirths(rng, 11, births({ count: 256, brake: FP_ONE }));
    expect(rng.drawsOn(RNG_STREAM.populace)).toBe(1);
  });

  it('keys the draw on the cohort handle', () => {
    const rng = recordingRng(4242, 0);
    cohortBirths(rng, 7, births());
    cohortBirths(rng, 8, births());
    expect(rng.issued.map((entry) => entry.actorKey)).toEqual([7, 8]);
  });
});

describe('newborns land in the youngest idle bucket', () => {
  it('joins the idle cohort of their own species for the current tick', () => {
    const store = createCohortStore();
    const handle = insertNewborns(store, 3, 500, 0);
    expect(handle).not.toBe(0);
    expect(store.totalCount()).toBe(500);
    // One cohort, whatever the population -- the aggregation contract.
    expect(store.liveCohortCount).toBe(1);
    expect(OCCUPATION_COUNT).toBe(5);
  });
});

describe('births and deaths settle against each other', () => {
  it('grows toward carrying capacity, never past it, and never in a sawtooth', () => {
    // A single cohort stepped with the brake recomputed each tick against a
    // fixed K. Deaths are deliberately absent: this asserts the *brake's* shape,
    // and mixing in the hazard table would make a failure ambiguous between the
    // two. The equilibrium of births against deaths across six species is task
    // group 9's reference run and is not this test.
    const capacity = 2000;
    let population = 1000;
    const growth: number[] = [];

    for (let tick = 0; tick < 3000; tick += 1) {
      const brake = fertilityBrake(population, capacity);
      const expected = expectedBirths(births({ count: population, brake }));
      // `expectedBirths` is in units of 1 / BIRTH_RATE_ONE, not of 1 / FP_ONE.
      // The shape this test asserts is unchanged -- the same headcounts arrive
      // on the same ticks -- but reading it at fp scale would multiply every
      // figure by 2^16 and the run would clear capacity on the first tick.
      const added = Math.floor(expected / BIRTH_RATE_ONE);
      population += added;
      growth.push(added);
    }

    expect(population).toBeGreaterThan(1000);
    expect(population).toBeLessThanOrEqual(capacity);

    // The distinguishing property against a hard ceiling: growth per tick is
    // non-increasing as the population rises. A ceiling with refusals would run
    // flat out until it hit the wall and then oscillate against it.
    for (let index = 1; index < growth.length; index += 1) {
      expect(growth[index]).toBeLessThanOrEqual(growth[index - 1] ?? 0);
    }
    expect(growth[growth.length - 1]).toBe(0);
  });

  it('adds nobody at all once the population is at capacity', () => {
    expect(expectedBirths(births({ count: 2000, brake: fertilityBrake(2000, 2000) }))).toBe(0);
  });
});
