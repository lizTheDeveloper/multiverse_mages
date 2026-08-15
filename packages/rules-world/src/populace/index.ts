/*
 * Multiverse Mages — the populace layer's public surface.
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
 * Counted populace: `docs/design/contracts.md` §1.3 in code.
 *
 * **§1.3 is a performance contract, stated normatively.** Simulating a whole
 * population as individuals is what would make Monte Carlo unaffordable, so
 * only mages are individuals and everyone else is a counted cohort keyed on
 * `(speciesId, occupation, birthTickBucket)`. Nothing in this directory may
 * carry a per-person field, and no mechanism here may draw randomness per
 * person — promoting populace to individual entities requires amending that
 * document first.
 *
 * Every magnitude introduced here is **untuned**. There is no balance harness
 * before 0.5.0 (`docs/design/release-plan.md`), so `TRANSFER_RATE_PER_TICK`,
 * the retirement threshold, the demand coefficients, and the birth-bucket tail
 * allowance are placeholders chosen to make the mechanism observable, not
 * balanced.
 */

export {
  BIRTH_BUCKET_TAIL_ALLOWANCE,
  BIRTH_BUCKET_TICKS,
  MAX_LIVE_NORMALIZED_AGE,
  birthBucketOf,
  bucketMidBirthTick,
  cohortAgeMonths,
  normalizedCohortAge,
} from './buckets.js';

export { insertNewborns } from './births.js';

export type { CohortKey, CohortMerge, CohortStoreOptions } from './cohort-store.js';
export { CohortStore, MAX_COHORT_COUNT, createCohortStore } from './cohort-store.js';

export type { DemandInputs, OccupationDemand, UnmetDemand } from './demand.js';
export {
  LABORERS_PER_BUILD_UNIT,
  NO_DEMAND,
  SCRIBES_PER_QUEUED_GRIMOIRE,
  computeOccupationDemand,
  zeroPerOccupation,
} from './demand.js';

export type { ReallocationOptions, ReallocationReport } from './reallocation.js';
export {
  TRANSFER_RATE_PER_TICK,
  cohortShare,
  countByOccupation,
  mayTransitionTo,
  reallocateOccupations,
  retireSenescentCohorts,
} from './reallocation.js';

export type { PopulaceStepOptions, PopulaceStepReport } from './step.js';
export { stepPopulace } from './step.js';

export type {
  CohortDemography,
  MortalityOptions,
  MortalityReport,
  PopulaceRng,
  ScaleFreeHazard,
  SpeciesDemographyLookup,
} from './mortality.js';
export {
  POPULACE_STREAM,
  applyCohortMortality,
  cohortDeathsThisTick,
  cohortHazardPerTick,
  requireDemography,
} from './mortality.js';

export {
  OCCUPATIONS_IN_ORDER,
  OCCUPATION_COUNT,
  PRODUCTIVE_OCCUPATIONS,
  RETIREMENT_NORMALIZED_AGE,
  isOccupation,
  isProductive,
} from './occupations.js';
