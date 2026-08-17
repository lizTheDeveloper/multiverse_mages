/*
 * Multiverse Mages — the legality index the frontier scan walks instead of an
 * id range.
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
 * `cellOf`, inverted once per content load: which nodes live in which cell.
 *
 * ## Why this exists
 *
 * `researchFrontier` used to bound its work with a constant over interned node
 * id — walk `1..min(nodeCount, 256)` and stop. That is not a bound on work, it
 * is a bound on *reachability*: the shipped catalog holds 300 nodes, so 44 of
 * them were invisible to every mage at every tick for the life of the universe,
 * including the whole `rego` technique and four of the twelve v1 cells. The
 * commit that diagnosed it is `77b9117`, and
 * `test/unit/frontier-scan-window.test.ts` carries the record.
 *
 * A bigger constant would be the same defect deferred. The scan needs a bound
 * that *cannot* delete content, and the ruleset already is one: `permits()`
 * narrows the seventy cells to whatever the god has enabled. That used to be a
 * large narrowing — the twelve-cell v1 rectangle turned 300 nodes into 51 before
 * anything else ran — and since all seventy cells were enabled it narrows nothing
 * by default, because the reference ruleset is derived from the enabled set. The
 * bound is unaffected either way, which is the property: it is a *rule*, and a
 * god who forbids a cell still shrinks it. Walking the
 * permitted cells' nodes is `O(legal nodes)` and flat in total catalog size —
 * ten thousand nodes authored into cells nobody permitted cost nothing, which
 * is what the old constant's docstring claimed and did not deliver.
 *
 * ## Content-lifetime, not phase-lifetime
 *
 * Nothing here reads world state. A cell's node list is a function of the
 * content set alone, so one index serves every universe running against a
 * `contentRevision` and every phase of every tick — which is the whole point,
 * because rebuilding it per phase would put an `O(catalog)` pass back into the
 * tick it was removed from. The *ruleset* half is the part that changes, and
 * that is intersected at the gateway, which is a view of one phase and already
 * holds the ruleset.
 *
 * ## Why it is built here rather than taken from `MagicGrid`
 *
 * `MagicGrid.cell(cellId).nodeIds` is exactly this list, and `magic-grid` is the
 * authority on node-to-cell addressing. But the gateway is handed a
 * {@link CellResolver} — `{ cellOf }`, structural, one method — precisely so
 * that a caller can wire a fixture without a grid, and widening that port to
 * demand the inverse map would break every such caller for the sake of a
 * derivation that takes one pass over the catalog. So the index is *derived from
 * the port*, which means it agrees with `cellOf` by construction; a second
 * authority on which cell a node sits in is the thing `grid.ts` refuses to have.
 */

import type { ContentId } from '@mm/content';
import type { CellResolver, NodeCatalog } from '@mm/rules-magic';

/** Nodes grouped by the cell content authored them into. Immutable. */
export interface CellNodeIndex {
  /**
   * Node ids in a cell, ascending. Empty for a cell content left unpopulated,
   * and empty — never a throw — for an id that names no cell, because the
   * caller is iterating cells to *find* work and a hole in the grid is not an
   * error there.
   */
  nodesIn(cellId: number): readonly ContentId[];
  /** Cells holding at least one node, ascending. Nothing else is worth walking. */
  populatedCellIds(): readonly number[];
}

/** Shared empty list, so an unpopulated cell allocates nothing. */
const NO_NODES: readonly ContentId[] = Object.freeze([]);

/**
 * Inverts a {@link CellResolver} over a catalog.
 *
 * One pass over `1..nodeCount`, asking the resolver where each node lives. Ids
 * the catalog does not declare are skipped rather than resolved — interning is
 * dense in practice, but a registry rebuilt from a partial content set would
 * otherwise make this throw for a hole it has no opinion about.
 *
 * Node ids come out ascending within a cell because they go in ascending, which
 * matters: the frontier's order is `contracts.md`-visible behaviour, and an
 * order that depended on `Map` insertion would depend on how this loop happens
 * to be written.
 */
export function cellNodeIndex(catalog: NodeCatalog, cells: CellResolver): CellNodeIndex {
  const byCell = new Map<number, ContentId[]>();
  for (let nodeId = 1; nodeId <= catalog.nodeCount; nodeId += 1) {
    if (catalog.node(nodeId) === undefined) continue;
    const cellId = cells.cellOf(nodeId);
    const list = byCell.get(cellId);
    if (list === undefined) byCell.set(cellId, [nodeId]);
    else list.push(nodeId);
  }

  const populated = Object.freeze([...byCell.keys()].sort((a, b) => a - b));
  for (const cellId of populated) Object.freeze(byCell.get(cellId));

  return {
    nodesIn: (cellId) => byCell.get(cellId) ?? NO_NODES,
    populatedCellIds: () => populated,
  };
}
