/*
 * Multiverse Mages — what it costs to unmake a decision you made under fire.
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
 * `raid-engagement.md` §1's second half, at world scale:
 *
 * > After the raid, reverting a mid-raid change costs substantially more favor
 * > than the change did.
 *
 * Four things have to be true and each is separately breakable:
 *
 * - the reverting action is dearer, and by the authored multiple;
 * - an **unrelated** action on the same axis is not;
 * - the mark is discharged by being paid for, so the surcharge is charged once;
 * - a peacetime edict that happens to sit on a marked cell is priced ordinarily.
 *
 * The last is the one a naive implementation gets wrong: it would key the
 * surcharge on the cell rather than on which edict is actually being removed,
 * and start charging four times over for ordinary constitutional work.
 */

import { describe, expect, it } from 'vitest';

import type { Action, EntityHandle, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import {
  EDICT,
  EDICT_KIND,
  MID_RAID_CHANGE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  UNIVERSE,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  readMidRaidMarks,
  revertSurcharge,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import type { InterventionDeps } from '../../src/index.js';
import { ACTION, hysteresisMultiplier, interventionCost, resolveInterventions } from '../../src/index.js';

import { catalogAndCells } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const SCHEMA = defineWorldStateSchema([]);

/** Perdo is the fourth technique, so bit 3 and 1-based axis id 4. */
const PERDO_BIT = 3;
const PERDO_AXIS = PERDO_BIT + 1;

interface Bench {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly deps: InterventionDeps;
}

function bench(): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000 });
  const { catalog, cells } = catalogAndCells();
  const deps: InterventionDeps = {
    god: { constants: C, costs: COSTS },
    catalog,
    cells,
    knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
    edictBudgetMax: 8,
    portalNodes: new Set(nodesCarrying('portal').keys()),
    requestEngagement: () => {},
  };
  return { state: world.state, universe: world.universe, deps };
}

function resolve(b: Bench, actions: readonly Action[]): void {
  resolveInterventions(b.state, actions, 0, TIME_MODE.world, b.deps);
}

function favorOf(b: Bench): number {
  return componentOf(b.state, UNIVERSE).get(b.universe, 'favor');
}

/** What a raid resolving would have written: the technique is now forbidden. */
function markForbiddenTechnique(b: Bench, paidCost: number): void {
  const store = componentOf(b.state, UNIVERSE);
  const mask = store.get(b.universe, 'permittedTechniques');
  store.set(b.universe, 'permittedTechniques', mask & ~(1 << PERDO_BIT));

  const handle = b.state.entities.create();
  attachRecord(b.state, MID_RAID_CHANGE, handle, {
    scope: RULE_SCOPE.technique,
    targetId: PERDO_BIT,
    changeKind: RULE_CHANGE_KIND.forbid,
    paidCost,
    markedTick: 3,
  });
}

describe('unmaking an axis change a raid made', () => {
  it('costs the authored multiple of what the change cost', () => {
    const b = bench();
    const paid = 12_288;
    markForbiddenTechnique(b, paid);

    const before = favorOf(b);
    resolve(b, [{ kind: ACTION.permitTechnique, params: [PERDO_AXIS] }]);
    const spent = before - favorOf(b);

    const ordinary = interventionCost(ACTION.permitTechnique, COSTS, {
      hysteresis: hysteresisMultiplier(0, C),
    });
    expect(spent).toBe(revertSurcharge(ordinary, paid, C.midRaidRevertMultiplier));
    // The claim in the design is "substantially more", and this is what that
    // reads as at the authored multiplier.
    expect(spent).toBeGreaterThan(ordinary * 3);
  });

  it('leaves an unmarked axis at the ordinary price', () => {
    const b = bench();
    markForbiddenTechnique(b, 12_288);

    const before = favorOf(b);
    // Forbid a *different* technique. Same action family, no mark.
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }]);
    const spent = before - favorOf(b);

    expect(spent).toBe(
      interventionCost(ACTION.forbidTechnique, COSTS, { hysteresis: hysteresisMultiplier(0, C) }),
    );
  });

  it('discharges the mark, so the surcharge is paid exactly once', () => {
    const b = bench();
    markForbiddenTechnique(b, 12_288);
    expect(readMidRaidMarks(b.state)).toHaveLength(1);

    resolve(b, [{ kind: ACTION.permitTechnique, params: [PERDO_AXIS] }]);
    expect(readMidRaidMarks(b.state)).toHaveLength(0);

    // Forbid it again, ordinarily. The hysteresis counter has moved, so the
    // comparison is against the hysteresis price rather than the base.
    const before = favorOf(b);
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [PERDO_AXIS] }]);
    const spent = before - favorOf(b);
    expect(spent).toBe(
      interventionCost(ACTION.forbidTechnique, COSTS, { hysteresis: hysteresisMultiplier(1, C) }),
    );
  });

  it('is not charged for a change in the same direction as the mark', () => {
    // A god who forbade perdo under fire and then forbids it again at world
    // scale is doing nothing: `axisPlan` refuses the no-op before pricing. The
    // assertion is that the refusal happens and no favor moves, because a
    // surcharge on a no-op would be the worst of both.
    const b = bench();
    markForbiddenTechnique(b, 12_288);
    const before = favorOf(b);
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [PERDO_AXIS] }]);
    expect(favorOf(b)).toBe(before);
  });
});

describe('unmaking a cell change a raid made', () => {
  /** The cell a raid interdicted, and the mark that says a raid did it. */
  function markInterdictedCell(b: Bench, cellId: number, paidCost: number): void {
    const edict = b.state.entities.create();
    attachRecord(b.state, EDICT, edict, { cellId, kind: EDICT_KIND.interdiction });
    const handle = b.state.entities.create();
    attachRecord(b.state, MID_RAID_CHANGE, handle, {
      scope: RULE_SCOPE.cell,
      targetId: cellId,
      changeKind: RULE_CHANGE_KIND.forbid,
      paidCost,
      markedTick: 3,
    });
  }

  it('charges the surcharge on the revoke, which is the only way back', () => {
    const b = bench();
    const cellId = 5;
    markInterdictedCell(b, cellId, 6144);

    const before = favorOf(b);
    resolve(b, [{ kind: ACTION.revokeEdict, params: [0] }]);
    const spent = before - favorOf(b);

    const ordinary = interventionCost(ACTION.revokeEdict, COSTS);
    expect(spent).toBe(revertSurcharge(ordinary, 6144, C.midRaidRevertMultiplier));
    expect(collectRecords(b.state, EDICT)).toHaveLength(0);
    expect(readMidRaidMarks(b.state)).toHaveLength(0);
  });

  it('prices a peacetime edict on a marked cell ordinarily', () => {
    // The mark says a raid made this cell *permitted*; the standing edict is an
    // interdiction issued afterwards in peacetime. Revoking it walks back the
    // peacetime decision, not the raid's, so it is priced as ordinary work.
    const b = bench();
    const cellId = 5;
    const edict = b.state.entities.create();
    attachRecord(b.state, EDICT, edict, { cellId, kind: EDICT_KIND.interdiction });
    const handle = b.state.entities.create();
    attachRecord(b.state, MID_RAID_CHANGE, handle, {
      scope: RULE_SCOPE.cell,
      targetId: cellId,
      changeKind: RULE_CHANGE_KIND.permit,
      paidCost: 99_999,
      markedTick: 3,
    });

    const before = favorOf(b);
    resolve(b, [{ kind: ACTION.revokeEdict, params: [0] }]);

    expect(before - favorOf(b)).toBe(interventionCost(ACTION.revokeEdict, COSTS));
    expect(readMidRaidMarks(b.state)).toHaveLength(1);
  });
});

describe('the surcharge arithmetic itself', () => {
  it('takes the larger of the ordinary price and what was paid', () => {
    expect(revertSurcharge(1000, 100, 1024)).toBe(1000);
    expect(revertSurcharge(100, 1000, 1024)).toBe(1000);
  });

  it('scales by the multiplier', () => {
    expect(revertSurcharge(1000, 0, 4096)).toBe(4000);
  });

  it('never turns a negative paid cost into a discount', () => {
    expect(revertSurcharge(1000, -5000, 1024)).toBe(1000);
  });

  it('reads its multiplier from content rather than a literal', () => {
    // fp(4). Asserted against the shipped value so that a retune has to move
    // this test too, which is what "content, not a literal" is worth.
    expect(C.midRaidRevertMultiplier).toBe(4096);
  });
});
