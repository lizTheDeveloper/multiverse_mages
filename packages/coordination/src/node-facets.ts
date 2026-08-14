/*
 * Multiverse Mages — the three things about a node that target selection reads
 * and the knowledge subsystem does not carry.
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
 * `rules-magic`'s `KnowledgeNode` is a deliberately narrow projection: it says
 * so in its own docblock, and it *"keeps the effects list out of reach"* on
 * purpose so that effect application cannot start happening inside the research
 * loop. That decision is still right, and it is why this index exists beside it
 * rather than as three more fields on it.
 *
 * What target selection needs is different from what an effect needs: **which
 * cell and form a node sits in**, so a species' authored `affinities` can be
 * consulted, and **which effect primitives it declares**, so a standing role can
 * have an opinion about what the node is for. Neither is a magnitude, and
 * nothing here can apply anything. It is a read-only address book, built once
 * from the registry at the composition root, exactly as `contentCatalogue` is
 * built for the observation layer.
 *
 * Effect *magnitudes* are deliberately dropped. A role's preference is over
 * kinds of magic — vision §7's *"researcher, warden, professor, raider"* — and a
 * selector that read magnitudes would be a second, quieter copy of the effect
 * pipeline, disagreeing with the first the moment stacking changed.
 */

import type { ContentId, ContentRegistry } from '@mm/content';

/** What one node is, for the purposes of deciding whether to want it. */
export interface NodeFacets {
  readonly cellId: ContentId;
  readonly formId: ContentId;
  /** Interned ids of the node's authored effect primitives, ascending. */
  readonly primitives: readonly ContentId[];
}

/** The facets of a node the content set does not declare: no cell, no opinion. */
export const UNKNOWN_NODE_FACETS: NodeFacets = Object.freeze({
  cellId: 0,
  formId: 0,
  primitives: Object.freeze([]) as readonly ContentId[],
});

/** Resolves a node id to its facets. Total: an unknown id answers "no opinion". */
export type NodeFacetResolver = (nodeId: ContentId) => NodeFacets;

/**
 * Builds the index once from a loaded registry.
 *
 * Primitive ids are sorted ascending so that the role term's summation order is
 * a function of the content set rather than of author-facing array order in
 * `node.json` — addition is commutative in integers, but a list whose order
 * depends on how somebody typed a file is one reorder away from being read by
 * something where it is not.
 */
export function nodeFacetsFrom(registry: ContentRegistry): NodeFacetResolver {
  const byNode = new Map<ContentId, NodeFacets>();
  for (const entry of registry.nodes) {
    const cellId = registry.intern('cell', entry.record.cell);
    const cell = registry.cell(cellId);
    const formId = cell === undefined ? 0 : registry.intern('form', cell.form);
    const primitives = entry.record.effects
      .map((effect) => registry.intern('primitive', effect.primitive))
      .filter((primitiveId) => primitiveId !== 0)
      .sort((a, b) => a - b);
    byNode.set(entry.contentId, {
      cellId,
      formId,
      primitives: Object.freeze(primitives),
    });
  }
  return (nodeId) => byNode.get(nodeId) ?? UNKNOWN_NODE_FACETS;
}
