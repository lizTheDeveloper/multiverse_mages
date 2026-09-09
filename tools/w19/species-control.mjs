/*
 * Multiverse Mages — W19: is a species difference bigger than a seed difference?
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
 * The control that makes the species comparison mean anything.
 *
 * *"Gnome and human hold different node sets"* is only a finding if the
 * difference exceeds the one a species has with **itself** across seeds. So the
 * symmetric difference between the two species' unions is reported beside the
 * same statistic computed within one species, by splitting its runs into two
 * halves on replicate parity.
 *
 * Without it, a handful of nodes' difference at a short horizon reads as a niche
 * when it is the ordinary seed-to-seed wobble of a set that is still moving. It
 * is the same discriminator the dimensionality verdict rests on — between-group
 * against within-group — applied to the species question.
 *
 *     node tools/w19/species-control.mjs .w19/arm-sb 30,60,120,180,240
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Content order is draconic, dwarf, elf, gnome, human, orc — masks 1..32. */
const GNOME = 8;
const HUMAN = 16;

const load = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));

/** How many nodes are in one set and not the other, counted both ways. */
function symmetricDifference(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  let count = 0;
  for (const id of left) if (!right.has(id)) count += 1;
  for (const id of right) if (!left.has(id)) count += 1;
  return count;
}

const unionOf = (runs) => [...new Set(runs.flatMap((run) => run.terminal.nodeIds))];

/** Half the runs, split on replicate parity so both halves span both cells. */
const half = (runs, odd) =>
  runs.filter((run) => run.coordinates.replicateIndex % 2 === (odd ? 1 : 0));

function main() {
  const root = process.argv[2] ?? '.w19/arm-b';
  const horizons = (process.argv[3] ?? '300,450,600,900,1200,1800,2400').split(',').map(Number);

  const lines = ['| horizon | strategy | across gnome/human | within gnome | within human |', '|--:|---|--:|--:|--:|'];
  for (const ticks of horizons) {
    const byStrategy = new Map();
    for (const arm of load(join(root, `h${String(ticks)}`))) {
      const entry = byStrategy.get(arm.strategyId) ?? {};
      entry[arm.foundingSpeciesMask] = arm.runs;
      byStrategy.set(arm.strategyId, entry);
    }
    for (const [strategyId, entry] of [...byStrategy].sort()) {
      const gnome = entry[GNOME] ?? [];
      const human = entry[HUMAN] ?? [];
      lines.push(
        `| ${String(ticks)} | \`${strategyId}\` | ` +
          `${String(symmetricDifference(unionOf(gnome), unionOf(human)))} | ` +
          `${String(symmetricDifference(unionOf(half(gnome, false)), unionOf(half(gnome, true))))} | ` +
          `${String(symmetricDifference(unionOf(half(human, false)), unionOf(half(human, true))))} |`,
      );
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
