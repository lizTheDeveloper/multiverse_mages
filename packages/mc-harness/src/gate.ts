/*
 * Multiverse Mages — the balance regression gate: what it compares, and every
 * way it refuses to compare.
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
 * Tasks 8.6, 8.7 and 8.8.
 *
 * ## The failure this file exists to prevent is a green gate
 *
 * Every other failure mode is loud. A gate that fails wrongly gets fixed within
 * the hour, because somebody is blocked. A gate that *passes* wrongly reports
 * green forever, and the first person to notice is whoever eventually asks why
 * the numbers in the baseline describe a build from eighteen months ago.
 *
 * So the default answer here is no. A missing baseline is not "nothing to
 * compare against, carry on" — it is {@link GATE_STATUS.baselineInvalid} and a
 * non-zero exit, because deleting a baseline file is otherwise the cheapest
 * possible silent regeneration. A metric in the baseline that the current sweep
 * did not produce is `baseline-invalid`, not a skipped line. A provenance key
 * that moved is `baseline-invalid`, not a delta computed across two builds. The
 * only things that pass are a metric inside its tolerance and a metric that was
 * explicitly unavailable on both sides.
 *
 * ## Why a deterministic sweep has a tolerance at all
 *
 * The gate sweep is reproducible to the bit: the same `rootSeed` produces the
 * same runs and therefore the same aggregates. Nothing in it moves by chance, so
 * a tolerance cannot be protecting against flakiness — and if it were, it would
 * be hiding real changes instead.
 *
 * What the tolerance measures is *size*. The standard error recorded in the
 * baseline is the spread between universes at the gate sweep's sample size, so a
 * delta of 0.2 standard errors says the build's behaviour moved by less than the
 * distance between two universes drawn from it; a delta of 40 says it moved by
 * far more than any universe ever differed from its siblings. Both numbers are
 * reported, always, because the raw delta alone cannot distinguish them — that
 * is exactly the "large-but-noisy versus small-but-significant" scenario in the
 * capability spec.
 *
 * ## Unavailable is a first-class answer on both sides
 *
 * Six of the twelve `contracts.md` §7 metrics describe mechanics that have not
 * shipped, and the shipped scenario measures vital signs rather than §7 metrics
 * at all. A gate that treated "no value" as 0 would report those six as a
 * perfect, permanent pass, and a gate that treated them as an error could never
 * be green. So `unavailable` on both sides is {@link GATE_STATUS.notGated} — it
 * passes and it says out loud that it is not gating anything — while a metric
 * that has *become* available is {@link GATE_STATUS.newlyAvailable}, which fails
 * and asks for a regeneration. The second is the important one: the first run in
 * which `libraryDependence` reports a number is a change in what the build does,
 * and the gate is the thing that notices.
 */

import type { Baseline, BaselineMetric } from './baseline.js';
import { baselineMetrics } from './baseline.js';
import type { Provenance } from './protocol.js';
import type { MetricAggregate, SweepSummary } from './records.js';

/** What the gate concluded about one metric. */
export const GATE_STATUS = {
  /** Inside tolerance, or unchanged. */
  pass: 'pass',
  /** Moved beyond its tolerance. The build fails. */
  regressed: 'regressed',
  /** No comparison was possible. The build fails, without a delta. */
  baselineInvalid: 'baseline-invalid',
  /** Unavailable in the baseline and in this run. Passes, gates nothing. */
  notGated: 'not-gated',
  /** Unavailable in the baseline, measured now. Needs a regeneration. */
  newlyAvailable: 'newly-available',
  /** Measured in the baseline, unavailable now. A lost measurement. */
  newlyUnavailable: 'newly-unavailable',
} as const;

/** Any status from {@link GATE_STATUS}. */
export type GateStatus = (typeof GATE_STATUS)[keyof typeof GATE_STATUS];

/** The gate's verdict on one metric, with everything task 8.6 requires reported. */
export interface GateComparison {
  readonly metricId: string;
  readonly status: GateStatus;
  /** `null` when the baseline recorded no value for it. */
  readonly baselineValue: number | null;
  /** `null` when this run produced no value for it. */
  readonly currentValue: number | null;
  /** `currentValue - baselineValue`, or `null` when either side has none. */
  readonly delta: number | null;
  /**
   * The raw delta in units of the baseline's standard error.
   *
   * `null` when there is no delta, or when the baseline's standard error is
   * zero — a metric that has never varied has no scale to express a move in, and
   * dividing by zero to print `Infinity` would look like a measurement.
   */
  readonly deltaInStandardErrors: number | null;
  /** From the baseline. What the metric was allowed to move by. */
  readonly tolerance: number | null;
  /** Why this metric could not be compared, when it could not be. */
  readonly reason?: string;
}

/** Everything the gate concluded, and whether the build fails. */
export interface GateReport {
  readonly sweepId: string;
  /** True only when every comparison passed and no block-level check failed. */
  readonly passed: boolean;
  /** Block-level refusals: provenance, configuration, disqualification. */
  readonly invalidations: readonly string[];
  /** One per metric, sorted by `metricId`. */
  readonly comparisons: readonly GateComparison[];
  /** The *k* the tolerances were derived at, from the baseline. */
  readonly toleranceK: number;
}

/** A gate outcome for a baseline that could not even be read (task 8.7, 8.10). */
export function missingBaselineReport(sweepId: string, reasons: readonly string[]): GateReport {
  return {
    sweepId,
    passed: false,
    invalidations: [...reasons],
    comparisons: [],
    toleranceK: 0,
  };
}

/** The provenance keys compared as a block. `metricDefinitionVersions` is per metric. */
const PROVENANCE_KEYS = [
  'buildVersion',
  'contentHash',
  'observationLayoutDigest',
  'observationSchemaVersion',
  'rngRegistryHash',
] as const;

/**
 * Names every provenance key on which the baseline and the current build differ.
 *
 * Per key rather than as one boolean, because the capability spec requires the
 * failure to *state which key mismatched*: "the content hash moved" and "the
 * observation layout moved" call for different work, and a gate that says only
 * "provenance differs" has made the reader do the diff by hand.
 */
export function provenanceMismatches(baseline: Provenance, current: Provenance): string[] {
  const problems: string[] = [];
  for (const key of PROVENANCE_KEYS) {
    const was = baseline[key];
    const now = current[key];
    if (was === now) continue;
    problems.push(
      `provenance.${key} is ${JSON.stringify(now)} and the baseline was recorded at ` +
        `${JSON.stringify(was)}. The gate compares two runs of one build; across two builds a ` +
        'delta is not a regression, it is a category error.',
    );
  }
  return problems.sort();
}

/** The reason codes an aggregate's runs gave, sorted, for the unavailable path. */
function reasonsOf(aggregate: MetricAggregate): string[] {
  return Object.keys(aggregate.unavailableByReason).sort();
}

/** Whether an aggregate carries a measurement at all. */
function measured(aggregate: MetricAggregate): boolean {
  return aggregate.value !== null && aggregate.sampleCount > 0;
}

function invalid(
  metricId: string,
  reason: string,
  baselineValue: number | null,
  currentValue: number | null,
  tolerance: number | null,
): GateComparison {
  return {
    metricId,
    status: GATE_STATUS.baselineInvalid,
    baselineValue,
    currentValue,
    delta: null,
    deltaInStandardErrors: null,
    tolerance,
    reason,
  };
}

/** One metric compared. Split out so every branch is readable in one screen. */
function compareMetric(entry: BaselineMetric, aggregate: MetricAggregate | undefined): GateComparison {
  const metricId = entry.metricId;

  if (aggregate === undefined) {
    return invalid(
      metricId,
      `the baseline gates ${metricId} and this sweep did not collect it. A gated metric the sweep ` +
        'stopped producing is not a pass — it is a gate that has quietly stopped gating.',
      entry.status === 'measured' ? entry.value : null,
      null,
      entry.status === 'measured' ? entry.tolerance : null,
    );
  }

  // Per metric, never per sweep: one metric's definition changing invalidates
  // that metric's comparison and leaves the other eleven gating normally.
  if (aggregate.definitionVersion !== entry.definitionVersion) {
    return invalid(
      metricId,
      `${metricId} is at definitionVersion ${String(aggregate.definitionVersion)} and the baseline ` +
        `recorded ${String(entry.definitionVersion)}. Two definitions of one name are two ` +
        'quantities, and their difference is not a delta.',
      entry.status === 'measured' ? entry.value : null,
      aggregate.value,
      entry.status === 'measured' ? entry.tolerance : null,
    );
  }

  if (aggregate.aggregation !== entry.aggregation) {
    return invalid(
      metricId,
      `${metricId} now folds by ${aggregate.aggregation} and the baseline recorded ` +
        `${entry.aggregation}. A mean and a maximum over the same runs are different numbers ` +
        'wearing one name.',
      entry.status === 'measured' ? entry.value : null,
      aggregate.value,
      entry.status === 'measured' ? entry.tolerance : null,
    );
  }

  const isMeasuredNow = measured(aggregate);

  if (entry.status === 'unavailable') {
    if (!isMeasuredNow) {
      // Task 8.8's pass-through. Both sides agree there is nothing to gate.
      return {
        metricId,
        status: GATE_STATUS.notGated,
        baselineValue: null,
        currentValue: null,
        delta: null,
        deltaInStandardErrors: null,
        tolerance: null,
        reason: `unavailable in the baseline and in this run (${reasonsOf(aggregate).join(', ')}).`,
      };
    }
    return {
      metricId,
      status: GATE_STATUS.newlyAvailable,
      baselineValue: null,
      currentValue: aggregate.value,
      delta: null,
      deltaInStandardErrors: null,
      tolerance: null,
      reason:
        `${metricId} was unavailable in the baseline (${entry.reasons.join(', ')}) and now reports ` +
        `${String(aggregate.value)} over ${String(aggregate.sampleCount)} runs. A mechanic that ` +
        'has started reporting is a change in what the build does; regenerate the baseline to ' +
        'start gating it.',
    };
  }

  if (!isMeasuredNow) {
    return {
      metricId,
      status: GATE_STATUS.newlyUnavailable,
      baselineValue: entry.value,
      currentValue: null,
      delta: null,
      deltaInStandardErrors: null,
      tolerance: entry.tolerance,
      reason:
        `${metricId} was measured at ${String(entry.value)} in the baseline and this run reports ` +
        `unavailable (${reasonsOf(aggregate).join(', ') || 'no runs measured it'}). A measurement ` +
        'that disappeared is a regression in the instrument, if not in the game.',
    };
  }

  const currentValue = aggregate.value as number;
  const delta = currentValue - entry.value;
  const deltaInStandardErrors = entry.standardError > 0 ? delta / entry.standardError : null;
  const within = Math.abs(delta) <= entry.tolerance;

  return {
    metricId,
    status: within ? GATE_STATUS.pass : GATE_STATUS.regressed,
    baselineValue: entry.value,
    currentValue,
    delta,
    deltaInStandardErrors,
    tolerance: entry.tolerance,
  };
}

/** What {@link compareToBaseline} needs about the sweep that just ran. */
export interface GateInput {
  readonly baseline: Baseline;
  readonly summary: SweepSummary;
}

/**
 * Compares a completed sweep against its committed baseline.
 *
 * Pure: it runs no sweep, reads no file, and writes nothing. The CLI in
 * `gate-cli.ts` is what turns a report into an exit code, and the regeneration
 * command in `regenerate.ts` reuses this to record what moved — one comparison,
 * so a baseline's `supersededDeltas` and the gate's report can never disagree
 * about the arithmetic.
 */
export function compareToBaseline(input: GateInput): GateReport {
  const { baseline, summary } = input;
  const invalidations: string[] = [];

  if (baseline.sweepId !== summary.sweepId) {
    invalidations.push(
      `the baseline is for sweep ${baseline.sweepId} and this is ${summary.sweepId}. Baselines are ` +
        'per sweep; neither can satisfy the other.',
    );
  }
  if (baseline.configurationHash !== summary.configurationHash) {
    invalidations.push(
      `the sweep configuration hashes to ${summary.configurationHash} and the baseline was ` +
        `recorded at ${baseline.configurationHash}. The experiment changed, so the numbers ` +
        'describe different experiments.',
    );
  }
  if (baseline.rootSeed !== summary.rootSeed) {
    invalidations.push(
      `the sweep ran at rootSeed ${String(summary.rootSeed)} and the baseline was recorded at ` +
        `${String(baseline.rootSeed)}.`,
    );
  }
  if (summary.disqualified) {
    invalidations.push(
      `the sweep is disqualified: ${String(summary.failureCount)} failed runs exceeds its declared ` +
        `threshold of ${String(summary.failureThreshold)}. A sweep that partly failed cannot ` +
        'clear a gate, because the runs missing from its aggregates are not a random sample.',
    );
  }
  for (const problem of provenanceMismatches(baseline.provenance, summary.provenance)) {
    invalidations.push(problem);
  }

  const aggregates = new Map(summary.aggregates.map((entry) => [entry.metricId, entry]));
  const gated = baselineMetrics(baseline);
  const comparisons: GateComparison[] = [];

  for (const metricId of [...gated.keys()].sort()) {
    comparisons.push(compareMetric(gated.get(metricId) as BaselineMetric, aggregates.get(metricId)));
  }

  // A metric the sweep collects and the baseline never heard of. Not fatal to
  // the other comparisons, but it is not gated, and silence would let a sweep
  // grow a metric that nothing ever checks.
  for (const metricId of [...aggregates.keys()].sort()) {
    if (gated.has(metricId)) continue;
    const aggregate = aggregates.get(metricId) as MetricAggregate;
    comparisons.push(
      invalid(
        metricId,
        `this sweep collects ${metricId} and the baseline has no line for it. Regenerate the ` +
          'baseline so the new metric is gated rather than merely collected.',
        null,
        aggregate.value,
        null,
      ),
    );
  }

  const failed = comparisons.some(
    (comparison) =>
      comparison.status === GATE_STATUS.regressed ||
      comparison.status === GATE_STATUS.baselineInvalid ||
      comparison.status === GATE_STATUS.newlyAvailable ||
      comparison.status === GATE_STATUS.newlyUnavailable,
  );

  return {
    sweepId: summary.sweepId,
    passed: invalidations.length === 0 && !failed,
    invalidations,
    comparisons,
    toleranceK: baseline.toleranceK,
  };
}

/** A number for a report line, or a dash where there is none. */
function show(value: number | null): string {
  return value === null ? '—' : value.toPrecision(6);
}

/**
 * The report as lines a human reads in CI output.
 *
 * Every measured comparison prints baseline, current, raw delta *and* delta in
 * standard errors, whether or not it passed. A gate that only prints failures
 * teaches its readers that silence means "not run".
 */
export function describeGate(report: GateReport): string[] {
  const lines: string[] = [];
  lines.push(
    `Balance gate for ${report.sweepId}: ${report.passed ? 'PASS' : 'FAIL'} ` +
      `(tolerance k = ${String(report.toleranceK)} standard errors).`,
  );
  for (const invalidation of report.invalidations) {
    lines.push(`  baseline-invalid: ${invalidation}`);
  }
  for (const comparison of report.comparisons) {
    const sigma =
      comparison.deltaInStandardErrors === null
        ? '—'
        : `${comparison.deltaInStandardErrors.toFixed(2)} SE`;
    lines.push(
      `  ${comparison.status.padEnd(17)} ${comparison.metricId}: baseline ` +
        `${show(comparison.baselineValue)}, current ${show(comparison.currentValue)}, delta ` +
        `${show(comparison.delta)} (${sigma}), tolerance ${show(comparison.tolerance)}`,
    );
    if (comparison.reason !== undefined) lines.push(`      ${comparison.reason}`);
  }
  return lines;
}
