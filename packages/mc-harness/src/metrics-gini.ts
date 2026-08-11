/*
 * Multiverse Mages — the shared Gini estimator behind both snowball metrics.
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
 * Task 6.8's estimator. **One implementation, used by both snowball metrics.**
 *
 * `worshipSnowball` and `capitalSnowball` are §7's runaway-leader guards over two
 * different quantities. Writing the coefficient twice would let the two drift —
 * one normalizing by `n` and the other by `n − 1`, say — and the symptom would be
 * `worshipSnowball` failing its ≤ 0.35 threshold while `capitalSnowball` over
 * identical data passed. So the formula lives here and neither collector may
 * carry its own.
 *
 * ## The formula is pinned, because there are several
 *
 * The capability spec fixes it, and this file implements exactly that:
 *
 *     G = (2 · Σ i·x_i) / (n · Σ x_i) − (n + 1) / n
 *
 * over **ascending-sorted** values with `i` **1-based**. That is the biased
 * (population) estimator. The small-sample correction `G · n/(n−1)` is *not*
 * applied: with the gate sweep's `n` in the hundreds the correction is under a
 * percent, and a baseline whose value depends on whether the reader remembered
 * the correction is worse than a baseline that is slightly biased in a fixed,
 * documented direction. The choice is part of `definitionVersion`.
 *
 * ## Degenerate populations are defined, not divided by zero
 *
 * `Σ x = 0` — every run at a checkpoint holding nothing — is perfect equality,
 * so `G = 0`. Returning `NaN` would be arithmetically honest and practically
 * disastrous: `canonicalJson` rejects `NaN`, so the run would fail with a
 * serialization error at the moment it reported the *most equal* distribution
 * possible. `n = 0` is a different thing entirely and is not this function's to
 * answer — see {@link gini}'s return type.
 *
 * ## Floating point and fold order
 *
 * Same standing as `metrics-survival.ts`: `mc-harness` is host-side tooling,
 * outside `scripts/check-purity.mjs`'s `PURE_PACKAGES` and outside the rules
 * path, and nothing computed here re-enters the simulation. The obligation it
 * does carry is reproducibility, so both sums fold over the ascending-sorted
 * values in that order and nowhere else.
 */

/** A Gini coefficient over one sample, with what the sample was. */
export interface GiniResult {
  /** `null` when the sample was empty — a coefficient over nothing is not 0. */
  readonly coefficient: number | null;
  readonly sampleCount: number;
  /** Total of the values. `0` is the degenerate-but-defined case. */
  readonly total: number;
}

/**
 * The Gini coefficient of a sample.
 *
 * @throws RangeError on a negative or non-finite value. Gini is defined for
 * non-negative quantities; a negative one produces a coefficient outside `[0,1]`
 * that looks like a number and means nothing, and both quantities §7 measures —
 * a regeneration rate and a node count — are non-negative by construction, so a
 * negative one is a collector bug worth stopping for.
 */
export function gini(values: readonly number[]): GiniResult {
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `Gini received the value ${String(value)}. The coefficient is defined over non-negative ` +
          'finite quantities; a negative one yields a coefficient outside [0, 1] that reads as a ' +
          'measurement.',
      );
    }
  }

  const n = values.length;
  if (n === 0) return { coefficient: null, sampleCount: 0, total: 0 };

  const sorted = [...values].sort((a, b) => a - b);

  let total = 0;
  for (const value of sorted) total += value;
  if (total === 0) return { coefficient: 0, sampleCount: n, total: 0 };

  let weighted = 0;
  for (let index = 0; index < n; index += 1) {
    weighted += (index + 1) * (sorted[index] as number);
  }

  return {
    coefficient: (2 * weighted) / (n * total) - (n + 1) / n,
    sampleCount: n,
    total,
  };
}

/**
 * The ratio of the 95th percentile to the median.
 *
 * §7's `worshipSnowball` carries a second condition — *"plus p95:p50 regen ≤
 * 3:1"* — which a Gini coefficient cannot express: Gini is a whole-distribution
 * summary and the ratio is a statement about one tail against the middle. A
 * distribution can satisfy either and violate the other.
 *
 * `null` when the median is 0, which is not a ratio. Reporting `Infinity` would
 * fail `canonicalJson` on the way to disk; reporting a large finite number would
 * be an invention.
 *
 * Percentiles use the **nearest-rank** rule on ascending-sorted values —
 * `ceil(p·n)`, 1-based — chosen over interpolation because it is exactly
 * reproducible with no arithmetic on the values themselves, and pinned under
 * `definitionVersion` like everything else here.
 */
export function tailRatio(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = nearestRank(sorted, 0.5);
  const p95 = nearestRank(sorted, 0.95);
  if (p50 === 0) return null;
  return p95 / p50;
}

/**
 * The nearest-rank percentile of an already-sorted ascending sample.
 *
 * Exported because `raidLengthDistribution` reports p50 and p95 too, and two
 * percentile conventions in one results file is exactly the ambiguity §7's
 * *"the precise definitions live in the capability specs"* is about.
 */
export function nearestRank(sortedAscending: readonly number[], quantile: number): number {
  if (sortedAscending.length === 0) {
    throw new RangeError('A percentile of an empty sample is not a number; check length first.');
  }
  if (!(quantile > 0 && quantile <= 1)) {
    throw new RangeError(`Quantile must be in (0, 1], received ${String(quantile)}.`);
  }
  const rank = Math.ceil(quantile * sortedAscending.length);
  const index = Math.min(Math.max(rank, 1), sortedAscending.length) - 1;
  return sortedAscending[index] as number;
}
