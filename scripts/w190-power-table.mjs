/*
 * Multiverse Mages — rewrite balance/README.md's power table from the baselines.
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
 * `gate-power.test.ts` recomputes every cell of the published power table from
 * the committed baselines, so re-recording a baseline moves the table and the
 * table has to move with it. This is that edit, done by the same arithmetic the
 * test uses — `tolerance / |value|` — rather than by hand.
 *
 * ## It is scoped to one table, and that is the whole of the design
 *
 * The first version of this matched every line in `balance/README.md` of the
 * shape `` | `referenceX` | … | ``, and there are **four** such tables in that
 * file: the power table, a ratio table whose cells read `15.1x`, a
 * before-and-after table with a `sign change` column, and a per-arm spread
 * table. It rewrote 27 rows across all of them, replacing ratios and deltas
 * with MDE percentages — every one of them well-formed, plausible, and about
 * the wrong quantity.
 *
 * That is `CLAUDE.md`'s *"a checker that answers about the wrong input"* in the
 * writing direction, and the fix is the same one: locate the target **by name**
 * — the section heading, and the `| runs |` row that ends the table — rather
 * than by shape.
 *
 *     node scripts/w190-power-table.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);

/** The four gates, in the column order the published table uses. */
const GATES = [
  'balance/baselines/balance-gate-v1.baseline.json',
  'balance/baselines/balance-gate-horizon-v1.baseline.json',
  'balance/baselines/balance-gate-agency-v1.baseline.json',
  'balance/baselines/balance-gate-ascension-v1.baseline.json',
];

const HEADING = '## What each gate can actually detect — the power table';
/** The first row after the metric rows. The table ends here. */
const TERMINATOR = '| runs |';

const read = (path) => readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');

const baselines = GATES.map((path) => JSON.parse(read(path)));

/** `tolerance / |value|` as a percentage, or `null` for the em dash. */
function mdePercent(baseline, metricId) {
  const entry = baseline.metrics.find((metric) => metric.metricId === metricId);
  if (entry === undefined || entry.status !== 'measured' || entry.value === 0) return null;
  return (entry.tolerance / Math.abs(entry.value)) * 100;
}

const readmePath = fileURLToPath(new URL('balance/README.md', ROOT));
const lines = readFileSync(readmePath, 'utf8').split('\n');

const start = lines.findIndex((line) => line.startsWith(HEADING));
if (start < 0) {
  console.error(`"${HEADING}" is not in balance/README.md, so there is no table to rewrite.`);
  process.exit(2);
}
const end = lines.findIndex((line, at) => at > start && line.startsWith(TERMINATOR));
if (end < 0) {
  console.error(`No "${TERMINATOR}" row after the heading, so the table's end is unknown.`);
  process.exit(2);
}

let changed = 0;
for (let at = start; at < end; at += 1) {
  const match = /^\| `(reference[A-Za-z]+)` \| (.*) \|$/u.exec(lines[at]);
  if (match === null) continue;
  const cells = baselines.map((baseline) => {
    const value = mdePercent(baseline, match[1]);
    return value === null ? '—' : `${value.toFixed(1)} %`;
  });
  const next = `| \`${match[1]}\` | ${cells.join(' | ')} |`;
  if (next === lines[at]) continue;
  console.log(`  ${match[1]}\n    was ${lines[at]}\n    now ${next}`);
  lines[at] = next;
  changed += 1;
}

writeFileSync(readmePath, lines.join('\n'));
console.log(`${String(changed)} row(s) rewritten between line ${String(start + 1)} and ${String(end + 1)}.`);
