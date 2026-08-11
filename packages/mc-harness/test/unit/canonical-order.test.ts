/*
 * Multiverse Mages — canonical-order aggregation, task 4.4.
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
 * ## The failure mode this file is built around
 *
 * The obvious test is: shuffle the records, aggregate, assert the answers are
 * equal. It passes against a correct implementation. It **also** passes against
 * an implementation with no sort in it at all, because most data sums the same
 * in any order — a hundred values within one order of magnitude are exactly
 * summed by doubles no matter how you associate them.
 *
 * So every order-independence assertion below is preceded by a **positive
 * control**: proof that folding *this specific data* in two different orders
 * through a plain accumulator gives two *different* answers. Only then does
 * "aggregation is order-invariant" mean anything. Without the control, this is a
 * test of nothing, which is the shape almost every order-independence test in
 * the wild actually has.
 */

import type { MetricEntries, RunRecord } from '@mm/mc-harness';
import { aggregateMetrics, countByStatus, sortCanonically, totalWorldTicks } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { TOY_REGISTRIES, syntheticRecord } from './fixtures.js';

const METRIC = 'toyFinalWealth';

/** A plain left fold, standing in for "what an unsorted implementation does". */
function naiveMean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * Values whose sum is genuinely order-sensitive in double precision: a huge
 * magnitude, its negation, and a crowd of small ones that vanish when added to
 * the huge value and survive when added to each other.
 */
const ORDER_SENSITIVE = [1e16, 1, 1, 1, 1, 1, 1, 1, -1e16, 3, 5, 7];

function recordsFor(values: readonly number[]): RunRecord[] {
  return values.map((value, index) => {
    const metrics: MetricEntries = { [METRIC]: { status: 'measured', value } };
    return syntheticRecord({ cellIndex: Math.floor(index / 4), replicateIndex: index % 4, metrics });
  });
}

/** A deterministic permutation, so a failure is reproducible. */
function permute<T>(items: readonly T[], step: number): T[] {
  const out: T[] = [];
  for (let index = 0; index < items.length; index += 1) {
    out.push(items[(index * step) % items.length] as T);
  }
  return out;
}

describe('the test data can actually distinguish two fold orders', () => {
  it('sums to different answers under two different orders (the positive control)', () => {
    const forward = naiveMean(ORDER_SENSITIVE);
    const backward = naiveMean([...ORDER_SENSITIVE].reverse());
    expect(forward).not.toBe(backward);
  });

  it('is not merely a last-bit whisker — the two answers differ by a whole unit of sum', () => {
    // 1/12th of a unit on a mean of twelve values: enormous next to a ULP, and
    // exactly the size of error a metric baseline would fail to explain.
    const forward = naiveMean(ORDER_SENSITIVE);
    const backward = naiveMean([...ORDER_SENSITIVE].reverse());
    expect(Math.abs(forward - backward)).toBeGreaterThan(0.01);
  });
});

describe('aggregation folds in canonical order, whatever order records arrive in', () => {
  it('gives one answer for every permutation of the same records', () => {
    const canonical = recordsFor(ORDER_SENSITIVE);
    const reference = aggregateMetrics(canonical, [METRIC], TOY_REGISTRIES.metrics);

    for (const step of [1, 5, 7, 11]) {
      const shuffled = permute(canonical, step);
      expect(aggregateMetrics(shuffled, [METRIC], TOY_REGISTRIES.metrics)).toEqual(reference);
    }
    expect(aggregateMetrics([...canonical].reverse(), [METRIC], TOY_REGISTRIES.metrics)).toEqual(
      reference,
    );
  });

  it('folds in (cellIndex, replicateIndex) order specifically, not in arrival order', () => {
    // Pins *which* order, not merely that there is one. An implementation that
    // sorted by run seed would pass the permutation test above and produce a
    // different number here — and the difference would be invisible until two
    // sweeps with different seeds disagreed.
    const canonical = recordsFor(ORDER_SENSITIVE);
    const aggregate = aggregateMetrics([...canonical].reverse(), [METRIC], TOY_REGISTRIES.metrics)[0];
    const byCoordinates = sortCanonically(canonical).map((record) => {
      const entry = record.metrics[METRIC];
      return entry !== undefined && entry.status === 'measured' ? entry.value : 0;
    });
    expect(aggregate?.value).toBe(naiveMean(byCoordinates));
  });

  it('sorts without mutating the array it was given', () => {
    const records = recordsFor(ORDER_SENSITIVE);
    const shuffled = permute(records, 5);
    const before = shuffled.map((record) => record.runSeed);
    sortCanonically(shuffled);
    expect(shuffled.map((record) => record.runSeed)).toEqual(before);
  });

  it('refuses two records for one run rather than double-counting', () => {
    const records = recordsFor([1, 2, 3]);
    expect(() => sortCanonically([...records, records[0] as RunRecord])).toThrow(/replicate/);
  });

  it('applies canonical order to the status and tick folds too', () => {
    const records = recordsFor(ORDER_SENSITIVE);
    expect(countByStatus(permute(records, 7))).toEqual(countByStatus(records));
    expect(totalWorldTicks(permute(records, 7))).toBe(totalWorldTicks(records));
  });
});

describe('unavailable entries are counted, never folded', () => {
  it('keeps an unavailable metric out of the mean and reports it by reason', () => {
    const records: RunRecord[] = [
      syntheticRecord({
        cellIndex: 0,
        replicateIndex: 0,
        metrics: { [METRIC]: { status: 'measured', value: 10 } },
      }),
      syntheticRecord({
        cellIndex: 0,
        replicateIndex: 1,
        metrics: { [METRIC]: { status: 'unavailable', reason: 'mechanic-absent' } },
      }),
      syntheticRecord({
        cellIndex: 0,
        replicateIndex: 2,
        metrics: { [METRIC]: { status: 'unavailable', reason: 'censored' } },
      }),
    ];
    const [aggregate] = aggregateMetrics(records, [METRIC], TOY_REGISTRIES.metrics);
    // 10, not 10/3 — an unavailable entry is not an observation of zero.
    expect(aggregate?.value).toBe(10);
    expect(aggregate?.sampleCount).toBe(1);
    expect(aggregate?.unavailableByReason).toEqual({ 'mechanic-absent': 1, censored: 1 });
  });

  it('reports null rather than 0 when nothing was measured at all', () => {
    const records = [
      syntheticRecord({
        cellIndex: 0,
        replicateIndex: 0,
        metrics: { [METRIC]: { status: 'unavailable', reason: 'mechanic-absent' } },
      }),
    ];
    const [aggregate] = aggregateMetrics(records, [METRIC], TOY_REGISTRIES.metrics);
    expect(aggregate?.value).toBeNull();
    expect(aggregate?.sampleCount).toBe(0);
  });
});
