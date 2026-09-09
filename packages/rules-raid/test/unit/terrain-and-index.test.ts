/*
 * Multiverse Mages — the generated battlefield and the index over it.
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
 * `raid-space` tasks 5.4, 5.6, and the displacement half of 5.9.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import { FP_ONE, rngFromRootSeed } from '@mm/sim-core';
import { RAID_SIDE } from '@mm/state';
import type { Located, Point } from '@mm/rules-raid';
import {
  blinkToward,
  buildSpatialIndex,
  generateTerrain,
  moveToward,
  readRaidTuning,
} from '@mm/rules-raid';

const tuning = readRaidTuning(loadContent(shippedContentSource()));

function at(x: number, y: number): Point {
  return { x: x * FP_ONE, y: y * FP_ONE };
}

/**
 * Where `openPortal` puts the portal, and therefore the one cell
 * `generateTerrain` guarantees passable. Repeated here rather than imported
 * because `raid.ts` does not export it — and a test that passed a *different*
 * point would be exercising a grid no raid can produce.
 */
const PORTAL: Point = { x: Math.floor(tuning.battlefieldExtent / 2), y: 0 };

describe('terrain is regenerated from the seed, never stored', () => {
  it('produces an identical grid from an identical seed', () => {
    const a = generateTerrain(tuning, rngFromRootSeed(4242), PORTAL);
    const b = generateTerrain(tuning, rngFromRootSeed(4242), PORTAL);
    for (let row = 0; row < a.cellsPerSide; row += 1) {
      for (let column = 0; column < a.cellsPerSide; column += 1) {
        expect(a.at({ column, row })).toEqual(b.at({ column, row }));
      }
    }
  });

  it('produces a different grid from a different seed', () => {
    const a = generateTerrain(tuning, rngFromRootSeed(1), PORTAL);
    const b = generateTerrain(tuning, rngFromRootSeed(2), PORTAL);
    let differences = 0;
    for (let row = 0; row < a.cellsPerSide; row += 1) {
      for (let column = 0; column < a.cellsPerSide; column += 1) {
        if (a.at({ column, row }).passable !== b.at({ column, row }).passable) differences += 1;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('covers the whole field in whole cells', () => {
    const grid = generateTerrain(tuning, rngFromRootSeed(7), PORTAL);
    expect(grid.cellsPerSide * grid.cellSize).toBe(tuning.battlefieldExtent);
  });

  it('leaves most of the field passable, so a raid has somewhere to happen', () => {
    // Not a balance claim — a liveness one. A generator that produced a wall of
    // rock would pass every other assertion in this file while making every
    // raid a stalemate, and `raidLengthDistribution` would report that as a
    // finding about the game.
    const grid = generateTerrain(tuning, rngFromRootSeed(11), PORTAL);
    let passable = 0;
    const total = grid.cellsPerSide * grid.cellsPerSide;
    for (let row = 0; row < grid.cellsPerSide; row += 1) {
      for (let column = 0; column < grid.cellsPerSide; column += 1) {
        if (grid.at({ column, row }).passable) passable += 1;
      }
    }
    expect(passable * 2).toBeGreaterThan(total);
  });

  it('treats everything outside the grid as impassable and sight-blocking', () => {
    const grid = generateTerrain(tuning, rngFromRootSeed(3), PORTAL);
    const outside = grid.at({ column: -1, row: 0 });
    expect(outside.passable).toBe(false);
    expect(outside.blocksLineOfSight).toBe(true);
  });
});

describe('movement and displacement stop at the same wall', () => {
  /** A field with a wall down column 5, so a crossing has to be stopped. */
  function walled(): ReturnType<typeof generateTerrain> {
    const grid = generateTerrain(tuning, rngFromRootSeed(9), PORTAL);
    const cellSize = grid.cellSize;
    const cellsPerSide = grid.cellsPerSide;
    return {
      cellsPerSide,
      cellSize,
      extent: grid.extent,
      at: (cell) =>
        cell.column === 5
          ? { passable: false, blocksLineOfSight: true, moveCost: FP_ONE }
          : { passable: true, blocksLineOfSight: false, moveCost: FP_ONE },
      atPoint: (point) => walled().at({ column: Math.trunc(point.x / cellSize), row: 0 }),
      passableAt: (point) => Math.trunc(point.x / cellSize) !== 5,
      blocksAt: (cell) => cell.column === 5,
    };
  }

  it('clamps a blink to the last passable point rather than passing through rock', () => {
    const terrain = walled();
    // Column 5 spans 50 m to 60 m at a 10 m cell size.
    const landed = blinkToward(at(10, 5), at(90, 5), [80 * FP_ONE], terrain);
    expect(landed.x).toBeLessThan(50 * FP_ONE);
    expect(landed.x).toBeGreaterThan(10 * FP_ONE);
  });

  it('takes the largest blink source and not their sum', () => {
    const open = generateTerrain(tuning, rngFromRootSeed(5), PORTAL);
    const clear = {
      ...open,
      at: () => ({ passable: true, blocksLineOfSight: false, moveCost: FP_ONE }),
      atPoint: () => ({ passable: true, blocksLineOfSight: false, moveCost: FP_ONE }),
      passableAt: () => true,
      blocksAt: () => false,
    };
    const summed = blinkToward(at(0, 0), at(100, 0), [10 * FP_ONE, 6 * FP_ONE], clear);
    expect(summed).toEqual(at(10, 0));
  });

  it('does not displace at all when every source is zero', () => {
    const open = generateTerrain(tuning, rngFromRootSeed(5), PORTAL);
    expect(blinkToward(at(3, 3), at(90, 3), [], open)).toEqual(at(3, 3));
  });

  it('halves a step on rough ground rather than flooring it to nothing', () => {
    const rough = {
      cellsPerSide: 20,
      cellSize: 10 * FP_ONE,
      extent: tuning.battlefieldExtent,
      at: () => ({ passable: true, blocksLineOfSight: false, moveCost: tuning.terrainRoughMoveCost }),
      atPoint: () => ({
        passable: true,
        blocksLineOfSight: false,
        moveCost: tuning.terrainRoughMoveCost,
      }),
      passableAt: () => true,
      blocksAt: () => false,
    };
    const landed = moveToward(at(0, 0), at(100, 0), tuning.movementPerTick, rough);
    expect(landed.x).toBeGreaterThan(0);
    expect(landed.x).toBeLessThan(tuning.movementPerTick);
  });
});

describe('the spatial index is bounded and order-independent', () => {
  const occupants: Located[] = [
    { key: { side: RAID_SIDE.attacker, spawnOrdinal: 0 }, position: at(10, 10) },
    { key: { side: RAID_SIDE.attacker, spawnOrdinal: 1 }, position: at(12, 11) },
    { key: { side: RAID_SIDE.defender, spawnOrdinal: 0 }, position: at(11, 13) },
    { key: { side: RAID_SIDE.defender, spawnOrdinal: 1 }, position: at(180, 180) },
  ];

  const build = (order: readonly Located[]): ReturnType<typeof buildSpatialIndex<Located>> =>
    buildSpatialIndex(order, tuning.battlefieldExtent, tuning.maxInteractionRadius);

  it('returns the same combatants in the same order whatever the insertion order', () => {
    const forward = build(occupants).within(at(11, 11), tuning.maxInteractionRadius);
    const backward = build([...occupants].reverse()).within(at(11, 11), tuning.maxInteractionRadius);
    expect(forward.map((entry) => entry.key)).toEqual(backward.map((entry) => entry.key));
    // Ascending key, which is the total order every phase walks in.
    expect(forward.map((entry) => entry.key)).toEqual([
      { side: 0, spawnOrdinal: 0 },
      { side: 0, spawnOrdinal: 1 },
      { side: 1, spawnOrdinal: 0 },
    ]);
  });

  it('inspects at most nine cells', () => {
    const index = build(occupants);
    index.within(at(100, 100), tuning.maxInteractionRadius);
    expect(index.lastCellsInspected).toBeLessThanOrEqual(9);
  });

  it('refuses a radius beyond its cell size rather than quietly missing the edge', () => {
    const index = build(occupants);
    expect(() => index.within(at(100, 100), tuning.maxInteractionRadius + 1)).toThrow(
      /nine-cell bound/u,
    );
  });

  it('excludes anyone outside the radius even when they share a cell', () => {
    const index = build(occupants);
    const near = index.within(at(10, 10), 3 * FP_ONE);
    expect(near.map((entry) => entry.key.spawnOrdinal)).toEqual([0, 1]);
  });
});
