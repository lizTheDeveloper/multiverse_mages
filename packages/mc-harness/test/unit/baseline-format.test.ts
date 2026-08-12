/*
 * Multiverse Mages — the committed baseline file: its shape, and what makes one
 * malformed.
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
 * Tasks 8.1 and 8.2, and the capability spec's *"a baseline missing any of them
 * is rejected as malformed"*.
 *
 * The last block is the one that matters for task 9.4: a tolerance edited
 * directly in the file — which is what a person does when the gate is in their
 * way — must make the baseline **invalid**, not merely different. The
 * `contentHash` is what gives that property teeth, and the test edits a real
 * file's real tolerance rather than corrupting a field nobody would touch.
 */

import type { Baseline } from '@mm/mc-harness';
import {
  BASELINE_FORMAT_VERSION,
  baselineContentHash,
  baselineProblems,
  encodeBaseline,
  parseBaseline,
  sealBaseline,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { FIXTURE_METRICS, fixtureBaseline } from './baseline-fixtures.js';

/** The parsed baseline, or a failure naming what the parser objected to. */
function parsed(text: string): Baseline {
  const result = parseBaseline(text);
  if ('problems' in result) throw new Error(`unexpected problems: ${result.problems.join('; ')}`);
  return result.baseline;
}

/** The lines of an encoded baseline that carry a metric. */
function metricLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trimStart().startsWith('{"aggregation"'));
}

describe('the file is written to be read in a diff', () => {
  it('puts every metric on exactly one line, sorted by metric id', () => {
    const baseline = fixtureBaseline();
    const lines = metricLines(encodeBaseline(baseline));

    expect(lines).toHaveLength(baseline.metrics.length);
    for (const line of lines) {
      // One line, one metric — a metric that wrapped would make "which metric
      // moved" a question about indentation.
      expect(line.match(/"metricId"/g)).toHaveLength(1);
    }
    const ids = lines.map((line) => /"metricId":"([^"]+)"/.exec(line)?.[1]);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(FIXTURE_METRICS.wealth);
    expect(ids).toContain(FIXTURE_METRICS.absent);
  });

  it('records everything task 8.3 requires, per measured metric', () => {
    const line = metricLines(encodeBaseline(fixtureBaseline())).find((entry) =>
      entry.includes(FIXTURE_METRICS.wealth),
    );
    expect(line).toBeDefined();
    for (const key of [
      'definitionVersion',
      'value',
      'standardError',
      'standardErrorMethod',
      'sampleSize',
      'tolerance',
    ]) {
      expect(line as string).toContain(`"${key}"`);
    }
  });

  it('records an unavailable metric as a reason code, never as a zero', () => {
    const line = metricLines(encodeBaseline(fixtureBaseline())).find((entry) =>
      entry.includes(FIXTURE_METRICS.absent),
    );
    expect(line as string).toContain('"status":"unavailable"');
    expect(line as string).toContain('mechanic-absent');
    expect(line as string).not.toContain('"value"');
  });

  it('sorts top-level keys, so two regenerations differ only where the numbers do', () => {
    const keys = [...encodeBaseline(fixtureBaseline()).matchAll(/^ {2}"([a-zA-Z]+)":/gm)].map(
      (match) => match[1],
    );
    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain('provenance');
    expect(keys).toContain('metrics');
    expect(keys).toContain('rationale');
  });

  it('round-trips, and is idempotent', () => {
    const baseline = fixtureBaseline();
    expect(parsed(encodeBaseline(baseline))).toEqual(baseline);
    expect(encodeBaseline(parsed(encodeBaseline(baseline)))).toBe(encodeBaseline(baseline));
  });

  it('moves exactly two lines when exactly one metric moves', () => {
    const before = encodeBaseline(fixtureBaseline()).split('\n');
    const moved = fixtureBaseline();
    const after = encodeBaseline(
      sealBaseline({
        ...moved,
        metrics: moved.metrics.map((metric) =>
          metric.metricId === FIXTURE_METRICS.wealth && metric.status === 'measured'
            ? { ...metric, value: metric.value + 1 }
            : metric,
        ),
      }),
    ).split('\n');

    const changed = before.filter((line, index) => after[index] !== line);
    // The metric's line, and the contentHash line that covers it. Nothing else.
    expect(changed).toHaveLength(2);
    expect(changed.some((line) => line.includes(FIXTURE_METRICS.wealth))).toBe(true);
    expect(changed.some((line) => line.includes('"contentHash"'))).toBe(true);
  });
});

describe('a baseline carries its whole provenance or it is not one', () => {
  it('accepts the fixture', () => {
    expect(baselineProblems(fixtureBaseline())).toEqual([]);
  });

  it.each([
    'buildVersion',
    'contentHash',
    'rngRegistryHash',
    'observationSchemaVersion',
    'observationLayoutDigest',
    'metricDefinitionVersions',
  ])('rejects a baseline whose provenance is missing %s', (key) => {
    const baseline = fixtureBaseline();
    const provenance: Record<string, unknown> = { ...baseline.provenance };
    delete provenance[key];
    const problems = baselineProblems({ ...baseline, provenance });
    expect(problems.join('\n')).toContain(key);
  });

  it.each([
    ['sweepId', ''],
    ['configurationHash', ''],
    ['rationale', '   '],
    ['toleranceK', 0],
    ['rootSeed', -1],
    ['baselineFormatVersion', BASELINE_FORMAT_VERSION + 1],
  ])('rejects a baseline whose %s is unusable', (key, value) => {
    const problems = baselineProblems({ ...fixtureBaseline(), [key]: value });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(key);
  });

  it('rejects a baseline that gates nothing', () => {
    expect(baselineProblems({ ...fixtureBaseline(), metrics: [] }).join('\n')).toContain(
      'gates nothing',
    );
  });

  it('rejects an unavailable metric with no reason code', () => {
    const baseline = fixtureBaseline();
    const broken = sealBaseline({
      ...baseline,
      metrics: baseline.metrics.map((metric) =>
        metric.status === 'unavailable' ? { ...metric, reasons: [] } : metric,
      ),
    });
    expect(baselineProblems(broken).join('\n')).toContain('names no reason');
  });

  it('rejects a duplicated metric, which would gate one name twice', () => {
    const baseline = fixtureBaseline();
    const first = baseline.metrics[0] as Baseline['metrics'][number];
    expect(baselineProblems(sealBaseline({ ...baseline, metrics: [first, first] })).join('\n')).toContain(
      'appears twice',
    );
  });

  it('rejects unsorted metric lines, because an unsorted diff is unreadable', () => {
    const baseline = fixtureBaseline();
    const broken = sealBaseline({ ...baseline, metrics: [...baseline.metrics].reverse() });
    expect(baselineProblems(broken).join('\n')).toContain('not sorted');
  });

  it('rejects text that is not JSON at all, without throwing', () => {
    expect('problems' in parseBaseline('{ this is not json')).toBe(true);
  });
});

describe('a hand-edited tolerance is a malformed baseline, not a wider gate', () => {
  it('rejects a tolerance widened in the file', () => {
    const text = encodeBaseline(fixtureBaseline());
    const tolerance = /"tolerance":([0-9.]+)/.exec(text)?.[1];
    expect(tolerance).toBeDefined();

    // Exactly what someone does when the gate is in their way.
    const widened = text.replace(`"tolerance":${tolerance as string}`, '"tolerance":9999');
    expect(widened).not.toBe(text);

    const result = parseBaseline(widened);
    expect('problems' in result).toBe(true);
    if ('problems' in result) expect(result.problems.join('\n')).toContain('edited by hand');
  });

  it('rejects an edited rationale too — the whole file is under the hash', () => {
    const text = encodeBaseline(fixtureBaseline());
    const rewritten = text.replace('fixture baseline, so that', 'something else, so that');
    expect(rewritten).not.toBe(text);
    expect('problems' in parseBaseline(rewritten)).toBe(true);
  });

  it('hashes everything except the hash itself', () => {
    const baseline = fixtureBaseline();
    expect(baselineContentHash(baseline)).toBe(baseline.contentHash);
    // Rewriting the recorded hash cannot change the hash of the contents.
    expect(baselineContentHash({ ...baseline, contentHash: 'tampered' })).toBe(baseline.contentHash);
  });
});
