/*
 * Multiverse Mages — the §6a loop's closing edge, wired into the world tick.
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
 * ## The two halves of a compounding loop, joined here because §5 says they may
 * not be joined anywhere else
 *
 * `vision.md` §6a:
 *
 * > **Knowledge as capital** — a university's output scales with the depth of
 * > its library. […] A deep library trains better mages, who research faster,
 * > who deepen the library.
 *
 * Both halves shipped with `mages-and-species` and neither reached the other.
 * `rules-world/universities/capital.ts` computes what a library is worth;
 * `rules-magic/instances/library-depth.ts` says outright that *"the two halves
 * of a compounding loop sit in two packages"* and that applying the value
 * *"would pre-decide `capitalSnowball`"*. `contracts.md` §5 rule 3 forbids
 * either package from importing the other. So the join is this file's, and it
 * is the coordinating layer's whole reason for existing.
 *
 * What was measured before it: `capitalRateMultiplier`, `contributionFor`,
 * `applyLibraryUpkeep` and `emitCapital` had zero callers outside their own
 * unit tests, `world-step.ts` passed `libraryUpkeep: 0` to the consumption
 * order, and a 96-run sweep put `archivist` and `passive-control` on the same
 * 51.000 nodes known with a pooled standard error of zero.
 *
 * ## Depth is counted once a tick, for every library at once
 *
 * `libraryDepths` is one pass over the instance component rather than one pass
 * per library, because the world loop asks about every library every tick and
 * the per-library reading is itself a full scan. The index is built before the
 * work phase and read by it; nothing rebuilds it mid-tick, which is deliberate
 * — a mage who finishes a book in the work phase does not accelerate her own
 * next month with it, and two mages visited in different orders see the same
 * shelves.
 *
 * ## The ruleset gate lives here and only here
 *
 * `rules-magic`'s `library-depth.ts` states the rule this file honours:
 *
 * > Dormant stored knowledge is worth exactly nothing. A library full of
 * > interdicted books still stands, still holds every instance, and reports
 * > zero depth: forbidding a cell costs a university its research advantage
 * > immediately, while costing it no book at all.
 *
 * `permits` is `@mm/state`'s and the node-to-cell addressing is
 * `@mm/rules-magic`'s, and this layer holds both. It hands `libraryDepths` a
 * predicate; `rules-world` stays ruleset-agnostic and still charges upkeep on
 * every shelf, which is what makes an interdiction cost the benefit and none of
 * the cost.
 */

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import type { Handle, Ruleset } from '@mm/state';
import { UNIVERSITY, collectRecords, permits } from '@mm/state';
import type { CellResolver, NodeCatalog } from '@mm/rules-magic';
import type { CapitalEmission, LibraryDepth } from '@mm/rules-world';
import { emitCapital, emptyLibraryDepth, libraryDepths } from '@mm/rules-world';

/** `fp(1.0)` — `buildProgress` at which a university is complete (`contracts.md` §1.4). */
const COMPLETE = 1024;

/** What {@link libraryCapital} needs that is content rather than state. */
export interface LibraryCapitalDeps {
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /**
   * What the country a university stands in does to its library's upkeep, `fp`
   * (`contracts.md` §2.7, `rules-world`'s `universities/siting.ts`).
   *
   * A callback rather than a resolved table because the site is *state* — a
   * university can be re-sited, and colonization will re-site several at once —
   * while `catalog` and `cells` above are content. Neutral for an unsited
   * university, which is what a world-schema revision-4 save restores as.
   */
  readonly siteUpkeepMultiplier: (university: Handle) => Fixed;
}

/** One tick's reading of every library, keyed by the university that owns it. */
export interface LibraryCapital {
  /**
   * The shelves behind a mage's affiliation, or `undefined` for a mage with
   * none — and for one affiliated with a university that is still being built.
   *
   * Under construction reads as absent rather than as empty because the
   * `universities` spec makes it a requirement rather than a rounding: a
   * university *"MUST NOT admit students, host staff, or contribute library
   * capital until `buildProgress` reaches `fp(1024)`"*.
   */
  depthFor(university: Handle): LibraryDepth | undefined;
  /** Every completed university's library, ascending by library handle. */
  readonly libraries: readonly {
    readonly handle: EntityHandle;
    readonly depth: LibraryDepth;
    /** The upkeep multiplier of the country the owning university stands in, `fp`. */
    readonly siteMultiplier: Fixed;
  }[];
  /**
   * The §7 `capitalSnowball` emission, at one reference depth ceiling.
   *
   * The spec requires *"relevant library depth by tier, the effective capital
   * contribution after table lookup and clamping, and the clamp count"* per
   * university per tick, and requires it to be enough to compute the metric
   * *"with no additional instrumentation added to the simulation"*.
   */
  emissions(depthCeiling: number, clampCount: number): readonly CapitalEmission[];
}

/** Reads every completed university's library once, for one world tick. */
export function libraryCapital(state: SimState, deps: LibraryCapitalDeps): LibraryCapital {
  const depths = libraryDepths(state, (nodeId) => deps.catalog.node(nodeId)?.tier ?? 1, {
    counts: (nodeId) => permits(deps.ruleset, deps.cells.cellOf(nodeId)),
  });

  // University handle to its library's depth. Only completed universities, and
  // only ones that keep a library at all: `libraryId` of `0` is §0's absent
  // reference, and a book shelved into it would sit at a location nothing can
  // count and nothing can burn.
  const byUniversity = new Map<
    Handle,
    { library: EntityHandle; depth: LibraryDepth; siteMultiplier: Fixed }
  >();
  for (const { handle, row } of collectRecords(state, UNIVERSITY)) {
    if (row.buildProgress < COMPLETE || row.libraryId === 0) continue;
    // An empty shelf is present at zero rather than absent. `capitalSnowball` is
    // a Gini coefficient over library depth *across universities*, and a
    // universe of one deep library and nine bare ones is the most unequal
    // arrangement there is — dropping the nine would report it as perfectly
    // equal, which is the direction a snowball guard must never lie in.
    byUniversity.set(handle, {
      library: row.libraryId as EntityHandle,
      depth: depths.get(row.libraryId as EntityHandle) ?? emptyLibraryDepth(),
      // Read here, with the university in hand. A library carries no back-link
      // to its owner on purpose (`components.ts` on `LIBRARY`), so this is the
      // one place in the tick where "which country is this shelf in" is
      // answerable without inventing the inverse edge §1.4 refuses.
      siteMultiplier: deps.siteUpkeepMultiplier(handle),
    });
  }

  // Ascending library handle, because `applyLibraryUpkeep` requires that order
  // by name: handles are stable identities, and paying in the order libraries
  // happen to appear in an iteration would make which library goes short depend
  // on the history that reached the state rather than on the state.
  const libraries = [...byUniversity.values()]
    .map((entry) => ({
      handle: entry.library,
      depth: entry.depth,
      siteMultiplier: entry.siteMultiplier,
    }))
    .sort((a, b) => a.handle - b.handle);

  return {
    depthFor: (university) => byUniversity.get(university)?.depth,
    libraries,
    emissions: (depthCeiling, clampCount) =>
      [...byUniversity.entries()]
        .sort(([left], [right]) => left - right)
        .map(([university, entry]) =>
          emitCapital(university as EntityHandle, entry.depth, depthCeiling, clampCount),
        ),
  };
}
