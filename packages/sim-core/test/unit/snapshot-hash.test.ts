/*
 * Multiverse Mages — known-answer and sensitivity tests for the snapshot hash.
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
 * The snapshot hash is load-bearing for three separate things: replay
 * verification, golden fixture equality, and later multiplayer desync
 * detection. All three are claims that two machines computed the same bytes,
 * so the tests here are layered to say *which* property broke.
 *
 * 1. `FNV-1a 64 known answers` — external truth. These digests are the
 *    published FNV-1a 64-bit test vectors, not values captured from this
 *    implementation. A hash can be perfectly self-consistent and still be the
 *    wrong function; only an outside vector catches that, and only an outside
 *    vector lets a second implementation (a Rust server, a replay tool) agree
 *    with this one without reverse-engineering it.
 * 2. Shape — always 16 lowercase hex characters, for every input including the
 *    degenerate ones. Snapshot hashes get compared as strings and printed into
 *    fixtures, so a digest that sometimes loses a leading zero would corrupt
 *    fixtures rather than fail loudly.
 * 3. Sensitivity — order, length, and single-bit avalanche. FNV-1a makes no
 *    cryptographic promise, but a content hash that missed a reordering or a
 *    trailing zero would let a genuine desync pass as agreement.
 * 4. Subarray handling — a `Uint8Array` view into a larger buffer must hash as
 *    its own contents. Serializers hand out views constantly, and an
 *    implementation that read from the backing buffer's origin instead of the
 *    view's would produce hashes that depend on allocation history.
 */

import { describe, expect, it } from 'vitest';

import { hashBytes } from '../../src/snapshot/hash.js';

/** Matches exactly sixteen lowercase hex characters, anchored at both ends. */
const DIGEST_SHAPE = /^[0-9a-f]{16}$/;

/**
 * Published FNV-1a 64-bit vectors. The empty input is the offset basis itself,
 * which pins that constant independently of the multiply.
 */
const KNOWN_ANSWERS: readonly { readonly name: string; readonly ascii: readonly number[]; readonly digest: string }[] = [
  { name: 'the empty string', ascii: [], digest: 'cbf29ce484222325' },
  { name: '"a"', ascii: [0x61], digest: 'af63dc4c8601ec8c' },
  {
    name: '"foobar"',
    ascii: [0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72],
    digest: '85944171f73967e8',
  },
];

describe('FNV-1a 64 known answers', () => {
  for (const { name, ascii, digest } of KNOWN_ANSWERS) {
    it(`hashes ${name} to ${digest}`, () => {
      expect(hashBytes(Uint8Array.from(ascii))).toBe(digest);
    });
  }
});

describe('digest shape', () => {
  it('is 16 lowercase hex characters for the empty buffer', () => {
    const digest = hashBytes(new Uint8Array(0));
    expect(digest).toMatch(DIGEST_SHAPE);
    expect(digest).toHaveLength(16);
  });

  it('is 16 lowercase hex characters for an all-zero buffer', () => {
    // Zero bytes are the worst case for a leading-zero bug: they are also the
    // most common content in a snapshot, since unused component slots are zero.
    for (const length of [1, 2, 7, 8, 63, 64, 1000]) {
      const digest = hashBytes(new Uint8Array(length));
      expect(digest, `all-zero buffer of length ${length}`).toMatch(DIGEST_SHAPE);
    }
  });

  it('is 16 lowercase hex characters across a wide spread of contents', () => {
    // Chosen to drive both halves of the accumulator through many values, so a
    // digest that only sometimes needs zero-padding gets caught.
    for (let seed = 0; seed < 256; seed += 1) {
      const bytes = new Uint8Array(11);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = (seed * 31 + i * 97) & 0xff;
      }
      expect(hashBytes(bytes), `seed ${seed}`).toMatch(DIGEST_SHAPE);
    }
  });

  it('is a pure function of the bytes', () => {
    const first = Uint8Array.from([9, 8, 7, 6]);
    const second = Uint8Array.from([9, 8, 7, 6]);
    expect(hashBytes(first)).toBe(hashBytes(second));
    expect(hashBytes(first)).toBe(hashBytes(first));
  });
});

describe('sensitivity', () => {
  it('depends on byte order', () => {
    expect(hashBytes(Uint8Array.from([1, 0]))).not.toBe(hashBytes(Uint8Array.from([0, 1])));
  });

  it('depends on length, including a trailing zero byte', () => {
    const base = Uint8Array.from([4, 2]);
    const extended = Uint8Array.from([4, 2, 0]);
    expect(hashBytes(base)).not.toBe(hashBytes(extended));
  });

  it('changes when any single bit of a 64-byte buffer is flipped', () => {
    const base = new Uint8Array(64);
    for (let i = 0; i < base.length; i += 1) {
      base[i] = (i * 7 + 3) & 0xff;
    }
    const baseDigest = hashBytes(base);

    const seen = new Set<string>([baseDigest]);
    for (let bit = 0; bit < base.length * 8; bit += 1) {
      const mutated = Uint8Array.from(base);
      const index = bit >>> 3;
      mutated[index] = ((mutated[index] ?? 0) ^ (1 << (bit & 7))) & 0xff;

      const digest = hashBytes(mutated);
      expect(digest, `flipping bit ${bit}`).not.toBe(baseDigest);
      seen.add(digest);
    }

    // 513 distinct digests: the base plus one per flipped bit. A collision here
    // would not be a hash weakness at this size — it would be a bug in which
    // bits reach the accumulator at all.
    expect(seen.size).toBe(base.length * 8 + 1);
  });
});

describe('buffer views', () => {
  it('hashes a subarray as its own contents, not the backing buffer', () => {
    const backing = Uint8Array.from([0xde, 0xad, 1, 2, 3, 4, 0xbe, 0xef]);
    const view = backing.subarray(2, 6);
    expect(view.byteOffset).toBe(2);
    expect(hashBytes(view)).toBe(hashBytes(Uint8Array.from([1, 2, 3, 4])));
  });

  it('hashes a view over a shared ArrayBuffer as its own contents', () => {
    // Same trap from the other direction: the view is constructed rather than
    // sliced, so its byteOffset and length both differ from the buffer's.
    const buffer = new ArrayBuffer(16);
    const whole = new Uint8Array(buffer);
    for (let i = 0; i < whole.length; i += 1) {
      whole[i] = 0xa5;
    }
    const view = new Uint8Array(buffer, 5, 3);
    view[0] = 0x61;
    view[1] = 0x62;
    view[2] = 0x63;
    expect(hashBytes(view)).toBe(hashBytes(Uint8Array.from([0x61, 0x62, 0x63])));
  });

  it('hashes a zero-length subarray as the empty buffer', () => {
    const backing = Uint8Array.from([1, 2, 3, 4]);
    expect(hashBytes(backing.subarray(2, 2))).toBe('cbf29ce484222325');
  });
});
