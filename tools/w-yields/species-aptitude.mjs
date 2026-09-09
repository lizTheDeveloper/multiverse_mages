#!/usr/bin/env node
/*
 * Multiverse Mages — what each species is actually good at digging up.
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
 * Prints the derived land aptitude of every shipped species, and the basket one
 * cohort of each actually produces from the shipped land mix.
 *
 * Two numbers per species, because the tilt alone is not the claim. The claim is
 * that **the same month of the same size cohort comes out shaped differently**,
 * and that requires running `materialsProduced` — which also demonstrates the
 * renormalization: every arm's three land kinds sum to the same total, because a
 * tilt is a mix and never a magnitude.
 *
 * The **neutral row is the positive control**, and it is printed rather than
 * asserted here so a reader can see it: a synthetic species with no authored
 * affinity must produce exactly the untilted basket. If that row differed from
 * the shares, every "unchanged" claim in this campaign would be false.
 *
 * Usage: node tools/w-yields/species-aptitude.mjs --out <path>
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import {
  LAND_MATERIAL_KINDS,
  NEUTRAL_LAND_APTITUDE,
  materialsProduced,
  speciesLandAptitude,
  territoryYieldShares,
} from '@mm/rules-world';
import { primitiveNamed, shippedContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required: this probe never writes to a directory it globs later');
  process.exit(2);
}

const registry = shippedContent();
const forms = registry.forms.map((entry) => entry.record);
const shares = territoryYieldShares(registry.territories.map((entry) => entry.record));
const resourceYield = primitiveNamed(registry, 'resource-yield');

const NO_BONUSES = {
  food: [],
  stone: [],
  vellum: [],
  labor: [],
  essence: [],
  insight: [],
  passage: [],
};

/** One cohort of a hundred, at a fixed affinity, so only the tilt varies. */
const basketOf = (aptitude) =>
  materialsProduced({
    laborerCount: 100,
    // Fixed at neutral on purpose. `laborAffinity` is the magnitude knob and
    // varies by species; holding it flat here is what makes the row a statement
    // about the *mix* alone.
    laborAffinity: 1024,
    shares,
    resourceYield,
    resourceYieldBonuses: NO_BONUSES,
    production: { hireableShare: 0 },
    ...(aptitude === undefined ? {} : { aptitude }),
  });

const untilted = basketOf(undefined);
const rows = registry.species.map((entry) => {
  const aptitude = speciesLandAptitude(entry.record, forms);
  const basket = basketOf(aptitude);
  return {
    id: entry.record.id,
    affinities: entry.record.affinities,
    laborAffinity: entry.record.laborAffinity,
    aptitude,
    basket: Object.fromEntries(LAND_MATERIAL_KINDS.map((kind) => [kind, basket[kind]])),
    landTotal: LAND_MATERIAL_KINDS.reduce((sum, kind) => sum + basket[kind], 0),
  };
});

const neutralBasket = basketOf(NEUTRAL_LAND_APTITUDE);
const controlHolds = LAND_MATERIAL_KINDS.every((kind) => neutralBasket[kind] === untilted[kind]);

// Third exit for a broken probe. If the neutral row does not reproduce the
// untilted basket, the tilt is not a mix and nothing below may be believed.
if (!controlHolds) {
  console.error(
    'PROBE BROKEN: neutral aptitude did not reproduce the untilted basket, so the renormalization ' +
      'is not the identity. This is not a statement about any species.',
  );
  process.exit(3);
}

const payload = {
  probe: 'w-yields-species-aptitude',
  takenAt: new Date().toISOString(),
  landShares: Object.fromEntries(LAND_MATERIAL_KINDS.map((kind) => [kind, shares[kind]])),
  untiltedBasket: Object.fromEntries(LAND_MATERIAL_KINDS.map((kind) => [kind, untilted[kind]])),
  neutralControlReproducesUntilted: controlHolds,
  species: rows,
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`species land aptitude -> ${out}`);
console.log(
  `shipped land shares: food ${String(shares.food)}  stone ${String(shares.stone)}  vellum ${String(shares.vellum)}`,
);
console.log('');
console.log('species    aptitude food/stone/vellum      basket food   stone  vellum      land total');
console.log(
  `${'(neutral)'.padEnd(10)} ${'1024/1024/1024'.padEnd(22)} ${String(untilted.food).padStart(11)} ${String(untilted.stone).padStart(7)} ${String(untilted.vellum).padStart(7)} ${String(untilted.food + untilted.stone + untilted.vellum).padStart(15)}`,
);
for (const row of rows) {
  const apt = `${String(row.aptitude.food)}/${String(row.aptitude.stone)}/${String(row.aptitude.vellum)}`;
  console.log(
    `${row.id.padEnd(10)} ${apt.padEnd(22)} ${String(row.basket.food).padStart(11)} ${String(row.basket.stone).padStart(7)} ${String(row.basket.vellum).padStart(7)} ${String(row.landTotal).padStart(15)}`,
  );
}
console.log('');
console.log('neutral control reproduces the untilted basket exactly: yes');
