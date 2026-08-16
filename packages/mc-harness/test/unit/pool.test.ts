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
import {
  DEFAULT_BOOT_TIMEOUT_MS,
  buildTasks,
  encodeRecord,
  expandSweep,
  runSweep,
  runTasksOnPool,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { POOL_WORKER_URL, TOY_FIXED_POOL, TOY_REGISTRIES, toySweep } from './fixtures.js';

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
    // The budget is generous on purpose. `hangOn` hangs forever, so it trips any
    // timeout at all, while a healthy toy run finishes in single-digit
    // milliseconds -- and the assertion below is that *only* the hung run timed
    // out. Two seconds is nothing against a hang, and the run timer no longer
    // starts until its worker reports ready, so this measures the timeout rather
    // than the host's ability to boot a thread quickly. The test below pins that
    // separation directly.
    const spec = toySweep({
      replicates: 4,
      failureThreshold: 4,
      termination: { worldTickCap: 64, perRunTimeoutMs: 4000 },
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

    // Asserted by identity rather than by count. The property is "the abandoned
    // run is the one that hung, and the pool kept going" -- a count of 1 says
    // that only if you already know which run it was, and would be satisfied by
    // a harness that abandoned an innocent run and let the hung one through.
    expect(
      result.records
        .filter((record) => record.status === 'failed')
        .map(({ coordinates }) => ({
          cellIndex: coordinates.cellIndex,
          replicateIndex: coordinates.replicateIndex,
        })),
    ).toEqual([{ cellIndex: 1, replicateIndex: 1 }]);
  }, 60_000);
});

describe('a run is charged for itself, not for its worker', () => {
  it('does not time out runs handed to a worker that is slow to boot', async () => {
    // The regression this exists for. `pool.ts` used to arm the run timer in
    // `pump`, at dispatch, so the first run on every freshly spawned worker was
    // charged for that worker's boot -- and because the pool replaces a worker
    // after every timeout, one slow boot cascaded into the next. It showed up as
    // 5 spurious `failed` records on one machine and 24 on a busier one.
    //
    // The fixture blocks for twice the per-run budget before it reports ready.
    // Every run here is healthy and finishes in single-digit milliseconds, so
    // the correct answer is zero failures; the old code produced nothing but.
    const spec = toySweep({
      replicates: 4,
      failureThreshold: 0,
      termination: { worldTickCap: 64, perRunTimeoutMs: 1000 },
    });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'workers',
        workerUrl: POOL_WORKER_URL,
        workerCount: 2,
        workerData: { bootDelayMs: 2000 },
      },
      provenance,
      now: () => 0,
    });

    expect(result.summary.failuresByClass).toEqual({});
    expect(result.summary.failureCount).toBe(0);
    expect(result.records).toHaveLength(spec.replicates * result.plan.cellCount);
  }, 60_000);

  it('still replaces a worker that never reports ready', async () => {
    // The other half: the run budget no longer bounds boot, so something has to.
    // A worker that never becomes ready must be given up on rather than leaving
    // the pool waiting forever on a `ready` that is not coming.
    const spec = toySweep({ replicates: 1, agentPool: TOY_FIXED_POOL });
    const plan = expandSweep(spec, TOY_REGISTRIES);
    const tasks = buildTasks(spec, plan);
    const twoTasks = new Map([...tasks].slice(0, 2));

    const results = await runTasksOnPool(twoTasks, {
      workerUrl: POOL_WORKER_URL,
      workerCount: 1,
      // Far longer than the boot budget below, so a result classified `timeout`
      // can only have come from the boot budget.
      perRunTimeoutMs: 30_000,
      bootTimeoutMs: 300,
      workerData: { neverReady: true },
    });

    expect(results.size).toBe(2);
    for (const result of results.values()) {
      expect(result.kind).toBe('failure');
      if (result.kind !== 'failure') continue;
      expect(result.failure.classification).toBe('timeout');
      expect(result.failure.message).toContain('did not report ready');
    }
  }, 60_000);

  it('defaults the boot budget generously, and refuses a nonsense one', async () => {
    expect(DEFAULT_BOOT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    await expect(
      runTasksOnPool(new Map(), {
        workerUrl: POOL_WORKER_URL,
        workerCount: 1,
        perRunTimeoutMs: 10,
        bootTimeoutMs: 0,
      }),
    ).rejects.toThrow(/bootTimeoutMs/);
  });
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
