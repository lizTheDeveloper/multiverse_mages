/*
 * Multiverse Mages — the plane a raid happens on.
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
 * `raid-space` tasks 5.7 and 5.8, plus the movement half of 5.9.
 *
 * The two properties worth more than the arithmetic:
 *
 * - **Line of sight is symmetric.** Asserted over every pair of positions on a
 *   small grid with randomly placed blockers, not over a hand-picked pair. An
 *   asymmetric sight line is a firing position one side can use and the other
 *   cannot see into, and it would be invisible in any test that only looked one
 *   way.
 * - **A step never exceeds its allowance.** The scaling divides by an integer
 *   square root, which floors, so the naive worry is a step one unit too long.
 *   Asserted directly.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { CellAddress, Point } from '@mm/rules-raid';
import {
  cellOfPoint,
  centreOfCell,
  clampToField,
  hasLineOfSight,
  integerSqrt,
  squaredDistance,
  stepToward,
  traceCells,
  withinRange,
} from '@mm/rules-raid';

const CELL = 10 * FP_ONE;
const SIDE = 8;

function at(x: number, y: number): Point {
  return { x: x * FP_ONE, y: y * FP_ONE };
}

describe('range is a comparison of squares', () => {
  it('measures the squared distance exactly, at scale 1024²', () => {
    // 3-4-5, so the exact answer is knowable without a root.
    expect(squaredDistance(at(0, 0), at(3, 4))).toBe(25 * FP_ONE * FP_ONE);
  });

  it('includes the boundary and excludes one unit past it', () => {
    expect(withinRange(at(0, 0), at(3, 4), 5 * FP_ONE)).toBe(true);
    expect(withinRange(at(0, 0), at(3, 4), 5 * FP_ONE - 1)).toBe(false);
  });

  it('is symmetric in its arguments, because a range test with a direction is a bug', () => {
    expect(withinRange(at(1, 7), at(9, 2), 11 * FP_ONE)).toBe(
      withinRange(at(9, 2), at(1, 7), 11 * FP_ONE),
    );
  });
});

describe('integerSqrt replaces the banned Math.sqrt', () => {
  it('is exact on perfect squares and floors otherwise', () => {
    expect(integerSqrt(0)).toBe(0);
    expect(integerSqrt(1)).toBe(1);
    expect(integerSqrt(25)).toBe(5);
    expect(integerSqrt(26)).toBe(5);
    expect(integerSqrt(24)).toBe(4);
  });

  it('is exact at the magnitudes a 200 m field actually produces', () => {
    // The squared diagonal of the reference battlefield, which is where a
    // float would first start lying.
    const diagonal = 2 * (200 * FP_ONE) * (200 * FP_ONE);
    const root = integerSqrt(diagonal);
    expect(root * root).toBeLessThanOrEqual(diagonal);
    expect((root + 1) * (root + 1)).toBeGreaterThan(diagonal);
  });

  it('refuses a negative or fractional input rather than returning NaN', () => {
    expect(() => integerSqrt(-1)).toThrow(/non-negative integer/u);
  });
});

describe('the field and its cells', () => {
  it('clamps a position to the rectangle', () => {
    expect(clampToField(at(-5, 250), 200 * FP_ONE)).toEqual({ x: 0, y: 200 * FP_ONE });
  });

  it('keeps a position exactly on the far edge in the last cell, not one past it', () => {
    expect(cellOfPoint(at(80, 80), CELL, SIDE)).toEqual({ column: SIDE - 1, row: SIDE - 1 });
  });

  it('round-trips a cell through its own centre', () => {
    for (let column = 0; column < SIDE; column += 1) {
      for (let row = 0; row < SIDE; row += 1) {
        const cell: CellAddress = { column, row };
        expect(cellOfPoint(centreOfCell(cell, CELL), CELL, SIDE)).toEqual(cell);
      }
    }
  });
});

describe('line of sight is traced on integers and is symmetric', () => {
  /** A deterministic pseudo-random blocker set — no Math.random in a test either. */
  function blockerSet(seed: number): Set<string> {
    const blocked = new Set<string>();
    let state = seed;
    for (let column = 0; column < SIDE; column += 1) {
      for (let row = 0; row < SIDE; row += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        if (state % 5 === 0) blocked.add(`${String(column)},${String(row)}`);
      }
    }
    return blocked;
  }

  it('agrees in both directions for every pair of cell centres', () => {
    // The property, over the whole grid rather than over a chosen pair. A
    // Bresenham walk fails this at corners, which is exactly the case a
    // hand-picked example would miss.
    for (const seed of [1, 7, 99, 4242]) {
      const blocked = blockerSet(seed);
      const blocks = (cell: CellAddress): boolean =>
        blocked.has(`${String(cell.column)},${String(cell.row)}`);

      for (let a = 0; a < SIDE * SIDE; a += 1) {
        for (let b = a + 1; b < SIDE * SIDE; b += 1) {
          const pa = centreOfCell({ column: a % SIDE, row: Math.trunc(a / SIDE) }, CELL);
          const pb = centreOfCell({ column: b % SIDE, row: Math.trunc(b / SIDE) }, CELL);
          expect(hasLineOfSight(pa, pb, CELL, SIDE, blocks)).toBe(
            hasLineOfSight(pb, pa, CELL, SIDE, blocks),
          );
        }
      }
    }
  });

  it('visits the same set of cells walking either way', () => {
    const forward = traceCells(at(3, 2), at(66, 51), CELL, SIDE);
    const backward = traceCells(at(66, 51), at(3, 2), CELL, SIDE);
    const key = (cell: CellAddress): string => `${String(cell.column)},${String(cell.row)}`;
    expect([...new Set(forward.map(key))].sort()).toEqual([...new Set(backward.map(key))].sort());
  });

  it('is broken by a blocker on the line and not by one beside it', () => {
    const onTheLine = (cell: CellAddress): boolean => cell.column === 3 && cell.row === 0;
    const beside = (cell: CellAddress): boolean => cell.column === 3 && cell.row === 4;
    expect(hasLineOfSight(at(5, 5), at(75, 5), CELL, SIDE, onTheLine)).toBe(false);
    expect(hasLineOfSight(at(5, 5), at(75, 5), CELL, SIDE, beside)).toBe(true);
  });

  it('never blocks on the endpoints own cells, so cover does not blind its occupant', () => {
    const everything = (): boolean => true;
    expect(hasLineOfSight(at(5, 5), at(15, 5), CELL, SIDE, everything)).toBe(true);
  });

  it('terminates on a degenerate segment rather than walking forever', () => {
    expect(traceCells(at(5, 5), at(5, 5), CELL, SIDE)).toEqual([{ column: 0, row: 0 }]);
  });
});

describe('a step toward a goal', () => {
  it('arrives exactly when the allowance covers the distance', () => {
    expect(stepToward(at(0, 0), at(3, 4), 5 * FP_ONE)).toEqual(at(3, 4));
  });

  it('never exceeds its allowance, in any direction', () => {
    const allowance = 4 * FP_ONE;
    for (const goal of [at(100, 0), at(0, 100), at(-100, 37), at(61, -80), at(-3, -4)]) {
      const from = at(50, 50);
      const landed = stepToward(from, goal, allowance);
      const travelled = squaredDistance(from, landed);
      expect(travelled).toBeLessThanOrEqual(allowance * allowance);
    }
  });

  it('does not move on a zero allowance or a zero distance', () => {
    expect(stepToward(at(7, 7), at(9, 9), 0)).toEqual(at(7, 7));
    expect(stepToward(at(7, 7), at(7, 7), 4 * FP_ONE)).toEqual(at(7, 7));
  });
});
