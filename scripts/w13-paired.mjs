/*
 * Multiverse Mages — W13: paired differences between tradition arms.
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
 * Common random numbers are what make this legitimate. Every arm ran the same
 * 96 `(cellIndex, replicateIndex)` coordinates, so run *r* of one arm and run
 * *r* of another are the same universe under two traditions, and their
 * difference removes the between-universe variance that dominates the unpaired
 * standard errors. Reporting only — it reads the records the sweep wrote.
 *
 *     node scripts/w13-paired.mjs
 */

import { readFileSync } from 'node:fs';

const ARMS = {
  vancian: 'mc-results/w13-vancian',
  'true-naming': 'mc-results/w13-true-naming',
  'art-of-memory': 'mc-results/w13-art-of-memory',
};

const load = (dir) =>
  readFileSync(`${dir}/w13-tradition-v1.0.runs.ndjson`, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));

const runs = Object.fromEntries(Object.entries(ARMS).map(([k, d]) => [k, load(d)]));
const key = (r) => `${r.coordinates.cellIndex}:${r.coordinates.replicateIndex}`;
const index = Object.fromEntries(
  Object.entries(runs).map(([k, rs]) => [k, new Map(rs.map((r) => [key(r), r]))]),
);

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function se(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

const PAIRS = [
  ['true-naming', 'vancian'],
  ['art-of-memory', 'true-naming'],
];
const METRICS = ['referenceNodesKnown', 'referenceKnowledgeInstances', 'referenceGrimoires'];

console.log('## Paired differences (same universe, two traditions)\n');
for (const [a, b] of PAIRS) {
  console.log(`\n### ${a} minus ${b}\n`);
  const h = ['scope', ...METRICS.map((m) => m.replace('reference', '')), 'ascended Δ'];
  console.log(`| ${h.join(' | ')} |`);
  console.log(`|${h.map(() => '---').join('|')}|`);
  const strategies = [...new Set(runs[a].map((r) => r.strategies[0]))].sort();
  for (const scope of ['ALL', ...strategies]) {
    const subset = runs[a].filter((r) => scope === 'ALL' || r.strategies[0] === scope);
    const cells = METRICS.map((m) => {
      const d = subset.map(
        (r) => (r.metrics[m]?.value ?? NaN) - (index[b].get(key(r))?.metrics[m]?.value ?? NaN),
      );
      const mu = mean(d);
      const s = se(d);
      const sig = Math.abs(mu) > 3 * s ? ' **' : '';
      return `${f(mu)} ±${f(s)}${sig}`;
    });
    const ascA = subset.filter((r) => r.status === 'ascended').length;
    const ascB = subset.filter((r) => index[b].get(key(r))?.status === 'ascended').length;
    console.log(`| ${scope} | ${cells.join(' | ')} | ${ascA - ascB} (${ascA} vs ${ascB}) |`);
  }
}
console.log('\n`**` marks a paired mean more than 3 paired standard errors from zero.');
