/*
 * Multiverse Mages — adversarial: entity-store edge cases through the snapshot boundary.
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
import { decodeSnapshot, deserializeState, encodeSnapshot, serializeState, stateToEnvelope } from '../../src/snapshot/snapshot.js';
import { MAX_ENTITY_GENERATION } from '../../src/handle.js';
import { world } from './fixtures.js';

describe('generation ceiling', () => {
  it('a slot destroyed exactly at MAX_ENTITY_GENERATION retires and round-trips as dead forever', () => {
    const state = createState({ rootSeed: 1, schema: world });
    let handle = state.entities.create(); // generation 1
    // Cycle create/destroy on the same slot until its generation would exceed
    // MAX_ENTITY_GENERATION (4095). Each destroy increments the generation by
    // one; the (MAX_ENTITY_GENERATION - 1)th destroy retires the slot rather
    // than freeing it (entity-store.ts: `nextGeneration <= MAX_ENTITY_GENERATION`).
    for (let generation = 1; generation < MAX_ENTITY_GENERATION; generation += 1) {
      state.entities.destroy(handle);
      handle = state.entities.create(); // reuses the same slot, next generation
    }
    // `handle` is now at generation MAX_ENTITY_GENERATION, alive.
    expect(state.entities.isAlive(handle)).toBe(true);
    const destroyed = state.entities.destroy(handle); // generation -> MAX+1, retirement
    expect(destroyed).toBe(true);
    expect(state.entities.freeCount).toBe(0); // retired, not returned to the free list

    const restored = deserializeState(serializeState(state), world);
    expect(restored.entities.isStale(handle)).toBe(true);
    expect(restored.entities.freeCount).toBe(0);

    // The retired slot must never be reissued. The only way to get a new
    // handle now is a brand-new slot index.
    const next = restored.entities.create();
    const originalNext = state.entities.create();
    expect(next).toBe(originalNext);
  });
});

describe('free-list LIFO order is content, not bookkeeping', () => {
  it('round trip preserves which slot the next THREE creates return, in order', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const handles = Array.from({ length: 5 }, () => state.entities.create());
    // Destroy in a specific, non-monotonic order so the free list's LIFO
    // sequence is distinguishable from "sorted ascending" or "creation order".
    state.entities.destroy(handles[3]!);
    state.entities.destroy(handles[0]!);
    state.entities.destroy(handles[4]!);

    const restored = deserializeState(serializeState(state), world);

    const expected = [state.entities.create(), state.entities.create(), state.entities.create()];
    const actual = [restored.entities.create(), restored.entities.create(), restored.entities.create()];
    expect(actual).toEqual(expected);
  });
});

/**
 * Task brief: "A free list entry equal to slotCount exactly." `restoreSlotState`
 * (entity-store.ts) checks `slot >= slotCount` and throws — so this is already
 * defended. This test pins that as a passing regression guard rather than
 * leaving it untested.
 */
describe('free-list entry at exactly slotCount', () => {
  it('is rejected with a descriptive error, not silently accepted', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.entities.create();
    const envelope = stateToEnvelope(state);
    const tampered = {
      ...envelope,
      entities: { ...envelope.entities, freeList: new Uint32Array([envelope.entities.generations.length]) },
    };
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/slot/i);
  });
});

/**
 * ## The defect
 *
 * `EntityStore.restoreSlotState` (entity-store.ts) validates that a free-list
 * entry names an in-range, non-live, non-duplicate slot — but it never checks
 * that a *dead* slot named in the free list is still capable of holding a live
 * entity again. A slot at the retirement generation (`MAX_ENTITY_GENERATION +
 * 1`, i.e. 4096) is dead by construction (alive=0) and passes every check
 * `restoreSlotState` performs: in range, not live, not a duplicate.
 *
 * `EntityStore.destroy` (the only real producer of the free list) never puts a
 * retired slot back on the free list — see the `if (nextGeneration <=
 * MAX_ENTITY_GENERATION)` guard right before `#pushFree`. So a *genuine*
 * snapshot can never exhibit this. But `world-persistence`'s "Corrupt snapshot
 * rejected" scenario (openspec/changes/sim-core-foundation/specs/
 * world-persistence/spec.md) is not scoped to genuine snapshots — it exists
 * precisely because a snapshot is untrusted input (`docs/design/contracts.md`
 * has no exemption for this, and the module's own opening comment says a
 * snapshot may come "off a network in `pvp-server`"). A hand-crafted or
 * bit-flipped snapshot claiming a retired slot is free will:
 *
 *   1. Load successfully — `deserializeState` returns a state, no error.
 *   2. Poison the very next `create()` call on that slot, which calls
 *      `makeHandle(index, generation)` with `generation = 4096`. `makeHandle`
 *      (handle.ts) throws `RangeError: Entity generation out of range` — an
 *      error with no mention of snapshots, deserialization, or corruption.
 *
 * FIXED: `restoreSlotState` now rejects it. The prose above is retained
 * because it is the argument for why the check has to exist — the state was
 * never *partial*, which is what made the old behaviour easy to defend and
 * wrong. This violated the spec's "descriptive error rather than a partial state"
 * requirement in spirit: the state is not partial, it is a fully-formed,
 * seemingly-valid state that is a time bomb, and the eventual error is
 * actively misleading about its cause. The fix belongs in
 * `EntityStore.restoreSlotState`'s free-list validation loop: a free-list
 * entry naming a slot at generation `MAX_ENTITY_GENERATION + 1` should be
 * rejected the same way a live slot in the free list already is.
 */
describe('a retired slot named in the free list — found by adversarial testing, now fixed', () => {
  it('is rejected at load, naming the slot and its retirement generation', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const envelope = stateToEnvelope(state); // one slot, empty world otherwise
    // Slot 0: dead, at the retirement generation. This can never be produced
    // by EntityStore.destroy on a real state — it is constructed by hand here
    // to simulate a corrupted or maliciously crafted snapshot.
    const tampered = {
      ...envelope,
      entities: {
        generations: new Uint16Array([MAX_ENTITY_GENERATION + 1]),
        alive: new Uint8Array([0]),
        freeList: new Uint32Array([0]),
      },
    };
    const buffer = encodeSnapshot(tampered);

    // What SHOULD happen, per world-persistence's "Corrupt snapshot rejected"
    // scenario: this throws a descriptive error at load time.
    expect(() => deserializeState(buffer, world)).toThrow(/retir|generation/i);
  });

  it('rejects the tampered snapshot at load rather than deferring the failure to the next create()', () => {
    // Originally this was the fallback assertion: *if* the load is allowed to
    // succeed, at least the state it produced must not throw an unrelated
    // RangeError on the next ordinary operation. The load is no longer allowed
    // to succeed, so the fallback is moot — and the reason it is moot is worth
    // asserting directly. The failure now names the snapshot and the slot, at
    // the moment the bad data arrives, instead of surfacing later as a
    // `RangeError: Entity generation out of range` from a caller who did
    // nothing wrong.
    const state = createState({ rootSeed: 1, schema: world });
    const envelope = stateToEnvelope(state);
    const tampered = {
      ...envelope,
      entities: {
        generations: new Uint16Array([MAX_ENTITY_GENERATION + 1]),
        alive: new Uint8Array([0]),
        freeList: new Uint32Array([0]),
      },
    };
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/free list/i);
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/retired/i);
  });

});

describe('encodeSnapshot / decodeSnapshot round trip a directly-constructed envelope', () => {
  it('decodeSnapshot(encodeSnapshot(x)) reproduces x for a hand-built minimal envelope', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const envelope = stateToEnvelope(state);
    const roundTripped = decodeSnapshot(encodeSnapshot(envelope));
    expect(roundTripped.version).toBe(envelope.version);
    expect(Array.from(roundTripped.entities.generations)).toEqual(Array.from(envelope.entities.generations));
  });
});
