/*
 * Multiverse Mages — W58 Test 1: does a random bot beat the strategy pool?
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
 * ## The question, and why the committed sweep cannot answer it
 *
 * *"Report `uniform-random-legal`'s standalone rate against every other
 * strategy, plainly."*
 *
 * `balance-gate-ascension.sweep.json` uses `assignment: "round-robin"`, which
 * `assignStrategies` implements as `strategies[replicateIndex % poolSize]`. Each
 * strategy therefore gets a **disjoint** set of replicate indexes, and
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` — so no two strategies in that sweep ever play the same
 * universe. Any per-strategy difference read off it is confounded with seed.
 *
 * Here every strategy walks the **identical** coordinate grid. `deriveRunSeed`
 * ignores the strategy, so at every `(cellIndex, replicateIndex)` all eight
 * strategies get the same run seed and therefore the same starting universe;
 * `agent-rng` derives the agent-side stream from `(runSeed, slot, strategyId)`,
 * so their tie-breaks still differ. That is common random numbers in the
 * variance-reduction sense: shared environment, unshared decisions. It also
 * makes a **paired** comparison possible — for each world, did the probe reach
 * the summit where the strategy did not?
 *
 * ## What is reported
 *
 * Counts. `ascended / runs` per (strategy, starting position), the terminal
 * reason behind each ascension, and the raw per-run rows. No derived margin: the
 * one the codebase computes is examined separately in `analyse1.mjs`, and the
 * mandate is explicit that a derived score with a disputable definition is not
 * the answer.
 *
 *     node tools/w58/test1.mjs --strategies uniform-random-legal --replicates 16 \
 *       --out mc-results/w58/test1
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CELLS,
  POOL,
  ROOT_SEED,
  SWEEP_ID,
  content,
  parseArgs,
  probeIsInert,
  runInstrumented,
} from './harness.mjs';

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategies = (args.strategies ?? POOL.join(',')).split(',').filter(Boolean);
  const replicates = Number(args.replicates ?? 16);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? 'mc-results/w58/test1';

  const resolved = content();
  mkdirSync(out, { recursive: true });

  for (const strategyId of strategies) {
    const started = Date.now();
    const runs = [];
    // The validity gate, once per strategy, on the first coordinate it plays.
    const inert = probeIsInert(
      resolved,
      strategyId,
      { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: 0, replicateIndex: 0 },
      CELLS[0].options,
      worldTickCap,
    );
    for (const cell of CELLS) {
      for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
        const run = runInstrumented({
          content: resolved,
          strategyId,
          coordinates: {
            rootSeed: ROOT_SEED,
            sweepId: SWEEP_ID,
            cellIndex: cell.cellIndex,
            replicateIndex,
          },
          options: cell.options,
          worldTickCap,
          keepSamples: false,
        });
        runs.push({
          strategyId,
          cellIndex: cell.cellIndex,
          cellLabel: cell.label,
          replicateIndex,
          runSeed: run.runSeed,
          status: run.status,
          terminalReason: run.terminalReason,
          ticksRun: run.ticksRun,
          snapshotHash: run.snapshotHash,
          submissions: run.accounting.submissions,
          rejections: run.accounting.rejections,
          rejectedByAction: run.accounting.byActionId,
          submittedByAction: run.submittedByAction,
          terminal: run.terminal,
        });
        process.stderr.write(
          `${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `${run.status}/${String(run.terminalReason)} ticks=${String(run.ticksRun)} ` +
            `nodes=${String(run.terminal?.nodesKnown ?? -1)}\n`,
        );
      }
    }
    const path = join(out, `test1__${strategyId}.json`);
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          test: 'w58-test1-probe-vs-pool',
          sweepId: SWEEP_ID,
          rootSeed: ROOT_SEED,
          strategyId,
          replicates,
          worldTickCap,
          cells: CELLS,
          probeInertness: inert,
          wallClockMs: Date.now() - started,
          runs,
        },
        null,
        1,
      )}\n`,
    );
    process.stderr.write(`wrote ${path}\n`);
  }
}

main();
