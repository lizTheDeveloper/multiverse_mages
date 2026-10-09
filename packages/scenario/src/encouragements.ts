/*
 * Multiverse Mages — which cells the god is encouraging right now.
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
 * The live encouragements (action 12), for a page to show the research focus a
 * player has bought and when it lapses — playtest round 3 found an encourage
 * that "showed no effect afterwards". Read-only, through `@mm/state`'s own
 * `activeEncouragements`; nothing here is written or hashed.
 */

import type { SimState } from '@mm/sim-core';
import { activeEncouragements, findUniverse, readUniverse, TERMINAL_REASON } from '@mm/state';

/** One live encouragement: the cell, and the world tick it lapses at. */
export interface Encouragement {
  readonly cellId: number;
  readonly expiryTick: number;
}

/** Every live encouragement in `state`, ascending by cell; empty for no or an ended universe. */
export function encouragementsOf(state: SimState): readonly Encouragement[] {
  const universe = findUniverse(state);
  if (universe === 0 || readUniverse(state, universe).terminalReason !== TERMINAL_REASON.none) return [];
  return activeEncouragements(state, state.clock.worldTick).map(({ cellId, expiryTick }) => ({ cellId, expiryTick }));
}
