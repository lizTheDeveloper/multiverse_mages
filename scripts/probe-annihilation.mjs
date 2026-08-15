/*
 * Multiverse Mages — the fixed-point annihilation probe.
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
 * Finds Zeno stalls: a scaling operation that floors a non-zero quantity to
 * zero at the *same call site, on almost every tick*, so the quantity it drives
 * never moves again.
 *
 * A single annihilation is not a defect — flooring small products to zero is
 * what fixed-point arithmetic does, correctly, constantly. What this measures
 * is **persistence**: the fraction of world ticks on which a given site
 * annihilated at all. A site at or near 1.0 is driving something that is
 * permanently stuck, which is the shape of every instance this project has
 * already found by hand.
 *
 * Run after `npm run typecheck`, which emits the `dist/` this loads:
 *
 *     node scripts/probe-annihilation.mjs [ticks]
 */

import { installAnnihilationSentinel, rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';
import { BOT_POOL } from '@mm/mc-harness';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  executeReferenceRun,
  referenceContent,
} from '@mm/scenario';

const TICKS = Number(process.argv[2] ?? 600);

// Deep enough to reach the caller of `mul`/`div` through the rules path, short
// enough that capturing one per event is affordable.
Error.stackTraceLimit = 8;

/** site -> { ticks: Set<number>, events: number, sample: {a,b,operation} } */
const sites = new Map();
let tick = 0;

/**
 * The first stack frame outside the fixed-point module: the rules-path line
 * that asked for the scaling.
 */
function callSite() {
  const stack = new Error('site').stack ?? '';
  for (const line of stack.split('\n').slice(2)) {
    if (line.includes('fixed-point') || line.includes('probe-annihilation')) continue;
    const match = /\(?([^()\s]+:\d+:\d+)\)?$/.exec(line.trim());
    if (match === null) continue;
    // Strip the absolute prefix so the report is readable and machine-stable.
    return match[1].replace(/^.*\/packages\//, 'packages/').replace(/^file:\/\//, '');
  }
  return '(unattributed)';
}

installAnnihilationSentinel((event) => {
  const site = callSite();
  let entry = sites.get(site);
  if (entry === undefined) {
    entry = { ticks: new Set(), events: 0, sample: event };
    sites.set(site, entry);
  }
  entry.events += 1;
  entry.ticks.add(tick);
});

const started = Date.now();

// Arm 1: the passive reference universe, stepped directly, so `tick` is exact.
const content = referenceContent();
const simulation = defineWorldSimulation(content.deps);
let state = buildReferenceState({
  runSeed: LONG_RUN_SEED,
  options: LONG_RUN_OPTIONS,
  content,
  schema: simulation.schema,
});
for (tick = 0; tick < TICKS; tick += 1) {
  state = step(state, [], rngFromRootSeed(state.rootSeed));
}

// Arms 2..n: every shipped strategy, with raids live. These are where the god
// verbs are pressed and where `rules-raid` is reached at all — at 60 ticks the
// whole pool resolves one raid, so a short horizon leaves it unexercised.
// `tick` advances one per arm here: persistence is then measured per arm, which
// is the coarser but still discriminating signal for a site only these reach.
const denominator = TICKS + BOT_POOL.length;
for (const [index, bot] of BOT_POOL.entries()) {
  tick = TICKS + index;
  executeReferenceRun(
    {
      coordinates: {
        rootSeed: LONG_RUN_SEED,
        sweepId: 'probe-annihilation',
        cellIndex: index,
        replicateIndex: 0,
      },
      runSeed: LONG_RUN_SEED + index,
      levels: { cohortSize: 12, foundingNodes: 4 },
      strategies: [bot.strategyId],
      worldTickCap: TICKS,
      metrics: [],
      ablatedPrimitives: [],
    },
    { raids: true },
  );
}

installAnnihilationSentinel(undefined);

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `reference universe + ${BOT_POOL.length} strategy arms, ${TICKS} world ticks each, ${elapsed}s\n`,
);

const ranked = [...sites.entries()]
  .map(([site, entry]) => ({
    site,
    persistence: entry.ticks.size / denominator,
    ticks: entry.ticks.size,
    events: entry.events,
    sample: entry.sample,
  }))
  .sort((a, b) => b.persistence - a.persistence || b.events - a.events);

console.log(`${ranked.length} distinct annihilating call sites\n`);
console.log('persist  ticks   events  site');
for (const row of ranked) {
  const flag = row.persistence >= 0.9 ? ' <-- STALL' : row.persistence >= 0.5 ? ' <-- watch' : '';
  console.log(
    `${row.persistence.toFixed(3).padStart(6)}  ${String(row.ticks).padStart(5)}  ` +
      `${String(row.events).padStart(7)}  ${row.site}${flag}`,
  );
}

const stalls = ranked.filter((row) => row.persistence >= 0.9);
if (stalls.length > 0) {
  console.log(`\n${stalls.length} site(s) annihilate on >=90% of ticks:`);
  for (const row of stalls) {
    console.log(
      `  ${row.site}\n    ${row.sample.operation}(${String(row.sample.a)}, ` +
        `${String(row.sample.b)}) -> 0`,
    );
  }
}
