/*
 * Multiverse Mages — the contentRevision hash.
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
 * `contentRevision` is written into every snapshot, and two universes may
 * interact only if theirs are equal — with no partial-compatibility rule and no
 * negotiation (`docs/design/contracts.md` §0).
 *
 * That makes it a compatibility gate, not a cache key, so it must satisfy two
 * things: identical content must always produce an identical string on any
 * machine, and any content difference at all must produce a different one.
 *
 * The preimage is a canonical rendering of *everything the loader interned* —
 * every record, keys sorted, in interned-id order, tagged with its namespace and
 * its assigned integer. Including the integers is deliberate: an interning
 * change with identical records is still an incompatible change, because the
 * integers are what snapshots store.
 *
 * The hash is four independent FNV-1a lanes over the UTF-8 bytes, rendered as 32
 * hex characters. FNV-1a is not a cryptographic hash and is not asked to be —
 * nothing here is adversarial, and the property required is collision resistance
 * against *accidental* content edits. Four lanes with different offset bases
 * gives 128 bits of it using nothing but `Math.imul`, so the computation is
 * integer-only and needs no dependency.
 */

import { canonicalJson } from './json-schema.js';

/**
 * Bumped by hand when the preimage or the hash changes.
 *
 * It is part of the preimage, so changing the algorithm changes every revision
 * deliberately and visibly, rather than making old and new builds silently
 * disagree about whether they are compatible.
 */
export const CONTENT_REVISION_ALGORITHM = 'mm-content-revision-1';

/** Four distinct 32-bit offset bases: FNV-1a's own, then three others. */
const LANE_BASES: readonly number[] = [0x811c9dc5, 0x1000193b, 0x5f356495, 0x27220a95];

/**
 * Four distinct odd multipliers, one per lane.
 *
 * The lanes vary in *both* base and multiplier so that they are not the same
 * function of the message under different initial values — which is what would
 * make "128 bits" an overstatement of four correlated 32-bit hashes.
 */
const LANE_PRIMES: readonly number[] = [0x01000193, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35];

/** One record's contribution to the preimage. */
export interface RevisionEntry {
  readonly namespace: string;
  readonly contentId: number;
  readonly record: unknown;
}

/** Builds the canonical preimage. Exported so a test can assert its shape. */
export function revisionPreimage(entries: readonly RevisionEntry[]): string {
  const lines = [CONTENT_REVISION_ALGORITHM];
  for (const entry of entries) {
    lines.push(`${entry.namespace}\t${String(entry.contentId)}\t${canonicalJson(entry.record)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Computes the 32-hex-character `contentRevision` over interned content. */
export function computeContentRevision(entries: readonly RevisionEntry[]): string {
  return hash128(revisionPreimage(entries));
}

/**
 * Four-lane FNV-1a over the UTF-8 encoding of `text`.
 *
 * The string is encoded to bytes rather than hashed by code unit so that the
 * result does not depend on JavaScript's UTF-16 representation — a content file
 * saved with a non-ASCII gloss must hash the same here as it would anywhere
 * else the preimage is reproduced.
 */
export function hash128(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const lanes = Int32Array.from(LANE_BASES);

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    for (let lane = 0; lane < lanes.length; lane += 1) {
      // `^ byte` then `× prime`, both at 32 bits. imul keeps the multiply exact.
      lanes[lane] = Math.imul((lanes[lane] ?? 0) ^ byte, LANE_PRIMES[lane] ?? 1);
    }
  }

  let out = '';
  for (let lane = 0; lane < lanes.length; lane += 1) {
    out += (avalanche((lanes[lane] ?? 0) ^ bytes.length) >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

/**
 * Final mixing step (the murmur3 finalizer).
 *
 * Without it a difference confined to the last byte of the preimage lands in the
 * top bits of the lane and barely moves the rendered prefix, so two content sets
 * differing only in a trailing character look near-identical to a human reading
 * a mismatch report.
 */
function avalanche(value: number): number {
  let x = value;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x;
}
