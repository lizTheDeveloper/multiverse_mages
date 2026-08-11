/*
 * Multiverse Mages — merging audition passes into stored take selections.
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
 * Pure leaf module for the take-audition harness (sound-design §9.6). It must
 * import nothing: `tools/audition/index.html` loads the built output of this
 * file directly in a browser, so even a single `node:` import would break the
 * page. Build with `npm run typecheck` before opening the page — `dist/` is
 * gitignored, and the page imports the built `.js`, not this source file.
 */

/** Stored selections: asset id to the chosen take's file name. */
export type Selections = Readonly<Record<string, string>>;

/**
 * One audition pass. An explicit `null` un-chooses an asset — the audition
 * pass is iterative, and a take that sounded fine in isolation often does not
 * survive hearing it next to its neighbours.
 */
export type SelectionPass = Readonly<Record<string, string | null>>;

/** Coverage of a generation plan by the stored selections. */
export interface SelectionCoverage {
  readonly total: number;
  readonly chosen: number;
  readonly missing: readonly string[];
}

/** Strips the take suffix from a request id, leaving the asset id. */
export function assetIdOf(requestId: string): string {
  return requestId.replace(/-(?:v\d+-)?take\d+$/u, '');
}

/**
 * Merges an audition pass into the stored selections.
 *
 * An explicit `null` un-chooses: the audition pass is iterative, and a take
 * that sounded fine in isolation often does not survive hearing it next to
 * its neighbours.
 */
export function mergeSelections(existing: Selections, incoming: SelectionPass): Record<string, string> {
  const merged: Record<string, string> = { ...existing };
  for (const [assetId, take] of Object.entries(incoming)) {
    if (take === null) delete merged[assetId];
    else merged[assetId] = take;
  }
  return merged;
}

/** Reports how much of a generation plan has been auditioned. */
export function selectionCoverage(
  requests: readonly { readonly id: string }[],
  selections: Selections,
): SelectionCoverage {
  const assetIds = [...new Set(requests.map((request) => assetIdOf(request.id)))];
  const missing = assetIds.filter((assetId) => !(assetId in selections));
  return { total: assetIds.length, chosen: assetIds.length - missing.length, missing };
}
