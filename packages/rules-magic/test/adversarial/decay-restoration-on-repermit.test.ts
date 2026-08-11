/*
 * Multiverse Mages — adversarial: decay can raise mastery instead of losing it.
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
 * `packages/rules-magic/src/instances/decay.ts`'s own file header is explicit
 * about what forbidding a cell is supposed to cost, and how the cost can be
 * avoided:
 *
 *   > A dormant instance has no floor and is destroyed at zero. This is the
 *   > whole mechanism by which forbidding a cell actually costs a
 *   > civilization something. An interdiction does not erase knowledge on the
 *   > tick it is issued... it erases it *gradually*, visibly, at a rate that
 *   > differs by species, and **recoverably if the god changes their mind in
 *   > time**.
 *
 * "Recoverably" reads naturally as: stop the erosion before the instance is
 * destroyed, and what survives is whatever mastery happened to survive. It
 * does not read as: the instant the interdiction lifts, the survivor is
 * healed up to the same floor a never-forbidden instance would have settled
 * at — a single "decay" tick that *increases* mastery.
 *
 * `decayedMastery` computes `Math.max(mastery - lost, masteryFloor(retention,
 * dormant))`. The floor clamp assumes `mastery` is never below the floor
 * already — true for an instance that has always been non-dormant, because
 * decay only ever subtracts. It is false the moment dormancy just lifted: a
 * formerly-dormant instance can hold *any* mastery down to 1 (0 destroys it),
 * because a dormant instance's floor is 0. The very next non-dormant sweep
 * then clamps that low value up to the ordinary retention floor in one step —
 * a "decay" call whose output is *higher* than its input.
 *
 * This is reported as a genuine defect (a) on the strength of the module's
 * own explanatory prose above, rather than a spec `MUST` clause: the literal
 * text of `openspec/changes/knowledge-model/specs/knowledge-instances/spec.md`
 * ("A non-dormant instance MUST NOT decay below a floor derived from the
 * supplied retention") bounds decay only from below and does not by itself
 * forbid an upward jump. A reviewer weighing this against (c) should read
 * both this comment and the report before deciding; the arithmetic below is
 * not in dispute either way.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import { decayHeldKnowledge, decayedMastery, masteryFloor } from '../../src/instances/decay.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  testCells,
  testWorld,
} from '../support/scenario.js';

const HOLDER = 500;
const RETENTION = 2048; // masteryDecayPerTick = 4, masteryFloor(false) = 512

function heldInstance(mastery: number): { knowledge: KnowledgeSubsystem; instance: number } {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const instance = knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: HOLDER,
    acquiredTick: 0,
    mastery,
  });
  return { knowledge, instance };
}

describe('decayedMastery on the tick dormancy lifts', () => {
  it('the pure function: one non-dormant tick raises a low, formerly-dormant mastery to the floor', () => {
    // A survivor left at mastery 40 by earlier dormant decay (any value below
    // the non-dormant floor of 512 and above 0 would show the same effect).
    const survivorMastery = 40;
    const floor = masteryFloor(RETENTION, false);
    expect(floor).toBe(512);
    expect(survivorMastery).toBeLessThan(floor);

    const oneNonDormantTickLater = decayedMastery(survivorMastery, 1, RETENTION, false);

    // What a function named `decayedMastery`, described in its own module as
    // eroding knowledge "gradually", should do to a single non-dormant tick:
    // never raise mastery. What it actually does: jumps from 40 to 512 (the
    // floor) in one call — 472 units of "decay" that is actually restoration,
    // more than 118 ordinary decay ticks' worth (masteryDecayPerTick == 4).
    expect(oneNonDormantTickLater).toBeLessThanOrEqual(survivorMastery);
  });

  it('the subsystem sweep: a near-destroyed dormant instance snaps to the floor the instant it is re-permitted', () => {
    // Drive an instance down to just above the destruction threshold while
    // dormant (mastery has no floor there, so it can get arbitrarily close to
    // zero without being destroyed).
    const { knowledge, instance } = heldInstance(1024);
    const lossWhileDormant = decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset: interdicting(HOME_CELL),
      elapsedTicks: 246, // (1024 - 4) / 4 = 255, so 246 ticks leaves mastery at 1024 - 984 = 40
      worldTick: 246,
      retentionOf: () => RETENTION,
    });
    expect(lossWhileDormant).toEqual([]);
    expect(knowledge.read(instance).mastery).toBe(40);

    // The god relents on the very next world tick. Same instance, same
    // retention, now permitted.
    const lossAfterRepermit = decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset: permissiveRuleset(),
      elapsedTicks: 1,
      worldTick: 247,
      retentionOf: () => RETENTION,
    });
    expect(lossAfterRepermit).toEqual([]);

    // Expected: a single decay sweep never raises mastery above what it found.
    // Actual: mastery is restored from 40 all the way to the retention floor
    // (512) in this one tick, because decayedMastery's floor clamp assumes
    // mastery was never below the floor to begin with.
    expect(knowledge.read(instance).mastery).toBeLessThanOrEqual(40);
  });
});
