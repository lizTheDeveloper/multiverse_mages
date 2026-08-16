/*
 * Multiverse Mages — W80: write the price curve into node.json.
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
 * A **textual** edit, not a reserialisation. `node.json` is not byte-identical
 * to `JSON.stringify(data, null, 2)` — some `prerequisites` arrays are written
 * on one line — and rewriting the whole file would bury three hundred price
 * changes in three hundred unrelated whitespace changes. So each node's
 * `researchCost` literal is replaced in place and everything else is left
 * alone, which makes the diff exactly the claim being made.
 *
 *     node tools/w80/apply-price.mjs           # report only
 *     node tools/w80/apply-price.mjs --write
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { priceTable, tierBase } from './price.mjs';

const NODE_PATH = 'packages/content/data/node.json';
const CELL_PATH = 'packages/content/data/cell.json';

const raw = readFileSync(NODE_PATH, 'utf8');
const nodes = JSON.parse(raw);
const cells = JSON.parse(readFileSync(CELL_PATH, 'utf8'));
const cellOf = new Map(cells.map((cell) => [cell.id, cell]));
const v1 = new Set(cells.filter((cell) => cell.v1 === true).map((cell) => cell.id));

const priced = priceTable(nodes, (node) => {
  const cell = cellOf.get(node.cell);
  if (cell === undefined) throw new Error(`node "${node.id}" names unknown cell "${node.cell}"`);
  return cell;
});

let replaced = 0;
const next = raw.replace(
  /"id": "([a-z0-9-]+)",([\s\S]*?)"researchCost": (\d+)/g,
  (whole, id, between) => {
    const entry = priced.get(id);
    if (entry === undefined) return whole;
    replaced += 1;
    return `"id": "${id}",${between}"researchCost": ${String(entry.cost)}`;
  },
);

if (replaced !== nodes.length) {
  throw new Error(`replaced ${String(replaced)} of ${String(nodes.length)} researchCost literals`);
}

const check = JSON.parse(next);
for (const node of check) {
  const want = priced.get(node.id).cost;
  if (node.researchCost !== want) {
    throw new Error(`node "${node.id}" reads ${String(node.researchCost)}, wanted ${String(want)}`);
  }
}

/** Geometric mean, because the band is multiplicative. */
function geomean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

const tiers = [...new Set(nodes.map((node) => node.tier))].sort((a, b) => a - b);
process.stdout.write('tier   n  distinct     datum       min       max      base   geomean   drift\n');
for (const tier of tiers) {
  const inTier = nodes.filter((node) => node.tier === tier);
  const costs = inTier.map((node) => priced.get(node.id).cost);
  const base = tierBase(tier);
  const gm = geomean(costs);
  process.stdout.write(
    `${String(tier).padStart(4)} ${String(costs.length).padStart(3)} ` +
      `${String(new Set(costs).size).padStart(9)} ` +
      `${priced.get(inTier[0].id).datum.toFixed(2).padStart(9)} ` +
      `${String(Math.min(...costs)).padStart(9)} ` +
      `${String(Math.max(...costs)).padStart(9)} ${String(base).padStart(9)} ` +
      `${gm.toFixed(0).padStart(9)} ${`${(((gm / base) - 1) * 100).toFixed(2)}%`.padStart(7)}\n`,
  );
}

const rails = nodes.filter((node) => priced.get(node.id).clamped);
process.stdout.write(`\nclamped to a rail: ${String(rails.length)}${rails.length > 0 ? ` (${rails.map((node) => node.id).join(', ')})` : ''}\n`);

process.stdout.write('\nthe twelve v1 cells, tier-1 root, cheapest first:\n');
const roots = nodes
  .filter((node) => v1.has(node.cell) && node.tier === 1)
  .sort((a, b) => priced.get(a.id).cost - priced.get(b.id).cost);
for (const node of roots) {
  const { cost, grade, terms } = priced.get(node.id);
  process.stdout.write(
    `${String(cost).padStart(5)}  g=${String(grade).padStart(3)}  ` +
      `reach ${String(terms.reach).padStart(3)}  payload ${String(terms.payload).padStart(2)}  ` +
      `tech ${String(terms.technique).padStart(3)}  form ${String(terms.form).padStart(3)}  ` +
      `metis ${String(terms.metis).padStart(2)}  ${node.cell.padEnd(17)} ${node.id}\n`,
  );
}

if (process.argv.includes('--write')) {
  writeFileSync(NODE_PATH, next);
  process.stdout.write(`\nwrote ${NODE_PATH}\n`);
} else {
  process.stdout.write('\n(report only; pass --write to edit node.json)\n');
}
