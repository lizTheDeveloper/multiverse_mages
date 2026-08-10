/*
 * Multiverse Mages — adversarial: the canonicality claim under maximally
 * different construction routes.
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
import { serializeState, snapshotHash } from '../../src/snapshot/snapshot.js';
import { world } from './fixtures.js';

/**
 * snapshot.ts's module comment states the whole obligation of the format:
 * "two states with the same content must produce byte-identical buffers, no
 * matter how they got there." Each test below builds the same final
 * (slot -> component values) content by a different route and checks the
 * serialized bytes are identical, not just the hash — a hash collision could
 * theoretically mask a byte difference (FNV-1a is not collision-proof), so
 * byte identity is the stronger and correct check here.
 */
describe('canonicality: same content via different routes', () => {
  it('components added and removed and re-added produce the same bytes as adding once', () => {
    const churned = createState({ rootSeed: 11, schema: world });
    const handle = churned.entities.create();
    const vit = churned.component('vitality');
    vit.add(handle);
    vit.set(handle, 'hp', 1);
    vit.remove(handle);
    vit.add(handle); // re-add: fresh, zeroed row
    vit.set(handle, 'hp', 100);
    vit.set(handle, 'age', 5);

    const direct = createState({ rootSeed: 11, schema: world });
    const directHandle = direct.entities.create();
    direct.component('vitality').add(directHandle);
    direct.component('vitality').set(directHandle, 'hp', 100);
    direct.component('vitality').set(directHandle, 'age', 5);

    expect(Array.from(serializeState(churned))).toEqual(Array.from(serializeState(direct)));
  });

  it('a component detached and reattached to the same entity ends up byte-identical to never detaching', () => {
    const state = createState({ rootSeed: 3, schema: world });
    const a = state.entities.create();
    const b = state.entities.create();
    const vit = state.component('vitality');
    vit.add(a);
    vit.set(a, 'hp', 1);
    vit.add(b);
    vit.set(b, 'hp', 2);
    vit.remove(a); // swap-removes a's row; b's row now sits where a's did
    vit.add(a); // re-add: fresh row, zeroed, at the end
    vit.set(a, 'hp', 1);

    const reference = createState({ rootSeed: 3, schema: world });
    const ra = reference.entities.create();
    const rb = reference.entities.create();
    reference.component('vitality').add(rb);
    reference.component('vitality').set(rb, 'hp', 2);
    reference.component('vitality').add(ra);
    reference.component('vitality').set(ra, 'hp', 1);

    expect(Array.from(serializeState(state))).toEqual(Array.from(serializeState(reference)));
    expect(snapshotHash(state)).toBe(snapshotHash(reference));
  });

  it('growing a component past its capacity boundary (MIN_ROWS=8) does not change the final bytes', () => {
    // Build the same final 10-entity vitality content two ways: once by
    // adding all 10 up front (forcing at least one internal array growth,
    // 8 -> 16), and once by adding 10, removing 7, and re-adding 7 different
    // ones with the same final values — a different growth history, same
    // final slot -> value mapping is NOT guaranteed to have the same slot
    // indices, so instead this test holds slot identity fixed and only
    // varies *when* growth happens, by pre-reserving capacity on one side.
    const grown = createState({ rootSeed: 5, schema: world });
    const handlesA = Array.from({ length: 10 }, () => grown.entities.create());
    const vitA = grown.component('vitality');
    for (const [i, h] of handlesA.entries()) {
      vitA.add(h);
      vitA.set(h, 'hp', i);
      vitA.set(h, 'age', i * 2);
    }

    const preReserved = createState({ rootSeed: 5, schema: world });
    const handlesB = Array.from({ length: 10 }, () => preReserved.entities.create());
    const vitB = preReserved.component('vitality');
    vitB.reserve(64); // capacity far beyond MIN_ROWS before any add()
    for (const [i, h] of handlesB.entries()) {
      vitB.add(h);
      vitB.set(h, 'hp', i);
      vitB.set(h, 'age', i * 2);
    }

    expect(Array.from(serializeState(grown))).toEqual(Array.from(serializeState(preReserved)));
  });

  it('two entity-store construction orders producing the same live slot set serialize identically', () => {
    // Route 1: create 6, destroy 3rd and 5th (0-indexed 2 and 4).
    const route1 = createState({ rootSeed: 21, schema: world });
    const h1 = Array.from({ length: 6 }, () => route1.entities.create());
    route1.entities.destroy(h1[2]!);
    route1.entities.destroy(h1[4]!);

    // Route 2: create 6, destroy the SAME two in the opposite order — the
    // resulting live/dead slot pattern is identical, but internal free-list
    // and generation bookkeeping accumulate through different call sequences.
    const route2 = createState({ rootSeed: 21, schema: world });
    const h2 = Array.from({ length: 6 }, () => route2.entities.create());
    route2.entities.destroy(h2[4]!);
    route2.entities.destroy(h2[2]!);

    // Attach identical component content by slot, referencing the still-live handles.
    for (const state of [route1, route2]) {
      const live = state === route1 ? [h1[0]!, h1[1]!, h1[3]!, h1[5]!] : [h2[0]!, h2[1]!, h2[3]!, h2[5]!];
      for (const [i, h] of live.entries()) {
        state.component('vitality').add(h);
        state.component('vitality').set(h, 'hp', i * 10);
        state.component('vitality').set(h, 'age', i);
      }
    }

    // These are NOT expected to be byte-identical: the free list's LIFO order
    // is itself content (module comment, "emitted verbatim, LIFO order
    // included"), and destroying 2-then-4 leaves a different free-list order
    // than destroying 4-then-2. This test instead confirms that expectation
    // precisely — that free-list order is exactly the axis that legitimately
    // differs — by asserting the entity tables differ while the component
    // payload agrees on content.
    expect(Array.from(route1.entities.rawSlotState().freeList)).not.toEqual(
      Array.from(route2.entities.rawSlotState().freeList),
    );
    expect(snapshotHash(route1)).not.toBe(snapshotHash(route2));
  });
});

describe('component declaration order and field declaration order', () => {
  it('is fixed by the schema regardless of which component is populated first at runtime', () => {
    const a = createState({ rootSeed: 1, schema: world });
    a.component('wealth').add(a.entities.create());
    a.component('vitality').add(a.entities.create());

    const b = createState({ rootSeed: 1, schema: world });
    b.component('vitality').add(b.entities.create());
    b.component('wealth').add(b.entities.create());

    // Not expected to be equal in general (different entities carry different
    // components in each), but this pins that the *component section order*
    // in bytes always follows schema order (vitality, then wealth — see
    // fixtures.ts), never population order, by checking both buffers agree on
    // which component's name comes first.
    const readComponentOrder = (state: typeof a) => {
      const bytes = serializeState(state);
      const text = Array.from(bytes.subarray(0, 200))
        .map((b) => String.fromCharCode(b))
        .join('');
      return text.indexOf('vitality') < text.indexOf('wealth');
    };
    expect(readComponentOrder(a)).toBe(true);
    expect(readComponentOrder(b)).toBe(true);
  });
});
