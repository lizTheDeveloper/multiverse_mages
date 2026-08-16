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
 * There are now **four** gates — five world years, twenty, twenty again with the
 * whole strategy pool, and two hundred — and every assertion here is made of
 * each of them, because a gate wired into
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
 * The five-year gate, the twenty-year gate, the twenty-year *agency* gate and
 * the two-hundred-year gate. None substitutes for another: the fast one is
 * sensitive and runs on every push; the twenty-year one is the only one that can
 * see a plateau that has not started yet at year five; the agency one is the
 * cheapest that plays a god verb at all, because the two above it run
 * `passive-control` fixed and therefore submit no intervention in any of their
 * 400 runs; and the two-hundred-year one is the only one that can see the win
 * condition — measured, 0 of 400 runs ascended at twenty years and 10 of 80 at
 * two hundred.
 *
 * They do not all run in the same place, and since 2026-08-13 that is the point.
 * See {@link PUSH_GATES} and {@link RELEASE_GATES}.
 */
const GATE_SCRIPTS = [
  'balance:gate',
  'balance:gate:horizon',
  'balance:gate:agency',
  'balance:gate:ascension',
] as const;

/**
 * The gates a commit must clear to merge: `npm run verify`, both CI systems.
 *
 * Three of the four, and they cost about forty seconds together.
 */
// **Empty since 2026-08-14.** The three Monte Carlo gates moved to
// {@link RELEASE_GATES}; nothing is required at merge any more. Kept as a live
// list rather than deleted, because every assertion below is written against it
// and putting a gate back at merge should be one edit here, not a rewrite.
const PUSH_GATES = [] as const;

/**
 * The gates required at release rather than at merge: `npm run verify:full`.
 *
 * Only the two-hundred-year one, and the reason is measured rather than felt.
 * It costs **830 s on a quiet machine and 1154 s on a busy one**, against the
 * other three's ~40 s combined, and `scripts/ci-check.sh` runs on a self-hosted
 * runner that **serialises** against a 2400 s timeout. Holding it in `verify`
 * made every unrelated pull request queue behind the win condition: seven PRs
 * were stacked on that runner the day this split landed, and the fix for the
 * queue was itself in the queue.
 *
 * What it measures is the win condition, and that is the claim
 * `release-plan.md`'s MINOR parity makes — *even = Monte Carlo baselines
 * committed and green* — which is a release-time claim, not a per-commit one.
 *
 * **It still runs on every commit**, in its own parallel GitHub Actions job that
 * is not required to merge. Moving a gate off the blocking path is not the same
 * act as running it less often, and the assertions below exist so that it cannot
 * quietly decay into the same thing.
 */
// **Three joined the two-hundred-year gate on 2026-08-14**, one rung down the
// cost ladder and for the same argument the comment above makes. The
// self-hosted runner serialises against a 2400 s timeout, so a sweep-bearing
// commit queues every other pull request behind it — and during a campaign
// *every* commit is sweep-bearing. `ci.yml`'s `balance` job carries the full
// reasoning and the condition for reversing it.
const RELEASE_GATES = [
  'balance:gate',
  'balance:gate:horizon',
  'balance:gate:agency',
  'balance:gate:ascension',
] as const;

/**
 * Whether a job block actually sets the `continue-on-error` key.
 *
 * The key, anchored at line start — not the bare substring. The two-hundred-year
 * job's comment *explains why it has no* `continue-on-error`, and a substring
 * check reads that explanation as the thing it denies. A test that a comment can
 * flip is a test of prose.
 */
function softensFailures(job: string): boolean {
  return /^\s*continue-on-error\s*:/m.test(job);
}

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

  it.each(PUSH_GATES)(
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

  it.each(PUSH_GATES)('%s runs after the typecheck that builds the dist it loads', (script) => {
    const verify = manifest.scripts['verify'] as string;
    expect(verify.indexOf('npm run typecheck')).toBeLessThan(verify.indexOf(script));
  });

  it.each(RELEASE_GATES)('%s is in verify:full and deliberately not in verify', (script) => {
    // The split, asserted from both sides. Putting it back into `verify` fails
    // here, and so does dropping it out of `verify:full` — which would leave the
    // release checklist naming a command that no longer runs the thing the
    // checklist is about.
    expect(manifest.scripts['verify:full'], 'verify:full is missing').toBeDefined();
    // Reachable from `verify:full` directly, or through `verify:balance` — the
    // grouping the three that moved on 2026-08-14 share. Either satisfies the
    // property; what must not happen is a release gate reachable from neither.
    const full = manifest.scripts['verify:full'] as string;
    const balance = (manifest.scripts['verify:balance'] ?? '') as string;
    expect(
      full.includes(`npm run ${script}`) || balance.includes(`npm run ${script}`),
      `verify:full cannot reach ${script}`,
    ).toBe(true);
    expect(manifest.scripts['verify']).not.toContain(`npm run ${script}`);
  });

  it('verify:full is exactly verify plus the release gates', () => {
    // Derived, not compared to a literal: a step added to `verify` has to reach
    // `verify:full` too, and building it by composition rather than by copying
    // the chain is what makes that automatic.
    // `verify:balance` groups the three that moved, so `verify:full` composes
    // three names rather than five. The property is unchanged: it is `verify`
    // plus everything not required at merge, built by composition so a step
    // added to `verify` reaches `verify:full` automatically.
    expect(manifest.scripts['verify:full']).toBe(
      'npm run verify && npm run verify:balance && npm run balance:gate:ascension',
    );
    // And the three that moved are reachable through it, one level down.
    for (const gate of RELEASE_GATES) {
      const direct = (manifest.scripts['verify:full'] as string).includes(`npm run ${gate}`);
      const viaBalance = (manifest.scripts['verify:balance'] as string).includes(`npm run ${gate}`);
      expect(direct || viaBalance, `verify:full cannot reach ${gate}`).toBe(true);
    }
  });

  it.each(GATE_SCRIPTS)(
    '%s is named explicitly in the Actions workflow, which lists its steps by hand',
    (script) => {
      const workflow = read('.github/workflows/ci.yml');
      // Anchored at the end of the line, so `balance:gate` does not count the
      // `balance:gate:horizon` steps as its own and report a green four.
      const steps = [...workflow.matchAll(new RegExp(`run: npm run ${script}$`, 'gm'))];
      // Push gates: once per full-suite job — the pinned-Node gate and the
      // next-major early warning. Release gates: once, in the parallel job of
      // their own that is not required to merge.
      // The two-hundred-year gate runs once, in its own job. The three that
      // moved on 2026-08-14 run twice: once in the non-blocking `balance` job,
      // and once in `next-node`, which keeps them because an early warning
      // about the next Node major is more useful complete than fast.
      expect(steps).toHaveLength(script === 'balance:gate:ascension' ? 1 : 2);
      expect(workflow).toContain('Balance regression gate');
    },
  );

  it.each(PUSH_GATES)('%s is not silenced by continue-on-error in the blocking job', (script) => {
    const workflow = read('.github/workflows/ci.yml');
    const verifyJob = workflow.slice(
      workflow.indexOf('  verify:'),
      workflow.indexOf('  next-node:'),
    );
    expect(verifyJob).toContain(script);
    expect(softensFailures(verifyJob)).toBe(false);
  });

  it.each(RELEASE_GATES)('%s runs in a job of its own, and is not softened', (script) => {
    const workflow = read('.github/workflows/ci.yml');
    // Two jobs hold release gates now: `balance` for the three that moved on
    // 2026-08-14, `ascension` for the two-hundred-year one. Both are parallel
    // and neither is required to merge; the property asserted is the same.
    const job =
      script === 'balance:gate:ascension'
        ? workflow.slice(workflow.indexOf('  ascension:'), workflow.indexOf('  consumption:'))
        : workflow.slice(workflow.indexOf('  balance:'), workflow.indexOf('  ascension:'));
    expect(job, 'the ascension job is missing from the workflow').not.toBe('');
    expect(job).toContain(`npm run ${script}`);
    // The two non-blocking jobs in this workflow are *expected* red and carry
    // `continue-on-error`. This one is expected green, so a failure has to look
    // like one: it is off the blocking path because of its runtime, not because
    // its result is soft. Non-required is a branch-protection fact, not a
    // workflow one, and softening it here would turn a real regression in the
    // win condition into a green tick.
    expect(softensFailures(job)).toBe(false);
    // It must not need anything the sandbox lacks: Actions is the only CI system
    // here that may safely see a fork pull request, and it holds no credentials.
    expect(job).not.toContain('secrets.');
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
  // `ci-check.sh` skips the four sweeps when every changed path is docs. That
  // is a throughput fix for the single self-hosted runner, not a weakening of
  // the gate — so the two things that make it safe are asserted here rather
  // than trusted to review.

  it('verify:nosweeps is an alias of verify, because verify no longer runs sweeps', () => {
    const verify = manifest.scripts['verify'] as string;
    const nosweeps = manifest.scripts['verify:nosweeps'] as string;
    expect(nosweeps, 'verify:nosweeps is missing').toBeDefined();

    // **It is now an alias, not a second copy of the list.** `verify` stopped
    // running the sweeps on 2026-08-14, so "verify minus the gates" and
    // "verify" became the same command — and two identical script bodies drift
    // the first time someone edits one. The name is kept because `docs/` cites
    // it as a historical measurement in several places.
    expect(nosweeps).toBe('npm run verify');
    for (const gate of GATE_SCRIPTS) {
      expect(verify, `verify runs ${gate}, which moved to release`).not.toContain(
        `npm run ${gate}`,
      );
    }
  });

  it('runs no balance gate, so the skip cannot be a no-op that still sweeps', () => {
    const nosweeps = manifest.scripts['verify:nosweeps'] as string;
    for (const gate of GATE_SCRIPTS) expect(nosweeps).not.toContain(gate);
  });

  it('allowlists documentation paths rather than denylisting code', () => {
    const runner = read('scripts/ci-check.sh');
    // A denylist of code paths would exempt any new top-level directory the day
    // someone adds one. The case arm must therefore name what IS docs.
    expect(runner).toContain('docs/*|openspec/*|.claude/*|ui/*|*.md|LICENSE');
    expect(runner).toContain('docs_only=0; break');
  });

  it.each(['packages/', 'scripts/', 'balance/', '.github/', 'package.json', 'tsconfig'])(
    'never exempts %s from the sweeps',
    (path) => {
      // Pinning the arm's exact text catches a widening, but only if someone
      // reads the diff. These assert the property the arm exists to have, so a
      // future edit that adds a genuinely dangerous path fails by name rather
      // than by string mismatch. `ui/` is on the list because it is in no
      // tsconfig, no eslint glob and no vitest include — but `ui-theme.test.ts`
      // still reads it, and the tests are not what gets skipped.
      const arm = /^\s*docs\/\*\|.*\)\s*;;/m.exec(read('scripts/ci-check.sh'))?.[0] ?? '';
      expect(arm, 'the allowlist arm was not found — has it been rewritten?').not.toBe('');
      expect(arm, `${path} must never be sweep-exempt`).not.toContain(path);
    },
  );

  it('fails closed: docs_only starts at 0 and is only ever raised inside a successful diff', () => {
    const runner = read('scripts/ci-check.sh');
    expect(runner).toContain('docs_only=0\nbase=');
    // No merge base, a shallow clone or a git error must all leave it at 0.
    expect(runner).toContain('if git rev-parse --verify --quiet "$base"');
    expect(runner).toContain('if changed="$(git diff --name-only "$base"...HEAD 2>/dev/null)"');
  });

  it('runs one verify on every path, because there is no longer a sweep to skip', () => {
    const runner = read('scripts/ci-check.sh');
    // The docs-only branch used to choose between `verify:nosweeps` and
    // `verify`. Since 2026-08-14 `verify` runs no sweeps at all, so both arms
    // would be the same command and the runner just runs it. The detection is
    // kept — it prints the reason into the log and keeps a live allowlist for
    // the day the sweeps come back — but it no longer selects a command.
    expect(runner).toContain('npm run verify\n');
    expect(runner).not.toContain('npm run verify:nosweeps');
    // And the runner still names no gate of its own, so the two CI systems
    // cannot disagree about what a merge requires.
    for (const gate of GATE_SCRIPTS) expect(runner).not.toContain(gate);
  });
});
