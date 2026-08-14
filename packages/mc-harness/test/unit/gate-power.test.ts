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

import { ARM_SCOPE_SEPARATOR, parseBaseline } from '@mm/mc-harness';
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
  { column: '20-year agency gate', file: 'balance/baselines/balance-gate-agency-v1.baseline.json' },
  { column: '200-year gate', file: 'balance/baselines/balance-gate-ascension-v1.baseline.json' },
] as const;

/**
 * The arm lines whose tolerance still exceeds their own value, by name.
 *
 * Committed as a list rather than tolerated by a threshold, because the honest
 * description of this instrument is "it can see everything except these
 * nine things" and a threshold would let a tenth join them in silence.
 * Growing the list is a build failure; shrinking it is a build failure too,
 * because a line that has become sharp is a change in what the gate can see and
 * belongs in a rationale.
 *
 * Every entry is an arm whose value sits near zero. `denial-warden` suppresses
 * discovery to almost nothing, so seven of the nine are its lines and a
 * tolerance of a fraction of a node is a large multiple of the fraction of a
 * node it gains. That is a fact about the strategy, not a slack tolerance: the gate cannot
 * usefully police a proportional change in a quantity that is already almost
 * nothing, and widening the sample buys only √n against it. They are listed so
 * that nobody reads "the gate is fixed" as "the gate sees everything".
 */
const BLIND_ARM_LINES: Readonly<Record<string, readonly string[]>> = {
  // **Empty since w107, and the change is in the instrument rather than in the
  // world.** `apply-magic` moved `denial-warden`'s `referenceNodesKnown` from
  // 4.75 to 5.75 nodes and its `referenceNodesGained` with it, and a mean that
  // is no longer within a rounding error of zero has a tolerance that no longer
  // exceeds it. The agency gate is now blind to **none** of its eighty arm
  // lines, median MDE 12.3 %. Shrinking this list is a build failure precisely
  // so that it arrives with a rationale, and this is the rationale.
  'balance/baselines/balance-gate-agency-v1.baseline.json': [],
  // Ten since w107, up from seven, and the three that joined are all the same
  // shape: an arm whose *spread* widened rather than an arm that stopped
  // producing. `referencePeakPopulation@permissive-breadth` is the clearest —
  // its mean nearly doubled, 7,009 to 12,685, because applied food raises `K`
  // hardest in the arm that permits the most cells, and seeds that were
  // formerly all pinned near the same ceiling now finish far apart. A wider
  // spread is a larger standard error, and a larger standard error is a wider
  // tolerance. `referenceLibraryDepth@portal-rush` and
  // `referenceNodesGainedFinalQuarter@portal-rush` are the same story at the
  // other end: the raider arm's knowledge series lost the little it had.
  //
  // Growing this list is a build failure precisely so it arrives with a
  // rationale rather than as a silent widening, and this is the rationale. Do
  // not add a tenth without one.
  'balance/baselines/balance-gate-ascension-v1.baseline.json': [
    'referenceGrimoires@denial-warden',
    'referenceKnowledgeInstances@denial-warden',
    'referenceLibraryDepth@denial-warden',
    'referenceLibraryDepth@portal-rush',
    'referenceNodesGained@denial-warden',
    'referenceNodesGainedFinalQuarter@narrow-depth',
    'referenceNodesGainedFinalQuarter@passive-control',
    'referenceNodesGainedFinalQuarter@portal-rush',
    'referenceNodesKnown@denial-warden',
    'referencePeakPopulation@permissive-breadth',
  ],
  'balance/baselines/balance-gate-v1.baseline.json': [],
  'balance/baselines/balance-gate-horizon-v1.baseline.json': [],
};

/** A baseline's sweep-level lines: the ones the published table has a row for. */
function sweepLevel(baseline: Baseline): Baseline['metrics'] {
  return baseline.metrics.filter((metric) => !metric.metricId.includes(ARM_SCOPE_SEPARATOR));
}

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

  // The **first** markdown table after the heading, and only that one. Bounded
  // by the table itself rather than by a sentence that follows it: this parser
  // used to slice up to a fixed phrase, and rewording the prose silently widened
  // it to the whole file, so it began matching the arm-spread table and the §7
  // metric table too. A delimiter that a copy-edit can move is not a delimiter.
  const rows = new Map<string, (number | null)[]>();
  let started = false;
  for (const line of prose.slice(start).split('\n')) {
    const isRow = line.trimStart().startsWith('|');
    if (!isRow) {
      if (started) break;
      continue;
    }
    started = true;
    const match = /^\|\s*`([A-Za-z]+)`\s*\|(.+)\|\s*$/.exec(line);
    if (match === null) continue;
    const cells = (match[2] as string).split('|').map((cell) => cell.replaceAll('*', '').trim());
    rows.set(
      match[1] as string,
      cells.map((cell) => (cell === '—' ? null : Number.parseFloat(cell.replace('%', '').trim()))),
    );
  }
  expect(started, 'no table found under the power-table heading').toBe(true);
  expect(rows.size, 'no metric rows parsed out of the power table').toBeGreaterThan(0);
  return rows;
}

describe('the power table in balance/README.md is derived from the committed baselines', () => {
  const table = publishedTable();
  const baselines = GATES.map((gate) => baselineAt(gate.file));

  it('publishes one row per metric that any gate gates at sweep level', () => {
    const gated = new Set(
      baselines.flatMap((baseline) => sweepLevel(baseline).map((metric) => metric.metricId)),
    );
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
    '%s keeps every sweep-level minimum detectable effect below 100 %%',
    (column, file) => {
      const blind: string[] = [];
      for (const entry of sweepLevel(baselineAt(file))) {
        if (entry.status !== 'measured' || entry.value === 0) continue;
        const mde = (entry.tolerance / Math.abs(entry.value)) * 100;
        if (mde >= 100) blind.push(`${entry.metricId} at ${mde.toFixed(1)} %`);
      }
      expect(
        blind,
        `${column} gates ${String(blind.length)} sweep-level metric(s) whose tolerance exceeds ` +
          'their own value, so the metric could double, or fall to zero, and the gate would ' +
          'report pass. A line like that is not gating anything. Narrow the population the ' +
          'spread is taken over, or add replicates — do not widen the tolerance further, and do ' +
          'not delete the metric.',
      ).toEqual([]);
    },
  );

  it.each(GATES.map((gate) => [gate.column, gate.file] as const))(
    '%s has exactly the arm lines it is committed to being blind to',
    (column, file) => {
      const blind = baselineAt(file)
        .metrics.filter((entry) => entry.metricId.includes(ARM_SCOPE_SEPARATOR))
        .filter(
          (entry) =>
            entry.status === 'measured' &&
            entry.value !== 0 &&
            entry.tolerance / Math.abs(entry.value) >= 1,
        )
        .map((entry) => entry.metricId)
        .sort();
      expect(
        blind,
        `${column}: the set of arm lines whose tolerance exceeds their own value has changed. ` +
          'Growing it means the gate went blind somewhere new. Shrinking it means it can see ' +
          'something it could not, which is equally a change in the instrument. Either way the ' +
          'new set belongs in BLIND_ARM_LINES with the regeneration that produced it.',
      ).toEqual([...(BLIND_ARM_LINES[file] ?? [])].sort());
    },
  );
});

describe('the two gates that play a god verb are the ones with arm lines', () => {
  it('gives every multi-strategy gate one line per (metric, arm)', () => {
    // The whole point of the arm lines: a sweep-level mean over eight strategies
    // dilutes any one arm's movement eightfold, and on the superseded 32-run
    // ascension baseline all eighty arms could have fallen to zero inside
    // tolerance. A multi-strategy gate that grew back to sweep-level lines only
    // would be that defect returning.
    for (const file of [
      'balance/baselines/balance-gate-agency-v1.baseline.json',
      'balance/baselines/balance-gate-ascension-v1.baseline.json',
    ]) {
      const baseline = baselineAt(file);
      const armLines = baseline.metrics.filter((metric) =>
        metric.metricId.includes(ARM_SCOPE_SEPARATOR),
      );
      expect(armLines.length, file).toBe(sweepLevel(baseline).length * 8);
    }
  });

  it('leaves the single-strategy gates with no arm lines at all', () => {
    // One arm is not an arm structure, it is the sweep. Duplicating every line
    // under `@passive-control` would double both baselines to say one thing
    // twice, and would have forced a regeneration of two files this work does
    // not touch.
    for (const file of [
      'balance/baselines/balance-gate-v1.baseline.json',
      'balance/baselines/balance-gate-horizon-v1.baseline.json',
    ]) {
      const armLines = baselineAt(file).metrics.filter((metric) =>
        metric.metricId.includes(ARM_SCOPE_SEPARATOR),
      );
      expect(armLines, file).toEqual([]);
    }
  });
});
