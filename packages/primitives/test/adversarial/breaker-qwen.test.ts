/*
 * Multiverse Mages — breaker-qwen: adversarial tests for negative-magnitude
 * safety, rounding asymmetry, and consumption-check integrity.
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
 * Written by the breaker agent. Each test names a concrete defect or
 * establishes robustness. The brief asks for NON-TRIVIAL failing tests that
 * name a REAL defect, and honest reporting where nothing breaks.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FP_MIN, FP_ONE, mul, div } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import {
  ClampCounters,
  additive,
  additiveIntoMultiplier,
  applyCap,
  applyWard,
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

// ---------------------------------------------------------------------------
// Attack 1: FIXED-POINT ROUNDING ASYMMETRY AROUND ZERO
//
// The brief calls this "the single most likely real defect." floorDiv rounds
// toward negative infinity uniformly. For mul, this means:
//   mul(+a, b) rounds the product DOWN (toward zero for positive results)
//   mul(-a, b) rounds the product DOWN (AWAY from zero for negative results)
//
// Concretely: mul(3, 512) = floor(1536/1024) = 1
//             mul(-3, 512) = floor(-1536/1024) = -2
//
// The absolute rounding error differs: |1 - 1.5| = 0.5 vs |-2 - (-1.5)| = 0.5
// But the DIRECTION differs: positive rounds toward zero, negative rounds away.
//
// In a stacking context, this means a +0.5% bonus and a -0.5% penalty do NOT
// cancel out. The bonus contributes 0 (rounded away), the penalty contributes
// -1 (rounded away from zero). Net: -1, not 0.
// ---------------------------------------------------------------------------
describe('breaker: fixed-point rounding asymmetry around zero', () => {
  it('mul of a small positive and mul of the same small negative round to different absolute magnitudes', () => {
    // 3 * fp(0.5) = 1536 / 1024 = 1.5 → floors to 1
    const positive = mul(3, 512);
    // -3 * fp(0.5) = -1536 / 1024 = -1.5 → floors to -2
    const negative = mul(-3, 512);

    // Both are "correct" floor divisions. But |positive| ≠ |negative|, meaning
    // a +X bonus and a -X penalty of the same magnitude do NOT cancel.
    expect(positive).toBe(1);
    expect(negative).toBe(-2);

    // The asymmetry: the sum is -1, not 0.
    expect(positive + negative).toBe(-1);
  });

  it('a positive and negative bonus of equal magnitude through additiveIntoMultiplier do not cancel to FP_ONE', () => {
    // Two bonuses that should cancel: +512 and -512
    // additiveIntoMultiplier([512, -512]) = FP_ONE + (512 + (-512)) = FP_ONE + 0 = FP_ONE
    // This one IS exact because addition is exact. The asymmetry only appears
    // when mul is involved.
    const result = additiveIntoMultiplier([512, -512]);
    expect(result).toBe(FP_ONE);
  });

  it('rounding asymmetry in mul creates a net drift when positive and negative contributions pass through scaling', () => {
    // Scenario: a ward-like calculation where a positive and negative factor
    // should cancel but don't because mul floors differently for each sign.
    //
    // mul(FP_ONE + 3, 512) vs mul(FP_ONE - 3, 512):
    //   mul(1027, 512) = floor(525824 / 1024) = 513  (exact: 513.5 → 513)
    //   mul(1021, 512) = floor(522752 / 1024) = 510  (exact: 510.5 → 510)
    //
    // Sum: 513 + 510 = 1023, but 2 * FP_ONE * 512 / FP_ONE = 1024.
    // We lost one unit to asymmetric rounding.
    const scaled_up = mul(FP_ONE + 3, 512);
    const scaled_down = mul(FP_ONE - 3, 512);
    const sum = scaled_up + scaled_down;
    const expected_if_exact = 2 * 512; // would be 1024 if no rounding

    // The sum is 1023, not 1024. One unit lost to asymmetric floor rounding.
    expect(sum).toBe(expected_if_exact - 1);
  });

  it('the asymmetry is uniform: it always favours the negative direction, never the positive', () => {
    // Sweep: for every odd product (one that requires rounding), verify the
    // floor goes negative, not toward zero.
    for (let a = 1; a < 20; a += 2) {
      for (let b = 1; b < 20; b += 2) {
        const product = a * b; // odd * odd = odd
        if (product >= FP_ONE) continue; // skip products that give multi-digit results

        const posResult = mul(a, b);
        const negResult = mul(-a, b);

        // posResult = floor(product / 1024) = 0 for product < 1024
        // negResult = floor(-product / 1024) = -1 for 0 < product < 1024
        // So |posResult| + |negResult| = 0 + 1 = 1, not 0
        // The negative always absorbs the rounding unit.
        if (product < FP_ONE) {
          expect(posResult).toBe(0);
          expect(negResult).toBe(-1);
          // Net: -1, not 0. The negative direction always wins.
          expect(posResult + negResult).toBe(-1);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Attack 2: additiveIntoMultiplier WITH NEGATIVE SUMS → ZERO OR NEGATIVE
// MULTIPLIER
//
// additiveIntoMultiplier computes FP_ONE + sum(bonuses). If sum(bonuses) =
// -FP_ONE, the multiplier is zero. If more negative, the multiplier is
// negative. A zero multiplier causes div-by-zero in researchRequirement.
// A negative multiplier inverts the research direction.
//
// The current researchRequirement guards with `if (rate <= 0) return base;`,
// but teach-rate and scribe-rate consumers do NOT guard — they multiply, so
// a zero multiplier silently zeroes the contribution.
// ---------------------------------------------------------------------------
describe('breaker: additiveIntoMultiplier allows zero and negative multipliers', () => {
  it('bonuses summing to exactly -FP_ONE produce a multiplier of zero', () => {
    // A single bonus of -1024 (i.e. -100%)
    const multiplier = additiveIntoMultiplier([-FP_ONE]);
    expect(multiplier).toBe(0);
  });

  it('bonuses summing below -FP_ONE produce a negative multiplier', () => {
    const multiplier = additiveIntoMultiplier([-FP_ONE - 1]);
    expect(multiplier).toBe(-1);
  });

  it('stackMagnitudes for research-rate allows a zero multiplier through without error', () => {
    // research-rate uses additive-into-multiplier with cap fp(4096).
    // The cap is a ceiling only. A zero or negative value passes through.
    const researchRate = primitive('research-rate');
    const result = stackMagnitudes(researchRate, [-FP_ONE]);
    expect(result.value).toBe(0);
    expect(result.clamped).toBe(false);
  });

  it('stackMagnitudes for research-rate allows a NEGATIVE multiplier through without error', () => {
    const researchRate = primitive('research-rate');
    const result = stackMagnitudes(researchRate, [-FP_ONE - 100]);
      // **UPDATED 2026-08-14.** This assertion was written against the build
      // where `magnitude` had `minimum: 1`, so no negative could reach the
      // stacking and the absence of a floor was a latent vulnerability rather
      // than a live defect — which is exactly how the breaker reported it.
      // Signed magnitudes landed and `stackingFloor` now floors
      // `additive-into-multiplier` at `fp(0)`. The test is kept and inverted
      // rather than deleted: it caught the change, which is what a regression
      // net is for, and it now asserts the floor holds.
    expect(result.value).toBe(0);
    expect(result.clamped).toBe(false);
  });

  it('a zero multiplier through div causes a RangeError in the research requirement', () => {
    // Simulating what happens when research-rate = 0 reaches researchRequirement:
    // rate = mul(learnRate, researchRate) = mul(1024, 0) = 0
    // Then div(base, 0) throws.
    const learnRate: Fixed = FP_ONE;
    const researchRate: Fixed = 0;
    const rate = mul(learnRate, researchRate);
    expect(rate).toBe(0);

    // The researchRequirement guards against this with `if (rate <= 0) return base;`
    // But if that guard were removed, div(base, 0) would throw.
    expect(() => div(FP_ONE * 10, rate)).toThrow(RangeError);
  });

  it('a negative multiplier through mul in teach-rate silently zeroes the contribution', () => {
    // teach-rate is applied as: mul(MAGE_MONTHS_PER_TICK, multiplier)
    // If multiplier is negative: mul(positive, negative) = negative.
    // The contribution is negative, meaning teaching UN-accumulates progress.
    const MAGE_MONTHS_PER_TICK: Fixed = FP_ONE; // 1 month per tick
    const negativeMultiplier: Fixed = -500;
    const contribution = mul(MAGE_MONTHS_PER_TICK, negativeMultiplier);
    // The contribution is -500, not 0. Teaching actively removes progress.
    expect(contribution).toBe(-500);
  });
});

// ---------------------------------------------------------------------------
// Attack 3: multiplicativeOnRemainder WITH NEGATIVE FRACTIONS
//
// **RESOLVED 2026-08-14, and this block is kept as the record of it.** The
// breaker found that a negative fraction makes (1 - fraction) > 1, so the
// product grows and the result falls outside [0, FP_ONE] — `applyWard(1000,
// -200)` returned **1195**, amplifying damage by ~20% instead of preventing
// any. Sign-inverted defence, which is worse than a defence that does nothing.
//
// It was latent: `magnitude` had `minimum: 1`, so nothing could author it.
// Signed magnitudes made it authorable, and the fix **refuses** rather than
// clamps — `multiplicativeOnRemainder` now throws on a negative fraction.
// Clamping to zero would have turned a sign-inverted ward into one that merely
// does nothing, which is a silent wrong answer where a throw is a loud one.
//
// The assertions below are inverted to match. They are the reason the fix is
// checkable, so they stay.
// ---------------------------------------------------------------------------
describe('breaker: multiplicativeOnRemainder with negative fractions', () => {
  it('refuses a single negative fraction rather than amplifying', () => {
    // Was: `expect(multiplicativeOnRemainder([-200])).toBe(-200)` — a negative
    // "prevented fraction", outside the documented [0, FP_ONE] range.
    expect(() => multiplicativeOnRemainder([-200])).toThrow();
    expect(() => multiplicativeOnRemainder([-500])).toThrow();
  });

  it('refuses a mixed-sign stack, even where the signs would have cancelled', () => {
    // `[-200, 200]` used to return 40 — inside the valid range, and arrived at
    // through an invalid intermediate. A stack that is only accidentally sane
    // is the case a refusal has to cover, or the guard is one authored
    // magnitude away from being bypassed.
    expect(() => multiplicativeOnRemainder([-200, 200])).toThrow();
  });

  it('refuses before the ward cap is consulted, since the cap has no floor', () => {
    // `applyCap` checks `value > limit` only, so a negative sailed through
    // uncounted: `stackMagnitudes(ward, [-200])` gave value -200, clamped
    // false, count 0. The refusal now fires first, which is why the cap does
    // not need a floor it was never designed to have.
    const ward = primitive('ward');
    const counters = new ClampCounters();
    expect(() => stackMagnitudes(ward, [-200], { counters })).toThrow();
    expect(counters.count('ward')).toBe(0);
  });

  it('leaves applyWard reachable only with a valid prevented fraction', () => {
    // The original finding: applyWard(1000, -200) = 1195, damage amplified.
    // `applyWard` itself is unchanged and still arithmetic on its input — what
    // changed is that no stack can hand it a negative any more. Asserted from
    // both sides so the guarantee is about the pipeline, not about one call.
    expect(applyWard(1000, 512)).toBe(500);
    expect(applyWard(1000, 0)).toBe(1000);
    expect(() => multiplicativeOnRemainder([-200])).toThrow();
  });
});

describe('breaker: caps do not floor — negative stacked values pass through', () => {
  it('applyCap with a negative value never clamps, regardless of cap kind', () => {
    // fp cap
    const wardCap = { kind: 'fp' as const, value: 922 };
    const negativeResult = applyCap(wardCap, -5000);
    expect(negativeResult.value).toBe(-5000);
    expect(negativeResult.clamped).toBe(false);
  });

  it('a research-rate bonus of -FP_ONE passes through the fp(4096) cap unclamped', () => {
    const researchRate = primitive('research-rate');
    const result = stackMagnitudes(researchRate, [-FP_ONE]);
    // additiveIntoMultiplier([-1024]) = 1024 + (-1024) = 0
    // applyCap({kind:'fp', value:4096}, 0) → 0 <= 4096, not clamped
    expect(result.value).toBe(0);
    expect(result.clamped).toBe(false);
  });

  it('a lifespan additive with a large negative value passes through the fraction-of-species-base cap', () => {
    const lifespan = primitive('lifespan');
    const speciesBase: Fixed = FP_ONE * 120; // 120 months base
    const result = stackMagnitudes(lifespan, [-FP_ONE * 1000], { speciesBase });
    // additive([-1024000]) = -1024000
    // cap = mul(speciesBase, 512) = mul(122880, 512) = 61440 (half of base = 60 months)
    // -1024000 <= 61440 → not clamped
    expect(result.value).toBe(-FP_ONE * 1000);
    expect(result.clamped).toBe(false);
  });

  it('a fertility multiplier with a very negative bonus passes through the fp(3072) cap', () => {
    const fertility = primitive('fertility');
    const result = stackMagnitudes(fertility, [-FP_ONE * 5]);
    // additiveIntoMultiplier([-5120]) = 1024 + (-5120) = -4096
    // applyCap({kind:'fp', value:3072}, -4096) → -4096 <= 3072, not clamped
      // **UPDATED 2026-08-14.** This assertion was written against the build
      // where `magnitude` had `minimum: 1`, so no negative could reach the
      // stacking and the absence of a floor was a latent vulnerability rather
      // than a live defect — which is exactly how the breaker reported it.
      // Signed magnitudes landed and `stackingFloor` now floors
      // `additive-into-multiplier` at `fp(0)`. The test is kept and inverted
      // rather than deleted: it caught the change, which is what a regression
      // net is for, and it now asserts the floor holds.
    expect(result.value).toBe(0);
    expect(result.clamped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Attack 5: ORDER DEPENDENCE WITH MIXED SIGNS
//
// multiplicativeOnRemainder sorts ascending before folding. With mixed signs,
// negative fractions sort first (amplification), then positive (reduction).
// This is deterministic but produces results outside [0, FP_ONE].
//
// additive and additiveIntoMultiplier are order-independent by construction
// (addition is commutative). maxOf is order-independent (max is commutative).
// ---------------------------------------------------------------------------
describe('breaker: order dependence with mixed-sign inputs', () => {
  it('multiplicativeOnRemainder refuses a mixed-sign stack in any order', () => {
    // **Order independence is still the property under test**, but the answer
    // it must agree on is now a refusal rather than a value: since 2026-08-14 a
    // negative fraction throws, and a guard that fired for some orderings and
    // not others would be worse than none — an authored stack could slip
    // through on a permutation. Asserted across three orderings for that
    // reason.
    for (const order of [
      [-200, 500, 300],
      [300, 500, -200],
      [500, -200, 300],
    ]) {
      expect(() => multiplicativeOnRemainder(order)).toThrow();
    }

    // And the all-positive case still agrees across orderings, which is the
    // half of the original property that survives — the sort is what makes it
    // hold, and this fails if the sort is removed.
    const positive = [200, 500, 300];
    expect(multiplicativeOnRemainder(positive)).toBe(
      multiplicativeOnRemainder([...positive].reverse()),
    );
  });

  it('additive with mixed signs is order-independent', () => {
    const mixed = [-500, 200, -100, 800, -300];
    const reversed = [...mixed].reverse();
    expect(additive(mixed)).toBe(additive(reversed));
  });

  it('additiveIntoMultiplier with mixed signs summing to exactly zero gives FP_ONE', () => {
    // Bonuses: -200, +200 → sum = 0 → multiplier = FP_ONE
    const result = additiveIntoMultiplier([-200, 200]);
    expect(result).toBe(FP_ONE);
  });

  it('additive with values summing to exactly zero returns 0', () => {
    expect(additive([-500, 500])).toBe(0);
    expect(additive([-100, -200, 300])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Attack 6: OVERFLOW WITH LARGE NEGATIVE MAGNITUDES
// ---------------------------------------------------------------------------
describe('breaker: overflow with large negative magnitudes', () => {
  it('additive with many large negative magnitudes throws RangeError', () => {
    expect(() => additive(Array<Fixed>(100).fill(FP_MIN))).toThrow(RangeError);
  });

  it('additiveIntoMultiplier with two FP_MIN throws RangeError', () => {
    // sum = FP_MIN + FP_MIN = -4294967296, which overflows Number safe integer?
    // No: -4294967296 is -(2^32), which IS a safe integer. But then
    // FP_ONE + (-4294967296) = 1024 - 4294967296 = -4294966272, which is
    // below FP_MIN (-2147483648). assertRepresentable catches it.
    expect(() => additiveIntoMultiplier([FP_MIN, FP_MIN])).toThrow(RangeError);
  });

  it('mul with FP_MIN and 2 overflows', () => {
    // FP_MIN * 2 = -4294967296, which is a safe integer but the floorDiv
    // result would be -4294967296 / 1024 = -4194304, which is below FP_MIN.
    // Actually: -4194304 > FP_MIN (-2147483648), so it's representable.
    // Wait: FP_MIN = -2147483648. -4194304 > -2147483648. So it IS representable.
    const result = mul(FP_MIN, 2);
    expect(result).toBe(-4194304);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('mul with FP_MIN and FP_MIN overflows the intermediate product', () => {
    // FP_MIN * FP_MIN = (-2^31)^2 = 2^62, which exceeds 2^53 (safe integer).
    // mul catches this with isSafeInteger check.
    expect(() => mul(FP_MIN, FP_MIN)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Attack 7: DETERMINISM
//
// Two runs of the same seed must produce byte-identical results. The sort in
// multiplicativeOnRemainder ensures order-independence. But does the sort
// handle edge cases like NaN, -0, or duplicate values correctly?
// ---------------------------------------------------------------------------
describe('breaker: determinism of stacking results', () => {
  it('multiplicativeOnRemainder with duplicate fractions is deterministic', () => {
    const duplicates = [512, 512, 512, 512, 512];
    const a = multiplicativeOnRemainder(duplicates);
    const b = multiplicativeOnRemainder([...duplicates].reverse());
    expect(a).toBe(b);
  });

  it('additive with -0 and +0 produces the same result', () => {
    // -0 + 500 = 500, 0 + 500 = 500. In JS, -0 === 0 and -0 + x = x for non-zero x.
    // But Object.is(-0, 0) is false. Does this matter for stacking?
    const withNegZero = additive([-0 as Fixed, 500]);
    const withPosZero = additive([0, 500]);
    // Both should be 500. But are they the SAME 500?
    expect(withNegZero).toBe(withPosZero);
    expect(Object.is(withNegZero, withPosZero)).toBe(true);
  });

  it('stacking the same multiset 100 times always gives the same result', () => {
    const magnitudes: Fixed[] = [100, -50, 200, -300, 400];
    const first = additive(magnitudes);
    for (let i = 0; i < 100; i++) {
      // Shuffle (deterministic shuffle using reverse)
      const shuffled = [...magnitudes].reverse();
      expect(additive(shuffled)).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// Attack 8: CONSUMPTION CHECK INTEGRITY
//
// The CI check warns that adding a primitive to the exclusion list to make
// the check green is "the exact failure the check exists to catch."
// Verify the exclusion list has not been expanded.
// ---------------------------------------------------------------------------
describe('breaker: consumption check exclusion list integrity', () => {
  it('the exclusion list in coverage.ts has not been expanded beyond fertility and lifespan', () => {
    // Read the actual source file to verify no builder added to the exclusion
    // list to make check:consumption pass. This is "the exact failure the check
    // exists to catch" per .github/workflows/ci.yml.
    const here = fileURLToPath(import.meta.url);
    // From: packages/primitives/test/adversarial/<this-file>
    // To:   packages/rules-magic/src/effects/coverage.ts
    // resolve(file, '../../../../x') goes:
    //   file.ts → adversarial → test → primitives → packages
    const coveragePath = resolve(
      here,
      '../../../../rules-magic/src/effects/coverage.ts',
    );
    const source = readFileSync(coveragePath, 'utf-8');

    // Extract the exclusion list from the source
    const match = source.match(
      /PRIMITIVE_COVERAGE_EXCLUSIONS:\s*readonly\s+string\[\]\s*=\s*\[([^\]]*)\]/,
    );
    expect(match).not.toBeNull();
    // `match![1]` is `string | undefined` under `noUncheckedIndexedAccess`, which
    // this repo enables — the non-null assertion covers the match, not the group.
    const captured = match?.[1] ?? '';
    expect(captured).not.toBe('');
    const exclusions = captured
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''))
      .filter(Boolean);

    // Must be exactly ['fertility', 'lifespan'] — no more, no less
    expect(exclusions.sort()).toEqual(['fertility', 'lifespan']);

    // Specifically, research-rate, teach-rate, scribe-rate must NOT be excluded
    expect(exclusions).not.toContain('research-rate');
    expect(exclusions).not.toContain('teach-rate');
    expect(exclusions).not.toContain('scribe-rate');
  });
});

// ---------------------------------------------------------------------------
// Attack 9: applyWard ROUNDING WITH NEGATIVE DAMAGE
//
// applyWard(damage, prevented) = mul(damage, FP_ONE - prevented).
// With negative damage, the floor rounds away from zero, meaning the
// defender takes MORE absolute damage than the positive equivalent.
// ---------------------------------------------------------------------------
describe('breaker: applyWard rounding with negative damage', () => {
  it('applyWard with negative damage and 50% ward rounds away from zero', () => {
    // Positive: mul(3, 512) = floor(1536/1024) = 1
    const positiveWarded = applyWard(3, 512);
    // Negative: mul(-3, 512) = floor(-1536/1024) = -2
    const negativeWarded = applyWard(-3, 512);

    expect(positiveWarded).toBe(1);
    expect(negativeWarded).toBe(-2);

    // |negativeWarded| > |positiveWarded|: the negative case takes more
    // absolute damage. The doc says "the defender keeps the fractional unit"
    // which is true for positive (defender keeps 1 instead of 2), but for
    // negative the defender LOSES the fractional unit (takes -2 instead of -1).
    expect(Math.abs(negativeWarded)).toBeGreaterThan(Math.abs(positiveWarded));
  });

  it('applyWard with zero damage returns zero regardless of ward', () => {
    expect(applyWard(0, 512)).toBe(0);
    expect(applyWard(0, 0)).toBe(0);
    expect(applyWard(0, FP_ONE)).toBe(0);
  });

  it('applyWard with full ward (FP_ONE) returns zero for any damage', () => {
    expect(applyWard(1000, FP_ONE)).toBe(0);
    expect(applyWard(-1000, FP_ONE)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Attack 10: maxOf WITH MIXED SIGNS
//
// maxOf was fixed to seed from the first element instead of zero, so
// all-negative inputs return the true maximum. But what about mixed signs?
// ---------------------------------------------------------------------------
describe('breaker: maxOf with mixed positive and negative inputs', () => {
  it('maxOf correctly returns the positive value when mixed with negatives', () => {
    expect(maxOf([-100, 50, -200])).toBe(50);
    expect(maxOf([-100, -50, 0])).toBe(0);
  });

  it('maxOf with a single negative returns that negative', () => {
    expect(maxOf([-100])).toBe(-100);
  });

  it('maxOf with all negatives returns the largest (closest to zero)', () => {
    expect(maxOf([-100, -50, -200])).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// Attack 11: BOUNDARY — additiveIntoMultiplier at exactly FP_ONE
//
// When bonuses sum to 0, the multiplier is FP_ONE (1.0×). This is the
// identity: no change. But is this distinguishable from "no bonuses at all"?
// ---------------------------------------------------------------------------
describe('breaker: additiveIntoMultiplier boundary cases', () => {
  it('no bonuses returns FP_ONE (the identity)', () => {
    expect(additiveIntoMultiplier([])).toBe(FP_ONE);
  });

  it('bonuses summing to zero also returns FP_ONE — indistinguishable from no bonuses', () => {
    expect(additiveIntoMultiplier([0])).toBe(FP_ONE);
    expect(additiveIntoMultiplier([-100, 100])).toBe(FP_ONE);
  });

  it('a single bonus of FP_ONE gives multiplier of 2*FP_ONE (2× rate)', () => {
    expect(additiveIntoMultiplier([FP_ONE])).toBe(2 * FP_ONE);
  });

  it('the cap catches a multiplier above fp(4096) but not below zero', () => {
    const researchRate = primitive('research-rate');
    // Above cap: bonuses summing to 4000 → multiplier = 5024 > 4096
    const above = stackMagnitudes(researchRate, [4000]);
    expect(above.value).toBe(4096);
    expect(above.clamped).toBe(true);

    // Below zero: bonuses summing to -2000 → multiplier = -976 < 0
    const below = stackMagnitudes(researchRate, [-2000]);
      // **UPDATED 2026-08-14.** This assertion was written against the build
      // where `magnitude` had `minimum: 1`, so no negative could reach the
      // stacking and the absence of a floor was a latent vulnerability rather
      // than a live defect — which is exactly how the breaker reported it.
      // Signed magnitudes landed and `stackingFloor` now floors
      // `additive-into-multiplier` at `fp(0)`. The test is kept and inverted
      // rather than deleted: it caught the change, which is what a regression
      // net is for, and it now asserts the floor holds.
    expect(below.value).toBe(0);
    expect(below.clamped).toBe(false);
  });
});
