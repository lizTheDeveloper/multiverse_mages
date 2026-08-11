/*
 * Multiverse Mages — cohort mortality at cohort granularity.
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

import type { Fixed, RngStream } from '@mm/sim-core';
import { RNG_STREAM, floorDiv, nextBounded } from '@mm/sim-core';
import type { ContentId } from '@mm/state';

import { LIFESPAN_RATE_ONE, perLifespanRate } from '../lifespan-rate.js';
import { cohortAgeMonths, normalizedCohortAge } from './buckets.js';
import type { CohortStore } from './cohort-store.js';

/**
 * ## Three things this file is not allowed to do, and what it does instead
 *
 * **It may not roll per person.** `docs/design/contracts.md` §1.3 is a
 * performance contract; a Bernoulli trial per member over a population of tens
 * of thousands is the exact cost it exists to forbid, and it is the shape the
 * obviously-correct implementation takes. So expected deaths are an integer
 * part plus **exactly one** draw on stream 6 per cohort per tick
 * ({@link cohortDeathsThisTick}), which preserves the expected value exactly
 * while keeping the draw count at O(cohorts).
 *
 * **It may not carry a remainder between ticks.** §1.3's field table has four
 * columns and no fifth; a fractional-deaths accumulator would be a contract
 * amendment. That is why the remainder is resolved stochastically rather than
 * banked — the draw *is* the accumulator, held in the stream rather than in
 * state.
 *
 * **It may not divide the hazard at `fp` scale.** A draconic lifespan of 18,000
 * months divided at `fp` floors to zero and dragons become silently immortal —
 * a defect that survives thousands of Monte Carlo runs looking like a species
 * that is merely long-lived. `lifespan-rate.ts` exists for exactly this, and
 * this module uses it and never narrows before comparing against the draw.
 *
 * ## Why the draw is unconditional
 *
 * The draw is taken whether or not the remainder is zero, and whether or not
 * the cohort has anybody left to kill. The `economy` spec requires that the
 * number of stream 6 draws be a function of the *cohort count* and nothing else
 * — "the number of RNG draws on stream 6 is identical" for populations of a
 * thousand and a million. A draw skipped when the arithmetic happens to come
 * out even makes draw count a function of population, which is both a spec
 * violation and, worse, a silent re-phasing: skipping one draw shifts every
 * subsequent value that cohort would have seen.
 *
 * Streams are per-cohort (`actorStream(6, cohortHandle)`), so a skipped draw
 * cannot disturb another cohort — but it can disturb the same cohort's future,
 * and `contracts.md` §6's insertion invariance is about not having to reason
 * about that at all.
 */

/**
 * The shared, scale-free hazard table, as a function of normalized age.
 *
 * `fp(1024)` of normalized age is exactly the species' nominal lifespan, so one
 * table gives a human eighty years and a draconic fifteen hundred. The returned
 * value is the **numerator** of `H(normalizedAge) / effectiveLifespanMonths`,
 * never a per-tick probability on its own.
 *
 * Declared here as a port and authored elsewhere. The same table indexes mage
 * mortality (`mages-and-species` task 4.6), and `design.md` is explicit that
 * reusing it rather than authoring a second "keeps one shape to tune and means
 * the draconic precision trap is fixed in one place for both". A copy in this
 * directory would be the second shape.
 */
export type ScaleFreeHazard = (normalizedAge: Fixed) => Fixed;

/**
 * The seeded randomness the populace subsystem may draw from.
 *
 * Structurally `@mm/sim-core`'s `StepRng`, restated so that a populace pass is
 * callable without fabricating a whole `StepContext` — the same reason
 * `@mm/rules-magic` restates it as `KnowledgeRng`. **Neither method takes a
 * tick**: the source a step hands out is already bound to that step, which
 * removes a correct-tick discipline a rules author would otherwise have to
 * remember at every call site.
 */
export interface PopulaceRng {
  /** A subsystem's stream for this step. */
  stream(subsystemId: number): RngStream;
  /**
   * One cohort's stream within a subsystem, for this step. `actorKey` must be a
   * stable entity handle — never an array index or a visit position, or
   * inserting a cohort shifts every later cohort's rolls (`contracts.md` §6).
   */
  actorStream(subsystemId: number, actorKey: number): RngStream;
}

/**
 * The species facts cohort dynamics need.
 *
 * A narrow structural type rather than `SpeciesRecord`, so that this package's
 * hot loop states its two dependencies instead of taking the whole content
 * record and quietly acquiring more. `SpeciesRecord` satisfies it.
 */
export interface CohortDemography {
  /** `contracts.md` §2.4. World ticks; a month each. */
  readonly lifespanMonths: number;
  /** §2.4. Below this age a cohort may only become a student. */
  readonly maturityMonths: number;
}

/** Species facts by interned id. Returns `undefined` for an unknown id. */
export type SpeciesDemographyLookup = (speciesId: ContentId) => CohortDemography | undefined;

/**
 * The lookup, with "unknown species" turned into a refusal.
 *
 * Every populace pass needs a lifespan — to normalize age, to divide a hazard,
 * to decide whether a cohort has retired — and there is no defensible default.
 * Skipping the cohort would make it immortal and unemployable; substituting a
 * lifespan would silently change its mortality. Both are the kind of quiet
 * wrongness that survives a Monte Carlo campaign, so this refuses instead.
 */
export function requireDemography(
  species: SpeciesDemographyLookup,
  speciesId: ContentId,
): CohortDemography {
  const demography = species(speciesId);
  if (demography === undefined) {
    throw new Error(
      `A populace cohort names species ${String(speciesId)}, which the content registry does ` +
        'not know. A cohort of an unloaded species has no lifespan to normalize age against, ' +
        'and guessing one would silently change its mortality.',
    );
  }
  return demography;
}

/** What one mortality pass did, per the `economy` spec's observability requirement. */
export interface MortalityReport {
  /** Total members lost this tick. */
  readonly deaths: number;
  /** Deaths by species, in ascending interned id. */
  readonly deathsBySpecies: ReadonlyMap<ContentId, number>;
  /** Cohorts that emptied and were destroyed. */
  readonly cohortsDestroyed: number;
  /**
   * Draws taken on stream 6 — one per cohort visited, unconditionally.
   *
   * Reported rather than inferred so that the O(cohorts) claim is a number a
   * test and the Monte Carlo harness can both read.
   */
  readonly draws: number;
}

export interface MortalityOptions {
  readonly hazard: ScaleFreeHazard;
  readonly species: SpeciesDemographyLookup;
  readonly rng: PopulaceRng;
  /** The world tick being stepped. Only used to derive cohort age. */
  readonly worldTick: number;
}

/**
 * Deaths in one cohort in one tick: the integer part plus one fractional draw.
 *
 * @param count - Members of the cohort.
 * @param hazardNumerator - `H(normalizedAge)` from the shared table.
 * @param lifespanMonths - The species' effective lifespan.
 * @param stream - This cohort's stream 6 cursor for this tick. **Exactly one
 * value is drawn from it, always**, including when `count` is 0 — see this
 * module's note on why the draw is unconditional.
 *
 * @returns deaths, never more than `count`.
 */
export function cohortDeathsThisTick(
  count: number,
  hazardNumerator: Fixed,
  lifespanMonths: number,
  stream: RngStream,
): number {
  const rate = perLifespanRate(hazardNumerator, lifespanMonths);
  // A hazard past certainty is a table error, not a reason to kill more people
  // than exist. Clamping keeps the arithmetic below inside exact integers.
  const perTick = rate > LIFESPAN_RATE_ONE ? LIFESPAN_RATE_ONE : rate;

  // `count` is a uint32 and `perTick` is at most 2^20, so the product is at
  // most 2^52 — inside exact integer arithmetic, but only just, which is why
  // the clamp above is load-bearing rather than defensive.
  const expected = count * perTick;
  const whole = floorDiv(expected, LIFESPAN_RATE_ONE);
  const remainder = expected - whole * LIFESPAN_RATE_ONE;

  // Drawn before the early return, never after a branch on the arithmetic.
  // `LIFESPAN_RATE_ONE` is 2^20 and divides 2^32 exactly, so `nextBounded`
  // never rejects: one draw is one word, which is what makes the draw count
  // checkable rather than distributional.
  const draw = nextBounded(stream, LIFESPAN_RATE_ONE);
  const deaths = whole + (draw < remainder ? 1 : 0);
  return deaths > count ? count : deaths;
}

/**
 * Applies mortality to every live cohort, destroying those that empty.
 *
 * Visits in ascending slot order (`CohortStore.handles`), which is state rather
 * than history. Cohorts destroyed mid-pass are safe because the handle list is
 * taken up front and a destroyed handle is skipped.
 */
export function applyCohortMortality(
  store: CohortStore,
  options: MortalityOptions,
): MortalityReport {
  const deathsBySpecies = new Map<ContentId, number>();
  let deaths = 0;
  let cohortsDestroyed = 0;
  let draws = 0;

  for (const handle of store.handles()) {
    if (!store.isLive(handle)) {
      continue;
    }
    const key = store.keyOf(handle);
    const demography = requireDemography(options.species, key.speciesId);

    const age = cohortAgeMonths(key.birthTickBucket, options.worldTick);
    const normalized = normalizedCohortAge(age, demography.lifespanMonths);
    const stream = options.rng.actorStream(RNG_STREAM.populace, handle);
    draws += 1;

    const died = cohortDeathsThisTick(
      store.countOf(handle),
      options.hazard(normalized),
      demography.lifespanMonths,
      stream,
    );
    if (died > 0) {
      store.remove(handle, died);
      deaths += died;
      deathsBySpecies.set(key.speciesId, (deathsBySpecies.get(key.speciesId) ?? 0) + died);
    }
    if (!store.isLive(handle)) {
      cohortsDestroyed += 1;
    }
  }

  return { deaths, deathsBySpecies, cohortsDestroyed, draws };
}

/** A cohort's current hazard, for emission and for tests. Never narrowed. */
export function cohortHazardPerTick(
  birthTickBucket: number,
  worldTick: number,
  demography: CohortDemography,
  hazard: ScaleFreeHazard,
): number {
  const age = cohortAgeMonths(birthTickBucket, worldTick);
  const normalized = normalizedCohortAge(age, demography.lifespanMonths);
  return perLifespanRate(hazard(normalized), demography.lifespanMonths);
}

/**
 * The stream every draw in this file names — `contracts.md` §6 entry 6,
 * "populace cohort dynamics".
 *
 * Exported so that a test can assert the number this package draws *from*
 * rather than trusting that the right constant was passed at each call site. A
 * populace draw taken on any other stream would silently re-roll another
 * subsystem's numbers and invalidate every committed baseline.
 */
export const POPULACE_STREAM: number = RNG_STREAM.populace;
