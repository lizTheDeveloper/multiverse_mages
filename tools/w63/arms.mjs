/*
 * Multiverse Mages — W63: the before-arm and the after-arm, on one binary.
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
 * ## Why the two arms differ by a constant and not by a checkout
 *
 * The obvious way to measure "before and after" is two worktrees. It is the
 * wrong way here, and the reason is the same one that made `ascension-
 * institutions` have an identity value at all: at **0** the predicate is
 * exactly the one that shipped, and `god-ascension-identity-differential.test.ts`
 * asserts that against a transcription of `origin/main`'s own function over
 * 20,000 randomised fact sets. So a run at 0 *is* the before-arm, and running
 * both from one build removes every difference that is not the rule — node
 * version, content digest, the two merges that landed on `main` mid-branch, and
 * the `open-then-build` strategy which does not exist on the other side.
 *
 * It also measures the bisectability claim rather than asserting it. If the two
 * arms come out identical the conjunct does nothing; if the before-arm does not
 * reproduce the committed n=400 shape, the identity value is not an identity and
 * that is a finding about this change.
 *
 * ## What is overridden, and how narrowly
 *
 * `referenceContent()` is called once and the single scalar
 * `deps.god.content.constants.ascensionInstitutions` is replaced on the returned
 * object. Nothing else is touched: same registry, same catalogue, same interned
 * ids, same `foundingNodeIds`, same axes. The god constants object is rebuilt
 * rather than mutated in place so the two arms cannot share a reference and
 * drift.
 *
 *     node tools/w63/arms.mjs --arm after  --strategies passive-control --replicates 10
 *     node tools/w63/arms.mjs --arm before --strategies passive-control --replicates 10
 *
 * Output is `test1__<strategy>.json` in the shape `tools/w58/test1.mjs` writes,
 * so `tools/w63/qualification.mjs` reads either arm without knowing which it is.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CELLS, POOL, ROOT_SEED, SWEEP_ID, content, parseArgs, probeIsInert, runInstrumented } from '../w58/harness.mjs';

/** The identity value. `ascension.ts` and the differential test both name it. */
const BEFORE = 0;

/**
 * The shipped value, read from content rather than written here.
 *
 * A literal 2 in this file would be a second place the constant lives, and the
 * first thing to go stale when it is tuned.
 */
function shippedInstitutions(resolved) {
  return resolved.deps.god.content.constants.ascensionInstitutions;
}

/** `resolved`, with one god constant replaced. Structural, never in place. */
function withInstitutions(resolved, value) {
  const god = resolved.deps.god;
  return {
    ...resolved,
    deps: {
      ...resolved.deps,
      god: {
        ...god,
        content: {
          ...god.content,
          constants: { ...god.content.constants, ascensionInstitutions: value },
        },
      },
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const arm = args.arm ?? 'after';
  if (arm !== 'before' && arm !== 'after') {
    throw new Error(`--arm must be "before" or "after", not ${String(arm)}.`);
  }
  const strategies = (args.strategies ?? POOL.join(',')).split(',').filter(Boolean);
  const replicates = Number(args.replicates ?? 10);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? `mc-results/w63/${arm}`;

  const base = content();
  const shipped = shippedInstitutions(base);
  const value = arm === 'before' ? BEFORE : shipped;
  const resolved = withInstitutions(base, value);

  mkdirSync(out, { recursive: true });
  process.stderr.write(`arm=${arm} ascensionInstitutions=${String(value)} (shipped ${String(shipped)})\n`);

  for (const strategyId of strategies) {
    const started = Date.now();
    const runs = [];
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
          coordinates: { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: cell.cellIndex, replicateIndex },
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
          `[${arm}] ${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `${run.status}/${String(run.terminalReason)} ticks=${String(run.ticksRun)} ` +
            `nodes=${String(run.terminal?.nodesKnown ?? -1)} unis=${String(run.terminal?.universities ?? -1)} ` +
            `firstMet=${String(run.terminal?.ascensionFirstMetTick ?? -1)}\n`,
        );
      }
    }
    const path = join(out, `test1__${strategyId}.json`);
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          test: 'w63-institution-conjunct',
          arm,
          ascensionInstitutions: value,
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
