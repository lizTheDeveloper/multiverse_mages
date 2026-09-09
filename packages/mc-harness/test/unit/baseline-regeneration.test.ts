/*
 * Multiverse Mages — deliberate baseline regeneration, task group 9.
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
 * The rule these tests protect is CLAUDE.md's rule about `npm run goldens:regen`,
 * transplanted: **a regenerated baseline is a claim that behaviour changed on
 * purpose.** No checker can read intent, so what is testable is everything that
 * makes the claim visible — a rationale that cannot be omitted, a superseded
 * hash, a per-metric delta, and an entrypoint nothing automated can reach.
 *
 * The last two describe blocks are the ones worth failing over. One reads the CI
 * configuration and asserts that no job invokes the regeneration command
 * (task 9.6). The other asserts that the committed baselines are byte-identical
 * on disk after this suite has run a *failing* gate through the same code CI
 * uses (task 9.7) — because a suite that quietly repaired its own baseline would
 * be green forever and would mean nothing.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CliSink, ScenarioModule } from '@mm/mc-harness';
import {
  GATE_STATUS,
  compareToBaseline,
  encodeBaseline,
  gateCommand,
  regenerateBaseline,
  regenerateCommand,
  sha256Hex,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_METRICS,
  fixtureBaseline,
  fixtureSweep,
  fixtureWealthStandardError,
} from './baseline-fixtures.js';
import { TOY_REGISTRIES, toySweep, withTempDirectoryAsync } from './fixtures.js';

const RATIONALE = 'a deliberate tuning change, recorded so a reviewer reads what moved.';

/** The repository root, four levels up from this file. */
const repoRoot = new URL('../../../../', import.meta.url);

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, repoRoot)), 'utf8');
}

/** Collects a command's output so a test reads what a user would see. */
function recordingSink(): CliSink & { readonly lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
  };
}

/**
 * A scenario module that fails loudly if anything dispatches a run.
 *
 * The refusals must happen *before* the sweep, and the cheapest way to assert
 * "before" is to make "at all" an error.
 */
const NEVER_DISPATCHED: ScenarioModule = {
  executor: () => {
    throw new Error('a run was dispatched by a command that should have refused first.');
  },
  registries: TOY_REGISTRIES,
  provenance: {
    buildVersion: '0.0.0',
    contentHash: 'x',
    rngRegistryHash: 'x',
    observationSchemaVersion: 1,
    observationLayoutDigest: 'x',
    metricDefinitionVersions: {},
  },
  workerUrl: new URL('../fixtures/pool-worker.mjs', import.meta.url),
};

describe('a rationale is not optional (task 9.2)', () => {
  it.each([undefined, '', '   '])('refuses to build a baseline with rationale %p', (rationale) => {
    const { summary, records } = fixtureSweep();
    const result = regenerateBaseline({
      summary,
      records,
      rationale: rationale as unknown as string,
      toleranceK: 3,
    });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain('rationale is required');
  });

  it('refuses at the command, before a single run is dispatched, and writes nothing', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const path = join(directory, 'nothing.baseline.json');
      const sink = recordingSink();
      const exitCode = await regenerateCommand(
        {
          sweepPath: join(directory, 'no-such.sweep.json'),
          baselinePath: path,
          outputDirectory: directory,
          workerCount: 1,
          rationale: '  ',
          toleranceK: 3,
        },
        NEVER_DISPATCHED,
        sink,
      );

      expect(exitCode).toBe(1);
      expect(sink.lines.join('\n')).toContain('A rationale is required');
      expect(readdirSync(directory)).toEqual([]);
    });
  });

  it('stores the rationale verbatim in the file it writes', () => {
    const { summary, records } = fixtureSweep();
    const result = regenerateBaseline({ summary, records, rationale: RATIONALE, toleranceK: 3 });
    expect('baseline' in result).toBe(true);
    if (!('baseline' in result)) return;
    expect(result.baseline.rationale).toBe(RATIONALE);
    expect(encodeBaseline(result.baseline)).toContain(RATIONALE);
  });
});

describe('the diff carries the movement (task 9.3)', () => {
  it('records the superseded hash and the per-metric delta in the gate’s own units', () => {
    const previous = fixtureBaseline();
    const shift = 4 * fixtureWealthStandardError();
    const { summary, records } = fixtureSweep({ wealthShift: shift });

    const result = regenerateBaseline({
      summary,
      records,
      rationale: RATIONALE,
      toleranceK: 3,
      previous,
    });
    expect('baseline' in result).toBe(true);
    if (!('baseline' in result)) return;
    const { baseline, changes } = result;

    expect(baseline.supersedes).toBe(previous.contentHash);

    const wealth = baseline.supersededDeltas.find(
      (delta) => delta.metricId === FIXTURE_METRICS.wealth,
    );
    expect(wealth?.delta).toBeCloseTo(shift, 9);
    // In the units the gate reports: four standard errors, because that is what
    // the fixture moved it by. A reviewer reads the size without recomputing it.
    expect(wealth?.deltaInStandardErrors).toBeCloseTo(4, 6);

    // And the same arithmetic the gate would have produced, not a second copy.
    const gate = compareToBaseline({ baseline: previous, summary });
    const gateWealth = gate.comparisons.find(
      (comparison) => comparison.metricId === FIXTURE_METRICS.wealth,
    );
    expect(gateWealth?.status).toBe(GATE_STATUS.regressed);
    expect(gateWealth?.deltaInStandardErrors).toBeCloseTo(wealth?.deltaInStandardErrors ?? 0, 9);

    expect(changes.join('\n')).toContain(FIXTURE_METRICS.wealth);
  });

  it('records a first baseline as superseding nothing, rather than superseding itself', () => {
    const { summary, records } = fixtureSweep();
    const result = regenerateBaseline({ summary, records, rationale: RATIONALE, toleranceK: 3 });
    if (!('baseline' in result)) throw new Error('expected a baseline');
    expect(result.baseline.supersedes).toBeNull();
    expect(result.baseline.supersededDeltas).toEqual([]);
  });

  it('records a metric that became available as a movement from nothing', () => {
    const previous = fixtureBaseline();
    const { summary, records } = fixtureSweep({ absentBecomesAvailable: true });
    const result = regenerateBaseline({
      summary,
      records,
      rationale: RATIONALE,
      toleranceK: 3,
      previous,
    });
    if (!('baseline' in result)) throw new Error('expected a baseline');
    const absent = result.baseline.supersededDeltas.find(
      (delta) => delta.metricId === FIXTURE_METRICS.absent,
    );
    expect(absent?.previousValue).toBeNull();
    expect(absent?.value).toBe(0.25);
    expect(absent?.delta).toBeNull();
  });
});

describe('a tolerance change goes through the same command (task 9.4)', () => {
  it('moves every tolerance when k moves, and the file records the new k', () => {
    const { summary, records } = fixtureSweep();
    const narrow = regenerateBaseline({ summary, records, rationale: RATIONALE, toleranceK: 1 });
    const wide = regenerateBaseline({ summary, records, rationale: RATIONALE, toleranceK: 6 });
    if (!('baseline' in narrow) || !('baseline' in wide)) throw new Error('expected baselines');

    expect(narrow.baseline.toleranceK).toBe(1);
    expect(wide.baseline.toleranceK).toBe(6);
    for (const metric of wide.baseline.metrics) {
      if (metric.status !== 'measured') continue;
      const before = narrow.baseline.metrics.find((entry) => entry.metricId === metric.metricId);
      if (before?.status !== 'measured') throw new Error('expected a measured counterpart');
      expect(metric.tolerance).toBeCloseTo(6 * before.tolerance, 9);
    }

    // And the widening is a different file, so it is a diff someone reviews.
    expect(wide.baseline.contentHash).not.toBe(narrow.baseline.contentHash);
  });

  it('refuses to overwrite a baseline that was edited by hand, and dispatches nothing', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const path = join(directory, 'hand-edited.baseline.json');
      const text = encodeBaseline(fixtureBaseline());
      writeFileSync(path, text.replace(/"tolerance":[0-9.]+/, '"tolerance":9999'), 'utf8');
      const before = readFileSync(path, 'utf8');

      const sweepPath = join(directory, 'toy.sweep.json');
      writeFileSync(sweepPath, JSON.stringify(toySweep()), 'utf8');

      const sink = recordingSink();
      const exitCode = await regenerateCommand(
        {
          sweepPath,
          baselinePath: path,
          outputDirectory: directory,
          workerCount: 1,
          rationale: RATIONALE,
          toleranceK: 3,
        },
        NEVER_DISPATCHED,
        sink,
      );

      expect(exitCode).toBe(1);
      expect(sink.lines.join('\n')).toContain('malformed');
      expect(sink.lines.join('\n')).toContain('launder a hand edit');
      // Refusing means refusing: the hand-edited file is left exactly as found,
      // so the person who edited it is the one who has to undo it.
      expect(readFileSync(path, 'utf8')).toBe(before);
    });
  });
});

describe('a disqualified sweep cannot become a baseline (task 9.5)', () => {
  it('refuses and names the failure count', () => {
    const { summary, records } = fixtureSweep({ failureCount: 7 });
    const result = regenerateBaseline({ summary, records, rationale: RATIONALE, toleranceK: 3 });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain('7 failed runs');
    expect(result.problems.join('\n')).toContain('disqualified');
  });
});

describe('the regeneration entrypoint is unreachable from anything automated (task 9.6)', () => {
  const ENTRYPOINT = 'regenerate-baseline';

  it('is a separate file from the gate, and the gate never writes a baseline', () => {
    // The gate shell names the regeneration shell in its prose, deliberately —
    // a reader who wants to regenerate should be told where to go. What it must
    // not do is *import* or *run* it.
    const gate = readRepoFile('packages/mc-harness/bin/balance-gate.mjs');
    expect(gate).not.toContain('regenerateCommand');
    expect(gate).not.toMatch(/import[^;]*regenerate/);
    expect(gate).not.toMatch(/spawn|exec|fork/);

    // The gate's own module writes run records and nothing else. Two commands
    // in it write now — `regenerateCommand` and `resealCommand` — and the
    // assertion that matters is unchanged: *every* write in this module goes to
    // the baseline path a caller named, and none of them is in the gate.
    const cli = readRepoFile('packages/mc-harness/src/balance-cli.ts');
    const writes = [...cli.matchAll(/writeFileSync\(([^,]+),/g)].map((match) => match[1]?.trim());
    expect(new Set(writes)).toEqual(new Set(['args.baselinePath']));
    expect(writes).toHaveLength(2);

    // And that one write is inside the regeneration command, not the gate.
    const gateStart = cli.indexOf('export async function gateCommand');
    const gateEnd = cli.indexOf('export interface RegenerateArgs');
    expect(gateStart).toBeGreaterThan(0);
    expect(gateEnd).toBeGreaterThan(gateStart);
    expect(cli.slice(gateStart, gateEnd)).not.toContain('writeFileSync');
  });

  it.each([
    'package.json',
    'scripts/ci-check.sh',
    '.github/workflows/ci.yml',
  ])('is not invoked from %s', (path) => {
    const text = readRepoFile(path);
    expect(text).not.toContain(ENTRYPOINT);
    expect(text).not.toContain('mm-regenerate-baseline');
  });

  it('is not invoked from any npm script, including the ones CI runs by name', () => {
    const manifest = JSON.parse(readRepoFile('package.json')) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    for (const [name, command] of Object.entries(manifest.scripts)) {
      expect(command, `npm script ${name} must not reach the regeneration entrypoint`).not.toContain(
        ENTRYPOINT,
      );
    }
    // Not vacuous: the gate *is* wired in, so the assertion above is about
    // reachability and not about an empty script table.
    expect(manifest.scripts['balance:gate']).toContain('balance-gate.mjs');
    // `verify:balance`, not `verify`: the three Monte Carlo gates moved out of
    // the merge path on 2026-08-14 and are required at release instead. The
    // positive control still holds — the gate is wired into a script the repo
    // runs, so the assertion above is about reachability of the *regeneration*
    // entrypoint and not about an empty script table.
    expect(manifest.scripts['verify:balance']).toContain('balance:gate');
  });

  it('is not reachable from any test file in this workspace', () => {
    const roots = ['packages/mc-harness/test', 'packages/scenario/test'];
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(fileURLToPath(new URL(directory, repoRoot)))) {
        const child = `${directory}/${entry}`;
        if (statSync(fileURLToPath(new URL(child, repoRoot))).isDirectory()) {
          walk(child);
          continue;
        }
        const text = readRepoFile(child);
        // This file names the entrypoint in order to assert nothing invokes it.
        if (child.endsWith('baseline-regeneration.test.ts')) continue;
        if (text.includes(ENTRYPOINT)) offenders.push(child);
      }
    };
    for (const root of roots) walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('running the suite leaves the committed baselines byte-identical (task 9.7)', () => {
  const baselineDirectory = 'balance/baselines';

  /** Every committed baseline, path to SHA-256 of its bytes. */
  function fingerprints(): Record<string, string> {
    const directory = fileURLToPath(new URL(baselineDirectory, repoRoot));
    const prints: Record<string, string> = {};
    for (const entry of readdirSync(directory).sort()) {
      prints[entry] = sha256Hex(readFileSync(join(directory, entry), 'utf8'));
    }
    return prints;
  }

  it('is unchanged after a gate that fails', async () => {
    const before = fingerprints();
    // Not vacuous: there is a committed baseline to leave alone.
    expect(Object.keys(before).length).toBeGreaterThan(0);

    await withTempDirectoryAsync(async (directory) => {
      const sink = recordingSink();
      const sweepPath = join(directory, 'toy.sweep.json');
      writeFileSync(sweepPath, JSON.stringify(toySweep()), 'utf8');

      // The gate CI runs, pointed at a baseline that is not there — the sharpest
      // failure it has, driven through the same entrypoint. It refuses before
      // dispatching, which is why NEVER_DISPATCHED is a usable scenario here.
      const { exitCode, report } = await gateCommand(
        {
          sweepPath,
          baselinePath: join(directory, 'deleted.baseline.json'),
          outputDirectory: directory,
          workerCount: 1,
        },
        NEVER_DISPATCHED,
        sink,
      );
      expect(exitCode).toBe(1);
      expect(report.passed).toBe(false);
      expect(sink.lines.join('\n')).toContain('there is no baseline at');
    });

    expect(fingerprints()).toEqual(before);
  });

  it('is unchanged after a regeneration aimed somewhere else', async () => {
    const before = fingerprints();

    await withTempDirectoryAsync(async (directory) => {
      const sink = recordingSink();
      await regenerateCommand(
        {
          sweepPath: join(directory, 'no-such.sweep.json'),
          baselinePath: join(directory, 'elsewhere.baseline.json'),
          outputDirectory: directory,
          workerCount: 1,
          rationale: RATIONALE,
          toleranceK: 3,
        },
        NEVER_DISPATCHED,
        sink,
      );
    });

    expect(fingerprints()).toEqual(before);
  });
});
