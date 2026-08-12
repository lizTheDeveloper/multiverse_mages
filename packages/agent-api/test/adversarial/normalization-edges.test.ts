/*
 * Multiverse Mages — adversarial: the normalization descriptors at their edges.
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
 * **One test here fails — DEFECT 7, at the bottom.** Everything else is the
 * published negative result for the attack the brief asked for on
 * `NormalizationDescriptor`'s single `divisor` field:
 *
 * > `divisor` is the single numeric field, doing duty as both §4.1's divisor and
 * > the capability's saturation constant — the builder argued one field because
 * > "two fields holding one fact can disagree". Test whether one field can serve
 * > both meanings correctly at the edges.
 *
 * It can, for all five rules. `src/layout.ts` defines the field as *"The
 * saturation constant: the integer that maps to {@link max}"*, and that sentence
 * is true of every rule as implemented:
 *
 * | rule | `divisor` | does `applyDescriptor(divisor)` equal `max`? |
 * |---|---|---|
 * | `ratio` | the declared constant | yes, exactly |
 * | `bounded` | `FP_ONE` | yes, exactly |
 * | `log-bucket` | the top edge | yes, exactly — `bucketOf` returns `edges.length` |
 * | `flag` | `1` | yes — `1 > 0` |
 * | `identity` | `1` | yes — `clamp(1)` |
 *
 * The one place the two meanings could have come apart is `log-bucket`, where
 * the arithmetic divides by `edges.length` and not by `divisor` at all. The
 * invariant that keeps them consistent is enforced twice, in `logBucketScale`
 * (`divisor: previous`) and again in `edgeProblemOf`, which rejects a descriptor
 * whose top edge and constant disagree. Both were attacked below.
 *
 * The other axes covered here, all of which held:
 *
 * - Fixed-point conversion at `1023`, `1024`, `1025`, `0`, negatives, `FP_MAX`.
 * - Clamp versus saturation off-by-one at `divisor - 1`, `divisor`, `divisor + 1`
 *   for every rule.
 * - `NaN`, `±Infinity` and `-0` entering `applyDescriptor` directly.
 * - Monotonicity: no rule can export a smaller number for a larger input.
 * - `log-bucket` and `identity` — the two rules **no slot elects**, and therefore
 *   the two whose defects nothing else in the suite would notice.
 * - `saturate()` at the `Int32Array` boundaries and one past them.
 *
 * Two genuine findings came out of this axis. One lives in
 * `layout-digest-attack.test.ts`: `clamp` returns `descriptor.min` by identity,
 * so a `-0` floor produces a `-0` export. The other is DEFECT 7, below.
 *
 * # DEFECT 7 — `NaN` in a `log-bucket` channel exports the *maximum*
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `bucketOf` counts edges with `if (value < edge) break;`. Every comparison
 * against `NaN` is `false`, so the loop never breaks, `reached` reaches
 * `edges.length`, and the quotient is exactly `1`. `clamp` then passes it
 * through. So `applyDescriptor(NaN, logBucketScale([1, 4, 16, 64]))` is `1` —
 * a saturated channel — while the same input under `ratio`, `bounded`, `flag`
 * and `identity` is `0`.
 *
 * ## (b) What says otherwise
 *
 * `src/normalize.ts`, on the line that is supposed to handle exactly this, and
 * says so in its own trailing comment:
 *
 * ```ts
 * if (!(value > descriptor.min)) return descriptor.min; // also catches NaN and -0
 * ```
 *
 * The negated comparison is written that way *because* `NaN` fails every
 * ordinary test — that is the whole reason for `!(a > b)` rather than `a <= b`.
 * The intent is unambiguous: `NaN` lands at `min`. `bucketOf` runs before
 * `clamp` and turns the input into a legitimate-looking `1` first, so the guard
 * never sees it.
 *
 * `src/normalize.ts` on `bucketOf` itself:
 *
 * > a scan is the version whose **correctness is obvious at the one place it
 * > matters**, the boundary between two buckets.
 *
 * ## (c) Why the asserted value is right
 *
 * The four other rules floor `NaN`; one ceilings it. Whichever convention is
 * chosen, five rules disagreeing about the same input is not a convention. And
 * the direction matters here rather than being arbitrary: a corrupt or missing
 * count that reads `0` says *"this universe has none of that"*, which is the
 * safe reading and the one every other channel gives; the same count reading
 * `1.0` says *"this universe is at the ceiling"*, which is the loudest possible
 * signal a channel can send and is what a policy will act on.
 *
 * Unreachable today, and that is exactly why it is worth a test: `log-bucket` is
 * elected by no slot, the raw vector is an `Int32Array` and cannot hold `NaN`,
 * so nothing in the existing suite could catch this. `src/layout.ts` says the
 * rule ships *"so that whoever has evidence a channel's dynamic range needs it
 * can adopt it as a digest-changing, reviewable move"* — and DEFECT 3 above is
 * an argument for adopting it. The first channel to elect `log-bucket` inherits
 * this, and `applyDescriptor` is exported, so a caller normalizing a value of
 * its own reaches it today.
 */

import { FP_MAX, FP_ONE } from '@mm/sim-core';
import type { NormalizationDescriptor } from '@mm/agent-api';
import {
  BOOLEAN_SCALE,
  FP_SCALE,
  IDENTITY_SCALE,
  NORMALIZATION_RULES,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_SIZE,
  applyDescriptor,
  boundedScale,
  flagScale,
  identityScale,
  logBucketScale,
  normalizedObservation,
  ratioScale,
  saturate,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

/** One descriptor per rule, so nothing is tested only through the rules a slot elects. */
const ONE_OF_EACH: readonly NormalizationDescriptor[] = Object.freeze([
  ratioScale(1_000),
  boundedScale(),
  logBucketScale([1, 4, 16, 64]),
  flagScale(),
  identityScale(),
]);

describe('the single divisor field serves both of its meanings, for all five rules', () => {
  it('covers every rule the spec permits, so no arm is left untested', () => {
    expect(ONE_OF_EACH.map((descriptor) => descriptor.rule)).toEqual([...NORMALIZATION_RULES]);
  });

  it('maps the saturation constant to exactly max, for every rule', () => {
    for (const descriptor of ONE_OF_EACH) {
      expect(applyDescriptor(descriptor.divisor, descriptor), descriptor.rule).toBe(descriptor.max);
    }
  });

  it('maps zero to exactly min, for every rule', () => {
    for (const descriptor of ONE_OF_EACH) {
      expect(applyDescriptor(0, descriptor), descriptor.rule).toBe(descriptor.min);
    }
  });

  it('never exceeds max above the constant, for every rule', () => {
    for (const descriptor of ONE_OF_EACH) {
      for (const multiple of [1, 2, 17, 1_000_000]) {
        const value = descriptor.divisor * multiple;
        expect(applyDescriptor(value, descriptor), `${descriptor.rule} at ${String(value)}`)
          .toBeLessThanOrEqual(descriptor.max);
      }
    }
  });

  it('never drops below min under the constant, for every rule', () => {
    for (const descriptor of ONE_OF_EACH) {
      for (const value of [-1, -1_000, -FP_ONE, Number.MIN_SAFE_INTEGER]) {
        expect(applyDescriptor(value, descriptor), `${descriptor.rule} at ${String(value)}`)
          .toBeGreaterThanOrEqual(descriptor.min);
      }
    }
  });

  it('is monotonic non-decreasing in its input, for every rule', () => {
    // The property a non-monotonic bucket list would break, checked for all
    // five rather than only the one whose factory validates for it.
    for (const descriptor of ONE_OF_EACH) {
      let previous = Number.NEGATIVE_INFINITY;
      for (let value = -8; value <= 1_200; value += 1) {
        const exported = applyDescriptor(value, descriptor);
        expect(exported, `${descriptor.rule} at ${String(value)}`).toBeGreaterThanOrEqual(previous);
        previous = exported;
      }
    }
  });
});

describe('the fixed-point boundary, one integer either side', () => {
  it('maps 1024 to exactly 1.0 and 0 to exactly 0.0', () => {
    // The capability spec's scenario, literally: *"WHEN a slot whose rule is
    // `bounded` holds the core value `1024` THEN the exported element equals
    // `1.0` exactly"*.
    expect(applyDescriptor(FP_ONE, FP_SCALE)).toBe(1);
    expect(applyDescriptor(0, FP_SCALE)).toBe(0);
  });

  it('maps 1023 to a value strictly below one, exactly representable', () => {
    // 1023/1024 is dyadic, so "exactly" is a real claim rather than a rounding
    // one, and `toBe` rather than `toBeCloseTo` is what checks it.
    expect(applyDescriptor(FP_ONE - 1, FP_SCALE)).toBe(0.9990234375);
    expect(applyDescriptor(FP_ONE - 1, FP_SCALE)).toBeLessThan(1);
  });

  it('saturates at 1025 rather than exceeding one', () => {
    expect(applyDescriptor(FP_ONE + 1, FP_SCALE)).toBe(1);
    expect(applyDescriptor(FP_MAX, FP_SCALE)).toBe(1);
  });

  it('floors a negative fixed-point value at zero, including at FP_MIN', () => {
    expect(applyDescriptor(-1, FP_SCALE)).toBe(0);
    expect(applyDescriptor(-FP_ONE, FP_SCALE)).toBe(0);
    expect(applyDescriptor(-2147483648, FP_SCALE)).toBe(0);
  });

  it('emits positive zero, never negative zero, at every floored input', () => {
    for (const descriptor of ONE_OF_EACH) {
      for (const value of [-0, -1, -FP_ONE, 0]) {
        const exported = applyDescriptor(value, descriptor);
        expect(Object.is(exported, -0), `${descriptor.rule} at ${String(value)}`).toBe(false);
      }
    }
  });
});

describe('clamp versus saturation, one either side of the constant', () => {
  it('is exact one integer below, at, and one above a ratio constant', () => {
    const descriptor = ratioScale(1_000);
    expect(applyDescriptor(999, descriptor)).toBe(0.999);
    expect(applyDescriptor(1_000, descriptor)).toBe(1);
    expect(applyDescriptor(1_001, descriptor)).toBe(1);
  });

  it('treats a flag as set for every positive value and unset otherwise', () => {
    expect(applyDescriptor(1, BOOLEAN_SCALE)).toBe(1);
    expect(applyDescriptor(2, BOOLEAN_SCALE)).toBe(1);
    expect(applyDescriptor(2147483647, BOOLEAN_SCALE)).toBe(1);
    expect(applyDescriptor(0, BOOLEAN_SCALE)).toBe(0);
    expect(applyDescriptor(-1, BOOLEAN_SCALE)).toBe(0);
  });
});

describe('the two rules no slot elects', () => {
  it('log-bucket lands on the boundary the docstring promises, edge by edge', () => {
    // `src/layout.ts`: *"`[1, 4, 16]` gives four buckets: below 1, at least 1,
    // at least 4, at least 16 — exported as `0`, `1/3`, `2/3`, `1`"*.
    const descriptor = logBucketScale([1, 4, 16]);
    expect(applyDescriptor(0, descriptor)).toBe(0);
    expect(applyDescriptor(1, descriptor)).toBeCloseTo(1 / 3, 15);
    expect(applyDescriptor(3, descriptor)).toBeCloseTo(1 / 3, 15);
    expect(applyDescriptor(4, descriptor)).toBeCloseTo(2 / 3, 15);
    expect(applyDescriptor(15, descriptor)).toBeCloseTo(2 / 3, 15);
    expect(applyDescriptor(16, descriptor)).toBe(1);
    expect(applyDescriptor(17, descriptor)).toBe(1);
    expect(applyDescriptor(-1, descriptor)).toBe(0);
  });

  it('log-bucket keeps its constant equal to its top edge under every factory call', () => {
    for (const edges of [[1], [1, 2], [1, 4, 16, 64, 256], [3, 5, 7, 4_096]]) {
      const descriptor = logBucketScale(edges);
      expect(descriptor.divisor).toBe(edges[edges.length - 1]);
      expect(applyDescriptor(descriptor.divisor, descriptor)).toBe(1);
    }
  });

  it('log-bucket refuses every edge list that would break monotonicity or exactness', () => {
    expect(() => logBucketScale([])).toThrow(/at least one edge/);
    expect(() => logBucketScale([0])).toThrow(/must be positive/);
    expect(() => logBucketScale([-4])).toThrow(/must be positive/);
    expect(() => logBucketScale([1, 1])).toThrow(/strictly increasing/);
    expect(() => logBucketScale([4, 2])).toThrow(/strictly increasing/);
    expect(() => logBucketScale([1, 2.5])).toThrow(/must be an integer/);
    expect(() => logBucketScale([1, Number.NaN])).toThrow(/must be an integer/);
    expect(() => logBucketScale([1, 2 ** 53])).toThrow(/must be an integer/);
  });

  it('log-bucket freezes its edge list, so a descriptor cannot be re-cut later', () => {
    const descriptor = logBucketScale([1, 4, 16]);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.edges)).toBe(true);
    // Copying the caller's array rather than aliasing it: mutating the input
    // afterwards must not move the descriptor.
    const source = [1, 4, 16];
    const fromSource = logBucketScale(source);
    source[2] = 999;
    expect([...(fromSource.edges ?? [])]).toEqual([1, 4, 16]);
  });

  it('identity passes an in-range value through untouched and clamps outside it', () => {
    expect(applyDescriptor(0, IDENTITY_SCALE)).toBe(0);
    expect(applyDescriptor(1, IDENTITY_SCALE)).toBe(1);
    expect(applyDescriptor(2, IDENTITY_SCALE)).toBe(1);
    expect(applyDescriptor(-1, IDENTITY_SCALE)).toBe(0);
    expect(applyDescriptor(0.25, IDENTITY_SCALE)).toBe(0.25);
  });

  it('rejects a saturation constant that could not have been a literal', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => ratioScale(bad), `constant ${String(bad)}`).toThrow(/positive integer/);
    }
  });
});

describe('non-finite and pathological inputs to the exporter', () => {
  it('HOLDS: NaN never propagates into the export, under any rule', () => {
    // The half that works. Nothing turns into a NaN channel, which is what the
    // capability spec's *"no `NaN`"* asks for; the direction of the floor is the
    // separate question below.
    for (const descriptor of ONE_OF_EACH) {
      expect(Number.isNaN(applyDescriptor(Number.NaN, descriptor)), descriptor.rule).toBe(false);
    }
  });

  it('DEFECT 7 — FAILS ON PURPOSE: NaN floors to min under every rule', () => {
    // `log-bucket` ceilings it instead; see this file's opening note for the
    // case. Asserted over all five so the fix has to make them agree rather than
    // special-case one.
    const exported = ONE_OF_EACH.map((descriptor) => [
      descriptor.rule,
      applyDescriptor(Number.NaN, descriptor),
    ]);
    expect(exported).toEqual(ONE_OF_EACH.map((descriptor) => [descriptor.rule, descriptor.min]));
  });

  it('clamps infinities to the declared bounds, for every rule', () => {
    for (const descriptor of ONE_OF_EACH) {
      expect(applyDescriptor(Number.POSITIVE_INFINITY, descriptor), descriptor.rule).toBe(
        descriptor.max,
      );
      expect(applyDescriptor(Number.NEGATIVE_INFINITY, descriptor), descriptor.rule).toBe(
        descriptor.min,
      );
    }
  });

  it('exports a finite bounded double for every channel at the Int32Array extremes', () => {
    for (const fill of [0, -1, 1, 2147483647, -2147483648]) {
      const raw = new Int32Array(OBSERVATION_SIZE);
      raw.fill(fill);
      const exported = normalizedObservation(raw);
      for (const [index, value] of exported.entries()) {
        expect(Number.isFinite(value), `channel ${String(index)} at fill ${String(fill)}`).toBe(
          true,
        );
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        expect(Object.is(value, -0)).toBe(false);
      }
    }
  });

  it('refuses a vector of any wrong width rather than padding or truncating', () => {
    for (const width of [0, 1, OBSERVATION_SIZE - 1, OBSERVATION_SIZE + 1]) {
      expect(() => normalizedObservation(new Int32Array(width))).toThrow(/layout mismatch/);
    }
    expect(() => normalizedObservation(new Int32Array(OBSERVATION_SIZE))).not.toThrow();
  });

  it('gives every shipped descriptor a positive-integer constant and a [0, 1] clamp', () => {
    expect(OBSERVATION_DESCRIPTORS).toHaveLength(OBSERVATION_SIZE);
    for (const [index, descriptor] of OBSERVATION_DESCRIPTORS.entries()) {
      expect(Number.isSafeInteger(descriptor.divisor), `channel ${String(index)}`).toBe(true);
      expect(descriptor.divisor, `channel ${String(index)}`).toBeGreaterThan(0);
      expect(Object.is(descriptor.min, 0), `channel ${String(index)} floor`).toBe(true);
      expect(descriptor.max, `channel ${String(index)}`).toBe(1);
      expect(Object.isFrozen(descriptor), `channel ${String(index)}`).toBe(true);
    }
  });
});

describe('saturate, at the Int32Array boundary', () => {
  it('clamps rather than wrapping, one either side of each end', () => {
    expect(saturate(2147483647)).toBe(2147483647);
    expect(saturate(2147483648)).toBe(2147483647);
    expect(saturate(Number.MAX_SAFE_INTEGER)).toBe(2147483647);
    expect(saturate(-2147483648)).toBe(-2147483648);
    expect(saturate(-2147483649)).toBe(-2147483648);
    expect(saturate(0)).toBe(0);
  });

  it('refuses a non-integer rather than truncating it', () => {
    for (const bad of [0.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => saturate(bad), `value ${String(bad)}`).toThrow(/integers only/);
    }
  });
});
