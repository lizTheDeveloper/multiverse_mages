/*
 * Multiverse Mages — canonical-order aggregation of per-run results.
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
 * Tasks 4.4 and 4.5.
 *
 * ## Floating-point addition is not associative, and eight workers do not agree
 * on an order
 *
 * `(a + b) + c` and `a + (b + c)` differ in the last bits for values of very
 * different magnitude. A sweep on eight workers completes its runs in whatever
 * order the operating system chose that afternoon, so folding on completion
 * order makes the mean of ten thousand runs a function of machine load. The
 * release claim is *identical* aggregate metrics, not approximately identical,
 * and `design.md` rejects a tolerance outright: a tolerance on the
 * reproducibility check is a tolerance on the thing that makes every other
 * number trustworthy.
 *
 * So every fold in this file walks records sorted by `(cellIndex,
 * replicateIndex)`, and {@link sortCanonically} is the only ordering any of them
 * may use.
 *
 * ## The sort alone is not the guarantee
 *
 * A test that shuffles records, aggregates, and finds the answers equal proves
 * nothing unless the shuffled fold *could* have differed. Most metric data is
 * benign — a hundred values within one order of magnitude sum identically in any
 * order — so the naive test passes just as happily against an implementation
 * with no sort in it at all.
 *
 * `canonical-order.test.ts` therefore carries a **positive control**: it first
 * asserts that folding its test data in two different orders through a plain
 * accumulator gives two *different* answers, and only then asserts that
 * aggregation over the same data is order-invariant. Without the first half the
 * second half is a test of nothing, and it is the shape almost every
 * order-independence test in the wild actually has.
 *
 * ## Unavailable entries are counted, never folded
 *
 * A metric that reports `mechanic-absent` contributes to no mean. Folding it as
 * zero would make `winRateByPrimitive: 0` look like a finding rather than an
 * absence, which `design.md` names explicitly. The count by reason code goes
 * into the aggregate instead, so "no sample" and "sample of zero" stay distinct.
 */

import type { MetricAggregate, RunRecord } from './records.js';
import type { MetricRegistry } from './metrics.js';
import { isMeasured } from './metrics.js';

/**
 * Records in canonical order: by `cellIndex`, then by `replicateIndex`.
 *
 * Returns a new array; the input is never sorted in place. A fold that mutated
 * its caller's array would make "aggregate the same records twice" a different
 * operation the second time.
 *
 * @throws Error on a duplicate `(cellIndex, replicateIndex)`. Two records for
 * one run is either a pool bug or a file concatenated with itself, and both
 * produce an aggregate that silently double-counts.
 */
export function sortCanonically(records: readonly RunRecord[]): RunRecord[] {
  const seen = new Set<string>();
  for (const record of records) {
    const key = `${String(record.coordinates.cellIndex)}:${String(record.coordinates.replicateIndex)}`;
    if (seen.has(key)) {
      throw new Error(
        `Two records claim cell ${String(record.coordinates.cellIndex)}, replicate ` +
          `${String(record.coordinates.replicateIndex)}. One run, one record — a duplicate folds ` +
          'into every aggregate as a second observation of something that happened once.',
      );
    }
    seen.add(key);
  }
  return [...records].sort((a, b) => {
    if (a.coordinates.cellIndex !== b.coordinates.cellIndex) {
      return a.coordinates.cellIndex - b.coordinates.cellIndex;
    }
    return a.coordinates.replicateIndex - b.coordinates.replicateIndex;
  });
}

/** Folds values that are already in canonical order. Never call it with others. */
function fold(rule: string, values: readonly number[]): number | null {
  if (values.length === 0) return null;
  switch (rule) {
    case 'sum': {
      let total = 0;
      for (const value of values) total += value;
      return total;
    }
    case 'mean': {
      let total = 0;
      for (const value of values) total += value;
      return total / values.length;
    }
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
      throw new Error(`Unknown aggregation rule ${rule}.`);
  }
}

/**
 * Aggregates every metric the sweep declared, over the records it produced.
 *
 * `failed` runs contribute no metric values — they have none — but they are
 * *not* dropped from the sweep: the summary reports them by classification, and
 * the throughput figure counts them. `truncated` runs contribute normally,
 * which is the point of recording them at all.
 */
export function aggregateMetrics(
  records: readonly RunRecord[],
  metricIds: readonly string[],
  registry: MetricRegistry,
): MetricAggregate[] {
  const ordered = sortCanonically(records);
  const aggregates: MetricAggregate[] = [];

  // Metric ids sorted, so the summary's aggregate list is itself canonical and
  // two executions produce byte-identical summaries.
  for (const metricId of [...metricIds].sort()) {
    const definition = registry.get(metricId);
    if (definition === undefined) {
      throw new Error(
        `Cannot aggregate ${metricId}: it is not in the metric registry. The sweep validator ` +
          'rejects unknown metrics before dispatch, so reaching here means the registry changed ' +
          'underneath a running sweep.',
      );
    }

    const values: number[] = [];
    const unavailable: Record<string, number> = {};
    for (const record of ordered) {
      const entry = record.metrics[metricId];
      if (entry === undefined) continue;
      if (isMeasured(entry)) {
        values.push(entry.value);
      } else {
        unavailable[entry.reason] = (unavailable[entry.reason] ?? 0) + 1;
      }
    }

    aggregates.push({
      metricId,
      aggregation: definition.aggregation,
      definitionVersion: definition.definitionVersion,
      unit: definition.unit,
      value: fold(definition.aggregation, values),
      sampleCount: values.length,
      unavailableByReason: sortedCounts(unavailable),
    });
  }

  return aggregates;
}

/** Run counts by terminal status, in canonical key order. */
export function countByStatus(records: readonly RunRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of sortCanonically(records)) {
    counts[record.status] = (counts[record.status] ?? 0) + 1;
  }
  return sortedCounts(counts);
}

/** Failure counts by classification, in canonical key order. */
export function countByFailureClass(records: readonly RunRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of sortCanonically(records)) {
    if (record.failure === undefined) continue;
    counts[record.failure.classification] = (counts[record.failure.classification] ?? 0) + 1;
  }
  return sortedCounts(counts);
}

/**
 * Rebuilds a counts object with its keys in sorted order.
 *
 * `canonicalJson` sorts keys on the way to disk, so this is belt and braces for
 * the in-memory comparison the offline re-aggregation test makes — which
 * compares objects, not bytes, and would otherwise be sensitive to insertion
 * order in a way the files are not.
 */
function sortedCounts(counts: Readonly<Record<string, number>>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(counts).sort()) {
    sorted[key] = counts[key] as number;
  }
  return sorted;
}

/** Total world ticks executed across the sweep, folded in canonical order. */
export function totalWorldTicks(records: readonly RunRecord[]): number {
  let total = 0;
  for (const record of sortCanonically(records)) total += record.ticksRun;
  return total;
}
