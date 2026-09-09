/*
 * Multiverse Mages — cross-process raid reproduction.
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
 * Task 10.2 — cross-process reproduction: two worker threads, identical inputs,
 * byte-identical outcomes.
 *
 * The claim under test is that `runRaid` is a pure function of its inputs and
 * holds no state that leaks between runs or between address spaces. A test that
 * calls `buildRaid` twice in the same thread already passes (see
 * `raid-engine.test.ts`), but it shares the module graph, the content registry
 * singleton, and every closure the runtime created. A worker thread shares
 * none of those: it loads every module fresh, builds its own content registry,
 * and runs the raid in its own heap.
 *
 * The pattern follows `packages/server/test/unit/multi-process-match.test.ts`,
 * adapted from child processes to `worker_threads` because this package has no
 * `bin/` entry point to spawn. The source-resolution hook from
 * `packages/scenario/test/fixtures/source-resolution.mjs` is reused so the
 * workers load workspace source rather than a stale `dist/`.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runRaid } from '@mm/rules-raid';

import { buildRaid } from './raid-fixture.js';

const WORKER_URL = fileURLToPath(new URL('./raid-worker.mjs', import.meta.url));

interface WorkerResult {
  readonly outcomeJson: string;
}

/** Spawns a worker that builds and runs a raid, returning the outcome JSON. */
function spawnRaidWorker(workerData: {
  readonly raidSeed: number;
  readonly raiderNodes: readonly string[];
  readonly hostNodes: readonly string[];
  readonly withSoldiers: boolean;
}): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { workerData });
    worker.on('message', (message: WorkerResult) => resolve(message));
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${String(code)}`));
    });
  });
}

const RAID_PARAMS = {
  raidSeed: 42,
  raiderNodes: ['cig-the-uncontained-hour', 'im-read-the-surface'] as readonly string[],
  hostNodes: ['cig-the-uncontained-hour'] as readonly string[],
  withSoldiers: true,
};

describe('cross-process raid reproduction', () => {
  it('two workers produce byte-identical outcomes from the same inputs', async () => {
    const [first, second] = await Promise.all([
      spawnRaidWorker(RAID_PARAMS),
      spawnRaidWorker(RAID_PARAMS),
    ]);

    expect(first.outcomeJson).toBe(second.outcomeJson);
    // Not vacuous: the outcomes are non-trivial.
    const outcome = JSON.parse(first.outcomeJson) as { resolutionTick: number };
    expect(outcome.resolutionTick).toBeGreaterThan(0);
  }, 60_000);

  it('a worker agrees with the main thread', async () => {
    // The main thread builds and runs the same raid. If the worker's result
    // differs, it is a pure-function violation — the module graph, the content
    // registry, or the RNG has shared state.
    const built = buildRaid({
      raiderNodes: [...RAID_PARAMS.raiderNodes],
      hostNodes: [...RAID_PARAMS.hostNodes],
      withSoldiers: RAID_PARAMS.withSoldiers,
      seed: RAID_PARAMS.raidSeed,
    });
    const mainOutcome = JSON.stringify(runRaid(built.raid));

    const workerResult = await spawnRaidWorker(RAID_PARAMS);

    expect(
      workerResult.outcomeJson,
      'The worker and main thread disagree. The raid is not a pure function of its inputs.',
    ).toBe(mainOutcome);
  }, 60_000);

  it('would detect a difference: a different seed produces a different outcome', async () => {
    const same = await spawnRaidWorker(RAID_PARAMS);
    const different = await spawnRaidWorker({ ...RAID_PARAMS, raidSeed: 43 });
    expect(same.outcomeJson).not.toBe(different.outcomeJson);
  }, 60_000);
});
