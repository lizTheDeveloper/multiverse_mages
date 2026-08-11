/*
 * Multiverse Mages — why there are two balance gates, and what breaks if there
 * is one again.
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
 * **The twenty-year horizon is not a round number somebody liked. Read this
 * before shortening it.**
 *
 * The obvious optimization here is to notice that `balance:gate:horizon` costs
 * thirty-five seconds against the fast gate's eight, decide that two gates over
 * the same four cells is redundant, and lower the tick cap or delete the sweep.
 * This file exists to make that a build failure with the reason attached, in
 * the way `CLAUDE.md` makes `npm run goldens:regen` a deliberate act.
 *
 * ## The measurement
 *
 * All figures below are means over 200 runs — four cells, fifty replicates —
 * taken on 2026-08-11, comparing this build against `512ef00^`, the last commit
 * before `researchFrontier` stopped being a prefix window over interned node
 * ids. That defect made roughly a third of v1 content unreachable, an entire
 * technique among it, and it is the most consequential defect this project has
 * found.
 *
 * ```text
 *  horizon   referenceNodesKnown        referenceNodesGainedFinalQuarter
 *            pre-fix   post-fix          pre-fix   post-fix
 *   60 (5y)   25.30     32.93             6.57      8.63
 *  120 (10y)  31.39     43.97             1.77      5.07
 *  240 (20y)  31.94     48.35             0.18      0.66
 * ```
 *
 * The blind spot is the diagonal. **The broken build's permanent ceiling —
 * 31.94 nodes, flat from world-year ten onward — is the same number as the
 * healthy build's five-year level, 32.93.** A five-year gate
 * therefore cannot distinguish a universe that is still learning from one that
 * has stopped, for any defect that caps discovery at or above roughly 33 nodes.
 * It would report such a build as within tolerance of a baseline that was itself
 * taken at year five, and it would keep reporting it for as long as the defect
 * lived.
 *
 * At twenty years the same comparison is 48.35 against 31.94, with a standard
 * error of 0.079 and a tolerance of 0.238 — a sixteen-node gap against a
 * quarter-node tolerance. The horizon is doing the work, not the sample size.
 *
 * ## Why the fast gate is not simply lengthened
 *
 * Its value is sensitivity per second. Two hundred runs give
 * `referenceNodesKnown` a standard error of 0.096 at five years, and it runs on
 * every push. Buying the long horizon out of the same budget would mean about
 * forty-eight runs, which widens every tolerance by roughly a factor of two and
 * stops subtle drift being detectable at all. That trades one blind spot for
 * another. So the two gates are two instruments, and the tests below assert that
 * neither has quietly become the other.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SweepSpec } from '@mm/mc-harness';
import { expandSweep, loadBaseline } from '@mm/mc-harness';
import { REFERENCE_REGISTRIES } from '@mm/scenario';
import { describe, expect, it } from 'vitest';

/** From packages/scenario/test/unit/ up to the repository root. */
const repoRoot = new URL('../../../../', import.meta.url);

function repoPath(relative: string): string {
  return fileURLToPath(new URL(relative, repoRoot));
}

function readRepoFile(relative: string): string {
  return readFileSync(repoPath(relative), 'utf8');
}

function readSweep(name: string): SweepSpec {
  return JSON.parse(readRepoFile(`balance/sweeps/${name}`)) as SweepSpec;
}

/** World ticks per world year, `contracts.md` §0. */
const TICKS_PER_YEAR = 12;

const fast = readSweep('balance-gate.sweep.json');
const horizon = readSweep('balance-gate-horizon.sweep.json');

const scripts = (
  JSON.parse(readRepoFile('package.json')) as {
    readonly scripts: Readonly<Record<string, string>>;
  }
).scripts;

describe('the long horizon is the point of the horizon gate', () => {
  it('runs to twenty world years', () => {
    // Twenty, not "long": the pre-fix build's plateau has set in by year ten,
    // so a gate that stopped there would be reading it at the moment it
    // flattens rather than well after. balance-full.sweep.json already declares
    // 240, so the two long instruments share a timebase and their numbers can
    // be read together.
    expect(horizon.termination.worldTickCap).toBe(20 * TICKS_PER_YEAR);
  });

  it('runs at least four times as long as the fast gate', () => {
    // The independent statement of the same constraint. If someone rewrites the
    // assertion above by editing the literal, this one still asks the question
    // that matters: is the long gate still meaningfully longer than the short
    // one, or have both ended up inside the five-year window where a plateau
    // and a healthy universe read the same number?
    expect(horizon.termination.worldTickCap).toBeGreaterThanOrEqual(
      4 * fast.termination.worldTickCap,
    );
  });

  it('is bound to its tick cap by its baseline, so shortening it fails the gate', () => {
    // Not a second opinion about the JSON — the mechanism. The tick cap is
    // inside the sweep's configurationHash, and the gate refuses a baseline
    // whose hash does not match. So a shortened horizon does not quietly
    // measure something else; it reports baseline-invalid and names the reason.
    const loaded = loadBaseline(repoPath('balance/baselines/balance-gate-horizon-v1.baseline.json'));
    expect('baseline' in loaded, JSON.stringify(loaded)).toBe(true);
    if (!('baseline' in loaded)) return;
    expect(loaded.baseline.sweepId).toBe(horizon.sweepId);
    expect(loaded.baseline.configurationHash).toBe(
      expandSweep(horizon, REFERENCE_REGISTRIES).configurationHash,
    );
  });

  it('reaches a level the five-year gate never sees', () => {
    // The blind spot in one assertion, read off the two committed baselines
    // rather than restated from the docstring. Ten nodes is a deliberately loose
    // floor: the measured gap is 15.7 (48.35 against 32.65). If this ever fails,
    // the two gates have stopped measuring different parts of the curve, and
    // that is the question to answer before touching the number.
    const at = (path: string, metricId: string): number => {
      const loaded = loadBaseline(repoPath(path));
      if (!('baseline' in loaded)) throw new Error(`no baseline at ${path}`);
      const entry = loaded.baseline.metrics.find((metric) => metric.metricId === metricId);
      if (entry?.status !== 'measured') throw new Error(`${metricId} is not measured in ${path}`);
      return entry.value;
    };
    const short = at('balance/baselines/balance-gate-v1.baseline.json', 'referenceNodesKnown');
    const long = at(
      'balance/baselines/balance-gate-horizon-v1.baseline.json',
      'referenceNodesKnown',
    );
    expect(long).toBeGreaterThan(short + 10);
  });
});

describe('the fast gate keeps the sensitivity the horizon gate cannot afford', () => {
  it('still runs 200 runs over five world years', () => {
    expect(fast.termination.worldTickCap).toBe(5 * TICKS_PER_YEAR);
    expect(expandSweep(fast, REFERENCE_REGISTRIES).runCount).toBe(200);
  });

  it('was not paid for out of the horizon gate’s budget', () => {
    // The failure this guards against is subtler than deleting a gate: keeping
    // both and cutting the replicate count of one to pay for the other. Two
    // hundred runs is what the fast gate's tolerances were computed at, and
    // halving it would widen every one of them by about 1.4 while every test
    // still passed.
    expect(fast.replicates).toBe(50);
    expect(horizon.replicates).toBe(50);
  });
});

describe('both gates are wired into both CI systems (docs/devops/ci-and-deploy.md)', () => {
  const gateScripts = ['balance:gate', 'balance:gate:horizon'] as const;

  it.each(gateScripts)('%s is an npm script that runs the gate entrypoint', (name) => {
    expect(scripts[name]).toContain('balance-gate.mjs');
  });

  it.each(gateScripts)('npm run verify runs %s', (name) => {
    // This is the whole of the self-hosted runner's wiring: scripts/ci-check.sh
    // names no gate of its own, because its contract is to stay equivalent to
    // verify. Asserting that here means the runner cannot silently lose a gate.
    expect(scripts['verify']).toContain(`npm run ${name}`);
  });

  it('leaves the self-hosted runner delegating to verify rather than listing gates', () => {
    const script = readRepoFile('scripts/ci-check.sh');
    expect(script).toContain('npm run verify');
    expect(script).not.toContain('balance-gate.mjs');
  });

  it.each(gateScripts)('every GitHub Actions job runs %s by name', (name) => {
    // The workflow lists its steps by hand, so a gate added only to verify would
    // run on the self-hosted runner and be absent from Actions — which is the
    // exact drift docs/devops/ci-and-deploy.md warns about, in the form where
    // the two systems disagree about a commit and nobody knows why.
    const workflow = readRepoFile('.github/workflows/ci.yml');
    const jobsBlock = workflow.slice(workflow.indexOf('\njobs:\n'));
    expect(jobsBlock).not.toBe('');
    const jobs = jobsBlock.split(/^ {2}[\w-]+:$/m).slice(1);
    // Both of them: the pinned-Node gate and the next-major early warning.
    expect(jobs.length).toBe(2);
    for (const job of jobs) {
      expect(job).toContain(`npm run ${name}`);
    }
  });
});
