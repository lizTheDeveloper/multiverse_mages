/*
 * Multiverse Mages — adversarial: edict persistence past budget, and schema permissiveness.
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

import {
  EDICT,
  EDICT_KIND,
  MAGE,
  MAGE_ROLE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSE,
  attachRecord,
  canIssueEdict,
  captureRuleset,
  cellIdAt,
  componentOf,
  readRecord,
} from '@mm/state';

import { populatedWorld } from '../unit/fixtures.js';

describe('established: an edict count that strictly exceeds a since-lowered budget is not trimmed', () => {
  // `universe.test.ts` already proves the boundary case where the edict count
  // exactly *equals* a budget dropped to meet it (1 edict, budget 1). The
  // brief separately asks for the case where the count *exceeds* the lowered
  // budget — three edicts already in force, budget dropped to one — since
  // "stays exactly at the edge" and "stays over the edge" are not the same
  // claim about a "never revokes" rule: a trim-to-fit implementation would
  // pass the equal case and fail only here.
  it('keeps all three edicts when the budget falls to one, below all of them', () => {
    const { state, universe } = populatedWorld();

    // populatedWorld() already attaches one edict; add two more directly,
    // bypassing canIssueEdict — exactly as a capability author would if it
    // authorized edicts before checking a since-changed budget, or as content
    // seeding a scenario does.
    const secondCell = cellIdAt(0, 0);
    const thirdCell = cellIdAt(1, 1);
    const second = state.entities.create();
    attachRecord(state, EDICT, second, { cellId: secondCell, kind: EDICT_KIND.dispensation });
    const third = state.entities.create();
    attachRecord(state, EDICT, third, { cellId: thirdCell, kind: EDICT_KIND.interdiction });

    expect(componentOf(state, EDICT).size).toBe(3);

    componentOf(state, UNIVERSE).set(universe, 'edictBudget', 1);

    // §1.1: "Existing edicts stay in force if the budget later falls —
    // deterministic auto-revocation would silently rewrite a player's ruleset
    // mid-run." Three in force against a budget of one is the sharpest form of
    // that claim available: nothing here is even close to the new limit.
    expect(canIssueEdict(state, universe)).toBe(false);
    expect(captureRuleset(state, universe).edicts).toHaveLength(3);
    expect(componentOf(state, EDICT).size).toBe(3);
  });
});

describe('ambiguity: nothing in the component layer stops an individual entity from also being a cohort', () => {
  // contracts.md §1.3: "No capability may promote populace to individual
  // entities without changing this document first" — and §1.3's own field
  // table gives `PopulaceCohortRecord` an `occupation` and a `count` that
  // `MageRecord` structurally lacks (asserted already in
  // state-schema.test.ts: "gives a cohort no way to be an individual, and a
  // mage no way to be a cohort").
  //
  // That is a promise about *changing this document*, not a runtime
  // invariant, and the entity store attaches components independently of one
  // another: nothing rejects a handle that carries both `MAGE` and
  // `POPULACE_COHORT` rows at once, which is the structural version of "an
  // individual entity with a non-mage occupation" the brief asks after. Not
  // asserted as a defect — contracts.md names a documentation gate, not a
  // guard @mm/state is obliged to enforce, and forcing this red would be
  // exactly the indefensible red test rule 4 warns against. Documented so the
  // gap is visible rather than merely unencountered.
  it('lets one handle carry a mage row and a populace-cohort row (with an occupation) simultaneously', () => {
    const { state } = populatedWorld();

    const chimera = state.entities.create();
    attachRecord(state, MAGE, chimera, {
      speciesId: 1,
      birthTick: 0,
      roleId: MAGE_ROLE.researcher,
      universityId: 0,
      curiosity: 512,
      ambition: 512,
      caution: 512,
      vigor: 1024,
      maxVigor: 1024,
      alive: 1,
    });
    attachRecord(state, POPULACE_COHORT, chimera, {
      speciesId: 1,
      occupation: OCCUPATION.soldier,
      count: 500,
      birthTickBucket: 0,
    });

    // Both rows read back cleanly. This individual mage now also aggregates
    // 500 soldiers under §1.3's own occupation enum — a state no rules-*
    // package should ever construct, and nothing here stopped it.
    expect(readRecord(state, MAGE, chimera).alive).toBe(1);
    expect(readRecord(state, POPULACE_COHORT, chimera).occupation).toBe(OCCUPATION.soldier);
    expect(readRecord(state, POPULACE_COHORT, chimera).count).toBe(500);
  });
});
