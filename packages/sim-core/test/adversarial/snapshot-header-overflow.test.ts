/*
 * Multiverse Mages — adversarial: snapshot header scalars beyond the u32 domain.
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
 * `snapshot.ts`'s own module comment states the format's one obligation above
 * every other: "two states with the same content must produce byte-identical
 * buffers, no matter how they got there." A corollary nobody wrote down but
 * that has to be true for the first half to mean anything: a snapshot must
 * either faithfully preserve a state's content or refuse to serialize it —
 * never silently substitute different content.
 *
 * **History.** At the time this file was first written, `envelopeToState`
 * (the *deserialize* path) enforced this for `illegalActionCount`,
 * `clock.worldTick`, and `clock.engagementTick` via `requireCount`, but
 * `encodeSnapshot` / `stateToEnvelope` (the *serialize* path) had no
 * equivalent guard: `SnapshotWriter.u32` does `value >>> 0`, a silent
 * modulo-2^32 wraparound rather than a range check. A state whose
 * `illegalActionCount` or `clock.worldTick`/`engagementTick` had grown to or
 * past 2^32 serialized *successfully* and deserialized back as a different,
 * silently wrong number.
 *
 * `validateEnvelopeShape` in `snapshot.ts` now calls `requireCount` on every
 * numeric header scalar on the encode path as well as the decode path — and
 * checks `contentRevision`, which this test suite had not itself flagged,
 * against its own shape rule, since that field has since been widened from a
 * `uint32` to the full 128-bit hash `@mm/content` computes. `SimState.
 * noteIllegalAction` now saturates `illegalActionCount` at
 * `UINT32_MAX` instead of incrementing past it — so the defect described
 * above is fixed both at its source (the counter can no longer be pushed
 * past the domain through the normal increment path) and at the format
 * boundary (an out-of-range value fails loudly instead of wrapping). The
 * tests below are kept as **regression guards**: they exercise the same
 * out-of-range states that used to corrupt silently, and now assert the
 * throw / saturation that fixed it.
 */

import { describe, expect, it } from 'vitest';

import { deserializeState, serializeState } from '../../src/snapshot/snapshot.js';
import { createState, defineWorld } from '../../src/state.js';

const world = defineWorld({ components: [], systems: [] });

const UINT32_OVERFLOW = 2 ** 32; // One past the largest value a u32 can hold.

describe('snapshot header scalars beyond the u32 domain', () => {
  it('REGRESSION GUARD: refuses to encode an illegalActionCount past the u32 domain', () => {
    // Bypasses `noteIllegalAction`'s saturation by writing the field
    // directly, since `illegalActionCount` is still a plain mutable
    // property — the format-level guard is what has to hold regardless of
    // whether every caller goes through the saturating increment.
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = UINT32_OVERFLOW;
    expect(() => serializeState(state)).toThrow(/illegal-action count/i);
  });

  it('REGRESSION GUARD: refuses to encode a clock.worldTick past the u32 domain', () => {
    // advanceClock (clock.ts) is `clock.worldTick += 1` with no ceiling of
    // its own; the format boundary is what actually stops this value from
    // reaching disk silently wrong.
    const state = createState({ rootSeed: 1, schema: world });
    state.clock.worldTick = UINT32_OVERFLOW;
    expect(() => serializeState(state)).toThrow(/world tick/i);
  });

  it('REGRESSION GUARD: refuses to encode a clock.engagementTick past the u32 domain', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.clock.mode = 1; // TIME_MODE.engagement
    state.clock.engagementTick = UINT32_OVERFLOW;
    expect(() => serializeState(state)).toThrow(/engagement tick/i);
  });

  it('REGRESSION GUARD: refuses to encode a contentRevision outside its domain', () => {
    // contentRevision is the inter-universe compatibility gate (contracts.md
    // §0) and is a writable field on a live state, so this is not a purely
    // hypothetical input either.
    //
    // Its domain is no longer "a u32": the field carries `@mm/content`'s full
    // 128-bit hash as 32 lowercase hex characters, because folding it to 32
    // bits made equality mean only *probably* identical content. The property
    // this guard asserts is the same one it always asserted — an
    // out-of-domain revision is refused at encode time rather than silently
    // reshaped into some other legitimate-looking revision. Only the domain
    // moved.
    const state = createState({ rootSeed: 1, schema: world });
    state.contentRevision = 'abcdef01'; // the old u32 width, now a truncation
    expect(() => serializeState(state)).toThrow(/content revision/i);
  });

  it('REGRESSION GUARD: refuses to encode a contentRevision outside the lowercase hex alphabet', () => {
    // Two renderings of one hash that differ only in case would compare
    // unequal and refuse a raid between two identical universes, so uppercase
    // is a malformed value rather than a synonym.
    const state = createState({ rootSeed: 1, schema: world });
    state.contentRevision = 'ABCDEF0100000000000000000000ABCD';
    expect(() => serializeState(state)).toThrow(/content revision/i);
  });

  it('PASSES: a full-width revision round-trips, including the bits below the old fold', () => {
    // The boundary the guard is actually protecting: two revisions that agree
    // on their first 32 bits — everything a `u32` header field could have held
    // — must survive as two distinct revisions and two distinct buffers.
    const low = createState({
      rootSeed: 1,
      schema: world,
      contentRevision: 'deadbeef00000000000000000000000a',
    });
    const high = createState({
      rootSeed: 1,
      schema: world,
      contentRevision: 'deadbeef00000000000000000000000b',
    });

    expect(deserializeState(serializeState(low), world).contentRevision).toBe(low.contentRevision);
    expect(deserializeState(serializeState(high), world).contentRevision).toBe(high.contentRevision);
    expect(serializeState(low)).not.toEqual(serializeState(high));
  });

  it('PASSES: the illegal-action counter saturates rather than overflows when incremented through the normal path', () => {
    // `noteIllegalAction` is the only way `step`/`applyTransition` ever
    // touches this counter. Confirms the saturation directly, at the
    // boundary just below and at the u32 maximum.
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = 0xffffffff;
    state.noteIllegalAction();
    expect(state.illegalActionCount).toBe(0xffffffff); // saturated, not wrapped to 0
  });

  it('PASSES: preserves illegalActionCount at exactly the u32 maximum through a round trip', () => {
    // The boundary just below the defect: confirms the guard is specifically
    // about overflow past the u32 domain, not a general problem with large
    // counters.
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = 0xffffffff;
    const restored = deserializeState(serializeState(state), world);
    expect(restored.illegalActionCount).toBe(0xffffffff);
  });
});
