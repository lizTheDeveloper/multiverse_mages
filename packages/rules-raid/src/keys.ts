/*
 * Multiverse Mages — the stable identity a combatant's random draws key on.
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
 * `contracts.md` §6: draws key on `(rootSeed, stream, tick, actorKey,
 * drawOrdinal)` where `actorKey` is **stable identity, never array index**, and
 * the property that buys is **insertion invariance** — adding a combatant, or
 * adding a draw, disturbs nobody else's rolls.
 *
 * ## Why the key is `(side, spawnOrdinal)` and not the entity handle
 *
 * A handle is stable identity and would satisfy §6 on its own. It is not used
 * here for a different reason: a raid is specified as a reproducible function of
 * two snapshots and a seed, and entity handles are allocated by the engagement
 * store in the order things happen to be created. That is deterministic within
 * one process, and it couples a combatant's dice to the *allocation history* of
 * the store — including slot reuse, whose generation counter is part of the
 * handle. Two implementations of the same rules that create combatants in a
 * different order would produce different rolls while agreeing about everything
 * this document specifies, which is exactly the class of divergence
 * `pvp-server` cannot debug.
 *
 * `spawnOrdinal` is assigned at deployment, counts up per side, and is **never
 * reused within a raid** — a summon that dies does not free its ordinal. So the
 * key is a property of *when a combatant joined its side*, which is a fact about
 * the battle rather than about the machine running it.
 *
 * ## The ordering the whole engine walks in
 *
 * Every phase that must be walked in a defined order walks in ascending key.
 * `contracts.md` §1.6's tie-breaks — targeting, contention for the last summon
 * slot — are ties on this key too. Defenders sort after attackers, which is an
 * arbitrary but fixed choice: what matters is that it is the same on both
 * machines and does not move when a combatant is added.
 */

import { RAID_SIDE } from '@mm/state';
import type { RaidSideValue } from '@mm/state';

/** Ordinals per side, and therefore the width of the side field in a packed key. */
const SPAWN_ORDINAL_LIMIT = 0x10000;

/**
 * A combatant's stable identity within one raid: which side, and how many
 * combatants that side had before it.
 */
export interface CombatantKey {
  readonly side: RaidSideValue;
  /** Assigned at deployment, ascending per side, never reused within a raid. */
  readonly spawnOrdinal: number;
}

/**
 * The key as one unsigned 32-bit word, which is what
 * `RngSource.actorStream(...)` takes.
 *
 * @throws RangeError if the ordinal would collide with the next side's space.
 * The per-side cap is far below this, so reaching it means the cap has been
 * bypassed — and a silently wrapped key is two combatants sharing dice, which
 * no test in this project would notice.
 */
export function packCombatantKey(key: CombatantKey): number {
  if (!Number.isInteger(key.spawnOrdinal) || key.spawnOrdinal < 0) {
    throw new RangeError(`spawnOrdinal must be a non-negative integer, got ${String(key.spawnOrdinal)}`);
  }
  if (key.spawnOrdinal >= SPAWN_ORDINAL_LIMIT) {
    throw new RangeError(
      `spawnOrdinal ${String(key.spawnOrdinal)} is at or beyond the ${String(SPAWN_ORDINAL_LIMIT)} ` +
        'a side may hold. The per-side cap is orders of magnitude below this, so reaching it ' +
        'means the cap was bypassed — and a wrapped key is two combatants drawing one stream.',
    );
  }
  return (key.side * SPAWN_ORDINAL_LIMIT + key.spawnOrdinal) >>> 0;
}

/** The total order every phase walks in: attackers first, then by spawn ordinal. */
export function compareCombatantKeys(a: CombatantKey, b: CombatantKey): number {
  if (a.side !== b.side) return a.side - b.side;
  return a.spawnOrdinal - b.spawnOrdinal;
}

/** The side a combatant is *not* on. */
export function opposingSide(side: RaidSideValue): RaidSideValue {
  return side === RAID_SIDE.attacker ? RAID_SIDE.defender : RAID_SIDE.attacker;
}
