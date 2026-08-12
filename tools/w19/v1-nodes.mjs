/*
 * Multiverse Mages — W19: the v1 reachable node set, derived from content.
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
 * "Fifty-one nodes in twelve enabled cells" is quoted everywhere in this
 * campaign and asserted nowhere. It is derived here instead: `v1CellIds()` off
 * the shipped grid, then every node whose `cellOf` lands in one of them. Node id
 * 0 is §0's reserved null and is not a node, so the walk starts at 1.
 *
 * Prints a JSON array of ids to stdout.
 */

import { referenceContent } from '../../packages/scenario/dist/index.js';

const content = referenceContent();
const cells = content.deps.cells;
const v1 = new Set(cells.v1CellIds());
const ids = [];
for (let nodeId = 1; nodeId <= content.deps.catalog.nodeCount; nodeId += 1) {
  let cellId;
  try {
    cellId = cells.cellOf(nodeId);
  } catch {
    continue;
  }
  if (v1.has(cellId)) ids.push(nodeId);
}
process.stdout.write(`${JSON.stringify(ids)}\n`);
