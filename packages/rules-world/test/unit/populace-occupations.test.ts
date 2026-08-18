/*
 * Multiverse Mages — the five occupations and the rate-limited labour market.
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

import { FP_ONE, NULL_ENTITY, floorDiv } from '@mm/sim-core';
import { OCCUPATION } from '@mm/state';

import {
  BIRTH_BUCKET_TICKS,
  LABORERS_PER_BUILD_UNIT,
  cohortShare,
  NO_DEMAND,
  OCCUPATIONS_IN_ORDER,
  OCCUPATION_COUNT,
  RETIREMENT_NORMALIZED_AGE,
  SCRIBES_PER_QUEUED_GRIMOIRE,
  TRANSFER_RATE_PER_TICK,
  computeOccupationDemand,
  countByOccupation,
  createCohortStore,
  insertNewborns,
  isOccupation,
  mayTransitionTo,
  reallocateOccupations,
  retireSenescentCohorts,
  zeroPerOccupation,
} from '@mm/rules-world';

import { LONG_LIVED_ID, SHORT_LIVED, SHORT_LIVED_ID, fixtureSpecies } from './populace-fixtures.js';

const ADULT_BIRTH_BUCKET = 0;
/** A tick at which the `ADULT_BIRTH_BUCKET` cohort is a working adult, not senescent. */
const ADULT_TICK = 360;

function options(worldTick: number, demand = NO_DEMAND) {
  return { demand, species: fixtureSpecies, worldTick };
}

describe('the occupations are exactly the five of contracts.md §1.3', () => {
  it('enumerates them in ascending contracted value', () => {
    expect(OCCUPATIONS_IN_ORDER).toEqual([
      OCCUPATION.laborer,
      OCCUPATION.scribe,
      OCCUPATION.student,
      OCCUPATION.soldier,
      OCCUPATION.idle,
    ]);
    expect(OCCUPATION_COUNT).toBe(5);
  });

  it('rejects a sixth', () => {
    expect(isOccupation(5)).toBe(false);
    expect(isOccupation(-1)).toBe(false);
    expect(isOccupation(4)).toBe(true);
  });

  it('keys every per-occupation counter in that same order', () => {
    // Insertion order is what these records serialize and compare in.
    expect(Object.keys(zeroPerOccupation())).toEqual(['0', '1', '2', '3', '4']);
  });
});

describe('newborns are idle', () => {
  it('lands them in the youngest idle bucket of their species', () => {
    const store = createCohortStore();
    insertNewborns(store, SHORT_LIVED_ID, 500, 1_237);

    const handle = store.find({
      speciesId: SHORT_LIVED_ID,
      occupation: OCCUPATION.idle,
      birthTickBucket: 1_237,
    });
    expect(handle).not.toBe(NULL_ENTITY);
    expect(store.keyOf(handle).birthTickBucket).toBe(1_200);
    expect(store.countOf(handle)).toBe(500);
  });

  it('merges a decade of monthly births into one cohort', () => {
    const store = createCohortStore();
    for (let tick = 1_200; tick < 1_320; tick += 1) {
      insertNewborns(store, SHORT_LIVED_ID, 3, tick);
    }
    expect(store.liveCohortCount).toBe(1);
    expect(store.totalCount()).toBe(360);
  });

  it('creates nothing for a species with no births', () => {
    const store = createCohortStore();
    expect(insertNewborns(store, SHORT_LIVED_ID, 0, 0)).toBe(NULL_ENTITY);
    expect(store.liveCohortCount).toBe(0);
  });
});

describe('children cannot labor', () => {
  it('refuses every destination but student below maturity', () => {
    const young = { mature: false, senescent: false };
    expect(mayTransitionTo(OCCUPATION.laborer, young)).toBe(false);
    expect(mayTransitionTo(OCCUPATION.scribe, young)).toBe(false);
    expect(mayTransitionTo(OCCUPATION.soldier, young)).toBe(false);
    expect(mayTransitionTo(OCCUPATION.student, young)).toBe(true);
    expect(mayTransitionTo(OCCUPATION.idle, young)).toBe(true);
  });

  it('refuses every destination but idle past retirement age', () => {
    const old = { mature: true, senescent: true };
    for (const occupation of OCCUPATIONS_IN_ORDER) {
      expect(mayTransitionTo(occupation, old)).toBe(occupation === OCCUPATION.idle);
    }
  });

  it('leaves an immature cohort where it is when laborers are wanted', () => {
    const store = createCohortStore();
    // Born in the current decade, so far below `maturityMonths`.
    insertNewborns(store, SHORT_LIVED_ID, 10_000, 0);

    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 5_000 };
    const report = reallocateOccupations(store, options(60, demand));

    expect(report.moved).toBe(0);
    expect(report.unmetDemand[OCCUPATION.laborer]).toBe(5_000);
  });

  it('admits the same cohort as students', () => {
    const store = createCohortStore();
    insertNewborns(store, SHORT_LIVED_ID, 10_000, 0);

    const demand = { ...NO_DEMAND, [OCCUPATION.student]: 5_000 };
    const report = reallocateOccupations(store, options(60, demand));

    expect(report.moved).toBeGreaterThan(0);
    expect(report.movedInto[OCCUPATION.student]).toBe(report.moved);
  });
});

describe('reallocation is rate-limited', () => {
  it('moves no more than transferRatePerTick of any source cohort', () => {
    // The `economy` spec's "reallocation is gradual": demand far above supply.
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: ADULT_BIRTH_BUCKET },
      10_000,
    );

    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 10_000 };
    const report = reallocateOccupations(store, options(ADULT_TICK, demand));

    const cap = floorDiv(10_000 * TRANSFER_RATE_PER_TICK, FP_ONE);
    expect(report.moved).toBe(cap);
    expect(cap).toBeLessThan(10_000);
    expect(report.unmetDemand[OCCUPATION.laborer]).toBe(10_000 - cap);
  });

  it('takes several ticks to satisfy demand it could satisfy at once', () => {
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: ADULT_BIRTH_BUCKET },
      10_000,
    );
    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 4_000 };

    let ticks = 0;
    while (countByOccupation(store)[OCCUPATION.laborer] < 4_000 && ticks < 100) {
      reallocateOccupations(store, options(ADULT_TICK, demand));
      ticks += 1;
    }

    expect(ticks).toBeGreaterThan(1);
    expect(countByOccupation(store)[OCCUPATION.laborer]).toBe(4_000);
  });

  it('never re-exports people who arrived this tick', () => {
    // The budget is taken from counts *before* any move, so a destination
    // cohort created mid-pass has no budget and cannot be drained again.
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: ADULT_BIRTH_BUCKET },
      10_000,
    );
    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 1_000, [OCCUPATION.scribe]: 1_000 };

    const report = reallocateOccupations(store, options(ADULT_TICK, demand));
    const cap = floorDiv(10_000 * TRANSFER_RATE_PER_TICK, FP_ONE);

    // One source cohort, one budget: the two demands share it, and nothing that
    // reached `laborer` this tick moves on to `scribe`.
    expect(report.moved).toBe(cap);
    expect(report.movedInto[OCCUPATION.laborer] + report.movedInto[OCCUPATION.scribe]).toBe(cap);
  });
});

/**
 * W185. `scribe` in the reference universe had a sink and no source: over 600
 * ticks at `cohortSize: 4` it fell from 24 to 13 while reallocation moved
 * **zero** scribes in *either* direction, on every tick. The cause was not an
 * asymmetric comparison — `need` is computed for `scribe` exactly as for
 * `student`, and injecting `scribe` demand of 44 produced a byte-identical run.
 * It was that the transfer budget floored **per cohort**, and cohorts are keyed
 * on species × occupation × birth decade, so essentially all of them sit below
 * `1 / TRANSFER_RATE_PER_TICK` = 16 and floored to a budget of zero.
 *
 * Every other flow through an occupation is unrated — mortality, retirement,
 * and the promotion phase writing failed students into `laborer` — so the floor
 * bound in one direction only.
 */
const ADULT_LONG_LIVED_BUCKET = 7_200;
/** A tick at which every bucket below is a working adult long-lived cohort. */
const LONG_LIVED_ADULT_TICK = 20_000;

function fragmentedIdle(cohorts: number, each: number) {
  const store = createCohortStore();
  for (let index = 0; index < cohorts; index += 1) {
    store.add(
      {
        speciesId: LONG_LIVED_ID,
        occupation: OCCUPATION.idle,
        // Distinct birth decades: distinct cohort keys, same age band.
        birthTickBucket: ADULT_LONG_LIVED_BUCKET + index * BIRTH_BUCKET_TICKS,
      },
      each,
    );
  }
  return store;
}

describe('an occupation can be grown, not only shrunk (W185)', () => {
  it('moves people out of cohorts that are all below the old sixteen-member cliff', () => {
    // Ten cohorts of four. Under the per-cohort floor every budget was
    // floorDiv(4 * 64, 1024) = 0 and this moved nobody, forever.
    const store = fragmentedIdle(10, 4);
    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 40 };

    const report = reallocateOccupations(store, {
      demand,
      species: fixtureSpecies,
      worldTick: LONG_LIVED_ADULT_TICK,
    });

    expect(report.moved).toBeGreaterThan(0);
    expect(report.movedInto[OCCUPATION.laborer]).toBe(report.moved);
    expect(report.movedOutOf[OCCUPATION.idle]).toBe(report.moved);
  });

  it('moves the same number of people however the occupation is fragmented', () => {
    // The trap `portal.ts` fell into: a universe-wide target deployed *per
    // cohort* multiplies by the number of cohorts. The rate pool is a property
    // of the occupation, so splitting forty people forty ways changes nothing.
    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 40 };
    const options = {
      demand,
      species: fixtureSpecies,
      worldTick: LONG_LIVED_ADULT_TICK,
    };

    const whole = reallocateOccupations(fragmentedIdle(1, 40), options);
    const split = reallocateOccupations(fragmentedIdle(10, 4), options);
    const dust = reallocateOccupations(fragmentedIdle(40, 1), options);

    expect(whole.moved).toBe(floorDiv(40 * TRANSFER_RATE_PER_TICK, FP_ONE));
    expect(split.moved).toBe(whole.moved);
    expect(dust.moved).toBe(whole.moved);
  });

  it('holds the aggregate rate even when every cohort rounds its share up', () => {
    // A hundred cohorts of four: the shares sum to 100, the control law asks
    // for 6.25% of 400, and the pool is what binds.
    const store = fragmentedIdle(100, 4);
    const report = reallocateOccupations(store, {
      demand: { ...NO_DEMAND, [OCCUPATION.laborer]: 400 },
      species: fixtureSpecies,
      worldTick: LONG_LIVED_ADULT_TICK,
    });

    expect(cohortShare(4, TRANSFER_RATE_PER_TICK)).toBe(1);
    expect(report.moved).toBe(floorDiv(400 * TRANSFER_RATE_PER_TICK, FP_ONE));
    expect(report.moved).toBeLessThan(100);
  });

  it('grows a fragmented occupation to its demand over repeated ticks', () => {
    // Forty cohorts of four: not one of them could move a person before W185.
    const store = fragmentedIdle(40, 4);
    const demand = { ...NO_DEMAND, [OCCUPATION.scribe]: 100 };
    const options = {
      demand,
      species: fixtureSpecies,
      worldTick: LONG_LIVED_ADULT_TICK,
    };

    let ticks = 0;
    while (countByOccupation(store)[OCCUPATION.scribe] < 100 && ticks < 500) {
      reallocateOccupations(store, options);
      ticks += 1;
    }

    expect(countByOccupation(store)[OCCUPATION.scribe]).toBe(100);
    // Still a governor, not an assignment: it took more than one tick.
    expect(ticks).toBeGreaterThan(1);
  });

  it('rounds a cohort share up so that a small cohort is not frozen', () => {
    // The fork, stated in `reallocation.ts`: four people may send one, which is
    // 25% and not 6.25%. Flooring is the defect; the occupation pool is what
    // preserves the control law.
    expect(cohortShare(4, TRANSFER_RATE_PER_TICK)).toBe(1);
    expect(cohortShare(15, TRANSFER_RATE_PER_TICK)).toBe(1);
    expect(cohortShare(16, TRANSFER_RATE_PER_TICK)).toBe(1);
    expect(cohortShare(17, TRANSFER_RATE_PER_TICK)).toBe(2);
    expect(cohortShare(0, TRANSFER_RATE_PER_TICK)).toBe(0);
  });

  it('fills a university seat from idle and from nowhere else', () => {
    // `student` consumes rather than produces, and the promotion phase empties
    // its seats every tick, so letting it draw from working occupations makes
    // the university a pump that converts the populace into mages. Without
    // this rule and with the pool fix, three of five founding species reach
    // zero populace inside sixty years of the long run.
    const store = createCohortStore();
    const key = {
      speciesId: SHORT_LIVED_ID,
      occupation: OCCUPATION.laborer,
      birthTickBucket: ADULT_BIRTH_BUCKET,
    };
    store.add(key, 4_000);
    store.add({ ...key, occupation: OCCUPATION.scribe }, 4_000);

    const report = reallocateOccupations(
      store,
      options(ADULT_TICK, { ...NO_DEMAND, [OCCUPATION.student]: 4_000 }),
    );

    expect(report.moved).toBe(0);
    expect(report.unmetDemand[OCCUPATION.student]).toBe(4_000);
    expect(countByOccupation(store)[OCCUPATION.laborer]).toBe(4_000);
    expect(countByOccupation(store)[OCCUPATION.scribe]).toBe(4_000);
  });

  it('still fills a university seat from idle', () => {
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: ADULT_BIRTH_BUCKET },
      4_000,
    );
    const report = reallocateOccupations(
      store,
      options(ADULT_TICK, { ...NO_DEMAND, [OCCUPATION.student]: 4_000 }),
    );

    expect(report.movedInto[OCCUPATION.student]).toBe(
      floorDiv(4_000 * TRANSFER_RATE_PER_TICK, FP_ONE),
    );
  });

  it('reports what left each occupation, not only what arrived', () => {
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: ADULT_BIRTH_BUCKET },
      10_000,
    );
    const report = reallocateOccupations(
      store,
      options(ADULT_TICK, { ...NO_DEMAND, [OCCUPATION.laborer]: 10_000 }),
    );

    expect(report.movedOutOf[OCCUPATION.idle]).toBe(report.moved);
    expect(report.movedOutOf[OCCUPATION.laborer]).toBe(0);
  });
});

describe('allocation order is deterministic', () => {
  it('draws from idle before draining a working occupation', () => {
    const store = createCohortStore();
    const idleKey = {
      speciesId: SHORT_LIVED_ID,
      occupation: OCCUPATION.idle,
      birthTickBucket: ADULT_BIRTH_BUCKET,
    };
    store.add(idleKey, 4_000);
    store.add({ ...idleKey, occupation: OCCUPATION.soldier }, 4_000);

    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 200 };
    const report = reallocateOccupations(store, options(ADULT_TICK, demand));

    expect(report.movedInto[OCCUPATION.laborer]).toBe(200);
    expect(store.countOf(store.find({ ...idleKey, occupation: OCCUPATION.soldier }))).toBe(4_000);
    expect(store.countOf(store.find(idleKey))).toBe(3_800);
  });

  it('produces the same result whatever order the cohorts were created in', () => {
    // The property that forced key order over slot order. Both stores end in
    // the *same state*; only the history differs. Ascending-slot iteration is
    // reproducible but is a function of that history, so a greedy allocator
    // reading it splits the same shortfall differently between two identical
    // states — the divergence class `entity-store.ts` warns about, one level up.
    const build = (reversed: boolean): number[] => {
      const store = createCohortStore();
      const first = { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: 0 };
      const second = { ...first, birthTickBucket: 120 };
      if (reversed) {
        store.add(second, 3_000);
        store.add(first, 5_000);
      } else {
        store.add(first, 5_000);
        store.add(second, 3_000);
      }
      const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 400 };
      reallocateOccupations(store, options(600, demand));
      return store
        .handles()
        .map((handle) => store.countOf(handle))
        .sort((a, b) => a - b);
    };

    expect(build(false)).toEqual(build(true));
  });

  it('does not drain an occupation that is itself below its demand', () => {
    // Rate limiting alone still lets two short occupations rob each other on a
    // two-tick period. Only surplus is exportable.
    const store = createCohortStore();
    const key = {
      speciesId: SHORT_LIVED_ID,
      occupation: OCCUPATION.scribe,
      birthTickBucket: ADULT_BIRTH_BUCKET,
    };
    store.add(key, 1_000);

    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 500, [OCCUPATION.scribe]: 1_000 };
    const report = reallocateOccupations(store, options(ADULT_TICK, demand));

    expect(report.moved).toBe(0);
    expect(report.unmetDemand[OCCUPATION.laborer]).toBe(500);
    expect(store.countOf(store.find(key))).toBe(1_000);
  });

  it('does not oscillate once demand is met and held constant', () => {
    // The `economy` spec's "the economy does not oscillate", in miniature: a
    // sustained two-tick alternation would show up as movement continuing after
    // the mix has settled.
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: ADULT_BIRTH_BUCKET },
      10_000,
    );
    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 2_000, [OCCUPATION.scribe]: 1_000 };

    for (let tick = 0; tick < 200; tick += 1) {
      reallocateOccupations(store, options(ADULT_TICK, demand));
    }
    const settled = countByOccupation(store);

    for (let tick = 0; tick < 10; tick += 1) {
      expect(reallocateOccupations(store, options(ADULT_TICK, demand)).moved).toBe(0);
    }
    expect(settled[OCCUPATION.laborer]).toBe(2_000);
    expect(settled[OCCUPATION.scribe]).toBe(1_000);
  });
});

describe('demand comes from the sources the spec names', () => {
  it('turns construction backlog, the scribing queue, capacity, the soldier target and the bill into headcount', () => {
    const demand = computeOccupationDemand({
      constructionBacklog: FP_ONE * 2,
      scribingQueueDepth: 7,
      universityCapacity: 60,
      latentMagicUsers: 10_000,
      standingSoldierTarget: 25,
      materialsObligation: 0,
    });

    expect(demand[OCCUPATION.laborer]).toBe(2 * LABORERS_PER_BUILD_UNIT);
    expect(demand[OCCUPATION.scribe]).toBe(7 * SCRIBES_PER_QUEUED_GRIMOIRE);
    expect(demand[OCCUPATION.student]).toBe(60);
    expect(demand[OCCUPATION.soldier]).toBe(25);
  });

  // W193. The defect this replaces was `[OCCUPATION.student]: universityCapacity`
  // — intake was seats, so a universe's mage production was a property of its
  // buildings and not of its people, and doubling the population changed nothing.
  it('asks for the smaller of the seats it has and the people who could fill them', () => {
    const seatBound = computeOccupationDemand({
      constructionBacklog: 0,
      scribingQueueDepth: 0,
      universityCapacity: 60,
      latentMagicUsers: 10_000,
      standingSoldierTarget: 0,
      materialsObligation: 0,
    });
    expect(seatBound[OCCUPATION.student]).toBe(60);

    const peopleBound = computeOccupationDemand({
      constructionBacklog: 0,
      scribingQueueDepth: 0,
      universityCapacity: 60,
      latentMagicUsers: 9,
      standingSoldierTarget: 0,
      materialsObligation: 0,
    });
    expect(peopleBound[OCCUPATION.student]).toBe(9);
  });

  it('asks for no students at all in a population with none who could be mages', () => {
    const demand = computeOccupationDemand({
      constructionBacklog: 0,
      scribingQueueDepth: 0,
      universityCapacity: 1_000,
      latentMagicUsers: 0,
      standingSoldierTarget: 0,
      materialsObligation: 0,
    });
    expect(demand[OCCUPATION.student]).toBe(0);
  });

  it('never demands idle — it is the residual, not a job', () => {
    const demand = computeOccupationDemand({
      constructionBacklog: FP_ONE,
      scribingQueueDepth: 3,
      universityCapacity: 10,
      latentMagicUsers: 10,
      standingSoldierTarget: 4,
      materialsObligation: 96,
    });
    expect(demand[OCCUPATION.idle]).toBe(0);
  });

  it('asks for nobody when nothing is being built, queued, taught, garrisoned, or owed', () => {
    expect(
      computeOccupationDemand({
        constructionBacklog: 0,
        scribingQueueDepth: 0,
        universityCapacity: 0,
        latentMagicUsers: 0,
        standingSoldierTarget: 0,
        materialsObligation: 0,
      }),
    ).toEqual(NO_DEMAND);
  });

  it('rejects a fractional or negative input rather than flooring it', () => {
    expect(() =>
      computeOccupationDemand({
        constructionBacklog: -1,
        scribingQueueDepth: 0,
        universityCapacity: 0,
        latentMagicUsers: 0,
        standingSoldierTarget: 0,
        materialsObligation: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe('idle covers those past productive age', () => {
  it('retires a senescent working cohort in full, not at the transfer rate', () => {
    const store = createCohortStore();
    const key = {
      speciesId: SHORT_LIVED_ID,
      occupation: OCCUPATION.laborer,
      birthTickBucket: 0,
    };
    store.add(key, 6_000);

    // Normalized age past the threshold: three quarters of a 960-month life.
    const worldTick = SHORT_LIVED.lifespanMonths - 60;
    expect(retireSenescentCohorts(store, { species: fixtureSpecies, worldTick })).toBe(6_000);

    expect(store.find(key)).toBe(NULL_ENTITY);
    expect(countByOccupation(store)[OCCUPATION.idle]).toBe(6_000);
  });

  it('leaves a working-age cohort alone', () => {
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.laborer, birthTickBucket: 0 },
      6_000,
    );
    expect(
      retireSenescentCohorts(store, { species: fixtureSpecies, worldTick: ADULT_TICK }),
    ).toBe(0);
  });

  it('does not put the retired back to work', () => {
    const store = createCohortStore();
    store.add(
      { speciesId: SHORT_LIVED_ID, occupation: OCCUPATION.idle, birthTickBucket: 0 },
      6_000,
    );

    const worldTick = SHORT_LIVED.lifespanMonths - 60;
    const demand = { ...NO_DEMAND, [OCCUPATION.laborer]: 5_000 };
    const report = reallocateOccupations(store, options(worldTick, demand));

    expect(report.moved).toBe(0);
    expect(report.unmetDemand[OCCUPATION.laborer]).toBe(5_000);
  });

  it('states the retirement threshold in normalized age, so all species share it', () => {
    expect(RETIREMENT_NORMALIZED_AGE).toBe(768);
    expect(RETIREMENT_NORMALIZED_AGE).toBeLessThan(FP_ONE);
  });
});
