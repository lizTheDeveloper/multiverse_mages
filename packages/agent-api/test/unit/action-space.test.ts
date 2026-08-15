/*
 * Multiverse Mages — the action table and its candidate lists.
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
 * Tasks 4.3 and the candidate-list half of 4.4.
 *
 * The ids are asserted one at a time against `contracts.md` §4.2's numbers. A
 * loop over `Object.values` would assert that the table is *self-consistent*,
 * which it is by construction — the thing worth checking is that it matches the
 * document, because the ids are serialized into action logs and into a trained
 * policy's output layer, and renumbering one is invisible everywhere.
 */

import { MAGE_ROLE, cellIdAt } from '@mm/state';
import {
  ACTION_SPACE_SIZE,
  ALL_GOD_ACTIONS,
  CANDIDATE_SLOTS,
  GOD_ACTION,
  PARAMETERIZED_ACTIONS,
  buildCandidates,
  buildCatalogue,
  candidateAt,
  candidateSlotCount,
  isGodAction,
  isLegal,
  legalityMask,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, FIXTURE_NODES, firstUniverse, secondUniverse } from './fixtures.js';

describe('task 4.3 — the discrete action enumeration', () => {
  it('matches contracts.md §4.2 id for id', () => {
    expect(GOD_ACTION.noop).toBe(0);
    expect(GOD_ACTION.permitTechnique).toBe(1);
    expect(GOD_ACTION.forbidTechnique).toBe(2);
    expect(GOD_ACTION.permitForm).toBe(3);
    expect(GOD_ACTION.forbidForm).toBe(4);
    expect(GOD_ACTION.issueDispensation).toBe(5);
    expect(GOD_ACTION.issueInterdiction).toBe(6);
    expect(GOD_ACTION.revokeEdict).toBe(7);
    expect(GOD_ACTION.grantFoundingKnowledge).toBe(8);
    expect(GOD_ACTION.blessMage).toBe(9);
    expect(GOD_ACTION.assignRole).toBe(10);
    expect(GOD_ACTION.fundUniversity).toBe(11);
    expect(GOD_ACTION.encourageResearch).toBe(12);
    expect(GOD_ACTION.changeTradition).toBe(13);
    expect(GOD_ACTION.openPortal).toBe(14);
    expect(GOD_ACTION.declareAscension).toBe(15);
  });

  it('is 17 wide, dense, and gap-free', () => {
    // 17 since `w109` appended action 16, `inviteScholar`. §4.2's ids are
    // permanent and the space is append-only: nothing moved, and the width is
    // pinned here rather than derived so that widening it stays a deliberate
    // edit — a policy's output layer is this number.
    expect(ACTION_SPACE_SIZE).toBe(17);
    expect([...ALL_GOD_ACTIONS]).toEqual(Array.from({ length: 17 }, (_, index) => index));
    for (let id = 0; id < 17; id += 1) expect(isGodAction(id)).toBe(true);
    expect(isGodAction(17)).toBe(false);
    expect(isGodAction(-1)).toBe(false);
  });

  it('does not collide with the clock actions sim-core reserves', () => {
    // CORE_ACTION numbers enterEngagement/leaveEngagement from the top of the
    // uint16 range for exactly this reason. `noop` is 0 in both, which is the
    // same action, not a collision.
    expect(ACTION_SPACE_SIZE).toBeLessThan(65534);
  });
});

describe('task 4.4 — k is a pinned structural constant per action', () => {
  it('pins a slot count for every parameterized action and no others', () => {
    // 16 joins §4.4's range: it addresses a species id whose *legal* set is a
    // property of state, exactly as 13 addresses a tradition id. 15 stays out —
    // declaring ascension takes no parameter at all.
    expect([...PARAMETERIZED_ACTIONS]).toEqual([8, 9, 10, 11, 12, 13, 14, 16]);
    for (const action of PARAMETERIZED_ACTIONS) {
      expect(candidateSlotCount(action), `k for action ${action}`).toBeGreaterThan(0);
    }
    for (const action of [0, 1, 2, 3, 4, 5, 6, 7, 15]) {
      expect(candidateSlotCount(action), `action ${action} takes no slots`).toBe(0);
    }
  });

  it('truncates a candidate list at k even mid-mage, rather than padding or growing', () => {
    // The list is (mage, role) pairs and each mage contributes three of them,
    // so k = 32 genuinely cuts the eleventh mage off partway through hers. That
    // is the intended behaviour: fixed length is what a policy learns against,
    // and a k that flexed to end on a mage boundary would not be fixed.
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect((lists.get(GOD_ACTION.assignRole) ?? []).length).toBeLessThanOrEqual(
      candidateSlotCount(GOD_ACTION.assignRole),
    );
  });
});

describe('candidate lists are deterministic and never longer than k', () => {
  it('produces byte-identical lists from two states holding the same values', () => {
    const a = buildCandidates({ state: firstUniverse().state, catalogue: FIXTURE_CATALOGUE });
    const b = buildCandidates({ state: firstUniverse().state, catalogue: FIXTURE_CATALOGUE });
    for (const action of PARAMETERIZED_ACTIONS) {
      expect(a.get(action)).toEqual(b.get(action));
    }
  });

  it('never exceeds the pinned k', () => {
    const lists = buildCandidates({
      state: firstUniverse().state,
      catalogue: FIXTURE_CATALOGUE,
      portalTargets: Array.from({ length: 50 }, (_, index) => index + 1),
    });
    for (const action of PARAMETERIZED_ACTIONS) {
      expect(lists.get(action)?.length ?? 0).toBeLessThanOrEqual(candidateSlotCount(action));
    }
    // The portal list was handed 50 targets and k is 8.
    expect(lists.get(GOD_ACTION.openPortal)).toHaveLength(
      CANDIDATE_SLOTS[GOD_ACTION.openPortal] as number,
    );
  });

  it('ranks mages to bless by ascending vigor, tie-broken by handle', () => {
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const bless = lists.get(GOD_ACTION.blessMage) ?? [];
    // Three living mages, at 1, 3 and 4 vigor. Most depleted first.
    expect(bless.map((candidate) => candidate.params[0])).toEqual([
      world.mages[1],
      world.mages[0],
      world.mages[2],
    ]);
  });

  it('offers founding a new university as a fixed slot 0, ahead of the ranked ones', () => {
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const fund = lists.get(GOD_ACTION.fundUniversity) ?? [];
    // §4.2: "universityId | 0 to found new". Slot 0 does not name an entity, so
    // it cannot die and cannot move.
    expect(fund[0]?.params).toEqual([0]);
    expect(fund[1]?.params).toEqual([world.university]);
  });

  it('excludes the tradition already held, and the role a mage already has', () => {
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const traditions = (lists.get(GOD_ACTION.changeTradition) ?? []).map((c) => c.params[0]);
    expect(traditions).not.toContain(2); // the fixture universe holds tradition 2
    expect(traditions).toEqual([1, 3]);

    const roles = lists.get(GOD_ACTION.assignRole) ?? [];
    const forFirstMage = roles.filter((candidate) => candidate.params[0] === world.mages[0]);
    expect(forFirstMage.map((candidate) => candidate.params[1])).not.toContain(
      MAGE_ROLE.researcher,
    );
  });

  it('offers founding knowledge only for permitted cells and tier-1 nodes with no instance anywhere', () => {
    const world = firstUniverse();
    // Node 7 is a tier-1 root in a permitted cell that the fixture universe has
    // never held. The catalogue is widened here rather than in `fixtures.ts`
    // because every other suite reads the fixture's knowledge channels, and a
    // seventh node would move them.
    const catalogue = buildCatalogue(
      [...FIXTURE_NODES, { nodeId: 7, cellId: cellIdAt(0, 0), tier: 1 }],
      [1, 2, 3],
    );
    const lists = buildCandidates({ state: world.state, catalogue });
    const grants = lists.get(GOD_ACTION.grantFoundingKnowledge) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(catalogue.node(grant.params[1] as number)?.tier).toBe(1);
      // Node 1 sits in a mage's mind and in the library; node 3 sits in the
      // library alone. `grantPlan` refuses both — `instanceCount(nodeId) > 0`
      // does not care where the instance is — so neither may be offered.
      expect(grant.params[1]).toBe(7);
    }
    // Every living mage is a legal target for the one node that has no
    // instance. The dead fourth mage is not.
    expect(grants.map((grant) => grant.params[0])).toEqual([
      world.mages[0],
      world.mages[1],
      world.mages[2],
    ]);
  });

  it('offers nothing at all once every permitted root exists somewhere', () => {
    // The fixture's two permitted tier-1 nodes are node 1 (a mind and the
    // library) and node 3 (the library only). Both exist, so there is nothing
    // left to found and §4.2's action 8 is structurally illegal.
    //
    // This is the mask agreeing with the rules rather than offering a
    // submission the resolver will silently refuse: `grantPlan` would have
    // turned down every pair in the list this used to produce.
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(lists.get(GOD_ACTION.grantFoundingKnowledge)).toHaveLength(0);
    expect(
      isLegal(legalityMask({ state: world.state, candidates: lists }), GOD_ACTION.grantFoundingKnowledge),
    ).toBe(false);
  });

  it('gives action 14 no candidates when the caller names no other universe', () => {
    // §1.1: one simulation instance holds one universe. The multiverse is not
    // in state, so an empty list is the correct answer for a solo run — not an
    // error, and not an invented target.
    const lists = buildCandidates({ state: secondUniverse().state, catalogue: FIXTURE_CATALOGUE });
    expect(lists.get(GOD_ACTION.openPortal)).toHaveLength(0);
  });

  it('resolves a slot index, and refuses one past the end of the list', () => {
    const world = firstUniverse();
    const lists = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(candidateAt(lists, GOD_ACTION.blessMage, 0)?.params).toEqual([world.mages[1]]);
    expect(candidateAt(lists, GOD_ACTION.blessMage, 3)).toBeUndefined();
    expect(candidateAt(lists, GOD_ACTION.blessMage, 999)).toBeUndefined();
    expect(candidateAt(lists, GOD_ACTION.blessMage, -1)).toBeUndefined();
  });
});

describe('action 16 — the alliance gate is in the mask, not only in the rules', () => {
  // The regression these three pin cost a whole measurement arm. `policyFor`
  // submits **one action per round** and takes the first the mask calls legal,
  // so a mask that is optimistic by one predicate does not cost an agent a
  // countable refusal — it costs it the entire round, for the whole run. The
  // first draft omitted the portal check here on the reasoning that
  // `invitePlan` refuses on it anyway; measured over 100 draconic runs, the arm
  // whose strategy listed action 16 first ended at library depth 2.51 against
  // its paired control's 13.64, having invited nobody.
  it('offers nobody while no living mage holds portal magic', () => {
    const lists = buildCandidates({
      state: firstUniverse().state,
      catalogue: FIXTURE_CATALOGUE,
      invitableSpecies: [1, 2, 3, 4, 5, 6],
      // The gate: no node here carries the primitive.
      portalNodes: [],
    });
    expect(lists.get(GOD_ACTION.inviteScholar)).toEqual([]);
  });

  it('offers nobody when the roster is empty even if the gate is open', () => {
    const lists = buildCandidates({
      state: firstUniverse().state,
      catalogue: FIXTURE_CATALOGUE,
      invitableSpecies: [],
      portalNodes: [1],
    });
    expect(lists.get(GOD_ACTION.inviteScholar)).toEqual([]);
  });

  it('offers exactly the species no living mage belongs to, once the gate opens', () => {
    // The fixture's living mages are species 1, 1 and 3 — the species-3 raider
    // is dead and must not count, since a universe whose last dwarf died is
    // exactly a universe that may ask for another.
    const lists = buildCandidates({
      state: firstUniverse().state,
      catalogue: FIXTURE_CATALOGUE,
      invitableSpecies: [1, 2, 3, 4, 5, 6],
      // Mage 0 holds node 1 in mind; the fixture permits its cell.
      portalNodes: [1],
    });
    expect(lists.get(GOD_ACTION.inviteScholar)?.map((one) => one.params[0])).toEqual([2, 4, 5, 6]);
  });
});
