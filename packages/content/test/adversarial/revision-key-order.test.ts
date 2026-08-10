/*
 * Multiverse Mages — adversarial: contentRevision must not depend on JSON key order.
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
 * `packages/content/src/json-schema.ts`'s `canonicalJson` states its own
 * requirement plainly: *"JSON with object keys in code-unit order... must be a
 * pure function of the value and never of insertion order"* — because it is
 * "more consequentially, the preimage of `contentRevision`".
 *
 * `packages/content/test/unit/interning.test.ts` already proves
 * `contentRevision` is invariant under reordering the *records within* every
 * content file (`reversedSource`). It does not test the narrower, easier-to-get-
 * wrong claim: that reordering the *keys within one record* — the literal
 * property order a hand-edited JSON file happens to have on disk — leaves
 * `contentRevision` unchanged. `JSON.parse` preserves the source's key order in
 * the resulting object's enumeration order, so if `canonicalJson` ever stopped
 * sorting (a one-line regression: dropping the `.sort(...)` on `Object.entries`)
 * this is the test that would catch it. `interning.test.ts`'s record-reordering
 * test would not, since it never varies key order within a record.
 */

import { describe, expect, it } from 'vitest';

import type { ContentSource } from '@mm/content';
import { CONTENT_FILES, loadContent, memorySource, shippedContentSource } from '@mm/content';

import { shippedDocuments } from '../unit/fixtures.js';

const registry = loadContent(shippedContentSource());

/** Hand-serializes one array of flat records with every key order reversed. */
function reverseKeyOrderJson(records: readonly Record<string, unknown>[]): string {
  const items = records.map((record) => {
    const keys = Object.keys(record).reverse();
    const fields = keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`);
    return `{${fields.join(',')}}`;
  });
  return `[${items.join(',')}]`;
}

/**
 * The shipped content, unchanged in every value, but with `technique.json`'s
 * object keys written in the opposite order from how the loader's own
 * `JSON.stringify`-based fixtures would produce them.
 */
function keyReversedSource(): ContentSource {
  const documents = shippedDocuments();
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] =
      fileName === 'technique.json'
        ? reverseKeyOrderJson(documents[fileName] as Record<string, unknown>[])
        : JSON.stringify(documents[fileName]);
  }
  return memorySource(files, 'key-reversed');
}

describe('contentRevision does not depend on a record’s JSON key order', () => {
  it('is unchanged when every technique record is re-serialized key-first-to-last reversed', () => {
    const reversed = loadContent(keyReversedSource());

    // Sanity check on the probe itself: the reversed source must still parse
    // to the same technique data, or this test would pass for the wrong
    // reason (loader rejected the malformed JSON and never reached hashing).
    expect(reversed.techniques.map((entry) => entry.record.id).sort()).toEqual(
      registry.techniques.map((entry) => entry.record.id).sort(),
    );

    expect(reversed.contentRevision).toBe(registry.contentRevision);
  });
});
