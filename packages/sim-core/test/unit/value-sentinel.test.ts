/*
 * Multiverse Mages — the component value sentinel, and proof it can fire.
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
 * **A check nobody has watched fail is not a check.**
 *
 * This file exists because `assertRepresentable` in `fixed-point.ts` spent the
 * project's whole history looking exactly like a guard against NaN while being
 * structurally incapable of catching one: it compared against bounds, and every
 * comparison with NaN is false. Nothing in the suite noticed, because nothing
 * had ever made it fail.
 *
 * So every assertion below is about the sentinel's **failing** path. It is
 * injected with NaN, `±Infinity`, `undefined` and a fraction, through both
 * doors into component storage, and each one is checked for the thing the next
 * person actually needs: *which component, which field, which row, which value,
 * which door*. "NaN somewhere" costs that person an afternoon.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { ComponentValueViolation } from '@mm/sim-core';
import {
  createState,
  defineWorld,
  installValueSentinel,
  valueSentinelInstalled,
} from '@mm/sim-core';

const CANARY = { name: 'sentinelCanary', fields: { magnitude: 'i32', count: 'u16' } } as const;

/** A world with one component, and one entity carrying it. */
function canary(): {
  store: ReturnType<ReturnType<typeof createState>['component']>;
  handle: number;
  row: number;
} {
  const schema = defineWorld({ components: [CANARY], systems: [] });
  const state = createState({ rootSeed: 1, schema });
  const handle = state.entities.create();
  const store = state.component(CANARY.name);
  const row = store.add(handle);
  return { store, handle, row };
}

/** Installs a recording sentinel and hands back the list it fills. */
function recording(): ComponentValueViolation[] {
  const seen: ComponentValueViolation[] = [];
  installValueSentinel((violation) => seen.push(violation));
  return seen;
}

afterEach(() => {
  installValueSentinel(undefined);
});

describe('the value sentinel is off by default', () => {
  it('reports that it is not installed, and hands out the raw typed array', () => {
    expect(valueSentinelInstalled()).toBe(false);
    const { store } = canary();
    const array = store.field('magnitude');
    // Not a Proxy: a raw Int32Array is an instance of the concrete class and
    // `ArrayBuffer.isView` agrees. This is the zero-cost path the hot loops run.
    expect(ArrayBuffer.isView(array)).toBe(true);
    expect(array).toBeInstanceOf(Int32Array);
  });

  it('restores the previous sentinel, so nesting cannot strand one', () => {
    const outer = (): void => undefined;
    expect(installValueSentinel(outer)).toBeUndefined();
    const previous = installValueSentinel(() => undefined);
    expect(previous).toBe(outer);
    expect(installValueSentinel(previous)).not.toBe(outer);
    expect(valueSentinelInstalled()).toBe(true);
  });
});

describe('the unchecked door — field(), where a NaN would have vanished', () => {
  it('catches an injected NaN and names component, field, row, value and door', () => {
    const seen = recording();
    const { store, row } = canary();

    store.field('magnitude')[row] = Number.NaN;

    expect(seen).toHaveLength(1);
    const violation = seen[0] as ComponentValueViolation;
    expect(violation.component).toBe('sentinelCanary');
    expect(violation.field).toBe('magnitude');
    expect(violation.row).toBe(row);
    expect(violation.door).toBe('field');
    expect(Number.isNaN(violation.value)).toBe(true);
  });

  it('catches the same defect wearing its other masks', () => {
    const seen = recording();
    const { store, row } = canary();
    const magnitude = store.field('magnitude');

    magnitude[row] = Number.POSITIVE_INFINITY;
    magnitude[row] = Number.NEGATIVE_INFINITY;
    // The shape this bug actually arrives in: a lookup missed, and `undefined`
    // entered arithmetic. TypeScript does not stop it where the declared type
    // is `number` and the value came from a `Map.get`.
    const missed = (new Map<string, number>().get('absent') as number) * 2;
    magnitude[row] = missed;
    magnitude[row] = 0.5;

    expect(seen.map((entry) => String(entry.value))).toEqual([
      'Infinity',
      '-Infinity',
      'NaN',
      '0.5',
    ]);
    expect(seen.every((entry) => entry.door === 'field')).toBe(true);
  });

  it('lets legitimate integer writes through untouched, including negatives and -0', () => {
    const seen = recording();
    const { store, handle, row } = canary();
    const magnitude = store.field('magnitude');

    magnitude[row] = 1024;
    expect(store.get(handle, 'magnitude')).toBe(1024);
    magnitude[row] = -2048;
    expect(store.get(handle, 'magnitude')).toBe(-2048);
    // `-0` is an integer and every integer typed array stores it as `+0`, so it
    // can never reach a snapshot. Admitted deliberately rather than by oversight.
    magnitude[row] = -0;
    expect(Object.is(store.get(handle, 'magnitude'), 0)).toBe(true);

    expect(seen).toEqual([]);
  });

  it('keeps the typed array usable, because the snapshot writer calls methods on it', () => {
    recording();
    const { store } = canary();
    const magnitude = store.field('magnitude');
    // A Proxy that forwarded itself as the receiver would make every one of
    // these throw `TypeError: not a typed array`.
    expect(() => magnitude.subarray(0, 1)).not.toThrow();
    expect(() => magnitude.slice()).not.toThrow();
    expect(magnitude.length).toBeGreaterThan(0);
    expect(magnitude.BYTES_PER_ELEMENT).toBe(4);
  });
});

describe('the checked door — set(), which throws as well as reports', () => {
  it('reports the violation and then refuses the write', () => {
    const seen = recording();
    const { store, handle } = canary();

    expect(() => {
      store.set(handle, 'magnitude', Number.NaN);
    }).toThrow(TypeError);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.door).toBe('set');
    expect(seen[0]?.field).toBe('magnitude');
    expect(store.get(handle, 'magnitude')).toBe(0);
  });

  it('says something a reader can act on, not "NaN somewhere"', () => {
    const { store, handle } = canary();
    let message = '';
    try {
      store.set(handle, 'count', Number.POSITIVE_INFINITY);
    } catch (error) {
      message = String(error);
    }
    // The four facts the next person needs, in the message itself.
    expect(message).toContain('sentinelCanary');
    expect(message).toContain('count');
    expect(message).toContain('Infinity');
    expect(message).toContain('row 0');
  });
});
