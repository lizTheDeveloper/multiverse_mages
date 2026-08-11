/*
 * Multiverse Mages — the counts `god-agency` will compute worship from, and no
 * worship.
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

import type { SimState } from '@mm/sim-core';
import { MAGE, POPULACE_COHORT, UNIVERSITY, collectRecords } from '@mm/state';

import { effectiveCapacity } from '../universities/construction.js';

/**
 * ## Three inputs, and the fourth belongs to somebody else
 *
 * The `economy` spec: *"The economy SHALL track exactly three inputs — populace,
 * materials, and knowledge-as-capital — and MUST NOT introduce a fourth
 * resource. Favor and worship are the god's currency and are owned by
 * `god-agency`; this capability MAY expose the counts worship is computed from
 * but MUST NOT define or compute worship."*
 *
 * The temptation this guards against is small and specific: worship is
 * *obviously* some function of how many people believe in you, the counts are
 * right here, and a `worshipFrom(counts)` helper looks like a courtesy. It is
 * not — it is a formula authored by a capability with no way to measure whether
 * it is right, in a file `god-agency` would then have to argue with rather than
 * replace. `economy-three-inputs.test.ts` scans this package for a write to
 * `favor` or `worship` and fails on one.
 *
 * ## Why counts and not a snapshot object
 *
 * `contracts.md` §1.1 already holds `favor` and `worship` as universe fields.
 * Nothing here writes them, and nothing here caches these counts either: they
 * are derived from the entity store on demand, like everything else this change
 * derives rather than stores.
 */

/** The counts a later capability computes worship from. No worship value. */
export interface WorshipInputs {
  /** Living mages. */
  readonly mages: number;
  /** Universities, whether finished or not. */
  readonly universities: number;
  /** Seats across **completed** universities. */
  readonly completedCapacity: number;
  /** Populace across every cohort of every species. */
  readonly populace: number;
  /** Live cohort entities — the number `contracts.md` §1.3's bound is about. */
  readonly cohorts: number;
}

/**
 * Counts what a universe has, from the entity store.
 *
 * O(entities) and called once per tick at most. A cached version of this is the
 * derived-state defect `contracts.md` §1.5 forbids for node existence, wearing
 * different clothes: the moment a mage dies without the cache being told, the
 * god is being paid for a congregation that is not there.
 */
export function worshipInputs(state: SimState): WorshipInputs {
  let mages = 0;
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive !== 0) mages += 1;
  }

  let universities = 0;
  let completedCapacity = 0;
  for (const { row } of collectRecords(state, UNIVERSITY)) {
    universities += 1;
    completedCapacity += effectiveCapacity(row);
  }

  let populace = 0;
  let cohorts = 0;
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    cohorts += 1;
    populace += row.count;
  }

  return { mages, universities, completedCapacity, populace, cohorts };
}

/**
 * The three tracked economic inputs, named.
 *
 * A list rather than a comment, so that "exactly three" is a thing a test can
 * count. Adding a fourth resource means adding an entry here, which is a diff a
 * reviewer reads as what it is.
 */
export const ECONOMIC_INPUTS = ['populace', 'materials', 'knowledge-as-capital'] as const;

/** One of the three. */
export type EconomicInput = (typeof ECONOMIC_INPUTS)[number];
