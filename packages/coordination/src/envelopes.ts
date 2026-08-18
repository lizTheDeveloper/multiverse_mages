/*
 * Multiverse Mages — resolving a node to its technique's envelope.
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
 * The one hop from a node to `sound-design.md` §4.1's shape.
 *
 * A node knows its cell; a cell is a `(techniqueBit, formBit)` pair; a technique
 * carries an envelope. Three lookups, and the only reason they need a module is
 * that the middle one is arithmetic `@mm/state` owns (`techniqueBitOf`) and the
 * outer two are content the acquisition path may not import — the effort
 * gateway takes a resolver rather than a registry for the same reason it takes
 * a `CellResolver` rather than a `MagicGrid`.
 *
 * Built once at the composition root, because a per-tick rebuild would put a
 * five-entry map allocation inside the work phase for no gain.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { EffortEnvelope } from '@mm/primitives';
import type { CellResolver } from '@mm/rules-magic';
import { techniqueBitOf } from '@mm/state';

/** A node's technique envelope, for the acquisition paths that shape effort by it. */
export interface EnvelopeResolver {
  /**
   * The envelope of the technique the node's cell sits on, or `undefined` for a
   * node this content set cannot place.
   *
   * `undefined` is the flat curve everywhere it is consumed, which is also
   * Rego's shape — so an unresolvable node behaves as the tree did before
   * envelopes existed rather than being silently given somebody else's curve.
   */
  envelopeOf(nodeId: ContentId): EffortEnvelope | undefined;
}

/** Builds the resolver from a loaded registry and the grid's node-to-cell map. */
export function envelopeResolver(
  registry: ContentRegistry,
  cells: CellResolver,
): EnvelopeResolver {
  const byBit = new Map<number, EffortEnvelope>();
  for (const entry of registry.techniques) {
    byBit.set(entry.record.bit, entry.record.envelope);
  }
  return {
    envelopeOf(nodeId: ContentId): EffortEnvelope | undefined {
      return byBit.get(techniqueBitOf(cells.cellOf(nodeId)));
    },
  };
}
