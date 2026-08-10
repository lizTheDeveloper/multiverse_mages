/*
 * Multiverse Mages — deterministic struct-of-arrays entity store.
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

import type { ComponentFields, ComponentSpec } from './component.js';
import { ComponentStore } from './component.js';
import type { EntityHandle } from './handle.js';
import {
  MAX_ENTITY_GENERATION,
  MAX_ENTITY_SLOTS,
  NULL_ENTITY,
  StaleHandleError,
  handleGeneration,
  handleIndex,
  makeHandle,
} from './handle.js';

/**
 * Returned by the non-throwing resolvers when a handle does not name a live
 * entity.
 *
 * `docs/design/contracts.md` §0 requires absent *references* to be `0` — that
 * rule governs handle-valued fields stored in state, and this store honours it:
 * `NULL_ENTITY` is 0 and is never allocated. This constant is a different
 * thing: a return code for "no slot". Slot 0 is a perfectly ordinary slot, so
 * 0 cannot double as its absence marker here.
 */
export const NO_SLOT = -1;

/** Smallest slot capacity the store ever allocates. */
const MIN_CAPACITY = 16;

export interface EntityStoreOptions {
  /**
   * Slots to allocate up front. Purely an allocation hint: it changes when
   * arrays are grown and never which slot or generation an entity receives.
   */
  readonly initialCapacity?: number;
  /**
   * Hard ceiling on slot indices, defaulting to the full handle range. Useful
   * for the engagement-scale store, which is short-lived and small, so that
   * runaway summon spawning fails loudly instead of eating memory.
   */
  readonly maxSlots?: number;
}

/** The slice of a component the store needs in order to clean up after a destroy. */
interface AttachedComponent {
  readonly name: string;
  detachSlot(slot: number): void;
}

/**
 * Struct-of-arrays entity storage with generational handles.
 *
 * Three properties are load-bearing, and each is the failure mode of a class of
 * simulation bug that surfaces only as a desync, weeks later:
 *
 * 1. **Iteration is index order, always.** Never insertion order, never hash
 *    order, never `Object.keys`. Two peers that visit the same entities in
 *    different orders compute different results from the same state.
 * 2. **Allocation is reproducible.** Fresh slots ascend from 0; freed slots
 *    come back from a LIFO free list; generations only ever increase. Nothing
 *    in the assignment path reads capacity, wall-clock time, or a hash.
 * 3. **Stale handles are detectable.** A handle carries the generation its slot
 *    held when it was issued, and every resolution compares the two, so a
 *    handle to a dead mage reports as stale instead of silently addressing
 *    whoever moved into the slot.
 *
 * The store is deliberately agnostic about what an entity *is*. Individual
 * mages (`contracts.md` §1.2) and aggregate populace cohorts (§1.3) are both
 * just slots; what distinguishes them is which components they carry.
 */
export class EntityStore {
  readonly #maxSlots: number;

  /**
   * Generation per slot, bumped on destroy. A fresh slot is set to 1 on first
   * allocation — never left at the zero-initialised value, because slot 0 at
   * generation 0 would encode to the reserved handle 0.
   *
   * `Uint16Array` because the counter is capped at `MAX_ENTITY_GENERATION`
   * (4095) plus one retirement value.
   */
  #generations: Uint16Array;

  /** Liveness per slot. Distinguishes "freed" from "never allocated". */
  #alive: Uint8Array;

  /** LIFO free list of reusable slots. Deterministic by construction. */
  #freeSlots: Uint32Array;
  #freeTop = 0;

  /** High-water mark: slots that have ever been allocated. */
  #slotCount = 0;

  #liveCount = 0;

  /** Registration order, which is the order components are detached on destroy. */
  readonly #components: AttachedComponent[] = [];
  readonly #componentNames = new Set<string>();

  constructor(options: EntityStoreOptions = {}) {
    const maxSlots = options.maxSlots ?? MAX_ENTITY_SLOTS;
    if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > MAX_ENTITY_SLOTS) {
      throw new RangeError(`maxSlots must be an integer in 1..${MAX_ENTITY_SLOTS}, got ${maxSlots}`);
    }
    const requested = options.initialCapacity ?? MIN_CAPACITY;
    if (!Number.isInteger(requested) || requested < 0) {
      throw new RangeError(`initialCapacity must be a non-negative integer, got ${requested}`);
    }

    this.#maxSlots = maxSlots;
    const capacity = Math.min(Math.max(requested, 1), maxSlots);
    this.#generations = new Uint16Array(capacity);
    this.#alive = new Uint8Array(capacity);
    this.#freeSlots = new Uint32Array(capacity);
  }

  /** Entities currently alive. */
  get liveCount(): number {
    return this.#liveCount;
  }

  /** Slots that have ever been allocated, live or not. Iteration bound. */
  get slotCount(): number {
    return this.#slotCount;
  }

  /** Slots currently allocated in the backing arrays. An allocation detail. */
  get capacity(): number {
    return this.#generations.length;
  }

  /** Freed slots waiting for reuse. */
  get freeCount(): number {
    return this.#freeTop;
  }

  /** Registered components, in registration order. */
  get components(): readonly { readonly name: string }[] {
    return this.#components;
  }

  /**
   * Registers a component: a named set of integer fields, stored only for the
   * entities that actually carry it.
   *
   * Sparse by design. `contracts.md` §0 says world-scale entities have no
   * coordinates and only engagement entities do, so a component model that
   * assumed every entity was positioned would pay two `int32` per mage per
   * Monte Carlo run for fields that are never read.
   */
  registerComponent<const F extends ComponentFields>(spec: ComponentSpec<F>): ComponentStore<F> {
    if (this.#componentNames.has(spec.name)) {
      throw new Error(`Component "${spec.name}" is already registered on this store.`);
    }
    const component = new ComponentStore<F>(this, spec);
    this.#componentNames.add(spec.name);
    this.#components.push(component as unknown as AttachedComponent);
    return component;
  }

  /**
   * Allocates an entity and returns its handle.
   *
   * Slot choice is a pure function of the create/destroy history: the free list
   * first, most recently freed first, then the next never-used slot.
   */
  create(): EntityHandle {
    let index: number;
    if (this.#freeTop > 0) {
      this.#freeTop -= 1;
      index = this.#freeSlots[this.#freeTop] as number;
    } else {
      if (this.#slotCount >= this.#maxSlots) {
        throw new RangeError(
          `Entity store is full: ${this.#maxSlots} slots allocated and none free.`,
        );
      }
      index = this.#slotCount;
      this.#slotCount += 1;
      this.#ensureCapacity(this.#slotCount);
      // Fresh slots start at generation 1, never 0 — see NULL_ENTITY.
      this.#generations[index] = 1;
    }

    this.#alive[index] = 1;
    this.#liveCount += 1;
    return makeHandle(index, this.#generations[index] as number);
  }

  /**
   * Destroys the entity a handle refers to, detaching all of its components.
   *
   * Returns `false` for a handle that is stale, null, or already destroyed —
   * and crucially does not free the slot a second time. A slot pushed onto the
   * free list twice would be handed to two live entities at once, which reads
   * as memory corruption rather than as a bug in this method.
   */
  destroy(handle: EntityHandle): boolean {
    const index = handleIndex(handle);
    if (!this.#isLive(index, handleGeneration(handle))) {
      return false;
    }

    for (const component of this.#components) {
      component.detachSlot(index);
    }

    this.#alive[index] = 0;
    this.#liveCount -= 1;

    const nextGeneration = (this.#generations[index] as number) + 1;
    this.#generations[index] = nextGeneration;
    if (nextGeneration <= MAX_ENTITY_GENERATION) {
      this.#pushFree(index);
    }
    // Otherwise the slot is retired: no generation left that a handle could
    // encode, so reusing it would eventually alias a handle issued long ago.
    // Retirement costs one slot out of 2^20 per 4095 lifetimes.
    return true;
  }

  /** Whether a handle refers to a live entity. Two typed-array reads, no allocation. */
  isAlive(handle: EntityHandle): boolean {
    return this.#isLive(handleIndex(handle), handleGeneration(handle));
  }

  /**
   * Whether a handle once referred to an entity that no longer exists.
   *
   * `NULL_ENTITY` is not stale — it is the documented absence of a reference,
   * and code that stores `0` for "unaffiliated" should not be told it holds a
   * dangling pointer.
   */
  isStale(handle: EntityHandle): boolean {
    return handle !== NULL_ENTITY && !this.isAlive(handle);
  }

  /**
   * Resolves a handle to its slot index, throwing `StaleHandleError` if the
   * entity is gone. Never returns the slot's new occupant.
   */
  slotOf(handle: EntityHandle): number {
    const index = handleIndex(handle);
    const generation = handleGeneration(handle);
    if (!this.#isLive(index, generation)) {
      throw new StaleHandleError(handle, index, generation, this.#generations[index] ?? 0);
    }
    return index;
  }

  /** Like {@link slotOf}, but returns {@link NO_SLOT} instead of throwing. */
  trySlotOf(handle: EntityHandle): number {
    const index = handleIndex(handle);
    return this.#isLive(index, handleGeneration(handle)) ? index : NO_SLOT;
  }

  /** The handle currently occupying a slot, or `NULL_ENTITY` if it is free. */
  handleAt(slot: number): EntityHandle {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.#slotCount) {
      return NULL_ENTITY;
    }
    if ((this.#alive[slot] ?? 0) === 0) {
      return NULL_ENTITY;
    }
    return makeHandle(slot, this.#generations[slot] as number);
  }

  /**
   * Visits every live entity in ascending slot index order.
   *
   * Index order, not creation order: the visit sequence is a function of which
   * slots are occupied, so two peers that reached the same state by different
   * routes still iterate identically.
   */
  forEach(visit: (handle: EntityHandle, slot: number) => void): void {
    for (let slot = 0; slot < this.#slotCount; slot += 1) {
      if ((this.#alive[slot] ?? 0) === 1) {
        visit(makeHandle(slot, this.#generations[slot] as number), slot);
      }
    }
  }

  /** Live slot indices in ascending order, as a fresh array. */
  liveSlots(): Uint32Array {
    const slots = new Uint32Array(this.#liveCount);
    let count = 0;
    for (let slot = 0; slot < this.#slotCount; slot += 1) {
      if ((this.#alive[slot] ?? 0) === 1) {
        slots[count] = slot;
        count += 1;
      }
    }
    return slots;
  }

  /**
   * Copies this store's slot bookkeeping into another store, replacing what it
   * held. Components are *not* copied — `SimState.clone` copies those through
   * `ComponentStore.cloneStateInto`, so each store's registration order stays
   * the one its own constructor established.
   *
   * The free list is copied verbatim, top included. Rebuilding it from the
   * dead slots would be tempting and wrong: the list is LIFO, so its *order*
   * decides which slot the next `create` returns, and a clone that reordered
   * it would hand out different entity IDs than the original for the same
   * subsequent actions. That is a desync, discovered a month later.
   *
   * @internal Consumers clone states, not stores.
   */
  cloneStateInto(target: EntityStore): void {
    if (target.#maxSlots !== this.#maxSlots) {
      throw new Error(
        `Cannot clone an entity store with maxSlots ${this.#maxSlots} into one with ${target.#maxSlots}.`,
      );
    }
    target.#generations = this.#generations.slice();
    target.#alive = this.#alive.slice();
    target.#freeSlots = this.#freeSlots.slice();
    target.#freeTop = this.#freeTop;
    target.#slotCount = this.#slotCount;
    target.#liveCount = this.#liveCount;
  }

  /**
   * The store's slot bookkeeping, for the serializer. Arrays are views into
   * live storage, truncated to the meaningful prefix — read them, do not keep
   * them across a mutation.
   *
   * @internal
   */
  rawSlotState(): {
    readonly generations: Uint16Array;
    readonly alive: Uint8Array;
    readonly freeList: Uint32Array;
    readonly slotCount: number;
    readonly liveCount: number;
  } {
    return {
      generations: this.#generations.subarray(0, this.#slotCount),
      alive: this.#alive.subarray(0, this.#slotCount),
      freeList: this.#freeSlots.subarray(0, this.#freeTop),
      slotCount: this.#slotCount,
      liveCount: this.#liveCount,
    };
  }

  /**
   * Rebuilds slot bookkeeping from a snapshot, for the deserializer.
   *
   * Validates rather than trusts: a snapshot is an input from outside the
   * process — off disk, or off a network in `pvp-server` — and a free list
   * naming a live slot would hand that slot to a second entity. `world-
   * persistence` requires a descriptive failure over a partially populated
   * state, and this is where most of that requirement is enforced.
   *
   * @internal
   */
  restoreSlotState(input: {
    readonly generations: Uint16Array;
    readonly alive: Uint8Array;
    readonly freeList: Uint32Array;
  }): void {
    const slotCount = input.generations.length;
    if (input.alive.length !== slotCount) {
      throw new Error(
        `Snapshot entity store is inconsistent: ${slotCount} generations but ${input.alive.length} liveness flags.`,
      );
    }
    if (slotCount > this.#maxSlots) {
      throw new Error(
        `Snapshot declares ${slotCount} entity slots, above this store's maximum of ${this.#maxSlots}.`,
      );
    }

    let liveCount = 0;
    for (let slot = 0; slot < slotCount; slot += 1) {
      const generation = input.generations[slot] as number;
      const alive = input.alive[slot] as number;
      if (alive !== 0 && alive !== 1) {
        throw new Error(`Snapshot slot ${slot} has liveness flag ${alive}; expected 0 or 1.`);
      }
      if (generation < 1 || generation > MAX_ENTITY_GENERATION + 1) {
        throw new Error(
          `Snapshot slot ${slot} has generation ${generation}, outside 1..${MAX_ENTITY_GENERATION + 1}.`,
        );
      }
      if (alive === 1) {
        liveCount += 1;
        if (generation > MAX_ENTITY_GENERATION) {
          throw new Error(
            `Snapshot slot ${slot} is live at retirement generation ${generation}, which no handle can encode.`,
          );
        }
      }
    }

    const seenFree = new Set<number>();
    for (let i = 0; i < input.freeList.length; i += 1) {
      const slot = input.freeList[i] as number;
      if (slot >= slotCount) {
        throw new Error(
          `Snapshot free list names slot ${slot}, but only ${slotCount} slots exist.`,
        );
      }
      if ((input.alive[slot] as number) === 1) {
        throw new Error(`Snapshot free list names slot ${slot}, which is live.`);
      }
      if (seenFree.has(slot)) {
        throw new Error(`Snapshot free list names slot ${slot} twice.`);
      }
      // A retired slot must never be reusable. `destroy` already declines to
      // free one, so no genuine snapshot can contain this — but a corrupted or
      // hand-crafted one can, and without this check it loads *successfully*
      // and then throws from the next unrelated `create()`, with an error that
      // says nothing about snapshots. That is the failure this spec's "reject
      // with a descriptive error rather than returning a partial state" exists
      // to prevent: the state here is not partial, it is fully formed, plausible
      // and wrong.
      if ((input.generations[slot] as number) > MAX_ENTITY_GENERATION) {
        throw new Error(
          `Snapshot free list names slot ${slot}, which is retired at generation ` +
            `${input.generations[slot] as number}. A retired slot has no generation left for a ` +
            'handle to encode and must never be reused.',
        );
      }
      seenFree.add(slot);
    }

    this.#ensureCapacity(Math.max(slotCount, 1));
    this.#generations.fill(0);
    this.#alive.fill(0);
    this.#generations.set(input.generations);
    this.#alive.set(input.alive);
    this.#freeSlots = input.freeList.slice();
    this.#freeTop = input.freeList.length;
    this.#slotCount = slotCount;
    this.#liveCount = liveCount;
  }

  /**
   * The generation check, in one place.
   *
   * `?? 0` is not defensive noise: an out-of-range slot yields 0, and 0 is not
   * a legal handle generation, so a forged or foreign handle falls out as dead
   * without a separate bounds branch.
   */
  #isLive(index: number, generation: number): boolean {
    return (this.#alive[index] ?? 0) === 1 && (this.#generations[index] ?? 0) === generation;
  }

  #pushFree(index: number): void {
    if (this.#freeTop >= this.#freeSlots.length) {
      const grown = new Uint32Array(Math.max(this.#freeSlots.length * 2, MIN_CAPACITY));
      grown.set(this.#freeSlots);
      this.#freeSlots = grown;
    }
    this.#freeSlots[this.#freeTop] = index;
    this.#freeTop += 1;
  }

  #ensureCapacity(needed: number): void {
    let capacity = this.#generations.length;
    if (capacity >= needed) {
      return;
    }
    while (capacity < needed) {
      capacity = Math.max(capacity * 2, MIN_CAPACITY);
    }
    capacity = Math.min(capacity, this.#maxSlots);

    const generations = new Uint16Array(capacity);
    generations.set(this.#generations);
    this.#generations = generations;

    const alive = new Uint8Array(capacity);
    alive.set(this.#alive);
    this.#alive = alive;
  }
}
