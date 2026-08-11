/*
 * Multiverse Mages — canonical serialization, the bytes half of reproducibility.
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

import { canonicalHash, canonicalJson, sha256Hex } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

describe('canonical JSON fixes key order', () => {
  it('serializes two differently-ordered objects to the same bytes', () => {
    const left = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const right = { c: { y: 2, z: 1 }, a: 2, b: 1 };
    expect(canonicalJson(left)).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
    expect(canonicalJson(right)).toBe(canonicalJson(left));

    // The control: plain JSON.stringify does not, which is why this exists.
    expect(JSON.stringify(right)).not.toBe(JSON.stringify(left));
  });

  it('preserves array order, which is data rather than presentation', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 1, 2]));
  });

  it('normalizes negative zero', () => {
    expect(canonicalJson({ v: -0 })).toBe('{"v":0}');
  });
});

describe('canonical JSON refuses what JSON cannot carry faithfully', () => {
  it('names the field for NaN and each infinity', () => {
    expect(() => canonicalJson({ metrics: { a: Number.NaN } })).toThrow(/metrics\.a is NaN/);
    expect(() => canonicalJson({ v: Number.POSITIVE_INFINITY })).toThrow(/\$\.v is Infinity/);
    expect(() => canonicalJson({ v: Number.NEGATIVE_INFINITY })).toThrow(/-Infinity/);
    // The control: JSON.stringify turns all three into null, silently.
    expect(JSON.stringify({ v: Number.NaN })).toBe('{"v":null}');
  });

  it('names the field for an undefined value rather than dropping the key', () => {
    expect(() => canonicalJson({ metrics: { a: undefined } })).toThrow(/metrics\.a is undefined/);
    expect(JSON.stringify({ metrics: { a: undefined } })).toBe('{"metrics":{}}');
  });

  it('refuses a bigint with a message that says which field', () => {
    expect(() => canonicalJson({ v: 1n })).toThrow(/\$\.v is a bigint/);
  });

  it('locates a bad value inside an array', () => {
    expect(() => canonicalJson({ xs: [1, Number.NaN] })).toThrow(/xs\[1\]/);
  });
});

describe('hashing', () => {
  it('agrees with the standard SHA-256 of the empty string', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('gives one hash for two orderings of the same content, and different hashes otherwise', () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
    expect(canonicalHash({ a: 1, b: 2 })).not.toBe(canonicalHash({ a: 1, b: 3 }));
  });
});
