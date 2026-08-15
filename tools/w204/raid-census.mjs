#!/usr/bin/env node
/*
 * Multiverse Mages — W204: what actually happens inside a raid.
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
 * The raid subsystem is the largest single mechanism in the build and the one
 * the design leans on hardest — the whole PvP pillar arbitrates through it. It
 * is also the one the reference long run cannot see at all: `runLongReference`
 * never installs `raidSystem` and never submits an action, so a raid ablation
 * measured there is a statement about a driver, not about the game.
 *
 * This drives it properly: `executeReferenceRun`, which does install the raid
 * system, over every shipped strategy, and counts the two numbers that are a
 * pair — **how long combatants stood in the engagement**, and **how many times
 * any of them attempted anything**.
 *
 * Usage: node tools/w204/raid-census.mjs [--ticks 600] [--seeds 2]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { BOT_POOL } from '@mm/mc-harness';
import { executeReferenceRun, referenceContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const TICKS = Number.parseInt(flag('ticks', '600'), 10);
const SEED_COUNT = Number.parseInt(flag('seeds', '2'), 10);
const JSON_OUT = flag('json', undefined);

// The four seeds `scripts/w144-ablation-visibility.mjs` uses, so that this is
// comparable with the measurement already recorded in the tree rather than
// being a second, differently-seeded opinion.
const SEEDS = [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0004_1000].slice(0, SEED_COUNT);
const METRICS = ['combatActionEconomy', 'combatThresholdEfficiency'];

const content = referenceContent();

const task = (strategyId, runSeed) => ({
  coordinates: { sweepId: 'w204-raid-census', cellId: strategyId, replicate: runSeed },
  runSeed,
  levels: {},
  strategies: [strategyId],
  worldTickCap: TICKS,
  metrics: METRICS,
  ablatedPrimitives: [],
});

const rows = [];
const pooled = {
  raids: 0,
  combatantTicks: 0,
  attempts: 0,
  engagementTicks: 0,
  removals: 0,
  nodesGained: 0,
  nodesLost: 0,
  bySource: {},
  unimplemented: new Set(),
};

for (const definition of BOT_POOL) {
  const row = { strategyId: definition.strategyId, raids: 0, combatantTicks: 0, attempts: 0, engagementTicks: 0 };
  for (const runSeed of SEEDS) {
    const result = executeReferenceRun(task(definition.strategyId, runSeed), { content });
    for (const raid of result.raids ?? []) {
      row.raids += 1;
      row.combatantTicks += raid.totalCombatantTicks;
      pooled.raids += 1;
      pooled.combatantTicks += raid.totalCombatantTicks;
      for (const channel of raid.unimplementedCombatChannels ?? []) pooled.unimplemented.add(channel);
      for (const source of raid.combatSources ?? []) {
        const attempts = source.removingAttempts + source.hurtingAttempts + source.spentAttempts;
        row.attempts += attempts;
        pooled.attempts += attempts;
        pooled.bySource[source.source] = (pooled.bySource[source.source] ?? 0) + attempts;
      }
      pooled.removals += raid.worldScaleRemovals ?? 0;
    }
    for (const raid of result.rawRaids) {
      row.engagementTicks += raid.engagementTicks;
      pooled.engagementTicks += raid.engagementTicks;
      pooled.nodesGained += raid.nodesGainedLocally;
      pooled.nodesLost += raid.nodesLostLocally;
    }
  }
  rows.push(row);
  console.log(
    `${row.strategyId.padEnd(22)}raids ${String(row.raids).padStart(4)}   engagement-ticks ${String(row.engagementTicks).padStart(6)}` +
      `   combatant-ticks ${String(row.combatantTicks).padStart(7)}   attempts ${String(row.attempts).padStart(6)}`,
  );
}

console.log(`\n${String(BOT_POOL.length)} strategies x ${String(SEEDS.length)} seeds x ${String(TICKS)} ticks`);
console.log(`pooled: raids ${String(pooled.raids)}, engagement-ticks ${String(pooled.engagementTicks)}, combatant-ticks ${String(pooled.combatantTicks)}, combat attempts ${String(pooled.attempts)}`);
console.log(`attempts bySource: ${JSON.stringify(pooled.bySource)}`);
console.log(`world-scale removals ${String(pooled.removals)}, nodes gained ${String(pooled.nodesGained)}, nodes lost ${String(pooled.nodesLost)}`);
console.log(`channels the engine declares unimplemented: ${[...pooled.unimplemented].join(', ') || '(none reported)'}`);

if (JSON_OUT !== undefined) {
  writeFileSync(
    JSON_OUT,
    `${JSON.stringify({ ticks: TICKS, seeds: SEEDS, rows, pooled: { ...pooled, unimplemented: [...pooled.unimplemented] } }, undefined, 2)}\n`,
  );
  console.log(`\nwrote ${JSON_OUT}`);
}
