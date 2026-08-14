/*
 * Multiverse Mages — W70: the opening-square size sweep.
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
 * ## What this measures, and why it reuses W15 rather than replacing it
 *
 * The question is the one W15 and W19 asked — *does the strategy space have
 * more than one dimension* — asked again with the opening square as the factor.
 * W15's `composition.mjs` already solves the hard half: no committed record in
 * this repository carries node **identity**, so the composition has to be read
 * off `collectRecords(state, KNOWLEDGE_INSTANCE)` through an appended probe
 * whose inertness is itself checked. That machinery is imported verbatim. All
 * this file adds is the arm definition.
 *
 * ## The five arms, and why the control is the shape it is
 *
 * | arm | opening | what it is |
 * |---|---|---|
 * | `v1-3x4` | the twelve `v1` cells | **today's behaviour**, byte for byte |
 * | `seeded-1x1` | 1 technique × 1 form | the tight degenerate end |
 * | `seeded-2x2` | 2 × 2 | the owner's intuition |
 * | `seeded-3x3` | 3 × 3 | |
 * | `seeded-3x4` | 3 × 4 | **today's size, drawn rather than authored** |
 *
 * `seeded-3x4` is the arm that makes the sweep interpretable. Without it the
 * control differs from every other arm in *two* ways at once — its size and the
 * fact that its square was chosen by a content author rather than by a seed —
 * and a difference between `v1-3x4` and `seeded-2x2` could be attributed to
 * either. With it, `v1-3x4` vs `seeded-3x4` isolates *position at fixed size*
 * and `seeded-1x1 … seeded-3x4` isolates *size at fixed method*.
 *
 * ## Common random numbers, and the defect this sweep must not repeat
 *
 * The campaign has already been burned once here: the committed
 * `balance-gate-ascension` sweep assigns strategies **round-robin**, dealing
 * each a disjoint set of replicate indexes, so no two strategies in it ever
 * played the same universe — and a strategy comparison taken from it was
 * comparing seeds. Every arm below walks the **identical** coordinate grid and
 * the opening square is supplied out of band, exactly as W15 did.
 *
 * The seeded arms are additionally **nested**: `seededOpeningAxes` draws a full
 * permutation of both axes and each size takes a prefix, so at one coordinate
 * the 1×1 square is inside the 2×2 which is inside the 3×3. Size is the only
 * factor that moves between the seeded arms.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { POOL, content, runOne } from '../w15/composition.mjs';

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w70-opening-square-v1';

/** The root seed, matching W15's so the universes are the familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * The two starting positions, and their cell indexes in the committed ascension
 * sweep's canonical expansion. Identical to W15's, so that within-strategy
 * variance here carries the same seed-and-position noise its diagonal does.
 */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/**
 * The five arms. `undefined` counts mean the v1 rectangle — today's universe.
 *
 * **`openingSquareSeeded: 1` is carried explicitly on every seeded arm**, and
 * it is not decoration. The default answer to "who chooses the square" is now
 * the god (`reference-universe.ts`), so an arm that named only a size would
 * quietly become a *standard* opening and W82's numbers would no longer be
 * reproducible from this file. The flag is what keeps these arms the arms W82
 * ran.
 */
export const ARMS = Object.freeze([
  { id: 'v1-3x4', options: {} },
  { id: 'seeded-1x1', options: { openingTechniqueCount: 1, openingFormCount: 1, openingSquareSeeded: 1 } },
  { id: 'seeded-2x2', options: { openingTechniqueCount: 2, openingFormCount: 2, openingSquareSeeded: 1 } },
  { id: 'seeded-3x3', options: { openingTechniqueCount: 3, openingFormCount: 3, openingSquareSeeded: 1 } },
  { id: 'seeded-3x4', options: { openingTechniqueCount: 3, openingFormCount: 4, openingSquareSeeded: 1 } },
]);

/**
 * Every run this sweep intends, in a fixed order so shards partition cleanly.
 *
 * **Replicate-major, and that ordering is load-bearing.** Arm-major would have
 * the whole pool finish `v1-3x4` before touching `seeded-1x1`, so a sweep
 * stopped early would hold every replicate of one arm and none of another —
 * which is not a smaller version of this experiment, it is a different one with
 * no comparison in it. Replicate-major means an interrupted sweep still holds
 * every arm at every strategy for as many replicates as it got through, and the
 * containment statistic is defined on that.
 */
export function plan(replicates) {
  const jobs = [];
  for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
    for (const arm of ARMS) {
      for (const strategyId of POOL) {
        for (const cell of CELLS) {
          jobs.push({ arm: arm.id, armOptions: arm.options, strategyId, cell, replicateIndex });
        }
      }
    }
  }
  return jobs;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const replicates = Number(args.replicates ?? 6);
  const worldTickCap = Number(args.ticks ?? 2400);
  const shard = Number(args.shard ?? 0);
  const shards = Number(args.shards ?? 1);
  const out = args.out ?? '.w70';

  const resolved = content();
  mkdirSync(out, { recursive: true });

  const jobs = plan(replicates).filter((_job, index) => index % shards === shard);
  const records = [];
  for (const job of jobs) {
    const started = Date.now();
    const run = runOne({
      content: resolved,
      strategyId: job.strategyId,
      coordinates: {
        rootSeed: ROOT_SEED,
        sweepId: SWEEP_ID,
        cellIndex: job.cell.cellIndex,
        replicateIndex: job.replicateIndex,
      },
      options: { ...job.cell.options, ...job.armOptions },
      worldTickCap,
      probe: true,
    });
    records.push({
      arm: job.arm,
      strategyId: job.strategyId,
      cellIndex: job.cell.cellIndex,
      replicateIndex: job.replicateIndex,
      runSeed: run.runSeed,
      snapshotHash: run.snapshotHash,
      terminalReason: run.terminalReason,
      ticksRun: run.ticksRun,
      samples: run.samples.map((sample) => ({
        worldTick: sample.worldTick,
        nodeIds: sample.nodeIds,
      })),
      terminal: { worldTick: run.terminal.worldTick, nodeIds: run.terminal.nodeIds },
      elapsedMs: Date.now() - started,
    });
    process.stderr.write(
      `${job.arm} ${job.strategyId} c${String(job.cell.cellIndex)}r${String(job.replicateIndex)} ` +
        `-> ${String(run.terminal.nodeIds.length)} nodes, ${String(run.ticksRun)} ticks\n`,
    );
    // Rewritten after every run rather than once at exit. A sweep this long is
    // going to be interrupted at least once, and a shard that only lands its
    // JSON on a clean exit turns an interruption into a total loss of the work
    // already paid for.
    writeFileSync(join(out, `shard-${String(shard)}.json`), JSON.stringify({ records }));
  }
  writeFileSync(join(out, `shard-${String(shard)}.json`), JSON.stringify({ records }));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
