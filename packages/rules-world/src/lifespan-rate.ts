/*
 * Multiverse Mages — extended-scale division for rates derived from a lifespan.
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

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';

/**
 * ## The defect this module exists to make impossible
 *
 * `docs/design/contracts.md` §3 states it outright, and states it because it is
 * the kind of bug that survives review:
 *
 * > A draconic lifespan of 18,000 months divided at `fp` scale floors to **zero
 * > hazard**, and dragons become silently immortal — a defect that would survive
 * > thousands of Monte Carlo runs looking like a species that is merely very
 * > long-lived.
 *
 * Nothing about `floorDiv(hazard, lifespanMonths)` looks wrong. It uses the one
 * shared rounding helper, it is integer-only, it has no float in it, and it
 * passes every purity check in this repository. It is simply zero for every
 * long-lived species, because `fp(1024) / 18000` has no representation at a
 * scale whose smallest step is `1/1024`. There is no crash, no clamp counter,
 * no diagnostic — the run just never kills a dragon, and the resulting balance
 * baseline is wrong in a direction nobody is looking.
 *
 * The fix is to divide at a **wider scale than the result will be read at** and
 * to keep it there: the numerator is pre-shifted by `2^10`, and the quotient is
 * compared against a draw over the same widened range. Narrowing back to `fp`
 * before the comparison would reintroduce exactly the floor it was widened to
 * escape, which is why {@link narrowToFixed} is documented as an output-only
 * convenience and never used on the hazard path.
 *
 * ## Why it is a module and not a line
 *
 * `contracts.md` §3 requires this of *any* rate of the form `X / lifespanMonths`,
 * not only mortality, and `mages-and-species`' risk register notes that
 * long-lived species divide small numerators by large lifespans in several
 * places. One helper with one test is the only version of that rule that stays
 * true as the second and third call sites arrive.
 */

/**
 * Extra bits of precision the division is performed at, beyond `fp`.
 *
 * Ten bits is not arbitrary. The worst case in shipped content is the smallest
 * hazard numerator over the draconic lifespan of 18,000 months; at `fp` scale
 * that quotient is 0, and each added bit doubles it. Ten bits puts it at 58
 * units of {@link LIFESPAN_RATE_ONE}, comfortably clear of zero and still far
 * inside exact integer arithmetic for every numerator the hazard table reaches.
 */
export const LIFESPAN_RATE_SHIFT = 10;

/**
 * The value that means "certainty" at extended scale — the denominator a draw
 * is taken over.
 *
 * `fp(1024) << 10 = 1_048_576`. A probability expressed at this scale is
 * compared against a uniform draw in `[0, LIFESPAN_RATE_ONE)`.
 */
export const LIFESPAN_RATE_ONE: number = FP_ONE << LIFESPAN_RATE_SHIFT;

/**
 * A per-world-tick rate derived from a lifespan, at extended scale.
 *
 * @param numerator - The scale-free numerator, in fixed point. For mortality
 * this is `H(normalizedAge)` from the shared hazard table.
 * @param lifespanMonths - The species' effective lifespan in world ticks
 * (months). Must be a positive integer.
 * @returns The rate in units of `1 / LIFESPAN_RATE_ONE`, rounded toward
 * negative infinity like every other division in the rules path.
 *
 * @throws RangeError if `lifespanMonths` is not a positive integer, or if the
 * pre-shifted numerator would leave exact integer arithmetic. Both are refusals
 * rather than saturations: a rate this function cannot compute exactly is a
 * rate no caller should be handed a plausible-looking answer for.
 */
export function perLifespanRate(numerator: Fixed, lifespanMonths: number): number {
  if (!Number.isInteger(lifespanMonths) || lifespanMonths <= 0) {
    throw new RangeError(
      `perLifespanRate needs a positive integer lifespanMonths, received ${String(lifespanMonths)}`,
    );
  }
  if (!Number.isInteger(numerator) || numerator < 0) {
    throw new RangeError(
      `perLifespanRate needs a non-negative fixed-point numerator, received ${String(numerator)}`,
    );
  }

  // Pre-shift by 2^LIFESPAN_RATE_SHIFT — not by LIFESPAN_RATE_ONE. The
  // numerator is already at `fp` scale, so widening it by the *extra* ten bits
  // is what lands the quotient at extended scale; multiplying by the whole
  // extended one would scale it a second time by `fp`.
  const widened = numerator * (1 << LIFESPAN_RATE_SHIFT);
  if (!Number.isSafeInteger(widened)) {
    throw new RangeError(
      `perLifespanRate numerator ${String(numerator)} overflows extended scale. The hazard table is ` +
        'scale-free and its entries are bounded; a numerator this large means the table, not this helper, is wrong.',
    );
  }

  return floorDiv(widened, lifespanMonths);
}

/**
 * The same division performed at plain `fp` scale — **the defect**, exported so
 * a test can demonstrate it rather than describe it.
 *
 * Keeping the wrong arithmetic in the repository, named, is deliberate. The
 * alternative is a test that asserts only "the right answer is non-zero", which
 * passes just as happily against an implementation that is right for a
 * different reason, and says nothing about the failure it was written for. Here
 * the test can assert both halves: this returns 0 for a dragon, and
 * {@link perLifespanRate} does not.
 *
 * Nothing on the rules path may call this.
 */
export function naivePerLifespanRate(numerator: Fixed, lifespanMonths: number): number {
  return floorDiv(numerator, lifespanMonths);
}

/**
 * Narrows an extended-scale rate back to `fp`, for emission and display only.
 *
 * Lossy by construction — it is the narrowing this module exists to defer — so
 * it must never be applied before a comparison against a draw. A draconic
 * hazard narrowed this way is `0` again, and a caller that narrows first has
 * reintroduced the whole defect while appearing to use the safe helper.
 */
export function narrowToFixed(extendedRate: number): Fixed {
  return floorDiv(extendedRate, 1 << LIFESPAN_RATE_SHIFT);
}
