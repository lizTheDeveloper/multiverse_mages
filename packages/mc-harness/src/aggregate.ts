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
import type { ArmRunSummary, ArmTelemetry, MirroredPlay } from './metrics-telemetry.js';
import type { ArmContribution } from './protocol.js';

/** The ablation play shape `ArmTelemetry` carries. Named so the fold can hold one. */
type ArmTelemetryAblationPlay = NonNullable<ArmTelemetry['ablationPlays']>[number];

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

/**
 * Assembles the arm the sweep's runs constitute, or reports why it cannot.
 *
 * This is the piece task group 6 declared and left unbuilt: `ArmTelemetry`
 * existed as a type with five collectors reading it, and nothing in the pipeline
 * ever constructed one — so every `per-arm` metric reported `per-arm-scope` in
 * the run records and then nothing at all in the summary. The five arm-scoped
 * metrics of `contracts.md` §7 were, in effect, declared and never measured.
 *
 * Three rules, each of which is a way the number could otherwise be wrong:
 *
 * 1. **Runs are folded in canonical order**, because a Gini coefficient is a
 *    floating-point fold and eight workers do not finish in an order. This is
 *    the same argument the rest of this file makes, and `ArmTelemetry.runs`
 *    documents the requirement rather than enforcing it, so it is enforced here.
 * 2. **No contribution means no arm.** An executor that describes no arm gets
 *    `undefined`, not an arm with zero runs. `gini([])` is 0 and 0 is the
 *    coefficient of a perfectly equal population, so an empty arm would report
 *    perfect equality of a quantity nobody measured.
 * 3. **Disagreement throws.** Two runs of one arm claiming different mechanic
 *    availability, or different prestige carry-forward maxima, is the same class
 *    of defect as two runs reporting different content hashes — and the whole
 *    arm's numbers would describe neither build.
 *
 * `failed` runs contribute their status and nothing else. That is deliberate and
 * `ascensionRate` depends on it: a failed run is excluded from the denominator
 * and reported separately, which the collector does from the status alone.
 *
 * @throws Error naming the disagreeing runs.
 */
export function buildArmTelemetry(input: {
  readonly armId: string;
  readonly records: readonly RunRecord[];
  /** The primitive this arm neutralizes, when it is an ablation arm. */
  readonly ablatedPrimitiveId?: string | null;
}): ArmTelemetry | undefined {
  const ordered = sortCanonically(input.records);
  const described = ordered.filter((record) => record.armContribution !== undefined);
  if (described.length === 0) return undefined;

  const first = described[0] as RunRecord;
  const reference = first.armContribution as ArmContribution;
  const problems: string[] = [];
  for (const record of described.slice(1)) {
    const contribution = record.armContribution as ArmContribution;
    if (
      JSON.stringify(contribution.mechanics) !== JSON.stringify(reference.mechanics) ||
      contribution.prestigeCarryForwardMax !== reference.prestigeCarryForwardMax
    ) {
      problems.push(
        `run ${String(record.runSeed)} (cell ${String(record.coordinates.cellIndex)}, replicate ` +
          `${String(record.coordinates.replicateIndex)}) reports different mechanic availability ` +
          `or prestige carry-forward from run ${String(first.runSeed)}.`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Arm ${input.armId} was assembled from runs that disagree about what the build implements, ` +
        `so its per-arm metrics would describe neither:\n  ${problems.join('\n  ')}`,
    );
  }

  const mirroredPlays: MirroredPlay[] = [];
  const ablationPlays: ArmTelemetryAblationPlay[] = [];
  const runs: ArmRunSummary[] = [];
  for (const record of ordered) {
    const contribution = record.armContribution;
    runs.push({
      coordinates: record.coordinates,
      status: record.status,
      ticksRun: record.ticksRun,
      checkpoints: contribution?.checkpoints ?? [],
    });
    if (contribution?.mirroredPlay !== undefined) mirroredPlays.push(contribution.mirroredPlay);
    if (contribution?.ablationPlay !== undefined) ablationPlays.push(contribution.ablationPlay);
  }

  return {
    armId: input.armId,
    mechanics: reference.mechanics,
    runs,
    prestigeCarryForwardMax: reference.prestigeCarryForwardMax,
    ...(mirroredPlays.length === 0 ? {} : { mirroredPlays }),
    ...(ablationPlays.length === 0 ? {} : { ablationPlays }),
    ...(input.ablatedPrimitiveId === undefined
      ? {}
      : { ablatedPrimitiveId: input.ablatedPrimitiveId }),
  };
}

/** Total world ticks executed across the sweep, folded in canonical order. */
export function totalWorldTicks(records: readonly RunRecord[]): number {
  let total = 0;
  for (const record of sortCanonically(records)) total += record.ticksRun;
  return total;
}
