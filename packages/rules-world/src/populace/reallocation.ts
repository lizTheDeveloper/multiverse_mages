/*
 * Multiverse Mages — rate-limited, deterministic occupation reallocation.
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

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { ContentId, OccupationValue, Tick } from '@mm/state';
import { OCCUPATION } from '@mm/state';

import { cohortAgeMonths, normalizedCohortAge } from './buckets.js';
import type { CohortStore } from './cohort-store.js';
import type { OccupationDemand } from './demand.js';
import { zeroPerOccupation } from './demand.js';
import type { SpeciesDemographyLookup } from './mortality.js';
import { requireDemography } from './mortality.js';
import { OCCUPATIONS_IN_ORDER, RETIREMENT_NORMALIZED_AGE } from './occupations.js';

/**
 * ## Why this is a governor and not an assignment
 *
 * The one-line version of this module is "move people until supply matches
 * demand", and `mages-and-species/design.md` rejects it by name: instantaneous
 * reallocation *"is a bang-bang controller. The economy oscillates between
 * overbuild and starvation on a two-tick period, every derived metric acquires
 * that oscillation, and a balance analyst at 0.5.0 spends a week discovering
 * that the wobble in `timeToTierBySpecies` is a control artifact rather than
 * anything about magic."*
 *
 * Three things keep it from oscillating, and the second is the one that is easy
 * to leave out:
 *
 * 1. **A per-cohort transfer cap.** At most {@link TRANSFER_RATE_PER_TICK} of
 *    any cohort changes occupation in a tick, budgeted from the count *before*
 *    any move, so a cohort that receives people cannot immediately re-export
 *    them.
 * 2. **Only surplus occupations are drained.** An occupation already below its
 *    own demand is never a source, and no more than its surplus leaves it. Rate
 *    limiting alone still oscillates when two occupations are both short and
 *    take turns robbing each other; this is what stops that.
 * 3. **`idle` is drawn from first**, always. Idle labour is free to move;
 *    everything else is already doing something.
 *
 * ## Determinism
 *
 * The `economy` spec requires that "the allocation order is fixed and
 * reproducible, never dependent on hash iteration order". Two orders here are
 * declarations rather than accidents: target occupations are visited in
 * {@link OCCUPATIONS_IN_ORDER}, and within a target, source cohorts are visited
 * by *source occupation* priority and then by **cohort key**
 * ({@link compareSourceCohorts}).
 *
 * Key order rather than slot order, and the difference is not pedantry.
 * `EntityStore` guarantees ascending-slot iteration is reproducible — but a
 * slot is a function of the *create and destroy history*, so two states that
 * are identical as states, reached by different histories, iterate in different
 * orders and this greedy allocator splits a shortfall differently between them.
 * That is exactly the divergence class `entity-store.ts` warns about ("two
 * peers that visit the same entities in different orders compute different
 * results from the same state"), one level up. Cohorts are capped at 4,500 by
 * §1.3's bound, so sorting them is cheap, and the key is already a total order
 * because it is unique.
 *
 * Mortality deliberately does *not* sort: each cohort draws from its own
 * `actorStream`, so its deaths are independent of who was visited first, and
 * ascending-slot iteration is the store's own documented order.
 *
 * ## No remainder is banked
 *
 * `contracts.md` §1.3 gives a cohort four fields. The transfer budget floors,
 * and the fraction is discarded rather than accumulated — a "pending transfer"
 * counter would be a fifth field and therefore a contract amendment. The cost
 * is that cohorts smaller than `1 / TRANSFER_RATE_PER_TICK` never transfer at
 * all. That is the spec's letter ("no more than `transferRatePerTick` of any
 * source cohort"), and if it ever matters the tripwire is task group 9's stall
 * check: an economy that cannot staff anything is an economy where research,
 * teaching, and scribing stop happening.
 */

/**
 * The fraction of a cohort that may change occupation in one world tick.
 * **Untuned.**
 *
 * `fp(1024) / 16` is 6.25% a month — a workforce that can re-point itself in
 * roughly a year and a half, which is slow enough to damp the two-tick
 * alternation the design note rejects and fast enough to respond inside a
 * 200-year run. It is a placeholder: there is no balance harness before 0.5.0,
 * and no release before then may claim this number is right.
 */
export const TRANSFER_RATE_PER_TICK: Fixed = floorDiv(FP_ONE, 16);

export interface ReallocationOptions {
  readonly demand: OccupationDemand;
  readonly species: SpeciesDemographyLookup;
  readonly worldTick: number;
}

export interface ReallocationReport {
  /** People who changed occupation this tick. */
  readonly moved: number;
  /** People who arrived, per destination occupation. */
  readonly movedInto: Readonly<Record<OccupationValue, number>>;
  /**
   * Demand nobody could be found for, per occupation. Observable per the
   * `economy` spec: a slow transfer rate and a small populace are
   * indistinguishable in the occupation mix but not here.
   */
  readonly unmetDemand: Readonly<Record<OccupationValue, number>>;
}

/** A cohort considered as a source, with everything the pass needs about it. */
interface SourceCohort {
  readonly handle: EntityHandle;
  readonly occupation: OccupationValue;
  readonly speciesId: ContentId;
  readonly birthTickBucket: Tick;
  /** People this cohort may still export this tick. */
  budget: number;
  /** Whether it is old enough to work at all. */
  readonly mature: boolean;
  /** Whether it is past {@link RETIREMENT_NORMALIZED_AGE}. */
  readonly senescent: boolean;
}

/**
 * Whether a cohort may take up an occupation, given its age.
 *
 * The `economy` spec's "children cannot labor": below `maturityMonths` the only
 * permitted destination is `student`. And a cohort past retirement age may go
 * to `idle` and nowhere else — the counterpart rule, which is what makes
 * `idle`'s documented reading ("covering members below `maturityMonths` and
 * those past productive age") describe a state the simulation can actually be
 * in.
 */
export function mayTransitionTo(
  destination: OccupationValue,
  options: { readonly mature: boolean; readonly senescent: boolean },
): boolean {
  if (destination === OCCUPATION.idle) {
    return true;
  }
  if (options.senescent) {
    return false;
  }
  if (!options.mature) {
    return destination === OCCUPATION.student;
  }
  return true;
}

/**
 * Moves every cohort past {@link RETIREMENT_NORMALIZED_AGE} into `idle`.
 *
 * Not rate-limited, and deliberately so: this is biology, not the economy's
 * controller. A retirement that trickled at `transferRatePerTick` would leave
 * centenarian laborers on the books for a decade after the threshold, and the
 * whole point of the threshold is that "past productive age" is a fact about a
 * cohort rather than a preference of the labour market.
 *
 * @returns people retired this tick.
 */
export function retireSenescentCohorts(
  store: CohortStore,
  options: { readonly species: SpeciesDemographyLookup; readonly worldTick: number },
): number {
  let retired = 0;
  for (const handle of store.handles()) {
    if (!store.isLive(handle)) continue;
    const key = store.keyOf(handle);
    if (key.occupation === OCCUPATION.idle) continue;

    const demography = requireDemography(options.species, key.speciesId);
    const normalized = normalizedCohortAge(
      cohortAgeMonths(key.birthTickBucket, options.worldTick),
      demography.lifespanMonths,
    );
    if (normalized >= RETIREMENT_NORMALIZED_AGE) {
      retired += store.transfer(handle, OCCUPATION.idle, store.countOf(handle));
    }
  }
  return retired;
}

/**
 * One rate-limited reallocation pass.
 *
 * Retirement is *not* run here — it is a separate, unlimited sweep — so that a
 * caller composing a tick can see the two phases and their order rather than
 * inheriting them.
 */
export function reallocateOccupations(
  store: CohortStore,
  options: ReallocationOptions,
): ReallocationReport {
  const sources = collectSources(store, options);
  const supplyByOccupation = countByOccupation(store);
  const movedInto = zeroPerOccupation();
  const unmetDemand = zeroPerOccupation();

  // How many people may leave each occupation: its surplus over its own demand.
  // Without this, two occupations that are both short take turns draining each
  // other and the mix alternates on a two-tick period.
  const exportable = zeroPerOccupation();
  for (const occupation of OCCUPATIONS_IN_ORDER) {
    const surplus = supplyByOccupation[occupation] - options.demand[occupation];
    exportable[occupation] = surplus > 0 ? surplus : 0;
  }

  let moved = 0;
  for (const target of OCCUPATIONS_IN_ORDER) {
    if (target === OCCUPATION.idle) continue;
    let need = options.demand[target] - supplyByOccupation[target];
    if (need <= 0) continue;

    for (const from of sourcePriorityFor(target)) {
      if (need <= 0) break;
      for (const source of sources) {
        if (need <= 0 || exportable[from] <= 0) break;
        if (source.occupation !== from) continue;
        if (source.budget <= 0) continue;
        if (!store.isLive(source.handle)) continue;
        if (!mayTransitionTo(target, source)) continue;

        const available = Math.min(source.budget, store.countOf(source.handle), exportable[from]);
        const take = Math.min(available, need);
        if (take <= 0) continue;

        const actual = store.transfer(source.handle, target, take);
        source.budget -= actual;
        exportable[from] -= actual;
        supplyByOccupation[from] -= actual;
        supplyByOccupation[target] += actual;
        movedInto[target] += actual;
        need -= actual;
        moved += actual;
      }
    }
    unmetDemand[target] = need > 0 ? need : 0;
  }

  return { moved, movedInto, unmetDemand };
}

/**
 * Source occupations for a target, in priority order: `idle` first, then the
 * others by ascending contracted value, never the target itself.
 */
function sourcePriorityFor(target: OccupationValue): OccupationValue[] {
  const rest = OCCUPATIONS_IN_ORDER.filter(
    (occupation) => occupation !== target && occupation !== OCCUPATION.idle,
  );
  return [OCCUPATION.idle, ...rest];
}

/**
 * Snapshots every live cohort as a potential source, with its transfer budget
 * computed from the count **before** any move this tick.
 *
 * Taken up front for two reasons. It fixes the visit order to ascending slot
 * index for the whole pass, and it means a cohort created by a transfer earlier
 * in the same tick has no budget and cannot be drained again — the shape a
 * within-tick ping-pong would take.
 */
function collectSources(store: CohortStore, options: ReallocationOptions): SourceCohort[] {
  const sources: SourceCohort[] = [];
  for (const handle of store.handles()) {
    if (!store.isLive(handle)) continue;
    const key = store.keyOf(handle);
    const demography = requireDemography(options.species, key.speciesId);

    const age = cohortAgeMonths(key.birthTickBucket, options.worldTick);
    const normalized = normalizedCohortAge(age, demography.lifespanMonths);
    sources.push({
      handle,
      occupation: key.occupation,
      speciesId: key.speciesId,
      birthTickBucket: key.birthTickBucket,
      budget: floorDiv(store.countOf(handle) * TRANSFER_RATE_PER_TICK, FP_ONE),
      mature: age >= demography.maturityMonths,
      senescent: normalized >= RETIREMENT_NORMALIZED_AGE,
    });
  }
  sources.sort(compareSourceCohorts);
  return sources;
}

/**
 * The allocation order within a source occupation: ascending species id, then
 * **youngest birth bucket first**.
 *
 * Species order is the interned content order, which is a data fact rather than
 * a preference — nothing here may know a species by name.
 *
 * Youngest-first is a policy and it is **untuned**, like everything else this
 * change introduces. The reason it is the default rather than the reverse: a
 * cohort drafted into work close to {@link RETIREMENT_NORMALIZED_AGE} retires
 * out of it again within a few decades, so oldest-first maximises churn through
 * the labour market for the same headcount. Whether that matters is a question
 * for the balance harness at 0.5.0; that it is *decided* rather than incidental
 * is the part that matters now.
 */
function compareSourceCohorts(a: SourceCohort, b: SourceCohort): number {
  if (a.speciesId !== b.speciesId) return a.speciesId - b.speciesId;
  if (a.birthTickBucket !== b.birthTickBucket) return b.birthTickBucket - a.birthTickBucket;
  return a.occupation - b.occupation;
}

/** Current headcount per occupation, across every species and birth bucket. */
export function countByOccupation(store: CohortStore): Record<OccupationValue, number> {
  const counts = zeroPerOccupation();
  store.forEach((_handle, key, count) => {
    counts[key.occupation] += count;
  });
  return counts;
}
