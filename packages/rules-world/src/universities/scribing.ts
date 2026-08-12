/*
 * Multiverse Mages — scribing throughput, which is zero without scribes.
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
import type { ClampCounters, EffectControl } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';
import type { UniversityRecord } from '@mm/state';

import { primitiveFloor } from '../economy/primitive-floor.js';
import { isComplete } from './construction.js';

/**
 * ## Three multiplications and one of them is the interesting one
 *
 * Throughput is `scribes × scribeAffinity × scribeRate`. The first two are
 * arithmetic; the third is the shared capped accumulator from `contracts.md`
 * §3, and routing through it rather than around it is the whole point — the
 * `universities` spec says the library's capital contribution enters *the same*
 * accumulator, and it can only do that if there is one.
 *
 * ## Staff stay aggregated
 *
 * `contracts.md` §1.3 again: a university staffed with four thousand scribes
 * holds cohort handles, and no individual staff entity is created. The input
 * here is therefore a *count* and a species trait, never a list of people, and
 * the spec asserts the same thing from the other side ("`staffCohorts` holds
 * cohort handles, and no individual staff entity is created").
 *
 * ## Zero is a real answer
 *
 * A completed university with no scribe cohort has zero throughput, and the
 * `mage-autonomy` mask reads that zero to remove `scribe` from every mage
 * affiliated only with it. So the zero case is not an edge to be defended
 * against — it is a supported state with a downstream consumer, which is why it
 * is returned rather than treated as "no data".
 */

/** What a university's scribing capacity is made of. */
export interface ScribingInput {
  /** Scribe-cohort members assigned to this university. */
  readonly scribeCount: number;
  /** The `scribeAffinity` of the species supplying them, `fp`. */
  readonly scribeAffinity: Fixed;
  /** The `scribe-rate` primitive record, for its stacking rule and cap. */
  readonly scribeRate: PrimitiveRecord;
  /**
   * `scribe-rate` bonuses in `fp`, from nodes, effects, **and the library's
   * capital contribution**. One list, because `contracts.md` §3's cap only
   * bounds what passes through it.
   */
  readonly scribeRateBonuses: readonly Fixed[];
  readonly counters?: ClampCounters | undefined;
  /** Rego's combined clamp for `scribe-rate`. See `ProductionInput.clamp` in `economy/materials.ts`. */
  readonly clamp?: EffectControl | undefined;
}

/** Scribe-months produced per scribe per world tick at neutral affinity, `fp`. **Untuned.** */
export const SCRIBE_MONTHS_PER_SCRIBE: Fixed = 16;

/** The `(1 + Σ)` `scribe-rate` multiplier, capped once by the shared implementation. */
export function scribeRateMultiplier(input: ScribingInput): Fixed {
  const floor = primitiveFloor(input.scribeRate);
  return stackMagnitudes(input.scribeRate, input.scribeRateBonuses, {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
    ...(input.clamp === undefined ? {} : { clamp: input.clamp }),
    ...(floor === undefined ? {} : { floor }),
  }).value;
}

/**
 * Scribe-months one university produces this world tick, in `fp`.
 *
 * @returns Zero for an unfinished university and zero for one with no scribes.
 * The two zeroes are the same number and different situations; the caller that
 * needs to tell them apart reads `buildProgress`, which is why this function
 * does not try to encode the difference in its return.
 */
export function scribingThroughput(
  university: UniversityRecord,
  input: ScribingInput,
): Fixed {
  if (!Number.isInteger(input.scribeCount) || input.scribeCount < 0) {
    throw new RangeError(
      `scribeCount must be a non-negative integer, received ${String(input.scribeCount)}`,
    );
  }
  if (!isComplete(university) || input.scribeCount === 0) return 0;

  const base = input.scribeCount * SCRIBE_MONTHS_PER_SCRIBE;
  return mul(mul(base, input.scribeAffinity), scribeRateMultiplier(input));
}
