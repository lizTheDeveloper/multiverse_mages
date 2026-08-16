/*
 * Multiverse Mages — a candidate slot describes the candidate it is.
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
 * `docs/design/interface-findings.md` §1.11 — *"a candidate slot carries no
 * identity"* — answered for everything except a personal name, which nothing in
 * state holds.
 *
 * The assertion that matters most here is **alignment**. A submitted parameter
 * is a slot index, so a descriptor list one entry out of step would show a
 * player one mage and bless another, and neither the gate nor the mask would
 * say a word: both slots are legal, both resolve, and the outcome is simply not
 * the one that was chosen. There is no rejection to notice.
 */

import {
  GOD_ACTION,
  PARAMETERIZED_ACTIONS,
  buildCandidates,
  buildCatalogue,
  describeCandidates,
} from '@mm/agent-api';
import { GOAL_COMMITMENT, MAGE, MAGE_ROLE, attachRecord, cellIdAt, componentOf } from '@mm/state';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, FIXTURE_NODES, firstUniverse } from './fixtures.js';

/**
 * The shipped fixture catalogue offers no founding grant at all: both of its
 * tier-1 nodes already have an instance somewhere, and
 * `foundingKnowledgeCandidates` excludes exactly those — *"teaching and
 * scribing are the route to further copies"*. One unheld tier-1 node in a
 * permitted cell is what makes action 8's list non-empty.
 */
const GRANTABLE_CATALOGUE = buildCatalogue(
  [...FIXTURE_NODES, { nodeId: 7, cellId: cellIdAt(1, 1), tier: 1 }],
  [1, 2, 3],
);

const describeFixture = (world = firstUniverse(), portalTargets: readonly number[] = [1, 2]) => {
  const lists = buildCandidates({
    state: world.state,
    catalogue: FIXTURE_CATALOGUE,
    portalTargets: [...portalTargets],
  });
  return { world, lists, detail: describeCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE, lists }) };
};

describe('descriptors line up with the slots they describe', () => {
  it('returns one descriptor per candidate, per action, in list order', () => {
    const { lists, detail } = describeFixture();
    for (const action of PARAMETERIZED_ACTIONS) {
      expect(detail.byAction.get(action)?.length ?? 0, `action ${String(action)}`).toBe(
        lists.get(action)?.length ?? 0,
      );
    }
  });

  it('names, in every slot, the handle that slot would submit', () => {
    // The whole failure this guards is silent: slot 3 drawn as one mage and
    // resolved as another produces a legal action with the wrong subject.
    const { lists, detail } = describeFixture();
    for (const action of [GOD_ACTION.blessMage, GOD_ACTION.assignRole, GOD_ACTION.grantFoundingKnowledge]) {
      const slots = lists.get(action) ?? [];
      const rows = detail.byAction.get(action) ?? [];
      slots.forEach((candidate, index) => {
        const row = rows[index];
        expect(row === undefined || row.kind === 'found-university').toBe(false);
        if (row !== undefined && 'handle' in row) expect(row.handle).toBe(candidate.params[0]);
      });
    }
  });

  it('carries the second parameter where the verb has one', () => {
    const { lists, detail } = describeFixture();
    const roleSlots = lists.get(GOD_ACTION.assignRole) ?? [];
    const roleRows = detail.byAction.get(GOD_ACTION.assignRole) ?? [];
    roleSlots.forEach((candidate, index) => {
      const row = roleRows[index];
      expect(row?.kind).toBe('mage-role');
      if (row?.kind === 'mage-role') expect(row.toRoleId).toBe(candidate.params[1]);
    });
  });
});

describe('the five shapes are five shapes', () => {
  it('calls slot 0 of fundUniversity what it is — an option, not an entity', () => {
    // `fundUniversityCandidates` pins `{ params: [0] }` at slot 0, and §1.11's
    // complaint is that the anonymous label could not tell it from a college.
    const { detail } = describeFixture();
    expect(detail.byAction.get(GOD_ACTION.fundUniversity)?.[0]?.kind).toBe('found-university');
    expect(detail.byAction.get(GOD_ACTION.fundUniversity)?.[1]?.kind).toBe('university');
  });

  it('pairs a mage with a node for the founding grant, and says which node', () => {
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: GRANTABLE_CATALOGUE });
    const detail = describeCandidates({
      state: world.state,
      catalogue: GRANTABLE_CATALOGUE,
      lists,
    });
    const slots = lists.get(GOD_ACTION.grantFoundingKnowledge) ?? [];
    const rows = detail.byAction.get(GOD_ACTION.grantFoundingKnowledge) ?? [];
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach((candidate, index) => {
      const row = rows[index];
      expect(row?.kind).toBe('mage-node');
      if (row?.kind === 'mage-node') expect(row.nodeId).toBe(candidate.params[1]);
    });
  });

  it('describes a portal target as an id and nothing else', () => {
    // Deliberate. A rival universe is generated from the run seed and the
    // target id at raid time, so before the portal opens there is no entity to
    // read. Inventing a description would be the one thing worse than the bare
    // number.
    const { detail } = describeFixture();
    expect(detail.byAction.get(GOD_ACTION.openPortal)?.[0]).toEqual({
      kind: 'portal-target',
      targetId: 1,
    });
  });
});

describe('a mage descriptor is what tells one mage from another', () => {
  it('carries species, age, role, affiliation, personality, vigor and knowledge', () => {
    const { world, detail } = describeFixture();
    const first = detail.mages.get(world.mages[0] as number);
    const second = detail.mages.get(world.mages[1] as number);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // The fixture's first mage holds a tier-1 and a tier-3 node; the second
    // holds nothing at all. That is the distinction `mageTierSlot` calls
    // bucketless, and it is the one a player most needs at a glance.
    expect(first?.nodesKnown).toBe(2);
    expect(first?.deepestTier).toBe(3);
    expect(second?.nodesKnown).toBe(0);
    expect(second?.deepestTier).toBe(0);
    expect(first?.roleId).toBe(MAGE_ROLE.researcher);
    expect(second?.roleId).toBe(MAGE_ROLE.professor);
    expect(first?.universityId).toBe(world.university);
    // Age is derived from `birthTick` against this state's clock, never stored.
    expect(first?.ageTicks).toBe(400);
  });

  it('excludes the dead, whom no candidate list offers either', () => {
    const { world, detail } = describeFixture();
    expect(detail.mages.has(world.mages[3] as number)).toBe(false);
  });

  it('leaves goal undefined for a mage who has never committed, never idle', () => {
    // `GOAL_COMMITMENT`'s own note: an absent row is "has not chosen", and
    // `goalId: 0` is "weighed her options and chose idle". Rendering the first
    // as the second reports a university of deliberate loafers.
    const world = firstUniverse();
    const committed = world.mages[0] as number;
    attachRecord(world.state, GOAL_COMMITMENT, committed, {
      goalId: 4,
      targetNodeId: 2,
      adoptedTick: 3,
      score: 700,
    });
    const { detail } = describeFixture(world);
    expect(detail.mages.get(committed)?.goal).toEqual({
      goalId: 4,
      targetNodeId: 2,
      adoptedTick: 3,
      score: 700,
    });
    expect(detail.mages.get(world.mages[1] as number)?.goal).toBeUndefined();
  });

  it('describes the college a candidate belongs to even when funding did not list it', () => {
    const { world, detail } = describeFixture();
    const college = detail.universities.get(world.university);
    expect(college?.hasLibrary).toBe(true);
    // Two copies of node 1 and one of node 3 are shelved: two distinct nodes.
    expect(college?.libraryNodes).toBe(2);
    // Three of the fixture's four mages are living and all four name it.
    expect(college?.affiliatedMages).toBe(3);
  });
});

describe('a slot whose subject has gone is a lost slot, not a zeroed mage', () => {
  it('reports kind "lost" when the lists were built against an older state', () => {
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    // Kill everybody the lists named, then describe the same lists. This is the
    // §4.4 case — "a slot referring to an entity that died between observation
    // and action" — seen from the reading side rather than the gate's.
    const mages = componentOf(world.state, MAGE);
    for (const handle of world.mages) if (mages.has(handle)) mages.set(handle, 'alive', 0);
    const detail = describeCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE, lists });
    const bless = detail.byAction.get(GOD_ACTION.blessMage) ?? [];
    expect(bless.length).toBeGreaterThan(0);
    expect(bless.every((row) => row.kind === 'lost')).toBe(true);
    expect(detail.mages.size).toBe(0);
  });
});
