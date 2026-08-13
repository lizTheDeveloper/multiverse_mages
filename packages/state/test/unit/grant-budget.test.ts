/*
 * Multiverse Mages — the founding-grant budget's arithmetic, and its absence.
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
 * `foundingGrantsRemaining` is the one implementation of "may this god seed
 * another node", read by both the legality mask and the rules. Everything it
 * could get wrong is arithmetic over five integers, so everything it could get
 * wrong is checkable here rather than through a universe.
 *
 * The case that matters most is the **absent row**, because it is what every
 * pre-`w69` save and every hand-built test world carries, and reading it as a
 * budget of zero rather than as no budget would silently switch founding grants
 * off for all of them.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import {
  EVER_KNOWN,
  GRANT_BUDGET,
  attachRecord,
  canGrantFoundingKnowledge,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
  findUniverse,
  foundingGrantsRemaining,
  readGrantBudget,
  selfDiscoveredNodes,
} from '@mm/state';

const SCHEMA = defineWorldStateSchema();

interface Budget {
  readonly startingGrants?: number;
  readonly accrualNodes?: number;
  readonly cap?: number;
  readonly grantsUsed?: number;
  readonly seededNodes?: number;
}

/** A universe, optionally with a budget row and some nodes it has ever known. */
function world(input: { budget?: Budget; everKnown?: number } = {}): {
  state: SimState;
  universe: EntityHandle;
} {
  const state = createState({ rootSeed: 1, schema: SCHEMA, contentRevision: '0'.repeat(32) });
  createUniverse(state, {
    permittedTechniques: 0b11111,
    permittedForms: 0b11111111111111,
    edictBudget: 4,
    traditionId: 1,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    materials: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });
  const universe = findUniverse(state);

  for (let index = 0; index < (input.everKnown ?? 0); index += 1) {
    attachRecord(state, EVER_KNOWN, state.entities.create(), { nodeId: index + 1 });
  }
  if (input.budget !== undefined) {
    attachRecord(state, GRANT_BUDGET, universe, {
      startingGrants: input.budget.startingGrants ?? 0,
      accrualNodes: input.budget.accrualNodes ?? 0,
      cap: input.budget.cap ?? 65_535,
      grantsUsed: input.budget.grantsUsed ?? 0,
      seededNodes: input.budget.seededNodes ?? 0,
    });
  }
  return { state, universe };
}

describe('a universe carrying no budget row is unbounded', () => {
  it('reports infinity rather than a large number', () => {
    // Infinity rather than a generous integer, so that "no budget in force" is
    // impossible to mistake for "a budget that happens not to bind" — and so
    // that no accrual below can overflow the answer back into a limit.
    const { state, universe } = world();
    expect(readGrantBudget(state, universe)).toBeUndefined();
    expect(foundingGrantsRemaining(state, universe)).toBe(Number.POSITIVE_INFINITY);
    expect(canGrantFoundingKnowledge(state, universe)).toBe(true);
  });

  it('stays unbounded no matter how much the universe has discovered', () => {
    const { state, universe } = world({ everKnown: 250 });
    expect(foundingGrantsRemaining(state, universe)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the allowance, before anything has been discovered', () => {
  it('is exactly the starting grants', () => {
    const { state, universe } = world({ budget: { startingGrants: 2, accrualNodes: 8 } });
    expect(foundingGrantsRemaining(state, universe)).toBe(2);
  });

  it('runs out, and running out is a refusal rather than a debt', () => {
    const { state, universe } = world({
      budget: { startingGrants: 2, accrualNodes: 8, grantsUsed: 2 },
    });
    expect(foundingGrantsRemaining(state, universe)).toBe(0);
    expect(canGrantFoundingKnowledge(state, universe)).toBe(false);
  });

  it('floors at zero when a retune lowers a cap under what was already spent', () => {
    // A save whose cap moved down mid-run should refuse further grants, not
    // report a negative allowance that some later `+ earned` could pay off.
    const { state, universe } = world({
      budget: { startingGrants: 1, cap: 1, grantsUsed: 5 },
    });
    expect(foundingGrantsRemaining(state, universe)).toBe(0);
  });

  it('a starting allowance of zero is the pure-discovery control', () => {
    const { state, universe } = world({ budget: { startingGrants: 0, accrualNodes: 8 } });
    expect(canGrantFoundingKnowledge(state, universe)).toBe(false);
  });
});

describe('the accrual counts what the mages found for themselves', () => {
  it('subtracts the nodes a god seeded from the ever-known count', () => {
    const { state, universe } = world({
      everKnown: 10,
      budget: { startingGrants: 0, accrualNodes: 4, seededNodes: 6 },
    });
    // Ten ever-known, six of them put there by a god: four discovered, which is
    // exactly one accrual step.
    expect(selfDiscoveredNodes(state, universe)).toBe(4);
    expect(foundingGrantsRemaining(state, universe)).toBe(1);
  });

  it('does not let a god earn its own next grant', () => {
    // The loop the `seededNodes` field exists to break. Every ever-known node
    // was seeded, so nothing was discovered and nothing accrues, however many
    // there are.
    const { state, universe } = world({
      everKnown: 40,
      budget: { startingGrants: 0, accrualNodes: 1, seededNodes: 40 },
    });
    expect(selfDiscoveredNodes(state, universe)).toBe(0);
    expect(foundingGrantsRemaining(state, universe)).toBe(0);
  });

  it('floors the ratio rather than rounding it', () => {
    const { state, universe } = world({
      everKnown: 7,
      budget: { startingGrants: 0, accrualNodes: 4 },
    });
    // Seven discovered against four per grant is one grant, not two: a partial
    // step is not a grant, and rounding up would hand out an allowance the
    // universe has not finished earning.
    expect(foundingGrantsRemaining(state, universe)).toBe(1);
  });

  it('treats an accrual period of zero as no accrual, not as a division by zero', () => {
    const { state, universe } = world({
      everKnown: 100,
      budget: { startingGrants: 3, accrualNodes: 0 },
    });
    expect(Number.isFinite(foundingGrantsRemaining(state, universe))).toBe(true);
    expect(foundingGrantsRemaining(state, universe)).toBe(3);
  });

  it('never reports a negative discovery count', () => {
    const { state, universe } = world({
      everKnown: 2,
      budget: { startingGrants: 0, accrualNodes: 1, seededNodes: 9 },
    });
    expect(selfDiscoveredNodes(state, universe)).toBe(0);
  });
});

describe('the cap bounds what may be granted, never what is held', () => {
  it('stops the allowance growing past it', () => {
    const { state, universe } = world({
      everKnown: 200,
      budget: { startingGrants: 2, accrualNodes: 1, cap: 5 },
    });
    expect(foundingGrantsRemaining(state, universe)).toBe(5);
  });

  it('does not refund a god that has already spent to the cap', () => {
    // The distinction the docstring makes, asserted: a frugal god keeps earning
    // (above) and a spent one is not handed anything back (here).
    const { state, universe } = world({
      everKnown: 200,
      budget: { startingGrants: 2, accrualNodes: 1, cap: 5, grantsUsed: 5 },
    });
    expect(foundingGrantsRemaining(state, universe)).toBe(0);
  });

  it('a cap below the starting allowance binds immediately', () => {
    const { state, universe } = world({ budget: { startingGrants: 9, cap: 2 } });
    expect(foundingGrantsRemaining(state, universe)).toBe(2);
  });
});

describe('the row is a singleton on the universe handle', () => {
  it('hangs where the god-state row hangs, so there is one budget per universe', () => {
    const { state, universe } = world({ budget: { startingGrants: 2 } });
    expect(componentOf(state, GRANT_BUDGET).size).toBe(1);
    expect(componentOf(state, GRANT_BUDGET).has(universe)).toBe(true);
  });
});
