/*
 * Multiverse Mages — fixtures for the baseline, gate and regeneration suites.
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
 * A sweep summary assembled from synthetic records rather than from a real
 * execution, so that a test about the *gate* is not also a test of the toy
 * world's arithmetic. The aggregates go through `aggregateMetrics`, though —
 * hand-written aggregates would let a test agree with a gate that disagrees with
 * every sweep this repository actually runs.
 */

import type {
  Baseline,
  MetricEntries,
  MetricRegistry,
  Provenance,
  RunRecord,
  SweepSummary,
} from '@mm/mc-harness';
import {
  aggregateMetrics,
  baselineMetrics,
  metricRegistry,
  regenerateBaseline,
  sealBaseline,
} from '@mm/mc-harness';

import { syntheticRecord } from './fixtures.js';

/** The metric ids these fixtures use. Two measured, one never available. */
export const FIXTURE_METRICS = {
  /** Varies within every cell. The metric with a usable standard error. */
  wealth: 'fixtureWealth',
  /** Identical in every run. Standard error zero, tolerance zero. */
  constant: 'fixtureConstant',
  /** Always `mechanic-absent`. Task 8.8's pass-through. */
  absent: 'fixtureAbsent',
} as const;

/** The registry the fixture summaries aggregate against. */
export const FIXTURE_REGISTRY: MetricRegistry = metricRegistry([
  { id: FIXTURE_METRICS.wealth, definitionVersion: 1, aggregation: 'mean', unit: 'wealth' },
  { id: FIXTURE_METRICS.constant, definitionVersion: 1, aggregation: 'mean', unit: 'nodes' },
  { id: FIXTURE_METRICS.absent, definitionVersion: 1, aggregation: 'mean', unit: 'dimensionless' },
]);

/** The provenance every fixture record and summary claims. */
export const FIXTURE_BASELINE_PROVENANCE: Provenance = {
  buildVersion: '0.3.0-fixture',
  contentHash: 'content-hash-fixture',
  rngRegistryHash: 'rng-registry-hash-fixture',
  observationSchemaVersion: 1,
  observationLayoutDigest: 'layout-digest-fixture',
  metricDefinitionVersions: {
    [FIXTURE_METRICS.wealth]: 1,
    [FIXTURE_METRICS.constant]: 1,
    [FIXTURE_METRICS.absent]: 1,
  },
};

/** How a fixture sweep may be perturbed, one knob per test. */
export interface FixtureSweepOptions {
  /** Added to every `fixtureWealth` value. The thing a gate would call a move. */
  readonly wealthShift?: number;
  /** Added to every `fixtureConstant` value. Moves a zero-tolerance metric. */
  readonly constantShift?: number;
  /** Makes `fixtureAbsent` report a number, for the newly-available path. */
  readonly absentBecomesAvailable?: boolean;
  /** Makes `fixtureWealth` report unavailable, for the newly-unavailable path. */
  readonly wealthBecomesUnavailable?: boolean;
  readonly provenance?: Provenance;
  readonly sweepId?: string;
  readonly configurationHash?: string;
  readonly rootSeed?: number;
  readonly failureCount?: number;
}

/** Two cells of six replicates: enough for a within-cell variance to exist. */
const CELLS = 2;
const REPLICATES = 6;

/** A sweep's records and its summary, consistent with each other by construction. */
export interface FixtureSweep {
  readonly records: readonly RunRecord[];
  readonly summary: SweepSummary;
}

/**
 * Builds a fixture sweep.
 *
 * `fixtureWealth` is `100 + 10·cell + replicate`, so it varies inside a cell and
 * between cells — the stratified estimator and the pooled one give visibly
 * different answers, which is what `standard-error.test.ts` needs.
 */
export function fixtureSweep(options: FixtureSweepOptions = {}): FixtureSweep {
  const records: RunRecord[] = [];
  for (let cellIndex = 0; cellIndex < CELLS; cellIndex += 1) {
    for (let replicateIndex = 0; replicateIndex < REPLICATES; replicateIndex += 1) {
      const wealth = 100 + 10 * cellIndex + replicateIndex + (options.wealthShift ?? 0);
      const metrics: MetricEntries = {
        [FIXTURE_METRICS.wealth]:
          options.wealthBecomesUnavailable === true
            ? { status: 'unavailable', reason: 'no-observations' }
            : { status: 'measured', value: wealth },
        [FIXTURE_METRICS.constant]: {
          status: 'measured',
          value: 7 + (options.constantShift ?? 0),
        },
        [FIXTURE_METRICS.absent]:
          options.absentBecomesAvailable === true
            ? { status: 'measured', value: 0.25 }
            : { status: 'unavailable', reason: 'mechanic-absent' },
      };
      records.push(
        syntheticRecord({
          cellIndex,
          replicateIndex,
          metrics,
          sweepId: options.sweepId ?? 'fixture-gate',
          rootSeed: options.rootSeed ?? 20260811,
        }),
      );
    }
  }

  const provenance = options.provenance ?? FIXTURE_BASELINE_PROVENANCE;
  const withProvenance = records.map((record) => ({ ...record, provenance }));
  const metricIds = Object.values(FIXTURE_METRICS);
  const failureCount = options.failureCount ?? 0;

  const summary: SweepSummary = {
    recordFormatVersion: 1,
    sweepId: options.sweepId ?? 'fixture-gate',
    kind: 'gate',
    rootSeed: options.rootSeed ?? 20260811,
    configurationHash: options.configurationHash ?? 'configuration-hash-fixture',
    cellCount: CELLS,
    runCount: withProvenance.length,
    countsByStatus: { stagnated: withProvenance.length },
    countsByTerminalReason: { stagnation: withProvenance.length },
    failureCount,
    failuresByClass: failureCount > 0 ? { crash: failureCount } : {},
    failureThreshold: 0,
    disqualified: failureCount > 0,
    aggregates: aggregateMetrics(withProvenance, metricIds, FIXTURE_REGISTRY),
    provenance,
    performance: {
      wallClockMs: 1000,
      runsPerSecond: withProvenance.length,
      worldTicksPerSecond: withProvenance.length,
      workerCount: 1,
      totalWorldTicks: withProvenance.length,
    },
  };

  return { records: withProvenance, summary };
}

/**
 * A sealed baseline consistent with {@link fixtureSweep}'s unperturbed output.
 *
 * Built by running the real {@link regenerateBaseline}, not by hand. A
 * hand-written baseline would let the gate suite agree with a baseline the
 * regeneration command could never produce, and the two halves of task group 8
 * would drift apart without a single test going red.
 */
export function fixtureBaseline(overrides: Partial<Baseline> = {}): Baseline {
  const { records, summary } = fixtureSweep();
  const result = regenerateBaseline({
    summary,
    records,
    rationale: 'fixture baseline, so that the gate has something to compare against.',
    notes: ['a fixture. Not a measurement of anything.'],
    toleranceK: 3,
  });
  if ('problems' in result) {
    throw new Error(`the fixture sweep could not produce a baseline: ${result.problems.join('; ')}`);
  }
  return sealBaseline({ ...result.baseline, ...overrides });
}

/** The standard error the fixture sweep gives `fixtureWealth`. Derived, not pinned. */
export function fixtureWealthStandardError(): number {
  const entry = baselineMetrics(fixtureBaseline()).get(FIXTURE_METRICS.wealth);
  if (entry === undefined || entry.status !== 'measured') {
    throw new Error('the fixture baseline does not measure fixtureWealth.');
  }
  return entry.standardError;
}
