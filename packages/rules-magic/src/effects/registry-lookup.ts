/*
 * Multiverse Mages — resolving registry records without re-deriving them.
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

import type { ContentRegistry, NodeRecord, PrimitiveRecord } from '@mm/content';

/**
 * Primitive records by id, memoized per registry.
 *
 * `ContentRegistry` publishes accessors for cells and nodes but not for
 * primitives, and every gather and every stack needs one. The memo is keyed on
 * the registry object in a `WeakMap`: a registry is immutable loaded content,
 * so the derived index is a pure function of it and cannot go stale, and
 * nothing here is state — two processes holding the same content compute the
 * same map, and a process holding two content sets keeps them apart.
 *
 * This is not the caching `magic-grid` forbids. That rule is about *legality*,
 * which depends on edicts that change during a run; this is a lookup table over
 * data that cannot change without a new registry.
 */
const primitiveIndexes = new WeakMap<ContentRegistry, ReadonlyMap<string, PrimitiveRecord>>();

export function primitiveIndex(registry: ContentRegistry): ReadonlyMap<string, PrimitiveRecord> {
  const memoized = primitiveIndexes.get(registry);
  if (memoized !== undefined) return memoized;

  const index = new Map<string, PrimitiveRecord>();
  for (const entry of registry.primitives) {
    index.set(entry.record.id, entry.record);
  }
  primitiveIndexes.set(registry, index);
  return index;
}

/**
 * The registry record for a primitive an effect names.
 *
 * @throws RangeError naming the primitive. The loader rejects an effect naming
 * an unknown primitive, so reaching this means the registry and the content
 * disagree — and the alternative to throwing is an effect that silently
 * contributes nothing, which is indistinguishable from a balance decision.
 */
export function requirePrimitive(registry: ContentRegistry, primitiveId: string): PrimitiveRecord {
  const record = primitiveIndex(registry).get(primitiveId);
  if (record === undefined) {
    throw new RangeError(
      `no primitive "${primitiveId}" in the registry. contracts.md §3 is the normative list and ` +
        'primitive.json must match it; an effect may not name anything outside it.',
    );
  }
  return record;
}

/**
 * The node record behind an interned node id.
 *
 * @throws RangeError naming the id, for the same reason as above: a missing
 * node is a corrupted instance, not a node with no effects.
 */
export function requireNode(registry: ContentRegistry, nodeId: number): NodeRecord {
  const record = registry.node(nodeId);
  if (record === undefined) {
    throw new RangeError(
      `no node interned at ${String(nodeId)}. A knowledge instance names a node that this ` +
        'content set does not contain — check contentRevision before checking this code.',
    );
  }
  return record;
}
