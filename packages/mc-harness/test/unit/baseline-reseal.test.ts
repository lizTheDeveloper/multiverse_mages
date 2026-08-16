/*
 * Multiverse Mages — the provenance-only baseline re-seal.
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
 * A re-seal makes one claim — *only the build moved; the numbers did not* — and
 * these tests are arranged around the two ways that claim can be false.
 *
 * It is false if a metric moved, so the largest block here is refusals: past a
 * tolerance, newly available, newly unavailable, a `definitionVersion` bump, a
 * different experiment, a disqualified sweep. Every one must refuse rather than
 * seal, because a re-seal over a real movement hides a regression behind a fresh
 * seal, which is worse than the blocked merge it was reaching for.
 *
 * It is also false if the command *says* it preserved the metrics and did not,
 * so the invariance is asserted on the **encoded file text** rather than on two
 * in-memory arrays — and `encodedFieldSpan` is given a positive control first,
 * because a checker that answers about the wrong input is worse than no checker.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CliSink, Provenance, ScenarioModule } from '@mm/mc-harness';
import {
  encodeBaseline,
  encodedFieldSpan,
  parseBaseline,
  compareToBaseline,
  resealBaseline,
  resealCommand,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_BASELINE_PROVENANCE,
  FIXTURE_METRICS,
  fixtureBaseline,
  fixtureSweep,
  fixtureWealthStandardError,
} from './baseline-fixtures.js';
import { TOY_REGISTRIES, withTempDirectoryAsync } from './fixtures.js';

const SEALED_ON = '2026-08-14';

/** The content revision moving, and nothing else about the build moving with it. */
const CONTENT_MOVED: Provenance = {
  ...FIXTURE_BASELINE_PROVENANCE,
  contentHash: 'content-hash-after-authoring-a-node',
};

/** The repository root, four levels up from this file. */
const repoRoot = new URL('../../../../', import.meta.url);

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, repoRoot)), 'utf8');
}

function recordingSink(): CliSink & { readonly lines: string[] } {
  const lines: string[] = [];
  return { lines, out: (line) => lines.push(line), err: (line) => lines.push(line) };
}

/** A scenario module that fails loudly if anything dispatches a run. */
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

describe('encodedFieldSpan answers about the field it was asked for', () => {
  const text = encodeBaseline(fixtureBaseline());

  it('finds a non-empty metrics block naming every gated metric', () => {
    const span = encodedFieldSpan(text, 'metrics');
    expect(span).toBeDefined();
    for (const metricId of Object.values(FIXTURE_METRICS)) {
      expect(span).toContain(metricId);
    }
    // Not the whole file: the fields either side must be outside the span.
    expect(span).not.toContain('"rationale"');
    expect(span).not.toContain('"notes"');
  });

  it('reports a changed metric block as changed — the positive control for the assertion', () => {
    const moved = fixtureBaseline();
    const shifted = encodeBaseline({
      ...moved,
      metrics: moved.metrics.map((metric) =>
        metric.status === 'measured' ? { ...metric, value: metric.value + 1 } : metric,
      ),
    });
    expect(encodedFieldSpan(shifted, 'metrics')).not.toBe(encodedFieldSpan(text, 'metrics'));
  });

  it('returns undefined for a field the text does not carry', () => {
    expect(encodedFieldSpan(text, 'noSuchField')).toBeUndefined();
  });
});

describe('content moved and behaviour did not: the case a re-seal is for', () => {
  const baseline = fixtureBaseline();
  const { summary } = fixtureSweep({ provenance: CONTENT_MOVED });
  const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });

  it('re-seals rather than refusing', () => {
    expect('problems' in result).toBe(false);
  });

  it('leaves the encoded metric block byte-identical', () => {
    if (!('baseline' in result)) throw new Error('the re-seal refused.');
    const before = encodedFieldSpan(encodeBaseline(baseline), 'metrics');
    const after = encodedFieldSpan(encodeBaseline(result.baseline), 'metrics');
    expect(before).toBeDefined();
    expect(after).toBe(before);
  });

  it('carries the new provenance and a new contentHash', () => {
    if (!('baseline' in result)) throw new Error('the re-seal refused.');
    expect(result.baseline.provenance).toEqual(CONTENT_MOVED);
    expect(result.baseline.contentHash).not.toBe(baseline.contentHash);
    expect(parseBaseline(encodeBaseline(result.baseline))).toHaveProperty('baseline');
  });

  it('clears the gate, which then passes on the numbers rather than skipping them', () => {
    if (!('baseline' in result)) throw new Error('the re-seal refused.');
    const before = compareToBaseline({ baseline, summary });
    expect(before.passed).toBe(false);
    expect(before.invalidations.join('\n')).toContain('provenance.contentHash');

    const after = compareToBaseline({ baseline: result.baseline, summary });
    expect(after.invalidations).toEqual([]);
    expect(after.passed).toBe(true);
    // "Passes on numbers" is the point: every gated metric was actually
    // compared, not waved through by an empty comparison list.
    expect(after.comparisons.length).toBe(baseline.metrics.length);
  });

  it('leaves supersedes and supersededDeltas alone, because it supersedes no numbers', () => {
    if (!('baseline' in result)) throw new Error('the re-seal refused.');
    expect(result.baseline.supersedes).toBe(baseline.supersedes);
    expect(result.baseline.supersededDeltas).toEqual(baseline.supersededDeltas);
    expect(result.baseline.rationale).toBe(baseline.rationale);
    expect(result.baseline.toleranceK).toBe(baseline.toleranceK);
    expect(result.baseline.runCount).toBe(baseline.runCount);
  });
});

describe('the note is appended, never substituted', () => {
  const baseline = fixtureBaseline();
  const { summary } = fixtureSweep({ provenance: CONTENT_MOVED });
  const result = resealBaseline({
    baseline,
    summary,
    sealedOn: SEALED_ON,
    notes: ['and one caveat the operator added by hand.'],
  });

  it('keeps every note the file already carried, in order', () => {
    if (!('baseline' in result)) throw new Error('the re-seal refused.');
    expect(baseline.notes.length).toBeGreaterThan(0);
    expect(result.baseline.notes.slice(0, baseline.notes.length)).toEqual([...baseline.notes]);
    expect(result.baseline.notes.length).toBe(baseline.notes.length + 2);
  });

  it('says in plain words that nothing was measured, and names both revisions', () => {
    if (!('baseline' in result)) throw new Error('the re-seal refused.');
    const note = result.baseline.notes[baseline.notes.length] as string;
    expect(note).toContain('PROVENANCE ONLY');
    expect(note).toContain('No metric in this file was re-measured');
    expect(note).toContain('content-hash-fixture');
    expect(note).toContain('content-hash-after-authoring');
    // The hash of the file whose metric lines these are, so a reader can find it.
    expect(note).toContain(baseline.contentHash);
    expect(note).toContain(SEALED_ON);
    // And the movement it sealed over, permanently, in the file.
    expect(note).toContain('largest');
  });

  it('demands a date, so the note cannot be read as timeless', () => {
    for (const sealedOn of ['', 'today', '14-08-2026']) {
      const refused = resealBaseline({ baseline, summary, sealedOn });
      expect('problems' in refused).toBe(true);
      if (!('problems' in refused)) continue;
      expect(refused.problems.join('\n')).toContain('YYYY-MM-DD');
    }
  });
});

describe('it refuses whenever a metric would move', () => {
  const baseline = fixtureBaseline();

  it('refuses a metric past its tolerance, naming it and the movement', () => {
    const { summary } = fixtureSweep({ provenance: CONTENT_MOVED, wealthShift: 50 });
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    const text = result.problems.join('\n');
    expect(text).toContain(FIXTURE_METRICS.wealth);
    expect(text).toContain('regressed');
    expect(text).toContain('SE');
    expect(text).toContain('hide a real change behind a fresh seal');
  });

  it('refuses a metric that has become available', () => {
    const { summary } = fixtureSweep({ provenance: CONTENT_MOVED, absentBecomesAvailable: true });
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain(FIXTURE_METRICS.absent);
  });

  it('refuses a metric that has stopped being available', () => {
    const { summary } = fixtureSweep({ provenance: CONTENT_MOVED, wealthBecomesUnavailable: true });
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain('newly-unavailable');
  });

  it('refuses a zero-tolerance metric that moved at all', () => {
    const { summary } = fixtureSweep({ provenance: CONTENT_MOVED, constantShift: 1 });
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain(FIXTURE_METRICS.constant);
  });

  it('seals over movement that stayed inside tolerance, and reports every bit of it', () => {
    const shift = fixtureWealthStandardError();
    expect(shift).toBeGreaterThan(0);
    const { summary } = fixtureSweep({ provenance: CONTENT_MOVED, wealthShift: shift });
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(false);
    if (!('baseline' in result)) return;

    // The committed value is preserved — the observed one is not banked.
    const drift = result.drift.find((entry) => entry.metricId === FIXTURE_METRICS.wealth);
    expect(drift?.deltaInStandardErrors).toBeCloseTo(1, 6);
    expect(encodedFieldSpan(encodeBaseline(result.baseline), 'metrics')).toBe(
      encodedFieldSpan(encodeBaseline(baseline), 'metrics'),
    );
    // Every gated metric appears in the drift report, not only the moved one.
    expect(result.drift.map((entry) => entry.metricId).sort()).toEqual(
      [...baseline.metrics].map((metric) => metric.metricId).sort(),
    );
  });
});

describe('it refuses everything a seal cannot honestly clear', () => {
  const baseline = fixtureBaseline();

  it.each([
    ['a different sweep', { sweepId: 'some-other-sweep' }],
    ['a different configuration', { configurationHash: 'configuration-hash-elsewhere' }],
    ['a different root seed', { rootSeed: 999 }],
    ['a disqualified sweep', { failureCount: 3 }],
  ])('refuses %s', (_label, options) => {
    const { summary } = fixtureSweep({ provenance: CONTENT_MOVED, ...options });
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain('re-seal cannot clear it');
  });

  it('refuses when nothing moved, so a re-seal would be a commit about nothing', () => {
    const { summary } = fixtureSweep();
    const result = resealBaseline({ baseline, summary, sealedOn: SEALED_ON });
    expect('problems' in result).toBe(true);
    if (!('problems' in result)) return;
    expect(result.problems.join('\n')).toContain('nothing to re-seal');
  });

  it('refuses a hand-edited baseline before dispatching a run, and writes nothing', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const path = join(directory, 'hand-edited.baseline.json');
      const text = encodeBaseline(baseline).replace('"toleranceK": 3', '"toleranceK": 30');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, text, 'utf8');

      const sink = recordingSink();
      const exitCode = await resealCommand(
        {
          sweepPath: join(directory, 'no-such.sweep.json'),
          baselinePath: path,
          outputDirectory: directory,
          workerCount: 1,
          sealedOn: SEALED_ON,
          dryRun: false,
        },
        NEVER_DISPATCHED,
        sink,
      );

      expect(exitCode).toBe(1);
      expect(sink.lines.join('\n')).toContain('cannot be re-sealed');
      expect(readFileSync(path, 'utf8')).toBe(text);
    });
  });
});

describe('the re-seal entrypoint is unreachable from anything automated', () => {
  const ENTRYPOINT = 'reseal-baseline';

  it.each(['package.json', 'scripts/ci-check.sh', '.github/workflows/ci.yml'])(
    'is not invoked from %s',
    (path) => {
      expect(readRepoFile(path)).not.toContain(ENTRYPOINT);
    },
  );

  it('is not invoked from any npm script', () => {
    const manifest = JSON.parse(readRepoFile('package.json')) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    for (const [name, command] of Object.entries(manifest.scripts)) {
      expect(command, `npm script ${name} must not reach the re-seal entrypoint`).not.toContain(
        ENTRYPOINT,
      );
    }
    // Not vacuous: the gate *is* wired into a script the repo runs. That script
    // is `verify:balance` and not `verify` — the three Monte Carlo gates moved
    // out of the merge path on 2026-08-14 and are required at release instead.
    // The control still controls; only the name it points at moved.
    expect(manifest.scripts['verify:balance']).toContain('balance:gate');
  });

  it('offers no flag that skips the verification sweep', () => {
    const bin = readRepoFile('packages/mc-harness/bin/reseal-baseline.mjs');
    const cli = readRepoFile('packages/mc-harness/src/balance-cli.ts');
    for (const escape of ['force', 'skip-verify', 'skipVerify', 'noVerify', 'no-verify']) {
      expect(bin).not.toContain(escape);
      expect(cli.slice(cli.indexOf('export async function resealCommand'))).not.toContain(escape);
    }
    // And --dry-run is the opposite of an escape hatch: it writes nothing.
    const command = cli.slice(cli.indexOf('export async function resealCommand'));
    const dryRunAt = command.indexOf('args.dryRun');
    const writeAt = command.indexOf('writeFileSync(');
    expect(dryRunAt).toBeGreaterThan(0);
    expect(writeAt).toBeGreaterThan(dryRunAt);
  });
});
