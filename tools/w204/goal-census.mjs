#!/usr/bin/env node
/*
 * Multiverse Mages — W204: which mage goals get committed to, and which of
 * those produce any work at all.
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
 * `WorldStepReport` carries `goalSwitches` and nothing else about goals: the
 * per-goal histogram is computed every tick inside `stepMageAutonomy` and
 * dropped. So there is no committed number anywhere that says how a mage's life
 * is spent, and a goal that every mage picks and that accrues nothing looks
 * exactly like a goal nobody picks.
 *
 * This reads the commitment component off the state directly, tick by tick, and
 * puts it beside the effort ledger. Two columns:
 *
 * - **mage-ticks** — mages holding this goal, summed over ticks. The "fires"
 *   column.
 * - **efforts** — rows in `EFFORT_PROGRESS` accruing under it. The "does it do
 *   anything" column. `workOne`'s switch has an accrual for six of the ten
 *   goals; the other four fall through to `return undefined`.
 *
 * A goal with many mage-ticks and no accrual is a mage spending her life on a
 * verb the rules do not implement.
 *
 * Usage: node tools/w204/goal-census.mjs [ticks] [seed]
 */

import process from 'node:process';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { EFFORT_KIND, EFFORT_PROGRESS, GOAL_COMMITMENT, MAGE, collectRecords } from '@mm/state';
import { defineWorldSimulation } from '@mm/coordination';
import { GOAL_NAMES, GOALS_IN_ORDER } from '@mm/rules-world';
import { LONG_RUN_OPTIONS, LONG_RUN_SEED, buildReferenceState, referenceContent } from '@mm/scenario';

const TICKS = Number.parseInt(process.argv[2] ?? '600', 10);
const SEED = Number.parseInt(process.argv[3] ?? String(LONG_RUN_SEED), 10);

const content = referenceContent();
const simulation = defineWorldSimulation(content.deps);
let state = buildReferenceState({
  runSeed: SEED,
  options: LONG_RUN_OPTIONS,
  content,
  schema: simulation.schema,
});

// Affiliation, watched directly. `completeAffiliation` has no production caller
// — `check:reachability` already says so — but a mage could still become
// affiliated through `assignStaff`, which does run every tick. "The goal does
// nothing" and "the goal's outcome happens anyway by another route" are
// different findings with different fixes, and only the mage row can tell them
// apart.
const affiliationOf = new Map();
let affiliationsGained = 0;
let affiliationsLost = 0;
let gainedWhileCommittedToAffiliate = 0;

const mageTicks = new Map(GOALS_IN_ORDER.map((goal) => [goal, 0]));
const targeted = new Map(GOALS_IN_ORDER.map((goal) => [goal, 0]));
const effortTicks = new Map();
let mageTicksTotal = 0;
let uncommittedMageTicks = 0;

for (let tick = 0; tick < TICKS; tick += 1) {
  state = step(state, [], rngFromRootSeed(state.rootSeed));

  let mages = 0;
  const affiliateGoal = new Set();
  for (const { handle, row } of collectRecords(state, GOAL_COMMITMENT)) {
    if (GOAL_NAMES[row.goalId] === 'affiliate') affiliateGoal.add(handle);
  }
  for (const { handle, row } of collectRecords(state, MAGE)) {
    mages += 1;
    const previous = affiliationOf.get(handle);
    if (previous !== row.universityId) {
      if (previous !== undefined) {
        if (row.universityId === 0) affiliationsLost += 1;
        else {
          affiliationsGained += 1;
          if (affiliateGoal.has(handle)) gainedWhileCommittedToAffiliate += 1;
        }
      } else if (row.universityId !== 0) {
        affiliationsGained += 1;
      }
      affiliationOf.set(handle, row.universityId);
    }
  }
  let committed = 0;
  for (const { row } of collectRecords(state, GOAL_COMMITMENT)) {
    committed += 1;
    mageTicks.set(row.goalId, (mageTicks.get(row.goalId) ?? 0) + 1);
    if (row.targetNodeId !== 0) targeted.set(row.goalId, (targeted.get(row.goalId) ?? 0) + 1);
  }
  mageTicksTotal += mages;
  uncommittedMageTicks += Math.max(0, mages - committed);

  for (const { row } of collectRecords(state, EFFORT_PROGRESS)) {
    const key = row.kind;
    const seen = effortTicks.get(key) ?? { rows: 0, progress: 0 };
    seen.rows += 1;
    seen.progress += row.progress;
    effortTicks.set(key, seen);
  }
}

const kindName = Object.fromEntries(Object.entries(EFFORT_KIND).map(([name, value]) => [value, name]));

console.log(
  `W204 goal census — ${String(TICKS)} ticks, seed ${String(SEED)}, reference universe, no actions.\n`,
);
console.log(`${'id'.padStart(3)}  ${'goal'.padEnd(18)}${'mage-ticks'.padStart(12)}${'share'.padStart(9)}${'with target'.padStart(13)}  accrual in workOne`);
console.log('-'.repeat(84));

// The four goals `workOne` has no branch for. Named here rather than derived,
// because the switch is in `world-step.ts` and not reachable from a tool.
const NO_ACCRUAL = new Set(['idle', 'affiliate', 'wardDuty', 'raidReadiness']);
const totalCommitted = [...mageTicks.values()].reduce((a, b) => a + b, 0);

for (const goal of GOALS_IN_ORDER) {
  const ticks = mageTicks.get(goal) ?? 0;
  const name = GOAL_NAMES[goal];
  const share = totalCommitted === 0 ? 0 : (ticks / totalCommitted) * 100;
  console.log(
    `${String(goal).padStart(3)}  ${name.padEnd(18)}${String(ticks).padStart(12)}${`${share.toFixed(1)}%`.padStart(9)}` +
      `${String(targeted.get(goal) ?? 0).padStart(13)}  ${NO_ACCRUAL.has(name) ? 'NONE — falls through to `return undefined`' : 'yes'}`,
  );
}
console.log('-'.repeat(84));
console.log(`${'   '}  ${'total committed'.padEnd(18)}${String(totalCommitted).padStart(12)}`);
console.log(`${'   '}  ${'mage-ticks in run'.padEnd(18)}${String(mageTicksTotal).padStart(12)}`);
console.log(`${'   '}  ${'uncommitted'.padEnd(18)}${String(uncommittedMageTicks).padStart(12)}   (autonomy has not run for this mage yet)`);

console.log(
  `\naffiliation transitions: ${String(affiliationsGained)} gained, ${String(affiliationsLost)} lost; ` +
    `${String(gainedWhileCommittedToAffiliate)} of the gains happened on a tick the mage was committed to \`affiliate\`.`,
);
console.log(
  `mages ever affiliated: ${String([...affiliationOf.values()].filter((id) => id !== 0).length)} ` +
    `of ${String(affiliationOf.size)} seen.`,
);

console.log('\neffort rows observed, by kind (summed over ticks):');
for (const [kind, seen] of [...effortTicks.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(kindName[kind] ?? kind).padEnd(16)} rows ${String(seen.rows).padStart(9)}   Σ progress ${String(seen.progress).padStart(12)}`);
}
for (const [name, value] of Object.entries(EFFORT_KIND)) {
  if (value !== 0 && !effortTicks.has(value)) console.log(`  ${name.padEnd(16)} rows         0   NEVER OBSERVED`);
}
