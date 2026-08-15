#!/usr/bin/env node
/*
 * Multiverse Mages — W204: how much of each primitive is inside the square.
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
 * The content-versus-structural discriminator, taken from content alone.
 *
 * A primitive with authored effects that all sit outside the twelve enabled
 * cells is inert *because of the opening square* — widen the square and it
 * binds. A primitive with effects inside the square that still moves nothing is
 * inert *in code*. The two rows read identically in an ablation table and the
 * fixes are opposite, so the split is measured here rather than judged.
 *
 * Usage: node tools/w204/reach.mjs
 */

import { referenceContent } from '@mm/scenario';

const content = referenceContent();
const { registry, axes } = content;

const techniqueBit = new Map(registry.techniques.map((t) => [t.record.id, t.record.bit]));
const formBit = new Map(registry.forms.map((f) => [f.record.id, f.record.bit]));

/** A cell is inside the opening square when both of its axes are permitted. */
const enabledCells = new Set(
  registry.cells
    .filter((cell) => {
      const t = techniqueBit.get(cell.record.technique);
      const f = formBit.get(cell.record.form);
      return ((axes.permittedTechniques >>> t) & 1) === 1 && ((axes.permittedForms >>> f) & 1) === 1;
    })
    .map((cell) => cell.record.id),
);

const stats = new Map();
for (const primitive of registry.primitives) {
  stats.set(primitive.record.id, {
    id: primitive.record.id,
    scale: primitive.record.scale,
    stacking: primitive.record.stacking,
    cap: primitive.record.cap.kind === 'none' ? 'none' : `${primitive.record.cap.kind}:${String(primitive.record.cap.value)}`,
    nodesAll: 0,
    nodesInSquare: 0,
    magnitudeInSquare: 0,
    maxMagnitude: 0,
    tiersInSquare: new Set(),
  });
}

for (const node of registry.nodes) {
  const inSquare = enabledCells.has(node.record.cell);
  for (const effect of node.record.effects ?? []) {
    const row = stats.get(effect.primitive);
    if (row === undefined) continue;
    row.nodesAll += 1;
    row.maxMagnitude = Math.max(row.maxMagnitude, effect.magnitude);
    if (!inSquare) continue;
    row.nodesInSquare += 1;
    row.magnitudeInSquare += effect.magnitude;
    row.tiersInSquare.add(node.record.tier);
  }
}

console.log(
  `W204 reach — ${String(enabledCells.size)} of ${String(registry.cells.length)} cells enabled by the v1 ` +
    `opening square, ${String(registry.nodes.length)} nodes authored.\n`,
);
console.log(
  `${'primitive'.padEnd(17)}${'scale'.padEnd(12)}${'cap'.padEnd(26)}${'effects'.padStart(8)}${'in square'.padStart(11)}${'Σ mag'.padStart(9)}${'max mag'.padStart(9)}  tiers in square`,
);
console.log('-'.repeat(110));
for (const row of stats.values()) {
  console.log(
    `${row.id.padEnd(17)}${row.scale.padEnd(12)}${row.cap.padEnd(26)}${String(row.nodesAll).padStart(8)}` +
      `${String(row.nodesInSquare).padStart(11)}${String(row.magnitudeInSquare).padStart(9)}${String(row.maxMagnitude).padStart(9)}` +
      `  ${[...row.tiersInSquare].sort((a, b) => a - b).join(',') || '-'}`,
  );
}
