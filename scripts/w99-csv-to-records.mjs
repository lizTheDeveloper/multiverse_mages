/*
 * Multiverse Mages — W99's committed run records, in the shape the analyser reads.
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
 * ## Why this exists
 *
 * `balance/w99/` committed 1,000 run records **as one CSV**, deliberately, so
 * later work could compare without re-running. `scripts/w99-analyse.mjs` reads
 * a *directory containing a `.runs.ndjson`* — the harness's own output shape —
 * and cannot read that CSV. So the committed records, which exist precisely to
 * be re-compared, are not readable by the one script that does the comparison.
 *
 * This bridges the two, and it is the difference between W117 answering *"does
 * species X differ from species Y on the new build"* and answering the question
 * actually asked: **"what did opening the grid do to species X"**, seed by seed,
 * against the same universes. It reads only committed data and runs no
 * simulation.
 *
 *     node scripts/w99-csv-to-records.mjs --csv balance/w99/w99-runs.csv --out balance/w99/records
 *
 * Writes `<out>/<arm>/<arm>.runs.ndjson`, one directory per arm, which is what
 * `--control` and `--arm` expect.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** The metric columns. Every other column is a coordinate or an outcome. */
const METRIC_COLUMNS = new Set([
  'referenceNodesKnown',
  'referenceNodesGained',
  'referenceNodesGainedFinalQuarter',
  'referenceLibraryDepth',
  'referenceGrimoires',
  'referenceKnowledgeInstances',
  'referenceLivingMages',
  'referencePopulation',
  'referencePopulationChange',
  'referencePeakPopulation',
]);

/** The factor each family varies, so `levels` reads the way a sweep wrote it. */
const FACTOR_OF_FAMILY = { species: 'foundingSpeciesMask', tradition: 'traditionId' };

const argv = process.argv.slice(2);
let csvPath;
let outDir;
for (let i = 0; i < argv.length; i += 2) {
  const flag = argv[i];
  const value = argv[i + 1];
  if (value === undefined) throw new Error(`Flag ${String(flag)} takes a value.`);
  if (flag === '--csv') csvPath = value;
  else if (flag === '--out') outDir = value;
  else throw new Error(`Unknown flag ${String(flag)}.`);
}
if (csvPath === undefined || outDir === undefined) {
  throw new Error('Both --csv and --out are required.');
}

const lines = readFileSync(csvPath, 'utf8').split('\n').filter((line) => line.trim() !== '');
const header = lines[0].split(',');
const byArm = new Map();

for (const line of lines.slice(1)) {
  const cells = line.split(',');
  if (cells.length !== header.length) {
    throw new Error(
      `A row has ${String(cells.length)} fields against a ${String(header.length)}-field header. ` +
        'Refusing to guess which column is which.',
    );
  }
  const row = Object.fromEntries(header.map((name, index) => [name, cells[index]]));

  const metrics = {};
  for (const name of header) {
    if (METRIC_COLUMNS.has(name)) metrics[name] = { value: Number(row[name]) };
  }

  const factor = FACTOR_OF_FAMILY[row.family];
  const rawLevel = row.level;
  const level = /^-?\d+$/.test(rawLevel) ? Number(rawLevel) : rawLevel;

  const record = {
    coordinates: {
      sweepId: row.sweepId,
      rootSeed: Number(row.rootSeed),
      cellIndex: Number(row.cellIndex),
      replicateIndex: Number(row.replicateIndex),
    },
    runSeed: Number(row.runSeed),
    // The analyser reads `strategies[0]`: the sweeps declare `slots: 1`, so the
    // CSV's single `strategy` column is the whole pool for that run.
    strategies: [row.strategy],
    status: row.status,
    terminalReason: row.terminalReason,
    ticksRun: Number(row.ticksRun),
    levels: factor === undefined ? {} : { [factor]: level },
    metrics,
  };

  if (!byArm.has(row.arm)) byArm.set(row.arm, []);
  byArm.get(row.arm).push(record);
}

for (const [arm, records] of byArm) {
  const directory = join(outDir, arm);
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${arm}.runs.ndjson`);
  writeFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  process.stdout.write(`${file}  ${String(records.length)} records\n`);
}
