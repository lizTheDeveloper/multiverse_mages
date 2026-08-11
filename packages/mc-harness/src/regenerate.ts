/*
 * Multiverse Mages — deliberate baseline regeneration.
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
 * Task group 9, and the same rule CLAUDE.md states about `npm run goldens:regen`:
 * **a regenerated baseline is a claim that behaviour changed on purpose.**
 *
 * That rule is not enforceable by a checker — no program can read intent — so
 * everything here is arranged to make the claim *visible* instead:
 *
 * - The command is a separate entrypoint. Nothing in `npm test` or `npm run
 *   verify` reaches it, and a test asserts that no CI job names it either
 *   (task 9.6). A baseline that a test suite could rewrite is a baseline that
 *   passes because it was overwritten, which is the failure mode in miniature.
 * - It refuses to write without a rationale (task 9.2). Not a default, not a
 *   placeholder: an absent or blank `--rationale` exits non-zero having written
 *   nothing.
 * - It records the superseded baseline's `contentHash` and the per-metric delta
 *   from it, in the units the gate reports (task 9.3), so that the diff carries
 *   the movement and a reviewer reads what moved without re-running anything.
 * - It refuses a disqualified sweep by name and failure count (task 9.5),
 *   because the runs missing from a partly-failed sweep's aggregates are not a
 *   random sample of its runs.
 *
 * Tolerances change through this same command and no other (task 9.4). Widening
 * a tolerance is exactly equivalent to regenerating a baseline — it changes what
 * the gate will accept — so it earns the same rationale. Editing one by hand in
 * the file is caught by the baseline's `contentHash`, which only this command
 * recomputes.
 */

import type { Baseline, BaselineMetric, SupersededDelta, UnhashedBaseline } from './baseline.js';
import { BASELINE_FORMAT_VERSION, baselineMetrics, sealBaseline } from './baseline.js';
import type { MetricAggregate, RunRecord, SweepSummary } from './records.js';
import { standardErrorOf } from './standard-error.js';

/** Everything {@link regenerateBaseline} needs. */
export interface RegenerateInput {
  /** The summary of the sweep this baseline is taken from. */
  readonly summary: SweepSummary;
  /** Its per-run records. The standard errors are estimated from these. */
  readonly records: readonly RunRecord[];
  /** Why. Required, and stored verbatim in the file. */
  readonly rationale: string;
  /** Anything a reader must know before believing the numbers. */
  readonly notes?: readonly string[];
  /** The *k* of the k-standard-error tolerance rule. */
  readonly toleranceK: number;
  /** The baseline being replaced, if there is one. */
  readonly previous?: Baseline;
}

/** A regenerated baseline, or every reason the command refused to write one. */
export type RegenerateResult =
  | { readonly baseline: Baseline; readonly changes: readonly string[] }
  | { readonly problems: readonly string[] };

/** One metric's line, derived from its aggregate and the runs behind it. */
function metricLine(
  aggregate: MetricAggregate,
  records: readonly RunRecord[],
  toleranceK: number,
): BaselineMetric {
  const reasons = Object.keys(aggregate.unavailableByReason).sort();

  if (aggregate.value === null || aggregate.sampleCount === 0) {
    return {
      metricId: aggregate.metricId,
      status: 'unavailable',
      definitionVersion: aggregate.definitionVersion,
      aggregation: aggregate.aggregation as BaselineMetric['aggregation'],
      unit: aggregate.unit,
      // A metric no run measured and no run explained is still unavailable, and
      // the honest reason code is that nothing observed it.
      reasons: reasons.length > 0 ? reasons : ['no-observations'],
    };
  }

  const estimate = standardErrorOf(
    records,
    aggregate.metricId,
    aggregate.aggregation as BaselineMetric['aggregation'],
  );
  return {
    metricId: aggregate.metricId,
    status: 'measured',
    definitionVersion: aggregate.definitionVersion,
    aggregation: aggregate.aggregation as BaselineMetric['aggregation'],
    unit: aggregate.unit,
    value: aggregate.value,
    standardError: estimate.standardError,
    standardErrorMethod: estimate.method,
    sampleSize: estimate.sampleSize,
    tolerance: toleranceK * estimate.standardError,
  };
}

/** The value a baseline line carries, or `null` when it carries none. */
function valueOf(entry: BaselineMetric | undefined): number | null {
  if (entry === undefined || entry.status !== 'measured') return null;
  return entry.value;
}

/**
 * Per-metric movement from the superseded baseline, in the gate's own units.
 *
 * Deliberately computed against the *previous* standard error rather than the
 * new one: the question a reader is asking is "how far did this move relative to
 * what we thought the noise was", and the answer must not change because the
 * regeneration also re-estimated the noise.
 */
function deltasFrom(previous: Baseline, metrics: readonly BaselineMetric[]): SupersededDelta[] {
  const before = baselineMetrics(previous);
  const ids = new Set<string>([...before.keys(), ...metrics.map((entry) => entry.metricId)]);
  const byId = new Map(metrics.map((entry) => [entry.metricId, entry]));

  return [...ids].sort().map((metricId) => {
    const was = before.get(metricId);
    const now = byId.get(metricId);
    const previousValue = valueOf(was);
    const value = valueOf(now);
    const delta = previousValue === null || value === null ? null : value - previousValue;
    const scale = was !== undefined && was.status === 'measured' ? was.standardError : 0;
    return {
      metricId,
      previousValue,
      value,
      delta,
      deltaInStandardErrors: delta === null || scale === 0 ? null : delta / scale,
    };
  });
}

/** A one-line description of each metric that actually moved. For the command's output. */
function changeLines(deltas: readonly SupersededDelta[]): string[] {
  const lines: string[] = [];
  for (const delta of deltas) {
    if (delta.delta === 0) continue;
    const sigma =
      delta.deltaInStandardErrors === null ? '—' : `${delta.deltaInStandardErrors.toFixed(2)} SE`;
    lines.push(
      `${delta.metricId}: ${delta.previousValue === null ? 'unavailable' : String(delta.previousValue)} → ` +
        `${delta.value === null ? 'unavailable' : String(delta.value)} ` +
        `(delta ${delta.delta === null ? '—' : String(delta.delta)}, ${sigma})`,
    );
  }
  return lines;
}

/**
 * Builds the baseline a sweep supports, or refuses and says why.
 *
 * Pure: it reads no file and writes none. The write lives in the command in
 * `balance-cli.ts`, which is the only caller that owns a path, so that every
 * test in this repository can exercise the refusals without owning one.
 */
export function regenerateBaseline(input: RegenerateInput): RegenerateResult {
  const problems: string[] = [];

  if (typeof input.rationale !== 'string' || input.rationale.trim().length === 0) {
    problems.push(
      'A rationale is required and none was given. A baseline is a claim that the numbers in it ' +
        'are what this build should produce; regenerating one without stating why is how a ' +
        'regression becomes the new normal without anyone deciding that it should.',
    );
  }
  if (!Number.isFinite(input.toleranceK) || input.toleranceK <= 0) {
    problems.push(
      `toleranceK is ${String(input.toleranceK)}. It must be a positive number: it is the k of the ` +
        'k-standard-error rule, and a k of zero would demand exact equality of every metric ' +
        'while a negative one would accept anything.',
    );
  }
  if (input.summary.disqualified) {
    problems.push(
      `The sweep is disqualified: ${String(input.summary.failureCount)} failed runs exceeds its ` +
        `declared threshold of ${String(input.summary.failureThreshold)}. Its aggregates are ` +
        'computed over the runs that survived, which is not a random sample of the runs it ' +
        'dispatched, so they cannot become the number everything else is measured against.',
    );
  }
  if (input.summary.aggregates.length === 0) {
    problems.push('The sweep collected no metrics, so this baseline would gate nothing.');
  }

  if (problems.length > 0) return { problems: problems.sort() };

  const metrics = [...input.summary.aggregates]
    .sort((a, b) => (a.metricId < b.metricId ? -1 : a.metricId > b.metricId ? 1 : 0))
    .map((aggregate) => metricLine(aggregate, input.records, input.toleranceK));

  const supersededDeltas = input.previous === undefined ? [] : deltasFrom(input.previous, metrics);

  const unhashed: UnhashedBaseline = {
    baselineFormatVersion: BASELINE_FORMAT_VERSION,
    sweepId: input.summary.sweepId,
    kind: input.summary.kind,
    rootSeed: input.summary.rootSeed,
    configurationHash: input.summary.configurationHash,
    runCount: input.summary.runCount,
    toleranceK: input.toleranceK,
    provenance: input.summary.provenance,
    rationale: input.rationale.trim(),
    notes: input.notes === undefined ? [] : [...input.notes],
    supersedes: input.previous === undefined ? null : input.previous.contentHash,
    supersededDeltas,
    metrics,
  };

  const changes =
    input.previous === undefined
      ? ['first baseline for this sweep; nothing superseded.']
      : changeLines(supersededDeltas);

  return { baseline: sealBaseline(unhashed), changes };
}
