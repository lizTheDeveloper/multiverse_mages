/*
 * Multiverse Mages — W70: containment and dimensionality by opening-square size.
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
 * ## The statistic, and why it is two statistics
 *
 * W15 reported mean pairwise containment `|A∩B| / min(|A|,|B|)` and found
 * **1.000 for every cross-strategy pair inside v1** — strategies do not pick
 * different subsets, they stop at different points along one queue. Containment
 * rather than Jaccard because a two-node set wholly inside a fifty-one-node set
 * scores 0.04 on Jaccard and reads as *"almost nothing in common"* when it
 * carries no compositional information at all, only a size difference.
 *
 * Two numbers come out of the same matrix and they answer different questions:
 *
 * - **cross-strategy**, paired universe for universe: two strategies at *one*
 *   coordinate, so the seed is held fixed and only the strategy varies.
 * - **the within-strategy diagonal**: one strategy at two *different*
 *   coordinates, so the strategy is held fixed and only the seed varies.
 *
 * W15's signature of a one-dimensional space is **cross above diagonal**: the
 * strategy label explains less about composition than the seed does not.
 * Anything that gives universes different content sets should push the diagonal
 * *down* — and that is what a seeded opening square is for.
 *
 * **Read the headline honestly.** A seeded square makes composition depend on
 * the seed, not on the strategy. It is a second dimension of the *content*
 * space, keyed by whoever chooses the square. Whether it is a second *strategic*
 * dimension is a question about strategy × square interaction on outcomes, which
 * this probe reads no signal for.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every shard's records, concatenated. */
export function loadRecords(dir) {
  const records = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('shard-') || !name.endsWith('.json')) continue;
    records.push(...JSON.parse(readFileSync(join(dir, name), 'utf8')).records);
  }
  return records;
}

/** `|A∩B| / min(|A|,|B|)`, and `undefined` when either side is empty. */
export function containment(a, b) {
  if (a.size === 0 || b.size === 0) return undefined;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const id of small) if (large.has(id)) shared += 1;
  return shared / small.size;
}

/**
 * The node set a run held at a horizon.
 *
 * The last sample at or before the horizon, so that a run which terminated
 * early still contributes its final composition rather than dropping out of the
 * comparison — a run that stagnated at tick 500 held *something* at tick 1200,
 * and treating it as absent would silently restrict every late horizon to the
 * runs that survived it.
 */
function setAt(record, horizon) {
  let chosen;
  for (const sample of record.samples) {
    if (sample.worldTick <= horizon) chosen = sample;
  }
  if (record.terminal.worldTick <= horizon) chosen = record.terminal;
  return new Set(chosen?.nodeIds ?? []);
}

const coordKey = (record) => `${String(record.cellIndex)}:${String(record.replicateIndex)}`;

/** Cross-strategy (paired) and within-strategy (diagonal) containment for one arm. */
export function armStatistics(records, horizon) {
  const byStrategy = new Map();
  for (const record of records) {
    const bucket = byStrategy.get(record.strategyId) ?? new Map();
    bucket.set(coordKey(record), setAt(record, horizon));
    byStrategy.set(record.strategyId, bucket);
  }
  const strategies = [...byStrategy.keys()].sort();

  const cross = [];
  for (let i = 0; i < strategies.length; i += 1) {
    for (let j = i + 1; j < strategies.length; j += 1) {
      const a = byStrategy.get(strategies[i]);
      const b = byStrategy.get(strategies[j]);
      for (const [coord, setA] of a) {
        const setB = b.get(coord);
        if (setB === undefined) continue;
        const value = containment(setA, setB);
        if (value !== undefined) cross.push(value);
      }
    }
  }

  const within = [];
  for (const bucket of byStrategy.values()) {
    const coords = [...bucket.keys()].sort();
    for (let i = 0; i < coords.length; i += 1) {
      for (let j = i + 1; j < coords.length; j += 1) {
        const value = containment(bucket.get(coords[i]), bucket.get(coords[j]));
        if (value !== undefined) within.push(value);
      }
    }
  }

  const union = new Set();
  let sizeTotal = 0;
  let sized = 0;
  let empty = 0;
  for (const bucket of byStrategy.values()) {
    for (const set of bucket.values()) {
      for (const id of set) union.add(id);
      sizeTotal += set.size;
      sized += 1;
      if (set.size === 0) empty += 1;
    }
  }

  const mean = (xs) => (xs.length === 0 ? undefined : xs.reduce((s, x) => s + x, 0) / xs.length);
  return {
    horizon,
    crossStrategy: mean(cross),
    crossPairs: cross.length,
    withinStrategy: mean(within),
    withinPairs: within.length,
    // The W15 signature. Positive means the strategy label explains less about
    // composition than the seed does — one queue, walked to different depths.
    crossMinusWithin:
      mean(cross) === undefined || mean(within) === undefined
        ? undefined
        : mean(cross) - mean(within),
    distinctNodesAcrossArm: union.size,
    meanNodesPerRun: sized === 0 ? 0 : sizeTotal / sized,
    emptyRuns: empty,
    runs: sized,
  };
}

function main() {
  const dir = process.argv[2] ?? '.w70';
  const records = loadRecords(dir);
  const arms = [...new Set(records.map((r) => r.arm))];
  const horizons = [240, 480, 960, 1440, 2400];

  const rows = [];
  for (const arm of arms) {
    const armRecords = records.filter((r) => r.arm === arm);
    for (const horizon of horizons) rows.push({ arm, ...armStatistics(armRecords, horizon) });
  }

  const fmt = (x) => (x === undefined ? '   n/a' : x.toFixed(4));
  console.log(`records: ${String(records.length)}`);
  console.log('\narm          horizon  cross   within  cross-within  union  mean  empty  runs');
  for (const row of rows) {
    console.log(
      `${row.arm.padEnd(12)} ${String(row.horizon).padStart(5)}  ${fmt(row.crossStrategy)}  ` +
        `${fmt(row.withinStrategy)}  ${fmt(row.crossMinusWithin).padStart(12)}  ` +
        `${String(row.distinctNodesAcrossArm).padStart(5)}  ${row.meanNodesPerRun.toFixed(1).padStart(5)}  ` +
        `${String(row.emptyRuns).padStart(5)}  ${String(row.runs).padStart(4)}`,
    );
  }

  // Per-arm terminal detail: how many distinct squares an arm actually visited,
  // which is the mechanism the containment numbers are downstream of.
  console.log('\nterminal reasons and tick counts by arm');
  for (const arm of arms) {
    const armRecords = records.filter((r) => r.arm === arm);
    const reasons = {};
    for (const record of armRecords) {
      reasons[record.terminalReason] = (reasons[record.terminalReason] ?? 0) + 1;
    }
    const ticks = armRecords.map((r) => r.ticksRun);
    console.log(
      `${arm.padEnd(12)} reasons ${JSON.stringify(reasons)} mean ticks ` +
        `${(ticks.reduce((s, t) => s + t, 0) / ticks.length).toFixed(0)}`,
    );
  }

  console.log('\nper-strategy terminal node counts by arm');
  const strategies = [...new Set(records.map((r) => r.strategyId))].sort();
  console.log(`${'strategy'.padEnd(22)}${arms.map((a) => a.padStart(12)).join('')}`);
  for (const strategyId of strategies) {
    const cells = arms.map((arm) => {
      const subset = records.filter((r) => r.arm === arm && r.strategyId === strategyId);
      const mean = subset.reduce((s, r) => s + r.terminal.nodeIds.length, 0) / subset.length;
      return mean.toFixed(1).padStart(12);
    });
    console.log(`${strategyId.padEnd(22)}${cells.join('')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
