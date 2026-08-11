/*
 * Multiverse Mages — the standard error of a sweep aggregate, at the sweep's
 * own sample size.
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
 * Task 8.3's second field, and the number task 8.4's tolerance is a multiple of.
 *
 * ## Why the naive standard deviation over all runs is the wrong number
 *
 * A sweep is a factorial design: its runs are drawn from several *cells*, and
 * two cells differ because someone chose to make them differ. Pooling every run
 * into one `sd/√n` folds that deliberate difference into the estimate, and the
 * result is a "noise" figure that grows when a sweep author adds a factor level
 * — which is the opposite of what a tolerance should do. On the committed gate
 * sweep the pooled figure is roughly three times the stratified one, entirely
 * because `cohortSize` takes two levels.
 *
 * Cell membership is not random. Seeds are. So the estimator stratifies on
 * `cellIndex` and asks only how much the *replicates within a cell* disagree:
 *
 *     Var(mean) = Σ_c n_c · s_c² / N²
 *
 * which is the variance of `Σx/N` when runs inside cell *c* are exchangeable
 * with variance `σ_c²`, and which collapses to the textbook `s²/n` for a sweep
 * with one cell. `sum` is the same quantity without the `1/N²`.
 *
 * ## `min` and `max` are not means and are not treated as one
 *
 * There is no closed form for the standard error of an extremum, and applying
 * the formula above to one would produce a confident number about the wrong
 * quantity. Those folds get a **delete-one jackknife** instead: recompute the
 * fold with each run removed, and take the spread of the results. It is
 * deterministic (no bootstrap RNG in a package whose product is determinism),
 * defined for any statistic, and for a `mean` it reproduces the classical
 * `s/√n` exactly — which is why it is a fair thing to put beside one.
 *
 * Its known weakness is stated rather than hidden: the jackknife is
 * *inconsistent* for extrema. For a `max` it reduces to `(n−1)/n` times the gap
 * between the largest and second-largest run, so it measures how isolated the
 * winner is rather than how the maximum would move under resampling. That is a
 * scale, not a confidence interval, and the baseline records which method
 * produced each number so nobody has to guess later.
 *
 * ## Zero is a legitimate standard error and it is not softened
 *
 * When every run of every cell reports the same value, the within-cell variance
 * is zero, the standard error is zero, and the tolerance derived from it is
 * zero — the gate then demands exact equality of that metric. That is the
 * correct demand. A sweep is deterministic at a fixed root seed, so a metric
 * that has never varied cannot move by chance; if it moves, something changed.
 * Adding a floor to "avoid brittleness" would be adding a blind spot to the one
 * metric the gate can police perfectly.
 */

import type { AggregationRule } from './metrics.js';
import type { RunRecord } from './records.js';
import { isMeasured } from './metrics.js';
import { sortCanonically } from './aggregate.js';

/** How a standard error was arrived at. Recorded per metric in the baseline. */
export const STANDARD_ERROR_METHOD = {
  /** Within-cell variance, pooled across cells. For `mean` and `sum`. */
  stratifiedByCell: 'stratified-by-cell',
  /** Delete-one jackknife over runs. For `min` and `max`. */
  jackknife: 'jackknife',
  /** Fewer than two measurements: nothing to estimate a spread from. */
  none: 'none',
} as const;

/** Any method from {@link STANDARD_ERROR_METHOD}. */
export type StandardErrorMethod =
  (typeof STANDARD_ERROR_METHOD)[keyof typeof STANDARD_ERROR_METHOD];

/** One metric's noise figure at one sweep's sample size. */
export interface StandardErrorEstimate {
  readonly method: StandardErrorMethod;
  /** Non-negative, and finite. Zero means "this has never varied". */
  readonly standardError: number;
  /** Measurements that contributed. Runs reporting `unavailable` do not. */
  readonly sampleSize: number;
  /** Cells that contributed at least one measurement. */
  readonly strataCount: number;
  /**
   * Cells that contributed exactly one measurement.
   *
   * Their within-cell variance is unestimable and contributes 0, which biases
   * the standard error *down*. Reported rather than corrected: the fix is more
   * replicates, and a sweep whose cells hold one run each should be visibly
   * that rather than quietly under-toleranced.
   */
  readonly singletonStrata: number;
}

/** Measurements of one metric, grouped by cell, in canonical order throughout. */
function valuesByCell(
  records: readonly RunRecord[],
  metricId: string,
): { readonly cells: readonly (readonly number[])[]; readonly flat: readonly number[] } {
  const byCell = new Map<number, number[]>();
  const flat: number[] = [];
  for (const record of sortCanonically(records)) {
    const entry = record.metrics[metricId];
    if (entry === undefined || !isMeasured(entry)) continue;
    const cellIndex = record.coordinates.cellIndex;
    const bucket = byCell.get(cellIndex);
    if (bucket === undefined) byCell.set(cellIndex, [entry.value]);
    else bucket.push(entry.value);
    flat.push(entry.value);
  }
  const cells = [...byCell.keys()].sort((a, b) => a - b).map((key) => byCell.get(key) as number[]);
  return { cells, flat };
}

/** Mean of values already in canonical order. */
function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Unbiased sample variance, or 0 for a stratum too small to have one. */
function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const centre = mean(values);
  let total = 0;
  for (const value of values) total += (value - centre) * (value - centre);
  return total / (values.length - 1);
}

/** Recomputes the sweep's fold. Must agree with `aggregate.ts`'s `fold`. */
function refold(rule: AggregationRule, values: readonly number[]): number {
  switch (rule) {
    case 'sum': {
      let total = 0;
      for (const value of values) total += value;
      return total;
    }
    case 'mean':
      return mean(values);
    case 'min': {
      let best = values[0] as number;
      for (const value of values) if (value < best) best = value;
      return best;
    }
    case 'max': {
      let best = values[0] as number;
      for (const value of values) if (value > best) best = value;
      return best;
    }
    default:
      throw new Error(`Unknown aggregation rule ${String(rule)}.`);
  }
}

/** The delete-one jackknife standard error of `refold` over `values`. */
function jackknife(rule: AggregationRule, values: readonly number[]): number {
  const size = values.length;
  const replicates: number[] = [];
  for (let omitted = 0; omitted < size; omitted += 1) {
    const kept: number[] = [];
    for (let index = 0; index < size; index += 1) {
      if (index !== omitted) kept.push(values[index] as number);
    }
    replicates.push(refold(rule, kept));
  }
  const centre = mean(replicates);
  let total = 0;
  for (const replicate of replicates) total += (replicate - centre) * (replicate - centre);
  return Math.sqrt(((size - 1) / size) * total);
}

/**
 * The standard error of one metric's aggregate over the runs that produced it.
 *
 * @param records - Every run of the sweep. Unavailable entries are skipped, so
 * the returned `sampleSize` is the number the tolerance is actually derived at
 * and not the sweep's run count.
 * @throws Error for an unknown aggregation rule, which would otherwise produce
 * a number describing a fold nobody performed.
 */
export function standardErrorOf(
  records: readonly RunRecord[],
  metricId: string,
  aggregation: AggregationRule,
): StandardErrorEstimate {
  const { cells, flat } = valuesByCell(records, metricId);
  const sampleSize = flat.length;
  const strataCount = cells.length;
  const singletonStrata = cells.filter((cell) => cell.length < 2).length;

  if (sampleSize < 2) {
    return {
      method: STANDARD_ERROR_METHOD.none,
      standardError: 0,
      sampleSize,
      strataCount,
      singletonStrata,
    };
  }

  if (aggregation === 'mean' || aggregation === 'sum') {
    let total = 0;
    for (const cell of cells) total += cell.length * sampleVariance(cell);
    const variance = aggregation === 'mean' ? total / (sampleSize * sampleSize) : total;
    return {
      method: STANDARD_ERROR_METHOD.stratifiedByCell,
      standardError: Math.sqrt(variance),
      sampleSize,
      strataCount,
      singletonStrata,
    };
  }

  return {
    method: STANDARD_ERROR_METHOD.jackknife,
    standardError: jackknife(aggregation, flat),
    sampleSize,
    strataCount,
    singletonStrata,
  };
}
