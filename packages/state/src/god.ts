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
import { floorDiv } from '@mm/sim-core';

import {
  BLESSING,
  ENCOURAGED_CELL,
  EVER_KNOWN,
  GOD_STATE,
  GRANT_BUDGET,
  UPHEAVAL,
  AXIS_CHANGE_COUNTER,
  componentOf,
} from './components.js';
import type { GodStateRecord, GrantBudgetRecord } from './components.js';
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

// ---------------------------------------------------------------------------
// The founding-grant budget.
// ---------------------------------------------------------------------------

/** The grant-budget row, or `undefined` for a universe carrying no budget. */
export function readGrantBudget(
  state: SimState,
  universe: EntityHandle,
): GrantBudgetRecord | undefined {
  const store = state.component(GRANT_BUDGET.name);
  if (!store.has(universe)) return undefined;
  return readRecord(state, GRANT_BUDGET, universe);
}

/**
 * Nodes this universe found without a god putting them there.
 *
 * Ever-known rather than currently-held, because the budget is a reward for
 * having demonstrated that the universe can grow unaided, and a node discovered
 * and then lost was still discovered. Losing it is the loss model's business and
 * clawing the budget back for it would price discovery on how long the finding
 * survived — which would make the safest research the research nobody does.
 *
 * Floored at zero. `seededNodes` cannot exceed the ever-known count by any route
 * the writers take, but a hand-edited save is not a reason to return a negative
 * budget input.
 */
export function selfDiscoveredNodes(state: SimState, universe: EntityHandle): number {
  const everKnown = componentOf(state, EVER_KNOWN).size;
  const seeded = readGrantBudget(state, universe)?.seededNodes ?? 0;
  return Math.max(0, everKnown - seeded);
}

/**
 * Founding grants this god may still make.
 *
 * `Number.POSITIVE_INFINITY` when the universe carries no budget row, which is
 * every world built before this component existed and every hand-built test
 * world. Infinity rather than a large integer so that the "no budget in force"
 * case is impossible to mistake for a budget that merely happens to be generous,
 * and so that no arithmetic below can overflow it back into a limit.
 *
 * The accrual, in the order the terms are defended:
 *
 * - `earned = floor(selfDiscovered / accrualNodes)` — the universe buys the
 *   right to be seeded again by growing on its own. `accrualNodes` of `0` means
 *   *no accrual*, not a division by zero: a fixed allowance is a legitimate arm
 *   of the experiment and it is the one the sweep needs at its lower end.
 * - `min(start + earned, cap)` — the ceiling is on what may ever be **granted**,
 *   not on what may be **held**, so a god who spends nothing does not stop
 *   earning and a god who spends everything is not refunded.
 * - `- grantsUsed`, floored at zero, because a save whose cap was retuned
 *   downward mid-run should refuse further grants rather than report a debt.
 */
export function foundingGrantsRemaining(state: SimState, universe: EntityHandle): number {
  const row = readGrantBudget(state, universe);
  if (row === undefined) return Number.POSITIVE_INFINITY;
  // `floorDiv` rather than `Math.floor(a / b)`: float division is banned in the
  // rules path, and the ban is not pedantry here — these are counts today and a
  // reader copying the shape into a fixed-point quantity would inherit a defect
  // that only appears at magnitudes no test reaches.
  const earned =
    row.accrualNodes === 0 ? 0 : floorDiv(selfDiscoveredNodes(state, universe), row.accrualNodes);
  const authorized = Math.min(row.startingGrants + earned, row.cap);
  return Math.max(0, authorized - row.grantsUsed);
}

/** Whether a founding grant is still within budget. The mask and the rules both ask. */
export function canGrantFoundingKnowledge(state: SimState, universe: EntityHandle): boolean {
  return foundingGrantsRemaining(state, universe) > 0;
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
