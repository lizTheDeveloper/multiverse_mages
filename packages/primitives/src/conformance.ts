/*
 * Multiverse Mages — every primitive must have a neutralization rule.
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
 * ## What a missing neutralization rule looks like from the outside
 *
 * Nothing. The ablation arm runs, the sweep completes, `winRateByPrimitive`
 * comes back with a point estimate and a Wilson interval, and the number
 * describes an arm in which the primitive was never removed — or, if the
 * missing rule had defaulted to `0`, an arm whose every world-scale rate was
 * multiplied by zero. Both are reported in the same shape as a real finding,
 * and neither raises anything.
 *
 * That is why this check exists, why it fails instead of defaulting, and why it
 * is end-to-end rather than a lookup in {@link NEUTRALIZED_MAGNITUDE}. A table
 * that contains the right entries proves the table is right; it does not prove
 * the mask reaches the primitive. So every primitive is actually stacked twice,
 * with real sources, once masked and once not, and both the value and the
 * *difference* are asserted.
 *
 * The check is a pure function over registry records rather than a test, so the
 * Monte Carlo harness can run it before dispatching a sweep — a sweep that
 * spends an hour producing an unattributable number is worse than one that
 * refuses to start.
 */

import { FP_ONE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { PrimitiveRecord, PrimitiveStacking } from '@mm/content';

import { NEUTRALIZED_MAGNITUDE, neutralizing } from './ablation.js';
import { stackMagnitudes } from './stack.js';

/** One primitive the check could not certify, and why. */
export interface AblationConformanceProblem {
  readonly primitiveId: string;
  /** As declared by the registry — a string, because the failure case is a class no enum knows. */
  readonly stacking: string;
  readonly reason: string;
}

/** One primitive the check certified, and what neutralizing it produces. */
export interface AblationConformanceRow {
  readonly primitiveId: string;
  readonly stacking: PrimitiveStacking;
  /** The declared identity for the class, confirmed by stacking under a mask. */
  readonly neutralizedTo: Fixed;
  /** What the same probe sources stack to unmasked, so the difference is visible. */
  readonly unablated: Fixed;
}

/** The outcome of {@link ablationConformance}. */
export interface AblationConformanceReport {
  /** True exactly when `problems` is empty. */
  readonly conformant: boolean;
  readonly problems: readonly AblationConformanceProblem[];
  readonly checked: readonly AblationConformanceRow[];
}

/**
 * Probe sources: two of them, each `FP_ONE`.
 *
 * Two rather than one so that a rule which silently returns its single source
 * is distinguishable from one that stacks, and `FP_ONE` rather than a small
 * number so that every primitive's unablated value differs from its
 * neutralization — including `additive-into-multiplier`, whose identity is
 * `FP_ONE` itself and which therefore needs a probe that moves the multiplier.
 */
const PROBE: readonly Fixed[] = [FP_ONE, FP_ONE];

/**
 * The species base supplied to `fraction-of-species-base` caps.
 *
 * `lifespan` is the only such primitive, and the cap belongs to a cohort this
 * function knows nothing about. Any positive base works: the check asks whether
 * neutralization reaches `0`, and `0` is under every cap derived from a
 * positive base.
 */
const PROBE_SPECIES_BASE: Fixed = FP_ONE;

/**
 * Checks that every primitive given has a neutralization rule matching its
 * declared stacking class.
 *
 * Every problem is reported, not just the first — whoever added a stacking
 * class should learn everything it broke in one run — and a primitive that
 * fails is absent from `checked` rather than present with a guessed value.
 *
 * @param primitives - The registry's primitive records. `contracts.md` §3 is
 * the normative table behind them, and
 * `packages/content/test/unit/primitive-contract.test.ts` is what holds the two
 * equal.
 */
export function ablationConformance(
  primitives: readonly PrimitiveRecord[],
): AblationConformanceReport {
  const problems: AblationConformanceProblem[] = [];
  const checked: AblationConformanceRow[] = [];
  const seen = new Set<string>();

  for (const primitive of primitives) {
    if (seen.has(primitive.id)) {
      // Two records under one id means one arm's mask matches both, and which
      // record a consumer stacked against is a function of lookup order.
      problems.push({
        primitiveId: primitive.id,
        stacking: primitive.stacking,
        reason: `duplicate primitive id "${primitive.id}" in the registry; an ablation mask names an id, so one record would shadow the other`,
      });
      continue;
    }
    seen.add(primitive.id);

    const declared = NEUTRALIZED_MAGNITUDE[primitive.stacking] as Fixed | undefined;
    if (declared === undefined) {
      problems.push({
        primitiveId: primitive.id,
        stacking: primitive.stacking,
        reason: `no neutralization rule is declared for stacking class "${String(primitive.stacking)}"; add one to NEUTRALIZED_MAGNITUDE rather than letting ablation default`,
      });
      continue;
    }

    const options = { speciesBase: PROBE_SPECIES_BASE };
    const unablated = stackMagnitudes(primitive, PROBE, options).value;
    const neutralized = stackMagnitudes(primitive, PROBE, {
      ...options,
      ablation: neutralizing(primitive.id),
    }).value;

    if (neutralized !== declared) {
      problems.push({
        primitiveId: primitive.id,
        stacking: primitive.stacking,
        reason: `neutralizing it produced ${String(neutralized)}, but stacking class "${primitive.stacking}" declares ${String(declared)}`,
      });
      continue;
    }
    if (neutralized === unablated) {
      // The mask ran and changed nothing. Either it never reached this
      // primitive, or the probe cannot tell — and both make the arm's result
      // an unremoved primitive reported as a measurement.
      problems.push({
        primitiveId: primitive.id,
        stacking: primitive.stacking,
        reason: `the mask had no observable effect: masked and unmasked both stack to ${String(neutralized)}`,
      });
      continue;
    }

    checked.push({
      primitiveId: primitive.id,
      stacking: primitive.stacking,
      neutralizedTo: neutralized,
      unablated,
    });
  }

  return { conformant: problems.length === 0, problems, checked };
}
