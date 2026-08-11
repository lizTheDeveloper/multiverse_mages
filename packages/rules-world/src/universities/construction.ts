/*
 * Multiverse Mages — a university is built before it is a university.
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

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import type { ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';
import type { UniversityRecord } from '@mm/state';
import { UNIVERSITY, attachRecord, readRecord } from '@mm/state';

/**
 * ## A university at `buildProgress` 0 is a building site, not a small university
 *
 * The `universities` spec makes that a hard edge rather than a gradient: *"A
 * university MUST NOT admit students, host staff, or contribute library capital
 * until `buildProgress` reaches `fp(1024)`."* {@link effectiveCapacity} is the
 * one place that edge is decided, and everything downstream reads it rather
 * than comparing `buildProgress` itself — a second comparison somewhere else is
 * a second answer to "is this place open" the first time one of them is written
 * as `>` instead of `>=`.
 *
 * ## Materials are deducted before progress is credited
 *
 * *"materials are deducted in the same tick, and progress advances by the
 * deducted amount scaled by `laborAffinity` and the `build-rate` multiplier."*
 * The order matters and is not cosmetic: crediting progress and then trying to
 * pay for it is how a stock goes negative, and the spec's next scenario is
 * exactly that — *"`buildProgress` is unchanged that tick and no materials go
 * negative."* So the affordable amount of labour is computed first and the
 * progress is derived from what was actually paid for.
 *
 * ## `build-rate` is a primitive and `laborAffinity` is not
 *
 * `mages-and-species/design.md` flags the trap by name: vision §6 says orcs
 * have "high build-rate", but `build-rate` is an *effect primitive* carried by
 * nodes (`contracts.md` §3) and a species does not carry a primitive. So the
 * two multiply independently here — species affinity scales the labour, and the
 * primitive stacking scales the result through the shared capped accumulator
 * rather than through a second bespoke multiplier.
 *
 * ## Every magnitude below is untuned
 *
 * No balance harness exists before 0.5.0 (`docs/design/release-plan.md`). These
 * numbers were chosen so that a university built by the workforce
 * `demand.ts` asks for completes inside a reference run, not because they are
 * right.
 */

/** `buildProgress` at which a university is finished. `contracts.md` §1.4. */
export const BUILD_COMPLETE: Fixed = FP_ONE;

/**
 * Progress credited per person-month of neutral-affinity labour, in `fp`.
 * **Untuned.**
 *
 * Two `fp` units. `demand.ts` asks for {@link LABORERS_PER_BUILD_UNIT} — forty
 * — laborers per whole university, so a site staffed as demanded completes in
 * roughly `1024 / (40 × 2)` ≈ thirteen months. A year to raise a university is
 * a placeholder that makes the mechanism observable in a 200-year run.
 */
export const BUILD_PROGRESS_PER_LABOR_MONTH: Fixed = 2;

/**
 * Materials consumed per person-month of construction, in `fp`. **Untuned.**
 *
 * Charged per *month of labour offered*, not per unit of progress delivered, so
 * that a high-affinity species gets more building for the same materials rather
 * than the same building for fewer materials. Which of the two is right is a
 * balance question and therefore not answerable here; it is written down so
 * that whoever answers it at 0.5.0 knows which one was chosen.
 */
export const MATERIALS_PER_LABOR_MONTH: Fixed = 4;

/** What one tick of construction did. */
export interface ConstructionOutcome {
  /** `buildProgress` added this tick, in `fp`. */
  readonly progressAdded: Fixed;
  /** Materials deducted this tick, in `fp`. Never more than were available. */
  readonly materialsSpent: Fixed;
  /** Person-months that went unused for want of materials. */
  readonly labourStalled: number;
  /** Whether the university completed on this tick. */
  readonly completed: boolean;
}

/** What a tick of construction is given to work with. */
export interface ConstructionInput {
  /** Person-months of laborer time assigned to this site. */
  readonly laborMonths: number;
  /** The `laborAffinity` of the species supplying them, `fp`. */
  readonly laborAffinity: Fixed;
  /** The universe's materials stock, `fp`. */
  readonly materials: Fixed;
  /** The `build-rate` primitive record, for its stacking rule and cap. */
  readonly buildRate: PrimitiveRecord;
  /** `build-rate` bonuses from nodes and effects, `fp`. Empty is legitimate. */
  readonly buildRateBonuses: readonly Fixed[];
  /** Where a clamp of the `build-rate` cap is counted. */
  readonly counters?: ClampCounters | undefined;
}

/**
 * Creates a university under construction.
 *
 * `buildProgress` 0 and therefore effective capacity 0, whatever `capacity`
 * says. `capacity` is the *designed* figure and is written at creation because
 * it is what the site is being built to; the spec's first scenario is that a
 * half-built university with a designed capacity admits nobody.
 */
export function createUniversity(
  state: SimState,
  options: { capacity: number; libraryId?: EntityHandle },
): EntityHandle {
  if (!Number.isInteger(options.capacity) || options.capacity < 0) {
    throw new RangeError(
      `a university capacity must be a non-negative integer, received ${String(options.capacity)}`,
    );
  }
  const handle = state.entities.create();
  attachRecord(state, UNIVERSITY, handle, {
    libraryId: options.libraryId ?? 0,
    capacity: options.capacity,
    buildProgress: 0,
  });
  return handle;
}

/**
 * The capacity a university actually has, as opposed to the one it was designed
 * for.
 *
 * The single gate. Reading `buildProgress` anywhere else to decide whether a
 * university is open is how two places end up disagreeing about it.
 */
export function effectiveCapacity(university: UniversityRecord): number {
  return university.buildProgress >= BUILD_COMPLETE ? university.capacity : 0;
}

/** Whether a university is finished. */
export function isComplete(university: UniversityRecord): boolean {
  return university.buildProgress >= BUILD_COMPLETE;
}

/**
 * The `build-rate` multiplier, through the shared capped accumulator.
 *
 * Not a local sum. `contracts.md` §3 fixes `build-rate` as
 * `additive-into-multiplier` capped at `fp(4096)`, and `stackMagnitudes` is the
 * only implementation of that rule — a second one here would be a second cap to
 * keep in step, which is how a rate reaches 8.0 without anyone deciding it
 * should.
 */
export function buildRateMultiplier(input: ConstructionInput): Fixed {
  return stackMagnitudes(input.buildRate, input.buildRateBonuses, {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
  }).value;
}

/**
 * Advances one university's construction by one world tick, mutating its row.
 *
 * @returns What was spent and what was gained. The caller deducts
 * {@link ConstructionOutcome.materialsSpent} from the universe stock; this
 * function does not reach for it, because the materials stock is one number
 * shared by construction, scribing, upkeep and subsistence, and four writers
 * with four opinions about the order is the negative-stock defect the economy
 * spec forbids.
 */
export function advanceConstruction(
  university: UniversityRecord,
  input: ConstructionInput,
): ConstructionOutcome {
  if (!Number.isInteger(input.laborMonths) || input.laborMonths < 0) {
    throw new RangeError(
      `laborMonths must be a non-negative integer, received ${String(input.laborMonths)}`,
    );
  }
  if (isComplete(university)) {
    return { progressAdded: 0, materialsSpent: 0, labourStalled: 0, completed: false };
  }

  // Pay first. `floorDiv` rather than `div`: both operands are fp-scale
  // magnitudes of the same quantity, so this is a count and not a ratio.
  const affordableMonths = Math.min(
    input.laborMonths,
    floorDiv(Math.max(0, input.materials), MATERIALS_PER_LABOR_MONTH),
  );
  const materialsSpent = affordableMonths * MATERIALS_PER_LABOR_MONTH;

  const paidForProgress = affordableMonths * BUILD_PROGRESS_PER_LABOR_MONTH;
  const withAffinity = mul(paidForProgress, input.laborAffinity);
  const scaled = mul(withAffinity, buildRateMultiplier(input));

  const remaining = BUILD_COMPLETE - university.buildProgress;
  const progressAdded = Math.min(scaled, remaining);
  university.buildProgress += progressAdded;

  return {
    progressAdded,
    materialsSpent,
    labourStalled: input.laborMonths - affordableMonths,
    completed: isComplete(university),
  };
}

/** Reads a university row, for callers holding only a handle. */
export function readUniversity(state: SimState, handle: EntityHandle): UniversityRecord {
  return readRecord(state, UNIVERSITY, handle);
}
