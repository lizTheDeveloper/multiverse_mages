/*
 * Multiverse Mages — reading and writing the god-state singleton.
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
 * `@mm/state` reads the row; this writes it.
 *
 * The split is `contracts.md` §5's: `state` holds shapes and the arbitration
 * functions §1 insists exist once, and rules live in a `rules-*` package or in
 * this coordinating layer. So the accessors that both `agent-api` and this
 * package need are over there, and the one place that *creates* and *updates*
 * the row is here — which is what makes "the god-state row is written by the god
 * systems and by nothing else" a property somebody could check rather than a
 * convention.
 *
 * ## Read-modify-write of a whole record, not field-by-field
 *
 * A tick's outcome phase touches eight of the fifteen fields, and each write
 * would otherwise be a `store.set(universe, 'someName', value)` whose field
 * name is a string. `GodStateRecord` is a typed object, so
 * `{ ...god, stasisTicks: 0 }` is checked by the compiler and a typo is a
 * compile error rather than a counter that silently never moves — which is the
 * exact failure the sparse `axis-change-counter` layout was chosen to avoid, in
 * a different place.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import type { GodStateRecord } from '@mm/state';
import { EMPTY_GOD_STATE, GOD_STATE, attachRecord, componentOf, readGodState } from '@mm/state';

/**
 * The god-state row, creating a zeroed one if this universe has none yet.
 *
 * Lazy creation rather than construction alongside the universe, so that every
 * world built before this component existed — a migrated save, the reference
 * scenario, every hand-built test world — keeps working untouched. The row
 * appears on the first god tick and never disappears.
 */
export function godState(state: SimState, universe: EntityHandle): GodStateRecord {
  const existing = readGodState(state, universe);
  if (existing !== undefined) return existing;
  attachRecord(state, GOD_STATE, universe, { ...EMPTY_GOD_STATE });
  return { ...EMPTY_GOD_STATE };
}

/** Writes every field of the row, creating it if absent. */
export function writeGodState(
  state: SimState,
  universe: EntityHandle,
  record: GodStateRecord,
): void {
  const store = componentOf(state, GOD_STATE);
  if (!store.has(universe)) {
    attachRecord(state, GOD_STATE, universe, record);
    return;
  }
  for (const [field, value] of Object.entries(record)) {
    store.set(universe, field as keyof GodStateRecord, value);
  }
}
