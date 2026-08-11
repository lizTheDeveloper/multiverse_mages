/*
 * Multiverse Mages — the derived "node exists in this universe" index.
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
 * `contracts.md` §1.5: *"whether a node 'exists in the universe' is
 * `count(instances of nodeId) > 0`, computed from an index maintained by the
 * knowledge subsystem. **Nothing may cache it in state.**"*
 *
 * ## Why the ban is absolute, and why this class is not part of `SimState`
 *
 * A cached copy in state is a second source of truth. That is bad everywhere,
 * and specifically catastrophic here, because state is the thing that gets
 * *serialized*: a snapshot would faithfully preserve the cache alongside the
 * instances it was derived from, and any moment of disagreement between them
 * would be persisted, restored, and carried forward forever. The two would then
 * drift silently — a node whose last instance burned while the cached flag
 * stayed set is a node the research system will refuse to let anyone
 * rediscover, and the `rediscoveryMultiplier` that should have applied never
 * does. Nothing throws. The only symptom is a `knowledgeHalfLife` baseline that
 * quietly stopped meaning what it said.
 *
 * Deriving it also removes a whole class of migration: an index is rebuilt from
 * the instances on load ({@link NodeExistenceIndex.rebuildFrom}), so a snapshot
 * written before this file existed loads correctly, and a snapshot written by a
 * build with a *bug* in this file is repaired simply by loading it into a fixed
 * one.
 *
 * ## Why it is a count, not a flag
 *
 * Incremental maintenance needs to know when the *last* instance goes, not
 * merely that one did. A boolean can only be cleared by rescanning, which is
 * the O(n) pass this index exists to avoid. §7's `libraryDependence` — "the
 * fraction of known nodes with exactly one surviving instance" — needs the
 * count anyway, so it is not extra work.
 */

/**
 * Live instance counts per node id, maintained incrementally.
 *
 * Backed by a `Uint32Array` indexed by node id: content ids are dense from 1
 * (`@mm/content` interns them from a sorted list), so the array is compact and
 * lookup is one read. A `Map` would also work and would reintroduce
 * hash-iteration order to anything that enumerated it — the exact class of
 * nondeterminism `sim-core-foundation` exists to prevent.
 */
export class NodeExistenceIndex {
  readonly #counts: Uint32Array;

  /**
   * @param nodeCount - How many nodes the loaded content declares. Ids run
   * `1..nodeCount`, so the backing array is one longer and index 0 is the
   * reserved null, never counted.
   */
  constructor(nodeCount: number) {
    if (!Number.isInteger(nodeCount) || nodeCount < 0) {
      throw new RangeError(`nodeCount must be a non-negative integer, received ${String(nodeCount)}`);
    }
    this.#counts = new Uint32Array(nodeCount + 1);
  }

  /** Highest node id this index can hold. */
  get nodeCount(): number {
    return this.#counts.length - 1;
  }

  /** Whether the universe currently holds at least one instance of a node. */
  exists(nodeId: number): boolean {
    return this.instanceCount(nodeId) > 0;
  }

  /**
   * Live instances of a node. `0` for a node nobody knows — and, deliberately,
   * `0` for a node id outside the loaded content, rather than an exception:
   * this is read on hot paths and a bounds check that throws would turn a
   * mis-derived id into a crash mid-tick instead of a visible zero.
   */
  instanceCount(nodeId: number): number {
    return this.#counts[nodeId] ?? 0;
  }

  /** Nodes with exactly one surviving instance — §7's `libraryDependence`. */
  singleInstanceNodes(): number[] {
    const found: number[] = [];
    for (let nodeId = 1; nodeId < this.#counts.length; nodeId += 1) {
      if (this.#counts[nodeId] === 1) found.push(nodeId);
    }
    return found;
  }

  /** Nodes with at least one instance, ascending. */
  knownNodes(): number[] {
    const found: number[] = [];
    for (let nodeId = 1; nodeId < this.#counts.length; nodeId += 1) {
      if ((this.#counts[nodeId] as number) > 0) found.push(nodeId);
    }
    return found;
  }

  /** Records an instance appearing. Call once per created knowledge instance. */
  add(nodeId: number): void {
    this.#assertNodeId(nodeId, 'add');
    this.#counts[nodeId] = (this.#counts[nodeId] as number) + 1;
  }

  /**
   * Records an instance disappearing.
   *
   * @throws RangeError if the count is already zero. Saturating at zero would
   * be the friendlier choice and the wrong one: an unmatched remove means the
   * index and the instances have already diverged, and the whole value of a
   * derived index is that the divergence is impossible. Silently clamping would
   * make the *next* symptom a node that reads as lost while an instance of it
   * is sitting in a library.
   */
  remove(nodeId: number): void {
    this.#assertNodeId(nodeId, 'remove');
    const current = this.#counts[nodeId] as number;
    if (current === 0) {
      throw new RangeError(
        `NodeExistenceIndex.remove(${nodeId}) was called with no instances recorded. The index ` +
          'and the knowledge instances it is derived from have diverged; rebuild it with ' +
          'rebuildFrom() rather than continuing.',
      );
    }
    this.#counts[nodeId] = current - 1;
  }

  /** Drops every count. */
  clear(): void {
    this.#counts.fill(0);
  }

  /**
   * Rebuilds the index from the instances that actually exist.
   *
   * The recovery path, and the load path. `visit` hands over each live
   * instance's node id in ascending slot order — counts are order-independent,
   * but the caller iterating in slot order is what keeps everything else about
   * the pass deterministic.
   */
  rebuildFrom(visit: (yieldNodeId: (nodeId: number) => void) => void): void {
    this.clear();
    visit((nodeId) => {
      this.add(nodeId);
    });
  }

  #assertNodeId(nodeId: number, operation: string): void {
    if (!Number.isInteger(nodeId) || nodeId < 1 || nodeId >= this.#counts.length) {
      throw new RangeError(
        `NodeExistenceIndex.${operation}() received node id ${String(nodeId)}, outside 1..` +
          `${this.nodeCount}. Node id 0 is the reserved null (contracts.md §0) and never names a ` +
          'node.',
      );
    }
  }
}
