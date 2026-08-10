/*
 * Multiverse Mages — the legality mask, and the frozen-policy rule it enforces.
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
 * Task 4.4, and the `observation-action-space` scenarios *"ruleset actions
 * unavailable mid-raid"* and *"ruleset actions available at world scale"*.
 *
 * The engagement assertion is written over **every** action rather than over
 * 1–7 and 13, because §4.2 says so in terms:
 *
 * > This covers the ruleset actions 1–7 and 13, and equally 8–12, 14, and 15:
 * > blessing a defender mid-raid, or declaring ascension to escape a losing
 * > one, violates frozen policy exactly as squarely as forbidding a technique
 * > does. Silence in an earlier draft of this table was not permission.
 *
 * A test that checked only the eight named ids would pass against a mask that
 * let an agent bless a defender mid-raid — which is the exact defect the
 * sentence was added to close.
 */

import type { SimState } from '@mm/sim-core';
import { EDICT, EDICT_KIND, TERMINAL_REASON, UNIVERSE, attachRecord, cellIdAt } from '@mm/state';
import {
  ACTION_SPACE_SIZE,
  ALL_GOD_ACTIONS,
  GOD_ACTION,
  RULESET_ACTIONS,
  buildCandidates,
  isLegal,
  legalityMask,
  observe,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, engageWorld, firstUniverse, secondUniverse } from './fixtures.js';

function maskOf(world: { state: SimState }): Uint8Array {
  const candidates = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  return legalityMask({ state: world.state, candidates });
}

describe('the mask accompanies every observation', () => {
  it('is exactly the width of the action space', () => {
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(view.mask.length).toBe(ACTION_SPACE_SIZE);
  });
});

describe('task 4.4 — every action except no-op is masked during engagement', () => {
  it('leaves only action 0 legal, for all sixteen ids, not just 1–7 and 13', () => {
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world);

    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of ALL_GOD_ACTIONS) {
      if (action === GOD_ACTION.noop) continue;
      expect(isLegal(mask, action), `action ${action} must be masked mid-raid`).toBe(false);
    }
  });

  it('masks the parameterized actions too, which an earlier draft left silent', () => {
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world);
    // Named individually so a regression names itself: blessing a defender,
    // funding a university, opening a second portal, escaping by ascending.
    expect(isLegal(mask, GOD_ACTION.blessMage)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.assignRole)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.fundUniversity)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.encourageResearch)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.openPortal)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.declareAscension)).toBe(false);
  });
});

describe('at world scale the mask reflects ordinary validity, not a blanket refusal', () => {
  it('permits the ruleset actions when there is something to change', () => {
    const world = firstUniverse();
    const mask = maskOf(world);
    // 0b00111 of 5 techniques and 0b111111 of 14 forms: both directions open.
    expect(isLegal(mask, GOD_ACTION.permitTechnique)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.forbidTechnique)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.permitForm)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.forbidForm)).toBe(true);
    // One edict against a budget of four.
    expect(isLegal(mask, GOD_ACTION.issueDispensation)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.issueInterdiction)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.revokeEdict)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.changeTradition)).toBe(true);
  });

  it('is not unconditionally true either — a saturated axis closes its action', () => {
    const world = secondUniverse();
    // Every technique and every form permitted: nothing left to permit.
    attachRecord(world.state, UNIVERSE, world.universe, { ...FULL_RULESET });
    const mask = maskOf(world);
    expect(isLegal(mask, GOD_ACTION.permitTechnique)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.permitForm)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.forbidTechnique)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.forbidForm)).toBe(true);
  });

  it('closes revokeEdict when there are no edicts, and issuing when the budget is spent', () => {
    const world = secondUniverse();
    expect(isLegal(maskOf(world), GOD_ACTION.revokeEdict)).toBe(false);

    // §1.1 caps issuing at `length < edictBudget`, via the one implementation.
    const budget = firstUniverse();
    for (let i = 0; i < 3; i += 1) {
      const edict = budget.state.entities.create();
      attachRecord(budget.state, EDICT, edict, {
        cellId: cellIdAt(0, i),
        kind: EDICT_KIND.dispensation,
      });
    }
    const mask = maskOf(budget);
    expect(isLegal(mask, GOD_ACTION.issueDispensation)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.revokeEdict)).toBe(true);
  });

  it('closes declareAscension once the run has already ended', () => {
    const world = firstUniverse();
    expect(isLegal(maskOf(world), GOD_ACTION.declareAscension)).toBe(true);

    attachRecord(world.state, UNIVERSE, world.universe, {
      ...SETTLED_RULESET,
      terminalReason: TERMINAL_REASON.stagnation,
    });
    expect(isLegal(maskOf(world), GOD_ACTION.declareAscension)).toBe(false);
  });

  it('leaves only no-op legal for a world with no universe yet', () => {
    const world = secondUniverse();
    world.state.entities.destroy(world.universe);
    const mask = maskOf(world);
    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of RULESET_ACTIONS) {
      expect(isLegal(mask, action)).toBe(false);
    }
  });
});

/** Every technique and form permitted — the saturated-axis case. */
const FULL_RULESET = {
  permittedTechniques: 0b11111,
  permittedForms: 0b11111111111111,
  edictBudget: 8,
  traditionId: 3,
  favor: 0,
  worship: 0,
  worshipTier: 0,
  materials: 0,
  prestige: 0,
  prestigeEarned: 0,
  terminalReason: 0,
  favorCap: 0,
  ascended: 0,
} as const;

/** The first fixture universe's row, for tests that rewrite one field of it. */
const SETTLED_RULESET = {
  permittedTechniques: 0b00111,
  permittedForms: 0b00000000111111,
  edictBudget: 4,
  traditionId: 2,
  favor: 40 * 1024,
  worship: 12 * 1024,
  worshipTier: 3,
  materials: 500 * 1024,
  prestige: 2 * 1024,
  prestigeEarned: 0,
  terminalReason: 0,
  favorCap: 100 * 1024,
  ascended: 0,
} as const;
