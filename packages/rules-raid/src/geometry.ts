/*
 * Multiverse Mages — fixed-point plane geometry with no square roots in it.
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
 * The plane a raid happens on, in fixed-point metres, with no `Math.sqrt` and no
 * float anywhere.
 *
 * ## Range is a comparison of squares, and that is not an optimisation
 *
 * `contracts.md` §0 bans floating point in the rules path outright, and `sqrt`
 * is a floating-point operation with no exact fixed-point equivalent. So range
 * is `dx² + dy² ≤ r²`, which is exact on integers and needs no helper. There is
 * no rounding to agree about, and therefore nothing for two peers to disagree
 * about.
 *
 * The one thing to watch is magnitude. At scale 1024 a 200 m field is 204,800,
 * and its squared diagonal is about 8.4 × 10¹⁰ — beyond `int32` and far inside
 * the 2⁵³ integers a JavaScript number represents exactly. So squared distances
 * are computed as plain numbers and are **never** stored in a component field
 * or compared with a fixed-point helper; they are compared against each other
 * and discarded. {@link squaredDistance} says so in its return type's name.
 *
 * ## Line of sight walks cells, not pixels
 *
 * A *supercover* walk: every terrain cell the segment touches, including the
 * two it clips at a corner, rather than the one-cell-per-column line Bresenham
 * draws. The difference matters at exactly the moment it is least welcome — a
 * diagonal shot threaded between two blocking cells that touch at a corner.
 * Bresenham lets it through from one side and blocks it from the other, so line
 * of sight stops being symmetric, and an asymmetric sight line lets one side
 * shoot from cover the other cannot see into.
 *
 * Symmetry here is structural rather than tested-and-hoped: {@link traceCells}
 * is written so that walking `a → b` and `b → a` visits the same set, because
 * the decision at each step is a comparison of two exact integer quantities
 * that swap roles under reversal rather than an accumulating error term.
 */

import type { Fixed } from '@mm/sim-core';
import { floorDiv } from '@mm/sim-core';

/** A position on the battlefield, in fp metres. */
export interface Point {
  readonly x: Fixed;
  readonly y: Fixed;
}

/** A terrain cell address. Integer column and row, never fp. */
export interface CellAddress {
  readonly column: number;
  readonly row: number;
}

/**
 * The squared distance between two points.
 *
 * **Not a `Fixed`.** It is a fixed-point value squared, so its scale is 1024²
 * and it is only ever compared against another quantity at the same scale — see
 * {@link withinRange}. Handing it to `mul` or `div` would be a scale error that
 * produces a plausible number.
 */
export function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Whether `b` is within `radius` fp metres of `a`. Exact; no square root. */
export function withinRange(a: Point, b: Point, radius: Fixed): boolean {
  return squaredDistance(a, b) <= radius * radius;
}

/** Clamps a scalar into `[low, high]`. */
export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/**
 * Clamps a point into the battlefield rectangle `[0, extent]²`.
 *
 * Inclusive of the far edge, and the terrain index compensates by clamping the
 * final cell — a combatant standing exactly on the boundary is inside the field,
 * not in a cell that does not exist.
 */
export function clampToField(point: Point, extent: Fixed): Point {
  return { x: clamp(point.x, 0, extent), y: clamp(point.y, 0, extent) };
}

/**
 * The terrain cell a point falls in, clamped to the grid.
 *
 * `floorDiv` rather than a bare `/`: `contracts.md` §3 requires every division
 * in the rules path to round through the one shared helper, and the clamp is
 * what keeps the far edge in the last cell rather than one past it.
 */
export function cellOfPoint(point: Point, cellSize: Fixed, cellsPerSide: number): CellAddress {
  return {
    column: clamp(floorDiv(point.x, cellSize), 0, cellsPerSide - 1),
    row: clamp(floorDiv(point.y, cellSize), 0, cellsPerSide - 1),
  };
}

/** The centre of a terrain cell, in fp metres. */
export function centreOfCell(cell: CellAddress, cellSize: Fixed): Point {
  return {
    x: cell.column * cellSize + floorDiv(cellSize, 2),
    y: cell.row * cellSize + floorDiv(cellSize, 2),
  };
}

/**
 * Every terrain cell the segment `a → b` touches, in order from `a`.
 *
 * A supercover walk over an Amanatides–Woo style traversal, run on exact
 * integers: instead of accumulating a floating error term, each step compares
 * two cross-multiplied integers to decide whether the next boundary crossed is
 * vertical, horizontal, or both at once. A simultaneous crossing is a corner,
 * and both the horizontal and vertical neighbours are visited before the
 * diagonal one — that is the "supercover" part, and it is what makes the walk
 * symmetric.
 *
 * The set of cells visited is the same walking `b → a`; only the order
 * reverses. {@link hasLineOfSight} therefore gives the same answer both ways
 * regardless of which cells block, which is asserted rather than assumed in the
 * tests.
 */
export function traceCells(
  a: Point,
  b: Point,
  cellSize: Fixed,
  cellsPerSide: number,
): CellAddress[] {
  const start = cellOfPoint(a, cellSize, cellsPerSide);
  const end = cellOfPoint(b, cellSize, cellsPerSide);
  const cells: CellAddress[] = [start];
  if (start.column === end.column && start.row === end.row) return cells;

  const stepX = end.column > start.column ? 1 : end.column < start.column ? -1 : 0;
  const stepY = end.row > start.row ? 1 : end.row < start.row ? -1 : 0;

  // Distances to the next boundary, and the full-cell strides, expressed as
  // integer numerators over the same implicit denominators |dx| and |dy|. The
  // comparison below cross-multiplies, so nothing is ever divided.
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);

  let column = start.column;
  let row = start.row;

  // Distance along x remaining until the next vertical boundary, in fp metres.
  let nextX =
    stepX > 0
      ? (column + 1) * cellSize - a.x
      : stepX < 0
        ? a.x - column * cellSize
        : Number.POSITIVE_INFINITY;
  let nextY =
    stepY > 0
      ? (row + 1) * cellSize - a.y
      : stepY < 0
        ? a.y - row * cellSize
        : Number.POSITIVE_INFINITY;

  // A boundary the segment starts exactly on is zero away; step a whole cell
  // instead, or the walk stalls re-crossing the same line.
  if (nextX === 0) nextX = cellSize;
  if (nextY === 0) nextY = cellSize;

  // Guarded rather than trusted: the loop is bounded by the grid's own
  // dimensions, so a mistake in the stepping is a wrong answer rather than a
  // raid that never finishes a tick. contracts.md's termination guarantee is
  // about ticks, and a tick that hangs would defeat it from underneath.
  const maxSteps = 2 * cellsPerSide + 2;
  for (let step = 0; step < maxSteps; step += 1) {
    if (column === end.column && row === end.row) break;

    // `nextX / dx` versus `nextY / dy`, cross-multiplied. Both denominators are
    // non-negative, so the inequality direction is preserved.
    const crossX = nextX * dy;
    const crossY = nextY * dx;

    if (stepY === 0 || (stepX !== 0 && crossX < crossY)) {
      column += stepX;
      nextX += cellSize;
    } else if (stepX === 0 || crossY < crossX) {
      row += stepY;
      nextY += cellSize;
    } else {
      // Exactly a corner. Visit both orthogonal neighbours before the diagonal,
      // so that the reversed walk sees the same set.
      cells.push({ column: column + stepX, row });
      cells.push({ column, row: row + stepY });
      column += stepX;
      row += stepY;
      nextX += cellSize;
      nextY += cellSize;
    }
    cells.push({ column, row });
  }

  return cells;
}

/**
 * Whether the segment `a → b` is unobstructed.
 *
 * The endpoints' own cells never block: a combatant standing in a wood can see
 * out of it and be seen in it, and a rule that said otherwise would make a
 * combatant who stepped into cover invisible to everyone including herself.
 */
export function hasLineOfSight(
  a: Point,
  b: Point,
  cellSize: Fixed,
  cellsPerSide: number,
  blocks: (cell: CellAddress) => boolean,
): boolean {
  const cells = traceCells(a, b, cellSize, cellsPerSide);
  for (let index = 1; index < cells.length - 1; index += 1) {
    if (blocks(cells[index] as CellAddress)) return false;
  }
  return true;
}

/**
 * A step of at most `allowance` fp metres from `from` toward `to`.
 *
 * The scaling is `mul`-free integer arithmetic at extended precision: the ratio
 * `allowance / distance` is applied as `delta × allowance / distance` with the
 * multiplication first, so a short allowance over a long distance does not floor
 * to a zero-length step the way `mul(fraction, delta)` would. That is
 * `contracts.md` §3's extended-precision rule applied to movement — the same
 * defect that made a draconic hazard floor to zero, wearing different clothes.
 *
 * Distance is needed as a scalar here, and a square root is banned. It is
 * obtained by comparing squares instead: if the step would overshoot, the
 * combatant arrives exactly at the target; otherwise the scaling uses the
 * integer square root of the squared distance, computed by Newton's method on
 * integers. `integerSqrt` is exact for a perfect square and floors otherwise,
 * which errs toward a slightly *longer* step and is then clamped by the
 * overshoot test above it, so a combatant can never move further than its
 * allowance.
 */
export function stepToward(from: Point, to: Point, allowance: Fixed): Point {
  if (allowance <= 0) return from;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  if (squared === 0) return from;
  if (squared <= allowance * allowance) return to;

  // The **ceiling** of the distance, not the floor. Dividing by a distance that
  // is one unit short scales every component up, which is enough to carry a
  // combatant past its allowance — a small error, and one that compounds into
  // "movement is slightly faster diagonally", which is the kind of thing that
  // survives for years. Over-estimating the distance errs short instead.
  const distance = ceilSqrt(squared);
  if (distance === 0) return to;
  // Each component is floored on its **magnitude** and the sign reapplied,
  // rather than floored on the signed value. floorDiv rounds toward negative
  // infinity, so a signed floor lengthens a step that points left or down — by
  // one unit per axis, which is enough to carry a combatant a hair past its
  // allowance and enough to make "never exceeds its allowance" false in exactly
  // two of the four quadrants. Flooring the magnitude errs short in all four.
  return {
    x: from.x + Math.sign(dx) * floorDiv(Math.abs(dx) * allowance, distance),
    y: from.y + Math.sign(dy) * floorDiv(Math.abs(dy) * allowance, distance),
  };
}

/**
 * `floor(sqrt(value))` on non-negative integers, with no floating point.
 *
 * Newton's method from an over-estimate, which converges monotonically
 * downward, so the loop terminates without a tolerance to choose. `Math.sqrt`
 * would be simpler and is banned by the lint rule over this package; more to
 * the point, it is a double, and a double is exact only up to 2⁵³ — squared fp
 * distances on a large field are within that today and the ban means nobody has
 * to re-check it tomorrow. Every division here is `floorDiv`, which is the one
 * shared helper §3 permits.
 *
 * Exported because it is the only place in this package that computes a root,
 * and the lint rule that forbids `Math.sqrt` in `rules-raid` is only honest if
 * there is one obvious integer alternative to point at.
 */
export function integerSqrt(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`integerSqrt takes a non-negative integer, got ${String(value)}`);
  }
  if (value < 2) return value;
  let guess = value;
  let next = floorDiv(guess + floorDiv(value, guess), 2);
  while (next < guess) {
    guess = next;
    next = floorDiv(guess + floorDiv(value, guess), 2);
  }
  return guess;
}

/**
 * `ceil(sqrt(value))` — the smallest integer whose square is at least `value`.
 *
 * The half of the pair that scaling wants. Dividing by a rounded-*down*
 * distance scales a step up, and a step that is one unit too long in each of
 * two axes is how "diagonal movement is slightly faster" gets into a game and
 * stays there.
 */
export function ceilSqrt(value: number): number {
  const root = integerSqrt(value);
  return root * root < value ? root + 1 : root;
}
