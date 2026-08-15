/*
 * Multiverse Mages — a wide sweep of the component value sentinel.
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
 * Reproduction probe, not a test.
 *
 * `assembled-run-values.test.ts` runs the sentinel over the reference universe
 * for 240 ticks and each shipped strategy for 60, at one seed and one level
 * combination, with raids left at their default. `balance-gate-ascension`
 * runs 2400 ticks across eight strategies. This probe covers the difference,
 * which is the surface on which nothing has ever looked for a non-integer
 * write.
 *
 * Run: node --experimental-strip-types scripts/probe-value-sentinel.mjs [ticks]
 * after `npm run typecheck`, which is what emits the `dist/` this loads.
 */

import { installValueSentinel } from '@mm/sim-core';
import { BOT_POOL } from '@mm/mc-harness';
import { executeReferenceRun } from '@mm/scenario';

const TICKS = Number(process.argv[2] ?? 600);
const SEEDS = (process.env.PROBE_SEEDS ?? '20260811,589825,1').split(',').map(Number);
const LEVELS =
  process.env.PROBE_LEVELS === 'one'
    ? [{ cohortSize: 12, foundingNodes: 4 }]
    : [
        { cohortSize: 4, foundingNodes: 1 },
        { cohortSize: 12, foundingNodes: 4 },
      ];
const RAID_MODES = (process.env.PROBE_RAIDS ?? 'true,false').split(',').map((v) => v === 'true');

let currentArm = '(none)';

/** Every violation seen, keyed so a repeated write collapses to one line. */
const tally = new Map();
let writes = 0;

installValueSentinel((v) => {
  writes += 1;
  const key = `${v.component}.${v.field} = ${String(v.value)} (via ${v.door})`;
  const entry = tally.get(key);
  if (entry === undefined) {
    tally.set(key, { count: 1, arms: new Set([currentArm]) });
  } else {
    entry.count += 1;
    entry.arms.add(currentArm);
  }
});

let armIndex = 0;
const started = Date.now();

for (const raids of RAID_MODES) {
  for (const seed of SEEDS) {
    for (const levels of LEVELS) {
      for (const [index, bot] of BOT_POOL.entries()) {
        currentArm =
          `${bot.strategyId} seed=${seed} cohort=${levels.cohortSize} ` +
          `nodes=${levels.foundingNodes} raids=${raids}`;
        armIndex += 1;
        const before = writes;
        try {
          executeReferenceRun(
            {
              coordinates: {
                rootSeed: seed,
                sweepId: 'probe-value-sentinel',
                cellIndex: index,
                replicateIndex: 0,
              },
              runSeed: seed + index,
              levels,
              strategies: [bot.strategyId],
              worldTickCap: TICKS,
              metrics: [],
              ablatedPrimitives: [],
            },
            { raids },
          );
        } catch (error) {
          console.log(`THREW  ${currentArm}\n       ${String(error)}`);
        }
        const delta = writes - before;
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        console.log(
          `[${String(armIndex).padStart(3)}] ${delta === 0 ? 'clean' : `${delta} BAD`}  ` +
            `${currentArm}  (+${secs}s)`,
        );
      }
    }
  }
}

installValueSentinel(undefined);

console.log(`\n=== ${TICKS} ticks x ${armIndex} arms ===`);
console.log(`non-integer component writes: ${writes}`);
if (tally.size > 0) {
  console.log('\ndistinct violations:');
  for (const [key, entry] of [...tally.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(entry.count).padStart(8)}x  ${key}`);
    console.log(`            arms: ${[...entry.arms].slice(0, 3).join(' | ')}`);
  }
  process.exitCode = 1;
}
