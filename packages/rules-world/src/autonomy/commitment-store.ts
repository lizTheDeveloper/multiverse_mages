/*
 * Multiverse Mages — where a goal commitment lives between two ticks.
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
 * ## The question `schedule.ts` used to leave open
 *
 * A {@link MageGoalCommitment} is compared against `worldTick` twice per
 * evaluation — once by the stagger and once by `MIN_COMMITMENT_TICKS` — so it
 * has to survive from one tick to the next. `schedule.ts` recorded that as an
 * open question rather than choosing: `contracts.md` §1.2's mage row had no goal
 * field, and persisting a commitment therefore needed either a new world
 * component or an amendment to that row, and neither should be decided by
 * whoever happened to write the first caller.
 *
 * It is a **component**, `@mm/state`'s `GOAL_COMMITMENT`, attached to the mage's
 * own handle. What that buys, and why the two alternatives lost:
 *
 * - **Against a map beside the state.** A map does not round-trip through a
 *   save. The symptom is not a crash: every mage in a loaded game reads as
 *   `no-incumbent`, so every mage re-evaluates on the tick after a load, and a
 *   run that was saved and resumed diverges from the same run that was not —
 *   which is a desync in `pvp-server` and a silently ruined baseline in the
 *   Monte Carlo harness.
 * - **Against widening §1.2's mage row.** A mage who has never chosen and a
 *   mage who chose `idle` are different states, and `select.ts` reads the
 *   difference (`no-incumbent` versus a held commitment). Fields on the mage row
 *   exist for every mage, so telling those two apart would need a sentinel goal
 *   id — a tenth entry in a registry whose whole contract is that its ids are
 *   permanent and mean one thing each. A component that is simply absent says
 *   the same thing with nothing invented.
 *
 * ## Reads are validated, and that is not defensive programming
 *
 * A `goalId` arrives from a snapshot, which may have been written by a build
 * whose goal registry had entries this one does not. Left unchecked it would
 * flow into `scoreGoal`'s table lookup and come back `undefined`, and the mage
 * would score every goal against a missing base appeal — a universe whose mages
 * quietly stop making sense, months after the save that caused it.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import type { GoalCommitmentRecord } from '@mm/state';
import { GOAL_COMMITMENT, attachRecord, componentOf, readRecord } from '@mm/state';

import type { MageHandle } from '../coordination.js';
import type { GoalId } from './goals.js';
import { GOAL_COUNT, GOAL_NAMES, isGoalId } from './goals.js';
import type { MageGoalCommitment } from './schedule.js';

/** Whether a mage has ever committed to a goal. */
export function hasCommitment(state: SimState, mage: MageHandle): boolean {
  return componentOf(state, GOAL_COMMITMENT).has(mage as EntityHandle);
}

/**
 * A mage's current commitment, or `undefined` if she has never chosen one.
 *
 * `undefined` is the `no-incumbent` case, and it is the *absence of a row*
 * rather than any value in one. See the module note.
 *
 * @throws RangeError if the stored goal id is outside the registry this build
 * declares — which means the save predates or postdates this build's goal set,
 * and there is no honest way to guess which goal was meant.
 */
export function readCommitment(state: SimState, mage: MageHandle): MageGoalCommitment | undefined {
  const store = componentOf(state, GOAL_COMMITMENT);
  const handle = mage as EntityHandle;
  if (!store.has(handle)) return undefined;

  const row: GoalCommitmentRecord = readRecord(state, GOAL_COMMITMENT, handle);
  if (!isGoalId(row.goalId)) {
    throw new RangeError(
      `Mage ${String(mage)} holds a commitment to goal id ${String(row.goalId)}, which this ` +
        `build's registry does not declare — it has ${String(GOAL_COUNT)} goals, ${GOAL_NAMES[0]} ` +
        'through ' +
        `${GOAL_NAMES[(GOAL_COUNT - 1) as GoalId] ?? '?'}. Goal ids are permanent and append-only, ` +
        'so this snapshot was written by a build with a different goal set and no id in it can be ' +
        'trusted to mean what it means here.',
    );
  }

  return {
    goalId: row.goalId,
    targetNodeId: row.targetNodeId,
    adoptedTick: row.adoptedTick,
    score: row.score,
  };
}

/**
 * Records a mage's commitment, creating the row if this is her first.
 *
 * Idempotent in the sense that matters: writing the same commitment twice
 * produces the same four field values, so a caller that re-writes a held
 * commitment does not restart its clock. `select.ts` already guarantees an
 * unchanged `adoptedTick` for a re-adopted goal; this function does not second
 * guess it, because a store that "helpfully" preserved a tick would be a second
 * place the commitment clock is decided.
 */
export function writeCommitment(
  state: SimState,
  mage: MageHandle,
  commitment: MageGoalCommitment,
): void {
  const handle = mage as EntityHandle;
  const record: GoalCommitmentRecord = {
    goalId: commitment.goalId,
    targetNodeId: commitment.targetNodeId,
    adoptedTick: commitment.adoptedTick,
    score: commitment.score,
  };

  const store = componentOf(state, GOAL_COMMITMENT);
  if (store.has(handle)) {
    store.set(handle, 'goalId', record.goalId);
    store.set(handle, 'targetNodeId', record.targetNodeId);
    store.set(handle, 'adoptedTick', record.adoptedTick);
    store.set(handle, 'score', record.score);
    return;
  }
  attachRecord(state, GOAL_COMMITMENT, handle, record);
}

/**
 * Removes a mage's commitment, returning her to `no-incumbent`.
 *
 * The mid-goal death path uses it: task 4.13 requires a dying mage to abandon
 * her goal, and a dead mage's entity may outlive her — a grimoire naming her as
 * its last holder keeps the handle valid — so the row would otherwise sit there
 * describing work nobody is doing. A no-op for a mage who had no row, because
 * "she is not committed to anything" is the state either way.
 */
export function clearCommitment(state: SimState, mage: MageHandle): void {
  const store = componentOf(state, GOAL_COMMITMENT);
  const handle = mage as EntityHandle;
  if (store.has(handle)) store.remove(handle);
}
