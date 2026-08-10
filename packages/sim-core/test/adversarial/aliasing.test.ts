/*
 * Multiverse Mages — adversarial: aliasing between live state and snapshots/clones.
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
import { deserializeState, serializeState, snapshotHash, stateToEnvelope } from '../../src/snapshot/snapshot.js';
import { world } from './fixtures.js';

describe('cloneStateInto does not share buffers', () => {
  it('mutating the original component after clone() does not affect the clone', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const handle = state.entities.create();
    state.component('vitality').add(handle);
    state.component('vitality').set(handle, 'hp', 10);

    const clone = state.clone();
    state.component('vitality').set(handle, 'hp', 999);

    expect(clone.component('vitality').get(handle, 'hp')).toBe(10);
  });

  it('mutating the clone does not affect the original', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const handle = state.entities.create();
    state.component('vitality').add(handle);
    state.component('vitality').set(handle, 'hp', 10);

    const clone = state.clone();
    clone.component('vitality').set(handle, 'hp', 999);

    expect(state.component('vitality').get(handle, 'hp')).toBe(10);
  });

  it('a component grown (via add) on the clone after cloning does not resize the original\'s arrays', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const h1 = state.entities.create();
    state.component('vitality').add(h1);
    state.component('vitality').set(h1, 'hp', 1);

    const clone = state.clone();
    // Grow the clone's vitality component past its original row capacity by
    // adding many new entities to it.
    for (let i = 0; i < 64; i += 1) {
      const h = clone.entities.create();
      clone.component('vitality').add(h);
      clone.component('vitality').set(h, 'hp', i);
    }

    // The original must still report only its one row and its original value.
    expect(state.component('vitality').size).toBe(1);
    expect(state.component('vitality').get(h1, 'hp')).toBe(1);
  });

  it('destroying an entity on the clone does not free that slot on the original', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const a = state.entities.create();
    const clone = state.clone();
    clone.entities.destroy(a);

    expect(state.entities.isAlive(a)).toBe(true);
    expect(clone.entities.isAlive(a)).toBe(false);
  });
});

describe('rawSlotState hands back live views that must not be relied on after mutation', () => {
  it('a reference held across a subsequent create() no longer reflects the extended state (documents the contract)', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.entities.create();
    const before = state.entities.rawSlotState();
    expect(before.slotCount).toBe(1);

    state.entities.create(); // triggers no growth yet (capacity 16 by default) but slotCount changes
    // `before` is a *view* whose subarray length was fixed at call time
    // (`subarray(0, this.#slotCount)` evaluated slotCount eagerly), so its
    // .length does not retroactively include the new slot. This is the
    // expected, documented behaviour (`@internal ... read them, do not keep
    // them across a mutation`) — asserted here so a future refactor that
    // changed this silently would be caught.
    expect(before.generations.length).toBe(1);
    expect(state.entities.rawSlotState().generations.length).toBe(2);
  });

  it('stateToEnvelope copies rawSlotState arrays rather than aliasing them', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const handle = state.entities.create();
    const envelope = stateToEnvelope(state);
    const generationsBefore = envelope.entities.generations.slice();

    // Destroy-and-recreate churns the live generations array in place.
    state.entities.destroy(handle);
    state.entities.create();

    // If stateToEnvelope had aliased EntityStore's internal array instead of
    // copying it, `envelope.entities.generations` would now reflect the
    // mutation too — which is exactly the "hash changed and nothing changed
    // it" bug the module's own doc comment warns about.
    expect(Array.from(envelope.entities.generations)).toEqual(Array.from(generationsBefore));
  });

  it('mutating the original after serializeState() does not change the already-produced bytes or hash', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const handle = state.entities.create();
    state.component('vitality').add(handle);
    state.component('vitality').set(handle, 'hp', 5);

    const buffer = serializeState(state);
    const hashBefore = snapshotHash(state);
    const bytesBefore = Array.from(buffer);

    state.component('vitality').set(handle, 'hp', 500);

    expect(Array.from(buffer)).toEqual(bytesBefore);
    expect(snapshotHash(state)).not.toBe(hashBefore);
  });

  it('a component field array grown after stateToEnvelope() does not retroactively alter the envelope', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const h1 = state.entities.create();
    state.component('vitality').add(h1);
    state.component('vitality').set(h1, 'hp', 7);

    const envelope = stateToEnvelope(state);
    const valuesBefore = envelope.components.find((c) => c.name === 'vitality')!.values.slice();

    // Force vitality's backing arrays to grow (past MIN_ROWS=8) after the
    // envelope was captured.
    for (let i = 0; i < 32; i += 1) {
      const h = state.entities.create();
      state.component('vitality').add(h);
      state.component('vitality').set(h, 'hp', 1000 + i);
    }

    const values = envelope.components.find((c) => c.name === 'vitality')!.values;
    expect(Array.from(values)).toEqual(Array.from(valuesBefore));
  });
});

describe('restored state does not alias the buffer it was decoded from', () => {
  it('mutating the source buffer after deserializeState() does not change the restored state', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const handle = state.entities.create();
    state.component('vitality').add(handle);
    state.component('vitality').set(handle, 'hp', 42);

    const buffer = serializeState(state);
    const restored = deserializeState(buffer, world);

    buffer.fill(0); // scribble over the source buffer entirely

    expect(restored.component('vitality').get(handle, 'hp')).toBe(42);
  });
});
