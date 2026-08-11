/*
 * Multiverse Mages — the counted-cohort store and its uniqueness invariant.
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

import type { ComponentStore, EntityHandle } from '@mm/sim-core';
import { EntityStore, NULL_ENTITY, floorDiv } from '@mm/sim-core';
import type { ContentId, OccupationValue, Tick } from '@mm/state';
import { POPULACE_COHORT } from '@mm/state';

import { BIRTH_BUCKET_TICKS, birthBucketOf } from './buckets.js';
import { OCCUPATION_COUNT, isOccupation } from './occupations.js';

/**
 * ## What this class is defending
 *
 * `docs/design/contracts.md` §1.3 is a **performance contract, stated
 * normatively**: simulating a whole population as individuals is what would
 * make Monte Carlo unaffordable, so populace exists only as cohorts keyed on
 * `(speciesId, occupation, birthTickBucket)`. The contract survives only if two
 * things stay true, and neither is self-enforcing.
 *
 * **One entity per key.** `mages-and-species/design.md` states the consequence
 * plainly: without merge-on-collision, splitting a cohort to move workers
 * between occupations creates fragments, fragments accumulate, and *a mechanism
 * introduced to save per-person cost drifts back toward per-person cost over a
 * long run* — visible only in the longest Monte Carlo runs, which are the
 * slowest to debug. The bound it protects is
 * `6 species × 5 occupations × ceil(maxLifespanMonths / 120)`, which is 4,500
 * entities for the draconic placeholder, for a population of any size.
 *
 * **No per-cohort scratch state.** §1.3's field table has exactly four columns.
 * A fractional-deaths accumulator, a "pending transfer" counter, a cached age —
 * each is the obvious way to write some piece of this capability, and each is a
 * contract amendment. Mortality's fractional part is therefore resolved by a
 * single stochastic draw rather than carried (`mortality.ts`), and transfers
 * floor rather than accumulating a remainder.
 *
 * ## Why the key index is a `Map` and iteration never is
 *
 * Lookups by key happen on every merge and every transfer, so an index earns
 * its place. But nothing may *iterate* it: `Map` yields insertion order, which
 * is a function of how the state was reached rather than of what it is, and two
 * peers replaying the same actions in different creation orders would then
 * compute different results. Every pass — {@link handles}, {@link forEach},
 * {@link totalCount}, {@link reconcile} — goes through the component's
 * ascending-slot iteration instead, which `EntityStore` guarantees is
 * reproducible.
 *
 * ## Keys are packed by multiplication, not by bit twiddling
 *
 * `birthTickBucket` is an `int32` and the obvious `(bucket << 8) | occupation`
 * truncates to 32 bits, silently colliding two distant decades. Multiplication
 * by the exact spans keeps every key an exact integer well inside the safe
 * range, and negative buckets — a founding population born before tick 0 — pack
 * as negative keys rather than as wrapped positive ones.
 */

/** The key `contracts.md` §1.3 makes a cohort's identity. */
export interface CohortKey {
  readonly speciesId: ContentId;
  readonly occupation: OccupationValue;
  /**
   * Any tick within the decade. {@link CohortStore} buckets it, so a caller
   * may pass a raw birth tick or an already-bucketed value.
   */
  readonly birthTickBucket: Tick;
}

/**
 * The largest `count` the `u32` component field holds.
 *
 * Enforced here because `ComponentStore.set` checks that a value is an integer
 * and not that it fits: a merge summing past `2^32` wraps in the backing
 * `Uint32Array` with no error at all, turning a population of four billion into
 * a population of three. A refusal is the only version of this that surfaces.
 */
export const MAX_COHORT_COUNT = 4_294_967_295;

/** `speciesId` is a `u16`, so this is the exact span of the species factor. */
const SPECIES_KEY_SPAN = 65_536;

type CohortComponent = ComponentStore<typeof POPULACE_COHORT.fields>;

export interface CohortStoreOptions {
  /** Allocation hint only; never changes which slot an entity receives. */
  readonly initialCapacity?: number;
}

/** A duplicate key found by {@link CohortStore.reconcile}. */
export interface CohortMerge {
  readonly survivor: EntityHandle;
  readonly absorbed: EntityHandle;
  readonly key: CohortKey;
  readonly movedCount: number;
}

function assertCount(count: number, role: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${role} must be a non-negative integer, received ${String(count)}. Cohorts count people; ` +
        'the rules path is float-free (contracts.md §0).',
    );
  }
}

/**
 * Cohort storage with the §1.3 uniqueness invariant maintained by construction.
 *
 * Wraps an {@link EntityStore} and the `populace-cohort` component rather than
 * owning a private representation, so that cohorts are ordinary entities — a
 * university's `staffCohorts` holds handles into this store, and a snapshot
 * serializes the component like any other.
 */
export class CohortStore {
  readonly entities: EntityStore;
  readonly cohorts: CohortComponent;

  /** Packed key to handle. Read for lookups; never iterated. */
  readonly #byKey = new Map<number, EntityHandle>();

  constructor(entities: EntityStore, cohorts: CohortComponent) {
    this.entities = entities;
    this.cohorts = cohorts;
    this.reconcile();
  }

  /** Live cohort entities. The number `contracts.md` §1.3's bound is about. */
  get liveCohortCount(): number {
    return this.cohorts.size;
  }

  /** Whether a handle still names a live cohort. A stale handle is `false`. */
  isLive(handle: EntityHandle): boolean {
    return this.cohorts.has(handle);
  }

  /** The handle holding a key, or `NULL_ENTITY` — §0's absent reference. */
  find(key: CohortKey): EntityHandle {
    const handle = this.#byKey.get(packKey(normalizeKey(key)));
    if (handle === undefined || !this.cohorts.has(handle)) {
      return NULL_ENTITY;
    }
    return handle;
  }

  /** The key a live cohort holds, with `birthTickBucket` already bucketed. */
  keyOf(handle: EntityHandle): CohortKey {
    return {
      speciesId: this.cohorts.get(handle, 'speciesId'),
      occupation: this.cohorts.get(handle, 'occupation') as OccupationValue,
      birthTickBucket: this.cohorts.get(handle, 'birthTickBucket'),
    };
  }

  /** People in a live cohort. */
  countOf(handle: EntityHandle): number {
    return this.cohorts.get(handle, 'count');
  }

  /**
   * Adds people to a key, merging into the existing cohort if there is one and
   * creating it otherwise.
   *
   * This is the merge-on-collision invariant: there is no API that produces a
   * second entity for a key, so the only way to get one is to write the
   * component directly, which {@link reconcile} exists to catch.
   *
   * @returns the handle now holding the key.
   * @throws RangeError on a fractional or negative count, an occupation outside
   * the five of §1.3, or a total past {@link MAX_COHORT_COUNT}.
   */
  add(key: CohortKey, count: number): EntityHandle {
    assertCount(count, 'count');
    const normalized = normalizeKey(key);
    const packed = packKey(normalized);

    const existing = this.#byKey.get(packed);
    if (existing !== undefined && this.cohorts.has(existing)) {
      this.#setCount(existing, this.countOf(existing) + count);
      return existing;
    }

    // Adding nobody creates nobody. Without this, a birth tick that produced no
    // births would allocate an entity and immediately destroy it, churning a
    // slot and a generation counter every tick for every empty species —
    // observable in the free list and therefore in the snapshot.
    if (count === 0) {
      return NULL_ENTITY;
    }

    const handle = this.entities.create();
    this.cohorts.add(handle);
    this.cohorts.set(handle, 'speciesId', normalized.speciesId);
    this.cohorts.set(handle, 'occupation', normalized.occupation);
    this.cohorts.set(handle, 'birthTickBucket', normalized.birthTickBucket);
    this.#byKey.set(packed, handle);
    this.#setCount(handle, count);
    return handle;
  }

  /**
   * Removes people from a cohort, destroying it when it empties.
   *
   * Saturating rather than throwing on an over-large request: mortality and
   * reallocation both compute a count and then apply it, and the arithmetic
   * that produced it has already been checked. What matters is that the cohort
   * never goes negative and never lingers at zero.
   *
   * @returns how many were actually removed.
   */
  remove(handle: EntityHandle, count: number): number {
    assertCount(count, 'count');
    const held = this.countOf(handle);
    const removed = count < held ? count : held;
    const left = held - removed;
    if (left === 0) {
      this.#destroy(handle);
    } else {
      this.cohorts.set(handle, 'count', left);
    }
    return removed;
  }

  /**
   * Moves people from one cohort into the same species and birth bucket under a
   * different occupation, merging with whatever is already there.
   *
   * The only way an occupation changes. A caller that instead wrote
   * `cohorts.set(handle, 'occupation', …)` would produce exactly the duplicate
   * key §1.3 forbids — which is why {@link reconcile} treats that as a
   * recoverable state rather than an impossible one.
   *
   * @returns how many actually moved.
   */
  transfer(handle: EntityHandle, occupation: OccupationValue, count: number): number {
    const from = this.keyOf(handle);
    if (from.occupation === occupation) {
      return 0;
    }
    const moved = this.remove(handle, count);
    if (moved > 0) {
      this.add({ ...from, occupation }, moved);
    }
    return moved;
  }

  /** Every live cohort handle, ascending by slot index. Never creation order. */
  handles(): EntityHandle[] {
    const found: EntityHandle[] = [];
    this.cohorts.forEach((_row, handle) => {
      found.push(handle);
    });
    return found;
  }

  /** Visits every live cohort in ascending slot order. */
  forEach(visit: (handle: EntityHandle, key: CohortKey, count: number) => void): void {
    for (const handle of this.handles()) {
      visit(handle, this.keyOf(handle), this.countOf(handle));
    }
  }

  /** Total people across every cohort. */
  totalCount(): number {
    let total = 0;
    this.cohorts.forEach((_row, handle) => {
      total += this.cohorts.get(handle, 'count');
    });
    return total;
  }

  /** Total people of one species, across every occupation and birth bucket. */
  totalOfSpecies(speciesId: ContentId): number {
    let total = 0;
    this.cohorts.forEach((_row, handle) => {
      if (this.cohorts.get(handle, 'speciesId') === speciesId) {
        total += this.cohorts.get(handle, 'count');
      }
    });
    return total;
  }

  /**
   * Rebuilds the key index from the component in slot order, merging any
   * duplicate key into the cohort in the **lowest slot** and destroying the
   * others.
   *
   * Run at end of tick. The survivor rule is a function of state rather than of
   * visit order, and that matters beyond tidiness: the survivor's handle is the
   * `actorKey` its mortality draw is derived from (`contracts.md` §6), so a
   * survivor chosen by iteration order would make a cohort's rolls depend on
   * how the tick happened to reach it.
   *
   * @returns how many merges were performed. `0` is the invariant holding.
   */
  reconcile(): number {
    this.#byKey.clear();
    const merges = this.#findDuplicates();
    for (const merge of merges) {
      this.#setCount(merge.survivor, this.countOf(merge.survivor) + merge.movedCount);
      this.#destroy(merge.absorbed);
    }
    return merges.length;
  }

  /**
   * The end-of-tick validation of the `economy` spec's "duplicate keys are
   * impossible": throws naming every colliding key.
   *
   * Separate from {@link reconcile} on purpose. Repairing silently and
   * asserting loudly are different jobs, and a test that only ever calls the
   * repair cannot tell whether the invariant held or was restored.
   */
  assertUniqueKeys(): void {
    const duplicates = this.#findDuplicates();
    if (duplicates.length === 0) {
      return;
    }
    const detail = duplicates
      .map(
        (merge) =>
          `(species ${String(merge.key.speciesId)}, occupation ${String(merge.key.occupation)}, ` +
          `bucket ${String(merge.key.birthTickBucket)})`,
      )
      .join(', ');
    throw new Error(
      `Populace cohorts hold ${String(duplicates.length)} duplicate key(s): ${detail}. ` +
        'contracts.md §1.3 keys a cohort on (speciesId, occupation, birthTickBucket) and ' +
        'mages-and-species requires collisions to merge in the same tick — unmerged fragments ' +
        'accumulate and the cohort entity bound stops holding. Change occupations through ' +
        'CohortStore.transfer rather than writing the component field.',
    );
  }

  /**
   * Scans in slot order, keeping the first cohort seen for each key as the
   * survivor. Rebuilds {@link #byKey} as a side effect so that
   * {@link reconcile} does not need a second pass.
   */
  #findDuplicates(): CohortMerge[] {
    const seen = new Map<number, EntityHandle>();
    const duplicates: CohortMerge[] = [];
    this.cohorts.forEach((_row, handle) => {
      const key = this.keyOf(handle);
      const packed = packKey(key);
      const survivor = seen.get(packed);
      if (survivor === undefined) {
        seen.set(packed, handle);
        return;
      }
      duplicates.push({ survivor, absorbed: handle, key, movedCount: this.countOf(handle) });
    });
    this.#byKey.clear();
    for (const [packed, handle] of seen) {
      this.#byKey.set(packed, handle);
    }
    return duplicates;
  }

  #setCount(handle: EntityHandle, count: number): void {
    if (count > MAX_COHORT_COUNT) {
      throw new RangeError(
        `A cohort would hold ${String(count)} people, past the uint32 the count field stores ` +
          `(${String(MAX_COHORT_COUNT)}). ComponentStore.set checks integer-ness, not range, so ` +
          'this would otherwise wrap silently and shrink the population by four billion.',
      );
    }
    if (count === 0) {
      this.#destroy(handle);
      return;
    }
    this.cohorts.set(handle, 'count', count);
  }

  /**
   * Destroys a cohort entity and drops its index entry — but only if the index
   * still points at *this* handle.
   *
   * The guard is what makes {@link reconcile} safe. When a duplicate is
   * absorbed, the index already names the surviving cohort under the same
   * packed key, and an unconditional delete would evict the survivor from the
   * index while leaving it alive. The next `add` for that key would then create
   * a second entity — reintroducing precisely the fragmentation the merge was
   * performing.
   */
  #destroy(handle: EntityHandle): void {
    const packed = packKey(this.keyOf(handle));
    if (this.#byKey.get(packed) === handle) {
      this.#byKey.delete(packed);
    }
    this.entities.destroy(handle);
  }
}

/** Buckets the birth tick and rejects an occupation outside the contracted five. */
function normalizeKey(key: CohortKey): CohortKey {
  if (!isOccupation(key.occupation)) {
    throw new RangeError(
      `Occupation ${String(key.occupation)} is not one of the five in contracts.md §1.3 ` +
        '(laborer, scribe, student, soldier, idle). A sixth occupation is a contract change.',
    );
  }
  if (!Number.isInteger(key.speciesId) || key.speciesId < 0 || key.speciesId >= SPECIES_KEY_SPAN) {
    throw new RangeError(
      `speciesId ${String(key.speciesId)} is not an interned uint16 content id (contracts.md §0).`,
    );
  }
  return {
    speciesId: key.speciesId,
    occupation: key.occupation,
    birthTickBucket: birthBucketOf(key.birthTickBucket),
  };
}

/**
 * Packs a normalized key into one exact integer.
 *
 * Multiplication, never shifts: `birthTickBucket` is an `int32` and `<<` would
 * truncate it to 32 bits, aliasing decades that are far apart. The widest
 * factor is `bucketIndex`, bounded by `int32 / 120 ≈ ±1.8 × 10⁷`, so the packed
 * value stays around `6 × 10¹²` — three orders of magnitude inside exact
 * integer arithmetic.
 */
function packKey(key: CohortKey): number {
  const bucketIndex = floorDiv(key.birthTickBucket, BIRTH_BUCKET_TICKS);
  return (bucketIndex * OCCUPATION_COUNT + key.occupation) * SPECIES_KEY_SPAN + key.speciesId;
}

/**
 * A standalone cohort store with its own entity store.
 *
 * For tests and for callers that have no `SimState` yet. Production code passes
 * the world's own entity store and `populace-cohort` component to the
 * constructor, so cohorts are entities in the same store as everything else.
 */
export function createCohortStore(options: CohortStoreOptions = {}): CohortStore {
  const entities = new EntityStore(
    options.initialCapacity === undefined ? {} : { initialCapacity: options.initialCapacity },
  );
  return new CohortStore(entities, entities.registerComponent(POPULACE_COHORT));
}
