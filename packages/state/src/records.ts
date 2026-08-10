/*
 * Multiverse Mages — reading and writing whole component rows.
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
 * Whole-row access for the component layouts in `./components.ts`.
 *
 * These are the *convenient* path, not the hot path. Bulk rules code should
 * take `ComponentStore.field(...)` once per pass and index the typed array
 * directly; a per-entity object allocation inside a Monte Carlo inner loop is
 * exactly the cost the struct-of-arrays layout exists to avoid. What these are
 * for is setup, tests, tooling, and the once-per-tick singletons — where the
 * alternative is ten `set` calls in a row and a field quietly forgotten.
 *
 * Forgetting a field is the specific failure here. `ComponentStore.add` zeroes
 * a row, so an unwritten field is `0` — a plausible value for nearly everything
 * in §1, and a *wrong* one. {@link attachRecord} takes the whole record, so the
 * type checker requires every field.
 */

import type { ComponentFields, ComponentSpec, EntityHandle, SimState } from '@mm/sim-core';

import { componentOf } from './components.js';

/** A whole row as plain integers, keyed by the layout's field names. */
export type RowOf<F extends ComponentFields> = { [K in Extract<keyof F, string>]: number };

/**
 * Attaches a component to an entity and writes every field.
 *
 * Idempotent in the same way `ComponentStore.add` is: attaching twice keeps the
 * row and overwrites its values.
 */
export function attachRecord<F extends ComponentFields>(
  state: SimState,
  spec: ComponentSpec<F>,
  handle: EntityHandle,
  row: RowOf<F>,
): void {
  const store = componentOf(state, spec);
  store.add(handle);
  for (const name of store.fieldNames) {
    store.set(handle, name, row[name as Extract<keyof F, string>]);
  }
}

/** Reads a whole row. Throws if the entity does not carry the component. */
export function readRecord<F extends ComponentFields>(
  state: SimState,
  spec: ComponentSpec<F>,
  handle: EntityHandle,
): RowOf<F> {
  const store = componentOf(state, spec);
  const row = {} as RowOf<F>;
  for (const name of store.fieldNames) {
    row[name as Extract<keyof F, string>] = store.get(handle, name);
  }
  return row;
}

/**
 * Every row of a component, in ascending slot order, with its handle.
 *
 * Ascending slot order, never row order: rows move under swap-removal, so row
 * order depends on the destruction history. A caller that iterated it would
 * make its results depend on how the state was reached rather than on what it
 * is — which is a desync between two peers that agree on every value.
 */
export function collectRecords<F extends ComponentFields>(
  state: SimState,
  spec: ComponentSpec<F>,
): { handle: EntityHandle; row: RowOf<F> }[] {
  const store = componentOf(state, spec);
  const arrays = store.fieldNames.map((name) => ({ name, array: store.field(name) }));
  const out: { handle: EntityHandle; row: RowOf<F> }[] = [];
  store.forEach((rowIndex, handle) => {
    const row = {} as RowOf<F>;
    for (const field of arrays) {
      row[field.name as Extract<keyof F, string>] = field.array[rowIndex] as number;
    }
    out.push({ handle, row });
  });
  return out;
}
