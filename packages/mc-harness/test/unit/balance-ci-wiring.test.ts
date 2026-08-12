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
 *
 * There are now **three** gates — five world years, twenty, and two hundred —
 * and every assertion here is made of each of them, because a gate wired into
 * only one of the two CI systems is the same drift as the first one would have
 * been. Why each exists at all is in
 * `packages/scenario/test/unit/horizon-gate.test.ts`, with the measurements.
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

/**
 * The npm scripts both CI systems reach the gates through.
 *
 * The five-year gate, the twenty-year gate and the two-hundred-year gate. None
 * substitutes for another: the fast one is sensitive and runs on every push, the
 * twenty-year one is the only one that can see a plateau that has not started
 * yet at year five, and the two-hundred-year one is the only one that can see
 * the win condition at all — measured, 0 of 400 runs ascended at twenty years
 * and 10 of 80 at two hundred.
 */
const GATE_SCRIPTS = ['balance:gate', 'balance:gate:horizon', 'balance:gate:ascension'] as const;

describe('every gate is a build-failing step in both CI systems', () => {
  it.each(GATE_SCRIPTS)('%s exists as an npm script', (script) => {
    expect(manifest.scripts[script]).toBeDefined();
    expect(manifest.scripts[script]).toContain('balance-gate.mjs');
  });

  // A gate that measures whatever was last built measures nothing. The workers
  // load `packages/scenario/bin/scenario.mjs`, which imports from `dist/`, so a
  // gate run against a source tree nobody has compiled reports the *previous*
  // build's numbers and passes — silently, and with a plausible figure.
  //
  // This is not hypothetical. Running the gate by hand against an unbuilt tree
  // reported a delta of exactly 0.00000 on all nine metrics across a change
  // that moved `referenceNodesKnown` by 7.455 (77.81 standard errors), and the
  // reading survived a check of `dist/` that was made *after* a rebuild. Inside
  // `verify` the chain happens to typecheck first, which is what kept this
  // invisible; standalone there was nothing.
  //
  // `tsc --build` is incremental, so the guarantee costs nothing on a tree that
  // is already current — including the second time, inside `verify`.
  it.each(GATE_SCRIPTS)('%s compiles the tree before it measures it', (script) => {
    const hook = manifest.scripts[`pre${script}`];
    expect(hook, `pre${script} is missing: the gate can measure a stale dist/`).toBeDefined();
    expect(hook).toContain('typecheck');
  });

  it.each(GATE_SCRIPTS)(
    '%s is part of npm run verify, which is what the self-hosted runner runs',
    (script) => {
      expect(manifest.scripts['verify']).toContain(`npm run ${script}`);

      const runner = read('scripts/ci-check.sh');
      expect(runner).toContain('npm run verify');
      // The runner must stay equivalent to `verify` rather than growing a step
      // of its own; a gate invoked twice would double a minute of CI for
      // nothing.
      expect(runner).not.toContain(script);
    },
  );

  it.each(GATE_SCRIPTS)('%s runs after the typecheck that builds the dist it loads', (script) => {
    const verify = manifest.scripts['verify'] as string;
    expect(verify.indexOf('npm run typecheck')).toBeLessThan(verify.indexOf(script));
  });

  it.each(GATE_SCRIPTS)(
    '%s is named explicitly in the Actions workflow, which lists its steps by hand',
    (script) => {
      const workflow = read('.github/workflows/ci.yml');
      // Anchored at the end of the line, so `balance:gate` does not count the
      // `balance:gate:horizon` steps as its own and report a green four.
      const steps = [...workflow.matchAll(new RegExp(`run: npm run ${script}$`, 'gm'))];
      // Once per job: the pinned-Node gate and the next-major early warning.
      expect(steps).toHaveLength(2);
      expect(workflow).toContain('Balance regression gate');
    },
  );

  it.each(GATE_SCRIPTS)('%s is not silenced by continue-on-error in the blocking job', (script) => {
    const workflow = read('.github/workflows/ci.yml');
    const verifyJob = workflow.slice(
      workflow.indexOf('  verify:'),
      workflow.indexOf('  next-node:'),
    );
    expect(verifyJob).toContain(script);
    expect(verifyJob).not.toContain('continue-on-error');
  });
});

describe('the artifacts the wiring names are the artifacts that exist', () => {
  /** The `--flag value` pairs of one gate script. */
  const flagsOf = (script: string): Record<string, string> =>
    Object.fromEntries(
      [...(manifest.scripts[script] as string).matchAll(/--(\w+)\s+(\S+)/g)].map((match) => [
        match[1] as string,
        match[2] as string,
      ]),
    );

  const cases = GATE_SCRIPTS.flatMap((script) =>
    ['scenario', 'sweep', 'baseline'].map((flag) => [script, flag] as const),
  );

  it.each(cases)('%s names a %s that is on disk', (script, flag) => {
    const path = flagsOf(script)[flag];
    expect(path, `${script} passes no --${flag}`).toBeDefined();
    expect(existsSync(join(repoRoot, path as string)), `${path as string} does not exist`).toBe(
      true,
    );
  });

  it.each(GATE_SCRIPTS)('%s gates a sweep declared as a gate sweep, not the full one', (script) => {
    const flags = flagsOf(script);
    const sweep = JSON.parse(read((flags['sweep'] as string).replace(/^\.\//, ''))) as {
      kind: string;
      sweepId: string;
    };
    expect(sweep.kind).toBe('gate');
    expect(flags['baseline'] as string).toContain(sweep.sweepId);
  });

  it.each(GATE_SCRIPTS)('%s carries a committed baseline valid on its own terms', (script) => {
    const parsed = parseBaseline(read((flagsOf(script)['baseline'] as string).replace(/^\.\//, '')));
    expect('problems' in parsed ? parsed.problems : []).toEqual([]);
  });

  it.each(GATE_SCRIPTS)(
    '%s states in its baseline that it is a measurement and not a balance claim',
    (script) => {
      const parsed = parseBaseline(
        read((flagsOf(script)['baseline'] as string).replace(/^\.\//, '')),
      );
      if ('problems' in parsed) throw new Error(parsed.problems.join('; '));
      const prose = [parsed.baseline.rationale, ...parsed.baseline.notes].join('\n');
      // `release-plan.md` forbids a balance claim before 0.5.0, and a baseline
      // committed under that rule has to say so in the file rather than in a
      // commit message nobody will read beside it.
      expect(prose).toContain('0.5.0');
      expect(prose).toContain('degenerate');
    },
  );

  it('gates two different sweeps, so neither baseline could satisfy the other', () => {
    const ids = GATE_SCRIPTS.map((script) => flagsOf(script)['sweep']);
    expect(new Set(ids).size).toBe(GATE_SCRIPTS.length);
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

  it('has no committed baseline, because it is not a gate', () => {
    // It has been run — task 10.1, 10,000 runs in 3392 s, recorded in
    // `balance/README.md`. It still has no baseline, and now for a different
    // reason than "nobody has executed it": a baseline exists to be compared
    // against on every push, this sweep runs once per release, and a tolerance
    // derived from 10,000 runs would be far tighter than any gate sweep could
    // clear. Committing one would create a gate nothing runs.
    expect(existsSync(join(repoRoot, `balance/baselines/${full.sweepId}.baseline.json`))).toBe(
      false,
    );
  });

  it('has its measured throughput recorded, rather than an extrapolation', () => {
    // The 0.5.0 release claim is that ten thousand runs complete within a
    // recorded budget. A budget nobody wrote down is not one, and an
    // extrapolation presented as a measurement is worse than neither.
    const readme = read('balance/README.md');
    expect(readme).toContain('3392 s');
    expect(readme).toContain('708 world ticks/s');
    // And the caveat that makes the figure usable: it is four workers, not the
    // eight the release plan names.
    expect(readme).toContain('Four workers, not eight');
  });
});

describe('the docs-only sweep skip cannot silently exempt code', () => {
  // `ci-check.sh` skips the three sweeps when every changed path is docs. That
  // is a throughput fix for the single self-hosted runner, not a weakening of
  // the gate — so the two things that make it safe are asserted here rather
  // than trusted to review.

  it('verify:nosweeps is exactly verify minus the three balance gates', () => {
    const verify = manifest.scripts['verify'] as string;
    const nosweeps = manifest.scripts['verify:nosweeps'] as string;
    expect(nosweeps, 'verify:nosweeps is missing').toBeDefined();

    // Derive rather than compare to a literal: a new step added to `verify`
    // must appear in `verify:nosweeps` too, and this fails until it does.
    const derived = verify
      .split(' && ')
      .filter((step) => !GATE_SCRIPTS.some((gate) => step === `npm run ${gate}`))
      .join(' && ');
    expect(nosweeps).toBe(derived);
  });

  it('runs no balance gate, so the skip cannot be a no-op that still sweeps', () => {
    const nosweeps = manifest.scripts['verify:nosweeps'] as string;
    for (const gate of GATE_SCRIPTS) expect(nosweeps).not.toContain(gate);
  });

  it('allowlists documentation paths rather than denylisting code', () => {
    const runner = read('scripts/ci-check.sh');
    // A denylist of code paths would exempt any new top-level directory the day
    // someone adds one. The case arm must therefore name what IS docs.
    expect(runner).toContain('docs/*|openspec/*|.claude/*|*.md|LICENSE');
    expect(runner).toContain('docs_only=0; break');
  });

  it('fails closed: docs_only starts at 0 and is only ever raised inside a successful diff', () => {
    const runner = read('scripts/ci-check.sh');
    expect(runner).toContain('docs_only=0\nbase=');
    // No merge base, a shallow clone or a git error must all leave it at 0.
    expect(runner).toContain('if git rev-parse --verify --quiet "$base"');
    expect(runner).toContain('if changed="$(git diff --name-only "$base"...HEAD 2>/dev/null)"');
  });

  it('still runs the full verify when anything outside docs changed', () => {
    const runner = read('scripts/ci-check.sh');
    expect(runner).toContain('npm run verify:nosweeps');
    expect(runner).toContain('npm run verify\n');
  });
});
