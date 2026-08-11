/*
 * Multiverse Mages — a library is what is shelved in it, and what it is good at
 * is never written down.
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
 * The library scenarios under `universities`, and the two `contracts.md` §1.5
 * rules they rest on: a shelved grimoire does not produce a second instance,
 * and nothing about what a university *is* may be cached in state.
 */

import { describe, expect, it } from 'vitest';

import { KNOWLEDGE_INSTANCE, UNIVERSITY, collectRecords, componentOf } from '@mm/state';

import {
  LIBRARY_UPKEEP_PER_INSTANCE,
  TIER_COUNT,
  dominantCell,
  libraryDepth,
  libraryUpkeep,
  relevantDepth,
  universityProfile,
} from '../../src/index.js';

import {
  fixedTier,
  holdGrimoire,
  inMind,
  makeLibrary,
  shelve,
  speciesNamed,
  syntheticTierOf,
  worldState,
} from './universities-fixtures.js';

describe('a library holds the instances that say they are in it', () => {
  it('counts nothing for an empty library', () => {
    const state = worldState();
    const depth = libraryDepth(state, makeLibrary(state), syntheticTierOf);
    expect(depth.distinctNodes).toBe(0);
    expect(depth.instanceCount).toBe(0);
    expect(depth.distinctByTier).toHaveLength(TIER_COUNT);
    expect(depth.cumulativeByTier).toEqual(Array.from({ length: TIER_COUNT }, () => 0));
  });

  it('ignores instances shelved somewhere else', () => {
    const state = worldState();
    const mine = makeLibrary(state);
    const theirs = makeLibrary(state);
    shelve(state, mine, 1);
    shelve(state, theirs, 2);
    shelve(state, theirs, 3);

    expect(libraryDepth(state, mine, syntheticTierOf).distinctNodes).toBe(1);
    expect(libraryDepth(state, theirs, syntheticTierOf).distinctNodes).toBe(2);
  });

  it('ignores instances in a mage mind, which are not on any shelf', () => {
    const state = worldState();
    const library = makeLibrary(state);
    const mage = state.entities.create();
    inMind(state, mage, 4);
    expect(libraryDepth(state, library, syntheticTierOf).distinctNodes).toBe(0);
  });

  it('counts duplicates as one node and two instances', () => {
    // §1.5's asymmetry, which is brake 4: benefit is concave in distinct depth,
    // cost is linear in holdings.
    const state = worldState();
    const library = makeLibrary(state);
    shelve(state, library, 9);
    shelve(state, library, 9);
    shelve(state, library, 9);

    const depth = libraryDepth(state, library, syntheticTierOf);
    expect(depth.distinctNodes).toBe(1);
    expect(depth.instanceCount).toBe(3);
  });

  it('aggregates the grimoires it holds, without those becoming a second instance', () => {
    const state = worldState();
    const library = makeLibrary(state);
    shelve(state, library, 1);
    holdGrimoire(state, library, 1);
    holdGrimoire(state, library, 2);

    const depth = libraryDepth(state, library, syntheticTierOf);
    expect(depth.grimoireCount).toBe(2);
    // Two grimoires and one shelved instance: the grimoire association is an
    // index, not a record that inflates depth.
    expect(depth.instanceCount).toBe(1);
  });

  it('rejects a node whose tier is outside 1..7 rather than bucketing it', () => {
    const state = worldState();
    const library = makeLibrary(state);
    shelve(state, library, 1);
    expect(() => libraryDepth(state, library, () => 0)).toThrow(/tiers/u);
    expect(() => libraryDepth(state, library, () => 9)).toThrow(/tiers/u);
  });
});

describe('depth is counted per tier and read as a prefix sum', () => {
  function stocked(): { state: ReturnType<typeof worldState>; library: number } {
    const state = worldState();
    const library = makeLibrary(state);
    // Nodes 1..21 under the synthetic numbering: three of each tier.
    for (let nodeId = 1; nodeId <= 21; nodeId += 1) shelve(state, library, nodeId);
    return { state, library };
  }

  it('spreads nodes across the seven tiers', () => {
    const { state, library } = stocked();
    const depth = libraryDepth(state, library, syntheticTierOf);
    expect(depth.distinctByTier).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(depth.cumulativeByTier).toEqual([3, 6, 9, 12, 15, 18, 21]);
  });

  it('gives a shallow species only what it can reach', () => {
    const { state, library } = stocked();
    const depth = libraryDepth(state, library, syntheticTierOf);
    const shallow = speciesNamed('orc');
    const deep = speciesNamed('draconic');

    expect(relevantDepth(depth, shallow.depthCeiling)).toBe(9);
    expect(relevantDepth(depth, deep.depthCeiling)).toBe(21);
    expect(relevantDepth(depth, deep.depthCeiling)).toBeGreaterThan(
      relevantDepth(depth, shallow.depthCeiling),
    );
  });

  it('contributes nothing to a shallow species from a uniformly deep library', () => {
    const state = worldState();
    const library = makeLibrary(state);
    for (let nodeId = 1; nodeId <= 30; nodeId += 1) shelve(state, library, nodeId);
    const depth = libraryDepth(state, library, fixedTier(6));

    expect(relevantDepth(depth, speciesNamed('orc').depthCeiling)).toBe(0);
    expect(relevantDepth(depth, speciesNamed('draconic').depthCeiling)).toBe(30);
  });

  it('reads one array entry rather than scanning, whatever the ceiling', () => {
    const { state, library } = stocked();
    const depth = libraryDepth(state, library, syntheticTierOf);
    // A ceiling above the top tier reads the last entry rather than running off
    // the end -- content could author one, and the answer for it is "all of it".
    expect(relevantDepth(depth, 99)).toBe(depth.distinctNodes);
    expect(relevantDepth(depth, 0)).toBe(0);
    expect(() => relevantDepth(depth, -1)).toThrow(/non-negative/u);
  });
});

describe('upkeep grows with holdings, not with distinct depth', () => {
  it('doubles when the instance count doubles', () => {
    const state = worldState();
    const library = makeLibrary(state);
    for (let nodeId = 1; nodeId <= 8; nodeId += 1) shelve(state, library, nodeId);
    const small = libraryUpkeep(libraryDepth(state, library, syntheticTierOf));

    for (let nodeId = 9; nodeId <= 16; nodeId += 1) shelve(state, library, nodeId);
    const large = libraryUpkeep(libraryDepth(state, library, syntheticTierOf));

    expect(small).toBe(8 * LIBRARY_UPKEEP_PER_INSTANCE);
    expect(large).toBe(small * 2);
  });

  it('charges for a duplicate copy, so hoarding is not free', () => {
    const state = worldState();
    const library = makeLibrary(state);
    shelve(state, library, 1);
    const one = libraryUpkeep(libraryDepth(state, library, syntheticTierOf));
    shelve(state, library, 1);
    const two = libraryUpkeep(libraryDepth(state, library, syntheticTierOf));

    expect(two).toBeGreaterThan(one);
    expect(libraryDepth(state, library, syntheticTierOf).distinctNodes).toBe(1);
  });
});

describe('a university has no declared specialization', () => {
  it('carries only the four fields contracts.md §1.4 lists', () => {
    expect(Object.keys(UNIVERSITY.fields).sort()).toEqual([
      'buildProgress',
      'capacity',
      'libraryId',
    ]);
  });

  it('derives its character from the library', () => {
    const state = worldState();
    const library = makeLibrary(state);
    // Ten nodes of cell 3, two of cell 8.
    for (let nodeId = 1; nodeId <= 10; nodeId += 1) shelve(state, library, nodeId);
    for (let nodeId = 11; nodeId <= 12; nodeId += 1) shelve(state, library, nodeId);

    const profile = universityProfile(state, {
      library,
      residentMages: [],
      cellOf: (nodeId) => (nodeId <= 10 ? 3 : 8),
    });
    expect(dominantCell(profile)).toBe(3);
    expect(profile.cells).toEqual([
      { cellId: 3, weight: 10 },
      { cellId: 8, weight: 2 },
    ]);
  });

  it('includes what its resident mages know, and no one else’s', () => {
    const state = worldState();
    const library = makeLibrary(state);
    const resident = state.entities.create();
    const stranger = state.entities.create();
    inMind(state, resident, 1);
    inMind(state, stranger, 2);

    const profile = universityProfile(state, {
      library,
      residentMages: [resident],
      cellOf: (nodeId) => nodeId,
    });
    expect(profile.cells).toEqual([{ cellId: 1, weight: 1 }]);
  });

  it('counts a node held twice over as one thing it is good at', () => {
    const state = worldState();
    const library = makeLibrary(state);
    const resident = state.entities.create();
    shelve(state, library, 5);
    shelve(state, library, 5);
    inMind(state, resident, 5);

    const profile = universityProfile(state, {
      library,
      residentMages: [resident],
      cellOf: () => 2,
    });
    expect(profile.distinctNodes).toBe(1);
    expect(profile.cells).toEqual([{ cellId: 2, weight: 1 }]);
  });

  it('is empty once the library is destroyed, with no residue', () => {
    const state = worldState();
    const library = makeLibrary(state);
    for (let nodeId = 1; nodeId <= 10; nodeId += 1) shelve(state, library, nodeId);

    const before = universityProfile(state, { library, residentMages: [], cellOf: () => 3 });
    expect(dominantCell(before)).toBe(3);

    // Burn it: every instance whose location was this library is gone.
    const instances = componentOf(state, KNOWLEDGE_INSTANCE);
    for (const { handle } of collectRecords(state, KNOWLEDGE_INSTANCE)) instances.remove(handle);

    const after = universityProfile(state, { library, residentMages: [], cellOf: () => 3 });
    expect(after.cells).toEqual([]);
    expect(dominantCell(after)).toBe(0);
  });

  it('orders cells by weight then by id, never by which was shelved first', () => {
    const state = worldState();
    const library = makeLibrary(state);
    shelve(state, library, 1);
    shelve(state, library, 2);
    shelve(state, library, 3);

    const profile = universityProfile(state, {
      library,
      residentMages: [],
      // Two cells tied at one node each, and one with a single node: ties fall
      // to the lower cell id.
      cellOf: (nodeId) => (nodeId === 3 ? 9 : nodeId === 2 ? 5 : 5),
    });
    expect(profile.cells).toEqual([
      { cellId: 5, weight: 2 },
      { cellId: 9, weight: 1 },
    ]);
  });
});
