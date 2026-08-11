/*
 * Multiverse Mages — the battlefield, generated from a seed and never stored.
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
 * A terrain grid over the 200 m × 200 m reference battlefield (`contracts.md`
 * §0), generated at portal open on **stream 11** — the registry's *"terrain
 * generation and combatant deployment"* — and thrown away at resolution.
 *
 * ## Regenerated, not persisted
 *
 * §1.6 forbids engagement entities from reaching a world snapshot, and terrain
 * is the easiest of them to leak because it is the one that looks like content.
 * It is not stored anywhere: a grid is a pure function of `(raidSeed,
 * tuning)`, so regenerating it is cheaper than storing it and, more to the
 * point, cannot drift from what was stored. The trade is that a change to this
 * generator changes every raid — which is precisely why the golden replay
 * fixture covers it, so the change that caused it is the change that fails.
 *
 * ## One draw per cell, per property, keyed by the cell
 *
 * Each cell draws from its own actor stream keyed on its linear index, rather
 * than walking one stream across the grid. That is the same insertion-invariance
 * discipline `contracts.md` §6 asks of combat: changing the grid resolution, or
 * adding a fourth terrain property, leaves every existing cell's roll where it
 * was. A single walked stream would re-roll the entire map on either change,
 * and every committed raid baseline with it.
 */

import type { Fixed, RngSource } from '@mm/sim-core';
import { FP_ONE, RNG_STREAM, floorDiv, nextBounded } from '@mm/sim-core';

import type { CellAddress, Point } from './geometry.js';
import { cellOfPoint } from './geometry.js';
import type { RaidTuning } from './tuning.js';

/** Ordinary ground: the movement multiplier that is the identity. */
const ORDINARY_MOVE_COST: Fixed = FP_ONE;

/** One terrain cell's three properties. */
export interface TerrainCell {
  readonly passable: boolean;
  readonly blocksLineOfSight: boolean;
  /** Multiplier on the per-tick movement allowance while crossing. `fp`. */
  readonly moveCost: Fixed;
}

/** The generated battlefield. Immutable for the raid's duration. */
export interface TerrainGrid {
  /** Cells along one side. The grid is square, like the field. */
  readonly cellsPerSide: number;
  /** Side of one cell, fp metres. */
  readonly cellSize: Fixed;
  /** Side of the field, fp metres. */
  readonly extent: Fixed;
  at(cell: CellAddress): TerrainCell;
  atPoint(point: Point): TerrainCell;
  /** Whether the cell containing this point may be occupied. */
  passableAt(point: Point): boolean;
  /** Whether the cell containing this point blocks sight through it. */
  blocksAt(cell: CellAddress): boolean;
}

/**
 * A cell outside the grid.
 *
 * Impassable and sight-blocking, so that a bug in a clamp fails safe: a
 * combatant cannot be walked off the map into somewhere it can shoot from and
 * not be shot at.
 */
const OUTSIDE: TerrainCell = Object.freeze({
  passable: false,
  blocksLineOfSight: true,
  moveCost: ORDINARY_MOVE_COST,
});

/**
 * Generates the battlefield for one raid.
 *
 * Draw order within a cell is fixed — passability, then sight, then going —
 * and each is a separate `nextBounded` on the same per-cell stream. Adding a
 * fourth property appends a draw and leaves the first three where they were.
 */
export function generateTerrain(tuning: RaidTuning, rng: RngSource): TerrainGrid {
  const cellsPerSide = floorDiv(tuning.battlefieldExtent, tuning.terrainCellSize);
  if (cellsPerSide < 1) {
    throw new RangeError(
      `A battlefield of ${String(tuning.battlefieldExtent)} at a cell size of ` +
        `${String(tuning.terrainCellSize)} has no cells in it. The content loader rejects this ` +
        'set; reaching here means the tuning was hand-built.',
    );
  }

  const cells: TerrainCell[] = new Array<TerrainCell>(cellsPerSide * cellsPerSide);
  for (let index = 0; index < cells.length; index += 1) {
    // Tick 0: terrain is generated once, at portal open, before any tick has
    // been stepped. Keyed on the cell so the grid is insertion-invariant.
    const stream = rng.actorStream(RNG_STREAM.terrain, 0, index);
    const impassable = nextBounded(stream, FP_ONE) < tuning.terrainImpassableChance;
    const blocking = nextBounded(stream, FP_ONE) < tuning.terrainBlockingChance;
    const rough = nextBounded(stream, FP_ONE) < tuning.terrainRoughChance;
    cells[index] = Object.freeze({
      passable: !impassable,
      // Rock blocks sight as well as passage. Stated rather than rolled: a
      // boulder you can see through is a boulder that is only in the way.
      blocksLineOfSight: impassable || blocking,
      moveCost: rough ? tuning.terrainRoughMoveCost : ORDINARY_MOVE_COST,
    });
  }

  const at = (cell: CellAddress): TerrainCell => {
    if (cell.column < 0 || cell.column >= cellsPerSide) return OUTSIDE;
    if (cell.row < 0 || cell.row >= cellsPerSide) return OUTSIDE;
    return cells[cell.row * cellsPerSide + cell.column] as TerrainCell;
  };

  const grid: TerrainGrid = {
    cellsPerSide,
    cellSize: tuning.terrainCellSize,
    extent: tuning.battlefieldExtent,
    at,
    atPoint(point) {
      return at(cellOfPoint(point, tuning.terrainCellSize, cellsPerSide));
    },
    passableAt(point) {
      return grid.atPoint(point).passable;
    },
    blocksAt(cell) {
      return at(cell).blocksLineOfSight;
    },
  };
  return grid;
}
