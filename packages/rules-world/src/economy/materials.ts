/*
 * Multiverse Mages — materials: made by labour, spent in a fixed order, never
 * negative.
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

import type { Fixed } from '@mm/sim-core';
import { mul } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import type { ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

/**
 * ## One stock, four claimants, and an order that is a decision
 *
 * The `economy` spec requires materials to be *"met in a documented
 * deterministic priority order"* and the stock never to go negative. Both halves
 * live here, and neither construction nor scribing nor library upkeep writes
 * the stock itself — each of those returns what it *would* spend and this
 * module decides who is paid. Four writers with four opinions about the order
 * is the negative-stock defect written as an architecture.
 *
 * The order is {@link CONSUMPTION_ORDER} and it is an argument, not an
 * alphabet:
 *
 * 1. **Subsistence.** People eat first. A universe that lets its populace
 *    starve to finish a building has fewer laborers next tick, which is a
 *    feedback loop pointing the wrong way.
 * 2. **Library upkeep.** Knowledge already held before knowledge not yet
 *    written: an unmaintained library degrades, and `contracts.md` §1.5 makes
 *    losing an instance permanent in a way a delayed grimoire is not.
 * 3. **Scribing.** New knowledge before new buildings, because a grimoire in
 *    progress is mage-months already spent and a stalled building is only time.
 * 4. **Construction.** Last, and the `universities` spec already defines what
 *    happens when it goes unpaid: progress is unchanged that tick and nothing
 *    is lost but the month.
 *
 * ## Every magnitude here is untuned
 *
 * `docs/design/release-plan.md`: no release before 0.5.0 may claim any of them
 * is balanced.
 */

/** Materials one laborer produces per world tick at neutral affinity, `fp`. **Untuned.** */
export const MATERIALS_PER_LABORER: Fixed = 8;

/** Materials one person consumes per world tick to stay alive, `fp`. **Untuned.** */
export const SUBSISTENCE_PER_PERSON: Fixed = 1;

/** What materials production is made of. */
export interface ProductionInput {
  /** Laborer cohort members. */
  readonly laborerCount: number;
  /** The `laborAffinity` of the species supplying them, `fp`. */
  readonly laborAffinity: Fixed;
  /** The `resource-yield` primitive record, for its stacking rule and cap. */
  readonly resourceYield: PrimitiveRecord;
  /** `resource-yield` bonuses from nodes and effects, `fp`. */
  readonly resourceYieldBonuses: readonly Fixed[];
  readonly counters?: ClampCounters | undefined;
}

/** The `(1 + Σ)` `resource-yield` multiplier, capped once by the shared implementation. */
export function resourceYieldMultiplier(input: ProductionInput): Fixed {
  return stackMagnitudes(input.resourceYield, input.resourceYieldBonuses, {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
  }).value;
}

/**
 * Materials one laborer cohort produces this world tick, `fp`.
 *
 * Per cohort rather than per universe, because `laborAffinity` is a species
 * trait and a universe holds several species. Summing across cohorts is the
 * caller's, and it is a sum rather than an average for the obvious reason: an
 * average would let one high-affinity cohort raise the output of every other.
 */
export function materialsProduced(input: ProductionInput): Fixed {
  if (!Number.isInteger(input.laborerCount) || input.laborerCount < 0) {
    throw new RangeError(
      `laborerCount must be a non-negative integer, received ${String(input.laborerCount)}`,
    );
  }
  const base = input.laborerCount * MATERIALS_PER_LABORER;
  return mul(mul(base, input.laborAffinity), resourceYieldMultiplier(input));
}

/** What a whole populace eats this tick, `fp`. */
export function subsistenceDemand(population: number): Fixed {
  if (!Number.isInteger(population) || population < 0) {
    throw new RangeError(`population must be a non-negative integer, received ${String(population)}`);
  }
  return population * SUBSISTENCE_PER_PERSON;
}

/**
 * The four claims on the stock, in the order they are paid.
 *
 * Declared as a literal rather than derived from the demand record's keys, for
 * the reason `OCCUPATIONS_IN_ORDER` gives next door: the order is a decision a
 * reviewer checks, not a property of how an object literal was built.
 */
export const CONSUMPTION_ORDER = [
  'subsistence',
  'libraryUpkeep',
  'scribing',
  'construction',
] as const;

/** One of the four claims. */
export type ConsumptionKind = (typeof CONSUMPTION_ORDER)[number];

/** What each claimant is asking for this tick, `fp`. */
export type ConsumptionDemand = Readonly<Record<ConsumptionKind, Fixed>>;

/** What each claimant got, and what it went without. */
export interface ConsumptionOutcome {
  readonly spent: Readonly<Record<ConsumptionKind, Fixed>>;
  /** Demand that could not be met, per claimant. Recorded, never silent. */
  readonly shortfall: Readonly<Record<ConsumptionKind, Fixed>>;
  /** The stock afterwards. Never negative. */
  readonly materialsRemaining: Fixed;
  /** Whether anything went short at all, for the once-per-tick reporting path. */
  readonly anyShortfall: boolean;
}

function zeroPerKind(): Record<ConsumptionKind, Fixed> {
  const record = {} as Record<ConsumptionKind, Fixed>;
  for (const kind of CONSUMPTION_ORDER) record[kind] = 0;
  return record;
}

/**
 * Spends the stock down the priority order.
 *
 * @returns Every claimant's outcome and the remaining stock. Nothing is
 * partially refused silently: a claimant that got half of what it asked for has
 * half in `spent` and half in `shortfall`, and the sum of the two is always the
 * demand.
 * @throws RangeError on a negative demand, which would be a claimant *paying
 * into* the stock through the consumption path. Production has its own entry
 * point, and a negative cost is how a rounding error becomes free materials.
 */
export function consumeMaterials(stock: Fixed, demand: ConsumptionDemand): ConsumptionOutcome {
  const spent = zeroPerKind();
  const shortfall = zeroPerKind();
  let remaining = Math.max(0, stock);
  let anyShortfall = false;

  for (const kind of CONSUMPTION_ORDER) {
    const wanted = demand[kind];
    if (wanted < 0) {
      throw new RangeError(
        `${kind} demanded ${String(wanted)} materials; a negative demand would pay into the ` +
          'stock through the consumption path, which is not what consumption is',
      );
    }
    const paid = Math.min(wanted, remaining);
    spent[kind] = paid;
    shortfall[kind] = wanted - paid;
    if (shortfall[kind] > 0) anyShortfall = true;
    remaining -= paid;
  }

  return { spent, shortfall, materialsRemaining: remaining, anyShortfall };
}

/**
 * Asserts the invariant the `economy` spec states as a MUST.
 *
 * Called at the tick boundary rather than trusted. A negative materials stock
 * is the sort of defect that produces plausible output for a long time — every
 * demand is met, because a negative stock still satisfies `x >= wanted` in a
 * comparison somebody wrote the other way round.
 */
export function assertMaterialsNonNegative(stock: Fixed): void {
  if (stock < 0) {
    throw new Error(
      `the materials stock is ${String(stock)}; the economy spec requires it never to go below ` +
        'zero, and every claimant is paid through consumeMaterials precisely so that it cannot',
    );
  }
}
