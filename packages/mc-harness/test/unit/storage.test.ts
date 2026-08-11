/*
 * Multiverse Mages — append-only result storage, task 4.7.
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

import { readFileSync } from 'node:fs';

import { openSweepOutput, readRunRecords, runSweep } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_PROVENANCE,
  TOY_REGISTRIES,
  syntheticRecord,
  toySweep,
  withTempDirectory,
  withTempDirectoryAsync,
} from './fixtures.js';
import { makeToyExecutor } from '../fixtures/toy-world.js';

function record(replicateIndex: number) {
  return syntheticRecord({
    cellIndex: 0,
    replicateIndex,
    metrics: { toyTicks: { status: 'measured', value: replicateIndex } },
  });
}

describe('records are never rewritten', () => {
  it('takes a new file when the sweep is re-executed into the same directory', () => {
    withTempDirectory((directory) => {
      const first = openSweepOutput({ directory, sweepId: 'toy-sweep', mode: 'new-file' });
      first.appendRecord(record(0));
      first.close();

      const second = openSweepOutput({ directory, sweepId: 'toy-sweep', mode: 'new-file' });
      second.appendRecord(record(1));
      second.close();

      expect(first.executionIndex).toBe(0);
      expect(second.executionIndex).toBe(1);
      expect(first.runsPath).not.toBe(second.runsPath);
      // The first execution's file is untouched.
      expect(readRunRecords(first.runsPath)).toHaveLength(1);
      expect(readRunRecords(first.runsPath)[0]?.coordinates.replicateIndex).toBe(0);
    });
  });

  it('exits non-zero — by refusing — when told not to write a second file', () => {
    withTempDirectory((directory) => {
      const first = openSweepOutput({ directory, sweepId: 'toy-sweep', mode: 'refuse' });
      first.appendRecord(record(0));
      first.close();

      expect(() => openSweepOutput({ directory, sweepId: 'toy-sweep', mode: 'refuse' })).toThrow(
        /append-only/,
      );
      // And the first file is still exactly what it was.
      expect(readRunRecords(first.runsPath)).toHaveLength(1);
    });
  });

  it('does not confuse one sweep id with another in the same directory', () => {
    withTempDirectory((directory) => {
      openSweepOutput({ directory, sweepId: 'gate', mode: 'refuse' }).close();
      // A different sweep is a different experiment and has its own numbering.
      const other = openSweepOutput({ directory, sweepId: 'full', mode: 'refuse' });
      expect(other.executionIndex).toBe(0);
      other.close();
    });
  });

  it('appends rather than truncating as records arrive', () => {
    withTempDirectory((directory) => {
      const output = openSweepOutput({ directory, sweepId: 'toy-sweep', mode: 'refuse' });
      for (let index = 0; index < 5; index += 1) output.appendRecord(record(index));
      output.close();
      const lines = readFileSync(output.runsPath, 'utf8').trimEnd().split('\n');
      expect(lines).toHaveLength(5);
      expect(readRunRecords(output.runsPath).map((r) => r.coordinates.replicateIndex)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    });
  });

  it('refuses to append after close, rather than silently reopening', () => {
    withTempDirectory((directory) => {
      const output = openSweepOutput({ directory, sweepId: 'toy-sweep', mode: 'refuse' });
      output.close();
      expect(() => output.appendRecord(record(0))).toThrow(/closed/);
    });
  });
});

describe('a sweep writes its records and its summary', () => {
  it('writes one record per run plus one summary, and reads them back identically', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const spec = toySweep({ replicates: 3 });
      const result = await runSweep({
        spec,
        registries: TOY_REGISTRIES,
        execution: { mode: 'inline', execute: makeToyExecutor() },
        provenance: FIXTURE_PROVENANCE,
        output: { directory, mode: 'refuse' },
        now: () => 0,
      });

      const stored = readRunRecords(result.runsPath as string);
      expect(stored).toHaveLength(result.plan.runCount);
      expect(stored).toEqual(result.records);

      const summary = JSON.parse(readFileSync(result.summaryPath as string, 'utf8')) as {
        runCount: number;
        sweepId: string;
      };
      expect(summary.runCount).toBe(result.plan.runCount);
      expect(summary.sweepId).toBe(spec.sweepId);
    });
  });
});
