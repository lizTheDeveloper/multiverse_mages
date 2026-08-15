/*
 * Multiverse Mages — integration round 2: the D1–D9 table, from run records.
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
 * Reads a sweep's `.runs.ndjson` and `.summary.json` and reports the campaign's
 * acceptance criteria with numbers.
 *
 * Three things it does that a naive reader would not, each because this campaign
 * has already been burned by the alternative:
 *
 * 1. **It asserts strategy coverage before it reports anything.** Round-robin
 *    assignment is `strategies[replicateIndex % poolSize]` and `cellIndex` does
 *    not enter it, so a replicate count that does not divide the pool silently
 *    measures a subset. That is how W6's calibration scan came to run six of
 *    eight strategies and pick a constant from it.
 * 2. **It reports D2 twice** — against `uniform-random-legal`, which is the
 *    criterion as written, and against `idle-then-declare`, which is the honest
 *    idle control. `uniform-random-legal` submits actions 1–7 without the
 *    parameter they need, so seven of its fifteen verbs are inert.
 * 3. **It reports Spearman beside Pearson for D4**, with the count of strategies
 *    at a non-zero rate, because a correlation over one outlier and seven ties
 *    is arithmetic rather than evidence.
 *
 *     node scripts/integration-r2-analyse.mjs <results-dir> [<results-dir> ...]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const PROBES = new Set(['idle-then-declare', 'permit-then-idle']);
const EXPLOIT_PROBE = 'uniform-random-legal';
const HONEST_PROBE = 'idle-then-declare';
const BAND = { min: 0.05, max: 0.2 };

function loadArm(directory) {
  const files = readdirSync(directory);
  const matches = files.filter((name) => name.endsWith('.runs.ndjson'));
  if (matches.length > 1) {
    throw new Error(
      `${directory} holds ${String(matches.length)} run files (${matches.join(', ')}). ` +
        'The harness numbers executions rather than overwriting them, so this directory has been ' +
        'swept more than once — and picking one by readdir order would report a measurement of a ' +
        'run nobody chose. Point at a directory holding one execution.',
    );
  }
  const runsFile = matches[0];
  const summaryFile = files.find((name) => name.endsWith('.summary.json'));
  if (runsFile === undefined) throw new Error(`No .runs.ndjson in ${directory}`);
  const runs = readFileSync(join(directory, runsFile), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const summary =
    summaryFile === undefined
      ? undefined
      : JSON.parse(readFileSync(join(directory, summaryFile), 'utf8'));
  return { runs, summary, directory };
}

/** Mean, and the standard error of that mean. */
function meanSe(values) {
  const n = values.length;
  if (n === 0) return { mean: Number.NaN, se: Number.NaN, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { mean, se: 0, n };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n), n };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return Number.NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx === 0 || dy === 0 ? Number.NaN : num / Math.sqrt(dx * dy);
}

/** Average ranks, so ties do not invent an ordering. */
function ranks(values) {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const out = new Array(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[indexed[k].index] = rank;
    i = j + 1;
  }
  return out;
}

function spearman(xs, ys) {
  return pearson(ranks(xs), ranks(ys));
}

function metricOf(run, id) {
  const entry = run.metrics?.[id];
  if (entry === undefined || entry === null) return undefined;
  const value = typeof entry === 'object' ? entry.value : entry;
  return typeof value === 'number' ? value : undefined;
}

function analyse(arm, label) {
  const { runs, summary } = arm;
  const byStrategy = new Map();
  for (const run of runs) {
    const strategy = run.strategies?.[0] ?? '(none)';
    if (!byStrategy.has(strategy)) byStrategy.set(strategy, []);
    byStrategy.get(strategy).push(run);
  }

  const out = [];
  out.push(`\n${'='.repeat(78)}\nARM: ${label}   (${runs.length} runs)\n${'='.repeat(78)}`);

  // ---- Coverage, first, before any aggregate is trusted (V1). ----------------
  const counts = [...byStrategy.entries()]
    .map(([strategy, list]) => [strategy, list.length])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const distinct = new Set(counts.map(([, n]) => n));
  out.push('\n-- strategy coverage (asserted before anything else is reported) --');
  for (const [strategy, n] of counts) out.push(`   ${strategy.padEnd(24)} ${String(n).padStart(4)}`);
  const balanced = distinct.size === 1;
  out.push(
    `   => ${counts.length} strategies, ${balanced ? 'BALANCED' : '**UNBALANCED — aggregates below are over a subset**'}`,
  );

  // ---- Per-strategy table ----------------------------------------------------
  const rows = [];
  for (const [strategy, list] of byStrategy) {
    const counted = list.filter((run) => ['ascended', 'stagnated', 'truncated'].includes(run.status));
    const ascended = counted.filter((run) => run.status === 'ascended').length;
    const rate = counted.length === 0 ? Number.NaN : ascended / counted.length;
    const nodes = meanSe(
      list.map((run) => metricOf(run, 'referenceNodesKnown')).filter((v) => v !== undefined),
    );
    const depth = meanSe(
      list.map((run) => metricOf(run, 'referenceLibraryDepth')).filter((v) => v !== undefined),
    );
    const books = meanSe(
      list.map((run) => metricOf(run, 'referenceGrimoires')).filter((v) => v !== undefined),
    );
    rows.push({ strategy, n: list.length, ascended, counted: counted.length, rate, nodes, depth, books });
  }
  rows.sort((a, b) => b.rate - a.rate || a.strategy.localeCompare(b.strategy));

  out.push('\n-- per strategy --');
  out.push(
    `   ${'strategy'.padEnd(24)} ${'asc/n'.padStart(9)} ${'rate'.padStart(7)} ${'nodes'.padStart(9)} ${'±SE'.padStart(7)} ${'libDepth'.padStart(9)} ${'books'.padStart(9)}`,
  );
  for (const row of rows) {
    const tag = PROBES.has(row.strategy) ? ' [probe]' : '';
    out.push(
      `   ${row.strategy.padEnd(24)} ${`${row.ascended}/${row.counted}`.padStart(9)} ${row.rate.toFixed(4).padStart(7)} ${row.nodes.mean.toFixed(1).padStart(9)} ${row.nodes.se.toFixed(2).padStart(7)} ${row.depth.mean.toFixed(2).padStart(9)} ${row.books.mean.toFixed(0).padStart(9)}${tag}`,
    );
  }

  // ---- D1 -------------------------------------------------------------------
  const overall = (subset) => {
    const list = rows.filter((row) => subset.has(row.strategy));
    const asc = list.reduce((sum, row) => sum + row.ascended, 0);
    const den = list.reduce((sum, row) => sum + row.counted, 0);
    return den === 0 ? Number.NaN : asc / den;
  };
  const all = new Set(rows.map((row) => row.strategy));
  const eight = new Set([...all].filter((s) => !PROBES.has(s)));
  const rateAll = overall(all);
  const rateEight = overall(eight);
  const inBand = (r) => r >= BAND.min && r <= BAND.max;
  out.push('\n-- D1  ascensionRate inside 0.05-0.20 --');
  out.push(
    `   with probes (pool of ${all.size}):    ${rateAll.toFixed(4)}   ${inBand(rateAll) ? 'IN BAND' : '**OUT OF BAND**'}`,
  );
  out.push(
    `   without probes (pool of ${eight.size}): ${rateEight.toFixed(4)}   ${inBand(rateEight) ? 'IN BAND' : '**OUT OF BAND**'}`,
  );

  // ---- D2, twice ------------------------------------------------------------
  const rateOf = (id) => rows.find((row) => row.strategy === id)?.rate ?? Number.NaN;
  out.push('\n-- D2  exploit margin >= 0.05 --');
  for (const [probe, note] of [
    [EXPLOIT_PROBE, 'the criterion as written'],
    [HONEST_PROBE, 'the honest idle control'],
  ]) {
    const probeRate = rateOf(probe);
    const poolIds = [...all].filter((s) => s !== probe);
    const poolRate = overall(new Set(poolIds));
    const margin = poolRate - probeRate;
    out.push(
      `   vs ${probe.padEnd(22)} probe ${probeRate.toFixed(4)}  pool ${poolRate.toFixed(4)}  margin ${margin >= 0 ? '+' : ''}${margin.toFixed(4)}  ${margin >= 0.05 ? 'PASS' : 'FAIL'}   (${note})`,
    );
  }
  out.push(
    '   NOTE: while the probe loses, exploitMargin is identically ascensionRate - probeRate,',
  );
  out.push('         so D2 adds no information to D1. Reported, not counted twice.');

  // ---- D3 -------------------------------------------------------------------
  const winners = rows.filter((row) => row.ascended > 0);
  const totalWins = rows.reduce((sum, row) => sum + row.ascended, 0);
  out.push('\n-- D3  >=3 strategies winning at materially different rates, none above 60% of wins --');
  out.push(`   strategies with >0 ascensions: ${winners.length} of ${rows.length}`);
  if (totalWins > 0) {
    const shares = winners
      .map((row) => [row.strategy, row.ascended / totalWins])
      .sort((a, b) => b[1] - a[1]);
    for (const [strategy, share] of shares) {
      out.push(`     ${strategy.padEnd(24)} ${(share * 100).toFixed(1)}% of wins`);
    }
    const top = shares[0]?.[1] ?? 0;
    out.push(
      `   top share ${(top * 100).toFixed(1)}%  => ${winners.length >= 3 && top <= 0.6 ? 'PASS' : 'FAIL'}`,
    );
  } else {
    out.push('   no ascensions at all in this arm');
  }

  // ---- D4 -------------------------------------------------------------------
  const usable = rows.filter((row) => Number.isFinite(row.rate) && Number.isFinite(row.nodes.mean));
  const xs = usable.map((row) => row.rate);
  const ys = usable.map((row) => row.nodes.mean);
  const nonZero = usable.filter((row) => row.rate > 0).length;
  out.push('\n-- D4  correlation between ascension rate and nodes known > 0 --');
  out.push(`   Pearson  ${pearson(xs, ys).toFixed(4)}`);
  out.push(`   Spearman ${spearman(xs, ys).toFixed(4)}`);
  out.push(
    `   strategies at a non-zero rate: ${nonZero} of ${usable.length}  ${nonZero <= 2 ? '<- a correlation over this many ties is arithmetic, not evidence' : ''}`,
  );

  // ---- D5 -------------------------------------------------------------------
  out.push('\n-- D5  knowledgeHalfLife falls, and nodes counted leaving the universe --');
  const halfLife = runs.some((run) => metricOf(run, 'knowledgeHalfLife') !== undefined);
  out.push(
    `   knowledgeHalfLife: ${halfLife ? 'present' : 'INSTRUMENT ABSENT — per-run metric, and a sweep may name only the ten reference* measures;'}`,
  );
  if (!halfLife) {
    out.push(
      '     underneath that, CensusSample carries nodesKnown as an aggregate count and no node-id',
    );
    out.push('     list, so the Kaplan-Meier estimator over node cohorts has no input.');
  }
  const gained = meanSe(
    runs.map((run) => metricOf(run, 'referenceNodesGained')).filter((v) => v !== undefined),
  );
  const known = meanSe(
    runs.map((run) => metricOf(run, 'referenceNodesKnown')).filter((v) => v !== undefined),
  );
  out.push(
    `   nodes gained ${gained.mean.toFixed(2)}  nodes known ${known.mean.toFixed(2)}  => net leaving ${(gained.mean - known.mean + 2.5).toFixed(2)} (gained-known offset by the founding grant)`,
  );

  // ---- D6 -------------------------------------------------------------------
  const passive = rows.find((row) => row.strategy === 'passive-control');
  out.push('\n-- D6  no strategy wins at the passive knowledge baseline --');
  if (passive !== undefined) {
    out.push(`   passive-control nodes known: ${passive.nodes.mean.toFixed(2)} ± ${passive.nodes.se.toFixed(2)}`);
    const atBaseline = rows.filter(
      (row) => row.ascended > 0 && row.nodes.mean <= passive.nodes.mean + 3 * passive.nodes.se,
    );
    out.push(
      `   strategies that ascend while at/below that baseline: ${atBaseline.length === 0 ? 'none — PASS' : atBaseline.map((r) => `${r.strategy} (${r.nodes.mean.toFixed(1)})`).join(', ')}`,
    );
  }

  // ---- capitalSnowball, from arm metrics --------------------------------------
  out.push('\n-- capitalSnowball (guard: its sibling worshipSnowball is held to <= 0.35) --');
  const armMetrics = summary?.armMetrics ?? summary?.arms?.[0]?.armMetrics;
  for (const id of ['capitalSnowball', 'worshipSnowball', 'ascensionRate']) {
    const entry = armMetrics?.[id];
    if (entry === undefined) {
      out.push(`   ${id.padEnd(18)} (not in summary)`);
    } else {
      out.push(
        `   ${id.padEnd(18)} ${entry.status === 'measured' ? String(entry.value) : entry.status}`,
      );
    }
  }

  out.push('\n-- terminal status counts --');
  const statuses = {};
  for (const run of runs) statuses[run.status] = (statuses[run.status] ?? 0) + 1;
  out.push(`   ${JSON.stringify(statuses)}`);

  return out.join('\n');
}

const directories = process.argv.slice(2);
if (directories.length === 0) {
  process.stderr.write('usage: node scripts/integration-r2-analyse.mjs <results-dir> ...\n');
  process.exit(1);
}
for (const directory of directories) {
  try {
    const arm = loadArm(directory);
    process.stdout.write(`${analyse(arm, directory)}\n`);
  } catch (error) {
    process.stderr.write(`${directory}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
