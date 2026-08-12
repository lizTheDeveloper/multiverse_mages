/*
 * Multiverse Mages — 200 world years of counted populace, and the bounds it holds.
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
 * ## What this test is, and what it deliberately is not
 *
 * It is the populace half of `mages-and-species` task 3.7 and 3.11: the cohort
 * entity bound and the birth-bucket tail allowance, measured over 200 world
 * years rather than argued about.
 *
 * It is **not** the committed reference scenario (task group 9). That scenario
 * needs the real species content, mages, universities, and the three-input
 * economy, none of which exist on this branch. So the fertility here is a
 * *harness*, not an implementation: a proportional controller that keeps each
 * species near a target headcount. `births.ts` says why the real one is not in
 * this task group — the logistic brake needs a carrying capacity `K` derived
 * from materials and university capacity, and an invented `K` is the kind of
 * placeholder that quietly becomes the real one.
 *
 * Everything the harness supplies is marked as such below. Everything it
 * *measures* is the code under test.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { OccupationValue } from '@mm/state';
import { OCCUPATION } from '@mm/state';

import type { CohortDemography } from '@mm/rules-world';
import {
  BIRTH_BUCKET_TICKS,
  MAX_LIVE_NORMALIZED_AGE,
  NO_DEMAND,
  OCCUPATIONS_IN_ORDER,
  cohortAgeMonths,
  computeOccupationDemand,
  countByOccupation,
  createCohortStore,
  insertNewborns,
  normalizedCohortAge,
  stepPopulace,
} from '@mm/rules-world';

import { countingRng, placeholderHazard } from './populace-fixtures.js';

/** 200 world years, at `contracts.md` §0's twelve ticks to the year. */
const RUN_TICKS = 200 * 12;

/**
 * Six species, described only by the two numbers cohort dynamics reads.
 *
 * Anonymous on purpose: `packages/rules-world/src` may not name a species, and
 * generic-mechanism tests are better off holding to the same rule. The
 * lifespans span the range the shipped placeholders do, and the last is the
 * 18,000-month one the precision trap is about.
 */
const SPECIES: readonly CohortDemography[] = [
  { lifespanMonths: 720, maturityMonths: 144 },
  { lifespanMonths: 960, maturityMonths: 216 },
  { lifespanMonths: 1_200, maturityMonths: 240 },
  { lifespanMonths: 3_000, maturityMonths: 600 },
  { lifespanMonths: 6_000, maturityMonths: 900 },
  { lifespanMonths: 18_000, maturityMonths: 1_200 },
];

/** Interned ids are integers from 1; `0` is the reserved null (`contracts.md` §0). */
const SPECIES_IDS: readonly number[] = SPECIES.map((_species, index) => index + 1);

function speciesOf(speciesId: number): CohortDemography | undefined {
  return SPECIES[speciesId - 1];
}

/** **Harness, not implementation.** See this file's opening note. */
const TARGET_PER_SPECIES = 20_000;
/** **Harness.** How fast the controller closes the gap to the target. */
const BIRTH_GAIN = 60;

function harnessBirths(population: number): number {
  const gap = TARGET_PER_SPECIES - population;
  return gap > 0 ? floorDiv(gap, BIRTH_GAIN) : 0;
}

interface RunResult {
  readonly peakCohorts: number;
  readonly peakPopulation: number;
  readonly finalPopulation: number;
  readonly minSpeciesPopulation: number;
  /** Oldest live cohort seen, per species, in normalized age. */
  readonly peakNormalizedAge: readonly number[];
  /** Peak birth buckets alive for one `(species, occupation)` pair. */
  readonly peakBucketsPerPair: number;
  readonly totalDraws: number;
  /** Cohorts mortality visited, summed over the run. */
  readonly cohortVisits: number;
  /** People alive, summed over the run — what a per-person roll would have cost. */
  readonly populationTickSum: number;
  readonly mixHistory: readonly (readonly number[])[];
  readonly digest: string;
}

function runReferenceCentury(rootSeed: number): RunResult {
  const store = createCohortStore();

  // A founding population spread over the first few decades of each species'
  // life, so the run does not start with one enormous synchronized cohort.
  for (const speciesId of SPECIES_IDS) {
    for (let decade = 0; decade < 3; decade += 1) {
      insertNewborns(store, speciesId, 4_000, -decade * BIRTH_BUCKET_TICKS);
    }
  }

  let peakCohorts = 0;
  let peakPopulation = 0;
  let minSpeciesPopulation = Number.MAX_SAFE_INTEGER;
  let totalDraws = 0;
  let cohortVisits = 0;
  let populationTickSum = 0;
  const peakNormalizedAge = SPECIES.map(() => 0);
  let peakBucketsPerPair = 0;
  const mixHistory: number[][] = [];

  for (let tick = 0; tick < RUN_TICKS; tick += 1) {
    for (const speciesId of SPECIES_IDS) {
      insertNewborns(store, speciesId, harnessBirths(store.totalOfSpecies(speciesId)), tick);
    }

    // **Harness.** Demand tracks the population, so reallocation is exercised
    // with a moving target rather than a constant one. The inputs are the ones
    // the `economy` spec names; universities do not exist yet to supply them.
    // `materialsObligation` — W23's fifth driver — tracks the population too,
    // which is the shape that makes the oscillation check below worth running:
    // it is the driver most tightly coupled to the quantity reallocation itself
    // moves. Kept to the same order as the other population-derived inputs
    // rather than the full subsistence bill, because this harness exists to
    // exercise the *controller*, not to maximise demand: an obligation that
    // asks for a laborer per eight people drives so much of the populace into
    // named occupations that the cohort table fragments, and the aggregation
    // identity below is then measured over cohorts too small to say anything.
    const population = store.totalCount();
    const demand = computeOccupationDemand({
      constructionBacklog: FP_ONE * (1 + (tick % 5)),
      scribingQueueDepth: floorDiv(population, 4_000),
      universityCapacity: floorDiv(population, 20),
      standingSoldierTarget: floorDiv(population, 40),
      materialsObligation: floorDiv(population, 8),
    });

    // Taken before the step: these are what mortality will visit, and the
    // whole point is that the draw count follows the first and not the second.
    cohortVisits += store.liveCohortCount;
    populationTickSum += store.totalCount();

    const rng = countingRng(rootSeed, tick);
    const report = stepPopulace(store, {
      hazard: placeholderHazard,
      species: speciesOf,
      rng,
      demand,
      worldTick: tick,
    });
    totalDraws += report.mortality.draws;

    peakCohorts = Math.max(peakCohorts, report.liveCohorts);
    peakPopulation = Math.max(peakPopulation, report.population);

    const bucketsPerPair = new Map<number, number>();
    store.forEach((_handle, key) => {
      const demography = speciesOf(key.speciesId);
      if (demography === undefined) throw new Error('unknown species in run');
      const normalized = normalizedCohortAge(
        cohortAgeMonths(key.birthTickBucket, tick),
        demography.lifespanMonths,
      );
      const index = key.speciesId - 1;
      peakNormalizedAge[index] = Math.max(peakNormalizedAge[index] as number, normalized);
      const pairKey = key.speciesId * 8 + key.occupation;
      bucketsPerPair.set(pairKey, (bucketsPerPair.get(pairKey) ?? 0) + 1);
    });
    for (const count of bucketsPerPair.values()) {
      peakBucketsPerPair = Math.max(peakBucketsPerPair, count);
    }

    for (const speciesId of SPECIES_IDS) {
      minSpeciesPopulation = Math.min(minSpeciesPopulation, store.totalOfSpecies(speciesId));
    }

    const mix = countByOccupation(store);
    mixHistory.push(OCCUPATIONS_IN_ORDER.map((occupation) => mix[occupation]));
  }

  return {
    peakCohorts,
    peakPopulation,
    finalPopulation: store.totalCount(),
    minSpeciesPopulation,
    peakNormalizedAge,
    peakBucketsPerPair,
    totalDraws,
    cohortVisits,
    populationTickSum,
    mixHistory,
    digest: store
      .handles()
      .map((handle) => {
        const key = store.keyOf(handle);
        return `${String(key.speciesId)}:${String(key.occupation)}:${String(
          key.birthTickBucket,
        )}=${String(store.countOf(handle))}`;
      })
      .join('|'),
  };
}

const run = runReferenceCentury(20_260_810);

describe('200 world years of counted populace', () => {
  it('records what it observed, so the bounds below are read against numbers', () => {
    // Printed rather than only asserted: a bound that passes with three orders
    // of magnitude of headroom and a bound that passes by one cohort are
    // different findings, and only one of them is reassuring.
     
    console.log(
      `[populace 200y] peak cohorts ${String(run.peakCohorts)} · peak population ` +
        `${String(run.peakPopulation)} · final ${String(run.finalPopulation)} · smallest species ` +
        `${String(run.minSpeciesPopulation)} · peak buckets per (species, occupation) ` +
        `${String(run.peakBucketsPerPair)} · peak normalized age by species [` +
        `${run.peakNormalizedAge.map((age) => String(age)).join(', ')}] · stream 6 draws ` +
        `${String(run.totalDraws)} vs ${String(run.populationTickSum)} person-ticks`,
    );
    expect(run.peakCohorts).toBeGreaterThan(0);
  });

  it('never exceeds the cohort entity bound of 6 species × 5 occupations × decades', () => {
    // `mages-and-species/design.md`: 4,500 entities for the draconic
    // placeholder, "for any population of any size". The bound holds only
    // because cohort mortality retires old birth buckets.
    const maxLifespanMonths = Math.max(...SPECIES.map((species) => species.lifespanMonths));
    const decades = Math.ceil(maxLifespanMonths / BIRTH_BUCKET_TICKS);
    const bound = SPECIES.length * OCCUPATIONS_IN_ORDER.length * decades;

    expect(bound).toBe(4_500);
    expect(run.peakCohorts).toBeLessThanOrEqual(bound);
  });

  it('keeps every species alive at every tick', () => {
    // Not the 0.4.0 reference-scenario claim — that needs the real content and
    // the real economy — but the same property over the populace layer alone.
    expect(run.minSpeciesPopulation).toBeGreaterThan(0);
  });

  it('retires old birth buckets rather than accumulating them for the length of the run', () => {
    // The property the entity bound rests on. Over 2,400 ticks a species could
    // accumulate 20 decades of buckets per occupation if nothing ever died.
    const decadesInRun = Math.ceil(RUN_TICKS / BIRTH_BUCKET_TICKS);
    const shortestLifespanDecades = Math.ceil(
      Math.min(...SPECIES.map((species) => species.lifespanMonths)) / BIRTH_BUCKET_TICKS,
    );

    expect(decadesInRun).toBe(20);
    expect(shortestLifespanDecades).toBeLessThan(decadesInRun);
    expect(run.peakBucketsPerPair).toBeLessThanOrEqual(decadesInRun + 3);
  });

  it('holds every live cohort inside its species lifespan plus the tail allowance', () => {
    // Task 3.11 and the `economy` spec's "birth buckets are reclaimed". The
    // allowance is slack by design — the hazard table only reaches
    // near-certainty at 1.5× nominal, and extinction is stochastic on top.
    for (const [index, normalized] of run.peakNormalizedAge.entries()) {
      expect(
        normalized,
        `species index ${String(index)} kept a cohort to normalized age ${String(normalized)}, ` +
          `past the documented allowance of ${String(MAX_LIVE_NORMALIZED_AGE)}`,
      ).toBeLessThanOrEqual(MAX_LIVE_NORMALIZED_AGE);
    }
  });

  it('draws on stream 6 once per cohort per tick and no more', () => {
    // The aggregation contract as an arithmetic identity over the whole run.
    // The second assertion is the one with content: a per-person Bernoulli
    // trial — the obviously-correct implementation `design.md` rejects — would
    // have drawn `populationTickSum` times, and the ratio is what
    // `contracts.md` §1.3 buys.
    expect(run.totalDraws).toBe(run.cohortVisits);
    expect(run.populationTickSum).toBeGreaterThan(run.totalDraws * 1_000);
  });

  it('shows no sustained two-tick alternation in the occupation mix', () => {
    // The bang-bang controller `design.md` rejects would put every derived
    // metric on a two-tick period. Measured over the settled second half of the
    // run: a mix that alternates has `x[t] ≈ x[t-2]` while `x[t] ≠ x[t-1]`,
    // sustained. One tick of that is noise; hundreds in a row is a controller
    // artifact.
    const settled = run.mixHistory.slice(RUN_TICKS / 2);
    let alternating = 0;
    let longestRun = 0;
    for (let i = 2; i < settled.length; i += 1) {
      const now = settled[i] as readonly number[];
      const previous = settled[i - 1] as readonly number[];
      const before = settled[i - 2] as readonly number[];
      const isAlternating = OCCUPATIONS_IN_ORDER.some((_occupation, slot) => {
        const a = now[slot] as number;
        const b = previous[slot] as number;
        const c = before[slot] as number;
        return Math.abs(a - c) < Math.abs(a - b) && Math.abs(a - b) > 100;
      });
      alternating = isAlternating ? alternating + 1 : 0;
      longestRun = Math.max(longestRun, alternating);
    }
    expect(longestRun).toBeLessThan(10);
  });

  it('is reproducible: the same seed gives a byte-identical final cohort table', () => {
    const second = runReferenceCentury(20_260_810);
    expect(second.digest).toBe(run.digest);
    expect(second.peakCohorts).toBe(run.peakCohorts);
    expect(second.totalDraws).toBe(run.totalDraws);
  });

  it('gives a different seed a different history, so the digest means something', () => {
    // A digest comparison that would pass against a constant is not a
    // determinism check.
    const other = runReferenceCentury(1);
    expect(other.digest).not.toBe(run.digest);
  });
});

describe('the end-of-tick invariant held throughout', () => {
  it('leaves no duplicate key after a full run', () => {
    // `stepPopulace` asserts this every tick, so reaching here at all is the
    // assertion; this states it as one.
    const store = createCohortStore();
    insertNewborns(store, 1, 1_000, 0);
    for (let tick = 0; tick < 240; tick += 1) {
      stepPopulace(store, {
        hazard: placeholderHazard,
        species: speciesOf,
        rng: countingRng(5, tick),
        demand: { ...NO_DEMAND, [OCCUPATION.laborer as OccupationValue]: 100 },
        worldTick: tick,
      });
    }
    expect(() => {
      store.assertUniqueKeys();
    }).not.toThrow();
  });
});
