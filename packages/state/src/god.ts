/*
 * Multiverse Mages — reading the god's own state: its counters, its blessings,
 * its shocks, and its per-axis hysteresis.
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
 * Accessors, not rules.
 *
 * `contracts.md` §5 keeps rules out of this package: what lives here is shapes,
 * plus the small number of things §1 insists must exist exactly once. These
 * readers are here for the second reason. Two packages ask the same questions —
 * `agent-api` builds the legality mask and `coordination` resolves the action —
 * and they may not import each other: rules packages never import `agent-api`
 * (§5 rule 4), and `agent-api` must stay free of `@mm/content` so it can run in
 * a browser, which rules out importing `coordination` in the other direction.
 *
 * So "which blessings are still in force at tick *t*" is answered once, here,
 * where both can reach it. The *decisions* those answers feed — whether the
 * concurrency cap is reached, what the action costs — stay with the layer that
 * owns them.
 *
 * ## The god-state row hangs on the universe's own handle
 *
 * There is one universe per simulation instance (§1.1), so there is exactly one
 * sensible place to put a singleton beside it. That removes the second
 * uniqueness rule a separate entity would have needed, and it means
 * {@link readGodState} is a `has` check rather than a scan.
 *
 * The row is created lazily by the god systems on their first tick, so
 * {@link readGodState} returns `undefined` for a world that has never been
 * stepped — a migrated pre-`god-agency` save, or any of the hand-built test
 * worlds. Absence means "not stepped yet", and every reader below treats it as
 * the zero it is rather than throwing.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';

import { BLESSING, ENCOURAGED_CELL, GOD_STATE, UPHEAVAL, AXIS_CHANGE_COUNTER } from './components.js';
import type { GodStateRecord } from './components.js';
import { collectRecords, readRecord } from './records.js';

/** A god-state row with every counter at zero: what a universe starts from. */
export const EMPTY_GOD_STATE: GodStateRecord = Object.freeze({
  favorWasted: 0,
  magelessTicks: 0,
  lowWorshipTicks: 0,
  stasisTicks: 0,
  lastEverKnown: 0,
  lastExisting: 0,
  ascensionFirstMetTick: 0,
  ascensionPath: 0,
  peakWorshipTier: 0,
  deepestTier: 0,
  lastEraRecorded: 0,
  eraNodesLost: 0,
  goodEraRun: 0,
  overBudgetEdicts: 0,
  terminalTick: 0,
});

/** The god-state row, or `undefined` for a universe that has never been stepped. */
export function readGodState(
  state: SimState,
  universe: EntityHandle,
): GodStateRecord | undefined {
  const store = state.component(GOD_STATE.name);
  if (!store.has(universe)) return undefined;
  return readRecord(state, GOD_STATE, universe);
}

/** The god-state row, or a zeroed one. For readers that do not care which. */
export function godStateOrEmpty(state: SimState, universe: EntityHandle): GodStateRecord {
  return readGodState(state, universe) ?? EMPTY_GOD_STATE;
}

/** One blessing in force, with the handle its row hangs on — the blessed mage. */
export interface ActiveBlessing {
  readonly mage: EntityHandle;
  readonly expiryTick: number;
}

/**
 * Blessings still in force at a tick, ascending by mage handle.
 *
 * Expiry is `>`, not `>=`: a blessing written at tick `t` with a duration of
 * `d` expires *at* `t + d`, so the tick it names is the first one it does not
 * cover. Stating the boundary because "lasts 120 ticks" is exactly the sentence
 * two implementers read as 120 and as 121.
 */
export function activeBlessings(state: SimState, worldTick: number): ActiveBlessing[] {
  return collectRecords(state, BLESSING)
    .filter(({ row }) => row.expiryTick > worldTick)
    .map(({ handle, row }) => ({ mage: handle, expiryTick: row.expiryTick }))
    .sort((a, b) => a.mage - b.mage);
}

/** Whether one mage is blessed at a tick. */
export function isBlessed(state: SimState, mage: EntityHandle, worldTick: number): boolean {
  const store = state.component(BLESSING.name);
  if (!store.has(mage)) return false;
  return readRecord(state, BLESSING, mage).expiryTick > worldTick;
}

/** One research emphasis still in force. */
export interface ActiveEncouragement {
  readonly handle: EntityHandle;
  readonly cellId: number;
  readonly expiryTick: number;
}

/** Research emphases still in force at a tick, ascending by cell id. */
export function activeEncouragements(state: SimState, worldTick: number): ActiveEncouragement[] {
  return collectRecords(state, ENCOURAGED_CELL)
    .filter(({ row }) => row.expiryTick > worldTick)
    .map(({ handle, row }) => ({ handle, cellId: row.cellId, expiryTick: row.expiryTick }))
    .sort((a, b) => (a.cellId !== b.cellId ? a.cellId - b.cellId : a.handle - b.handle));
}

/** One worship shock still in force. */
export interface ActiveUpheaval {
  readonly handle: EntityHandle;
  readonly factor: number;
  readonly expiryTick: number;
}

/**
 * Worship shocks still in force at a tick, in ascending handle order.
 *
 * Handle order, not strength order: the shocks combine multiplicatively and the
 * arithmetic is commutative, but two peers folding them in different orders
 * would floor at different intermediate values and disagree by a unit. Slot
 * order is the one order two peers that reached the same state by different
 * routes agree on, which is the argument `readEdicts` already makes.
 */
export function activeUpheavals(state: SimState, worldTick: number): ActiveUpheaval[] {
  return collectRecords(state, UPHEAVAL)
    .filter(({ row }) => row.expiryTick > worldTick)
    .map(({ handle, row }) => ({ handle, factor: row.factor, expiryTick: row.expiryTick }))
    .sort((a, b) => a.handle - b.handle);
}

/**
 * How many times an axis has been flipped inside the decay window.
 *
 * `0` for an axis nothing has ever touched, which is the whole reason the
 * counters are sparse entities rather than nineteen fields: a run that never
 * changes its ruleset carries no rows at all.
 */
export function axisChangeCount(state: SimState, axisKind: number, axisBit: number): number {
  for (const { row } of collectRecords(state, AXIS_CHANGE_COUNTER)) {
    if (row.axisKind === axisKind && row.axisBit === axisBit) return row.changeCount;
  }
  return 0;
}
