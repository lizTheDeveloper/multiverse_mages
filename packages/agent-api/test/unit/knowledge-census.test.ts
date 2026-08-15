/*
 * Multiverse Mages — the knowledge census, and what it must say.
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

import { KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE, MAGE_ROLE, attachRecord, componentOf } from '@mm/state';
import {
  OBSERVATION_LAYOUT_DIGEST,
  knowledgeCensus,
  locationSharePerMille,
  mageContainment,
} from '@mm/agent-api';

import { FP, addInstance, firstUniverse } from './fixtures.js';

describe('per-node census', () => {
  it('disaggregates §1.5 existence into a count and a location split', () => {
    const world = firstUniverse();
    const [alice, bob] = world.mages;

    // Node 7: three copies, three different kinds of place.
    addInstance(world.state, 7, LOCATION_KIND.mind, alice as number);
    addInstance(world.state, 7, LOCATION_KIND.library, world.library);
    addInstance(world.state, 7, LOCATION_KIND.grimoire, 900);
    // Node 9: the last copy, in one mage's head.
    addInstance(world.state, 9, LOCATION_KIND.mind, bob as number);

    const census = knowledgeCensus(world.state);
    const seven = census.byNode.find((entry) => entry.nodeId === 7);
    expect(seven).toEqual({
      nodeId: 7,
      total: 3,
      mind: 1,
      grimoire: 1,
      library: 1,
      palace: 0,
      distinctLocations: 3,
    });

    const nine = census.byNode.find((entry) => entry.nodeId === 9);
    expect(nine?.total).toBe(1);
    expect(nine?.mind).toBe(1);
  });

  it('returns nodes in ascending id order, never row order', () => {
    const world = firstUniverse();
    for (const nodeId of [40, 3, 17, 3, 40]) {
      addInstance(world.state, nodeId, LOCATION_KIND.library, world.library);
    }
    const ids = knowledgeCensus(world.state).byNode.map((entry) => entry.nodeId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('agrees with §1.5 that existence is instance count >= 1', () => {
    const world = firstUniverse();
    const before = knowledgeCensus(world.state);
    const instance = addInstance(world.state, 4242, LOCATION_KIND.library, world.library);
    const after = knowledgeCensus(world.state);
    expect(after.nodesHeld).toBe(before.nodesHeld + 1);
    expect(after.byNode.some((entry) => entry.nodeId === 4242)).toBe(true);

    world.state.entities.destroy(instance);
    const gone = knowledgeCensus(world.state);
    expect(gone.byNode.some((entry) => entry.nodeId === 4242)).toBe(false);
    expect(gone.nodesHeld).toBe(before.nodesHeld);
  });
});

describe('fragility', () => {
  it('names the nodes standing at exactly one instance', () => {
    const world = firstUniverse();
    addInstance(world.state, 501, LOCATION_KIND.mind, world.mages[0] as number);
    addInstance(world.state, 502, LOCATION_KIND.library, world.library);
    addInstance(world.state, 502, LOCATION_KIND.mind, world.mages[1] as number);

    const census = knowledgeCensus(world.state);
    expect(census.fragileNodeIds).toContain(501);
    expect(census.fragileNodeIds).not.toContain(502);
    expect(census.minRedundancy).toBe(1);
  });

  it('separates "one copy left" from "no copy written down"', () => {
    const world = firstUniverse();
    // Forty copies, all of them in heads. Not fragile by count; one generation
    // from loss, and exactly the list an archivist scribes from.
    for (let i = 0; i < 40; i += 1) {
      addInstance(world.state, 601, LOCATION_KIND.mind, world.mages[i % world.mages.length] as number);
    }
    const census = knowledgeCensus(world.state);
    expect(census.fragileNodeIds).not.toContain(601);
    expect(census.unwrittenNodeIds).toContain(601);
  });

  it('flags a node whose every copy sits in one place, however many copies', () => {
    const world = firstUniverse();
    for (let i = 0; i < 12; i += 1) {
      addInstance(world.state, 701, LOCATION_KIND.library, world.library);
    }
    // Twelve copies, one shelf. One fire.
    const census = knowledgeCensus(world.state);
    const entry = census.byNode.find((e) => e.nodeId === 701);
    expect(entry?.total).toBe(12);
    expect(entry?.distinctLocations).toBe(1);
    expect(census.singleLocationNodeIds).toContain(701);
    expect(census.fragileNodeIds).not.toContain(701);
  });

});

describe('where the physical knowledge is kept', () => {
  it('splits the universe total across §1.5’s four kinds', () => {
    const world = firstUniverse();
    const baseline = knowledgeCensus(world.state).whereKept;
    addInstance(world.state, 801, LOCATION_KIND.mind, world.mages[0] as number);
    addInstance(world.state, 801, LOCATION_KIND.palace, world.mages[0] as number);
    addInstance(world.state, 802, LOCATION_KIND.grimoire, 951);
    addInstance(world.state, 803, LOCATION_KIND.library, world.library);

    const split = knowledgeCensus(world.state).whereKept;
    expect(split.mind).toBe(baseline.mind + 1);
    expect(split.palace).toBe(baseline.palace + 1);
    expect(split.grimoire).toBe(baseline.grimoire + 1);
    expect(split.library).toBe(baseline.library + 1);
  });

  it('counts a shelved book once, at the library, per §1.5', () => {
    // §1.5: "the instance's location is *rewritten* from (2, grimoireId) to
    // (3, libraryId) on shelving". Counting it twice would inflate every
    // redundancy metric.
    const world = firstUniverse();
    const instance = addInstance(world.state, 900, LOCATION_KIND.grimoire, 970);
    const before = knowledgeCensus(world.state);
    expect(before.byNode.find((e) => e.nodeId === 900)?.total).toBe(1);

    const store = componentOf(world.state, KNOWLEDGE_INSTANCE);
    store.set(instance, 'locationKind', LOCATION_KIND.library);
    store.set(instance, 'locationId', world.library);

    const after = knowledgeCensus(world.state);
    const entry = after.byNode.find((e) => e.nodeId === 900);
    expect(entry?.total).toBe(1);
    expect(entry?.grimoire).toBe(0);
    expect(entry?.library).toBe(1);
    expect(after.instanceTotal).toBe(before.instanceTotal);
  });

  it('reports a malformed location kind rather than dropping the row', () => {
    const world = firstUniverse();
    addInstance(world.state, 910, 0, 0);
    const census = knowledgeCensus(world.state);
    expect(census.whereKept.malformed).toBe(1);
    // Still counted in the node's total: a corrupt row is not a smaller universe.
    expect(census.byNode.find((e) => e.nodeId === 910)?.total).toBe(1);
  });

  it('renders the split as integer parts per thousand that never invent a copy', () => {
    const share = locationSharePerMille({
      mind: 1,
      grimoire: 1,
      library: 1,
      palace: 0,
      malformed: 0,
    });
    // Three thirds, floored, is 999. Rounding one up to reach 1000 would be a
    // fourth copy that does not exist.
    expect(share.mind + share.grimoire + share.library + share.palace).toBe(999);
    expect(locationSharePerMille({ mind: 0, grimoire: 0, library: 0, palace: 0, malformed: 0 })).toEqual({
      mind: 0,
      grimoire: 0,
      library: 0,
      palace: 0,
    });
  });
});

describe('per-mage repertoire', () => {
  it('says what one named mage knows', () => {
    const world = firstUniverse();
    const [alice, bob] = world.mages;
    addInstance(world.state, 11, LOCATION_KIND.mind, alice as number);
    addInstance(world.state, 12, LOCATION_KIND.palace, alice as number);
    addInstance(world.state, 13, LOCATION_KIND.mind, bob as number);

    const census = knowledgeCensus(world.state);
    const aliceRow = census.repertoires.find((r) => r.mageHandle === alice);
    expect(aliceRow?.nodeIds).toEqual(expect.arrayContaining([11, 12]));
    expect(aliceRow?.mindInstances).toBeGreaterThanOrEqual(1);
    expect(aliceRow?.palaceInstances).toBe(1);
    expect(census.repertoires.find((r) => r.mageHandle === bob)?.nodeIds).toContain(13);
  });

  it('does not credit a mage with a book she is holding', () => {
    // §5 gives a grimoire its own holder field, and the book outlives her.
    // Counting it as hers would make the repertoire lie about what dies with her.
    const world = firstUniverse();
    const alice = world.mages[0] as number;
    const before = knowledgeCensus(world.state).repertoires.find((r) => r.mageHandle === alice);
    addInstance(world.state, 21, LOCATION_KIND.grimoire, alice);
    const after = knowledgeCensus(world.state).repertoires.find((r) => r.mageHandle === alice);
    expect(after?.nodeIds).toEqual(before?.nodeIds);
    expect(after?.nodeIds).not.toContain(21);
  });

  it('lists a mage who knows nothing, rather than omitting her', () => {
    const world = firstUniverse();
    const empty = world.state.entities.create();
    attachRecord(world.state, MAGE, empty, {
      speciesId: 1,
      birthTick: 0,
      roleId: MAGE_ROLE.researcher,
      universityId: 0,
      curiosity: FP,
      ambition: FP,
      caution: FP,
      vigor: FP,
      maxVigor: FP,
      alive: 1,
    });
    const row = knowledgeCensus(world.state).repertoires.find((r) => r.mageHandle === empty);
    expect(row).toBeDefined();
    expect(row?.nodeIds).toEqual([]);
    expect(row?.alive).toBe(true);
  });

  it('surfaces knowledge whose mage row has gone, instead of hiding it', () => {
    const world = firstUniverse();
    const ghost = 0x7f00;
    addInstance(world.state, 31, LOCATION_KIND.mind, ghost);
    const row = knowledgeCensus(world.state).repertoires.find((r) => r.mageHandle === ghost);
    expect(row?.alive).toBe(false);
    expect(row?.nodeIds).toEqual([31]);
  });
});

describe('mage containment — the W20/W21 instrument', () => {
  /** A living mage the fixture has taught nothing, so a pair test starts clean. */
  function freshMage(state: import('@mm/sim-core').SimState): number {
    const mage = state.entities.create();
    attachRecord(state, MAGE, mage, {
      speciesId: 1,
      birthTick: 0,
      roleId: MAGE_ROLE.researcher,
      universityId: 0,
      curiosity: FP,
      ambition: FP,
      caution: FP,
      vigor: FP,
      maxVigor: FP,
      alive: 1,
    });
    return mage;
  }

  /** The pair, and only the pair — the fixture's own holders are filtered out. */
  function pair(left: readonly number[], right: readonly number[]) {
    const world = firstUniverse();
    const alice = freshMage(world.state);
    const bob = freshMage(world.state);
    for (const nodeId of left) addInstance(world.state, nodeId, LOCATION_KIND.mind, alice);
    for (const nodeId of right) addInstance(world.state, nodeId, LOCATION_KIND.mind, bob);
    const census = knowledgeCensus(world.state);
    return {
      world,
      alice,
      bob,
      report: mageContainment({
        ...census,
        repertoires: census.repertoires.filter((r) => r.mageHandle === alice || r.mageHandle === bob),
      }),
    };
  }

  it('counts a strictly nested pair as containment, not divergence', () => {
    const { report } = pair([1001, 1002, 1003], [1001, 1002]);
    expect(report.holders).toBe(2);
    expect(report.pairs).toBe(1);
    expect(report.strictContainmentPairs).toBe(1);
    expect(report.incomparablePairs).toBe(0);
    expect(report.intersectionSize).toBe(2);
    expect(report.unionSize).toBe(3);
  });

  it('detects two mages holding incomparable knowledge — the thing W20 is trying to create', () => {
    const { report } = pair([2001, 2002], [2002, 2003]);
    expect(report.incomparablePairs).toBe(1);
    expect(report.strictContainmentPairs).toBe(0);
    expect(report.disjointPairs).toBe(0);
    expect(report.intersectionSize).toBe(1);
    expect(report.largestRepertoire).toBeGreaterThanOrEqual(2);
  });

  it('separates incomparable-but-overlapping from wholly disjoint', () => {
    const { report } = pair([3001], [3002]);
    expect(report.incomparablePairs).toBe(1);
    expect(report.disjointPairs).toBe(1);
    expect(report.intersectionSize).toBe(0);
  });

  it('counts identical repertoires as identical, not as containment', () => {
    const { report } = pair([4001, 4002], [4001, 4002]);
    expect(report.identicalPairs).toBe(1);
    expect(report.incomparablePairs).toBe(0);
    expect(report.strictContainmentPairs).toBe(0);
  });

  it('excludes the untaught, because the empty set nests inside everything', () => {
    const world = firstUniverse();
    const a = world.mages[2] as number;
    for (const nodeId of [5001, 5002]) addInstance(world.state, nodeId, LOCATION_KIND.mind, a);
    const census = knowledgeCensus(world.state);
    // Every mage row is present, most of them empty; only holders form pairs.
    const report = mageContainment(census);
    expect(report.holders).toBeLessThan(census.repertoires.length);
    expect(report.holders).toBeGreaterThan(0);
  });

  it('excludes the dead by default, and includes them on request', () => {
    const world = firstUniverse();
    const mageStore = componentOf(world.state, MAGE);
    const dead = world.mages.find((m) => mageStore.get(m, 'alive') === 0);
    expect(dead).toBeDefined();
    addInstance(world.state, 6001, LOCATION_KIND.mind, dead as number);
    const census = knowledgeCensus(world.state);
    const living = mageContainment(census, { livingOnly: true });
    const all = mageContainment(census, { livingOnly: false });
    expect(all.holders).toBe(living.holders + 1);
  });
});

describe('the observation vector is untouched', () => {
  it('keeps the layout digest gym-bridge refuses to start without', () => {
    // The census is contracts.md §4.4's out-of-band projection, not a channel.
    // If this literal ever moves on this branch, the change widened the vector
    // and invalidated every trained policy — which is a decision, not a diff.
    expect(OBSERVATION_LAYOUT_DIGEST).toBe('46182c35d829b205');
  });
});
