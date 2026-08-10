/*
 * Multiverse Mages — the technique × form grid, as state sees it.
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
 * Cell ids are grid coordinates: `contracts.md` §2.1 fixes the grid at exactly
 * 5 techniques × 14 forms, and `@mm/content` interns a cell as
 * `techniqueBit × 14 + formBit + 1`, leaving `0` as the reserved null.
 * {@link permits} has to undo that to reach the two axis bitmasks.
 *
 * **Why this is a second copy of arithmetic `@mm/content` already has.**
 * `@mm/content`'s public surface re-exports a loader that reads the filesystem,
 * so importing anything from it *as a value* would make this package — which
 * runs inside the Electron renderer and inside a browser — depend on `node:fs`
 * transitively. `contracts.md` §5 grants `state → content` as types only, and
 * the dependency-graph test enforces the annotation rather than trusting it.
 *
 * A second copy of a rule is the thing this codebase is most hostile to, so the
 * copy is pinned mechanically instead of by comment:
 * `packages/state/test/unit/grid-agrees-with-content.test.ts` asserts these
 * functions agree with `content.cellAxes` and `content.internCell` for every
 * one of the 70 cells, and that the counts match. The test runs in Node, where
 * the runtime edge is harmless. If the two ever disagree, that test says so
 * before anything reads a wrong bit out of a bitmask.
 */

import { floorDiv } from '@mm/sim-core';

/** Forms per technique. `contracts.md` §2.1: exactly 14, and never reordered. */
export const GRID_FORM_COUNT = 14;

/** Techniques. `contracts.md` §2.1: exactly 5. */
export const GRID_TECHNIQUE_COUNT = 5;

/** Cells in the full grid. §2.2: 70 exist in schema, 12 are flagged `v1`. */
export const GRID_CELL_COUNT = GRID_TECHNIQUE_COUNT * GRID_FORM_COUNT;

/** The reserved null cell id. §0: absent references are `0`, never `-1`. */
export const NULL_CELL_ID = 0;

/** Whether an integer names a cell in the grid. `0` is the null, not a cell. */
export function isCellId(cellId: number): boolean {
  return Number.isInteger(cellId) && cellId >= 1 && cellId <= GRID_CELL_COUNT;
}

/**
 * The interned cell id at a grid position.
 *
 * A bijection onto `1..70` exactly when the authored `bit` values are dense and
 * unique, which the content loader asserts.
 */
export function cellIdAt(techniqueBit: number, formBit: number): number {
  return techniqueBit * GRID_FORM_COUNT + formBit + 1;
}

/**
 * The technique axis of a cell.
 *
 * `floorDiv`, not `Math.floor` on a quotient: the rules path uses the one
 * shared division helper so that rounding is uniform everywhere, and floating
 * `Math` is banned outright in this package. The input is non-negative here, so
 * the two agree — the point is that there is nowhere for a second rounding
 * convention to enter from.
 */
export function techniqueBitOf(cellId: number): number {
  return floorDiv(cellId - 1, GRID_FORM_COUNT);
}

/** The form axis of a cell. */
export function formBitOf(cellId: number): number {
  return (cellId - 1) % GRID_FORM_COUNT;
}

/** Both axes of a cell, for callers that need the pair. */
export function cellAxesOf(cellId: number): { techniqueBit: number; formBit: number } {
  return { techniqueBit: techniqueBitOf(cellId), formBit: formBitOf(cellId) };
}
