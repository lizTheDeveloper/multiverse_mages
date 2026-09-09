/*
 * Multiverse Mages — single-run reproduction, task 4.6.
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

import { isMainThread } from 'node:worker_threads';

import type { CliSink, RunRecord, ScenarioModule } from '@mm/mc-harness';
import { compareToRecord, reproduceCommand, reproduceRun, runSweep, taskFor } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_PROVENANCE,
  POOL_WORKER_URL,
  TOY_FIXED_POOL,
  TOY_REGISTRIES,
  toySweep,
  withTempDirectoryAsync,
} from './fixtures.js';
import { makeToyExecutor } from '../fixtures/toy-world.js';

const spec = toySweep({ replicates: 5, failureThreshold: 2, agentPool: TOY_FIXED_POOL });

function scenario(overrides: Partial<ScenarioModule> = {}): ScenarioModule {
  return {
    executor: makeToyExecutor(),
    registries: TOY_REGISTRIES,
    provenance: FIXTURE_PROVENANCE,
    ...overrides,
  };
}

function sink(): { out: string[]; err: string[]; sink: CliSink } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, sink: { out: (line) => out.push(line), err: (line) => err.push(line) } };
}

describe('a recorded run is reproducible in isolation', () => {
  it('re-derives the same seed and task from the four coordinates alone', () => {
    const task = taskFor(spec, TOY_REGISTRIES, { cellIndex: 4, replicateIndex: 2 });
    expect(task.coordinates).toEqual({
      rootSeed: spec.rootSeed,
      sweepId: spec.sweepId,
      cellIndex: 4,
      replicateIndex: 2,
    });
    // The levels come from the shared factorial expansion, not from a second
    // opinion about which levels cell 4 names.
    expect(Object.keys(task.levels).sort()).toEqual(['ascendAt', 'growth']);
  });

  it('refuses coordinates the sweep does not contain', () => {
    expect(() => taskFor(spec, TOY_REGISTRIES, { cellIndex: 99, replicateIndex: 0 })).toThrow(/cells/);
    expect(() => taskFor(spec, TOY_REGISTRIES, { cellIndex: 0, replicateIndex: 99 })).toThrow(
      /replicates/,
    );
  });

  it('reproduces a run from a worker sweep exactly, on the main thread', async () => {
    const swept = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 4, workerData: { jitterMs: 4 } },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });

    for (const select of [
      { cellIndex: 0, replicateIndex: 0 },
      { cellIndex: 3, replicateIndex: 4 },
      { cellIndex: 5, replicateIndex: 1 },
    ]) {
      const { record } = await reproduceRun({
        spec,
        registries: TOY_REGISTRIES,
        select,
        execute: makeToyExecutor(),
        provenance: FIXTURE_PROVENANCE,
      });
      // Single-threaded by construction: this assertion is the claim.
      expect(isMainThread).toBe(true);
      const stored = swept.records.find(
        (candidate) =>
          candidate.coordinates.cellIndex === select.cellIndex &&
          candidate.coordinates.replicateIndex === select.replicateIndex,
      );
      expect(stored).toBeDefined();
      expect(compareToRecord(record, stored as RunRecord)).toEqual([]);
    }
  }, 60_000);

  it('reproduces a failed run as the same failure', async () => {
    const throwOn = [{ cellIndex: 2, replicateIndex: 3 }];
    const swept = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor({ throwOn }) },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });
    const stored = swept.records.find(
      (record) => record.coordinates.cellIndex === 2 && record.coordinates.replicateIndex === 3,
    );
    expect(stored?.status).toBe('failed');

    const { record } = await reproduceRun({
      spec,
      registries: TOY_REGISTRIES,
      select: { cellIndex: 2, replicateIndex: 3 },
      execute: makeToyExecutor({ throwOn }),
      provenance: FIXTURE_PROVENANCE,
    });
    expect(record.status).toBe('failed');
    expect(record.failure?.classification).toBe('threw');
    expect(record.failure?.message).toContain('toy executor refused cell 2 replicate 3');
  });
});

describe('the comparison reports what differed, field by field', () => {
  it('names the fields rather than saying only that the records differ', async () => {
    const swept = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor() },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });
    const stored = swept.records[0] as RunRecord;
    const tampered: RunRecord = { ...stored, ticksRun: 9999 };
    const differences = compareToRecord(stored, tampered);
    expect(differences.some((line) => line.startsWith('ticksRun:'))).toBe(true);
    expect(differences.some((line) => line.startsWith('status:'))).toBe(false);
  });

  it('notices a stored record whose seed was hand-edited', async () => {
    const swept = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor() },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });
    const stored = swept.records[0] as RunRecord;
    const edited: RunRecord = { ...stored, runSeed: 1 };
    const differences = compareToRecord(stored, edited);
    expect(differences.some((line) => line.includes('is not what its own coordinates derive'))).toBe(
      true,
    );
  });
});

describe('the reproduction command', () => {
  it('reports the reproduction and, given a results file, that it is identical', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const swept = await runSweep({
        spec,
        registries: TOY_REGISTRIES,
        execution: { mode: 'inline', execute: makeToyExecutor() },
        provenance: FIXTURE_PROVENANCE,
        output: { directory, mode: 'refuse' },
        now: () => 0,
      });

      const collected = sink();
      const code = await reproduceCommand(
        {
          spec,
          cellIndex: 1,
          replicateIndex: 2,
          comparePath: swept.runsPath as string,
        },
        scenario(),
        collected.sink,
      );
      expect(code).toBe(0);
      expect(collected.out.join('\n')).toContain('identical to the stored record');
      expect(collected.err).toEqual([]);
    });
  });

  it('exits non-zero when the stored record is not there, or does not match', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const swept = await runSweep({
        spec,
        registries: TOY_REGISTRIES,
        execution: { mode: 'inline', execute: makeToyExecutor() },
        provenance: FIXTURE_PROVENANCE,
        output: { directory, mode: 'refuse' },
        now: () => 0,
      });

      const missing = sink();
      expect(
        await reproduceCommand(
          { spec, cellIndex: 99, replicateIndex: 0, comparePath: swept.runsPath as string },
          scenario(),
          missing.sink,
        ),
      ).toBe(1);

      // A scenario whose executor answers differently must be reported as a
      // difference, not passed over.
      const drifted = sink();
      const code = await reproduceCommand(
        { spec, cellIndex: 1, replicateIndex: 2, comparePath: swept.runsPath as string },
        scenario({
          executor: async (task) => {
            const outcome = await makeToyExecutor()(task);
            return { ...outcome, ticksRun: outcome.ticksRun + 1 };
          },
        }),
        drifted.sink,
      );
      expect(code).toBe(1);
      expect(drifted.err.join('\n')).toContain('ticksRun');
    });
  });
});
