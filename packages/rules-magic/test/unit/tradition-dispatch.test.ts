/*
 * Multiverse Mages — the four hook dispatch points, one suite each.
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

import { describe, expect, it } from 'vitest';

import { FP_ONE, fromInt, mul } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import {
  UNBOUNDED_SLOTS,
  admitToStore,
  applyAcquire,
  canHoldAt,
  castCost,
  castPolicy,
  costPolicy,
  costSplit,
  expendOnCast,
  isCastable,
  palaceLibraryDepth,
  perishesWithHolder,
  prepare,
  preparationCost,
  scribeAvailability,
  storePolicy,
} from '../../src/traditions/index.js';

import { ART_OF_MEMORY, TRUE_NAMING, VANCIAN, ownHook } from './tradition-fixtures.js';

const BASE_RESEARCH = mul(fromInt(6), FP_ONE);
const BASE_TEACH = mul(fromInt(2), FP_ONE);

const STANDARD_INPUTS = {
  baseResearchCost: BASE_RESEARCH,
  baseTeachCost: BASE_TEACH,
  baseInitialMastery: 0,
  baseStolenMastery: 0,
} as const;

// ---------------------------------------------------------------------------
// acquire
// ---------------------------------------------------------------------------

describe('acquire: standard is the baseline every tradition falls back to', () => {
  it('returns the caller’s figures unchanged', () => {
    const terms = applyAcquire(ownHook('acquire', VANCIAN), STANDARD_INPUTS);
    expect(terms).toEqual({
      researchCost: BASE_RESEARCH,
      teachCost: BASE_TEACH,
      initialMastery: 0,
      stolenMastery: 0,
    });
  });

  it('is the same answer under every tradition that declares it', () => {
    const vancian = applyAcquire(ownHook('acquire', VANCIAN), STANDARD_INPUTS);
    const artOfMemory = applyAcquire(ownHook('acquire', ART_OF_MEMORY), STANDARD_INPUTS);
    expect(artOfMemory).toEqual(vancian);
  });

  it('refuses a hook from a different point', () => {
    expect(() => applyAcquire(ownHook('store', VANCIAN), STANDARD_INPUTS)).toThrow(
      /"acquire" dispatch was handed the "store" hook/,
    );
  });
});

describe('acquire: true-name', () => {
  const trueName = ownHook('acquire', TRUE_NAMING);

  it('makes research dearer and teaching cheaper', () => {
    const named = applyAcquire(trueName, STANDARD_INPUTS);
    const standard = applyAcquire(ownHook('acquire', VANCIAN), STANDARD_INPUTS);

    expect(named.researchCost).toBeGreaterThan(standard.researchCost);
    expect(named.teachCost).toBeLessThan(standard.teachCost);
  });

  it('creates every instance whole, because a name is either known or not', () => {
    const named = applyAcquire(trueName, STANDARD_INPUTS);
    expect(named.initialMastery).toBe(FP_ONE);
    // contracts.md §1.5 puts fp(1024) at "teachable without loss", so a True
    // Naming instance transmits down a chain of teachers without degrading.
    expect(named.initialMastery).toBe(named.stolenMastery);
  });

  it('delivers a stolen name complete — the synergy runs both ways', () => {
    const named = applyAcquire(trueName, { ...STANDARD_INPUTS, baseStolenMastery: 0 });
    expect(named.stolenMastery).toBe(FP_ONE);
  });

  it('never floors a cost to zero', () => {
    // A cheap enough node under a small enough multiplier floors to 0 under
    // round-toward-negative-infinity, and a teaching cost of zero is knowledge
    // acquired instantly and for nothing.
    const terms = applyAcquire(trueName, { ...STANDARD_INPUTS, baseTeachCost: 1 });
    expect(terms.teachCost).toBeGreaterThan(0);
  });

  it('leaves a zero cost at zero rather than inventing one', () => {
    const terms = applyAcquire(trueName, { ...STANDARD_INPUTS, baseTeachCost: 0 });
    expect(terms.teachCost).toBe(0);
  });

  it('says nothing about storage, casting, or cost', () => {
    // The containment, asserted structurally: the acquire hook's entire
    // vocabulary is these four keys, so it has no way to reach the other three
    // hooks even if someone wanted it to.
    expect(Object.keys(applyAcquire(trueName, STANDARD_INPUTS)).sort()).toEqual([
      'initialMastery',
      'researchCost',
      'stolenMastery',
      'teachCost',
    ]);
  });
});

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

describe('store: standard', () => {
  const policy = storePolicy(ownHook('store', VANCIAN));

  it('holds knowledge in heads and in books', () => {
    expect(canHoldAt(policy, LOCATION_KIND.mind)).toBe(true);
    expect(canHoldAt(policy, LOCATION_KIND.grimoire)).toBe(true);
    expect(canHoldAt(policy, LOCATION_KIND.library)).toBe(true);
    expect(canHoldAt(policy, LOCATION_KIND.palace)).toBe(false);
  });

  it('creates new personal instances in the mind, unbounded', () => {
    expect(policy.personalLocationKind).toBe(LOCATION_KIND.mind);
    expect(policy.slotsPerMage).toBe(UNBOUNDED_SLOTS);
    expect(admitToStore(policy, 500).admitted).toBe(true);
  });

  it('permits scribing', () => {
    expect(scribeAvailability(policy).available).toBe(true);
  });

  it('makes books objects and minds not', () => {
    expect(policy.lootableAt(LOCATION_KIND.grimoire)).toBe(true);
    expect(policy.burnableAt(LOCATION_KIND.library)).toBe(true);
    expect(policy.lootableAt(LOCATION_KIND.mind)).toBe(false);
  });

  it('loses only the mind when a mage dies', () => {
    expect(perishesWithHolder(policy, LOCATION_KIND.mind)).toBe(true);
    expect(perishesWithHolder(policy, LOCATION_KIND.grimoire)).toBe(false);
  });

  it('contributes no palace depth, because it has no palaces', () => {
    expect(palaceLibraryDepth(policy, [{ mageId: 1, tierWeightedCount: 40 }])).toBe(0);
  });
});

describe('store: palace', () => {
  const policy = storePolicy(ownHook('store', ART_OF_MEMORY));

  it('replaces the book, not the head', () => {
    expect(policy.personalLocationKind).toBe(LOCATION_KIND.palace);
    expect(canHoldAt(policy, LOCATION_KIND.palace)).toBe(true);
    expect(canHoldAt(policy, LOCATION_KIND.mind)).toBe(true);
    expect(canHoldAt(policy, LOCATION_KIND.grimoire)).toBe(false);
    expect(canHoldAt(policy, LOCATION_KIND.library)).toBe(false);
  });

  it('bounds a mage at the declared slot count, and names it when refusing', () => {
    expect(admitToStore(policy, 11).admitted).toBe(true);
    const refused = admitToStore(policy, 12);
    expect(refused.admitted).toBe(false);
    expect(refused.refusal).toContain('12');
  });

  it('makes scribing unavailable, so no written instance can be created', () => {
    const availability = scribeAvailability(policy);
    expect(availability.available).toBe(false);
    expect(availability.refusal).toMatch(/memory palace/);
  });

  it('makes a palace unlootable, untransferable, and unburnable', () => {
    expect(policy.lootableAt(LOCATION_KIND.palace)).toBe(false);
    expect(policy.transferableAt(LOCATION_KIND.palace)).toBe(false);
    expect(policy.burnableAt(LOCATION_KIND.palace)).toBe(false);
  });

  it('destroys the palace with its holder', () => {
    expect(perishesWithHolder(policy, LOCATION_KIND.palace)).toBe(true);
    expect(perishesWithHolder(policy, LOCATION_KIND.mind)).toBe(true);
  });

  it('supplies library depth from living mages, and loses it when one dies', () => {
    const three = [
      { mageId: 1, tierWeightedCount: 6 },
      { mageId: 2, tierWeightedCount: 4 },
      { mageId: 3, tierWeightedCount: 5 },
    ];
    const withThree = palaceLibraryDepth(policy, three);
    const withTwo = palaceLibraryDepth(policy, three.slice(0, 2));

    expect(withThree).toBeGreaterThan(0);
    expect(withTwo).toBeLessThan(withThree);
    // Nothing was transferred and nothing was written — the depth fell because
    // a mage stopped being alive, which is the mortal-capital loop working.
    expect(withThree).toBe(mul(fromInt(15), policy.libraryDepthCoefficient));
  });

  it('reports zero depth when the coefficient is zero, with no code change', () => {
    const zeroed = storePolicy({
      point: 'store',
      kind: 'palace',
      params: { ...ownHook('store', ART_OF_MEMORY).params, libraryDepthCoefficient: 0 },
    });
    expect(palaceLibraryDepth(zeroed, [{ mageId: 1, tierWeightedCount: 99 }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cast
// ---------------------------------------------------------------------------

const usable = (nodeId: number) => ({ nodeId, usable: true, dormant: false });

describe('cast: standard', () => {
  const policy = castPolicy(ownHook('cast', ART_OF_MEMORY));

  it('prepares nothing — a mage casts what she usably holds', () => {
    expect(policy.preparationRequired).toBe(false);
    expect(isCastable(policy, [], usable(7))).toBe(true);
    expect(isCastable(policy, [], { nodeId: 7, usable: false, dormant: false })).toBe(false);
  });

  it('refuses a preparation rather than quietly accepting one', () => {
    const outcome = prepare(policy, [], usable(7));
    expect(outcome.prepared).toBe(false);
    expect(outcome.refusal).toMatch(/prepares nothing/);
  });

  it('spends no preparation on a cast', () => {
    expect(expendOnCast(policy, [7, 9], 7)).toEqual({ cast: true, preparedSpells: [7, 9], refusal: '' });
  });
});

describe('cast: prepared', () => {
  const policy = castPolicy(ownHook('cast', VANCIAN));

  it('bounds preparation and names the slot count when refusing a fifth', () => {
    expect(policy.slotsPerMage).toBe(4);
    const full = [1, 2, 3, 4];
    const refused = prepare(policy, full, usable(5));
    expect(refused.prepared).toBe(false);
    expect(refused.refusal).toContain('4');
    expect(refused.preparedSpells).toEqual(full);
  });

  it('refuses a dormant node', () => {
    const refused = prepare(policy, [], { nodeId: 5, usable: true, dormant: true });
    expect(refused.prepared).toBe(false);
    expect(refused.refusal).toMatch(/dormant/);
  });

  it('refuses a node the mage holds no usable instance of', () => {
    const refused = prepare(policy, [], { nodeId: 5, usable: false, dormant: false });
    expect(refused.prepared).toBe(false);
    expect(refused.refusal).toMatch(/no usable instance/);
  });

  it('expends the preparation on a cast and leaves the knowledge alone', () => {
    const outcome = expendOnCast(policy, [1, 2, 3], 2);
    expect(outcome.cast).toBe(true);
    expect(outcome.preparedSpells).toEqual([1, 3]);
    // Uncastable now — but only until it is re-prepared, which the caller can
    // do because the instance itself was never touched.
    expect(isCastable(policy, outcome.preparedSpells, usable(2))).toBe(false);
    expect(prepare(policy, outcome.preparedSpells, usable(2)).prepared).toBe(true);
  });

  it('removes exactly one preparation when a node was readied twice', () => {
    expect(expendOnCast(policy, [4, 4, 5], 4).preparedSpells).toEqual([4, 5]);
  });

  it('refuses to cast an unprepared node the mage nonetheless knows', () => {
    const outcome = expendOnCast(policy, [1], 2);
    expect(outcome.cast).toBe(false);
    expect(outcome.refusal).toMatch(/still held/);
  });
});

// ---------------------------------------------------------------------------
// cost
// ---------------------------------------------------------------------------

describe('cost', () => {
  const standard = costPolicy(ownHook('cost', ART_OF_MEMORY));
  const prepaid = costPolicy(ownHook('cost', VANCIAN));
  const base = mul(fromInt(3), FP_ONE);

  it('charges the caller’s figure under standard', () => {
    expect(castCost(standard, base)).toBe(base);
    expect(preparationCost(standard, base)).toBe(0);
  });

  it('charges nothing at release under prepaid, because the price was already paid', () => {
    expect(castCost(prepaid, base)).toBe(0);
    expect(preparationCost(prepaid, base)).toBe(base);
    expect(prepaid.paidAtPreparation).toBe(true);
  });

  it('never charges twice, under either kind', () => {
    for (const policy of [standard, prepaid]) {
      const split = costSplit(policy, base);
      expect(split.atPreparation + split.atRelease).toBe(base);
    }
  });

  it('distinguishes "already paid" from "happens to be cheap"', () => {
    expect(castCost(standard, 0)).toBe(0);
    expect(standard.paidAtPreparation).toBe(false);
  });
});
