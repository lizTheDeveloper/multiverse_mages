/*
 * Multiverse Mages — W80: how many orderings, and how nested.
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
 * Reads the arm files `run-arm.mjs` wrote and answers three questions:
 *
 * 1. **how many distinct orderings** the tier-1 nodes are first discovered in —
 *    overall, and grouped by `(strategy, starting cell)`, because the brief's
 *    null is *"one, or a small number determined only by which cells the god
 *    permitted"* and only the grouped view can tell those two apart;
 * 2. the **spread of per-cell first-discovery time**, which should be near zero
 *    at tier 1 if every universe opens the same door at the same moment;
 * 3. **containment** `|A∩B| / min(|A|,|B|)` of held sets at era horizons,
 *    cross-strategy against the within-strategy diagonal — W19's measurement,
 *    and the one the brief names as falsifying.
 *
 * Ordering is always canonicalised as `sort by (firstTick, nodeId)`; the
 * tie-grouped form (same tick collapsed to a sorted set) is reported beside it
 * so that a change which merely spreads completions over more ticks cannot
 * present itself as new orderings.
 *
 *     node tools/w80/analyse.mjs .w80/before [.w80/after]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function loadArm(dir) {
  const table = JSON.parse(readFileSync(join(dir, '_nodes.json'), 'utf8'));
  const byId = new Map(table.nodes.map((node) => [node.contentId, node]));
  const runs = readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
    .sort()
    .flatMap((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')).runs);
  return { dir, contentRevision: table.contentRevision, byId, runs };
}

/** A run's key — strategy and starting position, the two labels grouped on. */
function keyOf(run) {
  return `${run.strategyId}|cell${String(run.coordinates.cellIndex)}`;
}

/** The coordinate a run sits at, so before and after can be paired universe-for-universe. */
function coordOf(run) {
  return `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;
}

/** Tier-1 discoveries only, in canonical order, as a string. */
function tierOneOrder(arm, run, grouped) {
  const rows = run.discovered.filter((entry) => arm.byId.get(entry.nodeId)?.tier === 1);
  if (!grouped) return rows.map((entry) => arm.byId.get(entry.nodeId).id).join(' ');
  const groups = [];
  for (const entry of rows) {
    const last = groups.at(-1);
    if (last !== undefined && last.tick === entry.tick) last.ids.push(arm.byId.get(entry.nodeId).id);
    else groups.push({ tick: entry.tick, ids: [arm.byId.get(entry.nodeId).id] });
  }
  return groups.map((group) => group.ids.sort().join('+')).join(' ');
}

function distinct(values) {
  return new Set(values).size;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

/** The held set at the last era sample at or before `horizon`, or undefined. */
function heldAt(run, horizon) {
  let best;
  for (const sample of run.samples) {
    if (sample.worldTick <= horizon && (best === undefined || sample.worldTick > best.worldTick)) {
      best = sample;
    }
  }
  if (best === undefined) return undefined;
  if (run.ticksRun < horizon) return undefined;
  return new Set(best.nodeIds);
}

function containment(a, b) {
  const smaller = a.size <= b.size ? a : b;
  const larger = smaller === a ? b : a;
  if (smaller.size === 0) return Number.NaN;
  let shared = 0;
  for (const value of smaller) if (larger.has(value)) shared += 1;
  return shared / smaller.size;
}

function mean(values) {
  const live = values.filter((value) => Number.isFinite(value));
  return live.length === 0 ? Number.NaN : live.reduce((sum, value) => sum + value, 0) / live.length;
}

function report(arm) {
  const runs = arm.runs;
  process.stdout.write(`\n=== ${arm.dir}  contentRevision ${arm.contentRevision}  ${String(runs.length)} runs ===\n`);

  for (const grouped of [false, true]) {
    const label = grouped ? 'tie-grouped' : 'strict';
    const all = runs.map((run) => tierOneOrder(arm, run, grouped));
    process.stdout.write(`\ntier-1 discovery orderings (${label}): ${String(distinct(all))} distinct across ${String(all.length)} runs\n`);
    const byKey = new Map();
    for (const [index, run] of runs.entries()) {
      const key = keyOf(run);
      byKey.set(key, [...(byKey.get(key) ?? []), all[index]]);
    }
    for (const [key, values] of [...byKey].sort()) {
      process.stdout.write(`  ${key.padEnd(34)} ${String(distinct(values))} distinct / ${String(values.length)} runs\n`);
    }
  }

  process.stdout.write('\nthe first door opened, by run (the node discovered earliest, ties listed together):\n');
  const firstDoor = new Map();
  for (const run of runs) {
    const head = run.discovered[0];
    if (head === undefined) continue;
    const ids = run.discovered
      .filter((entry) => entry.tick === head.tick)
      .map((entry) => arm.byId.get(entry.nodeId)?.id ?? String(entry.nodeId))
      .sort()
      .join('+');
    firstDoor.set(ids, (firstDoor.get(ids) ?? 0) + 1);
  }
  for (const [ids, count] of [...firstDoor].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${String(count).padStart(3)}  ${ids}\n`);
  }

  process.stdout.write('\nfirst-discovery tick, by tier (over every run and node):\n');
  const byTier = new Map();
  for (const run of runs) {
    for (const entry of run.discovered) {
      const node = arm.byId.get(entry.nodeId);
      if (node === undefined) continue;
      const bucket = byTier.get(node.tier) ?? new Map();
      bucket.set(node.id, [...(bucket.get(node.id) ?? []), entry.tick]);
      byTier.set(node.tier, bucket);
    }
  }
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const perNode = [...byTier.get(tier).values()];
    const spreads = perNode.map((ticks) => stdev(ticks));
    process.stdout.write(
      `  tier ${String(tier)}: ${String(perNode.length)} nodes, mean across-run sd of first-discovery tick ` +
        `${mean(spreads).toFixed(1)}, median ${[...spreads].sort((a, b) => a - b)[Math.floor(spreads.length / 2)].toFixed(1)}\n`,
    );
  }

  process.stdout.write('\ncontainment |A∩B|/min(|A|,|B|) at era horizons:\n');
  process.stdout.write('  horizon   n runs   cross-strategy   within-strategy   cross - within\n');
  const horizons = [240, 480, 720, 960, 1200, 1440, 1680, 1920, 2160, 2400];
  for (const horizon of horizons) {
    const live = runs
      .map((run) => ({ run, held: heldAt(run, horizon) }))
      .filter((entry) => entry.held !== undefined && entry.held.size > 0);
    if (live.length < 4) continue;
    const cross = [];
    const within = [];
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i];
        const b = live[j];
        const value = containment(a.held, b.held);
        if (a.run.strategyId === b.run.strategyId) {
          if (coordOf(a.run) !== coordOf(b.run)) within.push(value);
        } else if (coordOf(a.run) === coordOf(b.run)) {
          cross.push(value);
        }
      }
    }
    process.stdout.write(
      `  ${String(horizon).padStart(7)} ${String(live.length).padStart(8)} ` +
        `${mean(cross).toFixed(4).padStart(16)} ${mean(within).toFixed(4).padStart(17)} ` +
        `${(mean(cross) - mean(within)).toFixed(4).padStart(15)}\n`,
    );
  }

  const terminal = runs.map((run) => [...new Set(run.terminal.nodeIds)].sort((a, b) => a - b).join(','));
  process.stdout.write('\ncontainment of the EVER-KNOWN set at fine horizons (reconstructed from first-seen\n');
  process.stdout.write('ticks, so a node lost after discovery still counts; W19\'s shortest horizons live here):\n');
  process.stdout.write('  horizon   n runs   cross-strategy   within-strategy   cross - within\n');
  for (const horizon of [30, 60, 120, 240, 480, 960, 1920]) {
    const live = runs
      .map((run) => ({
        run,
        held: new Set([
          ...run.founded,
          ...run.discovered.filter((entry) => entry.tick <= horizon).map((entry) => entry.nodeId),
        ]),
      }))
      .filter((entry) => entry.run.ticksRun >= horizon && entry.held.size > 0);
    if (live.length < 4) continue;
    const cross = [];
    const within = [];
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i];
        const b = live[j];
        const value = containment(a.held, b.held);
        if (a.run.strategyId === b.run.strategyId) {
          if (coordOf(a.run) !== coordOf(b.run)) within.push(value);
        } else if (coordOf(a.run) === coordOf(b.run)) {
          cross.push(value);
        }
      }
    }
    process.stdout.write(
      `  ${String(horizon).padStart(7)} ${String(live.length).padStart(8)} ` +
        `${mean(cross).toFixed(4).padStart(16)} ${mean(within).toFixed(4).padStart(17)} ` +
        `${(mean(cross) - mean(within)).toFixed(4).padStart(15)}\n`,
    );
  }

  process.stdout.write(`\ndistinct terminal held-sets: ${String(distinct(terminal))} across ${String(terminal.length)} runs\n`);
  return { runs };
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) throw new Error('usage: node tools/w80/analyse.mjs <arm-dir> [<arm-dir>...]');
for (const dir of dirs) report(loadArm(dir));
