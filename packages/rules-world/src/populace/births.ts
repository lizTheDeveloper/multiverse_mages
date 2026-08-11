/*
 * Multiverse Mages — where newborns land.
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

import type { EntityHandle } from '@mm/sim-core';
import type { ContentId, Tick } from '@mm/state';
import { OCCUPATION } from '@mm/state';

import type { CohortStore } from './cohort-store.js';

/**
 * **Insertion only. The fertility rate is not here.**
 *
 * The `economy` spec has two separate requirements about birth, and they belong
 * to different task groups. "Newborns MUST enter the youngest bucket of their
 * species' `idle` cohort" is populace structure and is this function. "Births
 * per cohort per world tick SHALL scale by species `fertility`, the capped
 * `fertility` primitive stacking, and a carrying-capacity brake" is the
 * three-input economy, which owns `K`, materials, and the logistic brake.
 *
 * Splitting them is deliberate rather than tidy: a fertility rate written here
 * would have to invent a carrying capacity to brake against, and an invented
 * `K` is the kind of placeholder that quietly becomes the real one.
 *
 * Extinction is an absorbing state and is not prevented. A species with no
 * cohorts and no surviving mage simply has nobody to call this for; the
 * simulation does not synthesize a founding population, and the 0.4.0 claim
 * about species survival is scenario-specific rather than a universal
 * impossibility.
 */

/**
 * Adds newborns to the youngest `idle` bucket of a species.
 *
 * The bucket is the one containing `worldTick`, which is what "youngest" means
 * — {@link CohortStore.add} buckets the tick, so consecutive months of births
 * merge into one cohort for the whole decade rather than fragmenting.
 *
 * `idle` because the `economy` spec reads `idle` as "not economically
 * productive", explicitly covering members below `maturityMonths`. A newborn is
 * not unemployed; it is a child.
 *
 * @returns the cohort they joined, or `NULL_ENTITY` when `count` is 0 — a
 * species with no births this tick creates no entity.
 */
export function insertNewborns(
  store: CohortStore,
  speciesId: ContentId,
  count: number,
  worldTick: Tick,
): EntityHandle {
  return store.add(
    { speciesId, occupation: OCCUPATION.idle, birthTickBucket: worldTick },
    count,
  );
}
