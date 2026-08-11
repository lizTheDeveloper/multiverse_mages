/*
 * Multiverse Mages — cohort mortality: one draw per cohort, and no immortal dragons.
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

import { FP_ONE, RNG_STREAM } from '@mm/sim-core';
import { OCCUPATION } from '@mm/state';

import {
  LIFESPAN_RATE_ONE,
  POPULACE_STREAM,
  applyCohortMortality,
  cohortHazardPerTick,
  createCohortStore,
  naivePerLifespanRate,
} from '@mm/rules-world';

import {
  LONG_LIVED,
  LONG_LIVED_ID,
  SHORT_LIVED,
  SHORT_LIVED_ID,
  countingRng,
  drawsTaken,
  fixtureSpecies,
  placeholderHazard,
} from './populace-fixtures.js';

const IDLE = OCCUPATION.idle;

function mortalityOptions(worldTick: number, rootSeed = 7): {
  options: Parameters<typeof applyCohortMortality>[1];
  rng: ReturnType<typeof countingRng>;
} {
  const rng = countingRng(rootSeed, worldTick);
  return {
    rng,
    options: { hazard: placeholderHazard, species: fixtureSpecies, rng, worldTick },
  };
}

describe('populace draws only on stream 6', () => {
  it('names contracts.md §6 entry 6 and nothing else', () => {
    expect(POPULACE_STREAM).toBe(RNG_STREAM.populace);
    expect(POPULACE_STREAM).toBe(6);
  });

  it('takes every mortality draw on that stream', () => {
    const store = createCohortStore();
    store.add({ speciesId: SHORT_LIVED_ID, occupation: IDLE, birthTickBucket: 0 }, 1_000);
    store.add({ speciesId: LONG_LIVED_ID, occupation: IDLE, birthTickBucket: 0 }, 1_000);

    const { options, rng } = mortalityOptions(2_400);
    applyCohortMortality(store, options);

    expect(rng.handed.map((entry) => entry.subsystemId)).toEqual([6, 6]);
  });
});

describe('long-lived cohorts still die', () => {
  it('gives an 18,000-month species a strictly non-zero hazard at its nominal lifespan', () => {
    // The `economy` spec scenario, and the defect the whole extended-scale
    // helper exists for: at fp scale this quotient is 0 and dragons become
    // silently immortal.
    const perTick = cohortHazardPerTick(0, 18_060, LONG_LIVED, placeholderHazard);

    expect(perTick).toBeGreaterThan(0);
    expect(naivePerLifespanRate(placeholderHazard(FP_ONE), LONG_LIVED.lifespanMonths)).toBe(0);
  });

  it('accumulates deaths in a long-lived cohort over time', () => {
    const store = createCohortStore();
    const key = { speciesId: LONG_LIVED_ID, occupation: IDLE, birthTickBucket: 0 };
    store.add(key, 250_000);

    let deaths = 0;
    for (let tick = 18_060; tick < 18_120; tick += 1) {
      const { options } = mortalityOptions(tick, 11);
      deaths += applyCohortMortality(store, options).deaths;
    }

    expect(deaths).toBeGreaterThan(0);
    expect(store.countOf(store.find(key))).toBe(250_000 - deaths);
  });
});

describe('the draw count is one per cohort, whatever the population', () => {
  it('draws exactly one value for a cohort of 250,000', () => {
    // The `economy` spec's "draw count is one per cohort".
    const store = createCohortStore();
    store.add({ speciesId: SHORT_LIVED_ID, occupation: IDLE, birthTickBucket: 0 }, 250_000);

    const { options, rng } = mortalityOptions(600);
    const report = applyCohortMortality(store, options);

    expect(rng.handed).toHaveLength(1);
    expect(drawsTaken(rng.handed[0]!)).toBe(1);
    expect(rng.totalDraws()).toBe(1);
    expect(report.draws).toBe(1);
  });

  it('draws the same number of times for 1,000 people as for 1,000,000', () => {
    // The `economy` spec's "draw count is independent of population size",
    // holding cohort count equal. This is the load-bearing property of the
    // aggregation contract: the cost of a tick is O(cohorts), not O(people).
    const draws = (perCohort: number): number => {
      const store = createCohortStore();
      store.add({ speciesId: SHORT_LIVED_ID, occupation: IDLE, birthTickBucket: 0 }, perCohort);
      store.add({ speciesId: SHORT_LIVED_ID, occupation: IDLE, birthTickBucket: 120 }, perCohort);
      store.add({ speciesId: LONG_LIVED_ID, occupation: IDLE, birthTickBucket: 0 }, perCohort);
      const { options, rng } = mortalityOptions(1_200);
      applyCohortMortality(store, options);
      return rng.totalDraws();
    };

    expect(draws(1_000)).toBe(3);
    expect(draws(1_000_000)).toBe(3);
  });

  it('still draws for a cohort whose expected deaths are exactly zero', () => {
    // Unconditional by design. A draw skipped when the arithmetic comes out
    // even makes draw count a function of population — and re-phases every
    // later draw that cohort would have taken.
    const store = createCohortStore();
    store.add({ speciesId: LONG_LIVED_ID, occupation: IDLE, birthTickBucket: 0 }, 1);

    const { options, rng } = mortalityOptions(120);
    const report = applyCohortMortality(store, options);

    expect(report.deaths).toBe(0);
    expect(drawsTaken(rng.handed[0]!)).toBe(1);
  });
});

describe('the fractional part is resolved by the draw, not banked in state', () => {
  it('kills a whole number of people whose expectation is fractional, over many ticks', () => {
    // 1,000 members at the youngest hazard of an 18,000-month life expects
    // 1000 × 58 / 1,048,576 ≈ 0.055 deaths a tick — entirely fractional. If the
    // remainder were truncated instead of drawn, this cohort would be immortal;
    // if it were banked, §1.3 would have gained a fifth field.
    const store = createCohortStore();
    const key = { speciesId: LONG_LIVED_ID, occupation: IDLE, birthTickBucket: 0 };
    store.add(key, 1_000);

    let deaths = 0;
    for (let tick = 60; tick < 660; tick += 1) {
      const { options } = mortalityOptions(tick, 3);
      deaths += applyCohortMortality(store, options).deaths;
    }

    expect(deaths).toBeGreaterThan(0);
    expect(deaths).toBeLessThan(200);
  });

  it('never kills more people than the cohort holds', () => {
    const store = createCohortStore();
    const key = { speciesId: SHORT_LIVED_ID, occupation: IDLE, birthTickBucket: 0 };
    store.add(key, 3);

    // Far past the last hazard knot, where H is "effectively certain".
    const { options } = mortalityOptions(SHORT_LIVED.lifespanMonths * 3);
    const report = applyCohortMortality(store, options);

    expect(report.deaths).toBeLessThanOrEqual(3);
    expect(store.totalCount()).toBe(3 - report.deaths);
  });
});

describe('old cohorts decay to nothing and are reclaimed', () => {
  it('falls monotonically to zero and destroys the entity', () => {
    // The `economy` spec's "old cohorts decay to nothing": a cohort 120 years
    // past its birth, stepped with no transitions in or out.
    const store = createCohortStore();
    const key = { speciesId: SHORT_LIVED_ID, occupation: IDLE, birthTickBucket: 0 };
    const handle = store.add(key, 5_000);

    let previous = 5_000;
    let tick = 1_440;
    let destroyed = 0;
    while (store.isLive(handle) && tick < 20_000) {
      const { options } = mortalityOptions(tick, 5);
      const report = applyCohortMortality(store, options);
      destroyed += report.cohortsDestroyed;
      const now = store.isLive(handle) ? store.countOf(handle) : 0;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
      tick += 1;
    }

    expect(store.isLive(handle)).toBe(false);
    expect(destroyed).toBe(1);
    expect(store.liveCohortCount).toBe(0);
    expect(store.find(key)).toBe(0);
    expect(store.entities.freeCount).toBe(1);
  });
});

describe('mortality refuses what it cannot compute', () => {
  it('names an unknown species rather than guessing a lifespan', () => {
    const store = createCohortStore();
    store.add({ speciesId: 99, occupation: IDLE, birthTickBucket: 0 }, 10);
    const { options } = mortalityOptions(120);

    expect(() => applyCohortMortality(store, options)).toThrow(/does not know/);
  });

  it('keeps the extended scale visible so nothing narrows before comparing', () => {
    expect(LIFESPAN_RATE_ONE).toBe(FP_ONE << 10);
  });
});
