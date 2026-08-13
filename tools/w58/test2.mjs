/*
 * Multiverse Mages — W58 Test 2: do opposed strategies diverge before scoring?
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
 * ## The question
 *
 * *"Is the simulation insensitive, or is the measurement hiding it?"* Same seed,
 * deliberately opposed strategies, instrumented **before** anything scores them.
 *
 * The arms are opposed on the axis the god actually controls. `permissive-breadth`
 * opens every technique and form it can; `denial-warden` is the symmetric half and
 * spends its budget forbidding. `passive-control` never acts, and
 * `uniform-random-legal` presses buttons at random — between them they bracket
 * "no input" and "unstructured input", so a difference between the two designed
 * arms can be read against a scale.
 *
 * Every arm plays the identical `(cellIndex, replicateIndex)` grid, so at each
 * coordinate all four arms are in the same starting universe. That is what makes
 * the strategy-versus-seed decomposition a decomposition rather than two
 * unrelated numbers.
 *
 * ## What a null here would and would not mean
 *
 * A quantity that is the same under every strategy is only evidence of an
 * insensitive simulation if the quantity is *capable* of differing. A field that
 * is read through a failed lookup and silently written as `0` is identical
 * everywhere for a reason that has nothing to do with the game. `analyse2.mjs`
 * therefore classifies every measured quantity as live (varies across seeds),
 * strategy-sensitive, or inert, and never reports a null for a field it has not
 * first shown to be live.
 *
 *     node tools/w58/test2.mjs --strategies permissive-breadth --replicates 8 \
 *       --out mc-results/w58/test2
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CELLS,
  ROOT_SEED,
  SWEEP_ID,
  content,
  parseArgs,
  probeIsInert,
  runInstrumented,
} from './harness.mjs';

/** The four arms, in the order the writeup reads them. */
export const ARMS = Object.freeze([
  'permissive-breadth',
  'denial-warden',
  'passive-control',
  'uniform-random-legal',
]);

/** The two starting positions, the committed ascension sweep's corner cells. */
const TEST2_CELLS = Object.freeze([CELLS[0], CELLS[3]]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategies = (args.strategies ?? ARMS.join(',')).split(',').filter(Boolean);
  const replicates = Number(args.replicates ?? 8);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? 'mc-results/w58/test2';

  const resolved = content();
  mkdirSync(out, { recursive: true });

  for (const strategyId of strategies) {
    const started = Date.now();
    const runs = [];
    const inert = probeIsInert(
      resolved,
      strategyId,
      { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: 0, replicateIndex: 0 },
      TEST2_CELLS[0].options,
      worldTickCap,
    );
    for (const cell of TEST2_CELLS) {
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
          keepSamples: true,
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
          submittedParameters: run.submittedParameters,
          samples: run.samples,
          terminal: run.terminal,
        });
        process.stderr.write(
          `${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `${run.status}/${String(run.terminalReason)} ticks=${String(run.ticksRun)} ` +
            `samples=${String(run.samples.length)}\n`,
        );
      }
    }
    const path = join(out, `test2__${strategyId}.json`);
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          test: 'w58-test2-trajectory-divergence',
          sweepId: SWEEP_ID,
          rootSeed: ROOT_SEED,
          strategyId,
          replicates,
          worldTickCap,
          cells: TEST2_CELLS,
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
