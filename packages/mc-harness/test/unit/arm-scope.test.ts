/*
 * Multiverse Mages — the strategy arm as a stratum and as a scope.
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
 * The two halves of the gate-power fix, tested where they can be reasoned about
 * on made-up numbers rather than on a two-minute sweep.
 *
 * The important test in this file is the **positive control** in the first
 * block. `standard-error.test.ts` already asserts that stratifying beats pooling
 * on a fixture built to show it; the same test shape would pass just as happily
 * against an estimator that ignored the arm, because most fixture data is benign
 * enough that any partition gives a similar answer. So the fixture here is built
 * so that the *only* thing separating the two numbers is the arm: within an arm
 * every run agrees exactly, and the arms disagree by a factor of a hundred. An
 * estimator blind to the arm calls that spread noise; the corrected one calls it
 * zero, which is what it is.
 */

import { aggregateMetrics, armScopedMetricId, parseMetricScope, standardErrorOf } from '@mm/mc-harness';
import type { MetricRegistry, RunRecord } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

/** A registry with one `mean` metric, which is all these folds need. */
const REGISTRY: MetricRegistry = {
  ids: ['m'],
  has: (id: string) => id === 'm',
  get: (id: string) =>
    id === 'm'
      ? {
          metricId: 'm',
          definitionVersion: 1,
          aggregation: 'mean' as const,
          unit: 'things',
          scope: 'per-run' as const,
          summary: 'a test metric',
        }
      : undefined,
} as unknown as MetricRegistry;

/** One run record, carrying only what these estimators read. */
function run(cellIndex: number, replicateIndex: number, strategy: string, value: number): RunRecord {
  return {
    recordFormatVersion: 3,
    coordinates: { rootSeed: 1, sweepId: 's', cellIndex, replicateIndex },
    runSeed: 0,
    seedDerivationVersion: 1,
    levels: {},
    strategies: [strategy],
    status: 'truncated',
    terminalReason: 0,
    ticksRun: 1,
    metrics: { m: { status: 'measured', value } },
    accounting: { submitted: 0, rejected: 0, byReason: {} },
    provenance: {
      buildVersion: '0.0.0',
      contentHash: 'c',
      metricDefinitionVersions: { m: 1 },
      observationLayoutDigest: 'd',
      observationSchemaVersion: 1,
      rngRegistryHash: 'r',
    },
  } as unknown as RunRecord;
}

/** The `m` value of a fixture record. Every fixture measures it, so it is there. */
function valueOf(record: RunRecord): number {
  const entry = record.metrics['m'];
  if (entry === undefined || entry.status !== 'measured') {
    throw new Error('fixture record does not measure m');
  }
  return entry.value;
}

/**
 * Two cells, two arms, two replicates each. Within an arm every run agrees
 * exactly; the arms differ by 100×. All the spread there is, is between arms.
 */
const ARMS_DISAGREE: readonly RunRecord[] = [
  run(0, 0, 'quiet', 1),
  run(0, 1, 'loud', 100),
  run(0, 2, 'quiet', 1),
  run(0, 3, 'loud', 100),
  run(1, 0, 'quiet', 1),
  run(1, 1, 'loud', 100),
  run(1, 2, 'quiet', 1),
  run(1, 3, 'loud', 100),
];

describe('the strategy arm is a stratum', () => {
  it('is a positive control: pooling these runs would report a large spread', () => {
    // Without this assertion the next one tests nothing. The naive within-cell
    // sample variance of a cell holding {1, 100, 1, 100} is 3267, so an
    // estimator that ignored the arm has something substantial to report — and
    // the committed 200-year gate is exactly this fixture at scale.
    const cell = [1, 100, 1, 100];
    const mean = cell.reduce((total, value) => total + value, 0) / cell.length;
    const variance =
      cell.reduce((total, value) => total + (value - mean) ** 2, 0) / (cell.length - 1);
    expect(variance).toBeGreaterThan(3000);
  });

  it('reports zero spread when the only disagreement is between arms', () => {
    const estimate = standardErrorOf(ARMS_DISAGREE, 'm', 'mean');
    expect(estimate.standardError).toBe(0);
    expect(estimate.strataCount).toBe(4);
    expect(estimate.singletonStrata).toBe(0);
    expect(estimate.sampleSize).toBe(8);
  });

  it('still reports the spread that is inside an arm', () => {
    // The complement: move one run and the estimator must notice. A test that
    // only asserted "zero" above would pass against an estimator hard-wired to
    // return zero.
    const perturbed = [...ARMS_DISAGREE.slice(0, 2), run(0, 2, 'quiet', 9), ...ARMS_DISAGREE.slice(3)];
    expect(standardErrorOf(perturbed, 'm', 'mean').standardError).toBeGreaterThan(0);
  });

  it('changes nothing for a single-strategy sweep', () => {
    // Why `balance-gate-v1` and `balance-gate-horizon-v1` needed no
    // regeneration: with one arm the two partitions are the same partition.
    const single = ARMS_DISAGREE.map((record, index) =>
      run(record.coordinates.cellIndex, index, 'only', valueOf(record)),
    );
    const estimate = standardErrorOf(single, 'm', 'mean');
    expect(estimate.strataCount).toBe(2);
    // {1,100,1,100} within each of two cells, exactly as the old estimator saw it.
    expect(estimate.standardError).toBeCloseTo(Math.sqrt((4 * 3267 + 4 * 3267) / 64), 6);
  });

  it('counts every stratum as a singleton when one run plays each arm in each cell', () => {
    // The reason the 200-year sweep had to go from 8 replicates to 16. At one
    // run per (cell, arm) there is no within-stratum spread to estimate, the
    // standard error is 0, and a tolerance of 0 would demand bit-equality of
    // every line — a golden fixture, not a gate.
    const oneEach = [run(0, 0, 'quiet', 1), run(0, 1, 'loud', 100), run(1, 0, 'quiet', 2)];
    const estimate = standardErrorOf(oneEach, 'm', 'mean');
    expect(estimate.strataCount).toBe(3);
    expect(estimate.singletonStrata).toBe(3);
    expect(estimate.standardError).toBe(0);
  });

  it('estimates an arm-scoped metric over that arm alone', () => {
    const perturbed = [...ARMS_DISAGREE, run(0, 4, 'loud', 200)];
    // `quiet` never varies, whatever `loud` does.
    expect(standardErrorOf(perturbed, armScopedMetricId('m', 'quiet'), 'mean').standardError).toBe(
      0,
    );
    expect(
      standardErrorOf(perturbed, armScopedMetricId('m', 'loud'), 'mean').standardError,
    ).toBeGreaterThan(0);
  });
});

describe('a compound metric id survives a round trip', () => {
  it('splits back into the metric and the arm', () => {
    expect(parseMetricScope('referenceGrimoires@archivist')).toEqual({
      baseMetricId: 'referenceGrimoires',
      strategyKey: 'archivist',
    });
  });

  it('leaves a sweep-level id alone', () => {
    expect(parseMetricScope('referenceGrimoires')).toEqual({
      baseMetricId: 'referenceGrimoires',
      strategyKey: null,
    });
  });

  it('refuses an id that would make the split ambiguous', () => {
    expect(() => armScopedMetricId('a@b', 'c')).toThrow(/separates a metric id/);
    expect(() => armScopedMetricId('a', 'b@c')).toThrow(/separates a metric id/);
  });
});

describe('a multi-arm sweep is aggregated once per arm as well as once overall', () => {
  it('emits a line per (metric, arm) beside the sweep-level line', () => {
    const aggregates = aggregateMetrics(ARMS_DISAGREE, ['m'], REGISTRY);
    expect(aggregates.map((entry) => entry.metricId)).toEqual(['m', 'm@loud', 'm@quiet']);
    // The sweep-level mean of {1,100} × 4 is 50.5 — a number describing no
    // universe in the fixture, which is the whole argument for the arm lines.
    expect(aggregates.find((entry) => entry.metricId === 'm')?.value).toBe(50.5);
    expect(aggregates.find((entry) => entry.metricId === 'm@quiet')?.value).toBe(1);
    expect(aggregates.find((entry) => entry.metricId === 'm@loud')?.value).toBe(100);
  });

  it('carries the base metric’s definition version and unit onto every arm line', () => {
    // Otherwise the gate's per-metric definition-version check would compare a
    // line against nothing and pass it silently.
    for (const entry of aggregateMetrics(ARMS_DISAGREE, ['m'], REGISTRY)) {
      expect(entry.definitionVersion).toBe(1);
      expect(entry.unit).toBe('things');
      expect(entry.aggregation).toBe('mean');
    }
  });

  it('emits no arm lines for a single-arm sweep', () => {
    const single = ARMS_DISAGREE.map((record, index) =>
      run(record.coordinates.cellIndex, index, 'only', valueOf(record)),
    );
    expect(aggregateMetrics(single, ['m'], REGISTRY).map((entry) => entry.metricId)).toEqual(['m']);
  });

  it('returns aggregates sorted by id, which is what a baseline requires', () => {
    const ids = aggregateMetrics(ARMS_DISAGREE, ['m'], REGISTRY).map((entry) => entry.metricId);
    expect(ids).toEqual([...ids].sort());
  });
});
