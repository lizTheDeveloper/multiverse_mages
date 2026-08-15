#!/usr/bin/env node
/*
 * Multiverse Mages — W204: how often each knowledge-derived bonus channel fires,
 * and what magnitude it carries when it does.
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
 * An ablation says whether a mechanism matters. It does not say *why* a null is
 * a null, and the two reasons need opposite fixes: a channel nobody calls is a
 * missing caller, a channel called ten thousand times carrying `fp(0)` is
 * content that never reached the square.
 *
 * So this wraps the three bonus channels — the ones through which what a mage
 * *knows* is supposed to change how fast she researches, teaches and how long
 * she lives — counts every call, and records the magnitudes. It calls through
 * and returns the real value: the run this instruments is the reference run,
 * unchanged.
 *
 * Usage: node tools/w204/channel-counter.mjs [ticks] [seed]
 */

import process from 'node:process';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  executeReferenceRun,
  referenceContent,
} from '@mm/scenario';

const TICKS = Number.parseInt(process.argv[2] ?? '600', 10);
const SEED = Number.parseInt(process.argv[3] ?? String(LONG_RUN_SEED), 10);
/**
 * The strategy to drive the run with, or `-` for the no-action long run.
 *
 * It matters more than a knob usually does. All three bonus channels are fed by
 * *god* constants and never by node effects — `content-set.ts` registers them as
 * non-node consumers and says so — so a driver that submits no actions makes
 * every one of them return an empty list, forever, correctly. Reading that as
 * "the channel is dead" would be reading the driver.
 */
const STRATEGY = process.argv[4] ?? '-';

const base = referenceContent();
const tally = new Map();

function watched(field) {
  const original = base.deps[field];
  const row = { field, calls: 0, callsWithAny: 0, contributions: 0, nonZero: 0, total: 0, max: 0, values: new Map() };
  tally.set(field, row);
  if (original === undefined) {
    row.absent = true;
    return undefined;
  }
  return (...args) => {
    const result = original(...args);
    row.calls += 1;
    if (result.length > 0) row.callsWithAny += 1;
    for (const value of result) {
      row.contributions += 1;
      row.total += value;
      row.max = Math.max(row.max, value);
      if (value !== 0) row.nonZero += 1;
      row.values.set(value, (row.values.get(value) ?? 0) + 1);
    }
    return result;
  };
}

const deps = {
  ...base.deps,
  researchBonusesFor: watched('researchBonusesFor'),
  teachBonusesFor: watched('teachBonusesFor'),
  lifespanEffectsFor: watched('lifespanEffectsFor'),
};

// `universeEffects` is an object rather than a function; its three read methods
// are the applied-magic channel and are counted the same way.
const universeEffects = base.deps.universeEffects;
const applied = { field: 'universeEffects.appliedYieldOf', calls: 0, callsWithAny: 0, contributions: 0, nonZero: 0, total: 0, max: 0, values: new Map() };
tally.set('universeEffects.appliedYieldOf', applied);
deps.universeEffects = {
  ...universeEffects,
  appliedYieldOf: (nodeId) => {
    const result = universeEffects.appliedYieldOf(nodeId);
    applied.calls += 1;
    if (result !== undefined) {
      applied.callsWithAny += 1;
      for (const value of result.magnitudes) {
        applied.contributions += 1;
        applied.total += value;
        applied.max = Math.max(applied.max, value);
        if (value !== 0) applied.nonZero += 1;
        applied.values.set(value, (applied.values.get(value) ?? 0) + 1);
      }
    }
    return result;
  },
};

const content = { ...base, deps };
if (STRATEGY === '-') {
  const simulation = defineWorldSimulation(deps);
  let state = buildReferenceState({ runSeed: SEED, options: LONG_RUN_OPTIONS, content, schema: simulation.schema });
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
} else {
  executeReferenceRun(
    {
      coordinates: { sweepId: 'w204-channels', cellId: STRATEGY, replicate: SEED },
      runSeed: SEED,
      levels: {},
      strategies: [STRATEGY],
      worldTickCap: TICKS,
      metrics: [],
      ablatedPrimitives: [],
    },
    { content },
  );
}

console.log(
  `W204 channel counter — ${String(TICKS)} ticks, seed ${String(SEED)}, ` +
    `${STRATEGY === '-' ? 'no-action long run' : `strategy ${STRATEGY}`}.\n`,
);
console.log(`${'channel'.padEnd(34)}${'calls'.padStart(9)}${'non-empty'.padStart(11)}${'contribs'.padStart(10)}${'non-zero'.padStart(10)}${'Σ magnitude'.padStart(13)}${'max'.padStart(7)}  distinct magnitudes`);
console.log('-'.repeat(120));
for (const row of tally.values()) {
  if (row.absent === true) {
    console.log(`${row.field.padEnd(34)}  ABSENT — the reference universe never installs this dep`);
    continue;
  }
  const distinct = [...row.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => `${String(v)}x${String(n)}`).join(' ');
  console.log(
    `${row.field.padEnd(34)}${String(row.calls).padStart(9)}${String(row.callsWithAny).padStart(11)}${String(row.contributions).padStart(10)}` +
      `${String(row.nonZero).padStart(10)}${String(row.total).padStart(13)}${String(row.max).padStart(7)}  ${distinct || '(none)'}`,
  );
}
