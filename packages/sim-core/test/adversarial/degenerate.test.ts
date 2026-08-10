/*
 * Multiverse Mages — adversarial: empty and degenerate states.
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
import { emptyWorld, withUntouched, world } from './fixtures.js';

describe('degenerate states round-trip', () => {
  it('a state with zero entities and zero components', () => {
    const state = createState({ rootSeed: 1, schema: emptyWorld });
    const restored = deserializeState(serializeState(state), emptyWorld);
    expect(snapshotHash(restored)).toBe(snapshotHash(state));
    expect(restored.entities.slotCount).toBe(0);
  });

  it('a state with components declared but zero entities ever created', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const restored = deserializeState(serializeState(state), world);
    expect(snapshotHash(restored)).toBe(snapshotHash(state));
  });

  it('a component nobody carries serializes as an empty section, not an absent one', () => {
    const state = createState({ rootSeed: 1, schema: withUntouched });
    const handle = state.entities.create();
    state.component('vitality').add(handle);
    state.component('vitality').set(handle, 'hp', 5);
    state.component('vitality').set(handle, 'age', 1);
    // 'untouched' is declared in the schema but never attached to anything.

    const restored = deserializeState(serializeState(state), withUntouched);
    expect(snapshotHash(restored)).toBe(snapshotHash(state));
    // The untouched component must still be loadable (present, empty) — a
    // schema declaring it and a snapshot omitting it entirely would otherwise
    // be indistinguishable from one that carried it with zero rows, which
    // `validateAgainstSchema`'s "both directions" check (snapshot.ts) exists
    // to prevent conflating.
    expect(() => restored.component('untouched')).not.toThrow();
  });

  it('serializes a state that has never been stepped', () => {
    const state = createState({ rootSeed: 55, schema: world });
    expect(() => serializeState(state)).not.toThrow();
    const restored = deserializeState(serializeState(state), world);
    expect(restored.clock.worldTick).toBe(state.clock.worldTick);
  });

  it('a state with slots allocated but no currently-live entities', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const a = state.entities.create();
    const b = state.entities.create();
    state.entities.destroy(a);
    state.entities.destroy(b);

    const restored = deserializeState(serializeState(state), world);
    expect(restored.entities.slotCount).toBe(2);
    expect(restored.entities.liveCount).toBe(0);
    expect(snapshotHash(restored)).toBe(snapshotHash(state));
  });
});
