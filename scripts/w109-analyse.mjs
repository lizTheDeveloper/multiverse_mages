/*
 * Multiverse Mages — W109: what an alliance is worth, paired on the seed.
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
 * ## Why this is not `w99-analyse.mjs` with different arguments
 *
 * W99 varied a **factor** and held the strategy fixed, so its common-random-
 * numbers check asserts that two paired runs agree on *both* `runSeed` and
 * `strategies[0]`. This measurement varies the **strategy** — `alliance-seeker`
 * against `alliance-abstainer`, which are the same preference list differing by
 * one entry — and holds the factor fixed. Running W99's checker over these arms
 * would print `** CRN BROKEN **` for the one difference the experiment is
 * about.
 *
 * So the pairing check here is the half that still applies: same `sweepId`, same
 * `rootSeed`, same `(cellIndex, replicateIndex)` and therefore the same
 * `runSeed`, with the strategy asserted to be *exactly* the treatment rather
 * than asserted to be equal. A mismatch in seeds is still fatal and still says
 * so.
 *
 * ## Why the strategy is the treatment and not a factor level
 *
 * Because that is what the mechanic is. Action 16 ships available; the question
 * is what a god who uses it gets over one who does not, on the same universe.
 * A scenario flag switching the verb off would have measured a different thing —
 * a world where alliances are impossible — and would also have had to survive
 * `contracts.md` §1.1's warning that a per-worker constant cannot differ between
 * two arms of one sweep.
 *
 * ## What it prints
 *
 * 1. Per arm: ascension rate over `metrics-registry.ts`'s denominator, the six
 *    vital signs, and **tempo** — `ticksRun`, split by whether the run ascended.
 *    Tempo is not decoration here: the design requirement is that allies get a
 *    slow species to the summit *within the horizon*, so an arm that ascends at
 *    the same rate but only at tick 2399 has not satisfied it.
 * 2. Paired differences, seed by seed, with a paired standard error.
 * 3. What the verb actually did: how many runs ever invited anybody, how much
 *    favor went to action 16, and how many runs ever reached the portal gate at
 *    all — which for draconic is the number that explains the rest.
 *
 *     node w109-analyse.mjs --control <label>=<dir> --arm <label>=<dir> [--arm ...]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** `metrics-registry.ts`'s pinned `ascensionRate`: these three are the denominator. */
const DENOMINATOR_STATUSES = new Set(['ascended', 'stagnated', 'truncated']);

/** §4.2 ids this report reads by name. */
const ACTION_OPEN_PORTAL = '14';
const ACTION_INVITE_SCHOLAR = '16';

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
  const value = entry === undefined || entry === null ? undefined : (entry.value ?? entry);
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
  return {
    ascended,
    denominator,
    failed,
    byStatus,
    rate: denominator === 0 ? null : ascended / denominator,
  };
}

const spendOn = (run, actionId) => run.godSpendByAction?.[actionId] ?? 0;

// --------------------------------------------------------------------------
// Arguments
// --------------------------------------------------------------------------

const argv = process.argv.slice(2);
let controlSpec;
const armSpecs = [];
let title = 'W109';
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

console.log(`# ${title}\n`);

// --------------------------------------------------------------------------
// Common random numbers, checked rather than assumed
// --------------------------------------------------------------------------

console.log('## Common random numbers, verified\n');
{
  const key = (run) => `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;
  const sweepIds = new Set(arms.flatMap((arm) => arm.runs.map((run) => run.coordinates.sweepId)));
  const rootSeeds = new Set(arms.flatMap((arm) => arm.runs.map((run) => run.coordinates.rootSeed)));
  let compared = 0;
  let seedMismatches = 0;
  let sameStrategy = 0;
  const base = new Map(control.runs.map((run) => [key(run), run]));
  for (const arm of arms.slice(1)) {
    for (const run of arm.runs) {
      const other = base.get(key(run));
      if (other === undefined) continue;
      compared += 1;
      if (other.runSeed !== run.runSeed) seedMismatches += 1;
      if (other.strategies[0] === run.strategies[0]) sameStrategy += 1;
    }
  }
  console.log(`    arms compared against the control: ${String(arms.length - 1)}`);
  console.log(`    (cellIndex, replicateIndex) pairs compared: ${String(compared)}`);
  console.log(`    seed mismatches: ${String(seedMismatches)}`);
  console.log(`    pairs whose strategy did NOT differ: ${String(sameStrategy)}`);
  console.log(`    distinct sweepIds: ${[...sweepIds].join(', ')}`);
  console.log(`    distinct rootSeeds: ${[...rootSeeds].join(', ')}`);
  if (seedMismatches > 0) {
    console.log('    ** CRN BROKEN — the paired tables below are not licensed **');
  }
  if (compared > 0 && sameStrategy === compared) {
    console.log('    ** NO TREATMENT — every pair played the same strategy **');
  }
}

// --------------------------------------------------------------------------
// Table 1 — per arm
// --------------------------------------------------------------------------

console.log('\n## Table 1 — per arm\n');
console.log(
  `| arm | n | ascended/denom | ascensionRate | ${METRICS.map(([, label]) => label).join(' | ')} |`,
);
console.log(`|---|---|---|---|${METRICS.map(() => '---').join('|')}|`);
for (const arm of arms) {
  const asc = ascension(arm.runs);
  const cells = METRICS.map(([id]) => {
    const { mean, se } = meanSe(arm.runs.map((run) => metricOf(run, id)).filter((v) => v !== undefined));
    return `${mean.toFixed(2)} ±${se.toFixed(2)}`;
  });
  const rate = asc.rate === null ? 'n/a' : asc.rate.toFixed(4);
  console.log(
    `| **${arm.label}** | ${String(arm.runs.length)} | ${String(asc.ascended)}/${String(asc.denominator)} | ${rate} | ${cells.join(' | ')} |`,
  );
}

console.log('\n### Terminal status counts\n');
for (const arm of arms) {
  console.log(`    ${arm.label.padEnd(24)} ${JSON.stringify(ascension(arm.runs).byStatus)}`);
}

// --------------------------------------------------------------------------
// Tempo — the half the design requirement is stated over
// --------------------------------------------------------------------------

console.log('\n## Table 2 — tempo\n');
console.log('| arm | mean ticksRun | ticksRun on ascended runs | earliest ascension |');
console.log('|---|---|---|---|');
for (const arm of arms) {
  const all = arm.runs.map((run) => run.ticksRun);
  const ascendedTicks = arm.runs.filter((r) => r.status === 'ascended').map((r) => r.ticksRun);
  const allStat = meanSe(all);
  const ascStat = meanSe(ascendedTicks);
  const earliest = ascendedTicks.length === 0 ? 'n/a' : String(Math.min(...ascendedTicks));
  console.log(
    `| ${arm.label} | ${allStat.mean.toFixed(0)} | ${ascendedTicks.length === 0 ? 'n/a' : `${ascStat.mean.toFixed(0)} (n=${String(ascendedTicks.length)})`} | ${earliest} |`,
  );
}

// --------------------------------------------------------------------------
// What the verb actually did
// --------------------------------------------------------------------------

console.log('\n## Table 3 — the gate and the verb\n');
console.log(
  '| arm | runs reaching the portal gate (action 14 or 16 spent) | runs that invited | invitations (favor / 24576) | favor on action 16 |',
);
console.log('|---|---|---|---|---|');
for (const arm of arms) {
  const invited = arm.runs.filter((run) => spendOn(run, ACTION_INVITE_SCHOLAR) > 0);
  const gated = arm.runs.filter(
    (run) => spendOn(run, ACTION_INVITE_SCHOLAR) > 0 || spendOn(run, ACTION_OPEN_PORTAL) > 0,
  );
  const favor = arm.runs.reduce((a, run) => a + spendOn(run, ACTION_INVITE_SCHOLAR), 0);
  console.log(
    `| ${arm.label} | ${String(gated.length)} | ${String(invited.length)} | ${(favor / 24576).toFixed(1)} | ${String(favor)} |`,
  );
}

// --------------------------------------------------------------------------
// Table 4 — paired differences against the control
// --------------------------------------------------------------------------

console.log('\n## Table 4 — paired differences against the control, same seed\n');
console.log(
  `| arm | ${METRICS.map(([, label]) => label).join(' | ')} | ticksRun | ascended Δ |`,
);
console.log(`|---|${METRICS.map(() => '---').join('|')}|---|---|`);
{
  const key = (run) => `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;
  const base = new Map(control.runs.map((run) => [key(run), run]));
  for (const arm of arms.slice(1)) {
    const cells = METRICS.map(([id]) => {
      const deltas = [];
      for (const run of arm.runs) {
        const other = base.get(key(run));
        if (other === undefined) continue;
        const a = metricOf(run, id);
        const b = metricOf(other, id);
        if (a === undefined || b === undefined) continue;
        deltas.push(a - b);
      }
      const { mean, se } = meanSe(deltas);
      const flag = Number.isFinite(se) && se > 0 && Math.abs(mean) > 3 * se ? ' **' : '';
      return `${mean >= 0 ? '+' : ''}${mean.toFixed(2)} ±${se.toFixed(2)}${flag}`;
    });

    const tickDeltas = [];
    for (const run of arm.runs) {
      const other = base.get(key(run));
      if (other !== undefined) tickDeltas.push(run.ticksRun - other.ticksRun);
    }
    const tick = meanSe(tickDeltas);

    const armAsc = ascension(arm.runs).ascended;
    const baseAsc = ascension(control.runs).ascended;
    console.log(
      `| ${arm.label} | ${cells.join(' | ')} | ${tick.mean >= 0 ? '+' : ''}${tick.mean.toFixed(0)} ±${tick.se.toFixed(0)} | ${armAsc - baseAsc >= 0 ? '+' : ''}${String(armAsc - baseAsc)} (${String(armAsc)} vs ${String(baseAsc)}) |`,
    );
  }
}
console.log('\n`**` marks a paired mean more than three paired standard errors from zero.');
