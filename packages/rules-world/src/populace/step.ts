/*
 * Multiverse Mages — one world tick of populace dynamics, in a fixed order.
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

import type { CohortStore } from './cohort-store.js';
import type { OccupationDemand } from './demand.js';
import type { MortalityReport, PopulaceRng, ScaleFreeHazard, SpeciesDemographyLookup } from './mortality.js';
import { applyCohortMortality } from './mortality.js';
import type { ReallocationReport } from './reallocation.js';
import { reallocateOccupations, retireSenescentCohorts } from './reallocation.js';

/**
 * The three populace phases of a world tick, in the order they run.
 *
 * **The order is a rule, not a convenience.** `@mm/sim-core`'s `defineWorld`
 * says the same thing about system order — "the order rules resolve in, so
 * reordering it changes the game" — and inside one system the phases have the
 * same property:
 *
 * 1. **Mortality**, first, so that the labour market allocates the living. It
 *    also retires old birth buckets, which is what keeps the cohort entity
 *    count bounded (`mages-and-species/design.md`: without cohort mortality
 *    "the cohort entity bound stops holding, because old birth buckets would
 *    accumulate for the length of the run").
 * 2. **Retirement**, unlimited, because it is biology. Running it before
 *    reallocation means the senescent are already `idle` when demand is
 *    matched, so the controller never counts them as available workers and then
 *    discovers it cannot use them.
 * 3. **Reallocation**, rate-limited, last.
 *
 * Births are **not** a phase here. Fertility, the carrying-capacity brake, and
 * `K` belong to the three-input economy; this module only knows where a newborn
 * lands once someone else has decided there is one (`births.ts`).
 *
 * The end-of-tick uniqueness validation is the caller's to run, and
 * {@link stepPopulace} runs it, because the `economy` spec states it as a
 * property of the tick boundary rather than of any one phase: *"WHEN the cohort
 * store is validated at the end of any tick THEN no two cohort entities share a
 * key"*.
 */

export interface PopulaceStepOptions {
  readonly hazard: ScaleFreeHazard;
  readonly species: SpeciesDemographyLookup;
  readonly rng: PopulaceRng;
  readonly demand: OccupationDemand;
  readonly worldTick: number;
}

export interface PopulaceStepReport {
  readonly mortality: MortalityReport;
  /** People moved into `idle` because they passed retirement age. */
  readonly retired: number;
  readonly reallocation: ReallocationReport;
  /** Live cohort entities after the tick — the number §1.3's bound is about. */
  readonly liveCohorts: number;
  /** Total population after the tick. */
  readonly population: number;
}

/** Steps mortality, retirement, and reallocation, then validates the invariant. */
export function stepPopulace(
  store: CohortStore,
  options: PopulaceStepOptions,
): PopulaceStepReport {
  const mortality = applyCohortMortality(store, {
    hazard: options.hazard,
    species: options.species,
    rng: options.rng,
    worldTick: options.worldTick,
  });

  const retired = retireSenescentCohorts(store, {
    species: options.species,
    worldTick: options.worldTick,
  });

  const reallocation = reallocateOccupations(store, {
    demand: options.demand,
    species: options.species,
    worldTick: options.worldTick,
  });

  store.assertUniqueKeys();

  return {
    mortality,
    retired,
    reallocation,
    liveCohorts: store.liveCohortCount,
    population: store.totalCount(),
  };
}
