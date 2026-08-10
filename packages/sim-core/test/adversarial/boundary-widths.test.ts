/*
 * Multiverse Mages — adversarial: field-width boundary values.
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

import { createState } from '../../src/state.js';
import { deserializeState, serializeState, snapshotHash } from '../../src/snapshot/snapshot.js';
import { widthWorld, widths } from './fixtures.js';

/**
 * snapshot.ts's own comment claims every field value is carried as "the raw
 * 32-bit two's-complement pattern" and that this is what lets an i32 of -1 and
 * a u32 of 4294967295 share one code path. That is true for 32-bit fields, but
 * a narrower signed field (i8, i16) is read out of its typed array already
 * *sign-extended* to a full JS number before `>>> 0` is applied — so an i8 of
 * -1 is NOT written as 0x000000FF (its true 8-bit pattern) but as 0xFFFFFFFF
 * (full sign extension). That is only safe because the reverse assignment
 * (`arrays[field][row] = value`) re-narrows through the typed array's own
 * ToInt8/ToUint8 coercion, which discards the high bits again. These tests
 * exist to confirm that re-narrowing actually holds at every boundary named in
 * the task brief, rather than trusting the comment's "same bits" claim at face
 * value for widths where it is not literally true.
 */
describe('field width boundaries round-trip exactly', () => {
  const cases: { readonly field: keyof typeof widths.fields; readonly value: number }[] = [
    { field: 'i8', value: -128 }, // INT8_MIN
    { field: 'i8', value: 127 }, // INT8_MAX
    { field: 'u8', value: 0 },
    { field: 'u8', value: 255 }, // UINT8_MAX
    { field: 'i16', value: -32768 }, // INT16_MIN
    { field: 'i16', value: 32767 }, // INT16_MAX
    { field: 'u16', value: 0 },
    { field: 'u16', value: 65535 }, // UINT16_MAX
    { field: 'i32', value: -2147483648 }, // INT32_MIN
    { field: 'i32', value: 2147483647 }, // INT32_MAX
    { field: 'u32', value: 0 },
    { field: 'u32', value: 4294967295 }, // UINT32_MAX
  ];

  for (const { field, value } of cases) {
    it(`${field} = ${value}`, () => {
      const state = createState({ rootSeed: 1, schema: widthWorld });
      const handle = state.entities.create();
      const store = state.component('widths');
      store.add(handle);
      store.set(handle, field, value);

      const restored = deserializeState(serializeState(state), widthWorld);
      expect(restored.component('widths').get(handle, field)).toBe(value);
    });
  }

  it('does not conflate an i8 of -1 with a u32 of the same raw bits by kind confusion', () => {
    // Two states, one entity each, one field of each kind holding the pattern
    // that fully sign-extends: i8 -1 and u32 4294967295. If the kind tag were
    // ever dropped from the comparison the two would hash the same; the field
    // table's kind byte is what must keep them apart.
    const a = createState({ rootSeed: 9, schema: widthWorld });
    const ha = a.entities.create();
    a.component('widths').add(ha);
    a.component('widths').set(ha, 'i8', -1);

    const b = createState({ rootSeed: 9, schema: widthWorld });
    const hb = b.entities.create();
    b.component('widths').add(hb);
    b.component('widths').set(hb, 'u32', 4294967295);

    expect(snapshotHash(a)).not.toBe(snapshotHash(b));
  });
});

/**
 * Task brief: "A value written through `field()` directly (unchecked) rather
 * than `set()` (checked)." `set()` in component.ts rejects non-integers with a
 * TypeError, but `field()` hands back the live typed array with no such guard.
 * Writing a float through it does not corrupt the serializer, because a typed
 * array coerces on assignment (ToInt32 etc.) before the serializer ever reads
 * it back — there is no way to get a non-integer value INTO the array in the
 * first place. This test establishes that the unchecked path is still safe at
 * the serialization boundary, not that it is a good idea.
 */
describe('unchecked field() writes still serialize the coerced value, not the float', () => {
  it('a float written through field() truncates before serialization ever sees it', () => {
    const state = createState({ rootSeed: 2, schema: widthWorld });
    const handle = state.entities.create();
    const store = state.component('widths');
    store.add(handle);
    // Bypasses set()'s Number.isInteger guard entirely.
    store.field('i32')[0] = 3.9 as number;

    const restored = deserializeState(serializeState(state), widthWorld);
    // Int32Array ToInt32 truncates toward zero: 3.9 -> 3.
    expect(restored.component('widths').get(handle, 'i32')).toBe(3);
    expect(Number.isInteger(restored.component('widths').get(handle, 'i32'))).toBe(true);
  });
});
