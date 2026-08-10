/*
 * Multiverse Mages — adversarial: attempts to construct hash collisions or
 * hide semantic differences from the snapshot hash.
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

import { createState, defineWorld } from '../../src/state.js';
import { snapshotHash } from '../../src/snapshot/snapshot.js';
import { vitality, wealth, widthWorld, world } from './fixtures.js';

describe('adjacent same-width fields cannot be confused', () => {
  it('a value moving from one i32-width field to another changes the hash, never leaves it unchanged', () => {
    const state1 = createState({ rootSeed: 1, schema: widthWorld });
    const h1 = state1.entities.create();
    const store1 = state1.component('widths');
    store1.add(h1);
    store1.set(h1, 'i32', 500);
    store1.set(h1, 'u32', 0);

    const state2 = createState({ rootSeed: 1, schema: widthWorld });
    const h2 = state2.entities.create();
    const store2 = state2.component('widths');
    store2.add(h2);
    store2.set(h2, 'i32', 0);
    store2.set(h2, 'u32', 500); // same value, different (same-width) field

    expect(snapshotHash(state1)).not.toBe(snapshotHash(state2));
  });
});

describe('an empty component section vs. a component absent from the schema', () => {
  it('a schema WITH a zero-row component hashes differently than the same content under a schema WITHOUT it', () => {
    // These are necessarily different schemas (component tables differ), so
    // this is not a same-schema ambiguity — it establishes that the tag table
    // itself (component count, name) is part of what the hash covers, which
    // is the property that rules out "empty component vs absent component"
    // being indistinguishable.
    const withComponent = defineWorld({ components: [vitality, wealth], systems: [] });
    const withoutComponent = defineWorld({ components: [vitality], systems: [] });

    const a = createState({ rootSeed: 1, schema: withComponent });
    const b = createState({ rootSeed: 1, schema: withoutComponent });
    // Neither ever populates wealth or vitality — both states are otherwise
    // identical in every entity/component VALUE (there are none).
    expect(snapshotHash(a)).not.toBe(snapshotHash(b));
  });
});

describe('component and field NAME changes are covered by the hash, not just values', () => {
  it('renaming a field (same kind, same value, same position) changes the hash', () => {
    const worldA = defineWorld({ components: [{ name: 'c', fields: { x: 'i32' } }], systems: [] });
    const worldB = defineWorld({ components: [{ name: 'c', fields: { y: 'i32' } }], systems: [] });

    const a = createState({ rootSeed: 1, schema: worldA });
    const ha = a.entities.create();
    a.component('c').add(ha);
    a.component('c').set(ha, 'x', 7);

    const b = createState({ rootSeed: 1, schema: worldB });
    const hb = b.entities.create();
    b.component('c').add(hb);
    b.component('c').set(hb, 'y', 7);

    expect(snapshotHash(a)).not.toBe(snapshotHash(b));
  });
});

describe('trying to construct a deliberate FNV-1a collision by appending zero bytes', () => {
  it('appending trailing zero rows/fields is impossible without changing the schema, so this reduces to the empty-vs-absent case (already covered) — sanity-checked here via direct component growth', () => {
    // FNV-1a's own known weakness is that XOR-then-multiply can, in principle,
    // be blind to specific zero-byte insertions in bespoke constructions. The
    // format ties every value to a fixed-width u32 slot count derived from
    // rowCount * fieldCount, which is itself part of the hashed bytes, so an
    // attacker cannot silently pad values without also changing rowCount —
    // itself hashed. This test constructs the most direct attempt: two
    // states differing only by one extra all-zero entity attached to a
    // component, and confirms the hash still differs.
    const state1 = createState({ rootSeed: 1, schema: world });
    const h1 = state1.entities.create();
    state1.component('vitality').add(h1);
    state1.component('vitality').set(h1, 'hp', 3);

    const state2 = createState({ rootSeed: 1, schema: world });
    const h2a = state2.entities.create();
    state2.component('vitality').add(h2a);
    state2.component('vitality').set(h2a, 'hp', 3);
    const h2b = state2.entities.create();
    state2.component('vitality').add(h2b); // hp defaults to 0, age defaults to 0 — an all-zero row appended

    expect(snapshotHash(state1)).not.toBe(snapshotHash(state2));
  });
});
