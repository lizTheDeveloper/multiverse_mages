/*
 * Multiverse Mages — the tradition lookup, built from loaded content.
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

import type { ContentRegistry } from '@mm/content';

import type { TraditionTable } from './hook-for.js';
import { traditionTable } from './hook-for.js';

/**
 * Builds the id-to-record table {@link hookFor} arbitrates over.
 *
 * `@mm/content` is imported for **types only** everywhere else in the rules
 * path, because its public surface re-exports a loader that reads the
 * filesystem and a value import would make an Electron renderer Node-bound.
 * This module holds the one value-free exception: it takes an already-loaded
 * registry as a parameter and never reaches for one, so it imports the
 * `ContentRegistry` *type* and nothing at runtime.
 *
 * Built once per content set rather than per lookup. Two universes may only
 * interact when their `contentRevision` values match (`contracts.md` §0), so
 * one table serves every participant in a raid, and rebuilding it per call
 * would put a `Map` allocation inside the engagement loop for no benefit.
 */
export function traditionTableFrom(registry: ContentRegistry): TraditionTable {
  return traditionTable(registry.traditions.map(({ contentId, record }) => [contentId, record]));
}
