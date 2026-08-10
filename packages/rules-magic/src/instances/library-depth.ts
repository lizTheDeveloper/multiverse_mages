/*
 * Multiverse Mages — library depth: published here, applied elsewhere.
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
 * How much a library is worth as a research instrument — computed here,
 * consumed by `mages-and-species`, and **applied by nothing in this package.**
 *
 * ## Why the accessor exists here and the application does not
 *
 * `vision.md` §6a's knowledge-as-capital loop runs on this number: a deeper
 * library trains better mages, who write more books, which deepen the library.
 * `contracts.md` §5 forbids `rules-magic` from importing `rules-world`, and
 * computing university throughput here would require knowing about staff
 * cohorts, capacity, and build progress — the import cycle §5 exists to
 * prevent. So the two halves of a compounding loop sit in two packages, which
 * also lets the balance harness ablate one without recompiling the other.
 *
 * Using this value inside `rules-magic` would do something worse than violate a
 * boundary: it would pre-decide `capitalSnowball`. That metric asks whether the
 * capital loop runs away, and an answer is only meaningful if the loop has
 * exactly one closing edge, in one place, tunable without touching this file.
 * A test asserts that no other module here so much as mentions it.
 *
 * ## Tier weighting is linear, and that is a placeholder
 *
 * A shelf of tier-1 primers is not a research university, so depth is weighted
 * by tier rather than counted. Whether the weighting should be linear or
 * superlinear is one of `knowledge-model`'s open questions, and it is a prime
 * suspect for `capitalSnowball` — linear is the conservative choice, and it is
 * a tuning constant first measured at 0.5.0, not a claim.
 *
 * Dormant stored knowledge is worth exactly nothing. A library full of
 * interdicted books still stands, still holds every instance, and reports zero
 * depth: forbidding a cell costs a university its research advantage
 * immediately, while costing it no book at all.
 */

import type { Fp } from '@mm/content';
import type { Handle, Ruleset } from '@mm/state';
import { LOCATION_KIND, permits } from '@mm/state';
import { fromInt } from '@mm/sim-core';

import type { CellResolver, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import type { KnowledgeSubsystem } from './subsystem.js';

export interface LibraryDepthInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /** The library. Opaque; never dereferenced into a §1.4 university. */
  readonly library: Handle;
}

/**
 * The tier-weighted depth of one library's shelves, in fixed point.
 *
 * A count over `locationKind == 3` — which is only cheap because a written copy
 * lives at exactly one location, rewritten on shelving rather than duplicated.
 * Under the double-counted reading of `contracts.md` §1.5 this would be a join
 * through every grimoire's holder, in the hot path of the capital loop.
 */
export function libraryDepth(inputs: LibraryDepthInputs): Fp {
  let depth = 0;
  for (const instance of inputs.knowledge.instancesAt(LOCATION_KIND.library, inputs.library)) {
    const nodeId = inputs.knowledge.read(instance).nodeId;
    if (!permits(inputs.ruleset, inputs.cells.cellOf(nodeId))) continue;
    depth += fromInt(requireNode(inputs.catalog, nodeId).tier);
  }
  return depth;
}
