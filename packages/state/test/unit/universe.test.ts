/*
 * Multiverse Mages — the universe singleton and the ruleset a raid freezes.
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

import { ERA_TICKS } from '@mm/sim-core';
import {
  EDICT,
  EDICT_BUDGET_MAX,
  EDICT_KIND,
  UNIVERSE,
  attachRecord,
  canIssueEdict,
  captureRuleset,
  cellIdAt,
  componentOf,
  createUniverse,
  currentEra,
  findUniverse,
  permits,
  readUniverse,
} from '@mm/state';

import { populatedWorld } from './fixtures.js';

describe('the universe is a singleton', () => {
  it('is found without a cached handle', () => {
    const { state, universe } = populatedWorld();
    expect(findUniverse(state)).toBe(universe);
  });

  it('refuses to answer when a second universe has been created', () => {
    // §1.1 makes this a singleton per instance. Two of them would make every
    // unqualified "the universe" in the rules layer resolve to whichever came
    // first in slot order — silently, and differently after a destroy.
    const { state } = populatedWorld();
    createUniverse(state, { ...readUniverse(state, findUniverse(state)) });
    expect(() => findUniverse(state)).toThrow(/singleton/);
  });
});

describe('the ruleset a raid captures is frozen at portal open', () => {
  it('carries the axis bitmasks, the edicts, the tradition, and the content revision', () => {
    const { state, universe } = populatedWorld();
    const record = readUniverse(state, universe);

    const snapshot = captureRuleset(state, universe);

    expect(snapshot.permittedTechniques).toBe(record.permittedTechniques);
    expect(snapshot.permittedForms).toBe(record.permittedForms);
    expect(snapshot.traditionId).toBe(record.traditionId);
    expect(snapshot.contentRevision).toBe(state.contentRevision);
    expect(snapshot.edicts).toEqual([{ cellId: cellIdAt(4, 3), kind: EDICT_KIND.interdiction }]);
  });

  it('does not change when the universe changes afterwards', () => {
    // This is what makes the vision's frozen-policy rule structural rather than
    // dependent on the action mask. `rules-raid` may not import `agent-api`
    // (§5), so a raid holding a live reference would have no mechanism at all
    // preventing a mid-raid rule change.
    const { state, universe } = populatedWorld();
    const interdicted = cellIdAt(4, 3);

    const snapshot = captureRuleset(state, universe);
    expect(permits(snapshot, interdicted)).toBe(false);

    // The god lifts the interdiction and forbids every technique, mid-raid.
    componentOf(state, EDICT).forEach((_row, handle) => {
      state.entities.destroy(handle);
    });
    componentOf(state, UNIVERSE).set(universe, 'permittedTechniques', 0);

    expect(captureRuleset(state, universe).permittedTechniques).toBe(0);
    expect(snapshot.permittedTechniques).not.toBe(0);
    expect(permits(snapshot, interdicted)).toBe(false);
  });

  it('is frozen against mutation, not merely copied', () => {
    const { state, universe } = populatedWorld();
    const snapshot = captureRuleset(state, universe);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.edicts)).toBe(true);
  });

  it('refuses to capture a ruleset that says two things at once', () => {
    const { state, universe } = populatedWorld();
    const conflicting = state.entities.create();
    attachRecord(state, EDICT, conflicting, {
      cellId: cellIdAt(4, 3),
      kind: EDICT_KIND.dispensation,
    });

    expect(() => captureRuleset(state, universe)).toThrow(/both an interdiction and a dispensation/);
  });
});

describe('the edict budget gates issuing, and never revokes', () => {
  it('permits another edict while the count is below the budget', () => {
    const { state, universe } = populatedWorld();
    expect(readUniverse(state, universe).edictBudget).toBeGreaterThan(1);
    expect(canIssueEdict(state, universe)).toBe(true);
  });

  it('refuses another edict once the budget is reached, and leaves the existing ones alone', () => {
    const { state, universe } = populatedWorld();
    const store = componentOf(state, UNIVERSE);
    store.set(universe, 'edictBudget', 1);

    expect(canIssueEdict(state, universe)).toBe(false);
    // §1.1: existing edicts stay in force if the budget later falls, because
    // deterministic auto-revocation would silently rewrite a player's ruleset
    // mid-run.
    expect(captureRuleset(state, universe).edicts).toHaveLength(1);
  });

  it('never lets the budget exceed the structural maximum', () => {
    const { state, universe } = populatedWorld();
    componentOf(state, UNIVERSE).set(universe, 'edictBudget', 255);

    // EDICT_BUDGET_MAX is what §4.1 sizes the observation vector's ruleset
    // block from, so a budget above it would be a ruleset the observation
    // cannot represent.
    expect(EDICT_BUDGET_MAX).toBe(8);
    for (let i = 0; i < EDICT_BUDGET_MAX; i += 1) {
      const handle = state.entities.create();
      attachRecord(state, EDICT, handle, { cellId: i + 1, kind: EDICT_KIND.dispensation });
    }
    expect(canIssueEdict(state, universe)).toBe(false);
  });
});

describe('era is derived from the clock, never stored', () => {
  it('has no field on the universe component', () => {
    expect(Object.keys(UNIVERSE.fields)).not.toContain('era');
  });

  it('advances with world time on its own', () => {
    const { state } = populatedWorld();
    expect(currentEra(state)).toBe(0);
    state.clock.worldTick = ERA_TICKS;
    expect(currentEra(state)).toBe(1);
    state.clock.worldTick = ERA_TICKS * 3 + 5;
    expect(currentEra(state)).toBe(3);
  });
});
