/*
 * Multiverse Mages — W158: reading the axis-price sweep.
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
 * Folds `run-arm.mjs`'s shards into the three tables the question needs.
 *
 * **It reads the manifests, not a glob.** `CLAUDE.md` catalogues five separate
 * aggregators in this repository that located their input by shape or by
 * directory listing and confidently reported some other run's numbers. Each
 * manifest names exactly one file and the coordinates it holds; a shard whose
 * manifest is missing is reported as missing rather than skipped.
 *
 * ## The three tables
 *
 * 1. **The square's gap.** `wide − narrow` distinct nodes, per price, per
 *    strategy, paired within (cell, replicate) so the seed cancels. This is
 *    #156's number and it is the one that answers the question.
 * 2. **What the god bought.** Mean open techniques and forms at termination.
 *    A gap that opens because the god could not buy the grid and a gap that
 *    opens because the universe did not use it look identical in table 1.
 * 3. **Pairing check.** The count of paired observations behind every row, so a
 *    partial sweep cannot be read as a complete one.
 *
 * Standard errors are of the **paired difference**, which is the estimator the
 * design supports: every (price, strategy, cell, replicate) coordinate runs both
 * openings on the same seed.
 *
 *     node tools/w158/analyse.mjs --out .w158
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

/** Every record this run produced, located through its manifests. */
export function load(out) {
  const manifests = readdirSync(out).filter((name) => name.endsWith('.manifest.json'));
  if (manifests.length === 0) {
    throw new Error(
      `No manifest under ${out}. This tool refuses to read a directory by glob: a run's records ` +
        'are the files its own manifests name, and anything else is some other run.',
    );
  }
  const rows = [];
  const missing = [];
  for (const name of manifests) {
    const manifest = JSON.parse(readFileSync(join(out, name), 'utf8'));
    let text;
    try {
      text = readFileSync(join(out, manifest.file), 'utf8');
    } catch {
      missing.push(manifest.file);
      continue;
    }
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    for (const line of lines) rows.push(JSON.parse(line));
    if (lines.length !== manifest.runs) {
      missing.push(`${manifest.file} (manifest claims ${String(manifest.runs)}, holds ${String(lines.length)})`);
    }
  }
  return { rows, missing, manifests: manifests.length };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Standard error of a sample mean. `NaN` for n < 2, deliberately: it is not 0. */
function standardError(values) {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function pad(text, width) {
  return String(text).padStart(width);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = args.out ?? '.w158';
  const { rows, missing, manifests } = load(out);

  console.log(`# W158 — the axis-price sweep`);
  console.log(`${String(rows.length)} runs from ${String(manifests)} shards.`);
  if (missing.length > 0) console.log(`INCOMPLETE — ${missing.join(', ')}`);
  console.log('');

  // Pair on (price, strategy, cell, replicate); the two openings are the arms.
  const paired = new Map();
  for (const row of rows) {
    const key = `${String(row.price)}|${row.strategyId}|${String(row.cellIndex)}|${String(row.replicateIndex)}`;
    const entry = paired.get(key) ?? {};
    entry[row.opening] = row;
    paired.set(key, entry);
  }

  const byArm = new Map();
  for (const [key, entry] of paired) {
    const narrow = entry['narrow-1x2'];
    const wide = entry['wide-3x4'];
    if (narrow === undefined || wide === undefined) continue;
    const [price, strategyId] = key.split('|');
    const armKey = `${price}|${strategyId}`;
    const arm = byArm.get(armKey) ?? { gaps: [], narrow: [], wide: [], axes: [], cost: narrow.permitTechniqueCost };
    arm.gaps.push(wide.distinctNodes - narrow.distinctNodes);
    arm.narrow.push(narrow.distinctNodes);
    arm.wide.push(wide.distinctNodes);
    arm.axes.push({
      narrow: [narrow.openTechniques, narrow.openForms],
      wide: [wide.openTechniques, wide.openForms],
    });
    byArm.set(armKey, arm);
  }

  const strategies = [...new Set(rows.map((row) => row.strategyId))].sort();
  const prices = [...new Set(rows.map((row) => row.price))].sort((a, b) => a - b);

  console.log('## Distinct nodes: wide 3x4 minus narrow 1x2, paired within seed');
  console.log('');
  console.log(
    `${pad('strategy', 22)}${pad('price', 8)}${pad('x', 5)}${pad('tech fp', 9)}${pad('n', 4)}` +
      `${pad('narrow', 9)}${pad('wide', 8)}${pad('gap', 8)}${pad('SE', 8)}`,
  );
  for (const strategyId of strategies) {
    for (const price of prices) {
      const arm = byArm.get(`${String(price)}|${strategyId}`);
      if (arm === undefined) continue;
      console.log(
        `${pad(strategyId, 22)}${pad(price, 8)}${pad(`${String(price / 1024)}x`, 5)}` +
          `${pad(arm.cost, 9)}${pad(arm.gaps.length, 4)}` +
          `${pad(mean(arm.narrow).toFixed(1), 9)}${pad(mean(arm.wide).toFixed(1), 8)}` +
          `${pad(mean(arm.gaps).toFixed(1), 8)}${pad(standardError(arm.gaps).toFixed(2), 8)}`,
      );
    }
    console.log('');
  }

  console.log('## What the god actually bought: open techniques x forms at termination');
  console.log('(the opening is 1x2 narrow and 3x4 wide; 5x14 is the whole grid)');
  console.log('');
  console.log(`${pad('strategy', 22)}${pad('price', 8)}${pad('x', 5)}${pad('narrow', 12)}${pad('wide', 12)}`);
  for (const strategyId of strategies) {
    for (const price of prices) {
      const arm = byArm.get(`${String(price)}|${strategyId}`);
      if (arm === undefined) continue;
      const meanAxis = (side, index) => mean(arm.axes.map((entry) => entry[side][index])).toFixed(1);
      console.log(
        `${pad(strategyId, 22)}${pad(price, 8)}${pad(`${String(price / 1024)}x`, 5)}` +
          `${pad(`${meanAxis('narrow', 0)}x${meanAxis('narrow', 1)}`, 12)}` +
          `${pad(`${meanAxis('wide', 0)}x${meanAxis('wide', 1)}`, 12)}`,
      );
    }
    console.log('');
  }

  const rejections = rows.reduce((sum, row) => sum + row.rejections, 0);
  console.log(
    `## Submissions ${String(rows.reduce((sum, row) => sum + row.submissions, 0))}, ` +
      `rejections ${String(rejections)}.`,
  );
  console.log(
    rejections === 0
      ? 'Zero, as designed: the pool fall-through submits only what the mask admits, so an ' +
          'unaffordable permit is a *substitution* and never a rejection. The axis columns above ' +
          'are therefore the only reading that can see affordability.'
      : 'Non-zero — a strategy submitted something the mask refused. Read the axis columns with ' +
          'that in mind.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
