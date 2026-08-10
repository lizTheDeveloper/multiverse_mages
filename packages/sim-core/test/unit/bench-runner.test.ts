/*
 * Multiverse Mages — proof that the benchmark runner emits a usable report.
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
 * Task 10.5 — `scripts/bench.mjs` produces one parseable JSON object on stdout
 * and exits zero.
 *
 * `benchmark.test.ts` covers the workload; nothing covered the runner. The two
 * are split precisely so the runner can do what the workload may not — read a
 * clock, divide floats, import Node built-ins — which means the runner is the
 * half that no purity lint protects and no unit test imported. Its contract is
 * a machine-readable one: `npm run bench --silent | jq .stepsPerSecond` is a
 * documented usage, and it breaks the moment anything advisory lands on stdout
 * or a throughput field comes back `Infinity` from a zero-length measurement.
 *
 * The runner is exercised as a subprocess because its contract *is* the process
 * boundary — stdout, stderr, exit code. Importing it would test none of that,
 * and could not test it, since the module runs its work on import and calls
 * `process.exit`.
 *
 * The configuration is deliberately tiny (a few hundred entities over a handful
 * of ticks). This runs on every `npm test`; it is checking the shape of the
 * report, not the speed of the machine, and it asserts nothing about the
 * magnitude of a timing number — that would be flaky on loaded CI.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { beforeAll, describe, expect, it } from 'vitest';

/** From packages/sim-core/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const benchScript = fileURLToPath(new URL('../../../../scripts/bench.mjs', import.meta.url));
const tscBin = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
const benchProject = 'packages/sim-core/bench/tsconfig.run.json';

/**
 * Small enough to finish in milliseconds, large enough that the measured span
 * is non-zero and the churn path is exercised. `--warmup 2` keeps the runner's
 * own determinism check on: it re-runs the config and refuses to publish a
 * number if two identical runs disagree, and a benchmark test that skipped that
 * check would be skipping the most valuable thing the runner does.
 */
const SMALL_RUN = ['--entities', '200', '--ticks', '5', '--warmup', '2'];

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(command: string, args: readonly string[]): Run {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * `npm run bench` compiles before it runs, so the test does too.
 *
 * The runner imports emitted JavaScript from `.tsbuild/`, which is gitignored
 * and absent on a fresh clone — without this the test would pass on a developer
 * machine that had run the benchmark once and fail in CI. The compile is
 * incremental and unconditional: cheap when the tree is warm, correct when it
 * is cold, and never stale, which a "build only if missing" guard would be
 * after any edit to the workload.
 */
beforeAll(() => {
  const build = run(process.execPath, [tscBin, '-p', benchProject]);
  if (build.status !== 0) {
    throw new Error(
      `Failed to build the benchmark workload (exit ${String(build.status)}):\n` +
        `${build.stdout}\n${build.stderr}`,
    );
  }
}, 180_000);

describe('the benchmark runner', () => {
  it('exits zero and prints exactly one JSON object on stdout', () => {
    const result = run(process.execPath, [benchScript, ...SMALL_RUN]);

    expect(result.status).toBe(0);

    // "Exactly one object" is the actual contract, and the cheap way to get it
    // wrong is a stray console.log that a first-line-only parse would not
    // notice. Parse the whole of stdout, and require it to be a single line.
    const stdout = result.stdout.trim();
    expect(stdout).not.toBe('');
    expect(stdout.includes('\n')).toBe(false);

    const report: unknown = JSON.parse(stdout);
    expect(typeof report).toBe('object');
    expect(report).not.toBeNull();
    expect(Array.isArray(report)).toBe(false);
  });

  it('reports finite, positive throughput numbers', () => {
    const result = run(process.execPath, [benchScript, ...SMALL_RUN]);
    expect(result.status).toBe(0);

    const report = JSON.parse(result.stdout.trim()) as Record<string, unknown>;

    for (const field of ['stepsPerSecond', 'entityUpdatesPerSecond']) {
      const value = report[field];
      expect(typeof value).toBe('number');
      // Infinity is the realistic failure, not NaN: it is what a division by a
      // zero-length measurement produces, it serialises to `null` in JSON, and
      // it would sail through a `> 0` check written on its own.
      expect(Number.isFinite(value as number)).toBe(true);
      expect(value as number).toBeGreaterThan(0);
    }
  });

  it('echoes back the configuration it was asked for', () => {
    // A throughput number is only meaningful attached to the config that
    // produced it. If the runner ignored its flags, the numbers above would
    // still be finite and positive and would still describe the wrong run.
    const result = run(process.execPath, [benchScript, ...SMALL_RUN]);
    const report = JSON.parse(result.stdout.trim()) as Record<string, unknown>;

    expect(report['entityCount']).toBe(200);
    expect(report['ticks']).toBe(5);
    expect(report['warmupTicks']).toBe(2);
    expect(report['finalWorldTick']).toBe(5);
    expect(report['elapsedSeconds']).toBeGreaterThan(0);
    expect(report['finalSnapshotHash']).toMatch(/^[0-9a-f]{16}$/);
  });

  it('keeps advisory output off stdout, so a consumer can read stdout blind', () => {
    const result = run(process.execPath, [benchScript, ...SMALL_RUN, '--seed', '7']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim().includes('\n')).toBe(false);
    expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
  });

  it('exits non-zero on an argument it cannot honour, rather than measuring the wrong run', () => {
    // The control for the exit-code assertions above: they would all pass just
    // as well against a runner that could only ever exit zero.
    const bad = run(process.execPath, [benchScript, '--ticks', 'lots']);

    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).toContain('--ticks');
  });
});
