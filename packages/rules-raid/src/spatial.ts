/*
 * Multiverse Mages — a uniform grid index whose traversal order is a fact about
 * the battlefield, not about the insertion history.
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
 * The spatial index a raid queries for "who is near here".
 *
 * ## Uniform grid, and the reason is determinism rather than speed
 *
 * A quadtree or a BVH would be faster on a sparse field. Both are rejected
 * because insertion and update order affect traversal order in a tree, and
 * traversal order feeds targeting: two peers holding the same combatants in the
 * same positions would acquire different targets because one of them summoned
 * something earlier. That is a desync neither side can detect, since both are
 * individually correct.
 *
 * A uniform grid has no such history. A cell holds whoever is in it, and
 * {@link SpatialIndex.within} sorts its results by combatant key before
 * returning them, so the order is a total order over stable identities and
 * nothing else.
 *
 * ## The cell size is the maximum interaction radius, and the loader enforces it
 *
 * `contracts.md`'s promise is that a radius query inspects **at most nine
 * cells**. That holds exactly while every radius fits inside one cell, which is
 * why `raid-constant.json`'s loader rejects any radius above
 * `max-interaction-radius`. The check lives there rather than here because a
 * radius that is too large produces a query that quietly misses combatants at
 * the edge of an effect — a wrong answer, not an error — and the cheapest place
 * to meet it is the load.
 */

import type { Fixed } from '@mm/sim-core';
import { floorDiv } from '@mm/sim-core';

import type { CombatantKey } from './keys.js';
import { compareCombatantKeys } from './keys.js';
import type { Point } from './geometry.js';
import { clamp, squaredDistance } from './geometry.js';

/** One thing occupying a place on the field. */
export interface Located {
  readonly key: CombatantKey;
  readonly position: Point;
}

/** A bounded, deterministic answer to "who is within `radius` of here". */
export interface SpatialIndex<T extends Located> {
  /** Cells along one side. */
  readonly cellsPerSide: number;
  /**
   * Everything within `radius` of `centre`, ascending by combatant key.
   *
   * @throws RangeError if `radius` exceeds the index's cell size, because the
   * nine-cell bound would silently stop holding.
   */
  within(centre: Point, radius: Fixed): T[];
  /** How many cells the last {@link within} inspected. For the bound's test. */
  readonly lastCellsInspected: number;
}

/**
 * Builds the index over a snapshot of positions.
 *
 * Rebuilt each tick rather than updated in place. An index that is updated has
 * to be *correctly* updated by every phase that moves anybody, and the failure
 * mode of missing one is a combatant who is somewhere for the purposes of being
 * hit and somewhere else for the purposes of hitting. Rebuilding is O(n) over a
 * cap of 64 combatants, which is nothing, and it makes the index a pure function
 * of the positions it was handed.
 */
export function buildSpatialIndex<T extends Located>(
  occupants: readonly T[],
  extent: Fixed,
  cellSize: Fixed,
): SpatialIndex<T> {
  // `ceil` through the one division helper §3 admits: an index a cell short at
  // the far edge would drop whoever stood there out of every query.
  const cellsPerSide = Math.max(1, -floorDiv(-extent, cellSize));
  const buckets = new Map<number, T[]>();

  for (const occupant of occupants) {
    const column = clamp(floorDiv(occupant.position.x, cellSize), 0, cellsPerSide - 1);
    const row = clamp(floorDiv(occupant.position.y, cellSize), 0, cellsPerSide - 1);
    const index = row * cellsPerSide + column;
    const bucket = buckets.get(index);
    if (bucket === undefined) buckets.set(index, [occupant]);
    else bucket.push(occupant);
  }

  let lastCellsInspected = 0;

  const index: SpatialIndex<T> = {
    cellsPerSide,
    get lastCellsInspected() {
      return lastCellsInspected;
    },
    within(centre, radius) {
      if (radius > cellSize) {
        throw new RangeError(
          `A radius of ${String(radius)} exceeds the index's ${String(cellSize)} cell size, so ` +
            'the nine-cell bound no longer holds and the query would miss combatants at the edge ' +
            'of the effect. raid-constant.json is validated against exactly this at load; ' +
            'reaching here means the tuning was hand-built.',
        );
      }
      const column = clamp(floorDiv(centre.x, cellSize), 0, cellsPerSide - 1);
      const row = clamp(floorDiv(centre.y, cellSize), 0, cellsPerSide - 1);
      const found: T[] = [];
      let inspected = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const c = column + dx;
          const r = row + dy;
          if (c < 0 || c >= cellsPerSide || r < 0 || r >= cellsPerSide) continue;
          inspected += 1;
          const bucket = buckets.get(r * cellsPerSide + c);
          if (bucket === undefined) continue;
          for (const occupant of bucket) {
            if (squaredDistance(centre, occupant.position) <= radius * radius) found.push(occupant);
          }
        }
      }
      lastCellsInspected = inspected;
      // Sorted by stable identity, never by bucket order: bucket order is the
      // insertion history, which is the one thing this index must not expose.
      found.sort((a, b) => compareCombatantKeys(a.key, b.key));
      return found;
    },
  };

  return index;
}
