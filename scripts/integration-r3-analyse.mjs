/*
 * Multiverse Mages — integration round 3: D1–D9 under the repaired instrument.
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
 * Reads each arm's `.runs.ndjson` and reports the campaign's acceptance
 * criteria with numbers.
 *
 * The one structural difference from `integration-r2-analyse.mjs`, and the
 * reason this file exists rather than an edit to that one: **the scored
 * quantities come from `scoreBalance` itself**, imported from the harness,
 * rather than being recomputed here. Round 2's reporter reimplemented the
 * exploit margin, and reimplementing a metric is how a campaign ends up with
 * two definitions of it. W18 repaired the scorer; a reporter that recomputes
 * the old arithmetic would report the old numbers under the new name.
 *
 * What that buys, concretely:
 *
 * - `exploitMargin` is W18's — the **mean of the deliberate strategies** minus
 *   the **worst** of the three probes — and is compared against
 *   `EXPLOIT_MARGIN_MIN` (0.10), not against 0.05.
 * - The correlation term reports Pearson, Spearman and `nonZeroStrategies`, and
 *   counts for nothing below `CORRELATION_MIN_SUPPORT` winners.
 * - Coverage is asserted before any aggregate is printed, because round-robin
 *   assignment is `strategies[replicateIndex % poolSize]` and a replicate count
 *   that does not divide the pool silently measures a subset.
 *
 * Every criterion is reported as **failed** or **saturated**, never merely
 * "fail". They are different findings and only one of them is about the game: a
 * criterion fails when it is measurable and the answer is no, and it is
 * saturated when the measured vector has no variance left for it to read.
 *
 *     node scripts/integration-r3-analyse.mjs <results-dir> [<results-dir> ...]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';

import {
  CORRELATION_MIN_SUPPORT,
  EXPLOIT_MARGIN_MIN,
  EXPLOIT_PROBES,
  scoreBalance,
} from '../packages/mc-harness/dist/index.js';

/** The weights and band `tune-balance.mjs` scores with, so this reports the same number it does. */
const WEIGHTS = { variety: 1, correlation: 1, exploit: 1 };
const BAND = { min: 0.05, max: 0.2 };

/** The two adversarial probes the brief names. `uniform-random-legal` is the third, historical one. */
const ADVERSARIAL = ['permit-then-idle', 'idle-then-declare'];

/** Terminal statuses that count as a completed run for rate purposes. */
const COUNTED = ['ascended', 'stagnated', 'truncated'];

function loadArm(directory) {
  const files = readdirSync(directory);
  const runsFile = files.find((name) => name.endsWith('.runs.ndjson'));
  if (runsFile === undefined) throw new Error(`No .runs.ndjson in ${directory}`);
  const runs = readFileSync(join(directory, runsFile), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const summaryFile = files.find((name) => name.endsWith('.summary.json'));
  const summary =
    summaryFile === undefined
      ? undefined
      : JSON.parse(readFileSync(join(directory, summaryFile), 'utf8'));
  return { runs, summary };
}

function meanSe(values) {
  const n = values.length;
  if (n === 0) return { mean: Number.NaN, se: Number.NaN, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { mean, se: 0, n };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n), n };
}

function metricOf(run, id) {
  const entry = run.metrics?.[id];
  if (entry === undefined || entry === null) return undefined;
  const value = typeof entry === 'object' ? entry.value : entry;
  return typeof value === 'number' ? value : undefined;
}

/** Per-strategy rows, and the `StrategyOutcome[]` the real scorer consumes. */
function rowsOf(runs) {
  const byStrategy = new Map();
  for (const run of runs) {
    const strategy = run.strategies?.[0] ?? '(none)';
    if (!byStrategy.has(strategy)) byStrategy.set(strategy, []);
    byStrategy.get(strategy).push(run);
  }
  const rows = [];
  for (const [strategy, list] of byStrategy) {
    const counted = list.filter((run) => COUNTED.includes(run.status));
    const ascended = counted.filter((run) => run.status === 'ascended').length;
    const nodes = meanSe(
      list.map((run) => metricOf(run, 'referenceNodesKnown')).filter((v) => v !== undefined),
    );
    const books = meanSe(
      list.map((run) => metricOf(run, 'referenceGrimoires')).filter((v) => v !== undefined),
    );
    const depth = meanSe(
      list.map((run) => metricOf(run, 'referenceLibraryDepth')).filter((v) => v !== undefined),
    );
    rows.push({
      strategy,
      n: list.length,
      ascended,
      counted: counted.length,
      rate: counted.length === 0 ? Number.NaN : ascended / counted.length,
      nodes,
      books,
      depth,
    });
  }
  rows.sort((a, b) => b.rate - a.rate || a.strategy.localeCompare(b.strategy));
  return rows;
}

function outcomesOf(rows) {
  return rows.map((row) => ({
    strategyId: row.strategy,
    ascended: row.ascended,
    runs: row.counted,
    meanNodesKnown: Number.isFinite(row.nodes.mean) ? row.nodes.mean : 0,
  }));
}

function analyse(label, arm) {
  const { runs, summary } = arm;
  const out = [];
  const rule = '='.repeat(78);
  out.push(`\n${rule}\nARM: ${label}   (${runs.length} runs)\n${rule}`);

  const rows = rowsOf(runs);
  const outcomes = outcomesOf(rows);

  // ---- Coverage, asserted before any aggregate is printed. -------------------
  out.push('\n-- strategy coverage (asserted before anything else is reported) --');
  const counts = rows.map((row) => [row.strategy, row.n]).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [strategy, n] of counts) out.push(`   ${strategy.padEnd(24)} ${String(n).padStart(4)}`);
  const distinct = new Set(counts.map(([, n]) => n));
  const balanced = distinct.size === 1;
  const divides = runs.length % rows.length === 0;
  out.push(
    `   => ${String(rows.length)} strategies, ${String(runs.length)} runs, ` +
      `${runs.length % rows.length === 0 ? `${String(runs.length / rows.length)} each` : 'uneven'}: ` +
      `${balanced && divides ? 'COVERAGE OK' : '**UNBALANCED — every aggregate below is over a subset**'}`,
  );
  const probesPresent = ADVERSARIAL.filter((probe) => rows.some((row) => row.strategy === probe));
  out.push(
    `   adversarial probes present: ${probesPresent.length === ADVERSARIAL.length ? `both (${ADVERSARIAL.join(', ')})` : `**ONLY ${probesPresent.join(', ') || 'NONE'}**`}`,
  );

  // ---- The scored quantities, from the real scorer. ---------------------------
  const score = scoreBalance(outcomes, WEIGHTS, BAND);

  // ---- The headline: the negative control. -----------------------------------
  const rowOf = (id) => rows.find((row) => row.strategy === id);
  out.push('\n-- THE NEGATIVE CONTROL, reported first --');
  for (const probe of ADVERSARIAL) {
    const row = rowOf(probe);
    out.push(
      row === undefined
        ? `   ${probe.padEnd(24)} ABSENT FROM POOL`
        : `   ${probe.padEnd(24)} ${`${row.ascended}/${row.counted}`.padStart(8)}  rate ${row.rate.toFixed(4)}  nodes ${row.nodes.mean.toFixed(1)}`,
    );
  }

  out.push('\n-- per strategy --');
  out.push(
    `   ${'strategy'.padEnd(24)} ${'asc/n'.padStart(9)} ${'rate'.padStart(7)} ${'nodes'.padStart(9)} ${'±SE'.padStart(7)} ${'libDepth'.padStart(9)} ${'books'.padStart(9)}`,
  );
  for (const row of rows) {
    const tag = EXPLOIT_PROBES.includes(row.strategy) ? ' [probe]' : '';
    out.push(
      `   ${row.strategy.padEnd(24)} ${`${row.ascended}/${row.counted}`.padStart(9)} ${row.rate.toFixed(4).padStart(7)} ` +
        `${row.nodes.mean.toFixed(1).padStart(9)} ${row.nodes.se.toFixed(2).padStart(7)} ` +
        `${row.depth.mean.toFixed(2).padStart(9)} ${row.books.mean.toFixed(0).padStart(9)}${tag}`,
    );
  }

  // ---- D1 --------------------------------------------------------------------
  const deliberate = rows.filter((row) => !EXPLOIT_PROBES.includes(row.strategy));
  const rateOver = (list) => {
    const asc = list.reduce((sum, row) => sum + row.ascended, 0);
    const den = list.reduce((sum, row) => sum + row.counted, 0);
    return den === 0 ? Number.NaN : asc / den;
  };
  const rateDeliberate = rateOver(deliberate);
  out.push('\n-- D1  ascensionRate inside 0.05-0.20 --');
  out.push(
    `   whole pool (${String(rows.length)} strategies):  ${score.ascensionRate.toFixed(4)}   ${score.inBand ? 'IN BAND' : '**OUT OF BAND**'}   [scoreBalance]`,
  );
  out.push(
    `   deliberate only (${String(deliberate.length)}):     ${rateDeliberate.toFixed(4)}   ${rateDeliberate >= BAND.min && rateDeliberate <= BAND.max ? 'in band' : '**out of band**'}`,
  );
  out.push(
    '   The gap between those two lines is how much of the band is pool composition rather than ruleset.',
  );

  // ---- D2 --------------------------------------------------------------------
  out.push('\n-- D2  exploit margin (W18: deliberate mean - WORST probe, floor 0.10) --');
  out.push(
    `   deliberate mean ${score.deliberateMean.toFixed(4)}   worst probe ${score.probeRate.toFixed(4)}   ` +
      `margin ${score.exploitMargin >= 0 ? '+' : ''}${score.exploitMargin.toFixed(4)}   ` +
      `${score.exploitMargin >= EXPLOIT_MARGIN_MIN ? 'PASS' : 'FAIL'} against EXPLOIT_MARGIN_MIN ${String(EXPLOIT_MARGIN_MIN)}`,
  );
  const worstProbe = rows
    .filter((row) => EXPLOIT_PROBES.includes(row.strategy))
    .sort((a, b) => b.rate - a.rate)[0];
  if (worstProbe !== undefined) {
    out.push(`   the worst probe is ${worstProbe.strategy} at ${worstProbe.rate.toFixed(4)}`);
    if (worstProbe.rate > 0) {
      out.push(
        '   **D2 CARRIES NO INFORMATION WHILE A PROBE WINS.** A margin computed against a probe that',
      );
      out.push(
        '     is winning measures how far the deliberate strategies are behind an exploit, not whether',
      );
      out.push('     the game rewards play. Read D2 only once the probe rate is 0.');
    }
  }

  // ---- D3 --------------------------------------------------------------------
  const winners = rows.filter((row) => row.ascended > 0);
  const totalWins = rows.reduce((sum, row) => sum + row.ascended, 0);
  out.push('\n-- D3  >=3 strategies winning, none above 60% of wins --');
  out.push(`   strategies with >0 ascensions: ${String(winners.length)} of ${String(rows.length)}`);
  if (totalWins > 0) {
    const shares = winners
      .map((row) => [row.strategy, row.ascended / totalWins])
      .sort((a, b) => b[1] - a[1]);
    for (const [strategy, share] of shares) {
      out.push(`     ${strategy.padEnd(24)} ${(share * 100).toFixed(1)}% of wins`);
    }
    out.push(
      `   top share ${(score.topShare * 100).toFixed(1)}%  variety ${score.variety.toFixed(4)}  => ` +
        `${winners.length >= 3 && score.topShare <= 0.6 ? 'PASS' : 'FAIL'}`,
    );
  } else {
    out.push('   no ascensions at all in this arm');
  }

  // ---- D4 --------------------------------------------------------------------
  out.push('\n-- D4  correlation between ascension rate and nodes known > 0 --');
  out.push(`   Pearson  ${score.correlation.toFixed(4)}`);
  out.push(`   Spearman ${score.spearman.toFixed(4)}`);
  out.push(
    `   strategies at a non-zero rate: ${String(score.nonZeroStrategies)} of ${String(rows.length)}` +
      ` (support gate: ${String(CORRELATION_MIN_SUPPORT)})`,
  );
  out.push(
    score.nonZeroStrategies >= CORRELATION_MIN_SUPPORT
      ? `   supported; the scored term is the weaker coefficient, ${Math.min(score.correlation, score.spearman).toFixed(4)}`
      : `   **UNSUPPORTED — contributes 0 to the score.** Both coefficients are statements about ` +
          `${String(score.nonZeroStrategies)} leveraged point(s).`,
  );

  // ---- D5 --------------------------------------------------------------------
  out.push('\n-- D5  knowledgeHalfLife falls, and nodes counted leaving the universe --');
  const halfLife = runs.some((run) => metricOf(run, 'knowledgeHalfLife') !== undefined);
  out.push(`   knowledgeHalfLife: ${halfLife ? 'present' : 'INSTRUMENT ABSENT'}`);
  const gained = meanSe(
    runs.map((run) => metricOf(run, 'referenceNodesGained')).filter((v) => v !== undefined),
  );
  const known = meanSe(
    runs.map((run) => metricOf(run, 'referenceNodesKnown')).filter((v) => v !== undefined),
  );
  out.push(
    `   nodes gained ${gained.mean.toFixed(2)}   nodes known ${known.mean.toFixed(2)}   ` +
      `difference ${(gained.mean - known.mean).toFixed(2)} (offset by the founding grant, so not a loss count)`,
  );

  // ---- D6 --------------------------------------------------------------------
  const passive = rowOf('passive-control');
  out.push('\n-- D6  no strategy wins at the passive knowledge baseline --');
  if (passive !== undefined) {
    const ceiling = passive.nodes.mean + 3 * passive.nodes.se;
    out.push(
      `   passive-control nodes known: ${passive.nodes.mean.toFixed(2)} ± ${passive.nodes.se.toFixed(2)}  (3-SE ceiling ${ceiling.toFixed(2)})`,
    );
    const atBaseline = winners.filter((row) => row.nodes.mean <= ceiling);
    out.push(
      `   winners at or below that baseline: ${atBaseline.length === 0 ? 'none' : atBaseline.map((r) => `${r.strategy} (${r.nodes.mean.toFixed(1)})`).join(', ')}`,
    );
    const spread = meanSe(deliberate.map((row) => row.nodes.mean));
    out.push(
      `   spread of mean nodes across the ${String(deliberate.length)} deliberate strategies: ` +
        `${Math.min(...deliberate.map((r) => r.nodes.mean)).toFixed(1)} .. ${Math.max(...deliberate.map((r) => r.nodes.mean)).toFixed(1)} ` +
        `(sd ${(spread.se * Math.sqrt(spread.n)).toFixed(2)})`,
    );
  }

  // ---- Arm-scoped metrics -----------------------------------------------------
  out.push('\n-- arm metrics (capitalSnowball guard: its sibling worshipSnowball is held to <= 0.35) --');
  const armMetrics = summary?.armMetrics ?? summary?.arms?.[0]?.armMetrics;
  for (const id of ['ascensionRate', 'capitalSnowball', 'worshipSnowball', 'knowledgeHalfLife', 'libraryDependence']) {
    const entry = armMetrics?.[id];
    out.push(
      `   ${id.padEnd(20)} ${entry === undefined ? '(not in summary)' : entry.status === 'measured' ? String(entry.value) : entry.status}`,
    );
  }

  out.push('\n-- terminal status counts --');
  const statuses = {};
  for (const run of runs) statuses[run.status] = (statuses[run.status] ?? 0) + 1;
  out.push(`   ${JSON.stringify(statuses)}`);

  return { text: out.join('\n'), rows, score, label };
}

/** D7 and D9 are cross-arm questions and cannot be answered inside one arm. */
function crossArm(results) {
  const out = [];
  const rule = '='.repeat(78);
  out.push(`\n${rule}\nCROSS-ARM: D7 and D9\n${rule}`);
  if (results.length < 2) {
    out.push('   only one arm supplied; D7 and D9 need several.');
    return out.join('\n');
  }

  out.push('\n-- D7  varying the founding species mix changes WHICH strategy wins --');
  out.push(
    `   ${'arm'.padEnd(34)} ${'rate'.padStart(7)} ${'winners'.padStart(8)}  top winner`,
  );
  const topWinners = [];
  for (const result of results) {
    const winners = result.rows.filter((row) => row.ascended > 0);
    const top = [...winners].sort((a, b) => b.ascended - a.ascended)[0];
    topWinners.push(top?.strategy);
    out.push(
      `   ${result.label.padEnd(34)} ${result.score.ascensionRate.toFixed(4).padStart(7)} ${String(winners.length).padStart(8)}  ` +
        `${top === undefined ? '(nobody ascends)' : `${top.strategy} (${String(top.ascended)} wins)`}`,
    );
  }
  const identities = new Set(topWinners.filter((id) => id !== undefined));
  out.push(
    `   distinct top-winner identities across arms: ${String(identities.size)} — ${[...identities].join(', ') || '(none)'}`,
  );
  out.push(
    identities.size >= 2
      ? '   => the winner identity MOVES with the arm.'
      : '   => **the winner identity is INVARIANT.** The rate moves; who wins does not.',
  );

  out.push('\n-- D9  more than one viable playstyle available to each species --');
  out.push(
    '   Read from D7: a species arm supports plural play only if two or more distinct strategies',
  );
  out.push('   win a material share within that arm.');
  for (const result of results) {
    const winners = result.rows.filter((row) => row.ascended > 0);
    const total = winners.reduce((sum, row) => sum + row.ascended, 0);
    const material = winners.filter((row) => total > 0 && row.ascended / total >= 0.1);
    out.push(
      `   ${result.label.padEnd(34)} ${String(material.length)} strategies at >=10% of the arm's wins` +
        `${material.length > 0 ? `: ${material.map((r) => r.strategy).join(', ')}` : ''}`,
    );
  }

  return out.join('\n');
}

const directories = process.argv.slice(2);
if (directories.length === 0) {
  process.stderr.write('usage: node scripts/integration-r3-analyse.mjs <results-dir> ...\n');
  process.exit(1);
}
const results = [];
for (const directory of directories) {
  try {
    const result = analyse(basename(directory), loadArm(directory));
    results.push(result);
    process.stdout.write(`${result.text}\n`);
  } catch (error) {
    process.stderr.write(
      `${directory}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}
if (results.length > 0) process.stdout.write(`${crossArm(results)}\n`);
