/*
 * Multiverse Mages — W99: the tradition and founding-species tables, from run
 * records, with the between-arm spread put beside the between-seed spread.
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
 * ## What this reports that a per-arm table cannot
 *
 * An arm-by-arm table of means invites the reading *"orc is worse than gnome"*
 * from any two numbers that differ. Whether they differ **by more than the same
 * arm differs from itself across seeds** is a separate question, and it is the
 * one that decides whether a factor is worth gating on. So every metric here is
 * reported three ways:
 *
 * 1. **Per arm**, mean ± standard error, which is the familiar table.
 * 2. **Paired against the control arm**, seed by seed. A run seed is
 *    `f(rootSeed, sweepId, cellIndex, replicateIndex)` and every arm in this
 *    family is a one-level file sharing a `sweepId` and a `rootSeed`, so run *r*
 *    of one arm is the *same universe* as run *r* of another under a different
 *    level. Pairing removes the between-universe variance that dominates the
 *    unpaired standard errors, and it is only legitimate because the CRN check
 *    below verifies it rather than assuming it.
 * 3. **Between-arm spread against within-arm spread**, stratified by strategy.
 *    This is the containment shape: `sd_between` is the spread of the arm means
 *    and `sd_within` is the spread across seeds inside one arm, and a factor
 *    whose `sd_between` sits under its `sd_within` is a factor a gate would be
 *    reading noise from.
 *
 * The stratification is not optional. Strategies are assigned round-robin over
 * `replicateIndex`, and `permissive-breadth` and `passive-control` differ by two
 * hundred nodes, so an unstratified within-arm variance is mostly a measurement
 * of the bot pool and would swamp any factor effect that exists.
 *
 *     node scripts/w99-analyse.mjs --control <dir> --arm <label>=<dir> [--arm ...]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** `metrics-registry.ts`'s pinned `ascensionRate`: these three are the denominator. */
const DENOMINATOR_STATUSES = new Set(['ascended', 'stagnated', 'truncated']);

const METRICS = [
  ['referenceNodesKnown', 'nodes known'],
  ['referenceLibraryDepth', 'library depth'],
  ['referenceGrimoires', 'grimoires'],
  ['referenceKnowledgeInstances', 'instances'],
  ['referenceLivingMages', 'living mages'],
  ['referencePopulation', 'population'],
];

function loadArm(label, directory) {
  const runsFile = readdirSync(directory).find((name) => name.endsWith('.runs.ndjson'));
  if (runsFile === undefined) throw new Error(`No .runs.ndjson in ${directory}`);
  const runs = readFileSync(join(directory, runsFile), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  return { label, directory, runs };
}

const metricOf = (run, id) => {
  const entry = run.metrics?.[id];
  const value = entry === undefined || entry === null ? undefined : entry.value ?? entry;
  return typeof value === 'number' ? value : undefined;
};

function meanSe(values) {
  const n = values.length;
  if (n === 0) return { mean: Number.NaN, se: Number.NaN, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, se: 0, n };
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n), n };
}

const sd = (values) => {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
};

/** `ascensionRate` as `metrics-registry.ts` pins it. Failed runs are excluded and counted. */
function ascension(runs) {
  let ascended = 0;
  let denominator = 0;
  let failed = 0;
  const byStatus = {};
  for (const run of runs) {
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    if (run.status === 'failed') failed += 1;
    if (DENOMINATOR_STATUSES.has(run.status)) denominator += 1;
    if (run.status === 'ascended') ascended += 1;
  }
  return { ascended, denominator, failed, byStatus, rate: denominator === 0 ? null : ascended / denominator };
}

// --------------------------------------------------------------------------
// Arguments
// --------------------------------------------------------------------------

const argv = process.argv.slice(2);
let controlSpec;
const armSpecs = [];
let title = 'W99';
for (let i = 0; i < argv.length; i += 2) {
  const flag = argv[i];
  const value = argv[i + 1];
  if (value === undefined) throw new Error(`Flag ${String(flag)} takes a value.`);
  if (flag === '--control') controlSpec = value;
  else if (flag === '--arm') armSpecs.push(value);
  else if (flag === '--title') title = value;
  else throw new Error(`Unknown flag ${flag}.`);
}
if (controlSpec === undefined) throw new Error('--control <label>=<dir> is required.');

const parse = (spec) => {
  const at = spec.indexOf('=');
  if (at < 0) throw new Error(`Expected <label>=<dir>, received ${spec}.`);
  return loadArm(spec.slice(0, at), spec.slice(at + 1));
};

const control = parse(controlSpec);
const arms = [control, ...armSpecs.map(parse)];

// --------------------------------------------------------------------------
// Common random numbers, checked rather than assumed
// --------------------------------------------------------------------------

console.log(`# ${title}\n`);
console.log('## Common random numbers, verified\n');
{
  const key = (run) => `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;
  const sweepIds = new Set(arms.flatMap((arm) => arm.runs.map((run) => run.coordinates.sweepId)));
  const rootSeeds = new Set(arms.flatMap((arm) => arm.runs.map((run) => run.coordinates.rootSeed)));
  let compared = 0;
  let mismatches = 0;
  const base = new Map(control.runs.map((run) => [key(run), run]));
  for (const arm of arms.slice(1)) {
    for (const run of arm.runs) {
      const other = base.get(key(run));
      if (other === undefined) continue;
      compared += 1;
      if (other.runSeed !== run.runSeed || other.strategies[0] !== run.strategies[0]) mismatches += 1;
    }
  }
  const levels = new Set(arms.map((arm) => JSON.stringify(arm.runs[0]?.levels ?? {})));
  console.log(`    arms compared against the control: ${String(arms.length - 1)}`);
  console.log(`    (cellIndex, replicateIndex) pairs compared: ${String(compared)}`);
  console.log(`    seed or strategy mismatches: ${String(mismatches)}`);
  console.log(`    distinct sweepIds: ${[...sweepIds].join(', ')}`);
  console.log(`    distinct rootSeeds: ${[...rootSeeds].join(', ')}`);
  console.log(`    distinct factor levels across arms: ${String(levels.size)} of ${String(arms.length)}`);
  if (mismatches > 0) console.log('    ** CRN BROKEN — the paired tables below are not licensed **');
}

// --------------------------------------------------------------------------
// Strategy coverage
// --------------------------------------------------------------------------

console.log('\n## Strategy coverage\n');
for (const arm of arms) {
  const counts = new Map();
  for (const run of arm.runs) counts.set(run.strategies[0], (counts.get(run.strategies[0]) ?? 0) + 1);
  const values = [...counts.values()];
  const balanced = values.every((v) => v === values[0]);
  console.log(
    `    ${arm.label.padEnd(14)} ${String(arm.runs.length).padStart(4)} runs, ` +
      `${String(counts.size)} strategies, ${balanced ? 'BALANCED' : '** UNBALANCED **'}`,
  );
}

// --------------------------------------------------------------------------
// Table 1 — per arm
// --------------------------------------------------------------------------

console.log('\n## Table 1 — per arm\n');
console.log(`| arm | n | ascended/denom | ascensionRate | ${METRICS.map(([, name]) => name).join(' | ')} |`);
console.log(`|---|---|---|---|${METRICS.map(() => '---').join('|')}|`);
for (const arm of arms) {
  const a = ascension(arm.runs);
  const cells = METRICS.map(([id]) => {
    const { mean, se } = meanSe(arm.runs.map((run) => metricOf(run, id)).filter((v) => v !== undefined));
    return `${mean.toFixed(2)} ±${se.toFixed(2)}`;
  });
  console.log(
    `| **${arm.label}** | ${String(arm.runs.length)} | ${String(a.ascended)}/${String(a.denominator)} | ` +
      `${a.rate === null ? 'n/a' : a.rate.toFixed(4)} | ${cells.join(' | ')} |`,
  );
}

console.log('\n### Terminal status counts\n');
for (const arm of arms) {
  const a = ascension(arm.runs);
  console.log(`    ${arm.label.padEnd(14)} ${JSON.stringify(a.byStatus)}${a.failed > 0 ? `  (failed excluded from the rate: ${String(a.failed)})` : ''}`);
}

// --------------------------------------------------------------------------
// Table 2 — paired against the control
// --------------------------------------------------------------------------

console.log(`\n## Table 2 — paired differences against \`${control.label}\`, same seed and same strategy\n`);
console.log('`**` marks a paired mean more than three paired standard errors from zero.\n');
console.log(`| arm | ${METRICS.map(([, name]) => name).join(' | ')} | ascended Δ |`);
console.log(`|---|${METRICS.map(() => '---').join('|')}|---|`);
{
  const key = (run) => `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;
  const base = new Map(control.runs.map((run) => [key(run), run]));
  const baseAsc = ascension(control.runs).ascended;
  for (const arm of arms.slice(1)) {
    const cells = METRICS.map(([id]) => {
      const deltas = [];
      for (const run of arm.runs) {
        const other = base.get(key(run));
        const a = metricOf(run, id);
        const b = other === undefined ? undefined : metricOf(other, id);
        if (a !== undefined && b !== undefined) deltas.push(a - b);
      }
      const { mean, se } = meanSe(deltas);
      const strong = se > 0 && Math.abs(mean) > 3 * se;
      return `${mean >= 0 ? '+' : ''}${mean.toFixed(2)} ±${se.toFixed(2)}${strong ? ' **' : ''}`;
    });
    const asc = ascension(arm.runs).ascended;
    console.log(`| ${arm.label} | ${cells.join(' | ')} | ${asc - baseAsc >= 0 ? '+' : ''}${String(asc - baseAsc)} (${String(asc)} vs ${String(baseAsc)}) |`);
  }
}

// --------------------------------------------------------------------------
// Table 3 — between-arm spread against within-arm spread
// --------------------------------------------------------------------------

console.log('\n## Table 3 — between-arm spread against between-seed spread, stratified by strategy\n');
console.log(
  '`sd_between` is the standard deviation of the per-arm means inside one strategy; `sd_within` is\n' +
    'the standard deviation across seeds inside one arm, pooled over arms. A ratio below 1 means the\n' +
    'factor moves the metric less than the seed does, and a gate reading it would be reading noise.\n',
);
{
  const strategies = [...new Set(arms.flatMap((arm) => arm.runs.map((run) => run.strategies[0])))].sort();
  for (const [id, name] of METRICS) {
    console.log(`\n### ${name}\n`);
    console.log('| strategy | sd_between | sd_within | ratio | arm means (low → high) |');
    console.log('|---|---|---|---|---|');
    const ratios = [];
    for (const strategy of strategies) {
      const perArm = arms.map((arm) => ({
        label: arm.label,
        values: arm.runs
          .filter((run) => run.strategies[0] === strategy)
          .map((run) => metricOf(run, id))
          .filter((v) => v !== undefined),
      }));
      if (perArm.some((entry) => entry.values.length < 2)) continue;
      const means = perArm.map((entry) => entry.values.reduce((a, b) => a + b, 0) / entry.values.length);
      const sdBetween = sd(means);
      // Pooled within-arm variance, the ANOVA denominator.
      let ss = 0;
      let df = 0;
      for (let i = 0; i < perArm.length; i += 1) {
        const values = perArm[i].values;
        ss += values.reduce((a, b) => a + (b - means[i]) ** 2, 0);
        df += values.length - 1;
      }
      const sdWithin = df === 0 ? 0 : Math.sqrt(ss / df);
      const ratio = sdWithin === 0 ? (sdBetween === 0 ? 0 : Infinity) : sdBetween / sdWithin;
      ratios.push(ratio);
      const ordered = perArm
        .map((entry, i) => ({ label: entry.label, mean: means[i] }))
        .sort((a, b) => a.mean - b.mean)
        .map((entry) => `${entry.label} ${entry.mean.toFixed(1)}`)
        .join(', ');
      console.log(
        `| ${strategy} | ${sdBetween.toFixed(2)} | ${sdWithin.toFixed(2)} | ` +
          `**${Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}** | ${ordered} |`,
      );
    }
    const finite = ratios.filter((r) => Number.isFinite(r));
    if (finite.length > 0) {
      const above = finite.filter((r) => r >= 1).length;
      console.log(
        `\n    median ratio ${finite.sort((a, b) => a - b)[Math.floor(finite.length / 2)].toFixed(2)}; ` +
          `${String(above)} of ${String(finite.length)} strategies have sd_between >= sd_within`,
      );
    }
  }
}

// --------------------------------------------------------------------------
// Per-strategy ascension, which is where a factor would reorder the game
// --------------------------------------------------------------------------

console.log('\n## Table 4 — ascensions per strategy, per arm\n');
{
  const strategies = [...new Set(arms.flatMap((arm) => arm.runs.map((run) => run.strategies[0])))].sort();
  console.log(`| strategy | ${arms.map((arm) => arm.label).join(' | ')} |`);
  console.log(`|---|${arms.map(() => '---').join('|')}|`);
  for (const strategy of strategies) {
    const cells = arms.map((arm) => {
      const runs = arm.runs.filter((run) => run.strategies[0] === strategy);
      const a = ascension(runs);
      return `${String(a.ascended)}/${String(runs.length)}`;
    });
    console.log(`| ${strategy} | ${cells.join(' | ')} |`);
  }
  console.log(`\n### nodes known per strategy, per arm\n`);
  console.log(`| strategy | ${arms.map((arm) => arm.label).join(' | ')} |`);
  console.log(`|---|${arms.map(() => '---').join('|')}|`);
  for (const strategy of strategies) {
    const cells = arms.map((arm) => {
      const values = arm.runs
        .filter((run) => run.strategies[0] === strategy)
        .map((run) => metricOf(run, 'referenceNodesKnown'))
        .filter((v) => v !== undefined);
      const { mean, se } = meanSe(values);
      return `${mean.toFixed(1)} ±${se.toFixed(1)}`;
    });
    console.log(`| ${strategy} | ${cells.join(' | ')} |`);
  }
}
