/*
 * Multiverse Mages — shared fixtures for the harness test suite.
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  MetricEntries,
  Provenance,
  RunRecord,
  SweepRegistries,
  SweepSpec,
} from '@mm/mc-harness';
import { deriveRunSeed, factorRegistry, metricRegistry, strategyRegistry } from '@mm/mc-harness';

import { TOY_METRICS, TOY_PROVENANCE, TOY_STRATEGIES } from '../fixtures/toy-world.js';

/** The URL the pool tests hand to `new Worker`. */
export const POOL_WORKER_URL = new URL('../fixtures/pool-worker.mjs', import.meta.url);

/** The registries every fixture sweep is validated against. */
export const TOY_REGISTRIES: SweepRegistries = {
  metrics: metricRegistry([
    { id: TOY_METRICS.finalWealth, definitionVersion: 1, aggregation: 'mean', unit: 'wealth' },
    { id: TOY_METRICS.ticks, definitionVersion: 1, aggregation: 'mean', unit: 'world ticks' },
    {
      id: TOY_METRICS.absentMechanic,
      definitionVersion: 1,
      aggregation: 'mean',
      unit: 'dimensionless',
    },
  ]),
  strategies: strategyRegistry([...TOY_STRATEGIES]),
  // The factors the toy scenario actually reads. A sweep naming any other is
  // rejected before dispatch — see `sweep-spec.test.ts`.
  factors: factorRegistry(['growth', 'ascendAt', 'a', 'b', 'c', 'alpha', 'zeta']),
};

/**
 * A one-strategy, fixed-assignment pool.
 *
 * For tests whose subject is scheduling, storage or reproduction rather than the
 * strategy pool. Since W18 a **round-robin** sweep must have a replicate count
 * that is a multiple of its pool size — round-robin cycles on the replicate
 * index alone, so any other count covers the pool partially or unevenly — and
 * these tests want replicate counts like 1, 3 and 5 chosen to exercise an edge
 * of the thing they are actually testing. Fixed assignment has no coverage
 * question, so it is the honest pool for them.
 */
export const TOY_FIXED_POOL = {
  strategies: ['toy-passive'],
  assignment: 'fixed',
  slots: 1,
} as const;

/** A valid sweep specification, with overrides for the case under test. */
export function toySweep(overrides: Partial<SweepSpec> = {}): SweepSpec {
  return {
    sweepId: 'toy-sweep',
    rootSeed: 20260805,
    factors: [
      { id: 'growth', levels: [0, 2, 4] },
      { id: 'ascendAt', levels: [200, 600] },
    ],
    replicates: 4,
    agentPool: { strategies: ['toy-passive', 'toy-greedy'], assignment: 'round-robin', slots: 1 },
    termination: { worldTickCap: 64, perRunTimeoutMs: 5000 },
    metrics: [TOY_METRICS.finalWealth, TOY_METRICS.ticks, TOY_METRICS.absentMechanic],
    ablation: { mode: 'none', primitives: [] },
    kind: 'gate',
    failureThreshold: 0,
    ...overrides,
  };
}

/** The provenance the toy executor reports, re-exported for record fixtures. */
export const FIXTURE_PROVENANCE: Provenance = TOY_PROVENANCE;

/** A temporary directory that removes itself. */
export function withTempDirectory<T>(body: (directory: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), 'mm-mc-harness-'));
  try {
    return body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Same, for an async body. */
export async function withTempDirectoryAsync<T>(
  body: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'mm-mc-harness-'));
  try {
    return await body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * A synthetic run record, for tests about aggregation and storage that must not
 * depend on what the toy universe happens to produce.
 */
export function syntheticRecord(input: {
  readonly cellIndex: number;
  readonly replicateIndex: number;
  readonly metrics: MetricEntries;
  readonly status?: RunRecord['status'];
  readonly terminalReason?: number;
  readonly ticksRun?: number;
  readonly sweepId?: string;
  readonly rootSeed?: number;
}): RunRecord {
  const coordinates = {
    rootSeed: input.rootSeed ?? 20260805,
    sweepId: input.sweepId ?? 'toy-sweep',
    cellIndex: input.cellIndex,
    replicateIndex: input.replicateIndex,
  };
  return {
    recordFormatVersion: 1,
    coordinates,
    runSeed: deriveRunSeed(coordinates),
    seedDerivationVersion: 1,
    levels: { growth: 0, ascendAt: 200 },
    strategies: ['toy-passive'],
    status: input.status ?? 'stagnated',
    terminalReason: input.terminalReason ?? 0,
    ticksRun: input.ticksRun ?? 1,
    metrics: input.metrics,
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    provenance: TOY_PROVENANCE,
  };
}
