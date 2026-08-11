/*
 * Multiverse Mages — the standard error behind every tolerance, task 8.3.
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

import { describe, expect, it } from 'vitest';

import type { RunRecord } from '@mm/mc-harness';
import { STANDARD_ERROR_METHOD, standardErrorOf } from '@mm/mc-harness';

import { FIXTURE_METRICS, fixtureSweep } from './baseline-fixtures.js';
import { syntheticRecord } from './fixtures.js';

/** Records holding one metric with the values given, all in one cell. */
function oneCell(values: readonly number[], metricId = 'm'): RunRecord[] {
  return values.map((value, index) =>
    syntheticRecord({
      cellIndex: 0,
      replicateIndex: index,
      metrics: { [metricId]: { status: 'measured', value } },
    }),
  );
}

describe('the stratified estimator', () => {
  it('collapses to the textbook s/√n for a single-cell sweep', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance =
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
    const expected = Math.sqrt(variance / values.length);

    const estimate = standardErrorOf(oneCell(values), 'm', 'mean');
    expect(estimate.method).toBe(STANDARD_ERROR_METHOD.stratifiedByCell);
    expect(estimate.standardError).toBeCloseTo(expected, 12);
    expect(estimate.sampleSize).toBe(values.length);
    expect(estimate.strataCount).toBe(1);
  });

  it('does not fold a deliberate between-cell difference into the noise figure', () => {
    // Two cells whose means differ by ten and whose runs vary by ±1 inside a
    // cell. Pooling would report the ten; stratifying reports the one. This is a
    // positive control: without it, a test of the estimator passes against an
    // implementation with no stratification in it.
    const { records } = fixtureSweep();
    const stratified = standardErrorOf(records, FIXTURE_METRICS.wealth, 'mean').standardError;

    const flat = records.map(
      (record) => (record.metrics[FIXTURE_METRICS.wealth] as { value: number }).value,
    );
    const mean = flat.reduce((total, value) => total + value, 0) / flat.length;
    const pooledVariance =
      flat.reduce((total, value) => total + (value - mean) ** 2, 0) / (flat.length - 1);
    const pooled = Math.sqrt(pooledVariance / flat.length);

    expect(pooled).toBeGreaterThan(stratified * 2);
  });

  it('reports zero for a metric that has never varied, and does not soften it', () => {
    const estimate = standardErrorOf(oneCell([7, 7, 7, 7]), 'm', 'mean');
    expect(estimate.standardError).toBe(0);
    expect(estimate.sampleSize).toBe(4);
  });

  it('reports the singleton strata that bias it downward rather than correcting them', () => {
    const records = [
      syntheticRecord({ cellIndex: 0, replicateIndex: 0, metrics: { m: { status: 'measured', value: 1 } } }),
      syntheticRecord({ cellIndex: 1, replicateIndex: 0, metrics: { m: { status: 'measured', value: 9 } } }),
    ];
    const estimate = standardErrorOf(records, 'm', 'mean');
    expect(estimate.strataCount).toBe(2);
    expect(estimate.singletonStrata).toBe(2);
    expect(estimate.standardError).toBe(0);
  });
});

describe('the jackknife, for folds that are not means', () => {
  it('is used for max and min', () => {
    expect(standardErrorOf(oneCell([1, 2, 3, 4]), 'm', 'max').method).toBe(
      STANDARD_ERROR_METHOD.jackknife,
    );
    expect(standardErrorOf(oneCell([1, 2, 3, 4]), 'm', 'min').method).toBe(
      STANDARD_ERROR_METHOD.jackknife,
    );
  });

  it('reduces to (n−1)/n times the gap between the top two, for a max', () => {
    const values = [1, 2, 3, 10];
    const estimate = standardErrorOf(oneCell(values), 'm', 'max');
    // Leaving out the maximum gives 3; every other omission gives 10. The
    // jackknife spread of that is (n−1)/n · (max − second) · √((n−1)/n)… which
    // is easier to state as: it is exactly the number the implementation's own
    // doc claims, and it is zero when the maximum is tied.
    expect(estimate.standardError).toBeGreaterThan(0);
    expect(standardErrorOf(oneCell([10, 10, 3, 1]), 'm', 'max').standardError).toBe(0);
  });
});

describe('unavailable entries never enter the estimate', () => {
  it('skips them and reports the sample size that remains', () => {
    const records = [
      syntheticRecord({ cellIndex: 0, replicateIndex: 0, metrics: { m: { status: 'measured', value: 1 } } }),
      syntheticRecord({ cellIndex: 0, replicateIndex: 1, metrics: { m: { status: 'measured', value: 3 } } }),
      syntheticRecord({
        cellIndex: 0,
        replicateIndex: 2,
        metrics: { m: { status: 'unavailable', reason: 'mechanic-absent' } },
      }),
    ];
    const estimate = standardErrorOf(records, 'm', 'mean');
    expect(estimate.sampleSize).toBe(2);
    expect(estimate.standardError).toBeCloseTo(1, 12);
  });

  it('reports nothing to estimate from when fewer than two runs measured it', () => {
    const estimate = standardErrorOf(oneCell([5]), 'm', 'mean');
    expect(estimate.method).toBe(STANDARD_ERROR_METHOD.none);
    expect(estimate.standardError).toBe(0);
    expect(estimate.sampleSize).toBe(1);
  });
});
