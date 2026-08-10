/*
 * Multiverse Mages — sparse component storage over the entity store.
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

import type { EntityHandle } from './handle.js';
import { handleIndex } from './handle.js';

/**
 * Storage widths a component field may use.
 *
 * Integer kinds only, deliberately: there is no `f32` and there will not be
 * one. Fixed-point values at scale 1/1024 (`contracts.md` §0) are `i32`, which
 * gives a range of roughly ±2,097,152 in game units.
 */
export type ComponentFieldKind = 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32';

/** A component's fields, as a mapping from field name to storage width. */
export type ComponentFields = Readonly<Record<string, ComponentFieldKind>>;

export interface ComponentSpec<F extends ComponentFields> {
  /** Unique within a store. Used in error messages and, later, snapshot tags. */
  readonly name: string;
  readonly fields: F;
}

/** The concrete typed array backing a field of the given kind. */
export type ComponentFieldArray<K extends ComponentFieldKind> = K extends 'i8'
  ? Int8Array
  : K extends 'u8'
    ? Uint8Array
    : K extends 'i16'
      ? Int16Array
      : K extends 'u16'
        ? Uint16Array
        : K extends 'i32'
          ? Int32Array
          : Uint32Array;

type AnyIntArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;

/** Returned by {@link ComponentStore.tryRowOf} when the entity has no row. */
export const NO_ROW = -1;

/** Rows allocated the first time a component is used at all. */
const MIN_ROWS = 8;

/**
 * The minimal view of the entity store a component needs. Declared structurally
 * so this module has no runtime import from `entity-store.ts`, which would
 * otherwise be a cycle.
 */
interface HandleResolver {
  slotOf(handle: EntityHandle): number;
  trySlotOf(handle: EntityHandle): number;
}

const createArray = (kind: ComponentFieldKind, length: number): AnyIntArray => {
  switch (kind) {
    case 'i8':
      return new Int8Array(length);
    case 'u8':
      return new Uint8Array(length);
    case 'i16':
      return new Int16Array(length);
    case 'u16':
      return new Uint16Array(length);
    case 'i32':
      return new Int32Array(length);
    case 'u32':
      return new Uint32Array(length);
  }
};

/**
 * Storage for one component, holding rows only for the entities that carry it.
 *
 * **Sparse on purpose.** `contracts.md` §0 is explicit that world-scale
 * entities have no coordinates and only engagement entities do, and §1.3 makes
 * the populace an aggregate for performance reasons. A component model that
 * gave every slot a row for every component would spend two `int32` per mage on
 * a `position` that never gets read, in every Monte Carlo run. Here, a
 * component nobody carries allocates nothing at all.
 *
 * The layout is a sparse set: `slot -> row` for lookup, dense parallel field
 * arrays for storage, and swap-removal to keep the rows compact. Row order is
 * therefore *not* slot order and is an implementation detail — which is exactly
 * why {@link forEach} and {@link slots} exist and why nothing here hands out
 * raw row order. Iteration is always ascending slot index.
 */
export class ComponentStore<F extends ComponentFields> {
  readonly name: string;

  /** Field names in declaration order. */
  readonly fieldNames: readonly Extract<keyof F, string>[];

  readonly #resolver: HandleResolver;
  readonly #kinds: ReadonlyMap<string, ComponentFieldKind>;
  readonly #arrays = new Map<string, AnyIntArray>();

  /** `slot -> row + 1`, where 0 means "this entity does not carry the component". */
  #sparse = new Uint32Array(0);

  /** Handle occupying each row, so iteration can hand back handles. */
  #rowHandles = new Uint32Array(0);

  #size = 0;

  /** Ascending slot order, rebuilt lazily after any structural change. */
  #order = new Uint32Array(0);
  #orderDirty = false;

  constructor(resolver: HandleResolver, spec: ComponentSpec<F>) {
    const fieldNames = Object.keys(spec.fields) as Extract<keyof F, string>[];
    if (fieldNames.length === 0) {
      throw new Error(`Component "${spec.name}" must declare at least one field.`);
    }
    const kinds = new Map<string, ComponentFieldKind>();
    for (const fieldName of fieldNames) {
      kinds.set(fieldName, spec.fields[fieldName] as ComponentFieldKind);
      this.#arrays.set(fieldName, createArray(spec.fields[fieldName] as ComponentFieldKind, 0));
    }

    this.name = spec.name;
    this.fieldNames = fieldNames;
    this.#resolver = resolver;
    this.#kinds = kinds;
  }

  /** Entities currently carrying this component. */
  get size(): number {
    return this.#size;
  }

  /** Rows allocated in the backing arrays. Zero until the first {@link add}. */
  get rowCapacity(): number {
    return this.#rowHandles.length;
  }

  /** Total bytes this component currently occupies, sparse index included. */
  get byteLength(): number {
    let bytes = this.#sparse.byteLength + this.#rowHandles.byteLength;
    for (const array of this.#arrays.values()) {
      bytes += array.byteLength;
    }
    return bytes;
  }

  /**
   * The typed array backing a field. Rows are addressed by the row index from
   * {@link forEach}, {@link rowOf}, or {@link add}.
   *
   * This is the unchecked hot path — bulk rules code should take the array once
   * per pass and index it. **Re-fetch it after any `add`**: growing the
   * component replaces the array, and a reference captured beforehand would
   * keep writing into the abandoned buffer. Call {@link reserve} first if a
   * pass both adds and writes.
   */
  field<K extends Extract<keyof F, string>>(name: K): ComponentFieldArray<F[K]> {
    const array = this.#arrays.get(name);
    if (array === undefined) {
      throw new Error(`Component "${this.name}" has no field "${name}".`);
    }
    return array as ComponentFieldArray<F[K]>;
  }

  /** Whether a live entity carries this component. A stale handle is always `false`. */
  has(handle: EntityHandle): boolean {
    const slot = this.#resolver.trySlotOf(handle);
    return slot >= 0 && (this.#sparse[slot] ?? 0) !== 0;
  }

  /**
   * Attaches the component to an entity and returns its row, zeroing the row's
   * fields first so a recycled row never carries the previous occupant's data.
   *
   * Idempotent: attaching twice returns the existing row and keeps its values.
   * Throws `StaleHandleError` for a handle whose entity is gone.
   */
  add(handle: EntityHandle): number {
    const slot = this.#resolver.slotOf(handle);
    const existing = this.#sparse[slot] ?? 0;
    if (existing !== 0) {
      return existing - 1;
    }

    const row = this.#size;
    this.#size += 1;
    this.#ensureRows(this.#size);
    this.#ensureSparse(slot + 1);

    this.#sparse[slot] = row + 1;
    this.#rowHandles[row] = handle;
    for (const array of this.#arrays.values()) {
      array[row] = 0;
    }
    this.#orderDirty = true;
    return row;
  }

  /**
   * Detaches the component from an entity. Returns `false` if it did not carry
   * it, including when the handle is stale — a stale handle must never detach
   * the component of whoever moved into the slot.
   */
  remove(handle: EntityHandle): boolean {
    const slot = this.#resolver.trySlotOf(handle);
    return slot >= 0 && this.#detach(slot);
  }

  /**
   * Detaches by slot, skipping handle validation.
   *
   * Internal: called by `EntityStore.destroy`, which has already established
   * that the slot is being vacated. Application code should use
   * {@link remove}.
   */
  detachSlot(slot: number): void {
    this.#detach(slot);
  }

  /** Row for an entity, throwing if the handle is stale or carries no row. */
  rowOf(handle: EntityHandle): number {
    const slot = this.#resolver.slotOf(handle);
    const packed = this.#sparse[slot] ?? 0;
    if (packed === 0) {
      throw new Error(`Entity in slot ${slot} does not carry component "${this.name}".`);
    }
    return packed - 1;
  }

  /** Like {@link rowOf}, but returns {@link NO_ROW} instead of throwing. */
  tryRowOf(handle: EntityHandle): number {
    const slot = this.#resolver.trySlotOf(handle);
    if (slot < 0) {
      return NO_ROW;
    }
    const packed = this.#sparse[slot] ?? 0;
    return packed === 0 ? NO_ROW : packed - 1;
  }

  /** Reads one field. Checked and convenient; {@link field} is the bulk path. */
  get<K extends Extract<keyof F, string>>(handle: EntityHandle, name: K): number {
    const array = this.#arrays.get(name);
    if (array === undefined) {
      throw new Error(`Component "${this.name}" has no field "${name}".`);
    }
    return array[this.rowOf(handle)] as number;
  }

  /**
   * Writes one field.
   *
   * Rejects non-integers rather than letting a typed array truncate them
   * silently. The rules path is float-free, and a value that arrived as `0.5`
   * is a bug at its source, not something to round here.
   */
  set<K extends Extract<keyof F, string>>(handle: EntityHandle, name: K, value: number): void {
    const array = this.#arrays.get(name);
    if (array === undefined) {
      throw new Error(`Component "${this.name}" has no field "${name}".`);
    }
    const row = this.rowOf(handle);
    if (!Number.isInteger(value)) {
      throw new TypeError(
        `Component "${this.name}" field "${name}" takes an integer, got ${value}. ` +
          'The rules path is float-free — fixed-point values are integers at scale 1/1024.',
      );
    }
    array[row] = value;
  }

  /** The handle occupying a row. */
  handleOfRow(row: number): EntityHandle {
    if (!Number.isInteger(row) || row < 0 || row >= this.#size) {
      throw new RangeError(`Row ${row} is out of range for component "${this.name}".`);
    }
    return this.#rowHandles[row] as EntityHandle;
  }

  /** Slot indices carrying this component, ascending, as a fresh array. */
  slots(): Uint32Array {
    return this.#ascendingSlots().slice();
  }

  /**
   * Visits every entity carrying this component in ascending slot index order.
   *
   * Never row order. Rows move under swap-removal, so row order depends on the
   * destruction history — iterating it would make results depend on how the
   * state was reached rather than on what it is.
   */
  forEach(visit: (row: number, handle: EntityHandle, slot: number) => void): void {
    const order = this.#ascendingSlots();
    for (let i = 0; i < order.length; i += 1) {
      const slot = order[i] as number;
      const row = (this.#sparse[slot] ?? 0) - 1;
      visit(row, this.#rowHandles[row] as EntityHandle, slot);
    }
  }

  /**
   * Copies this component's entire storage into another component of the same
   * shape, replacing whatever it held.
   *
   * Used by `SimState.clone`, which runs on every `step`. It copies the raw
   * layout — row order included — rather than rebuilding through {@link add},
   * because a step that paid a canonical re-sort per component per tick would
   * make the Monte Carlo harness the bottleneck it exists to avoid. Row order
   * is unobservable anyway: every iteration path here is slot-ordered.
   *
   * @internal Consumers clone states, not components.
   */
  cloneStateInto(target: ComponentStore<F>): void {
    if (target.name !== this.name) {
      throw new Error(`Cannot clone component "${this.name}" into "${target.name}".`);
    }
    target.#sparse = this.#sparse.slice();
    target.#rowHandles = this.#rowHandles.slice();
    target.#size = this.#size;
    for (const [fieldName, array] of this.#arrays) {
      target.#arrays.set(fieldName, array.slice() as AnyIntArray);
    }
    // Cheaper to let the target rebuild its order lazily than to copy a cache.
    target.#order = new Uint32Array(0);
    target.#orderDirty = true;
  }

  /** Pre-grows the backing arrays so a bulk pass can cache {@link field} results. */
  reserve(rows: number): void {
    if (!Number.isInteger(rows) || rows < 0) {
      throw new RangeError(`reserve expects a non-negative integer, got ${rows}`);
    }
    this.#ensureRows(rows);
  }

  #detach(slot: number): boolean {
    const packed = this.#sparse[slot] ?? 0;
    if (packed === 0) {
      return false;
    }

    const row = packed - 1;
    const last = this.#size - 1;
    if (row !== last) {
      // Swap-remove: the last row moves down into the hole.
      const movedHandle = this.#rowHandles[last] as EntityHandle;
      this.#rowHandles[row] = movedHandle;
      for (const array of this.#arrays.values()) {
        array[row] = array[last] as number;
      }
      this.#sparse[handleIndex(movedHandle)] = row + 1;
    }

    this.#size = last;
    this.#sparse[slot] = 0;
    this.#orderDirty = true;
    return true;
  }

  /**
   * Ascending slot order, cached until the membership changes.
   *
   * Sorting a `Uint32Array` of distinct slot indices is a total order with no
   * ties, so the result does not depend on the sort's stability or on the order
   * rows happen to sit in.
   */
  #ascendingSlots(): Uint32Array {
    if (!this.#orderDirty && this.#order.length === this.#size) {
      return this.#order;
    }
    const order = new Uint32Array(this.#size);
    for (let row = 0; row < this.#size; row += 1) {
      order[row] = handleIndex(this.#rowHandles[row] as EntityHandle);
    }
    order.sort();
    this.#order = order;
    this.#orderDirty = false;
    return order;
  }

  #ensureRows(needed: number): void {
    let capacity = this.#rowHandles.length;
    if (capacity >= needed) {
      return;
    }
    while (capacity < needed) {
      capacity = Math.max(capacity * 2, MIN_ROWS);
    }

    const handles = new Uint32Array(capacity);
    handles.set(this.#rowHandles);
    this.#rowHandles = handles;

    for (const [fieldName, array] of this.#arrays) {
      const kind = this.#kinds.get(fieldName) as ComponentFieldKind;
      const grown = createArray(kind, capacity);
      // Element-wise: `set` across the typed-array union needs a cast that
      // would be a lie, and growth is geometric so this runs rarely.
      for (let i = 0; i < array.length; i += 1) {
        grown[i] = array[i] as number;
      }
      this.#arrays.set(fieldName, grown);
    }
  }

  #ensureSparse(needed: number): void {
    if (this.#sparse.length >= needed) {
      return;
    }
    let capacity = Math.max(this.#sparse.length, MIN_ROWS);
    while (capacity < needed) {
      capacity = capacity * 2;
    }
    const sparse = new Uint32Array(capacity);
    sparse.set(this.#sparse);
    this.#sparse = sparse;
  }
}
