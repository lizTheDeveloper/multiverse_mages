/*
 * Multiverse Mages — a root is tier 1 and a tier-1 node is a root.
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
 * ## Why one equivalence gets a test of its own
 *
 * Two packages read *"the god may found this"* from two different fields, and
 * neither can read the other's:
 *
 * - `coordination`'s `grantPlan` asks **`prerequisites.length === 0`**. It has
 *   the node graph, and the prerequisite list is the condition that actually
 *   matters: a grant of a node with prerequisites is a direct purchase of depth
 *   and takes the §6a knowledge-as-capital loop with it.
 * - `agent-api`'s `foundingKnowledgeCandidates` asks **`tier === 1`**. It has
 *   only `CatalogueNode`, which carries no prerequisite count, because §5 keeps
 *   `@mm/content` — and therefore `node:fs` — out of a package that must run in
 *   a browser.
 *
 * The mask and the rules therefore agree on action 8 **only while the two
 * fields agree**, and `mask.ts` already states that dependency in prose: *"the
 * list is already restricted to prerequisite-free roots — every one of which is
 * tier 1 in any content set where a root is a root."*
 *
 * That sentence is true of the shipped set and is an assumption, not a
 * guarantee. A single authored node at tier 2 with no prerequisites, or at tier
 * 1 with one, reopens exactly the disagreement `w90/mask-sync` closed — and it
 * would reopen it silently, as a handful of refused grants inside a sweep
 * nobody reads action by action. So the assumption is pinned here, where a
 * content edit that breaks it fails immediately and by name.
 *
 * Projecting `prerequisites` onto `CatalogueNode` instead was considered. It is
 * the better fix and it is a wider change: the catalogue is built by four
 * callers, crosses to the RL bridge as a fixed layout, and every fixture that
 * constructs one by hand would have to grow a field. This test buys the same
 * safety for one file, and states the trade so the next reader can take the
 * other side of it deliberately.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry } from '@mm/content';

const registry: ContentRegistry = loadContent(shippedContentSource());

describe('tier 1 and prerequisite-free name the same nodes', () => {
  it('gives every tier-1 node an empty prerequisite list', () => {
    const withPrerequisites = registry.nodes
      .filter(({ record }) => record.tier === 1 && record.prerequisites.length > 0)
      .map(({ record }) => record.id);
    expect(withPrerequisites).toEqual([]);
  });

  it('puts every prerequisite-free node at tier 1', () => {
    const deepRoots = registry.nodes
      .filter(({ record }) => record.prerequisites.length === 0 && record.tier !== 1)
      .map(({ record }) => `${record.id} (tier ${String(record.tier)})`);
    expect(deepRoots).toEqual([]);
  });

  it('finds a root in every cell, so the equivalence is not vacuous', () => {
    // A pair of empty sets would satisfy both assertions above. This is the
    // third leg: the shipped grid really does hang a root off each of its
    // seventy cells, so the equivalence is a statement about 70 nodes and not
    // about none.
    const roots = registry.nodes.filter(({ record }) => record.tier === 1);
    expect(roots).toHaveLength(registry.cells.length);
    expect(new Set(roots.map(({ record }) => record.cell)).size).toBe(registry.cells.length);
  });
});
