/*
 * Multiverse Mages — deterministic content hashing of serialized bytes.
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

import { floorDiv } from '../fixed-point/divide.js';

/**
 * ## What this module is for
 *
 * The world-persistence spec asks for "a deterministic content hash of a
 * serialized snapshot for use in equality assertions, replay verification, and
 * later multiplayer desync detection". This file is the hash half of that, and
 * only that half: it takes bytes and returns a digest. It knows nothing about
 * state, components, the clock, or the snapshot format, and it must stay that
 * way — the serializer is free to change how it lays bytes out without ever
 * touching the function that decides whether two layouts came out the same.
 *
 * ## Why FNV-1a and not something stronger
 *
 * Every use above is a check for *accidental* difference: did this replay
 * diverge, did this round-trip lose a field, did two clients' step() disagree.
 * None of them defends against an adversary who gets to choose the bytes, so
 * the properties that matter are that it is fast enough to run on every frame's
 * snapshot, that it is short enough to print into a golden fixture, and above
 * all that it is *specified* — a second implementation (a replay tool, a Rust
 * server) must be able to agree with this one from the published definition
 * rather than by reading this file. FNV-1a 64 is all three. If desync detection
 * ever needs to survive a malicious peer, that is a different function with a
 * different name, not a quiet upgrade of this one; changing the digest here
 * invalidates every fixture that ever recorded it.
 *
 * ## Why the arithmetic is done in halves, and why it is exact
 *
 * This is the part that makes the hash deterministic across machines, so it is
 * argued rather than asserted.
 *
 * The accumulator is a 64-bit value, which a double cannot hold exactly, so it
 * is carried as two 32-bit halves `hi` and `lo`, each an exact integer. The
 * FNV step is `value = (value XOR byte) * PRIME mod 2^64`. Writing
 * `value = hi * 2^32 + lo` and `PRIME = PRIME_HI * 2^32 + PRIME_LO`, the
 * `hi * PRIME_HI` term carries weight 2^64 and vanishes under the modulus, so
 * the product reduces exactly to
 *
 *     (hi * PRIME_LO + lo * PRIME_HI) * 2^32 + lo * PRIME_LO   (mod 2^64)
 *
 * which is why the decomposition below is an identity and not an approximation.
 * Each piece then stays inside the exact-integer range of a double:
 *
 * - `p = lo * PRIME_LO`. `lo < 2^32` and `PRIME_LO = 435 < 2^9`, so `p < 2^41`.
 * - `newLo = p mod 2^32` and the carry `floor(p / 2^32) < 435 < 2^9`.
 * - `hi * PRIME_LO < 2^41`, `lo * PRIME_HI < 2^40` (the prime's high half is
 *   `2^8`), and the carry is under 2^9, so their sum is below
 *   `2^41 + 2^40 + 2^9 < 2^42`.
 *
 * Every intermediate is therefore an integer below 2^42, far under the 2^53
 * limit where doubles stop representing consecutive integers. No product is
 * rounded, so `*`, `%`, and `floorDiv` are all *exact* here — not
 * approximately-right, exact — and the digest is bit-identical on every engine
 * that implements IEEE-754, which is all of them. That is the whole reason a
 * hash computed on a player's machine can be compared to one computed on the
 * server.
 *
 * `BigInt` would also be exact and is not used: it allocates per operation and
 * this loop runs once per byte of every snapshot, on a path that is called
 * every time a replay is verified. Two-halves arithmetic in doubles is the same
 * shape the PRNG already uses (`rng/pcg32.ts`), for the same reasons.
 *
 * Note that `Math.imul` — the usual tool for exact 32-bit products — is
 * deliberately *not* used: it wraps modulo 2^32 and returns a signed result,
 * which would throw away exactly the carry bits this decomposition depends on.
 */

/** 2^32, the split point between the two halves of the accumulator. */
const TWO_32 = 4294967296;

/** The FNV-1a 64-bit offset basis, 0xcbf29ce484222325, split into halves. */
const OFFSET_BASIS_HI = 0xcbf29ce4;
const OFFSET_BASIS_LO = 0x84222325;

/**
 * The FNV 64-bit prime, 0x100000001b3, split into halves. The value is
 * `2^40 + 435`, so the high half is `2^40 / 2^32 = 0x100` and the low half is
 * `0x1b3` — note it is *not* `0x1`, which is the natural misreading of an
 * 11-hex-digit constant and produces a hash that is perfectly self-consistent
 * while not being FNV-1a at all. The published vectors in
 * `test/unit/snapshot-hash.test.ts` exist to catch exactly that.
 *
 * The prime's shape is why this hash is cheap in 32-bit pieces: both halves are
 * tiny, so the cross terms stay exact without any 16-bit sub-splitting of the
 * kind `rng/pcg32.ts` needs for its much larger multiplier.
 */
const PRIME_HI = 0x100;
const PRIME_LO = 0x1b3;

/** Hex characters per 32-bit half, so the digest is a fixed 16 characters. */
const HEX_DIGITS_PER_HALF = 8;

/**
 * Deterministic content hash of a byte buffer, as 16 lowercase hex characters.
 *
 * FNV-1a, 64-bit: starting from the offset basis, each byte is XORed into the
 * low eight bits of the accumulator and the accumulator is then multiplied by
 * the FNV prime modulo 2^64. The digest is the final accumulator, high half
 * then low half, each zero-padded to eight hex characters — the padding is what
 * makes the output a fixed width, so a digest that happens to have leading
 * zeroes still compares and sorts as the same kind of string as any other.
 *
 * Because the byte is XORed *before* the multiply, position and length both
 * matter: reordering bytes changes the digest, and so does appending a zero
 * byte, which a length-oblivious checksum would miss.
 *
 * Indexing reads through the view, so a `Uint8Array` that is a window into a
 * larger `ArrayBuffer` hashes as its own contents rather than the buffer's.
 * Serializers hand out such views constantly; a digest that depended on the
 * backing buffer would depend on allocation history, which is the opposite of
 * what this function promises.
 *
 * @param bytes - The buffer to hash. Not modified.
 * @returns Exactly 16 lowercase hex characters.
 */
export function hashBytes(bytes: Uint8Array): string {
  let hi = OFFSET_BASIS_HI;
  let lo = OFFSET_BASIS_LO;

  for (let index = 0; index < bytes.length; index += 1) {
    // `?? 0` satisfies noUncheckedIndexedAccess; the fallback is unreachable
    // because `index` is bounded by `length`. `>>> 0` undoes the signed int32
    // that `^` produces, restoring `lo` to the unsigned half the argument above
    // assumes.
    lo = (lo ^ (bytes[index] ?? 0)) >>> 0;

    // ---- value = value * PRIME, modulo 2^64, in exact integer pieces. ----
    const low = lo * PRIME_LO;
    const carry = floorDiv(low, TWO_32);
    const high = hi * PRIME_LO + lo * PRIME_HI + carry;

    lo = low % TWO_32;
    hi = high % TWO_32;
  }

  return (
    hi.toString(16).padStart(HEX_DIGITS_PER_HALF, '0') +
    lo.toString(16).padStart(HEX_DIGITS_PER_HALF, '0')
  );
}
