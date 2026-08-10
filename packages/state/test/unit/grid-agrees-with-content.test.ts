/*
 * Multiverse Mages — state's grid arithmetic is pinned to the content package's.
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
 * `@mm/state` decodes a cell id into its two axis bits in `./src/grid.ts`, and
 * `@mm/content` encodes it in `./src/intern.ts`. Two copies of one rule is
 * exactly what this codebase treats as a defect, so the copy exists only
 * because it must: `contracts.md` §5 grants `state → content` as **types only**,
 * and `@mm/content`'s public surface re-exports a loader that reads the
 * filesystem — a value import would make `@mm/state` depend on `node:fs`
 * transitively, in a package that runs inside the Electron renderer.
 *
 * This test is what makes the copy safe. It runs in Node, where the runtime
 * edge is harmless, and asserts the two agree over the entire 70-cell grid. If
 * either side is ever changed alone, this fails before anything reads the wrong
 * bit out of a bitmask — which would otherwise surface as a whole diagonal of
 * the grid quietly becoming legal or illegal.
 */

import { describe, expect, it } from 'vitest';

import { CELL_COUNT, FORM_COUNT, TECHNIQUE_COUNT, cellAxes, internCell } from '@mm/content';
import {
  GRID_CELL_COUNT,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  cellAxesOf,
  cellIdAt,
  isCellId,
} from '@mm/state';

describe('the grid constants agree across packages', () => {
  it('has the same dimensions the content loader interns against', () => {
    expect(GRID_FORM_COUNT).toBe(FORM_COUNT);
    expect(GRID_TECHNIQUE_COUNT).toBe(TECHNIQUE_COUNT);
    expect(GRID_CELL_COUNT).toBe(CELL_COUNT);
    // Pinned to the literals in contracts.md §2.1 as well, so that a change on
    // both sides at once still has to be a deliberate contract change.
    expect(GRID_TECHNIQUE_COUNT).toBe(5);
    expect(GRID_FORM_COUNT).toBe(14);
    expect(GRID_CELL_COUNT).toBe(70);
  });
});

describe('the two implementations of the grid bijection agree', () => {
  it('encodes every grid position identically', () => {
    for (let techniqueBit = 0; techniqueBit < TECHNIQUE_COUNT; techniqueBit += 1) {
      for (let formBit = 0; formBit < FORM_COUNT; formBit += 1) {
        expect(cellIdAt(techniqueBit, formBit)).toBe(internCell(techniqueBit, formBit));
      }
    }
  });

  it('decodes every one of the 70 cell ids identically', () => {
    for (let cellId = 1; cellId <= CELL_COUNT; cellId += 1) {
      expect(cellAxesOf(cellId), `cell ${cellId}`).toEqual(cellAxes(cellId));
    }
  });

  it('round-trips: decode then encode is the identity over the whole grid', () => {
    for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
      const { techniqueBit, formBit } = cellAxesOf(cellId);
      expect(cellIdAt(techniqueBit, formBit)).toBe(cellId);
      expect(isCellId(cellId)).toBe(true);
    }
  });

  it('leaves 0 as the reserved null on both sides', () => {
    expect(isCellId(0)).toBe(false);
    expect(cellIdAt(0, 0)).toBe(1);
    expect(internCell(0, 0)).toBe(1);
  });
});
