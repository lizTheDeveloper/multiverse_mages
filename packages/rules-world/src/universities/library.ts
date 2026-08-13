/*
 * Multiverse Mages — a library is what is shelved in it, counted by tier.
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

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import type { ContentId } from '@mm/content';
import { HOLDER_KIND, LOCATION_KIND, collectRecords } from '@mm/state';
import { GRIMOIRE, KNOWLEDGE_INSTANCE } from '@mm/state';

/**
 * ## What a library holds, and what it does not hold twice
 *
 * `contracts.md` §1.5 is precise about this and it is easy to get wrong:
 *
 * > A grimoire shelved in a library does not produce a second instance: the
 * > instance's location is *rewritten* from `(2, grimoireId)` to
 * > `(3, libraryId)` on shelving and back on removal.
 *
 * So a library's contents are exactly the knowledge instances whose
 * `locationKind` is `library` and whose `locationId` is its handle. There is no
 * membership list to keep in step, and — the reason §1.5 says so — counting a
 * shelved book twice *"would inflate every redundancy metric and make
 * `libraryDependence` lie in the safe direction"*, which is the worst direction
 * for a metric to lie in.
 *
 * The grimoire aggregation below is the association §1.5 calls "a subsystem
 * index, not a second instance record": grimoires whose holder is this library.
 * It is derived on every call and cached nowhere.
 *
 * ## Depth is counted per tier, in a seven-entry array
 *
 * The `universities` spec requires relevance to be *"a fixed-size per-tier
 * prefix-sum array per university, recomputed on library change"* and its
 * scenario says a lookup *"reads a seven-entry per-tier prefix-sum array, not a
 * scan over library contents"*. That is a performance requirement with a
 * behavioural consequence: relevance is asked once per learner per rate
 * evaluation, so a scan would make the cost of studying somewhere proportional
 * to how much is shelved there — which is the opposite of what a library is
 * for.
 *
 * ## Distinct nodes, not instances
 *
 * The contribution table is over *"relevant distinct nodes held"*. Two copies
 * of one node are one node's worth of knowledge and two shelves' worth of
 * upkeep, and that asymmetry is brake 4: benefit is concave in depth, cost is
 * linear in holdings. Both counts are therefore reported and they are different
 * numbers.
 */

/** Tiers run 1..7 (`contracts.md` §2.3). */
export const TIER_COUNT = 7;

/** What is on a library's shelves, counted the two ways that differ. */
export interface LibraryDepth {
  /**
   * Distinct nodes held at each tier. Index 0 is tier 1.
   *
   * Always exactly {@link TIER_COUNT} long, whatever the library holds — a
   * fixed-size array is what makes the relevance lookup a constant-time read.
   */
  readonly distinctByTier: readonly number[];
  /**
   * Distinct nodes at or below each tier, cumulative. Index 0 is "tier ≤ 1".
   *
   * The prefix sum the spec asks for. A learner's relevant depth is one index
   * into this, at `depthCeiling - 1`.
   */
  readonly cumulativeByTier: readonly number[];
  /** Distinct nodes at any tier. */
  readonly distinctNodes: number;
  /** Knowledge instances held, counting duplicates. What upkeep is charged on. */
  readonly instanceCount: number;
  /** Grimoires this library holds, per the §1.5 holder association. */
  readonly grimoireCount: number;
}

/** A node's tier, supplied by the caller because the node graph is content. */
export type TierLookup = (nodeId: ContentId) => number;

function emptyCounts(): number[] {
  return Array.from({ length: TIER_COUNT }, () => 0);
}

/**
 * Counts one library's contents, from state, on demand.
 *
 * @param tierOf - The tier of a node. Supplied rather than looked up because
 * nodes are content and this package holds no node index; passing the lookup
 * keeps the tier a content fact rather than a copy of one.
 * @throws RangeError on a tier outside 1..7. A node whose tier is 0 or 9 is a
 * content defect, and silently bucketing it somewhere would make a library's
 * depth quietly wrong rather than loudly broken.
 */
export function libraryDepth(
  state: SimState,
  library: EntityHandle,
  tierOf: TierLookup,
  options: LibraryDepthOptions = {},
): LibraryDepth {
  const counter = new DepthCounter(tierOf, options.counts);
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.library || row.locationId !== library) continue;
    counter.take(row.nodeId);
  }

  let grimoireCount = 0;
  for (const { row } of collectRecords(state, GRIMOIRE)) {
    if (row.holderKind === HOLDER_KIND.library && row.holderId === library) grimoireCount += 1;
  }

  return counter.finish(grimoireCount);
}

/**
 * What a library counts toward its depth, when not everything on the shelf does.
 *
 * `counts` exists for the ruleset gate `rules-magic`'s own `library-depth.ts`
 * states and this package may not compute: *"A library full of interdicted
 * books still stands, still holds every instance, and reports zero depth:
 * forbidding a cell costs a university its research advantage immediately,
 * while costing it no book at all."* So a rejected instance is left out of
 * {@link LibraryDepth.distinctByTier} and stays in
 * {@link LibraryDepth.instanceCount}, which is what makes an interdiction cost
 * the *benefit* and none of the *upkeep*.
 *
 * The predicate is supplied rather than computed because `contracts.md` §5
 * forbids this package from reaching into `rules-magic`, and legality is a
 * question about the grid. Absent, every shelved instance counts, which is what
 * every caller written before the gate existed asked for.
 */
export interface LibraryDepthOptions {
  readonly counts?: (nodeId: ContentId) => boolean;
}

/**
 * Every library's depth, from one pass over the instance component.
 *
 * The per-library {@link libraryDepth} is a scan of every knowledge instance in
 * the universe, so asking it once per library is `libraries × instances` — and
 * the world loop asks for all of them, every tick, for exactly the reason
 * `library.ts` gives about relevance lookups: a cost proportional to how much
 * is shelved is the opposite of what a library is for.
 *
 * Libraries with nothing shelved and no books are absent from the map rather
 * than present at zero. A caller that wants "zero" for one of them says so; a
 * map that carried an entry per handle would be a list of every library that
 * has ever existed, which is not what any caller here is asking.
 */
export function libraryDepths(
  state: SimState,
  tierOf: TierLookup,
  options: LibraryDepthOptions = {},
): ReadonlyMap<EntityHandle, LibraryDepth> {
  const counters = new Map<EntityHandle, DepthCounter>();
  const counterFor = (library: EntityHandle): DepthCounter => {
    const existing = counters.get(library);
    if (existing !== undefined) return existing;
    const created = new DepthCounter(tierOf, options.counts);
    counters.set(library, created);
    return created;
  };

  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.library) continue;
    counterFor(row.locationId as EntityHandle).take(row.nodeId);
  }

  const books = new Map<EntityHandle, number>();
  for (const { row } of collectRecords(state, GRIMOIRE)) {
    if (row.holderKind !== HOLDER_KIND.library) continue;
    const library = row.holderId as EntityHandle;
    books.set(library, (books.get(library) ?? 0) + 1);
    counterFor(library);
  }

  const depths = new Map<EntityHandle, LibraryDepth>();
  for (const [library, counter] of counters) {
    depths.set(library, counter.finish(books.get(library) ?? 0));
  }
  return depths;
}

/**
 * The per-tier tally behind both readings, so there is exactly one of it.
 *
 * Not exported. Two implementations of "what is on this shelf" that agreed
 * today would be two that could disagree after a tuning pass, and the pass
 * would look like a balance change.
 */
class DepthCounter {
  readonly #tierOf: TierLookup;
  readonly #counts: ((nodeId: ContentId) => boolean) | undefined;
  readonly #distinctByTier = emptyCounts();
  readonly #seen = new Set<ContentId>();
  #instanceCount = 0;

  constructor(tierOf: TierLookup, counts?: (nodeId: ContentId) => boolean) {
    this.#tierOf = tierOf;
    this.#counts = counts;
  }

  /** One shelved instance. Counted for upkeep always, for depth conditionally. */
  take(nodeId: ContentId): void {
    this.#instanceCount += 1;
    if (this.#seen.has(nodeId)) return;
    this.#seen.add(nodeId);
    if (this.#counts !== undefined && !this.#counts(nodeId)) return;

    const tier = this.#tierOf(nodeId);
    if (!Number.isInteger(tier) || tier < 1 || tier > TIER_COUNT) {
      throw new RangeError(
        `node ${String(nodeId)} reports tier ${String(tier)}; contracts.md §2.3 fixes tiers ` +
          `at 1..${String(TIER_COUNT)}`,
      );
    }
    this.#distinctByTier[tier - 1] = (this.#distinctByTier[tier - 1] ?? 0) + 1;
  }

  finish(grimoireCount: number): LibraryDepth {
    const cumulativeByTier = emptyCounts();
    let running = 0;
    for (let index = 0; index < TIER_COUNT; index += 1) {
      running += this.#distinctByTier[index] ?? 0;
      cumulativeByTier[index] = running;
    }
    return {
      distinctByTier: this.#distinctByTier,
      cumulativeByTier,
      distinctNodes: running,
      instanceCount: this.#instanceCount,
      grimoireCount,
    };
  }
}

/** A library with nothing on its shelves, for a handle no instance names. */
export function emptyLibraryDepth(): LibraryDepth {
  return {
    distinctByTier: emptyCounts(),
    cumulativeByTier: emptyCounts(),
    distinctNodes: 0,
    instanceCount: 0,
    grimoireCount: 0,
  };
}

/**
 * The distinct nodes in a library that a given learner can actually use.
 *
 * Brake 2 from `mages-and-species/design.md`: *"A draconic-deep library
 * accelerates nothing for orcs."* One array read, whatever the library holds.
 *
 * @param depthCeiling - The learner's species `depthCeiling`, 1..7. A ceiling
 * of 0 — a species that can learn nothing — reads as zero relevant depth rather
 * than throwing, because it is a legitimate content value and the answer for it
 * is not in doubt.
 */
export function relevantDepth(depth: LibraryDepth, depthCeiling: number): number {
  if (!Number.isInteger(depthCeiling) || depthCeiling < 0) {
    throw new RangeError(
      `a depthCeiling must be a non-negative integer, received ${String(depthCeiling)}`,
    );
  }
  if (depthCeiling === 0) return 0;
  const index = Math.min(depthCeiling, TIER_COUNT) - 1;
  return depth.cumulativeByTier[index] ?? 0;
}

/**
 * Materials one library consumes per world tick, in `fp`.
 *
 * Brake 4, and it is charged on **instances rather than distinct nodes** on
 * purpose: benefit is concave in depth and cost is linear in holdings, so
 * "hoard everything forever" is a losing line and a universe has to choose
 * between breadth of library and everything else materials buy. Charging
 * upkeep on distinct nodes instead would make a second copy free, which is the
 * one thing a redundancy-driven design must not make free.
 */
export const LIBRARY_UPKEEP_PER_INSTANCE: Fixed = 2;

/** A library's per-tick materials upkeep, `fp`. **Untuned coefficient.** */
export function libraryUpkeep(depth: LibraryDepth): Fixed {
  return depth.instanceCount * LIBRARY_UPKEEP_PER_INSTANCE;
}
