/*
 * Multiverse Mages — getting round a rock, deterministically.
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
 * A breadth-first distance field per goal cell, and a step that follows it
 * downhill.
 *
 * ## Why this exists, and what it replaced
 *
 * "Step toward the goal, and if that is blocked, slide along the obstacle" is
 * the obvious movement rule and it is wrong in a way that no assertion in this
 * project would have caught. Two combatants met in the middle of the first
 * end-to-end raid and then **swapped places for two thousand four hundred
 * ticks**: a wall above them made the direct step illegal, the slide sent each
 * one into the cell the other had just left, and the next tick sent them back.
 * The raid terminated — the portal decayed on schedule — and every metric it
 * produced was a description of nothing. That is exactly the failure mode
 * `CLAUDE.md` names: a metric that reads a real number about an unreal
 * situation.
 *
 * A distance field cannot oscillate. Every step strictly decreases the distance
 * to the goal, so a combatant either arrives or is genuinely enclosed, and the
 * enclosed case is a raid that ends on portal collapse rather than a raid that
 * spends its whole length shuffling.
 *
 * ## Why breadth-first rather than A*
 *
 * The grid is 20 × 20. A full field costs one pass over 400 cells and is then
 * shared by every combatant heading for the same objective, for the whole raid,
 * because terrain never changes. A* would be asymptotically better and would
 * need a tie-broken priority queue — one more place where insertion order could
 * quietly decide a path, in a package whose entire premise is that it does not.
 *
 * Ties are broken by a fixed neighbour order rather than by a heuristic, so two
 * peers walking the same field take the same route. That is the property that
 * matters; the route being *shortest* is a bonus.
 */

import type { Fixed } from '@mm/sim-core';

import type { CellAddress, Point } from './geometry.js';
import { cellOfPoint, centreOfCell } from './geometry.js';
import { moveToward } from './movement.js';
import type { TerrainGrid } from './terrain.js';

/** Distance to a cell no path reaches. */
const UNREACHABLE = -1;

/**
 * Neighbour order, fixed. North, east, south, west — and the order is the
 * tie-break, so it is part of the rules rather than an implementation detail.
 */
const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]);

/** Distance fields over one raid's terrain, computed once per goal cell. */
export class TerrainNavigator {
  readonly #terrain: TerrainGrid;
  readonly #fields = new Map<number, Int32Array>();

  constructor(terrain: TerrainGrid) {
    this.#terrain = terrain;
  }

  /** Fields held. Reported so a test can show the cache is doing its job. */
  get fieldCount(): number {
    return this.#fields.size;
  }

  /**
   * The next position on the way to `goal`.
   *
   * `allowance` is the per-tick movement allowance *before* terrain cost;
   * {@link moveToward} applies the going underfoot, so there is one place that
   * scales a step and one place that decides where it points.
   *
   * Within the goal's own cell, or when the goal is unreachable, this degrades
   * to {@link moveToward}'s direct step and its slide — which is correct in the
   * first case and is the best available answer in the second.
   */
  stepTowardGoal(from: Point, goal: Point, allowance: Fixed): Point {
    const side = this.#terrain.cellsPerSide;
    const size = this.#terrain.cellSize;
    const fromCell = cellOfPoint(from, size, side);
    const goalCell = cellOfPoint(goal, size, side);

    if (fromCell.column === goalCell.column && fromCell.row === goalCell.row) {
      return moveToward(from, goal, allowance, this.#terrain);
    }

    const field = this.#fieldTo(goalCell);
    const here = field[fromCell.row * side + fromCell.column] as number;
    if (here === UNREACHABLE) {
      return moveToward(from, goal, allowance, this.#terrain);
    }

    let best: CellAddress | undefined;
    let bestDistance = here;
    for (const [dx, dy] of NEIGHBOURS) {
      const column = fromCell.column + dx;
      const row = fromCell.row + dy;
      if (column < 0 || column >= side || row < 0 || row >= side) continue;
      const distance = field[row * side + column] as number;
      if (distance === UNREACHABLE) continue;
      // Strictly less, so a step never sidles between two cells of equal
      // distance — which is the oscillation this class exists to remove.
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { column, row };
      }
    }

    if (best === undefined) {
      return moveToward(from, goal, allowance, this.#terrain);
    }
    return moveToward(from, centreOfCell(best, size), allowance, this.#terrain);
  }

  /** Breadth-first distance from every passable cell to `goal`. */
  #fieldTo(goal: CellAddress): Int32Array {
    const side = this.#terrain.cellsPerSide;
    const key = goal.row * side + goal.column;
    const cached = this.#fields.get(key);
    if (cached !== undefined) return cached;

    const field = new Int32Array(side * side).fill(UNREACHABLE);
    if (!this.#terrain.at(goal).passable) {
      this.#fields.set(key, field);
      return field;
    }

    field[key] = 0;
    // A plain array used as a FIFO with a moving head: no priority queue, and
    // therefore no comparator whose stability anybody has to reason about.
    const queue: number[] = [key];
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      const column = index % side;
      const row = (index - column) / side;
      const distance = field[index] as number;
      for (const [dx, dy] of NEIGHBOURS) {
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextColumn >= side || nextRow < 0 || nextRow >= side) continue;
        const nextIndex = nextRow * side + nextColumn;
        if (field[nextIndex] !== UNREACHABLE) continue;
        if (!this.#terrain.at({ column: nextColumn, row: nextRow }).passable) continue;
        field[nextIndex] = distance + 1;
        queue.push(nextIndex);
      }
    }

    this.#fields.set(key, field);
    return field;
  }
}
