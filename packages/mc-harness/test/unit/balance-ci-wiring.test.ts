/*
 * Multiverse Mages — the gate is wired into both CI systems, and the committed
 * artifacts it gates on exist.
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
 * Task 8.9, and the half of task 8.10 that a unit test of the comparison cannot
 * reach.
 *
 * `compareToBaseline` failing on a missing baseline is worth nothing if CI never
 * calls it, and CLAUDE.md is explicit that this repository has **two** CI
 * systems which cannot do each other's job. The self-hosted runner executes
 * `scripts/ci-check.sh`, which runs `npm run verify` and nothing else, so adding
 * the gate to `verify` wires it there. GitHub Actions lists its steps by hand,
 * so the same gate has to be named in the workflow explicitly — and if it is
 * added to only one of the two, a commit can pass on one gate and fail on the
 * other, which is exactly the drift `ci-and-deploy.md` warns about.
 *
 * So this file asserts the wiring in both places, and asserts that the paths the
 * wiring names are paths that exist. A gate script pointed at a sweep file
 * somebody renamed fails for a reason that has nothing to do with balance, and
 * whoever sees it first will be tempted to delete the step.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBaseline } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function read(relative: string): string {
  return readFileSync(join(repoRoot, relative), 'utf8');
}

const manifest = JSON.parse(read('package.json')) as {
  readonly scripts: Record<string, string>;
};

/** The npm script both CI systems reach the gate through. */
const GATE_SCRIPT = 'balance:gate';

describe('the gate is a build-failing step in both CI systems', () => {
  it('exists as an npm script', () => {
    expect(manifest.scripts[GATE_SCRIPT]).toBeDefined();
    expect(manifest.scripts[GATE_SCRIPT]).toContain('balance-gate.mjs');
  });

  it('is part of npm run verify, which is what the self-hosted runner runs', () => {
    expect(manifest.scripts['verify']).toContain(`npm run ${GATE_SCRIPT}`);

    const runner = read('scripts/ci-check.sh');
    expect(runner).toContain('npm run verify');
    // The runner must stay equivalent to `verify` rather than growing a step of
    // its own; a gate invoked twice would double a minute of CI for nothing.
    expect(runner).not.toContain(GATE_SCRIPT);
  });

  it('runs after the typecheck that builds the dist the gate loads', () => {
    const verify = manifest.scripts['verify'] as string;
    expect(verify.indexOf('npm run typecheck')).toBeLessThan(verify.indexOf(GATE_SCRIPT));
  });

  it('is named explicitly in the Actions workflow, which lists its steps by hand', () => {
    const workflow = read('.github/workflows/ci.yml');
    const steps = [...workflow.matchAll(new RegExp(`run: npm run ${GATE_SCRIPT}`, 'g'))];
    // Once per job: the pinned-Node gate and the next-major early warning.
    expect(steps).toHaveLength(2);
    expect(workflow).toContain('Balance regression gate');
  });

  it('is not silenced by continue-on-error in the blocking job', () => {
    const workflow = read('.github/workflows/ci.yml');
    const verifyJob = workflow.slice(
      workflow.indexOf('  verify:'),
      workflow.indexOf('  next-node:'),
    );
    expect(verifyJob).toContain(GATE_SCRIPT);
    expect(verifyJob).not.toContain('continue-on-error');
  });
});

describe('the artifacts the wiring names are the artifacts that exist', () => {
  /** The `--flag value` pairs of the gate script. */
  const flags = Object.fromEntries(
    [...(manifest.scripts[GATE_SCRIPT] as string).matchAll(/--(\w+)\s+(\S+)/g)].map((match) => [
      match[1] as string,
      match[2] as string,
    ]),
  );

  it.each(['scenario', 'sweep', 'baseline'])('names a %s that is on disk', (flag) => {
    const path = flags[flag];
    expect(path, `the gate script passes no --${flag}`).toBeDefined();
    expect(existsSync(join(repoRoot, path as string)), `${path as string} does not exist`).toBe(
      true,
    );
  });

  it('gates the sweep declared as the gate sweep, not the full one', () => {
    const sweep = JSON.parse(read((flags['sweep'] as string).replace(/^\.\//, ''))) as {
      kind: string;
      sweepId: string;
    };
    expect(sweep.kind).toBe('gate');
    expect(flags['baseline'] as string).toContain(sweep.sweepId);
  });

  it('carries a committed baseline that is valid on its own terms', () => {
    const parsed = parseBaseline(read((flags['baseline'] as string).replace(/^\.\//, '')));
    expect('problems' in parsed ? parsed.problems : []).toEqual([]);
  });

  it('states in the baseline that it is a measurement and not a balance claim', () => {
    const parsed = parseBaseline(read((flags['baseline'] as string).replace(/^\.\//, '')));
    if ('problems' in parsed) throw new Error(parsed.problems.join('; '));
    const prose = [parsed.baseline.rationale, ...parsed.baseline.notes].join('\n');
    // `release-plan.md` forbids a balance claim before 0.5.0, and a baseline
    // committed under that rule has to say so in the file rather than in a
    // commit message nobody will read beside it.
    expect(prose).toContain('0.5.0');
    expect(prose).toContain('degenerate');
  });
});

describe('the full sweep is committed beside the gate sweep, and is a different experiment', () => {
  const gate = JSON.parse(read('balance/sweeps/balance-gate.sweep.json')) as {
    sweepId: string;
    kind: string;
    replicates: number;
    factors: readonly { levels: readonly unknown[] }[];
  };
  const full = JSON.parse(read('balance/sweeps/balance-full.sweep.json')) as typeof gate;

  const runs = (spec: typeof gate) =>
    spec.factors.reduce((count, factor) => count * factor.levels.length, 1) * spec.replicates;

  it('declares distinct ids and kinds', () => {
    expect(gate.kind).toBe('gate');
    expect(full.kind).toBe('full');
    expect(full.sweepId).not.toBe(gate.sweepId);
  });

  it('is the larger instrument, by a lot', () => {
    expect(runs(gate)).toBeLessThan(500);
    expect(runs(full)).toBe(10_000);
  });

  it('has no committed baseline, because it has never been run', () => {
    // Task 10.1 owns running it. Committing a baseline for a sweep nobody has
    // executed would be committing numbers nobody produced, which is the one
    // thing a baseline may never be.
    expect(existsSync(join(repoRoot, `balance/baselines/${full.sweepId}.baseline.json`))).toBe(
      false,
    );
  });
});
