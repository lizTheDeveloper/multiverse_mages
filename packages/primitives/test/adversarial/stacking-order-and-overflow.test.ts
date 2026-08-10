/*
 * Multiverse Mages — adversarial: order-dependence, overflow, and cap edges.
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
 * Adversarial coverage for `@mm/primitives`, written by a breaker with no stake
 * in the implementation. Two describe blocks below are RED and stay red: they
 * document a real defect, not a style preference. Every other block documents
 * either established robustness or a defensible-but-worth-flagging ambiguity —
 * see the comment on each.
 */

import { describe, expect, it } from 'vitest';

import { FP_MAX, FP_MIN, FP_ONE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import {
  ClampCounters,
  additive,
  additiveIntoMultiplier,
  maxOf,
  multiplicativeOnRemainder,
  stackMagnitudes,
} from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());

function primitive(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`shipped content has no primitive "${id}"`);
  return found.record;
}

const HALF: Fixed = FP_ONE / 2;

// ---------------------------------------------------------------------------
// DEFECT: multiplicativeOnRemainder is order-dependent.
//
// `packages/primitives/src/stack.ts`'s own doc comment on `stackMagnitudes`
// states the contract this violates, in so many words:
//
//   "magnitudes - One entry per applying source, in the primitive's own
//    units. Order never matters: every rule here is commutative."
//
// That is also the operational meaning of `contracts.md` §3's "uniform
// rounding is what makes replays reproducible": two peers who apply the same
// ward sources to the same target in a different order — which is entirely
// possible, since nothing pins iteration order of "sources applying to one
// target" — must compute the same stacked value, or their simulations
// silently diverge while every individual step looks correct.
//
// `multiplicativeOnRemainder` floors at every intermediate step (`mul` floors
// toward negative infinity), and floor-division does not distribute over
// multiplication associatively/commutatively once more than two factors are
// involved. Concretely: fractions {300, 500, 700} (~29%, ~49%, ~68%) reduce
// to a different final answer depending only on the order the array is given
// in.
// ---------------------------------------------------------------------------
describe('DEFECT: multiplicativeOnRemainder disagrees with itself depending on input order', () => {
  it('the same three ward fractions produce two different prevented totals', () => {
    // Order A: 300, then 500, then 700.
    const orderA = multiplicativeOnRemainder([300, 500, 700]);
    // Order B: the same three values, reversed.
    const orderB = multiplicativeOnRemainder([700, 500, 300]);

    // `stack.ts` promises this holds for every rule it dispatches to. It does
    // not hold here: orderA is 907, orderB is 908 — one part in 1024 apart,
    // solely from array order. Two lockstep peers whose engagement code
    // happens to iterate a target's ward sources in a different order (e.g.
    // because one applied a summon before a grimoire buff and the other did
    // not) would from this moment compute different damage for the rest of
    // the raid, with no other input having differed at all.
    expect(orderA).toBe(orderB);
  });

  it('a full permutation sweep of a three-fraction stack does not agree on one answer', () => {
    const permutations: number[][] = [
      [200, 421, 808],
      [200, 808, 421],
      [421, 200, 808],
      [421, 808, 200],
      [808, 200, 421],
      [808, 421, 200],
    ];
    const results = permutations.map((order) => multiplicativeOnRemainder(order));
    const distinctResults = new Set(results);

    // Every permutation stacks the same multiset {200, 421, 808}, so a
    // commutative rule must return one value for all six orderings. It
    // returns two (922 for four orderings, 923 for the other two).
    expect(distinctResults.size).toBe(1);
  });

  it('the divergence survives the registry-driven cap and flips the reported "clamped" outcome', () => {
    // This is the version that actually matters to a balance run: the same
    // three ward *sources*, stacked through the real registry-driven `ward`
    // primitive (cap fp(922) = 90%, contracts.md §3), routed through two
    // orderings that differ only in which of the last two sources is applied
    // first. One ordering lands exactly on the cap (922, not clamped); the
    // other overshoots by one part in 1024 and gets cut back down to 922,
    // but is recorded as clamped.
    //
    // `caps.ts`'s own justification for ClampCounters is that a cap which
    // binds "every single evaluation" and one that "never binds at all" must
    // be distinguishable, because that distinction is a balance finding. An
    // order-dependent clamp flag means the *same logical stack of sources*
    // reports a different balance finding depending on iteration order alone
    // — the exact failure the counter exists to make visible, now happening
    // to the counter itself.
    const ward = primitive('ward');

    const countersA = new ClampCounters();
    const stackedA = stackMagnitudes(ward, [200, 421, 808], { counters: countersA });

    const countersB = new ClampCounters();
    const stackedB = stackMagnitudes(ward, [200, 808, 421], { counters: countersB });

    expect(stackedA.clamped).toBe(stackedB.clamped);
    expect(countersA.count('ward')).toBe(countersB.count('ward'));
  });
});

// ---------------------------------------------------------------------------
// Control: additive-into-multiplier is the sibling rule that performs no
// division at all, so it is exactly order-independent — establishing that the
// defect above is specific to the division-based rule, not a property of
// "stacking arithmetic" in general.
// ---------------------------------------------------------------------------
describe('control: additive-into-multiplier stays order-independent under the same stress', () => {
  it('agrees across every permutation of a five-element stack', () => {
    const bonuses = [17, 900, 4, 2048, 63] as const;
    const permutations: number[][] = [
      [bonuses[0], bonuses[1], bonuses[2], bonuses[3], bonuses[4]],
      [bonuses[4], bonuses[3], bonuses[2], bonuses[1], bonuses[0]],
      [bonuses[4], bonuses[0], bonuses[3], bonuses[1], bonuses[2]],
      [bonuses[2], bonuses[4], bonuses[0], bonuses[1], bonuses[3]],
    ];
    const results = permutations.map((order) => additiveIntoMultiplier(order));
    expect(new Set(results).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Overflow: contracts.md §3 gives every rule an identity for the empty case,
// but says nothing about the ceiling. The brief asks whether a hundred stacked
// bonuses wrap. They do not — every rule throws rather than silently
// producing a wrapped, plausible-looking `Fixed`. This is the correct and
// safe behaviour (a wrapped value would look like a legitimate, if extreme,
// game state), so this block establishes robustness rather than reporting a
// defect.
// ---------------------------------------------------------------------------
describe('established: stacking does not silently wrap on overflow', () => {
  it('a hundred sources at FP_MAX overflow additive rather than wrapping', () => {
    expect(() => additive(Array<Fixed>(100).fill(FP_MAX))).toThrow(RangeError);
  });

  it('a hundred sources at FP_MIN overflow additive in the negative direction', () => {
    expect(() => additive(Array<Fixed>(100).fill(FP_MIN))).toThrow(RangeError);
  });

  it('two FP_MAX sources overflow additive-into-multiplier', () => {
    expect(() => additiveIntoMultiplier([FP_MAX, FP_MAX])).toThrow(RangeError);
  });

  it('maxOf never overflows, since it never accumulates', () => {
    // The largest representable value, many times over, is still just the
    // largest representable value — max has nothing to overflow into.
    expect(maxOf(Array<Fixed>(100).fill(FP_MAX))).toBe(FP_MAX);
  });

  it('a single FP_MIN "prevented fraction" overflows rather than wrapping into a bogus remainder', () => {
    // FP_MIN as a ward's prevented fraction is nonsensical game content (no
    // loader would produce it), but the arithmetic's job under adversarial
    // input is still to fail loudly rather than silently: `FP_ONE - FP_MIN`
    // itself leaves the Fixed domain before any multiplication happens, and
    // `mul` refuses it rather than wrapping into a plausible-looking answer.
    expect(() => multiplicativeOnRemainder([FP_MIN])).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Caps: exactly at the cap, one below, one above — and whether the clamp
// counter over- or under-counts a value that already rests on the boundary.
// Established robustness: the boundary is closed on the cap side (<=), so a
// stack that lands exactly on the cap is correctly NOT reported as clamped.
// ---------------------------------------------------------------------------
describe('established: cap boundaries are exact, and the counter does not over-count', () => {
  it('a ward stack exactly at fp(922) is not clamped and is not counted', () => {
    const ward = primitive('ward');
    const counters = new ClampCounters();
    const atCap = stackMagnitudes(ward, [922], { counters });
    expect(atCap).toEqual({ value: 922, clamped: false });
    expect(counters.count('ward')).toBe(0);
  });

  it('one part in 1024 below the cap is also not clamped', () => {
    const ward = primitive('ward');
    const belowCap = stackMagnitudes(ward, [921]);
    expect(belowCap).toEqual({ value: 921, clamped: false });
  });

  it('one part in 1024 above the cap is clamped down to it and counted once', () => {
    const ward = primitive('ward');
    const counters = new ClampCounters();
    const aboveCap = stackMagnitudes(ward, [923], { counters });
    expect(aboveCap).toEqual({ value: 922, clamped: true });
    expect(counters.count('ward')).toBe(1);
  });

  it('the same boundary holds for an additive-into-multiplier cap (build-rate, fp(4096))', () => {
    const buildRate = primitive('build-rate');
    // additiveIntoMultiplier([3072]) === FP_ONE + 3072 === 4096, exactly the cap.
    expect(stackMagnitudes(buildRate, [3072])).toEqual({ value: 4096, clamped: false });
    expect(stackMagnitudes(buildRate, [3071])).toEqual({ value: 4095, clamped: false });
    const counters = new ClampCounters();
    expect(stackMagnitudes(buildRate, [3073], { counters })).toEqual({ value: 4096, clamped: true });
    expect(counters.count('build-rate')).toBe(1);
  });

  it('a single 100% ward is clamped down to fp(922) just like any smaller overshoot', () => {
    const ward = primitive('ward');
    const counters = new ClampCounters();
    // fraction fp(1024) = "prevents everything" pre-cap.
    expect(multiplicativeOnRemainder([FP_ONE])).toBe(FP_ONE);
    expect(stackMagnitudes(ward, [FP_ONE], { counters })).toEqual({ value: 922, clamped: true });
    expect(counters.count('ward')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ambiguity (category c): maxOf's identity for "no sources" is documented as
// 0, but the accumulator also starts at 0 for a NON-empty, all-negative
// input — silently substituting a phantom zero-magnitude source that was
// never actually applying. contracts.md §3 does not define max-stacking's
// behaviour for negative magnitudes, and both max-stacked primitives (blink's
// displacement, knowledge-steal's probability) are unlikely to be negative in
// valid content, so this is not asserted as a violation. It is documented
// because it is exactly the class of "two defensible readings" divergence
// contracts.md §3 exists to prevent, and the sibling function `additive`
// explicitly rejects a sign-dependent code path in its own doc comment —
// making the asymmetry here easy for a second implementer to miss.
// ---------------------------------------------------------------------------
describe('ambiguity: maxOf floors an all-negative input at zero rather than returning the true maximum', () => {
  it('maxOf([-100, -50]) is 0, not -50', () => {
    // -50 is unambiguously the largest of the two inputs. `maxOf` does not
    // return it, because its accumulator is seeded at 0 and `Math.max` never
    // moves below its seed. A reader of "the largest source wins" who writes
    // `Math.max(...magnitudes)` from scratch would get -50 here and disagree
    // with the shipped implementation on every all-negative stack.
    expect(maxOf([-100, -50])).toBe(0);
    expect(Math.max(-100, -50)).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// Ambiguity (category c): `stacking.ts`'s own doc comment on
// multiplicativeOnRemainder says wards approach 100% prevented "but the rule
// never reaches it" pre-cap. That claim is false starting at 11 wards. It is
// gameplay-irrelevant, because the registry cap (fp(922)) intervenes long
// before 11 real wards could stack — but the doc comment states a general
// mathematical claim about the *rule*, independent of any cap, and the brief
// explicitly asks to push the ward count to twenty.
// ---------------------------------------------------------------------------
describe('ambiguity: the "never reaches 1.0" doc claim is false pre-cap at 11+ wards', () => {
  it('ten 50% wards still leave a survivable remainder, as the shipped unit test asserts', () => {
    expect(multiplicativeOnRemainder(Array<Fixed>(10).fill(HALF))).toBeLessThan(FP_ONE);
  });

  it('eleven 50% wards reach exactly fp(1024) — 100% prevented, pre-cap', () => {
    expect(multiplicativeOnRemainder(Array<Fixed>(11).fill(HALF))).toBe(FP_ONE);
  });

  it('twenty 50% wards also land at exactly fp(1024), not asymptotically near it', () => {
    expect(multiplicativeOnRemainder(Array<Fixed>(20).fill(HALF))).toBe(FP_ONE);
  });
});
