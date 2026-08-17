/*
 * Multiverse Mages — a species' aptitude reaches the field, and neutral is the
 * exact identity.
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
 * The measured finding this file exists for, taken on `integration/all-branches`
 * @ `4621db1a`: **every consumer of `species.affinities` was in the
 * research-targeting path.** Zero hits under `economy/`. A dwarf's authored
 * `terram: 1536` decided which node she chose to study and moved not one unit
 * of what she dug out of the ground, so the author's *"dwarves are more likely
 * to be good at digging stuff up out of the ground"* was a claim about the
 * library.
 *
 * The first test below is the **positive control and it comes first**: neutral
 * aptitude must reproduce the untilted basket *exactly*. Every "this changes
 * nothing for callers that do not opt in" claim in the change rests on it, and a
 * renormalization that was off by one unit would make all of them false while
 * every other assertion here still passed.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { FormRecord, PrimitiveRecord, SpeciesRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';

import type { LandAptitude, MaterialAmounts } from '../../src/index.js';
import {
  LAND_MATERIAL_KINDS,
  NEUTRAL_LAND_APTITUDE,
  landAptitudeTable,
  materialsProduced,
  speciesLandAptitude,
  territoryYieldShares,
} from '../../src/index.js';

const registry = loadContent(shippedContentSource());
const FORMS: readonly FormRecord[] = registry.forms.map((entry) => entry.record);
const SHARES: MaterialAmounts = territoryYieldShares(
  registry.territories.map((entry) => entry.record),
);

function speciesNamed(id: string): SpeciesRecord {
  const record = registry.species.find((entry) => entry.record.id === id)?.record;
  if (record === undefined) throw new Error(`the shipped content set declares no species "${id}"`);
  return record;
}

function primitiveNamed(id: string): PrimitiveRecord {
  const record = registry.primitives.find((entry) => entry.record.id === id)?.record;
  if (record === undefined) throw new Error(`the shipped content set declares no primitive "${id}"`);
  return record;
}

const RESOURCE_YIELD = primitiveNamed('resource-yield');
const NO_BONUSES = {
  food: [],
  stone: [],
  vellum: [],
  labor: [],
  essence: [],
  insight: [],
  passage: [],
} as const;

/**
 * One cohort of a hundred at a fixed `laborAffinity`.
 *
 * Fixed on purpose: `laborAffinity` is the **magnitude** knob and it varies by
 * species, so holding it flat is what makes every row below a statement about
 * the mix alone. A test that let both move could not say which one moved the
 * basket.
 */
function basket(aptitude?: LandAptitude): MaterialAmounts {
  return materialsProduced({
    laborerCount: 100,
    laborAffinity: FP_ONE,
    shares: SHARES,
    resourceYield: RESOURCE_YIELD,
    resourceYieldBonuses: NO_BONUSES,
    production: { hireableShare: 0 },
    ...(aptitude === undefined ? {} : { aptitude }),
  });
}

const landSum = (amounts: MaterialAmounts): number =>
  LAND_MATERIAL_KINDS.reduce((sum, kind) => sum + amounts[kind], 0);

describe('neutral aptitude is the identity, exactly', () => {
  it('reproduces the untilted basket field for field', () => {
    // Equality, not closeness. Every caller that supplies no aptitude — every
    // fixture, every knowledge test, every world built before this existed —
    // depends on this being byte-identical rather than merely similar.
    expect(basket(NEUTRAL_LAND_APTITUDE)).toEqual(basket(undefined));
  });

  it('is what a species declaring no form affinity derives', () => {
    const blank: SpeciesRecord = { ...speciesNamed('human'), affinities: {} };
    expect(speciesLandAptitude(blank, FORMS)).toEqual(NEUTRAL_LAND_APTITUDE);
    expect(basket(speciesLandAptitude(blank, FORMS))).toEqual(basket(undefined));
  });

  it('is what a cell-keyed affinity derives, because the material lives on the form', () => {
    // `coordination.ts` records that an `affinities` key may name a **cell or a
    // form**, and `target-appeal.ts` resolves both. This derivation reads the
    // form alone, and the reading is pinned here rather than left implicit: a
    // future `creo-terram: 1536` entry would bias what a species studies and
    // derive no tilt at all, and a reader finding that surprising should find
    // this assertion rather than an absence.
    //
    // The reason is that a cell is technique × form — `creo-terram` and
    // `perdo-terram` are two things you can do to the same stuff — so an
    // affinity for one of them is a statement about how a species prefers to
    // work rather than about what earth is made of. `routeYieldByForm`, whose
    // table this borrows, is keyed on the form for the same reason.
    const cellKeyed: SpeciesRecord = {
      ...speciesNamed('human'),
      affinities: { 'creo-terram': 1536, 'rego-terram': 1536 },
    };
    expect(speciesLandAptitude(cellKeyed, FORMS)).toEqual(NEUTRAL_LAND_APTITUDE);

    // Positive control on the line above: the *form* key of the same magnitude
    // must tilt, or the assertion would be passing on a function that ignores
    // `affinities` altogether.
    const formKeyed: SpeciesRecord = {
      ...speciesNamed('human'),
      affinities: { terram: 1536 },
    };
    expect(speciesLandAptitude(formKeyed, FORMS).stone).toBeGreaterThan(FP_ONE);
  });

  it('is the negative control for every claim below: an untilted basket is not all-food', () => {
    // The check that the instrument can read anything at all. If the shipped
    // land mix were degenerate — the whole share in `food` — a "dwarves make
    // more stone" assertion could only ever fail, and a "neutral changes
    // nothing" assertion could only ever pass.
    const untilted = basket(undefined);
    for (const kind of LAND_MATERIAL_KINDS) expect(untilted[kind]).toBeGreaterThan(0);
  });
});

describe('a species is good at the material its magic is about', () => {
  it('derives the dwarf toward stone, from terram and ignem and nothing else', () => {
    const dwarf = speciesLandAptitude(speciesNamed('dwarf'), FORMS);
    expect(dwarf.stone).toBeGreaterThan(FP_ONE);
    // `dwarf` authors no affinity for any food- or vellum-yielding form, so
    // those two must read exactly neutral. An implementation that spread one
    // authored entry across every kind would fail here and pass the line above.
    expect(dwarf.food).toBeGreaterThan(FP_ONE); // ignem yields food as well as stone
    expect(dwarf.vellum).toBe(FP_ONE);
  });

  it('computes the tilt as the weighted mean the module documents, not as a guess', () => {
    // Recomputed here from `form.json` rather than transcribed, so this survives
    // a deliberate yield retune and still checks the arithmetic. The coupling is
    // the point: a form's weights are the statement of what the form is made of.
    const dwarf = speciesNamed('dwarf');
    let weighted = 0;
    let total = 0;
    for (const form of FORMS) {
      const weight = form.yieldWeights.stone;
      if (weight === 0) continue;
      weighted += weight * (dwarf.affinities[form.id] ?? FP_ONE);
      total += weight;
    }
    expect(speciesLandAptitude(dwarf, FORMS).stone).toBe(Math.floor(weighted / total));
  });

  it('turns the dwarf into more stone and less grain from the same month', () => {
    const untilted = basket(undefined);
    const dwarf = basket(speciesLandAptitude(speciesNamed('dwarf'), FORMS));
    expect(dwarf.stone).toBeGreaterThan(untilted.stone);
    expect(dwarf.food).toBeLessThan(untilted.food);
  });

  it('turns the human toward food and away from stone, which is the agrarian claim', () => {
    const untilted = basket(undefined);
    const human = basket(speciesLandAptitude(speciesNamed('human'), FORMS));
    expect(human.food).toBeGreaterThan(untilted.food);
    expect(human.stone).toBeLessThan(untilted.stone);
  });

  it('separates the dwarf from the human on every land kind', () => {
    // The two-arm claim in miniature and the sentence the author asked for:
    // dwarves dig, humans farm, and the same hundred people produce differently
    // shaped baskets because of it.
    const dwarf = basket(speciesLandAptitude(speciesNamed('dwarf'), FORMS));
    const human = basket(speciesLandAptitude(speciesNamed('human'), FORMS));
    expect(dwarf.stone).toBeGreaterThan(human.stone);
    expect(human.food).toBeGreaterThan(dwarf.food);
    expect(dwarf).not.toEqual(human);
  });
});

describe('a tilt is a mix and never a magnitude', () => {
  it('leaves every species producing the same land total, to the flooring residue', () => {
    // The trap this exists to catch: an aptitude applied as a straight
    // multiplier would make a species with a high affinity better at everything,
    // which is a power creep wearing the clothes of a character trait. The
    // renormalization means the three kinds still sum to the same person-months.
    // The tolerance is the per-kind floor — at most one unit per land kind — and
    // it is asserted as a bound rather than waved at.
    const untilted = landSum(basket(undefined));
    for (const entry of registry.species) {
      const tilted = landSum(basket(speciesLandAptitude(entry.record, FORMS)));
      expect(
        Math.abs(tilted - untilted),
        `${entry.record.id} moved the land total, not the mix`,
      ).toBeLessThanOrEqual(LAND_MATERIAL_KINDS.length);
    }
  });

  it('keeps the tilted shares summing to exactly fp(1024) for every shipped species', () => {
    // Read through the basket, because the shares themselves are internal: a
    // cohort's land output is `worked x share` per kind, so a share sum above
    // `FP_ONE` would be free materials and one below would be a silent tax.
    // With `hireableShare: 0` the whole month is land, so the three kinds must
    // account for it.
    for (const entry of registry.species) {
      const tilted = basket(speciesLandAptitude(entry.record, FORMS));
      expect(tilted.labor, `${entry.record.id} leaked into labor`).toBe(0);
      expect(tilted.essence + tilted.insight + tilted.passage).toBe(0);
    }
  });
});

describe('the table the composition root builds', () => {
  it('answers for every shipped species and agrees with the single-species function', () => {
    const table = landAptitudeTable(
      registry.species.map((entry) => entry.record),
      FORMS,
    );
    expect(table.size).toBe(registry.species.length);
    for (const entry of registry.species) {
      expect(table.get(entry.record.id)).toEqual(speciesLandAptitude(entry.record, FORMS));
    }
  });

  it('gives the six shipped species at least three distinct tilts', () => {
    // A weaker claim than "all six differ" on purpose: `orc` and `gnome` each
    // author one land-reaching affinity and could legitimately coincide on two
    // of three kinds. What is not acceptable is a table that collapses, which is
    // the failure mode the yield table itself had.
    const table = landAptitudeTable(
      registry.species.map((entry) => entry.record),
      FORMS,
    );
    const distinct = new Set(
      [...table.values()].map((tilt) => LAND_MATERIAL_KINDS.map((kind) => tilt[kind]).join('/')),
    );
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});
