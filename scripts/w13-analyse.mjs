/*
 * Multiverse Mages — W13: read the three tradition arms back and tabulate them.
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
 * Reporting only. It reads the `.runs.ndjson` and `.summary.json` a sweep wrote
 * and prints tables; it runs no simulation and derives no number the harness did
 * not already record, except the per-strategy folds and the standard errors,
 * which are arithmetic over recorded values.
 *
 *     node scripts/w13-analyse.mjs
 */

import { readFileSync } from 'node:fs';

const ARMS = [
  ['Vancian', 'vancian-memorization', 'mc-results/w13-vancian'],
  ['True Naming', 'true-naming', 'mc-results/w13-true-naming'],
  ['Art of Memory', 'art-of-memory', 'mc-results/w13-art-of-memory'],
];

const METRICS = [
  'referenceNodesKnown',
  'referenceKnowledgeInstances',
  'referenceGrimoires',
  'referenceLibraryDepth',
  'referenceLivingMages',
];

function load(dir) {
  const runs = readFileSync(`${dir}/w13-tradition-v1.0.runs.ndjson`, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
  const summary = JSON.parse(readFileSync(`${dir}/w13-tradition-v1.0.summary.json`, 'utf8'));
  return { runs, summary };
}

const mean = (xs) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
function se(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}
function median(xs) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const val = (run, id) => run.metrics[id]?.value ?? NaN;
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

const arms = ARMS.map(([label, key, dir]) => ({ label, key, ...load(dir) }));

// ---- CRN check: identical (cellIndex, replicateIndex) must carry identical seeds.
console.log('## CRN verification\n');
{
  const base = arms[0];
  let mismatches = 0;
  let compared = 0;
  for (const arm of arms.slice(1)) {
    for (let i = 0; i < base.runs.length; i += 1) {
      const a = base.runs[i];
      const b = arm.runs.find(
        (r) =>
          r.coordinates.cellIndex === a.coordinates.cellIndex &&
          r.coordinates.replicateIndex === a.coordinates.replicateIndex,
      );
      compared += 1;
      if (b === undefined || b.runSeed !== a.runSeed || b.strategies[0] !== a.strategies[0]) {
        mismatches += 1;
      }
    }
  }
  console.log(`Compared ${compared} (cellIndex, replicateIndex) pairs across arms.`);
  console.log(`Seed or strategy mismatches: ${mismatches}`);
  console.log(`Distinct sweepIds: ${[...new Set(arms.map((a) => a.summary.sweepId))].join(', ')}`);
  console.log(
    `Levels actually recorded: ${arms.map((a) => `${a.label}=${a.runs[0].levels.tradition}`).join(', ')}`,
  );
  const wrongLevel = arms.filter((a) => a.runs.some((r) => r.levels.tradition !== a.key));
  console.log(`Arms with any run at the wrong tradition level: ${wrongLevel.length}`);
}

// ---- Per-tradition table.
console.log('\n## Per-tradition\n');
const head = [
  'tradition',
  'ascended/n',
  'median asc. tick',
  'apotheosis',
  'canon',
  'stagnated',
  'truncated',
  'nodesKnown',
  'instances',
  'grimoires',
  'libDepth',
  'livingMages',
];
console.log(`| ${head.join(' | ')} |`);
console.log(`|${head.map(() => '---').join('|')}|`);
for (const arm of arms) {
  const r = arm.runs;
  const asc = r.filter((x) => x.status === 'ascended');
  const tr = arm.summary.countsByTerminalReason;
  const cells = [
    arm.label,
    `${asc.length}/${r.length}`,
    f(median(asc.map((x) => x.ticksRun)), 0),
    String(tr.ascensionApotheosis ?? 0),
    String(tr.ascensionCanon ?? 0),
    String(arm.summary.countsByStatus.stagnated ?? 0),
    String(arm.summary.countsByStatus.truncated ?? 0),
    ...METRICS.map((id) => `${f(mean(r.map((x) => val(x, id))))} ±${f(se(r.map((x) => val(x, id))), 1)}`),
  ];
  console.log(`| ${cells.join(' | ')} |`);
}

// ---- Arm metrics.
console.log('\n## §7 arm metrics (from summary.armMetrics)\n');
const armIds = [...new Set(arms.flatMap((a) => Object.keys(a.summary.armMetrics ?? {})))].sort();
console.log(`| metric | ${arms.map((a) => a.label).join(' | ')} |`);
console.log(`|---|${arms.map(() => '---').join('|')}|`);
for (const id of armIds) {
  const cells = arms.map((a) => {
    const m = a.summary.armMetrics?.[id];
    if (m === undefined) return 'absent';
    if (m.status !== 'measured') return m.status;
    return typeof m.value === 'number' ? m.value.toFixed(4) : JSON.stringify(m.value);
  });
  console.log(`| \`${id}\` | ${cells.join(' | ')} |`);
}

// ---- Per-strategy, per-tradition.
console.log('\n## Per strategy\n');
const strategies = [...new Set(arms[0].runs.map((r) => r.strategies[0]))].sort();
for (const arm of arms) {
  console.log(`\n### ${arm.label}\n`);
  const h = ['strategy', 'n', 'asc', 'stag', 'trunc', 'median asc tick', 'nodesKnown', 'instances', 'grimoires', 'libDepth'];
  console.log(`| ${h.join(' | ')} |`);
  console.log(`|${h.map(() => '---').join('|')}|`);
  for (const s of strategies) {
    const r = arm.runs.filter((x) => x.strategies[0] === s);
    const asc = r.filter((x) => x.status === 'ascended');
    console.log(
      `| ${s} | ${r.length} | ${asc.length} | ${r.filter((x) => x.status === 'stagnated').length} | ` +
        `${r.filter((x) => x.status === 'truncated').length} | ${f(median(asc.map((x) => x.ticksRun)), 0)} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceNodesKnown'))))} ±${f(se(r.map((x) => val(x, 'referenceNodesKnown'))))} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceKnowledgeInstances'))), 0)} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceGrimoires'))), 0)} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceLibraryDepth'))), 1)} |`,
    );
  }
}

// ---- Does the strategy space separate? Spread of nodesKnown across strategies.
console.log('\n## Strategy separation on nodesKnown\n');
console.log('| tradition | min | max | spread | distinct groups (>3 SE apart) |');
console.log('|---|---|---|---|---|');
for (const arm of arms) {
  const per = strategies.map((s) => {
    const xs = arm.runs.filter((x) => x.strategies[0] === s).map((x) => val(x, 'referenceNodesKnown'));
    return { s, m: mean(xs), e: se(xs) };
  });
  per.sort((a, b) => a.m - b.m);
  let groups = 1;
  for (let i = 1; i < per.length; i += 1) {
    const gap = per[i].m - per[i - 1].m;
    const pooled = Math.sqrt((per[i].e || 0) ** 2 + (per[i - 1].e || 0) ** 2);
    if (gap > 3 * (pooled || 1e-9)) groups += 1;
  }
  console.log(
    `| ${arm.label} | ${f(per[0].m)} (${per[0].s}) | ${f(per[per.length - 1].m)} (${per[per.length - 1].s}) | ` +
      `${f(per[per.length - 1].m - per[0].m)} | ${groups} |`,
  );
}
