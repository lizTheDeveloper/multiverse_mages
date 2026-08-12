/*
 * Multiverse Mages — W28: read the seven tradition arms back and tabulate them.
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
 * Reporting only. It reads the `.runs.ndjson` and `.summary.json` each arm wrote
 * and prints tables; it runs no simulation and derives no number the harness did
 * not already record, except the folds, the standard errors, and the separation
 * statistic — all arithmetic over recorded values.
 *
 *     node scripts/w28-analyse.mjs
 *
 * Modelled on `scripts/w13-analyse.mjs` so the tables are directly comparable,
 * and extended in one way that matters: the **pre-registered distance test**.
 * W28's acceptance asks whether two new regimes are as far apart as the Art of
 * Memory is from Vancian. That question is meaningless without a definition
 * fixed before the numbers arrive, so the definition lives here, in code, and it
 * was committed in `docs/superpowers/plans/w28-magic-regimes.md` before the
 * sweep was run.
 */

import { readFileSync } from 'node:fs';

const ARMS = [
  ['Vancian', 'vancian-memorization', 'mc-results/w28-vancian'],
  ['True Naming', 'true-naming', 'mc-results/w28-true-naming'],
  ['Art of Memory', 'art-of-memory', 'mc-results/w28-art-of-memory'],
  ['Chorale', 'chorale', 'mc-results/w28-chorale'],
  ['Flesh Codex', 'flesh-codex', 'mc-results/w28-flesh-codex'],
  ['Shared Mind', 'shared-mind', 'mc-results/w28-shared-mind'],
  ["Witch's Bond", 'witch-bond', 'mc-results/w28-witch-bond'],
];

const METRICS = [
  'referenceNodesKnown',
  'referenceKnowledgeInstances',
  'referenceGrimoires',
  'referenceLibraryDepth',
  'referenceLivingMages',
  'referencePopulation',
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
  const wrongLevel = arms.filter((a) => a.runs.some((r) => r.levels.tradition !== a.key));
  console.log(`Arms with any run at the wrong tradition level: ${wrongLevel.length}`);
  console.log(`Replicates per arm: ${arms.map((a) => a.runs.length).join(', ')}`);
}

// ---- Per-tradition table, in W13's shape.
console.log('\n## Per-tradition\n');
const head = [
  'tradition',
  'ascended/n',
  'asc. rate',
  'stagnated',
  'truncated',
  'nodesKnown',
  'instances',
  'grimoires',
  'libDepth',
  'livingMages',
  'population',
];
console.log(`| ${head.join(' | ')} |`);
console.log(`|${head.map(() => '---').join('|')}|`);
for (const arm of arms) {
  const r = arm.runs;
  const asc = r.filter((x) => x.status === 'ascended');
  const cells = [
    arm.label,
    `${asc.length}/${r.length}`,
    (asc.length / r.length).toFixed(4),
    String(arm.summary.countsByStatus.stagnated ?? 0),
    String(arm.summary.countsByStatus.truncated ?? 0),
    ...METRICS.map(
      (id) => `${f(mean(r.map((x) => val(x, id))))} ±${f(se(r.map((x) => val(x, id))), 1)}`,
    ),
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

// ---- The pre-registered distance test.
//
// Seven metrics, exactly the seven W13 tabulated. Six of them have a per-run
// value, so separation is |Δmean| / pooled SE — how many standard errors apart
// two arms are, which is the only scale on which "as far apart" means anything
// when grimoires run to the hundreds and ascension rate is a fraction of one.
// `capitalSnowball` is an arm-scoped statistic with no per-run value and hence
// no SE, so it is compared on the raw absolute difference. That asymmetry is
// stated rather than hidden: it is a property of what the harness records.
console.log('\n## Pre-registered distance test\n');
console.log(
  'Definition, fixed before the sweep: a pair (A,B) qualifies if its separation meets or\n' +
    'exceeds the Art-of-Memory-vs-Vancian separation on at least FOUR of the seven metrics.\n',
);

const perRun = (arm, id) => arm.runs.map((x) => val(x, id));
const ascRates = (arm) => arm.runs.map((x) => (x.status === 'ascended' ? 1 : 0));

const DISTANCE_METRICS = [
  ['ascension rate', (a) => ascRates(a)],
  ['grimoires', (a) => perRun(a, 'referenceGrimoires')],
  ['library depth', (a) => perRun(a, 'referenceLibraryDepth')],
  ['nodes known', (a) => perRun(a, 'referenceNodesKnown')],
  ['living mages', (a) => perRun(a, 'referenceLivingMages')],
  ['population', (a) => perRun(a, 'referencePopulation')],
];

function separations(a, b) {
  const out = {};
  for (const [name, get] of DISTANCE_METRICS) {
    const xa = get(a).filter(Number.isFinite);
    const xb = get(b).filter(Number.isFinite);
    const pooled = Math.sqrt((se(xa) || 0) ** 2 + (se(xb) || 0) ** 2);
    const delta = Math.abs(mean(xa) - mean(xb));
    // A pooled SE of zero with a non-zero difference is infinite separation, and
    // that is the honest answer: two arms that never vary and never agree are as
    // far apart as two arms can be. Zero over zero is zero — they agree exactly.
    out[name] = pooled > 0 ? delta / pooled : delta > 0 ? Infinity : 0;
  }
  const snow = (arm) => arm.summary.armMetrics?.capitalSnowball;
  const sa = snow(a);
  const sb = snow(b);
  out['capitalSnowball'] =
    sa?.status === 'measured' && sb?.status === 'measured' ? Math.abs(sa.value - sb.value) : NaN;
  return out;
}

const byLabel = new Map(arms.map((a) => [a.label, a]));
const reference = separations(byLabel.get('Art of Memory'), byLabel.get('Vancian'));
const NAMES = [...DISTANCE_METRICS.map(([n]) => n), 'capitalSnowball'];

console.log('### The yardstick: Art of Memory vs Vancian\n');
console.log(`| metric | ${NAMES.join(' | ')} |`);
console.log(`|---|${NAMES.map(() => '---').join('|')}|`);
console.log(`| separation | ${NAMES.map((n) => f(reference[n], 2)).join(' | ')} |`);

const NEW = ['Chorale', 'Flesh Codex', 'Shared Mind', "Witch's Bond"];
console.log('\n### Every pair of new regimes, against that yardstick\n');
console.log(`| pair | ${NAMES.join(' | ')} | metrics met | qualifies |`);
console.log(`|---|${NAMES.map(() => '---').join('|')}|---|---|`);
const qualifying = [];
for (let i = 0; i < NEW.length; i += 1) {
  for (let j = i + 1; j < NEW.length; j += 1) {
    const a = byLabel.get(NEW[i]);
    const b = byLabel.get(NEW[j]);
    const s = separations(a, b);
    let met = 0;
    const cells = NAMES.map((n) => {
      const ok = Number.isFinite(reference[n]) || reference[n] === Infinity ? s[n] >= reference[n] : false;
      if (ok) met += 1;
      return `${f(s[n], 2)}${ok ? ' ✓' : ''}`;
    });
    const qualifies = met >= 4;
    if (qualifies) qualifying.push(`${NEW[i]} vs ${NEW[j]} (${met}/7)`);
    console.log(
      `| ${NEW[i]} vs ${NEW[j]} | ${cells.join(' | ')} | ${met}/7 | ${qualifies ? '**YES**' : 'no'} |`,
    );
  }
}

console.log(
  `\n**Pairs of new regimes meeting the pre-registered bar: ${qualifying.length}** ` +
    `${qualifying.length > 0 ? `— ${qualifying.join('; ')}` : ''}`,
);
console.log(
  `\nAcceptance asked for at least one such pair (two regimes as far apart as AoM is from Vancian). ` +
    `${qualifying.length >= 1 ? 'Met.' : 'NOT met.'}`,
);

// ---- Per-strategy, per-tradition.
console.log('\n## Per strategy\n');
const strategies = [...new Set(arms[0].runs.map((r) => r.strategies[0]))].sort();
for (const arm of arms) {
  console.log(`\n### ${arm.label}\n`);
  const h = ['strategy', 'n', 'asc', 'stag', 'trunc', 'nodesKnown', 'instances', 'grimoires', 'libDepth'];
  console.log(`| ${h.join(' | ')} |`);
  console.log(`|${h.map(() => '---').join('|')}|`);
  for (const s of strategies) {
    const r = arm.runs.filter((x) => x.strategies[0] === s);
    const asc = r.filter((x) => x.status === 'ascended');
    console.log(
      `| ${s} | ${r.length} | ${asc.length} | ${r.filter((x) => x.status === 'stagnated').length} | ` +
        `${r.filter((x) => x.status === 'truncated').length} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceNodesKnown'))))} ±${f(se(r.map((x) => val(x, 'referenceNodesKnown'))))} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceKnowledgeInstances'))), 0)} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceGrimoires'))), 0)} | ` +
        `${f(mean(r.map((x) => val(x, 'referenceLibraryDepth'))), 1)} |`,
    );
  }
}

// ---- The three v1 arms, against W13 as published. Read the caveat first.
console.log('\n## The three v1 arms, against W13 as published — NOT a control\n');
console.log(
  'These columns differ, and two known causes are enough to explain any amount of it, so\n' +
    'nothing should be inferred from the size of the gap:\n' +
    '\n' +
    '1. W13 measured on `main` at 6e5ecee. This is `integration/campaign-round-2`, which has\n' +
    '   merged most of a campaign since — including the ascension predicates and the god\n' +
    '   economy. The tree is not the tree W13 measured.\n' +
    "2. Adding four traditions widens the god's action space. Action 13's candidate list is\n" +
    '   "every tradition except the one held" (`agent-api/src/candidates.ts:311`), so it grows\n' +
    '   from 2 entries to 6, and the interned id is written into the observation vector\n' +
    '   (`observation.ts:236`). Every strategy that samples the legal action set therefore\n' +
    '   makes different choices than it did with three traditions. Common random numbers fix\n' +
    '   the seed; they cannot fix the size of the choice set.\n' +
    '\n' +
    'Point 2 is worth stating on its own, because it is a property of the harness rather than\n' +
    "of this workstream: **the tradition axis cannot be swept without also perturbing the god's\n" +
    'action space**, and no arrangement of sweep files isolates that. What remains valid is the\n' +
    'comparison *between the seven arms above*, which all share one content set and therefore\n' +
    'one action space.\n',
);
const W13 = {
  Vancian: { asc: 0.6875, grimoires: 979, nodesKnown: 65.8, population: 6979 },
  'True Naming': { asc: 0.6979, grimoires: 908, nodesKnown: 58.2, population: 7516 },
  'Art of Memory': { asc: 0.125, grimoires: 0, nodesKnown: 17.2, population: 18546 },
};
console.log('| tradition | asc W13 | asc now | grimoires W13 | grimoires now | nodesKnown W13 | nodesKnown now | population W13 | population now |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [label, was] of Object.entries(W13)) {
  const arm = byLabel.get(label);
  const r = arm.runs;
  console.log(
    `| ${label} | ${was.asc.toFixed(4)} | ${(r.filter((x) => x.status === 'ascended').length / r.length).toFixed(4)} | ` +
      `${was.grimoires} | ${f(mean(perRun(arm, 'referenceGrimoires')), 0)} | ` +
      `${was.nodesKnown} | ${f(mean(perRun(arm, 'referenceNodesKnown')))} | ` +
      `${was.population} | ${f(mean(perRun(arm, 'referencePopulation')), 0)} |`,
  );
}
