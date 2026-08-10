/*
 * Multiverse Mages — generational entity handles.
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
 * A runtime entity reference: a `uint32` packing a slot index and the
 * generation that slot held when the handle was issued
 * (`docs/design/contracts.md` §0).
 *
 * It is a plain `number` rather than a branded type on purpose. Handles are
 * stored inside `Uint32Array` component fields (`universityId`, `locationId`,
 * `sourceId`, …), and a brand would force a cast at every read out of a typed
 * array, all over the codebase, for a mistake the generation check already
 * catches at runtime: a bare slot index used as a handle decodes to generation
 * 0, which no live slot ever holds, so it resolves as stale.
 */
export type EntityHandle = number;

/**
 * Bits of a handle given to the slot index. 20 bits is 1,048,576 slots, which
 * is far above the mage populations the Monte Carlo harness will run and still
 * leaves a generation counter wide enough to be useful.
 */
export const ENTITY_INDEX_BITS = 20;

/** Bits of a handle given to the generation counter. */
export const ENTITY_GENERATION_BITS = 32 - ENTITY_INDEX_BITS;

/** Number of distinct slots a store can address. */
export const MAX_ENTITY_SLOTS = 1 << ENTITY_INDEX_BITS;

/**
 * Highest generation a slot can reach. A slot that would need to exceed it is
 * retired instead of reused, so a handle can never alias a later occupant —
 * see `EntityStore.destroy`.
 */
export const MAX_ENTITY_GENERATION = (1 << ENTITY_GENERATION_BITS) - 1;

const ENTITY_INDEX_MASK = MAX_ENTITY_SLOTS - 1;

/**
 * The reserved null reference. `docs/design/contracts.md` §0: absent references
 * are `0`, never `-1` or `undefined`, and handle `0` is never allocated.
 *
 * It is unreachable by construction rather than by convention: generation 0 is
 * not a legal generation, so no `(index, generation)` pair encodes to 0.
 */
export const NULL_ENTITY: EntityHandle = 0;

/** Thrown when a handle is resolved after the entity it referred to was destroyed. */
export class StaleHandleError extends Error {
  /** The handle that failed to resolve. */
  readonly handle: EntityHandle;
  /** Slot index the handle referred to. */
  readonly index: number;
  /** Generation the handle was issued with. */
  readonly generation: number;
  /** Generation the slot holds now — higher than `generation` once freed. */
  readonly slotGeneration: number;

  constructor(handle: EntityHandle, index: number, generation: number, slotGeneration: number) {
    super(
      `Stale entity handle ${handle}: slot ${index} was generation ${generation} when the handle ` +
        `was issued and is generation ${slotGeneration} now. The entity was destroyed.`,
    );
    this.name = 'StaleHandleError';
    this.handle = handle;
    this.index = index;
    this.generation = generation;
    this.slotGeneration = slotGeneration;
  }
}

const isSlotIndex = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < MAX_ENTITY_SLOTS;

const isGeneration = (value: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= MAX_ENTITY_GENERATION;

/**
 * Packs a slot index and generation into a handle.
 *
 * The `>>> 0` is load-bearing, not decoration: at the top of the range
 * `(4095 << 20)` overflows a signed 32-bit intermediate and comes back
 * negative, which would break handle equality for the oldest slots only — the
 * kind of defect that surfaces after a long Monte Carlo run and nowhere else.
 */
export const makeHandle = (index: number, generation: number): EntityHandle => {
  if (!isSlotIndex(index)) {
    throw new RangeError(`Entity slot index out of range: ${index} (0..${MAX_ENTITY_SLOTS - 1})`);
  }
  if (!isGeneration(generation)) {
    throw new RangeError(
      `Entity generation out of range: ${generation} (1..${MAX_ENTITY_GENERATION}). ` +
        'Generation 0 is illegal so that handle 0 stays reserved.',
    );
  }
  return ((generation << ENTITY_INDEX_BITS) | index) >>> 0;
};

/** Slot index a handle refers to. Says nothing about whether it is still live. */
export const handleIndex = (handle: EntityHandle): number => handle & ENTITY_INDEX_MASK;

/** Generation a handle was issued with. `0` for `NULL_ENTITY` and for raw slot indices. */
export const handleGeneration = (handle: EntityHandle): number => handle >>> ENTITY_INDEX_BITS;
