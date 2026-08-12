/*
 * Multiverse Mages — W21's paired ablation: does timing, or a cost curve, move anything?
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
 * Reads two arms of the same sweep and reports what moved, per strategy.
 *
 * **The negative control is the point.** `permit-then-idle` wins 40/40 on the
 * base branch by pressing two permit buttons for 140 of 2,400 ticks and then
 * submitting an empty preference list forever. If timing and cost curves matter,
 * a bot that ignores both should do measurably worse. If it does not, the
 * mechanic is decorative and this script is how that gets said plainly.
 *
 * Leading indicators are reported beside the win rate on purpose. The campaign
 * has five independent confirmations that terminal outcomes at 2,400 ticks are
 * decided by content exhaustion, and W17's finding was *"much sooner, same
 * place"* — so a win rate that does not move is the expected result and says
 * nothing on its own. What would say something is whether the *trajectory*
 * moved: nodes known, library depth, books written, favor spent.
 *
 *     node scripts/w21-paired.mjs <off-dir> <on-dir>
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function loadArm(directory) {
  const runsFile = readdirSync(directory).find((name) => name.endsWith('.runs.ndjson'));
  if (runsFile === undefined) throw new Error(`No .runs.ndjson in ${directory}`);
  return readFileSync(join(directory, runsFile), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

const METRICS = [
  'referenceNodesKnown',
  'referenceLibraryDepth',
  'referenceGrimoires',
  'referenceKnowledgeInstances',
  'referenceLivingMages',
  'referenceNodesGainedFinalQuarter',
];

function strategyOf(run) {
  return run.strategyId ?? run.strategy ?? run.agent ?? 'unknown';
}

function ascended(run) {
  const reason = run.terminalReason ?? run.outcome?.terminalReason;
  if (typeof reason === 'string') return reason.startsWith('ascension');
  return Boolean(run.ascended ?? run.outcome?.ascended);
}

function metricOf(run, name) {
  return run.metrics?.[name] ?? run[name];
}

function mean(values) {
  const numeric = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return undefined;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function stderr(values) {
  const numeric = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length < 2) return 0;
  const m = mean(numeric);
  const variance =
    numeric.reduce((sum, value) => sum + (value - m) ** 2, 0) / (numeric.length - 1);
  return Math.sqrt(variance / numeric.length);
}

function summarise(runs) {
  const byStrategy = new Map();
  for (const run of runs) {
    const id = strategyOf(run);
    let bucket = byStrategy.get(id);
    if (bucket === undefined) {
      bucket = { runs: [], wins: 0 };
      byStrategy.set(id, bucket);
    }
    bucket.runs.push(run);
    if (ascended(run)) bucket.wins += 1;
  }
  return byStrategy;
}

const [offDir, onDir] = process.argv.slice(2);
if (offDir === undefined || onDir === undefined) {
  console.error('usage: node scripts/w21-paired.mjs <off-dir> <on-dir>');
  process.exit(2);
}

const off = summarise(loadArm(offDir));
const on = summarise(loadArm(onDir));

console.log('='.repeat(78));
console.log('W21 paired ablation — arm OFF (flat envelopes, unease-step 0) vs arm ON (shipped)');
console.log('='.repeat(78));

const strategies = [...new Set([...off.keys(), ...on.keys()])].sort();

console.log('\n-- ascension, the acceptance criterion --');
console.log('   strategy                  off        on       delta');
for (const id of strategies) {
  const a = off.get(id);
  const b = on.get(id);
  if (a === undefined || b === undefined) continue;
  const rateA = a.wins / a.runs.length;
  const rateB = b.wins / b.runs.length;
  console.log(
    `   ${id.padEnd(24)} ${String(a.wins).padStart(2)}/${String(a.runs.length).padEnd(3)} ` +
      `${String(b.wins).padStart(2)}/${String(b.runs.length).padEnd(3)} ` +
      `${(rateB - rateA >= 0 ? '+' : '') + (rateB - rateA).toFixed(4)}`,
  );
}

console.log('\n-- leading indicators (mean ± SE), which is where a null win rate is decided --');
for (const id of strategies) {
  const a = off.get(id);
  const b = on.get(id);
  if (a === undefined || b === undefined) continue;
  console.log(`\n   ${id}`);
  for (const metric of METRICS) {
    const valuesA = a.runs.map((run) => metricOf(run, metric));
    const valuesB = b.runs.map((run) => metricOf(run, metric));
    const meanA = mean(valuesA);
    const meanB = mean(valuesB);
    if (meanA === undefined || meanB === undefined) {
      console.log(`      ${metric.padEnd(34)} unavailable`);
      continue;
    }
    const delta = meanB - meanA;
    const se = Math.sqrt(stderr(valuesA) ** 2 + stderr(valuesB) ** 2);
    // Reported in standard errors as well as absolutely, because "it moved" and
    // "it moved further than the noise" are different claims and this campaign
    // has confused them before.
    const sigma = se > 0 ? (delta / se).toFixed(2) : 'n/a';
    console.log(
      `      ${metric.padEnd(34)} ${meanA.toFixed(2).padStart(10)} -> ${meanB
        .toFixed(2)
        .padStart(10)}   ${(delta >= 0 ? '+' : '') + delta.toFixed(2)}  (${sigma} SE)`,
    );
  }
}

console.log(
  '\nA win rate that does not move is the expected result: the campaign has five independent',
);
console.log(
  'confirmations that terminal outcomes at 2,400 ticks are decided by content exhaustion. The',
);
console.log('question this table answers is whether the trajectory moved.');
