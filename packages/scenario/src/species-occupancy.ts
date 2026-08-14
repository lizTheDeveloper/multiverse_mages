/*
 * Multiverse Mages — which cells each species actually occupies.
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
 * The **outcome** half of the species-breadth question, next to
 * `species-versatility.ts`'s capability half.
 *
 * `speciesVersatility` derives, from content alone, which cells a species
 * *could* staff. This reads world state and reports which cells a species *did*
 * occupy. The two are not the same question and the difference is the point:
 * `speciesGridVersatility`'s own falsification test is stated over this
 * quantity — *"the predicted-staffable set must be a superset of the
 * observed-staffed set"* — and until this existed there was no observed set.
 *
 * ## What counts as occupying a cell, and what deliberately does not
 *
 * A **living** mage of the species holding an instance of some node in the cell,
 * **in a mind**. Three exclusions, each of them a decision:
 *
 * - **Books do not count.** `contracts.md` §1.5 makes a shelved grimoire exactly
 *   as magical as a shelf. A species whose only claim on a cell is a book that
 *   anybody can read has not staffed it, and counting library instances would
 *   make every species' occupancy identical the moment one library existed.
 * - **Dead mages do not count.** A roster that has died still has knowledge
 *   instances until decay removes them, and reporting those would make the
 *   metric lag the collapse it exists to detect.
 * - **Mastery is not gated.** Unlike versatility's `teachable` gate, an instance
 *   at any mastery counts. Occupancy is "is this species present in this cell",
 *   and adding a threshold here would silently make it a second, weaker copy of
 *   the capability measurement rather than the observation that checks it.
 *
 * ## The ruleset denominator
 *
 * `enabledCells` is whatever `permits()` accepts for the ruleset passed in,
 * never a hardcoded twelve. A god that has forbidden a form has fewer, and an
 * occupancy fraction read against the wrong denominator is wrong while still
 * looking plausible.
 *
 * ## It asserts nothing about balance
 *
 * All six shipped species carry `"tuningStatus": "untuned"`. Nothing here says
 * what the spread across species ought to be; the collector reports the spread
 * and names the tuning status so a reader cannot mistake a measurement for a
 * target.
 */

import type { ContentRegistry } from '@mm/content';
import type { SimState } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  collectRecords,
  permits,
} from '@mm/state';
import type { MagicGrid } from '@mm/rules-magic';
import type { SpeciesCellOccupancy, SpeciesCellOccupancySample } from '@mm/mc-harness';

/**
 * Realised per-species grid occupancy, read off one world state.
 *
 * @param state - The universe at the moment of the reading. Normally run end.
 * @param registry - Loaded content, for the species list and the cell count.
 * @param grid - Resolves a node id to its cell id. The one place that mapping
 * lives, so this cannot become a second copy of it.
 * @param ruleset - The universe's permitted axes and edicts, for the
 * `enabledCells` denominator.
 */
export function speciesCellOccupancy(
  state: SimState,
  registry: ContentRegistry,
  grid: MagicGrid,
  ruleset: Ruleset,
): SpeciesCellOccupancySample {
  // Living mages, by handle, so the instance walk below can answer "whose mind
  // is this, and is she alive" without a second pass over the mage component.
  const speciesOfLivingMage = new Map<number, number>();
  const livingBySpecies = new Map<number, number>();
  for (const entry of collectRecords(state, MAGE)) {
    if (entry.row.alive !== 1) continue;
    speciesOfLivingMage.set(entry.handle, entry.row.speciesId);
    livingBySpecies.set(entry.row.speciesId, (livingBySpecies.get(entry.row.speciesId) ?? 0) + 1);
  }

  const cellsBySpecies = new Map<number, Set<number>>();
  const nodesBySpecies = new Map<number, Set<number>>();
  for (const entry of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (entry.row.locationKind !== LOCATION_KIND.mind) continue;
    const speciesId = speciesOfLivingMage.get(entry.row.locationId);
    if (speciesId === undefined) continue;
    // A node the grid does not know is a content mismatch rather than a cell
    // this species failed to occupy, so it is skipped rather than counted as
    // either. `permits()` would throw on the null cell id it would produce.
    if (!grid.hasNode(entry.row.nodeId)) continue;

    let cells = cellsBySpecies.get(speciesId);
    if (cells === undefined) {
      cells = new Set<number>();
      cellsBySpecies.set(speciesId, cells);
    }
    cells.add(grid.cellOf(entry.row.nodeId));

    let nodes = nodesBySpecies.get(speciesId);
    if (nodes === undefined) {
      nodes = new Set<number>();
      nodesBySpecies.set(speciesId, nodes);
    }
    nodes.add(entry.row.nodeId);
  }

  let enabledCells = 0;
  const permitted = new Set<number>();
  for (const entry of registry.cells) {
    if (!permits(ruleset, entry.contentId)) continue;
    enabledCells += 1;
    permitted.add(entry.contentId);
  }

  const species: SpeciesCellOccupancy[] = registry.species.map((entry) => {
    const cells = cellsBySpecies.get(entry.contentId) ?? new Set<number>();
    let occupiedEnabled = 0;
    for (const cellId of cells) if (permitted.has(cellId)) occupiedEnabled += 1;
    return {
      speciesId: entry.record.id,
      occupiedCells: cells.size,
      occupiedEnabledCells: occupiedEnabled,
      livingMages: livingBySpecies.get(entry.contentId) ?? 0,
      nodesHeld: (nodesBySpecies.get(entry.contentId) ?? new Set<number>()).size,
      // Ascending, never set-insertion order: which cells a species holds must
      // not depend on the order its mages happened to be created in.
      occupiedCellIds: Object.freeze([...cells].sort((a, b) => a - b)),
    };
  });

  return {
    gridCells: registry.cells.length,
    enabledCells,
    worldTick: state.clock.worldTick,
    species,
  };
}
