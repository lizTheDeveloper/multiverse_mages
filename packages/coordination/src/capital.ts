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

import type { EntityHandle, SimState } from '@mm/sim-core';
import { floorDiv, FP_ONE } from '@mm/sim-core';
import type { Handle, Ruleset } from '@mm/state';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  collectRecords,
  componentOf,
  permits,
} from '@mm/state';
import type { CellResolver, NodeCatalog, PalaceContribution, StorePolicy } from '@mm/rules-magic';
import { MASTERY_ACTIVATION_THRESHOLD, palaceLibraryDepth } from '@mm/rules-magic';
import type { CapitalEmission, LibraryDepth } from '@mm/rules-world';
import { TIER_COUNT, emitCapital, emptyLibraryDepth, libraryDepths } from '@mm/rules-world';

/** `fp(1.0)` — `buildProgress` at which a university is complete (`contracts.md` §1.4). */
const COMPLETE = 1024;

/** What {@link libraryCapital} needs that is content rather than state. */
export interface LibraryCapitalDeps {
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /**
   * The universe's `store` hook, for the depth a memory palace contributes.
   *
   * Optional, and absent means shelves only — which is what every caller
   * written before this did, and what a `standard` tradition's answer is anyway
   * because its `libraryDepthCoefficient` is zero.
   *
   * It matters for exactly one tradition and it matters completely.
   * `store: palace` creates no grimoire and no library instance at all, so
   * before this an Art of Memory universe had **zero library depth by
   * construction** and vision §6a's knowledge-as-capital loop was switched off
   * for one of the three v1 traditions — not balanced differently, switched off.
   * `palaceLibraryDepth` was written for precisely this and had no production
   * caller; the coefficient it reads is authored at `fp(768)` in
   * `tradition.json` and turned nothing.
   */
  readonly store?: StorePolicy | undefined;
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
  readonly libraries: readonly { readonly handle: EntityHandle; readonly depth: LibraryDepth }[];
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

  const palaces = palaceDepthByUniversity(state, deps);

  // University handle to its library's depth. Only completed universities, and
  // only ones that keep a library at all: `libraryId` of `0` is §0's absent
  // reference, and a book shelved into it would sit at a location nothing can
  // count and nothing can burn.
  const byUniversity = new Map<Handle, { library: EntityHandle; depth: LibraryDepth }>();
  for (const { handle, row } of collectRecords(state, UNIVERSITY)) {
    if (row.buildProgress < COMPLETE || row.libraryId === 0) continue;
    // An empty shelf is present at zero rather than absent. `capitalSnowball` is
    // a Gini coefficient over library depth *across universities*, and a
    // universe of one deep library and nine bare ones is the most unequal
    // arrangement there is — dropping the nine would report it as perfectly
    // equal, which is the direction a snowball guard must never lie in.
    byUniversity.set(handle, {
      library: row.libraryId as EntityHandle,
      depth: withPalaces(
        depths.get(row.libraryId as EntityHandle) ?? emptyLibraryDepth(),
        palaces.get(handle),
      ),
    });
  }

  // Ascending library handle, because `applyLibraryUpkeep` requires that order
  // by name: handles are stable identities, and paying in the order libraries
  // happen to appear in an iteration would make which library goes short depend
  // on the history that reached the state rather than on the state.
  const libraries = [...byUniversity.values()]
    .map((entry) => ({ handle: entry.library, depth: entry.depth }))
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

/**
 * Per-tier palace depth, per university, from its living affiliated mages.
 *
 * Returns `fp` depth per tier, already through {@link palaceLibraryDepth} so the
 * coefficient is applied by the function that owns it. Empty under any policy
 * whose coefficient is zero — which is every `standard` tradition, and is why a
 * universe that has never seen the Art of Memory pays nothing for this existing.
 *
 * The gates are the shelf's gates, deliberately: a node counts only if its cell
 * is currently **permitted** and the instance is above the activation threshold.
 * `library-depth.ts` states the first as a rule — *"a library full of
 * interdicted books still stands and reports zero depth"* — and a palace that
 * kept counting through an interdiction would make forbidding a cell cost a
 * standard university its research advantage and cost an Art of Memory one
 * nothing.
 *
 * Distinct **per mage**, not per university: two scholars who both hold a node
 * in their palaces are two copies of it, because that is what a palace is. This
 * is the one place the two units genuinely differ from a shelf's, and it is
 * `palaceLibraryDepth`'s own arithmetic — it sums contributions and does not
 * de-duplicate across holders.
 */
function palaceDepthByUniversity(
  state: SimState,
  deps: LibraryCapitalDeps,
): ReadonlyMap<Handle, readonly number[]> {
  const empty = new Map<Handle, readonly number[]>();
  const store = deps.store;
  if (store === undefined || store.libraryDepthCoefficient === 0) return empty;

  // Which university each living mage belongs to. A dead mage contributes
  // nothing, which is the entire bargain: this capital is mortal and has to be
  // continuously replaced.
  const affiliation = new Map<Handle, Handle>();
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0 || row.universityId === 0) continue;
    affiliation.set(handle, row.universityId);
  }
  if (affiliation.size === 0) return empty;

  // (university, tier) -> one entry per contributing mage, her distinct usable
  // palace nodes at that tier. Built from a single pass over the instances.
  const perMage = new Map<Handle, Map<number, Set<number>>>();
  const instances = componentOf(state, KNOWLEDGE_INSTANCE);
  const kinds = instances.field('locationKind');
  const ids = instances.field('locationId');
  const nodes = instances.field('nodeId');
  const masteries = instances.field('mastery');
  instances.forEach((row) => {
    if ((kinds[row] as number) !== LOCATION_KIND.palace) return;
    if ((masteries[row] as number) < MASTERY_ACTIVATION_THRESHOLD) return;
    const mage = ids[row] as Handle;
    if (!affiliation.has(mage)) return;
    const nodeId = nodes[row] as number;
    if (!permits(deps.ruleset, deps.cells.cellOf(nodeId))) return;
    const tier = deps.catalog.node(nodeId)?.tier ?? 1;
    if (!Number.isInteger(tier) || tier < 1 || tier > TIER_COUNT) return;
    let byTier = perMage.get(mage);
    if (byTier === undefined) {
      byTier = new Map<number, Set<number>>();
      perMage.set(mage, byTier);
    }
    let held = byTier.get(tier);
    if (held === undefined) {
      held = new Set<number>();
      byTier.set(tier, held);
    }
    held.add(nodeId);
  });

  const contributions = new Map<Handle, Map<number, PalaceContribution[]>>();
  for (const [mage, byTier] of perMage) {
    const university = affiliation.get(mage) as Handle;
    let forUniversity = contributions.get(university);
    if (forUniversity === undefined) {
      forUniversity = new Map<number, PalaceContribution[]>();
      contributions.set(university, forUniversity);
    }
    for (const [tier, held] of byTier) {
      const list = forUniversity.get(tier) ?? [];
      list.push({ mageId: mage, tierWeightedCount: held.size });
      forUniversity.set(tier, list);
    }
  }

  const depths = new Map<Handle, readonly number[]>();
  for (const [university, byTier] of contributions) {
    const perTier = Array.from({ length: TIER_COUNT }, () => 0);
    for (const [tier, list] of byTier) {
      perTier[tier - 1] = palaceLibraryDepth(store, list);
    }
    depths.set(university, perTier);
  }
  return depths;
}

/**
 * One library's depth with its university's palaces folded in.
 *
 * **`instanceCount` and `grimoireCount` are untouched, and that is the rule
 * rather than an omission.** `instanceCount` is what library upkeep is charged
 * on, and a memory palace costs no vellum to keep — there is nothing to keep.
 * Adding it there would bill a tradition that writes nothing for the shelving it
 * cannot do, and would make the Art of Memory strictly worse than having no
 * library at all.
 *
 * The `fp` depth is floored to whole nodes, because everything downstream —
 * `relevantDepth`, the `LIBRARY_CONTRIBUTION` table — is indexed by a node
 * count. Flooring rather than rounding, so a coefficient can never turn half a
 * node into a whole one.
 */
function withPalaces(depth: LibraryDepth, palace: readonly number[] | undefined): LibraryDepth {
  if (palace === undefined) return depth;

  const distinctByTier = Array.from({ length: TIER_COUNT }, () => 0);
  const cumulativeByTier = Array.from({ length: TIER_COUNT }, () => 0);
  let running = 0;
  let moved = false;
  for (let index = 0; index < TIER_COUNT; index += 1) {
    const added = floorDiv(palace[index] ?? 0, FP_ONE);
    if (added > 0) moved = true;
    distinctByTier[index] = (depth.distinctByTier[index] ?? 0) + added;
    running += distinctByTier[index] as number;
    cumulativeByTier[index] = running;
  }
  if (!moved) return depth;

  return {
    distinctByTier,
    cumulativeByTier,
    distinctNodes: running,
    instanceCount: depth.instanceCount,
    grimoireCount: depth.grimoireCount,
  };
}
