/*
 * Multiverse Mages — the land a universe holds, and the proof that moving it
 * into state did not move the number it feeds.
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
 * `contracts.md` §2.7's own migration, checked rather than announced.
 *
 * The load-bearing claim of `university-siting` is that **the universe-level
 * carrying capacity is unchanged** by moving `landUnits` out of content and into
 * state. `K` feeds births, births feed population, and population feeds every
 * committed balance baseline, so a change that quietly moved the sum would move
 * every number in the project for a reason nobody could name afterwards.
 *
 * So the first two tests below are the proof, over the **shipped** content set
 * rather than over a fixture: sum the rows, compare field for field against
 * `territoryExtent`, and then site and re-site every university and check the
 * sum again. A site consumes no land.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle } from '@mm/sim-core';
import { FP_ONE, createState } from '@mm/sim-core';
import type { TerritoryRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';
import {
  TERRITORY_HOLDING,
  UNIVERSITY,
  UNIVERSITY_SITE,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
} from '@mm/state';

import type { TerritoryKind } from '../../src/index.js';
import {
  NO_TERRITORY,
  SITE_CAPACITY_MAX,
  SITE_CAPACITY_MIN,
  defaultSiteKind,
  hasTerritoryHoldings,
  heldTerritoryExtent,
  libraryUpkeep,
  materializeTerritoryHoldings,
  maxCarryingCapacity,
  siteCapacityMultiplier,
  siteKindOf,
  siteUniversity,
  sitedCapacity,
  territoryExtent,
  territoryHoldings,
  territoryKindIndex,
} from '../../src/index.js';

const registry = loadContent(shippedContentSource());

/** The shipped content set's territory records, in interned order. */
const SHIPPED_RECORDS: readonly TerritoryRecord[] = registry.territories.map((entry) => entry.record);

/** The rules-path view of the same records. */
const SHIPPED_KINDS: readonly TerritoryKind[] = registry.territories.map((entry) => ({
  kindId: entry.contentId,
  landUnits: entry.record.landUnits,
  capacityPerLandUnit: entry.record.capacityPerLandUnit,
  libraryUpkeepMultiplier: entry.record.libraryUpkeepMultiplier,
}));

function kindNamed(id: string): TerritoryKind {
  const kindId = registry.intern('territory', id);
  const kind = SHIPPED_KINDS.find((candidate) => candidate.kindId === kindId);
  if (kind === undefined) throw new Error(`the shipped content set declares no territory "${id}"`);
  return kind;
}

function emptyWorld() {
  return createState({ rootSeed: 24, schema: defineWorldStateSchema(), contentRevision: registry.contentRevision });
}

describe('the universe-level extent survives the move into state', () => {
  it('sums the materialized holdings to exactly what territoryExtent sums from content', () => {
    const state = emptyWorld();
    expect(hasTerritoryHoldings(state)).toBe(false);
    expect(heldTerritoryExtent(state, SHIPPED_KINDS)).toEqual(NO_TERRITORY);

    expect(materializeTerritoryHoldings(state, SHIPPED_KINDS)).toBe(SHIPPED_KINDS.length);

    // Field for field, not "close enough": `baseCapacity` is floored per region
    // in both implementations, and a sum that floored once at the end would
    // differ from one that floors five times by up to four people.
    const fromContent = territoryExtent(SHIPPED_RECORDS);
    expect(heldTerritoryExtent(state, SHIPPED_KINDS)).toEqual(fromContent);
    expect(fromContent.landUnits).toBe(6000);
    expect(maxCarryingCapacity(heldTerritoryExtent(state, SHIPPED_KINDS))).toBe(
      maxCarryingCapacity(fromContent),
    );
  });

  it('materializes once and never again, however many ticks ask', () => {
    const state = emptyWorld();
    materializeTerritoryHoldings(state, SHIPPED_KINDS);
    const first = heldTerritoryExtent(state, SHIPPED_KINDS);

    for (let tick = 0; tick < 5; tick += 1) {
      expect(materializeTerritoryHoldings(state, SHIPPED_KINDS)).toBe(0);
    }
    expect(heldTerritoryExtent(state, SHIPPED_KINDS)).toEqual(first);
    expect(territoryHoldings(state)).toHaveLength(SHIPPED_KINDS.length);
  });

  it('holds the extent flat while universities are sited and re-sited', () => {
    // A site is a *relationship*, and a relationship consumes nothing. If siting
    // ever started costing land, `K` would fall as a universe built, and the
    // population would move for a reason the design never authored.
    const state = emptyWorld();
    materializeTerritoryHoldings(state, SHIPPED_KINDS);
    const before = heldTerritoryExtent(state, SHIPPED_KINDS);

    const universities: EntityHandle[] = [];
    for (let index = 0; index < 4; index += 1) {
      const handle = state.entities.create();
      attachRecord(state, UNIVERSITY, handle, {
        libraryId: 0,
        capacity: 64,
        buildProgress: FP_ONE,
      });
      universities.push(handle);
    }

    for (const kind of SHIPPED_KINDS) {
      for (const university of universities) siteUniversity(state, university, kind.kindId);
      expect(heldTerritoryExtent(state, SHIPPED_KINDS)).toEqual(before);
    }

    // And re-siting overwrites rather than accumulating: one university, one
    // site, whatever order the rows were written in.
    expect(componentOf(state, UNIVERSITY_SITE).size).toBe(universities.length);
  });

  it('reads a universe stripped of its ground as holding nothing, not as unknown', () => {
    // The distinction colonization turns on. Zeroed rows are a universe that
    // lost its land; absent rows are a universe that has not been stepped.
    const state = emptyWorld();
    materializeTerritoryHoldings(state, SHIPPED_KINDS);
    const store = componentOf(state, TERRITORY_HOLDING);
    for (const { handle } of collectRecords(state, TERRITORY_HOLDING)) {
      store.set(handle, 'landUnits', 0);
    }

    expect(heldTerritoryExtent(state, SHIPPED_KINDS)).toEqual({ landUnits: 0, baseCapacity: 0 });
    // And it does *not* re-materialize, which is the whole reason the rows stay.
    expect(materializeTerritoryHoldings(state, SHIPPED_KINDS)).toBe(0);
  });

  it('credits land of an unknown kind with feeding nobody, rather than guessing', () => {
    const state = emptyWorld();
    const handle = state.entities.create();
    attachRecord(state, TERRITORY_HOLDING, handle, { kindId: 999, landUnits: 500 });
    expect(heldTerritoryExtent(state, SHIPPED_KINDS)).toEqual({
      landUnits: 500,
      baseCapacity: 0,
    });
  });
});

describe('the documented default site', () => {
  it('is the kind whose endowment carries the most people', () => {
    // arable-lowland: 1600 x 20480 = the largest product in the shipped set,
    // ahead of river-delta's 300 x 40960. "Where the most people already are".
    expect(defaultSiteKind(SHIPPED_KINDS, SHIPPED_KINDS)).toBe(
      registry.intern('territory', 'arable-lowland'),
    );
  });

  it('reads the same answer off holdings as off the endowment', () => {
    const state = emptyWorld();
    materializeTerritoryHoldings(state, SHIPPED_KINDS);
    expect(defaultSiteKind(territoryHoldings(state), SHIPPED_KINDS)).toBe(
      defaultSiteKind(SHIPPED_KINDS, SHIPPED_KINDS),
    );
  });

  it('is nothing at all when there is nothing to stand on', () => {
    expect(defaultSiteKind([], SHIPPED_KINDS)).toBe(0);
    expect(defaultSiteKind([{ kindId: 1, landUnits: 0 }], SHIPPED_KINDS)).toBe(0);
  });
});

describe('what a site does to a university', () => {
  it('gives the ordinary country a multiplier of exactly one', () => {
    // By construction: `SITE_REFERENCE_CAPACITY_PER_LAND_UNIT` is
    // arable-lowland's own `capacityPerLandUnit`. This is what makes the
    // reference universe's default site neutral in both mechanisms, and it is
    // why every divergence measured against it is attributable to a site
    // somebody named.
    expect(siteCapacityMultiplier(kindNamed('arable-lowland'))).toBe(FP_ONE);
    expect(kindNamed('arable-lowland').libraryUpkeepMultiplier).toBe(FP_ONE);
  });

  it('spans the shipped kinds from the floor to the cap', () => {
    const multipliers = Object.fromEntries(
      SHIPPED_KINDS.map((kind) => [
        registry.idOf('territory', kind.kindId) ?? '',
        siteCapacityMultiplier(kind),
      ]),
    );
    expect(multipliers).toEqual({
      'river-delta': SITE_CAPACITY_MAX,
      'arable-lowland': FP_ONE,
      'upland-pasture': 307,
      'deep-forest': 153,
      'highland-waste': SITE_CAPACITY_MIN,
    });
  });

  it('is neutral for a university that stands nowhere', () => {
    // The property the world-schema revision-5 migration leans on: a restored
    // revision-4 save has no site rows, and every rate must read as it did.
    const state = emptyWorld();
    const university = state.entities.create();
    attachRecord(state, UNIVERSITY, university, {
      libraryId: 0,
      capacity: 64,
      buildProgress: FP_ONE,
    });
    const index = territoryKindIndex(SHIPPED_KINDS);

    expect(siteKindOf(state, university)).toBe(0);
    expect(siteCapacityMultiplier(index.get(siteKindOf(state, university)))).toBe(FP_ONE);
    expect(sitedCapacity({ libraryId: 0, capacity: 64, buildProgress: FP_ONE }, FP_ONE)).toBe(64);
  });

  it('keeps an unfinished university at zero seats on any ground', () => {
    const halfBuilt = { libraryId: 0, capacity: 64, buildProgress: FP_ONE - 1 };
    for (const kind of SHIPPED_KINDS) {
      expect(sitedCapacity(halfBuilt, siteCapacityMultiplier(kind))).toBe(0);
    }
  });

  it('turns 64 designed seats into 8 in the waste and 128 in the delta', () => {
    const academy = { libraryId: 0, capacity: 64, buildProgress: FP_ONE };
    expect(sitedCapacity(academy, siteCapacityMultiplier(kindNamed('river-delta')))).toBe(128);
    expect(sitedCapacity(academy, siteCapacityMultiplier(kindNamed('arable-lowland')))).toBe(64);
    expect(sitedCapacity(academy, siteCapacityMultiplier(kindNamed('highland-waste')))).toBe(8);
  });

  it('prices the same shelf differently in the delta and in the waste', () => {
    const depth = {
      distinctByTier: [4, 0, 0, 0, 0, 0, 0],
      cumulativeByTier: [4, 4, 4, 4, 4, 4, 4],
      distinctNodes: 4,
      instanceCount: 40,
      grimoireCount: 40,
    };
    const neutral = libraryUpkeep(depth);
    expect(libraryUpkeep(depth, kindNamed('arable-lowland').libraryUpkeepMultiplier)).toBe(neutral);
    // The anti-correlation, which is the whole reason siting is a decision
    // rather than a ranking: the delta feeds twice the students and eats twice
    // the books, and the waste does the reverse.
    expect(libraryUpkeep(depth, kindNamed('river-delta').libraryUpkeepMultiplier)).toBe(
      neutral * 2,
    );
    expect(libraryUpkeep(depth, kindNamed('highland-waste').libraryUpkeepMultiplier)).toBe(
      neutral / 2,
    );
  });

  it('refuses to site a university on the reserved null content id', () => {
    const state = emptyWorld();
    const university = state.entities.create();
    attachRecord(state, UNIVERSITY, university, {
      libraryId: 0,
      capacity: 8,
      buildProgress: FP_ONE,
    });
    expect(() => {
      siteUniversity(state, university, 0);
    }).toThrow(/reserved null/);
  });
});
