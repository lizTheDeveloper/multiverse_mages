/*
 * Multiverse Mages — per-run result records and the sweep summary.
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
 * Tasks 4.1, 4.2 and 4.3.
 *
 * ## A record is read in isolation, years later
 *
 * That is the capability spec's first scenario and it is the whole reason the
 * provenance block is repeated on every line rather than written once in a
 * header. Repetition costs bytes; a header costs the property. A record copied
 * out of a file, pasted into a bug report, and read in 2031 has to say which
 * build, which content, which metric definitions and which seed produced it —
 * and it will not have the header.
 *
 * The same reasoning fixes the second scenario: because every record carries
 * its own provenance, two runs disagreeing about the content hash is *visible*,
 * and {@link provenanceDisagreements} names them. A header could not have
 * disagreed with itself.
 *
 * ## Every registered metric has an entry
 *
 * `design.md`: "A missing key is a harness failure, an unavailable status is an
 * honest answer." {@link buildRunRecord} refuses to build a record for a
 * completed run whose metric entries do not cover the sweep's metric set. That
 * refusal turns the run into a `failed` record with a classification, which is
 * strictly better than a record that looks fine and is missing a column.
 */

import type { JsonValue } from './canonical.js';
import { canonicalJson } from './canonical.js';
import type { MetricEntries } from './metrics.js';
import type { ArmContribution, FailureClass, Provenance, RunTask } from './protocol.js';
import type { IllegalActionAccounting, TerminalStatus } from './session.js';
import type { RunCoordinates } from './seed.js';
import { SEED_DERIVATION_VERSION, deriveRunSeed } from './seed.js';

/**
 * The record format's own version, so a reader knows what shape to expect.
 *
 * **2** since task group 6's arm metrics were wired into the pipeline: a record
 * may now carry an {@link ArmContribution}, which is the per-run input to the
 * five `per-arm` metrics of `contracts.md` §7. Additive and optional — a version
 * 1 reader finds everything it expects — but the version moves anyway, because
 * offline re-aggregation of the arm metrics is only possible against records
 * that carry it, and "this file predates arm metrics" is a thing a reader in
 * 2031 needs to be able to establish without inspecting every line.
 */
export const RECORD_FORMAT_VERSION = 2;

/** One completed run, as written to the results file. */
export interface RunRecord {
  readonly recordFormatVersion: number;
  /** The four seed derivation inputs, verbatim. */
  readonly coordinates: RunCoordinates;
  /** The seed those inputs derive. Checked, never trusted. */
  readonly runSeed: number;
  readonly seedDerivationVersion: number;
  /** This cell's factor levels. */
  readonly levels: Readonly<Record<string, JsonValue>>;
  /** Strategy id per agent slot, in slot order. */
  readonly strategies: readonly string[];
  readonly status: TerminalStatus;
  readonly ticksRun: number;
  readonly metrics: MetricEntries;
  readonly accounting: IllegalActionAccounting;
  readonly provenance: Provenance;
  /** Present only when `status` is `failed`. */
  readonly failure?: { readonly classification: FailureClass; readonly message: string };
  /**
   * This run's contribution to the arm-scoped metrics, when its executor
   * described one. See {@link ArmContribution}.
   */
  readonly armContribution?: ArmContribution;
}

/** Wall-clock figures. Excluded from every reproducibility comparison (task 4.9). */
export interface PerformanceSection {
  readonly wallClockMs: number;
  readonly runsPerSecond: number;
  readonly worldTicksPerSecond: number;
  readonly workerCount: number;
  readonly totalWorldTicks: number;
  /**
   * The figure this project has previously recorded on comparable hardware, if
   * the sweep declared one, so the gap is visible rather than remembered.
   */
  readonly referenceRunsPerSecond?: number;
}

/** The aggregate of one metric over a sweep. */
export interface MetricAggregate {
  readonly metricId: string;
  readonly aggregation: string;
  readonly definitionVersion: number;
  readonly unit: string;
  /** `null` when no run produced a measurement — never 0, which folds. */
  readonly value: number | null;
  /** How many runs contributed a measurement. */
  readonly sampleCount: number;
  /** How many runs reported `unavailable`, by reason code. */
  readonly unavailableByReason: Readonly<Record<string, number>>;
}

/** The one summary record a sweep writes beside its per-run records. */
export interface SweepSummary {
  readonly recordFormatVersion: number;
  readonly sweepId: string;
  readonly kind: string;
  readonly rootSeed: number;
  readonly configurationHash: string;
  readonly cellCount: number;
  readonly runCount: number;
  readonly countsByStatus: Readonly<Record<string, number>>;
  readonly failureCount: number;
  readonly failuresByClass: Readonly<Record<string, number>>;
  readonly failureThreshold: number;
  /** True when the failure count exceeded the threshold (task 3.8). */
  readonly disqualified: boolean;
  readonly aggregates: readonly MetricAggregate[];
  /**
   * The arm this sweep's runs constitute, when its executor described one.
   *
   * A non-ablation sweep is exactly one arm and its id is the `sweepId`; an
   * ablation sweep executes one sweep per arm, so this is still one arm. Absent
   * when no run carried an {@link ArmContribution}, which is the honest report
   * for an executor that describes no arm — see {@link armMetrics}.
   */
  readonly armId?: string;
  /**
   * Every `per-arm` metric of `contracts.md` §7, measured over this arm.
   *
   * Kept separate from {@link aggregates} rather than merged into it, and the
   * separation is the point: an aggregate is a **fold of per-run values**, and
   * `sampleCount` on one means "how many runs produced a number". A Gini
   * coefficient across an arm has no per-run values to count, so presenting it
   * in the same list would attach a sample count that means something else to a
   * number that reads the same.
   */
  readonly armMetrics?: MetricEntries;
  readonly provenance: Provenance;
  /** Kept apart from everything above; see {@link reproducibleSummary}. */
  readonly performance: PerformanceSection;
}

/**
 * Builds one run record, checking everything a reader will later assume.
 *
 * @throws Error when the stored seed disagrees with its coordinates, or when a
 * completed run is missing an entry for a metric the sweep declared. Both are
 * caller bugs, and both produce a file that reads as valid.
 */
export function buildRunRecord(input: {
  readonly task: RunTask;
  readonly status: TerminalStatus;
  readonly ticksRun: number;
  readonly metrics: MetricEntries;
  readonly accounting: IllegalActionAccounting;
  readonly provenance: Provenance;
  readonly failure?: { readonly classification: FailureClass; readonly message: string };
  readonly armContribution?: ArmContribution;
}): RunRecord {
  const { task } = input;
  const derived = deriveRunSeed(task.coordinates);
  if (derived !== task.runSeed) {
    throw new Error(
      `Run seed ${String(task.runSeed)} does not match its coordinates, which derive ` +
        `${String(derived)}. A record whose seed cannot be recomputed from the four inputs it ` +
        'carries is not reproducible, which is the one property it exists to have.',
    );
  }

  if (input.status !== 'failed') {
    const declared = new Set(task.metrics);
    const missing = task.metrics.filter((metricId) => input.metrics[metricId] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `Run ${String(task.runSeed)} has no entry for ${missing.join(', ')}. Every registered ` +
          'metric gets an entry in every record — a measurement, or an explicit unavailable ' +
          'status. A missing key makes "the collector broke" and "the mechanic does not exist ' +
          'yet" indistinguishable.',
      );
    }
    // Equality, not coverage. Task 10.4 is what turns the registry from a list
    // into a contract, and it only does so if it holds in both directions: an
    // *extra* key is a column in a results file with no definition behind it,
    // which then gets aggregated, baselined and defended — and nobody deletes a
    // green gated metric. Same argument `registryConformance` makes for the
    // registry against contracts.md §7, applied one level down.
    const extra = Object.keys(input.metrics)
      .filter((metricId) => !declared.has(metricId))
      .sort();
    if (extra.length > 0) {
      throw new Error(
        `Run ${String(task.runSeed)} carries an entry for ${extra.join(', ')}, which the sweep did ` +
          'not declare. A record whose key set is wider than the sweep is a column no baseline ' +
          'can be keyed to and no definition covers.',
      );
    }
  }

  const record: RunRecord = {
    recordFormatVersion: RECORD_FORMAT_VERSION,
    coordinates: task.coordinates,
    runSeed: task.runSeed,
    seedDerivationVersion: SEED_DERIVATION_VERSION,
    levels: task.levels,
    strategies: task.strategies,
    status: input.status,
    ticksRun: input.ticksRun,
    metrics: input.metrics,
    accounting: input.accounting,
    provenance: input.provenance,
    ...(input.failure === undefined ? {} : { failure: input.failure }),
    ...(input.armContribution === undefined ? {} : { armContribution: input.armContribution }),
  };
  return record;
}

/** One record as its newline-delimited line, with no trailing newline. */
export function encodeRecord(record: RunRecord): string {
  return canonicalJson(record as unknown as JsonValue, 'record');
}

/** Parses a line written by {@link encodeRecord}. */
export function decodeRecord(line: string): RunRecord {
  return JSON.parse(line) as RunRecord;
}

/** The keys a provenance block must carry, all of them non-empty. */
export function provenanceProblems(provenance: Provenance | undefined): string[] {
  if (provenance === undefined || typeof provenance !== 'object') {
    return ['provenance block is missing entirely.'];
  }
  const problems: string[] = [];
  const text = (key: 'buildVersion' | 'contentHash' | 'rngRegistryHash' | 'observationLayoutDigest') => {
    const value = provenance[key];
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`provenance.${key} must be a non-empty string.`);
    }
  };
  text('buildVersion');
  text('contentHash');
  text('rngRegistryHash');
  text('observationLayoutDigest');
  if (!Number.isInteger(provenance.observationSchemaVersion)) {
    problems.push('provenance.observationSchemaVersion must be an integer.');
  }
  const versions = provenance.metricDefinitionVersions;
  if (versions === undefined || typeof versions !== 'object') {
    problems.push('provenance.metricDefinitionVersions must be an object keyed by metric id.');
  } else {
    for (const [metricId, version] of Object.entries(versions)) {
      if (!Number.isInteger(version)) {
        problems.push(`provenance.metricDefinitionVersions.${metricId} must be an integer.`);
      }
    }
  }
  return problems.sort();
}

/**
 * Names the runs whose provenance disagrees with the first record's.
 *
 * Returns lines rather than a boolean because the capability spec requires the
 * failure to *name the differing runs*: "two runs in the same sweep report
 * different content hashes" is only actionable if you can find them, and a
 * sweep of ten thousand records is not something anyone greps by eye.
 */
export function provenanceDisagreements(records: readonly RunRecord[]): string[] {
  if (records.length === 0) return [];
  const first = records[0] as RunRecord;
  const reference = canonicalJson(first.provenance as unknown as JsonValue, 'provenance');
  const problems: string[] = [];
  for (const record of records.slice(1)) {
    const encoded = canonicalJson(record.provenance as unknown as JsonValue, 'provenance');
    if (encoded !== reference) {
      problems.push(
        `run ${String(record.runSeed)} (cell ${String(record.coordinates.cellIndex)}, replicate ` +
          `${String(record.coordinates.replicateIndex)}) reports different provenance from run ` +
          `${String(first.runSeed)} (cell ${String(first.coordinates.cellIndex)}, replicate ` +
          `${String(first.coordinates.replicateIndex)}).`,
      );
    }
  }
  return problems;
}

/**
 * The summary with its performance section removed.
 *
 * Task 4.9 and the throughput requirement's second scenario: two executions are
 * compared for reproducibility with the timings excluded and **exact equality
 * everywhere else**. Providing this as a named function rather than leaving each
 * comparison to remember the exclusion is the difference between a rule and a
 * habit — and the habit fails on the first comparison someone writes in a hurry.
 */
export function reproducibleSummary(summary: SweepSummary): Omit<SweepSummary, 'performance'> {
  const rest: Record<string, unknown> = { ...summary };
  delete rest['performance'];
  return rest as unknown as Omit<SweepSummary, 'performance'>;
}

/** The summary as its own canonical line. */
export function encodeSummary(summary: SweepSummary): string {
  return canonicalJson(summary as unknown as JsonValue, 'summary');
}
