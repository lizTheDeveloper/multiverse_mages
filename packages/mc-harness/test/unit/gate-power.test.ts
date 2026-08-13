/*
 * Multiverse Mages — the gates' own sensitivity, checked against the table that
 * publishes it.
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
 * ## A gate whose power nobody has computed is how this happened
 *
 * `balance/README.md` publishes a **minimum detectable effect** per metric per
 * gate: `tolerance ÷ |value|`, the smallest proportional change the gate would
 * call a regression. Those figures were not in the repository until 2026-08-12,
 * and in their absence the 200-year gate spent its whole life reporting green at
 * an MDE of 117.7 % on `referenceGrimoires` — wide enough that a mechanic
 * doubling grimoire output would have passed.
 *
 * This file exists so that the table cannot go stale the way the "no system
 * reads `ctx.actions`" note in the same README did. It does not restate the
 * numbers: it **parses the table out of the README** and recomputes every cell
 * from the committed baselines. A regenerated baseline that moves a tolerance
 * without updating the table fails here, and so does a table edited to describe
 * a build that no longer exists.
 *
 * The threshold assertion at the end is the one that would have caught the
 * original defect: no gated metric may have an MDE above 100 %, because an MDE
 * above 100 % means the metric can go to *zero* — or double — inside tolerance,
 * and a line like that is not gating anything. It is written as a floor on the
 * instrument rather than as a balance claim: it says the gate can see, not that
 * what it sees is good.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBaseline } from '@mm/mc-harness';
import type { Baseline } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function read(relative: string): string {
  return readFileSync(join(repoRoot, relative), 'utf8');
}

function baselineAt(relative: string): Baseline {
  const parsed = parseBaseline(read(relative));
  if ('problems' in parsed) throw new Error(`${relative}: ${parsed.problems.join('; ')}`);
  return parsed.baseline;
}

/** The gates, in the column order `balance/README.md`'s power table uses. */
const GATES = [
  { column: '5-year gate', file: 'balance/baselines/balance-gate-v1.baseline.json' },
  { column: '20-year gate', file: 'balance/baselines/balance-gate-horizon-v1.baseline.json' },
  { column: '200-year gate', file: 'balance/baselines/balance-gate-ascension-v1.baseline.json' },
] as const;

/**
 * The minimum detectable effect of one baseline line, as a percentage.
 *
 * `null` where the value is zero, because a proportional change of a quantity
 * that is zero is not defined and printing `Infinity` would look like a
 * measurement — the same argument `gate.ts` makes about a zero standard error.
 */
function mdePercent(baseline: Baseline, metricId: string): number | null {
  const entry = baseline.metrics.find((metric) => metric.metricId === metricId);
  if (entry === undefined || entry.status !== 'measured') return null;
  if (entry.value === 0) return null;
  return (entry.tolerance / Math.abs(entry.value)) * 100;
}

/**
 * The published table, parsed back out of the README.
 *
 * Rows are keyed by metric id; each cell is the percentage, or `null` for the
 * `—` that marks a metric a gate does not collect. The `runs` row is skipped —
 * it is a count, not an MDE.
 */
function publishedTable(): Map<string, readonly (number | null)[]> {
  const prose = read('balance/README.md');
  const heading = '## What each gate can actually detect — the power table';
  const start = prose.indexOf(heading);
  expect(start, `${heading} is missing from balance/README.md`).toBeGreaterThanOrEqual(0);
  const section = prose.slice(start, prose.indexOf('\nThree things follow', start));

  const rows = new Map<string, (number | null)[]>();
  for (const line of section.split('\n')) {
    const match = /^\|\s*`([A-Za-z]+)`\s*\|(.+)\|\s*$/.exec(line);
    if (match === null) continue;
    const cells = (match[2] as string).split('|').map((cell) => cell.replaceAll('*', '').trim());
    rows.set(
      match[1] as string,
      cells.map((cell) => (cell === '—' ? null : Number.parseFloat(cell.replace('%', '').trim()))),
    );
  }
  expect(rows.size, 'no metric rows parsed out of the power table').toBeGreaterThan(0);
  return rows;
}

describe('the power table in balance/README.md is derived from the committed baselines', () => {
  const table = publishedTable();
  const baselines = GATES.map((gate) => baselineAt(gate.file));

  it('publishes one row per metric that any gate gates', () => {
    const gated = new Set(baselines.flatMap((b) => b.metrics.map((metric) => metric.metricId)));
    expect([...table.keys()].sort()).toEqual([...gated].sort());
  });

  it.each(GATES.map((gate, index) => [gate.column, index] as const))(
    'every %s cell equals tolerance / |value| from its baseline',
    (column, index) => {
      const baseline = baselines[index] as Baseline;
      for (const [metricId, cells] of table) {
        const published = cells[index] as number | null | undefined;
        const computed = mdePercent(baseline, metricId);
        if (computed === null) {
          // Either the gate does not collect it, or the value is zero. Both are
          // an em dash in the table, never a number.
          expect(published ?? null, `${column} ${metricId} should be — in the table`).toBeNull();
          continue;
        }
        expect(published, `${column} ${metricId} is missing from the table`).not.toBeUndefined();
        expect(
          published as number,
          `${column} ${metricId}: table says ${String(published)} %, baseline gives ` +
            `${computed.toFixed(1)} %. Regenerating a baseline changes what the gate can see, so ` +
            'the published power table has to move with it.',
        ).toBeCloseTo(computed, 1);
      }
    },
  );

  it.each(GATES.map((gate) => gate.file))('%s derives every tolerance from its own k', (file) => {
    // The table is only interpretable if `tolerance` really is `k` standard
    // errors — otherwise `tolerance / value` is a ratio of two unrelated
    // numbers. Checked here rather than assumed, for all three gates at once.
    const baseline = baselineAt(file);
    for (const entry of baseline.metrics) {
      if (entry.status !== 'measured') continue;
      expect(entry.tolerance, `${entry.metricId} in ${file}`).toBeCloseTo(
        baseline.toleranceK * entry.standardError,
        6,
      );
    }
  });
});

describe('no gated metric may be blind to a change that doubles it', () => {
  it.each(GATES.map((gate) => [gate.column, gate.file] as const))(
    '%s keeps every minimum detectable effect below 100 %%',
    (column, file) => {
      const baseline = baselineAt(file);
      const blind: string[] = [];
      for (const entry of baseline.metrics) {
        if (entry.status !== 'measured' || entry.value === 0) continue;
        const mde = (entry.tolerance / Math.abs(entry.value)) * 100;
        if (mde >= 100) blind.push(`${entry.metricId} at ${mde.toFixed(1)} %`);
      }
      expect(
        blind,
        `${column} gates ${String(blind.length)} metric(s) whose tolerance exceeds their own ` +
          'value, so the metric could double, or fall to zero, and the gate would report pass. ' +
          'A line like that is not gating anything. Widen the sample or narrow the population it ' +
          'is taken over — do not widen the tolerance further, and do not delete the metric.',
      ).toEqual([]);
    },
  );
});
