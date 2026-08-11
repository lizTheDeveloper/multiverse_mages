/*
 * Multiverse Mages — the worker pool, tasks 3.2, 3.7 and 3.9.
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
 * These tests spawn **real** `worker_threads`, running the harness's real worker
 * entry point against source. A mocked pool would test the test double: the
 * behaviours that matter here — a worker that exits mid-task, a run that never
 * answers, a message arriving from a worker that has already been replaced —
 * are precisely the ones a mock has no reason to reproduce.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { RunRecord } from '@mm/mc-harness';
import { encodeRecord, runSweep, runTasksOnPool } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { POOL_WORKER_URL, TOY_REGISTRIES, toySweep } from './fixtures.js';

const provenance = {
  buildVersion: 'mc-harness-test-0',
  contentHash: 'toy-content-0000',
  rngRegistryHash: 'toy-rng-registry-0',
  observationSchemaVersion: 1,
  observationLayoutDigest: 'toy-layout-0000',
  metricDefinitionVersions: { toyFinalWealth: 1, toyTicks: 1, toyAbsentMechanic: 1 },
};

/** Records as bytes, which is the comparison the reproducibility claim makes. */
function bytes(records: readonly RunRecord[]): string[] {
  return records.map((record) => encodeRecord(record));
}

describe('the pool spawns real workers', () => {
  it('has a worker entry point on disk to spawn', () => {
    // Not vacuous: every test below would pass a nonexistent URL to `new Worker`
    // and fail with a module-resolution error that reads like a harness bug.
    expect(existsSync(fileURLToPath(POOL_WORKER_URL))).toBe(true);
  });
});

describe('worker count does not change results', () => {
  it('produces identical records and aggregates on 1 worker and on 8', async () => {
    const spec = toySweep({ replicates: 12 });

    const single = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 1 },
      provenance,
      now: () => 0,
    });
    const eight = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 8 },
      provenance,
      now: () => 0,
    });

    expect(single.records.length).toBe(spec.replicates * single.plan.cellCount);
    expect(bytes(eight.records)).toEqual(bytes(single.records));
    expect(eight.summary.aggregates).toEqual(single.summary.aggregates);
    expect(eight.summary.countsByStatus).toEqual(single.summary.countsByStatus);
  }, 60_000);
});

describe('the pool drains deterministically', () => {
  it('writes exactly one record per derived run seed, with no duplicates and no omissions', async () => {
    // 500 runs on 8 workers — the capability spec's own scenario.
    const spec = toySweep({
      factors: [
        { id: 'growth', levels: [0, 1, 2, 3, 4] },
        { id: 'ascendAt', levels: [200, 300, 400, 500, 600] },
      ],
      replicates: 20,
    });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 8 },
      provenance,
      now: () => 0,
    });

    expect(result.plan.runCount).toBe(500);
    expect(result.records).toHaveLength(500);
    expect(new Set(result.records.map((record) => record.runSeed)).size).toBe(500);
    const coordinates = result.records.map(
      (record) => `${String(record.coordinates.cellIndex)}:${String(record.coordinates.replicateIndex)}`,
    );
    expect(new Set(coordinates).size).toBe(500);
    expect(result.summary.failureCount).toBe(0);
  }, 120_000);
});

describe('one crashed worker does not lose the sweep', () => {
  it('records the affected run as failed, replaces the worker, and finishes the rest', async () => {
    const spec = toySweep({ replicates: 8, failureThreshold: 4 });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'workers',
        workerUrl: POOL_WORKER_URL,
        workerCount: 3,
        workerData: { crashOn: [{ cellIndex: 2, replicateIndex: 5 }] },
      },
      provenance,
      now: () => 0,
    });

    expect(result.records).toHaveLength(spec.replicates * result.plan.cellCount);
    const crashed = result.records.find(
      (record) => record.coordinates.cellIndex === 2 && record.coordinates.replicateIndex === 5,
    );
    expect(crashed?.status).toBe('failed');
    expect(crashed?.failure?.classification).toBe('worker-exit');
    // Everything else completed — the sweep was not aborted.
    expect(result.summary.failureCount).toBe(1);
    expect(result.records.filter((record) => record.status !== 'failed')).toHaveLength(
      spec.replicates * result.plan.cellCount - 1,
    );
  }, 60_000);

  it('classifies an executor that throws without destroying its worker', async () => {
    const spec = toySweep({ replicates: 6, failureThreshold: 4 });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'workers',
        workerUrl: POOL_WORKER_URL,
        workerCount: 1, // one worker, so it must survive to finish the sweep
        workerData: {
          throwOn: [
            { cellIndex: 0, replicateIndex: 0 },
            { cellIndex: 1, replicateIndex: 1 },
          ],
        },
      },
      provenance,
      now: () => 0,
    });

    expect(result.summary.failureCount).toBe(2);
    expect(result.summary.failuresByClass).toEqual({ threw: 2 });
    const failed = result.records.find((record) => record.status === 'failed');
    expect(failed?.failure?.message).toContain('toy executor refused');
    // The surviving runs prove the worker was not replaced on every throw.
    expect(result.records.filter((record) => record.status !== 'failed').length).toBe(
      result.records.length - 2,
    );
  }, 60_000);

  it('abandons a run that outlives the per-run timeout and keeps going', async () => {
    // The budget is generous on purpose. The hung run never settles — the toy
    // executor awaits a promise with no resolver — so *any* finite timeout
    // catches it, and the assertion below is unaffected by how large this is.
    // What a small budget does affect is the other 23 runs: at 250 ms a loaded
    // machine running the whole workspace suite in parallel timed them out too,
    // and the test failed with 24 failures where it expects 1. That is a false
    // negative about the harness, produced by whatever else was running.
    // Raising it removes the flap without relaxing anything.
    const spec = toySweep({
      replicates: 4,
      failureThreshold: 4,
      termination: { worldTickCap: 64, perRunTimeoutMs: 5_000 },
    });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'workers',
        workerUrl: POOL_WORKER_URL,
        workerCount: 2,
        workerData: { hangOn: [{ cellIndex: 1, replicateIndex: 1 }] },
      },
      provenance,
      now: () => 0,
    });

    const hung = result.records.find(
      (record) => record.coordinates.cellIndex === 1 && record.coordinates.replicateIndex === 1,
    );
    expect(hung?.status).toBe('failed');
    expect(hung?.failure?.classification).toBe('timeout');
    expect(result.records).toHaveLength(spec.replicates * result.plan.cellCount);
    expect(result.summary.failureCount).toBe(1);
  }, 60_000);
});

describe('excess failures disqualify a sweep', () => {
  it('reports disqualified when the failure count exceeds the declared threshold', async () => {
    const spec = toySweep({ replicates: 4, failureThreshold: 1 });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'workers',
        workerUrl: POOL_WORKER_URL,
        workerCount: 2,
        workerData: {
          throwOn: [
            { cellIndex: 0, replicateIndex: 0 },
            { cellIndex: 0, replicateIndex: 1 },
          ],
        },
      },
      provenance,
      now: () => 0,
    });
    expect(result.summary.failureCount).toBe(2);
    expect(result.summary.disqualified).toBe(true);

    // The control: at the threshold it is not disqualified, so `disqualified`
    // is not simply "any failure at all".
    const tolerant = await runSweep({
      spec: toySweep({ replicates: 4, failureThreshold: 2 }),
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'workers',
        workerUrl: POOL_WORKER_URL,
        workerCount: 2,
        workerData: {
          throwOn: [
            { cellIndex: 0, replicateIndex: 0 },
            { cellIndex: 0, replicateIndex: 1 },
          ],
        },
      },
      provenance,
      now: () => 0,
    });
    expect(tolerant.summary.disqualified).toBe(false);
  }, 60_000);
});

describe('the pool refuses configurations it cannot honour', () => {
  it('rejects a non-positive worker count and a non-positive timeout', async () => {
    const tasks = new Map();
    await expect(
      runTasksOnPool(tasks, { workerUrl: POOL_WORKER_URL, workerCount: 0, perRunTimeoutMs: 10 }),
    ).rejects.toThrow(/workerCount/);
    await expect(
      runTasksOnPool(tasks, { workerUrl: POOL_WORKER_URL, workerCount: 1, perRunTimeoutMs: 0 }),
    ).rejects.toThrow(/perRunTimeoutMs/);
  });
});
