/*
 * Multiverse Mages — W182: does any raider ever come home?
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
 * The measurement that justifies `withdraw-after-ticks`, made re-runnable.
 *
 * `withdraw-stability-margin` was authored as fp(400) of *remaining* portal
 * stability — "about 400 ticks at the authored decay" — against a portal that
 * opens with 2,400–3,600 ticks of life, in raids this script measures at a p50
 * of tens. The window therefore opened two to three thousand ticks into a raid
 * that had ended long before, so **no raider ever withdrew**, and
 * `raid.ts`'s stranded-raider rule took every survivor.
 *
 * That is a claim about a rate, and until this change nothing in the record
 * could state it: `localCasualties` counted the bodies without separating a
 * mage killed in a fight from a mage the timer ate. `RaidOutcome` now carries
 * `raidersFielded` / `raidersWithdrawn` / `raidersStranded`, and this script is
 * what reads them.
 *
 *     node scripts/w182-withdrawal.mjs
 *     STRATEGY=portal-rush HORIZON=2400 node scripts/w182-withdrawal.mjs
 *
 * To sweep the constant, drive it from `scripts/w182-sweep.sh`, which rewrites
 * `packages/content/data/raid-constant.json` between child processes. The
 * rewrite is deliberately *not* done in-process: content is loaded once per
 * process and memoized, so a second value read in the same process would
 * describe the first one's world — the "aggregator that answers about the wrong
 * input" shape `CLAUDE.md` records five instances of.
 */
import { executeReferenceRun } from '@mm/scenario';

const SEEDS = (process.env.SEEDS ?? '0x0badc0de,0x00abcdef,0x12345678,0x00041000')
  .split(',')
  .map((text) => Number(text.trim()));
const HORIZON = Number(process.env.HORIZON ?? 1200);
const STRATEGY = process.env.STRATEGY ?? 'portal-rush';

function task(seed) {
  return {
    coordinates: { cellId: 'w182', replicate: 0, sweepId: 'w182-withdrawal' },
    runSeed: seed,
    levels: {},
    strategies: [STRATEGY],
    worldTickCap: HORIZON,
    metrics: [],
    ablatedPrimitives: [],
  };
}

/** The percentile of a sorted array, nearest-rank. Integer arithmetic only. */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p * sorted.length) / 100);
  return sorted[Math.max(0, rank - 1)];
}

function summary(result) {
  const raids = result.raids ?? [];
  let fielded = 0;
  let withdrawn = 0;
  let stranded = 0;
  let combatantTicks = 0;
  let attempts = 0;
  const lengths = [];
  const sources = new Set();
  for (const raid of raids) {
    fielded += raid.raidersFielded;
    withdrawn += raid.raidersWithdrawn;
    stranded += raid.raidersStranded;
    combatantTicks += raid.totalCombatantTicks;
    lengths.push(raid.engagementTicks);
    for (const row of raid.combatSources) {
      sources.add(row.source);
      attempts += row.removingAttempts + row.hurtingAttempts + row.spentAttempts;
    }
  }
  lengths.sort((a, b) => a - b);
  return {
    raids: raids.length,
    fielded,
    withdrawn,
    stranded,
    killed: fielded - withdrawn - stranded,
    combatantTicks,
    attempts,
    sources: [...sources].sort(),
    p50: percentile(lengths, 50),
    p90: percentile(lengths, 90),
    max: lengths.length === 0 ? 0 : lengths[lengths.length - 1],
    portalTicks: raids.map((raid) => raid.initialPortalStabilityTicks).sort((a, b) => a - b),
  };
}

console.log(`strategy=${STRATEGY} horizon=${HORIZON} seeds=${SEEDS.length}`);

let all = { raids: 0, fielded: 0, withdrawn: 0, stranded: 0, killed: 0, attempts: 0, combatantTicks: 0 };
const sources = new Set();
let portalLow = Infinity;
let portalHigh = 0;
let lengthMax = 0;

for (const seed of SEEDS) {
  const s = summary(executeReferenceRun(task(seed)));
  for (const key of Object.keys(all)) all[key] += s[key];
  for (const source of s.sources) sources.add(source);
  if (s.portalTicks.length > 0) {
    portalLow = Math.min(portalLow, s.portalTicks[0]);
    portalHigh = Math.max(portalHigh, s.portalTicks[s.portalTicks.length - 1]);
  }
  lengthMax = Math.max(lengthMax, s.max);
  console.log(
    `seed 0x${(seed >>> 0).toString(16).padStart(8, '0')}  raids=${String(s.raids).padStart(3)} ` +
      `len p50=${String(s.p50).padStart(3)} p90=${String(s.p90).padStart(3)} max=${String(s.max).padStart(3)}  ` +
      `raiders fielded=${String(s.fielded).padStart(4)} withdrew=${String(s.withdrawn).padStart(4)} ` +
      `stranded=${String(s.stranded).padStart(4)} killed=${String(s.killed).padStart(4)}  ` +
      `combatantTicks=${String(s.combatantTicks).padStart(6)} combatAttempts=${s.attempts}`,
  );
}

const rate = all.fielded === 0 ? 0 : (all.withdrawn * 1000) / all.fielded;
console.log(
  `TOTAL raids=${all.raids} fielded=${all.fielded} withdrew=${all.withdrawn} ` +
    `stranded=${all.stranded} killed=${all.killed}  ` +
    `withdrawalRate=${(rate / 10).toFixed(1)}%  combatAttempts=${all.attempts} ` +
    `combatSources=${JSON.stringify([...sources].sort())}`,
);
console.log(
  `portal life (engagement ticks) observed ${portalLow === Infinity ? 'n/a' : portalLow}-${portalHigh}; ` +
    `longest raid ${lengthMax}`,
);
