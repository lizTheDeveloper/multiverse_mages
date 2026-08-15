/*
 * Multiverse Mages — a magnitude may be a cost, and a rate may not go negative.
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
 * ## What this file pins, and why it is not covered by `stacking.test.ts`
 *
 * Until this change every authored magnitude was positive — 407 effects across
 * 300 nodes, none of them negative, because `node.schema.json` set
 * `"minimum": 1`. Every deep spell was therefore a bonus, and a rate mechanic
 * wired to node effects could only ever *add*. The stacking functions already
 * carried comments saying negatives sum by the same path as positives; nothing
 * exercised them, and nothing decided what `(1 + Σ)` means once `Σ` passes −1.
 *
 * `contracts.md` §3 gives a **ceiling** for every rate multiplier and no floor.
 * A ceiling alone is sound while magnitudes are positive and unsound the moment
 * one is not: `1 + (−2.0)` is `−1.0`, and a negative multiplier does not slow
 * research, it *unmakes* it — progress running backwards, materials becoming
 * negative, `favorRegeneration` subtracting from the pool it is supposed to
 * fill. So the floor is the invariant, and it is stated three ways below:
 *
 *  1. a stack whose bonuses sum below −1 yields exactly `0`, never a negative;
 *  2. the floor binding is **counted**, for the reason `caps.ts` gives about
 *     ceilings — a rate that saturates at zero and a rate that never gets near
 *     zero produce the same number and must not produce the same report;
 *  3. `Σ = −1` exactly is *not* floored. The floor is `value < 0`, so the
 *     boundary belongs to the arithmetic rather than to the clamp, and a stack
 *     that lands on zero honestly is distinguishable from one that was cut.
 *
 * The floor is derived from the **stacking rule**, not from authored data: only
 * `additive-into-multiplier` has a `(1 + Σ)` that can cross zero. `additive`
 * keeps no floor here — `lifespan` is additive and its floor belongs to
 * `effectiveLifespan`, which knows the species base a floor would be relative
 * to.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import { ClampCounters, additive, additiveIntoMultiplier, stackMagnitudes } from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());

function primitive(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`shipped content has no primitive "${id}"`);
  return found.record;
}

const RESEARCH_RATE = primitive('research-rate');
const TEACH_RATE = primitive('teach-rate');
const WARD = primitive('ward');
const AREA_DENIAL = primitive('area-denial');

describe('a negative magnitude is a cost, and it survives the arithmetic', () => {
  it('sums a cost against a bonus exactly, with no sign-dependent branch', () => {
    // +20% and −20% are the same magnitude with opposite signs, and the answer
    // is the identity. Nothing rounds: `additive` performs no division.
    expect(additive([204, -204])).toBe(0);
    expect(additiveIntoMultiplier([204, -204])).toBe(FP_ONE);
  });

  it('is order-independent, so two peers holding one multiset agree', () => {
    const mixed: Fixed[] = [-192, 640, -128, 96];
    const reversed = [...mixed].reverse();
    expect(additiveIntoMultiplier(mixed)).toBe(additiveIntoMultiplier(reversed));
    expect(additiveIntoMultiplier(mixed)).toBe(FP_ONE + 416);
  });

  it('lets a cost pull a rate below 1.0 without floors or clamps', () => {
    const outcome = stackMagnitudes(TEACH_RATE, [-192]);
    expect(outcome.value).toBe(FP_ONE - 192);
    expect(outcome.clamped).toBe(false);
    expect(outcome.floored).toBe(false);
  });

  it('leaves an additive primitive unfloored: a debuff sums like anything else', () => {
    // `area-denial` has no `(1 + Σ)` and therefore no zero to cross. The value
    // is the plain sum, negative and all, because inventing a floor here would
    // be a rule `contracts.md` §3 does not state.
    const outcome = stackMagnitudes(AREA_DENIAL, [96, -224]);
    expect(outcome.value).toBe(-128);
    expect(outcome.floored).toBe(false);
  });
});

describe('a rate multiplier never goes negative', () => {
  it('floors a stack that sums past −1 at exactly zero', () => {
    const outcome = stackMagnitudes(RESEARCH_RATE, [-1024, -1024]);
    expect(outcome.value).toBe(0);
    expect(outcome.floored).toBe(true);
    // The ceiling did not bind. A floored stack that also reported `clamped`
    // would put a floor into the cap counter and make cap pressure a fiction.
    expect(outcome.clamped).toBe(false);
  });

  it('does not floor a stack that lands on zero honestly', () => {
    const outcome = stackMagnitudes(RESEARCH_RATE, [-FP_ONE]);
    expect(outcome.value).toBe(0);
    expect(outcome.floored).toBe(false);
  });

  it('floors the one unit below zero, so the boundary is not off by one', () => {
    const outcome = stackMagnitudes(RESEARCH_RATE, [-FP_ONE - 1]);
    expect(outcome.value).toBe(0);
    expect(outcome.floored).toBe(true);
  });

  it('counts the floor separately from the ceiling', () => {
    const counters = new ClampCounters();
    stackMagnitudes(RESEARCH_RATE, [-4096], { counters });
    stackMagnitudes(RESEARCH_RATE, [8192], { counters });

    expect(counters.floorCount('research-rate')).toBe(1);
    expect(counters.count('research-rate')).toBe(1);
    // `total()` is what `world-step.ts` reports as `rateClamps.total()`. It
    // stays a count of *ceiling* clamps: a floor arriving in that series would
    // silently re-scale a number four releases of measurement are written over.
    expect(counters.total()).toBe(1);
    expect(counters.floorTotal()).toBe(1);
  });

  it('reports floors in primitive-id order, like the clamp counter', () => {
    const counters = new ClampCounters();
    stackMagnitudes(TEACH_RATE, [-4096], { counters });
    stackMagnitudes(RESEARCH_RATE, [-4096], { counters });
    expect(counters.floorEntries()).toEqual([
      ['research-rate', 1],
      ['teach-rate', 1],
    ]);
  });

  it('resets floors with the clamps, so a reused counter is really empty', () => {
    const counters = new ClampCounters();
    stackMagnitudes(RESEARCH_RATE, [-4096], { counters });
    counters.reset();
    expect(counters.floorTotal()).toBe(0);
    expect(counters.floorEntries()).toEqual([]);
  });

  it('does not floor a rule that has no zero to cross', () => {
    // `ward` is multiplicative-on-remainder. Its combined prevented fraction is
    // a fraction, not a `(1 + Σ)`, and no shipped content may author a negative
    // one — the loader refuses it. Nothing here may quietly acquire a floor and
    // start reporting it.
    const outcome = stackMagnitudes(WARD, [512, 512]);
    expect(outcome.floored).toBe(false);
  });

  it('stays an integer at scale 1024 for every mixed-sign stack', () => {
    for (let bonus = -3072; bonus <= 3072; bonus += 97) {
      const outcome = stackMagnitudes(RESEARCH_RATE, [bonus, -bonus, bonus]);
      expect(Number.isInteger(outcome.value)).toBe(true);
      expect(outcome.value).toBeGreaterThanOrEqual(0);
    }
  });
});
