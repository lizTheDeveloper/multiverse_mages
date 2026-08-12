/*
 * Multiverse Mages — W19: do gnome and human diverge before exhaustion?
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
 * W15 measured, at 2400 ticks, that gnome and human — the two species sharing
 * `depthCeiling: 4` — reach the **identical 49-node set**, with paired
 * containment 1.000 on every coordinate pair. That is the sharpest species
 * result the campaign has, and it was taken at the horizon where both are
 * finished.
 *
 * This asks the same question at seven horizons. Divergence, if it exists, shows
 * up as paired containment below 1.000 and as a symmetric difference between the
 * two unions — *both*, because containment alone falls whenever one species is
 * merely slower, and a union difference alone can be a single lucky seed.
 *
 * The CRN caveat W15 disclosed still applies and is restated in the writeup:
 * removing a species changes founding entity creation order and therefore every
 * downstream draw, so gnome and human at the same coordinates are not the same
 * universe. That is inherent to the factor — you cannot vary who founds a
 * universe and keep the universe — which is why this leans on set theory rather
 * than on paired numeric deltas.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { HORIZONS } from './horizons.mjs';

/** Content order is draconic, dwarf, elf, gnome, human, orc — masks 1..32. */
const GNOME = 8;
const HUMAN = 16;

function load(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

const keyOf = (run) =>
  `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;

function containment(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  const smaller = Math.min(left.size, right.size);
  return smaller === 0 ? Number.NaN : shared / smaller;
}

const mean = (xs) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

function main() {
  const root = process.argv[2] ?? '.w19/arm-b';
  const out = {};

  for (const ticks of HORIZONS) {
    const arms = load(join(root, `h${String(ticks)}`));
    const byStrategy = new Map();
    for (const arm of arms) {
      const entry = byStrategy.get(arm.strategyId) ?? { [GNOME]: [], [HUMAN]: [] };
      entry[arm.foundingSpeciesMask] = [...(entry[arm.foundingSpeciesMask] ?? []), ...arm.runs];
      byStrategy.set(arm.strategyId, entry);
    }

    out[ticks] = {};
    for (const [strategyId, entry] of [...byStrategy].sort()) {
      const gnome = entry[GNOME] ?? [];
      const human = entry[HUMAN] ?? [];
      const humanBy = new Map(human.map((run) => [keyOf(run), run]));
      const paired = gnome
        .map((run) => [run, humanBy.get(keyOf(run))])
        .filter(([, other]) => other !== undefined);

      const gnomeUnion = new Set(gnome.flatMap((run) => run.terminal.nodeIds));
      const humanUnion = new Set(human.flatMap((run) => run.terminal.nodeIds));
      const onlyGnome = [...gnomeUnion].filter((id) => !humanUnion.has(id));
      const onlyHuman = [...humanUnion].filter((id) => !gnomeUnion.has(id));

      out[ticks][strategyId] = {
        gnome: {
          n: gnome.length,
          meanNodes: mean(gnome.map((r) => r.terminal.nodeIds.length)),
          union: gnomeUnion.size,
        },
        human: {
          n: human.length,
          meanNodes: mean(human.map((r) => r.terminal.nodeIds.length)),
          union: humanUnion.size,
        },
        pairedContainment: {
          n: paired.length,
          mean: mean(paired.map(([g, h]) => containment(g.terminal.nodeIds, h.terminal.nodeIds))),
          min: Math.min(
            ...paired.map(([g, h]) => containment(g.terminal.nodeIds, h.terminal.nodeIds)),
          ),
        },
        unionsIdentical: onlyGnome.length === 0 && onlyHuman.length === 0,
        onlyGnome,
        onlyHuman,
      };
    }
  }

  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}

main();
