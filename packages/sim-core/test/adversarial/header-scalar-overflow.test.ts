/*
 * Multiverse Mages — adversarial: header scalars validated on read but not on write.
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
 * ## The defect
 *
 * `snapshot.ts` has a `requireCount` helper — "Header scalars are unsigned
 * 32-bit counters; anything else cannot be encoded" — and calls it on
 * `illegalActionCount`, `clock.worldTick`, and `clock.engagementTick` inside
 * `envelopeToState` (the DECODE path, `snapshot.ts` around line 611-613).
 * `validateEnvelopeShape` — the function both `encodeSnapshot` (the ENCODE
 * path) and `envelopeToState` call — checks `version` with the same helper,
 * but never checks these three fields, nor `contentRevision`.
 *
 * `SnapshotWriter.u32` (`value >>> 0`) is a silent modulo-2^32 wraparound, not
 * a range check. So `encodeSnapshot`/`serializeState` will happily encode a
 * state whose `illegalActionCount`, `clock.worldTick`, `clock.engagementTick`,
 * or `contentRevision` is at or past 2^32, and the round trip comes back as a
 * *different, wrapped, in-range* number — the exact corruption class
 * `requireCount` exists to prevent, just missing from the write side.
 *
 * This is reachable from live state, not just a hand-built envelope:
 *
 *   - `illegalActionCount` (state.ts) is a public, unbounded counter, only
 *     ever incremented (`step.ts`). `contracts.md` §4.2: "RL agents will
 *     submit illegal actions constantly" — a sufficiently long Monte
 *     Carlo/RL campaign is a plausible way to reach 2^32 over enough
 *     wall-clock time, and `contracts.md` §7's `illegalActionRate` metric is
 *     defined directly from this counter.
 *   - `clock.worldTick` / `clock.engagementTick` (clock.ts's `advanceClock`)
 *     are bare `+= 1` with no ceiling anywhere in the clock or in `step`.
 *   - `contentRevision` (state.ts) is a *public, non-readonly* field on
 *     `SimState`, unlike the readonly `rootSeed`. `SimState.create` validates
 *     it at construction, but nothing stops `state.contentRevision = anything`
 *     afterward, and `contracts.md` §0 treats it as the gate on whether two
 *     universes may interact at all — a silently reshaped value here would let
 *     two genuinely-incompatible universes pass the `permits()`-adjacent
 *     equality check by coincidence. It has since been widened from a
 *     `uint32` to the full 128-bit hash `@mm/content` computes, so its
 *     out-of-domain case below is a malformed hex string rather than an
 *     oversized number; the corruption class the test names is the same one.
 *
 * Either "throw on encode" (matching `requireCount`'s read-side behaviour) or
 * "preserve the value some other way" would be a defensible fix. Silently
 * substituting a different, smaller number is not — it is exactly what
 * `world-persistence`'s "two states with the same content must produce
 * byte-identical buffers" obligation (snapshot.ts's own opening comment)
 * exists to rule out, just on the write side rather than the read side.
 */

import { describe, expect, it } from 'vitest';

import { createState } from '../../src/state.js';
import { deserializeState, serializeState } from '../../src/snapshot/snapshot.js';
import { world } from './fixtures.js';

const PAST_UINT32 = 2 ** 32;

describe('header scalars beyond 2^32 are wrapped, not rejected, at encode time', () => {
  it('illegalActionCount silently wraps to 0 instead of throwing (should match the read-side requireCount guard)', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = PAST_UINT32;

    // What SHOULD happen: encodeSnapshot rejects this the same way
    // envelopeToState's requireCount would reject it on the way back in.
    expect(() => serializeState(state)).toThrow();
  });

  it('clock.worldTick silently wraps to 0 instead of throwing', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.clock.worldTick = PAST_UINT32;
    expect(() => serializeState(state)).toThrow();
  });

  it('clock.engagementTick silently wraps to 0 instead of throwing', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.clock.mode = 1; // TIME_MODE.engagement
    state.clock.engagementTick = PAST_UINT32;
    expect(() => serializeState(state)).toThrow();
  });

  it('an out-of-domain contentRevision is refused instead of reshaped — it is the inter-universe compatibility gate (contracts.md §0)', () => {
    // The field is no longer a `uint32`, so there is no 2^32 to exceed: it
    // carries `@mm/content`'s full 128-bit hash as 32 lowercase hex
    // characters, because folding it to 32 bits made "equal revisions" mean
    // only *probably* identical content. The assertion is unchanged in
    // substance — a value outside the domain must throw rather than become a
    // different, legitimate-looking revision — and the out-of-domain value is
    // now a malformed string rather than an oversized number.
    const state = createState({ rootSeed: 1, schema: world });
    state.contentRevision = 'not-a-revision'; // mutable post-construction; see comment above
    expect(() => serializeState(state)).toThrow(/content revision/i);
  });

  it('no longer corrupts silently: an out-of-range count fails to encode instead of round-tripping as 0', () => {
    // Originally this test documented the defect — it asserted that
    // `illegalActionCount = 2^32` came back as 0, silently wrong rather than
    // absent. The encoder now validates the header scalars it was only
    // validating on the read side, so the corruption is unreachable and this
    // asserts the fix instead. Kept rather than deleted: it is the regression
    // guard for exactly the value that used to slip through.
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = PAST_UINT32;
    expect(() => serializeState(state)).toThrow(/illegal-action count/i);
  });

  it('cannot reach the overflow through normal play, because the counter saturates', () => {
    // The validation above is a backstop, not the primary defence. A training
    // run genuinely can submit billions of illegal actions, and making such a
    // run unserializable would turn a cosmetic overflow into a lost run — so
    // the counter saturates at the ceiling and reads honestly as "at least
    // this many".
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = 0xffffffff;
    state.noteIllegalAction();
    state.noteIllegalAction();
    expect(state.illegalActionCount).toBe(0xffffffff);
    expect(deserializeState(serializeState(state), world).illegalActionCount).toBe(0xffffffff);
  });

  it('PASSES: the boundary just below the defect — exactly 0xffffffff survives intact', () => {
    const state = createState({ rootSeed: 1, schema: world });
    state.illegalActionCount = 0xffffffff;
    const restored = deserializeState(serializeState(state), world);
    expect(restored.illegalActionCount).toBe(0xffffffff);
  });
});
