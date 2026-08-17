#!/usr/bin/env node
/*
 * Multiverse Mages — the controlled form-routing probe: one magnitude, fourteen forms.
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
 * ## The one measurement in this campaign that is fully attributable
 *
 * A whole-run two-arm comparison of *Creo/Rego Animal* against *Creo/Rego
 * Herbam* cannot attribute a separation to the yield table, because the two
 * cell pairs are **not authored alike**: they hold different nodes, at different
 * tiers, carrying different magnitudes. A separation there could come from the
 * content rather than from the routing.
 *
 * This probe removes the content. It hands **one identical magnitude** to
 * `routeYieldByForm` for every form, so the only input that differs between two
 * rows is the form's own `yieldWeights`. Two rows that come out equal are two
 * forms a god cannot tell apart through the economy, whatever else the grid
 * does — and that is the pre-registered null: on the base tree
 * `animal == herbam`, `ignem == terram`, `imaginem == mentem`, and
 * `umbra == fatum == limen`. Five collapses, nine distinct baskets out of
 * fourteen forms.
 *
 * It also reports each row's **sum**, which is the trap next door: total routed
 * output is `magnitude x (sum / 1024)`, so a re-author whose row sums to 1100
 * is a hidden magnitude buff wearing the clothes of a mix. Every shipped row
 * sums to exactly 1024 and must keep doing so.
 *
 * Usage: node tools/w-yields/form-routing.mjs --out <path> [--magnitude 1024]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { MATERIAL_KINDS, routeYieldByForm } from '@mm/rules-world';
import { shippedContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required: this probe never writes to a directory it globs later');
  process.exit(2);
}
const magnitude = Number.parseInt(flag('magnitude', '1024'), 10);

const registry = shippedContent();
const forms = registry.forms.map((entry) => entry.record);

// A third exit for a broken probe rather than folding it into "the answer is
// no". Fourteen forms is a loader invariant; anything else means this probe is
// not looking at the shipped grid and no collapse it reports may be believed.
if (forms.length !== 14) {
  console.error(
    `PROBE BROKEN: the registry holds ${String(forms.length)} forms, not fourteen. This is not a ` +
      'statement about any form collapsing onto any other.',
  );
  process.exit(3);
}

const rows = forms.map((form) => {
  const routed = routeYieldByForm(form, magnitude);
  const basket = Object.fromEntries(MATERIAL_KINDS.map((kind) => [kind, routed[kind]]));
  return {
    id: form.id,
    weights: Object.fromEntries(MATERIAL_KINDS.map((kind) => [kind, form.yieldWeights[kind]])),
    weightSum: MATERIAL_KINDS.reduce((total, kind) => total + form.yieldWeights[kind], 0),
    routed: basket,
    routedTotal: MATERIAL_KINDS.reduce((total, kind) => total + routed[kind], 0),
    key: MATERIAL_KINDS.map((kind) => routed[kind]).join('/'),
  };
});

// The positive control for the collapse detector itself: a form is compared
// against its own key and must be found equal to it. A grouper that reported no
// collapses because it never matched anything would fail this.
const selfMatch = rows.every((row) => rows.filter((other) => other.key === row.key).length >= 1);
if (!selfMatch) {
  console.error('PROBE BROKEN: a form did not match its own routed basket. The grouper is wrong.');
  process.exit(3);
}

const byKey = new Map();
for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row.id]);
const collapses = [...byKey.values()].filter((ids) => ids.length > 1);

const payload = {
  probe: 'w-yields-form-routing',
  takenAt: new Date().toISOString(),
  magnitude,
  forms: rows,
  distinctBaskets: byKey.size,
  collapses,
  rowsNotSummingTo1024: rows.filter((row) => row.weightSum !== 1024).map((row) => row.id),
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`form routing at magnitude ${String(magnitude)} -> ${out}`);
console.log(`form        ${MATERIAL_KINDS.map((k) => k.padStart(8)).join('')}      sum`);
for (const row of rows) {
  console.log(
    `${row.id.padEnd(11)} ${MATERIAL_KINDS.map((k) => String(row.routed[k]).padStart(8)).join('')} ${String(row.weightSum).padStart(8)}`,
  );
}
console.log(`distinct baskets: ${String(byKey.size)} of ${String(rows.length)}`);
console.log(
  `collapses: ${collapses.length === 0 ? '(none)' : collapses.map((ids) => ids.join(' = ')).join('  |  ')}`,
);
console.log(
  `rows not summing to 1024: ${payload.rowsNotSummingTo1024.length === 0 ? '(none)' : payload.rowsNotSummingTo1024.join(', ')}`,
);
