/*
 * Multiverse Mages — an exhausted grant budget closes action 8's mask entry.
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
 * §4.2 makes the legality mask mandatory, and `illegalActionRate`'s note calls a
 * rejection reason that dominates a run *"a spec-clarity smell"*. An action a
 * bot can submit but which reliably does nothing is exactly that smell: the mask
 * says yes, `god-agency` refuses, and the disagreement lands in the telemetry
 * looking like a confused agent rather than like a resource that ran out.
 *
 * So a spent grant budget must close the entry, and it must close it the way the
 * edict budget does — by emptying the candidate list, which
 * `PARAMETERIZED_ACTIONS` then carries into the mask with no second copy of the
 * rule to drift. That is what these tests pin: not "the mask has a branch for
 * budgets" but "the list is empty and therefore the entry is clear".
 */

import { EVER_KNOWN, GRANT_BUDGET, attachRecord, cellIdAt, componentOf, findUniverse } from '@mm/state';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { GOD_ACTION, buildCandidates, buildCatalogue, isLegal, legalityMask } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_NODES, firstUniverse } from './fixtures.js';

/**
 * The fixture catalogue widened by one ungranted root.
 *
 * `firstUniverse` holds an instance of *both* of its permitted tier-1 nodes —
 * node 1 in a mind and the library, node 3 in the library — and the candidate
 * list now excludes any node of which the universe holds an instance anywhere,
 * because that is the condition `grantPlan` itself applies. Against the
 * unwidened catalogue the list is therefore empty before the budget is ever
 * consulted, and every assertion below would be about the instance rule rather
 * than about the budget.
 *
 * Node 7 is a tier-1 root in a permitted cell that the fixture universe has
 * never held, so the budget is the only thing left that can empty this list.
 * Widened here rather than in `fixtures.ts` for the reason
 * `action-space.test.ts` gives: every other suite reads the fixture's
 * knowledge channels, and a seventh node would move them.
 */
const BUDGET_CATALOGUE = buildCatalogue(
  [...FIXTURE_NODES, { nodeId: 7, cellId: cellIdAt(0, 0), tier: 1 }],
  [1, 2, 3],
);

/** Attaches a budget row to the fixture universe. No call means no budget. */
function withBudget(
  state: SimState,
  universe: EntityHandle,
  budget: { startingGrants: number; grantsUsed?: number; accrualNodes?: number; seededNodes?: number },
): void {
  attachRecord(state, GRANT_BUDGET, universe, {
    startingGrants: budget.startingGrants,
    accrualNodes: budget.accrualNodes ?? 0,
    cap: 65_535,
    grantsUsed: budget.grantsUsed ?? 0,
    seededNodes: budget.seededNodes ?? 0,
  });
}

function maskFor(state: SimState): Uint8Array {
  return legalityMask({
    state,
    candidates: buildCandidates({ state, catalogue: BUDGET_CATALOGUE }),
    catalogue: BUDGET_CATALOGUE,
  });
}

function grantCandidates(state: SimState): number {
  return (
    buildCandidates({ state, catalogue: BUDGET_CATALOGUE }).get(
      GOD_ACTION.grantFoundingKnowledge,
    ) ?? []
  ).length;
}

describe('a universe with no budget row masks action 8 exactly as it always did', () => {
  it('offers candidates and sets the entry', () => {
    const world = firstUniverse();
    expect(componentOf(world.state, GRANT_BUDGET).size).toBe(0);
    expect(grantCandidates(world.state)).toBeGreaterThan(0);
    expect(isLegal(maskFor(world.state), GOD_ACTION.grantFoundingKnowledge)).toBe(true);
  });
});

describe('an exhausted budget empties the list, and the mask follows it down', () => {
  it('clears the entry at an allowance of zero', () => {
    const world = firstUniverse();
    withBudget(world.state, findUniverse(world.state), { startingGrants: 0 });

    expect(grantCandidates(world.state)).toBe(0);
    expect(isLegal(maskFor(world.state), GOD_ACTION.grantFoundingKnowledge)).toBe(false);
  });

  it('clears the entry once the allowance has been spent', () => {
    const world = firstUniverse();
    withBudget(world.state, findUniverse(world.state), { startingGrants: 2, grantsUsed: 2 });

    expect(grantCandidates(world.state)).toBe(0);
    expect(isLegal(maskFor(world.state), GOD_ACTION.grantFoundingKnowledge)).toBe(false);
  });

  it('leaves the entry set while anything is left', () => {
    // The control that stops the two above from passing vacuously — if the
    // budget check were unconditional, every one of these tests would still be
    // green and action 8 would be permanently illegal.
    const world = firstUniverse();
    withBudget(world.state, findUniverse(world.state), { startingGrants: 2, grantsUsed: 1 });

    expect(grantCandidates(world.state)).toBeGreaterThan(0);
    expect(isLegal(maskFor(world.state), GOD_ACTION.grantFoundingKnowledge)).toBe(true);
  });

  it('closes only action 8, and leaves every other verb where it was', () => {
    // A budget on grants is not a budget on blessing, funding or role
    // assignment, and a mask that closed the wrong entry would be a much
    // quieter defect than one that closed none.
    const open = firstUniverse();
    const spent = firstUniverse();
    withBudget(spent.state, findUniverse(spent.state), { startingGrants: 0 });

    const before = maskFor(open.state);
    const after = maskFor(spent.state);
    for (let action = 0; action < before.length; action += 1) {
      if (action === GOD_ACTION.grantFoundingKnowledge) continue;
      expect(after[action], `action ${String(action)} must be unchanged`).toBe(before[action]);
    }
    expect(before[GOD_ACTION.grantFoundingKnowledge]).toBe(1);
    expect(after[GOD_ACTION.grantFoundingKnowledge]).toBe(0);
  });
});

describe('accrual reopens the entry', () => {
  it('sets it again once the universe has discovered enough on its own', () => {
    // Three nodes this universe has ever known, every one of them recorded as
    // seeded by a god — so nothing reads as discovered and no allowance accrues.
    // Then the seeded count drops, and the same three nodes become three
    // discoveries. It is the same row throughout, so nothing but the discovery
    // count differs between the two halves.
    const world = firstUniverse();
    const universe = findUniverse(world.state);
    for (const nodeId of [11, 12, 13]) {
      attachRecord(world.state, EVER_KNOWN, world.state.entities.create(), { nodeId });
    }
    const everKnown = componentOf(world.state, EVER_KNOWN).size;
    withBudget(world.state, universe, {
      startingGrants: 0,
      accrualNodes: 1,
      seededNodes: everKnown,
    });
    expect(isLegal(maskFor(world.state), GOD_ACTION.grantFoundingKnowledge)).toBe(false);

    componentOf(world.state, GRANT_BUDGET).set(universe, 'seededNodes', everKnown - 1);
    expect(isLegal(maskFor(world.state), GOD_ACTION.grantFoundingKnowledge)).toBe(true);
  });
});
