/*
 * Multiverse Mages — the three material kinds, and the two tables that route
 * territory and form into them.
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
 * `kinds.ts` is the module that makes the economy differentiable at all: three
 * kinds, a table that turns a universe's land into a mix, and a table that
 * turns a form's magic into a routing. Neither table existed before this
 * change and neither had a test before this file. What is asserted here is
 * the arithmetic each table promises in its own doc comment: shares that
 * always sum to exactly `FP_ONE`, and a routing that is all-zero for a form
 * whose magic touches nothing physical.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { FormRecord, TerritoryRecord } from '@mm/content';

import {
  CLAIMANT_KIND,
  CONSUMPTION_ORDER,
  MATERIAL_KINDS,
  materialsProduced,
  routeYieldByForm,
  territoryYieldShares,
  totalAmount,
  zeroAmounts,
} from '../../src/index.js';

import { shippedRegistry } from './universities-fixtures.js';

/** A territory record with everything but the fields under test held neutral. */
function territory(overrides: Partial<TerritoryRecord> = {}): TerritoryRecord {
  return {
    id: 'fixture-territory',
    name: 'Fixture Territory',
    gloss: 'A synthetic region for the yield-share arithmetic.',
    landUnits: 100,
    capacityPerLandUnit: 1024,
    yieldPerLandUnit: { food: 0, stone: 0, vellum: 0 },
    tuningStatus: 'untuned',
    ...overrides,
  };
}

/** A form record with everything but `yieldWeights` held neutral. */
function form(yieldWeights: Partial<Record<'food' | 'stone' | 'vellum', number>> = {}): FormRecord {
  return {
    id: 'fixture-form',
    name: 'Fixture Form',
    gloss: 'A synthetic form for the routing arithmetic.',
    bit: 0,
    yieldWeights: {
      food: 0,
      stone: 0,
      vellum: 0,
      labor: 0,
      essence: 0,
      insight: 0,
      passage: 0,
      ...yieldWeights,
    },
    tuningStatus: 'untuned',
  };
}

describe('the three kinds, and the total claimant map', () => {
  it('names exactly three kinds', () => {
    // The countable half of "three, not fourteen" — `kinds.ts`'s own argument
    // for why the grid's fourteen materials collapse to three economic ones.
    // A fourth kind added without updating this assertion is a change this
    // test exists to catch, in a way a type error would not: `MATERIAL_KINDS`
    // is a runtime value, and nothing else has to import it wrong to notice.
    expect(MATERIAL_KINDS).toHaveLength(3);
    expect([...MATERIAL_KINDS].sort()).toEqual(['food', 'stone', 'vellum']);
  });

  it('gives every claimant in CONSUMPTION_ORDER a kind, and only vellum is shared', () => {
    // Three vellum claimants since the `casting` claim landed: casting,
    // libraryUpkeep and scribing all draw on the archive's skins. That is the
    // point of putting casting there — `consumeMaterials` tracks `remaining`
    // per kind, so a claimant only ranks against the ones it SHARES a stock
    // with, and magic competing with the library is what substrate.md §7.1
    // decided (a stone claim would have competed with construction instead).
    for (const claimant of CONSUMPTION_ORDER) {
      expect(MATERIAL_KINDS).toContain(CLAIMANT_KIND[claimant]);
    }
    const kindsClaimed = CONSUMPTION_ORDER.map((claimant) => CLAIMANT_KIND[claimant]);
    // Vellum has two claimants (libraryUpkeep, scribing); food and stone have
    // exactly one each. That is the whole of "only the vellum pair still
    // competes", stated as a count rather than as prose.
    expect(kindsClaimed.filter((kind) => kind === 'vellum')).toHaveLength(3);
    expect(kindsClaimed.filter((kind) => kind === 'food')).toHaveLength(1);
    expect(kindsClaimed.filter((kind) => kind === 'stone')).toHaveLength(1);
  });
});

describe('territoryYieldShares always sums to exactly FP_ONE', () => {
  it('sums to FP_ONE for the shipped territory', () => {
    const shares = territoryYieldShares(shippedRegistry().territories.map((entry) => entry.record));
    expect(totalAmount(shares)).toBe(FP_ONE);
    // And every kind is represented, because the shipped mix was authored to
    // require food, stone and vellum all be producible from the land alone --
    // an assertion that would fail loudly if a future content edit zeroed one
    // kind out by accident.
    expect(shares.food).toBeGreaterThan(0);
    expect(shares.stone).toBeGreaterThan(0);
    expect(shares.vellum).toBeGreaterThan(0);
  });

  it('sums to FP_ONE for an empty region list, putting the whole share on food', () => {
    // The documented edge case: no land at all still returns a valid share
    // triple rather than dividing by zero, and it favours food deliberately
    // so a populace with no economy starves visibly at the subsistence line.
    expect(territoryYieldShares([])).toEqual({ food: FP_ONE, stone: 0, vellum: 0 });
  });

  it('sums to FP_ONE when the land yields nothing at all, the same as no land', () => {
    // A region that exists but whose yieldPerLandUnit is all zero is
    // arithmetically indistinguishable from no land at all -- both are "zero
    // weighted total" -- and kinds.ts documents that they should read the same
    // way rather than divide zero by zero.
    const barren = territory({ landUnits: 500, yieldPerLandUnit: { food: 0, stone: 0, vellum: 0 } });
    expect(territoryYieldShares([barren])).toEqual({ food: FP_ONE, stone: 0, vellum: 0 });
  });

  it('sums to FP_ONE for a single region of any mix', () => {
    const single = territory({ yieldPerLandUnit: { food: 1, stone: 1, vellum: 0 } });
    const shares = territoryYieldShares([single]);
    expect(totalAmount(shares)).toBe(FP_ONE);
    expect(shares.vellum).toBe(0);
  });

  it('sums to FP_ONE across several adversarially lopsided regions', () => {
    // Land units and yields deliberately do not share a common factor with
    // FP_ONE (1024), so the remainder-to-food rounding in territoryYieldShares
    // is actually exercised rather than landing on an exact division by luck.
    const regions = [
      territory({ landUnits: 7, yieldPerLandUnit: { food: 3, stone: 1, vellum: 0 } }),
      territory({ landUnits: 11, yieldPerLandUnit: { food: 0, stone: 5, vellum: 2 } }),
      territory({ landUnits: 13, yieldPerLandUnit: { food: 1, stone: 1, vellum: 1 } }),
    ];
    expect(totalAmount(territoryYieldShares(regions))).toBe(FP_ONE);
  });

  it('ignores negative land units and negative yields rather than subtracting', () => {
    const negative = territory({ landUnits: -5, yieldPerLandUnit: { food: -10, stone: 0, vellum: 0 } });
    const positive = territory({ landUnits: 100, yieldPerLandUnit: { food: 0, stone: 1, vellum: 0 } });
    const shares = territoryYieldShares([negative, positive]);
    expect(totalAmount(shares)).toBe(FP_ONE);
    expect(shares.stone).toBe(FP_ONE);
  });
});

describe('routeYieldByForm splits a resource-yield magnitude by content weights', () => {
  it('returns all-zero for a form whose weights are all zero', () => {
    // "A form whose magic is not a material routes nowhere" — kinds.ts's own
    // description of Mentem, Vim, Umbra and the rest of the untuned seven. A
    // node in one of those forms' cells should never manufacture food, stone
    // or vellum out of nothing.
    expect(routeYieldByForm(form(), 1024)).toEqual(zeroAmounts());
  });

  it('routes to exactly the kinds a form declares, and nowhere else', () => {
    // Herbam, per sound-design.md §4.2: fibre (food) and paper (vellum), never
    // stone.
    const herbamLike = form({ food: 512, vellum: 384 });
    const routed = routeYieldByForm(herbamLike, 1024);
    expect(routed.food).toBe(512);
    expect(routed.vellum).toBe(384);
    expect(routed.stone).toBe(0);
  });

  it('is proportional to the magnitude routed', () => {
    const oneKind = form({ stone: 1024 });
    expect(routeYieldByForm(oneKind, 0)).toEqual(zeroAmounts());
    expect(routeYieldByForm(oneKind, 512).stone).toBe(512);
    expect(routeYieldByForm(oneKind, 2048).stone).toBe(2048);
  });

  it('does not require weights to sum to FP_ONE, and may route above the magnitude', () => {
    // kinds.ts is explicit that forms are deliberately not partitioned: Animal
    // is meat and hide at 512 apiece, and other forms go further. Weights of
    // 800 and 800 total 1600 — well past fp(1024) — and that is meant to
    // happen: routeYieldByForm is not a division of one magnitude between
    // kinds, it is two independent shares of the same magnitude.
    const overlapping = form({ food: 800, vellum: 800 });
    const routed = routeYieldByForm(overlapping, 1024);
    expect(routed.food).toBe(800);
    expect(routed.vellum).toBe(800);
    expect(totalAmount(routed)).toBeGreaterThan(1024);
  });

  it('routes a negative magnitude as a cost, and still ignores negative weights', () => {
    // **Inverted on purpose, and the old assertion was not wrong when written.**
    // It read "ignores a negative magnitude … rather than crediting them" and
    // was green for as long as `node.schema.json` set `minimum: 1` — no
    // negative could reach this function, so the clamp described impossible
    // input rather than a decision.
    //
    // Signed magnitudes make a negative `resource-yield` authorable content.
    // Clamping here would be a *naive* bound: a floor chosen to avoid a
    // negative rather than derived from what the quantity is, and it would
    // discard the cost at the door where nothing downstream could see it.
    //
    // The bound that survives is mechanical and lives where the mechanism
    // supplies one — `stackingFloor`'s `fp(0)` on the stacked multiplier, which
    // says labour with every debuff in the world produces **nothing** and never
    // anti-materials. Measured through `materialsProduced` at 100 laborers:
    // no bonus 1600, −50% cost 800, −100% cost 0, −300% cost 0. The cost bites
    // proportionally and stops at zero by arithmetic, not by a sign test.
    expect(routeYieldByForm(form({ food: 512 }), -100)).toEqual({
      food: -50,
      stone: 0,
      vellum: 0,
    });

    // The weights keep their clamp, and the asymmetry is the point. A negative
    // weight would be a *form* claiming that producing food consumes stone — a
    // statement about the material taxonomy, not about one working. The sign
    // comes from the node; the mix stays a property of the form.
    expect(routeYieldByForm(form({ food: -512, stone: 256 }), 1024)).toEqual({
      food: 0,
      stone: 256,
      vellum: 0,
    });

    // And the two compose: a cost routes proportionally negative amounts to
    // exactly the kinds a gain would have fed, and to no others.
    expect(routeYieldByForm(form({ food: -512, stone: 256 }), -1024)).toEqual({
      food: 0,
      stone: -256,
      vellum: 0,
    });
  });

  it('floors production at nothing, so a cost can stop labour but never invert it', () => {
    // The mechanical bound, asserted through the real production path rather
    // than by reading the stacking code — the claim is about the chain
    // routeYieldByForm -> resourceYieldBonuses -> resourceYieldMultiplier ->
    // stackingFloor, and only an end-to-end call exercises all four joints.
    const resourceYield = shippedRegistry().primitives.find(
      ({ record }) => record.id === 'resource-yield',
    )?.record;
    if (resourceYield === undefined) throw new Error('resource-yield is missing from content');
    const produced = (bonuses: readonly number[]): number =>
      materialsProduced({
        laborerCount: 100,
        laborAffinity: FP_ONE,
        shares: { food: FP_ONE, stone: 0, vellum: 0 },
        resourceYield,
        resourceYieldBonuses: { food: bonuses, stone: [], vellum: [] },
      }).food;

    expect(produced([])).toBe(1600);
    expect(produced([-512])).toBe(800);
    expect(produced([-FP_ONE])).toBe(0);
    // Absurd input floors rather than inverting. This is the assertion that
    // makes the bound mechanical rather than incidental.
    expect(produced([-3 * FP_ONE])).toBe(0);
    // And a cost composes with a gain instead of short-circuiting it.
    expect(produced([FP_ONE, -512])).toBe(2400);
  });
});
