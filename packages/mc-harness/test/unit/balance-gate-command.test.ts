/*
 * Multiverse Mages — the gate and the regeneration command, end to end.
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
 * Task 8.10, in the form that would actually have caught the bug it is about:
 * regenerate a baseline from a real sweep, run the real gate against it, then
 * **delete the baseline and run the same gate again**. The second run must fail.
 *
 * A unit test of `compareToBaseline` cannot make that claim, because a gate
 * whose CLI silently skips a missing file never reaches the comparison at all.
 * That is exactly how a regression gate comes to report green forever, so this
 * file drives the commands rather than the functions, over the toy world and a
 * real `worker_threads` pool.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CliSink, ScenarioModule } from '@mm/mc-harness';
import { GATE_STATUS, gateCommand, parseBaseline, regenerateCommand } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { FIXTURE_PROVENANCE, TOY_REGISTRIES, toySweep, withTempDirectoryAsync } from './fixtures.js';
import { TOY_METRICS } from '../fixtures/toy-world.js';

/** The toy world, dressed as the scenario module a command loads. */
const TOY_SCENARIO: ScenarioModule = {
  executor: () => {
    throw new Error('the inline executor is unused: these commands run on the pool.');
  },
  registries: TOY_REGISTRIES,
  provenance: FIXTURE_PROVENANCE,
  workerUrl: new URL('../fixtures/pool-worker.mjs', import.meta.url),
};

function recordingSink(): CliSink & { readonly lines: string[] } {
  const lines: string[] = [];
  return { lines, out: (line) => lines.push(line), err: (line) => lines.push(line) };
}

/** A small sweep: six cells of two replicates, enough for a within-cell variance. */
const SWEEP = toySweep({ sweepId: 'gate-command-toy', replicates: 2 });

describe('the gate, driven the way CI drives it', () => {
  it('regenerates a baseline, passes against it, and fails once it is deleted', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const sweepPath = join(directory, 'toy.sweep.json');
      const baselinePath = join(directory, 'toy.baseline.json');
      writeFileSync(sweepPath, JSON.stringify(SWEEP), 'utf8');

      const regenerated = recordingSink();
      const regenerateExit = await regenerateCommand(
        {
          sweepPath,
          baselinePath,
          outputDirectory: join(directory, 'regen'),
          workerCount: 2,
          rationale: 'the toy world at its current behaviour, so this suite has a baseline.',
          notes: ['a fixture; it measures a toy world and nothing about the game.'],
          toleranceK: 3,
        },
        TOY_SCENARIO,
        regenerated,
      );
      expect(regenerateExit).toBe(0);
      expect(regenerated.lines.join('\n')).toContain('first baseline');

      const parsedBaseline = parseBaseline(
        await import('node:fs').then((fs) => fs.readFileSync(baselinePath, 'utf8')),
      );
      expect('baseline' in parsedBaseline).toBe(true);

      // The gate against the baseline just written: every metric inside its
      // tolerance, because the sweep is deterministic at a fixed root seed.
      const passing = recordingSink();
      const first = await gateCommand(
        { sweepPath, baselinePath, outputDirectory: join(directory, 'gate-1'), workerCount: 2 },
        TOY_SCENARIO,
        passing,
      );
      expect(first.exitCode).toBe(0);
      expect(first.report.passed).toBe(true);
      expect(first.report.comparisons.length).toBeGreaterThan(0);
      for (const comparison of first.report.comparisons) {
        expect([GATE_STATUS.pass, GATE_STATUS.notGated]).toContain(comparison.status);
      }
      // The mechanic-absent metric is present and explicitly not gated, rather
      // than quietly dropped (task 8.8).
      expect(
        first.report.comparisons.find(
          (comparison) => comparison.metricId === TOY_METRICS.absentMechanic,
        )?.status,
      ).toBe(GATE_STATUS.notGated);

      // Now the failure this whole task group exists for.
      rmSync(baselinePath);
      const deleted = recordingSink();
      const second = await gateCommand(
        { sweepPath, baselinePath, outputDirectory: join(directory, 'gate-2'), workerCount: 2 },
        TOY_SCENARIO,
        deleted,
      );
      expect(second.exitCode).toBe(1);
      expect(second.report.passed).toBe(false);
      expect(deleted.lines.join('\n')).toContain('there is no baseline at');
      expect(deleted.lines.join('\n')).toContain('reports green forever');
      // And it refused before spending the compute, so nobody learns to skip it.
      expect(deleted.lines.some((line) => line.startsWith('Ran '))).toBe(false);
    });
  }, 120_000);

  it('fails when the sweep file it is pointed at is not the one the baseline gates', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const sweepPath = join(directory, 'toy.sweep.json');
      const otherPath = join(directory, 'other.sweep.json');
      const baselinePath = join(directory, 'toy.baseline.json');
      writeFileSync(sweepPath, JSON.stringify(SWEEP), 'utf8');
      // Same sweep id, one changed level: a different experiment under one name.
      writeFileSync(
        otherPath,
        JSON.stringify({ ...SWEEP, factors: [{ id: 'growth', levels: [0, 2, 5] }, ...SWEEP.factors.slice(1)] }),
        'utf8',
      );

      const exit = await regenerateCommand(
        {
          sweepPath,
          baselinePath,
          outputDirectory: join(directory, 'regen'),
          workerCount: 2,
          rationale: 'a baseline for one experiment, about to be offered another.',
          toleranceK: 3,
        },
        TOY_SCENARIO,
        recordingSink(),
      );
      expect(exit).toBe(0);

      const sink = recordingSink();
      const result = await gateCommand(
        {
          sweepPath: otherPath,
          baselinePath,
          outputDirectory: join(directory, 'gate'),
          workerCount: 2,
        },
        TOY_SCENARIO,
        sink,
      );
      expect(result.exitCode).toBe(1);
      expect(sink.lines.join('\n')).toContain('configuration');
    });
  }, 120_000);
});
