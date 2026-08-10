/*
 * Multiverse Mages — deterministic string-to-integer content interning.
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
 * Content authors work with `"rego-corpus"`; the simulation works with `uint16`
 * (`docs/design/contracts.md` §0). Interning happens once, at load.
 *
 * **Determinism across processes is the whole requirement**, and it is met by
 * never letting insertion order, hash-map iteration order, or file order reach
 * the assignment:
 *
 * - Techniques and forms are interned from their authored `bit`, which
 *   `contracts.md` §2.1 already pins as dense, stable, and serialized into
 *   snapshots. `id = bit + 1`, so `0` stays the reserved null.
 * - A cell is interned from the grid position its axes give it:
 *   `techniqueBit × 14 + formBit + 1`. This is a bijection onto `1..70` exactly
 *   when the bits are dense and unique, which the loader asserts, and it makes
 *   `cellAt(techniqueId, formId)` a subtraction rather than a lookup.
 * - Everything else — nodes, species, traditions, primitives — is interned from
 *   a code-unit sort of its string id. `<` is used rather than `localeCompare`
 *   because collation varies with the ICU build, which is precisely the class of
 *   cross-machine nondeterminism this project bans.
 *
 * **Sorted interning renumbers when content changes, and that is safe.** Adding
 * a node shifts every later node's integer, but any snapshot written under the
 * old content also carries the old `contentRevision`, and §0 forbids two
 * universes with unequal revisions from interacting at all. Renumbering is
 * therefore never observable across a compatibility boundary — while the
 * alternative, first-seen-order interning, would make a reordered content file a
 * silent, revision-invisible remapping.
 */

import type { ContentId } from './types.js';

/** Forms per technique, fixing the width of the cell-id grid. */
export const FORM_COUNT = 14;

/** Techniques, fixing the height of the cell-id grid. */
export const TECHNIQUE_COUNT = 5;

/** Cells in the full grid. */
export const CELL_COUNT = TECHNIQUE_COUNT * FORM_COUNT;

/** Interns from a bit position: `bit + 1`, keeping `0` reserved. */
export function internFromBit(bit: number): ContentId {
  return bit + 1;
}

/** Interns a cell from its axes' bit positions. Total over the full grid. */
export function internCell(techniqueBit: number, formBit: number): ContentId {
  return techniqueBit * FORM_COUNT + formBit + 1;
}

/** Recovers the axis bits from an interned cell id. */
export function cellAxes(cellId: ContentId): { techniqueBit: number; formBit: number } {
  const zeroBased = cellId - 1;
  return {
    techniqueBit: Math.floor(zeroBased / FORM_COUNT),
    formBit: zeroBased % FORM_COUNT,
  };
}

/**
 * Assigns `1..n` to ids in code-unit order.
 *
 * Duplicates are not this function's problem — the loader reports them as
 * `duplicate-id` before interning runs — but they are handled predictably here
 * anyway: a repeated id simply maps to a single integer.
 */
export function internSorted(ids: readonly string[]): ReadonlyMap<string, ContentId> {
  const sorted = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const table = new Map<string, ContentId>();
  for (let index = 0; index < sorted.length; index += 1) {
    const id = sorted[index];
    if (id !== undefined) table.set(id, index + 1);
  }
  return table;
}
