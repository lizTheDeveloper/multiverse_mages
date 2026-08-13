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
 * The birth-and-death equilibrium tests at the bottom of this file are the
 * `economy` spec's *"Deaths balance births at equilibrium"* scenario, run at
 * cohort granularity rather than through a whole world tick. That is honest
 * about its scope: it demonstrates that the logistic brake and the shared
 * hazard table settle against each other. Whether the **reference scenario**
 * does is a different question, and the answer measured for `mages-and-species`
 * task 8.7 is *not within the horizon that change commits to*:
 *
 * ```text
 *  world year   population   K        P/K     births/deaths over the 25y window
 *      200        18,713     29,831   0.627   1.106
 *      300        22,507     29,831   0.754   1.201
 *      400        25,760     29,608   0.870   1.127
 *      500        25,952     29,887   0.868   0.999
 * ```
 *
 * So the reference universe *does* settle — at roughly world year 475, more
 * than twice the two-hundred-year horizon task 9.2 fixes. At year two hundred
 * births still exceed deaths by eleven per cent and the population is at five
 * eighths of `K`. Task 8.7's box is therefore left unticked: what is asserted
 * below is that the mechanism balances, and what
 * `packages/scenario/test/unit/reference-long-run.test.ts` asserts is that the
 * reference run *approaches* the balance. Neither is "the reference scenario at
 * carrying capacity", and neither is written as though it were.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, RNG_STREAM } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';

import { OCCUPATION } from '@mm/state';

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
  applyCohortMortality,
  carryingCapacity,
  cohortBirths,
  createCohortStore,
  expectedBirths,
  fertilityBrake,
  insertNewborns,
  maxCarryingCapacity,
  primitiveFloor,
  territoryExtent,
} from '../../src/index.js';
import type { BirthInput } from '../../src/index.js';

import { primitiveNamed, shippedRegistry, speciesNamed } from './universities-fixtures.js';
import { recordingRng, stepRng } from './mage-fixtures.js';
import {
  LONG_LIVED_ID,
  SHORT_LIVED_ID,
  fixtureSpecies,
  placeholderHazard,
} from './populace-fixtures.js';

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
    expect(carryingCapacity({ territory: TERRITORY, food: 0, completedCapacity: 0 })).toBe(
      TERRITORY.baseCapacity,
    );
  });

  it('carries nobody without land, however much is stockpiled on it', () => {
    expect(
      carryingCapacity({ territory: NO_TERRITORY, food: 1_000_000, completedCapacity: 500 }),
    ).toBe(0);
  });

  it('rises with the materials stock and then stops rising', () => {
    // This is the whole fix, as an assertion. The old shape was
    // `CAPACITY_PER_MATERIAL × materials`, which is monotone with no upper
    // limit, so a stock that grows every tick produced a `K` that grew every
    // tick. Here the ramp ends.
    const bare = carryingCapacity({ territory: TERRITORY, food: 0, completedCapacity: 0 });
    const stocked = carryingCapacity({
      territory: TERRITORY,
      food: Math.floor(SATURATING_STOCK / 2),
      completedCapacity: 0,
    });
    const saturated = carryingCapacity({
      territory: TERRITORY,
      food: SATURATING_STOCK,
      completedCapacity: 0,
    });
    const absurd = carryingCapacity({
      territory: TERRITORY,
      food: SATURATING_STOCK * 1_000,
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
    const bare = carryingCapacity({ territory: TERRITORY, food: 0, completedCapacity: 0 });
    const few = carryingCapacity({ territory: TERRITORY, food: 0, completedCapacity: 10 });
    const many = carryingCapacity({
      territory: TERRITORY,
      food: 0,
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

    for (const food of [0, 1024, SATURATING_STOCK, SATURATING_STOCK * 10_000]) {
      for (const completedCapacity of [0, 10, 100_000]) {
        expect(
          carryingCapacity({ territory: TERRITORY, food, completedCapacity }),
          `K exceeded its stated bound at food ${String(food)} and ` +
            `${String(completedCapacity)} seats`,
        ).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('falls when subsistence goes unmet, and no further than the documented bound', () => {
    const stock = SATURATING_STOCK / 4;
    const fed = carryingCapacity({ territory: TERRITORY, food: stock, completedCapacity: 0 });
    const hungry = carryingCapacity({
      territory: TERRITORY,
      food: stock,
      completedCapacity: 0,
      subsistenceShortfallShare: FP_ONE,
    });
    const peckish = carryingCapacity({
      territory: TERRITORY,
      food: stock,
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

  it('holds the primitive floor under a Perdo-heavy stack of remove-mode bonuses', () => {
    const floor = primitiveFloor(primitiveNamed('fertility'));
    expect(floor).toBeDefined();

    const counters = new ClampCounters();
    const driven = expectedBirths({ ...births({ fertilityBonuses: [-2000, -2000] }), counters });
    // A floored multiplier still produces some births rather than none or a
    // negative expectation — the division hazard the floor exists to stop.
    expect(driven).toBeGreaterThan(0);
    expect(counters.count('fertility')).toBeGreaterThan(0);
  });

  it('routes a Rego control clamp: a floor raises expected births, a ceiling lowers them', () => {
    const bare = expectedBirths(births());
    const floored = expectedBirths({ ...births(), clamp: { floor: 3000 } });
    expect(floored).toBeGreaterThan(bare);

    const boosted = expectedBirths({ ...births(), fertilityBonuses: [4096] });
    const ceiled = expectedBirths({ ...births(), fertilityBonuses: [4096], clamp: { ceiling: 1500 } });
    expect(ceiled).toBeLessThan(boosted);
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

  it('settles births against deaths within a documented tolerance, once it settles', () => {
    // **The half of task 8.7 that the test above deliberately held out.** That
    // one runs the brake with deaths absent, so that a failure is unambiguously
    // the brake's; this one puts the shared hazard table back in and asks the
    // question the `economy` spec actually states — *"deaths balance births at
    // equilibrium"*.
    //
    // The composed loop, in the world tick's order: mortality, then births
    // against a brake computed from the post-mortality headcount. `K` is fixed
    // rather than derived, because a `K` that moves with the materials stock
    // makes "at equilibrium" a moving target and the failure would be ambiguous
    // between the population and the bound. What `K` is for the *reference
    // scenario*, and when it gets there, is in the module note.
    const capacity = 4000;
    const store = createCohortStore();
    // One long-lived cohort and one short-lived, born a maturity ago, so the
    // hazard table is entered at two different normalized ages from tick one.
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.laborer, birthTickBucket: -240 },
      500,
    );
    store.add(
      { speciesId: LONG_LIVED_ID, occupation: OCCUPATION.laborer, birthTickBucket: -1200 },
      500,
    );

    const populations: number[] = [];
    const perTick: { born: number; died: number }[] = [];
    for (let tick = 0; tick < 6000; tick += 1) {
      const rng = stepRng(0x0008_0007, tick);
      const died = applyCohortMortality(store, {
        hazard: placeholderHazard,
        species: fixtureSpecies,
        rng,
        worldTick: tick,
      }).deaths;

      const brake = fertilityBrake(store.totalCount(), capacity);
      // Collected before insertion, for the reason `deliverBirths` collects:
      // a walk that saw its own newborns would breed them in the tick they
      // were born.
      const fertile: { handle: number; speciesId: number; count: number }[] = [];
      store.forEach((handle, key, count) => {
        if (count > 0) fertile.push({ handle, speciesId: key.speciesId, count });
      });
      let born = 0;
      for (const cohort of fertile) {
        const count = cohortBirths(rng, cohort.handle, births({ count: cohort.count, brake }));
        if (count > 0) {
          insertNewborns(store, cohort.speciesId, count, tick);
          born += count;
        }
      }
      populations.push(store.totalCount());
      perTick.push({ born, died });
    }

    // It grew, it stopped short of `K`, and it never passed it. Stopping short
    // is the whole point: the equilibrium of a logistic brake against a
    // mortality table is *below* the capacity, because the brake is exactly
    // zero at `K` and deaths are not.
    const settled = populations[populations.length - 1] ?? 0;
    expect(settled).toBeGreaterThan(1000);
    expect(Math.max(...populations)).toBeLessThanOrEqual(capacity);
    expect(settled).toBeLessThan(capacity);

    // **The documented tolerance: five per cent over the final quarter.** A
    // per-tick equality is not available and not the claim — births arrive
    // through one fractional draw per cohort, so a single tick is a Bernoulli
    // outcome and "balance" is a statement about a window. A quarter of the run
    // is 1,500 ticks, which is a hundred and twenty-five world years.
    const tail = perTick.slice(perTick.length * 0.75);
    const bornInTail = tail.reduce((sum, entry) => sum + entry.born, 0);
    const diedInTail = tail.reduce((sum, entry) => sum + entry.died, 0);
    const imbalance = Math.abs(bornInTail - diedInTail) / Math.max(1, diedInTail);
    console.log(
      `8.7 cohort-level equilibrium: population ${String(settled)} against K ${String(capacity)}, ` +
        `${String(bornInTail)} born and ${String(diedInTail)} died over the final quarter ` +
        `(imbalance ${(imbalance * 100).toFixed(2)}%).`,
    );
    expect(imbalance).toBeLessThan(0.05);

    // And the population is flat over that window rather than balanced on
    // average while drifting — the failure a ratio alone cannot see.
    const quarter = Math.floor(populations.length * 0.75);
    const atQuarter = populations[quarter] ?? 0;
    expect(Math.abs(settled - atQuarter) / Math.max(1, atQuarter)).toBeLessThan(0.05);
  });
});
