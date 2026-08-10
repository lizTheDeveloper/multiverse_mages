/*
 * Multiverse Mages — entity handle codec tests.
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

import { describe, expect, it } from 'vitest';

import {
  ENTITY_GENERATION_BITS,
  ENTITY_INDEX_BITS,
  MAX_ENTITY_GENERATION,
  MAX_ENTITY_SLOTS,
  NULL_ENTITY,
  StaleHandleError,
  handleGeneration,
  handleIndex,
  makeHandle,
} from '@mm/sim-core';

describe('entity handle layout', () => {
  it('packs an index and a generation into a uint32', () => {
    expect(ENTITY_INDEX_BITS + ENTITY_GENERATION_BITS).toBe(32);
    expect(MAX_ENTITY_SLOTS).toBe(2 ** ENTITY_INDEX_BITS);
    expect(MAX_ENTITY_GENERATION).toBe(2 ** ENTITY_GENERATION_BITS - 1);
  });

  it('reserves handle 0, which no valid (index, generation) pair can produce', () => {
    expect(NULL_ENTITY).toBe(0);
    // Generation 0 is the only pairing that could yield handle 0, so it is not
    // a legal generation at all.
    expect(() => makeHandle(0, 0)).toThrow(RangeError);
    expect(makeHandle(0, 1)).not.toBe(NULL_ENTITY);
  });

  it('round-trips index and generation at the boundaries', () => {
    const pairs: ReadonlyArray<readonly [number, number]> = [
      [0, 1],
      [1, 1],
      [0, MAX_ENTITY_GENERATION],
      [MAX_ENTITY_SLOTS - 1, 1],
      [MAX_ENTITY_SLOTS - 1, MAX_ENTITY_GENERATION],
      [12345, 678],
    ];

    for (const [index, generation] of pairs) {
      const handle = makeHandle(index, generation);
      expect(handleIndex(handle)).toBe(index);
      expect(handleGeneration(handle)).toBe(generation);
    }
  });

  it('produces an unsigned 32-bit integer even at the top of the range', () => {
    // (4095 << 20) overflows int32 and goes negative without an explicit
    // unsigned coercion. This is the bug that silently breaks handle equality.
    const handle = makeHandle(MAX_ENTITY_SLOTS - 1, MAX_ENTITY_GENERATION);
    expect(handle).toBeGreaterThan(0);
    expect(handle).toBe(0xffffffff);
    expect(Number.isInteger(handle)).toBe(true);
  });

  it('is injective: distinct pairs never collide', () => {
    const seen = new Set<number>();
    for (let index = 0; index < 64; index += 1) {
      for (let generation = 1; generation <= 64; generation += 1) {
        const handle = makeHandle(index, generation);
        expect(seen.has(handle)).toBe(false);
        seen.add(handle);
      }
    }
    expect(seen.size).toBe(64 * 64);
  });

  it('rejects out-of-range and non-integer components', () => {
    expect(() => makeHandle(-1, 1)).toThrow(RangeError);
    expect(() => makeHandle(MAX_ENTITY_SLOTS, 1)).toThrow(RangeError);
    expect(() => makeHandle(0, MAX_ENTITY_GENERATION + 1)).toThrow(RangeError);
    expect(() => makeHandle(1.5, 1)).toThrow(RangeError);
    expect(() => makeHandle(0, Number.NaN)).toThrow(RangeError);
  });
});

describe('StaleHandleError', () => {
  it('reports the handle, its generation, and the generation actually in the slot', () => {
    const error = new StaleHandleError(makeHandle(7, 3), 7, 3, 5);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StaleHandleError');
    expect(error.handle).toBe(makeHandle(7, 3));
    expect(error.index).toBe(7);
    expect(error.generation).toBe(3);
    expect(error.slotGeneration).toBe(5);
    expect(error.message).toContain('7');
  });
});
