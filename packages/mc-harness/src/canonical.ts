/*
 * Multiverse Mages — canonical serialization and content hashing for results.
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
 * The bytes half of "byte-identical result records".
 *
 * `JSON.stringify` is deterministic in the only sense a language spec can
 * promise: the same object literal gives the same string. It is *not*
 * deterministic in the sense a Monte Carlo record needs, because the object it
 * is handed came out of a `Map`, a spread, or a metric loop whose insertion
 * order is a function of which collector ran first. Two executions that agree
 * on every number can still disagree on every byte, and the reproducibility
 * check — which the design forbids from carrying a tolerance — would fail for a
 * reason that has nothing to do with the simulation.
 *
 * So records are serialized through {@link canonicalJson}, which fixes key
 * order, and compared as bytes.
 *
 * Three values are rejected rather than serialized:
 *
 * - `NaN` and `±Infinity`, because `JSON.stringify` renders all three as `null`.
 *   A metric that silently became `null` on the way to disk is a metric whose
 *   collector broke, and it must not be readable back as "absent".
 * - `undefined` object values, which `JSON.stringify` drops. A dropped key in a
 *   record whose whole contract is "every registered metric has an entry" is
 *   the failure the contract exists to catch, so it is raised here instead.
 * - `bigint`, which `JSON.stringify` throws on anyway, but with a message that
 *   does not say which field.
 *
 * `-0` is normalized to `0`. `JSON.stringify` already does this, but a fold
 * that produces `-0` on one execution and `0` on another is worth flattening
 * where it can be seen rather than where it happens to be invisible.
 */

import { createHash } from 'node:crypto';

/** Anything that may appear in a record or a sweep specification. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeValue(value: unknown, path: string, out: string[]): void {
  if (value === null) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `${path} is ${String(value)}, which JSON renders as null. A result record may not carry ` +
            'a non-finite number: read back, it would be indistinguishable from a missing value.',
        );
      }
      // Normalizes -0 without touching any other value.
      out.push(JSON.stringify(value === 0 ? 0 : value));
      return;
    }
    case 'bigint':
      throw new TypeError(`${path} is a bigint, which JSON cannot represent. Record it as a string.`);
    case 'undefined':
      throw new TypeError(
        `${path} is undefined. JSON.stringify drops undefined object values silently, and a ` +
          'dropped key in a result record is exactly what the "every metric has an entry" rule ' +
          'exists to catch. Write null, or omit the key deliberately upstream.',
      );
    default:
      break;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) out.push(',');
      encodeValue(value[index], `${path}[${String(index)}]`, out);
    }
    out.push(']');
    return;
  }
  if (isPlainObject(value)) {
    // Sorted by code unit, which is what `Array.prototype.sort` does by
    // default and what every other canonical-JSON implementation agrees on.
    const keys = Object.keys(value).sort();
    out.push('{');
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index] as string;
      if (index > 0) out.push(',');
      out.push(JSON.stringify(key), ':');
      encodeValue(value[key], `${path}.${key}`, out);
    }
    out.push('}');
    return;
  }
  throw new TypeError(`${path} is a ${typeof value}, which has no JSON representation.`);
}

/**
 * Serializes a value with object keys in sorted order and no insignificant
 * whitespace, so equal content gives equal bytes.
 *
 * @param root - A label used in error messages to locate the offending field.
 * @throws TypeError naming the field, for any value JSON cannot carry faithfully.
 */
export function canonicalJson(value: unknown, root = '$'): string {
  const out: string[] = [];
  encodeValue(value, root, out);
  return out.join('');
}

/**
 * SHA-256 of a string's UTF-8 bytes, lowercase hex.
 *
 * From `node:crypto` rather than a hand-rolled 32-bit checksum. This package is
 * host-side tooling — it already owns worker processes and files — so the
 * standard library is available, and a configuration hash that two different
 * sweep specifications could share is a provenance check that reports "same
 * experiment" about two different experiments. FNV would have been eight lines
 * and a collision surface nobody would ever look at again.
 */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The canonical hash of a value: sorted-key JSON, then SHA-256. */
export function canonicalHash(value: unknown, root = '$'): string {
  return sha256Hex(canonicalJson(value, root));
}
