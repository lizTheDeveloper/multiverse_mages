/*
 * Multiverse Mages — W80: execute one arm of the discovery-order measurement.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The before-arm and the after-arm walk the **identical** coordinate grid —
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` and all four are held constant here — so the only difference
 * between the two arms is the content the tree was built from. An arm taken
 * from the committed round-robin sweep would compare seeds instead.
 *
 *     node tools/w80/run-arm.mjs --out .w80/before --tag before
 *
 * One JSON file per strategy, so parallel processes never contend. The node
 * table is written beside the runs so the analysis can map interned ids to
 * cells, tiers and costs without re-resolving content.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CELLS, POOL, ROOT_SEED, SWEEP_ID, content, probeIsInert, runOne } from './first-seen.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

/** Interned id → the authored fields the analysis groups on. */
function nodeTable(resolved) {
  return resolved.registry.nodes.map((entry) => ({
    contentId: entry.contentId,
    id: entry.record.id,
    cell: entry.record.cell,
    tier: entry.record.tier,
    researchCost: entry.record.researchCost,
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategies = (args.strategies ?? POOL.join(',')).split(',').filter(Boolean);
  const replicates = Number(args.replicates ?? 6);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? '.w80/out';
  const tag = args.tag ?? 'arm';

  const resolved = content();
  mkdirSync(out, { recursive: true });

  writeFileSync(
    join(out, '_nodes.json'),
    `${JSON.stringify(
      { contentRevision: resolved.registry.contentRevision, nodes: nodeTable(resolved) },
      null,
      1,
    )}\n`,
  );

  if (args.inert !== undefined) {
    const report = probeIsInert(resolved, args.inert, { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: 0, replicateIndex: 0 }, 1200);
    writeFileSync(join(out, `_inert__${args.inert}.json`), `${JSON.stringify(report, null, 1)}\n`);
    process.stderr.write(`${tag} probe-inert ${args.inert} agrees=${String(report.agrees)}\n`);
    return;
  }

  for (const strategyId of strategies) {
    const runs = [];
    const started = Date.now();
    for (const cell of CELLS) {
      for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
        const run = runOne({
          content: resolved,
          strategyId,
          coordinates: { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: cell.cellIndex, replicateIndex },
          options: { ...cell.options },
          worldTickCap,
        });
        runs.push(run);
        process.stderr.write(
          `${tag} ${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `ticks=${String(run.ticksRun)} reason=${String(run.terminalReason)} ` +
            `founded=${String(run.founded.length)} discovered=${String(run.discovered.length)}\n`,
        );
      }
    }
    const path = join(out, `${tag}__${strategyId}.json`);
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          tag,
          sweepId: SWEEP_ID,
          rootSeed: ROOT_SEED,
          contentRevision: resolved.registry.contentRevision,
          strategyId,
          worldTickCap,
          replicates,
          cells: CELLS,
          wallClockMs: Date.now() - started,
          runs,
        },
        null,
        1,
      )}\n`,
    );
    process.stderr.write(`${tag} wrote ${path}\n`);
  }
}

main();
