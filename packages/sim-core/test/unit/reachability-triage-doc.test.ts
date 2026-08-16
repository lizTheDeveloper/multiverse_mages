/*
 * Multiverse Mages — the triage document's arithmetic, checked.
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
 * `docs/design/reachability-triage.md` is exactly the kind of document CLAUDE.md
 * warns about: a **measurement written in prose**, with a total in one section,
 * a per-package breakdown in another, and a per-mechanism table in a third. The
 * repository has a recorded case of two documents on `main` contradicting each
 * other where *the misleading one was the one people read*, and it cost two
 * agents a full investigation each.
 *
 * That failure is arithmetic, and arithmetic is checkable. Three corrections
 * were made to this document's categories while it was being written, and each
 * one had to be propagated by hand to a headline number, a table row, a section
 * heading and a sentence four sections down. The third round left `63/13/26`
 * standing in §1 while the prose below it had already moved on, and the §2 rows
 * summed to 46 under a sentence that said 45 — both caught by re-deriving, not
 * by reading.
 *
 * So this asserts the internal consistency the next editor will otherwise break
 * silently:
 *
 * 1. §1's package rows each sum across the categories to their own total.
 * 2. §1's totals row is the sum of the package rows, and equals 129.
 * 3. §2's per-mechanism counts sum to the number its closing sentence claims.
 * 4. That claim is not larger than §1's integration-debt total.
 * 5. The 129 matches `scripts/reachability-baseline.json` — the document and the
 *    gate describe the same tree.
 *
 * What it deliberately does **not** check is the *classification*: whether
 * `applyWard` is integration debt rather than superseded is a judgement, and a
 * test that pinned it would be pinning an opinion. Only the arithmetic is
 * mechanical, and only the arithmetic is here.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const docPath = fileURLToPath(new URL('../../../../docs/design/reachability-triage.md', import.meta.url));
const baselinePath = fileURLToPath(
  new URL('../../../../scripts/reachability-baseline.json', import.meta.url),
);

const doc = readFileSync(docPath, 'utf8');

/** Cells of a markdown table row, trimmed, without the leading/trailing empties. */
function cells(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/**
 * §1's package rows: a backticked package name, then five counts and a total.
 *
 * Matched on shape rather than on the heading above them, because a heading is
 * prose and a reader may reword it. A row shaped like this one appears nowhere
 * else in the document.
 */
const packageRows = doc
  .split('\n')
  .filter((line) => /^\| `[a-z-]+` \|/.test(line))
  .map(cells);

/** §1's totals row: bolded name, bolded numbers. */
const totalsRow = doc
  .split('\n')
  .filter((line) => /^\| \*\*Total\*\* \|/.test(line))
  .map((line) => cells(line).map((cell) => Number(cell.replaceAll('*', ''))));

/** §2's per-mechanism rows: a bolded mechanism, then a count, then the evidence. */
const mechanismCounts = doc
  .split('\n')
  .filter((line) => /^\| \*\*/.test(line))
  .map((line) => Number(cells(line)[1]))
  .filter((count) => Number.isInteger(count));

describe('the reachability triage document', () => {
  it('has package rows that sum across their own categories', () => {
    // A positive control on the parse itself: a regex that matched nothing would
    // make every assertion below vacuously true, which is the failure mode this
    // whole suite exists to guard against one level up.
    expect(packageRows.length).toBeGreaterThan(5);

    for (const row of packageRows) {
      const [name, ...numbers] = row;
      const counts = numbers.slice(0, -1).map(Number);
      const stated = Number(numbers.at(-1));
      expect(`${name}: ${String(counts.reduce((sum, n) => sum + n, 0))}`).toBe(
        `${name}: ${String(stated)}`,
      );
    }
  });

  it('has a totals row equal to the sum of the package rows, and to 127', () => {
    expect(totalsRow).toHaveLength(1);
    const totals = totalsRow[0]!.slice(1);

    for (const [column, stated] of totals.entries()) {
      const summed = packageRows.reduce((sum, row) => sum + Number(row[column + 1]), 0);
      expect(`column ${String(column)}: ${String(summed)}`).toBe(
        `column ${String(column)}: ${String(stated)}`,
      );
    }
    // 129 until `w204/affiliate-writer` gave `completeAffiliation` a production
    // caller and `changeAffiliation` a reached one. The literal is deliberate —
    // a total derived from the document could not catch a document that had
    // drifted from the tree — so it moves only with a change that says why, and
    // `describes the same tree the ratchet baseline pins` below is the other
    // half of the tie.
    expect(totals.at(-1)).toBe(127);
  });

  it('has a §2 table whose counts sum to the total its closing sentence claims', () => {
    // The sentence is the thing a reader takes away, and it was wrong once: the
    // rows summed to 46 under a sentence that said 45.
    const match = /That is (\d+) of the (\d+)\./.exec(doc);
    expect(match).not.toBeNull();

    const named = Number(match![1]);
    const debtTotal = Number(match![2]);

    expect(mechanismCounts.reduce((sum, n) => sum + n, 0)).toBe(named);
    // The named mechanisms are a subset of the integration debt, never more.
    expect(named).toBeLessThanOrEqual(debtTotal);
    expect(debtTotal).toBe(totalsRow[0]![1]);
  });

  it('describes the same tree the ratchet baseline pins', () => {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as { findings: unknown[] };
    expect(baseline.findings).toHaveLength(totalsRow[0]!.at(-1)!);
  });

  it('names the ref and the date it was measured on', () => {
    // CLAUDE.md: an undated measurement in the present tense will be read as
    // current for as long as it survives.
    expect(doc).toMatch(/Measured at `[0-9a-f]{7,40}` on \d{4}-\d{2}-\d{2}/);
  });
});
