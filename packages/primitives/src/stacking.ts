/*
 * Multiverse Mages — the one implementation of primitive stacking arithmetic.
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
 * ## Why these four functions exist instead of four idioms
 *
 * `docs/design/contracts.md` §3 gives every effect primitive a declared
 * stacking rule, and the design note behind it names the failure that motivates
 * the whole task group: *the single most likely silent disagreement between two
 * implementers is whether two `+20%` research bonuses produce `+40%` or `+44%`*.
 * Both answers are defensible in isolation. Neither is detectable by reading
 * one call site. The difference compounds across a Monte Carlo run until a
 * balance baseline is irreproducible for reasons nobody can name.
 *
 * So the rule is data on the primitive (`primitive.json`), the arithmetic is
 * these functions, and a lint rule (`eslint.config.mjs`,
 * `BAN_INLINE_PRIMITIVE_STACKING`) rejects the obvious ways to write it inline
 * anywhere else.
 *
 * ## Rounding
 *
 * Only {@link multiplicativeOnRemainder} and {@link applyWard} divide, and both
 * go through `mul` from `@mm/sim-core`, which floors toward negative infinity
 * through the single shared `floorDiv`. That direction is stated per function
 * below in terms of *who it favours*, because "the damage formula rounds
 * differently for negative modifiers" is a balance mystery that costs weeks and
 * a comment costs a line.
 *
 * The other three rules — additive, additive-into-multiplier, max — perform no
 * division at all, so they are exact and there is nothing to round.
 *
 * ## The empty case
 *
 * Each function states its identity for zero sources, because "what happens
 * when nothing applies" is the other silent disagreement. Additive and max
 * yield `0`; additive-into-multiplier yields `FP_ONE`, since a multiplier with
 * nothing in it must change nothing; multiplicative-on-remainder yields `0`
 * prevented, i.e. the whole effect survives.
 */

import { FP_MAX, FP_MIN, FP_ONE, mul } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';

/**
 * Range guard for the operations that do not go through `mul`, which does its
 * own. A stacked total that leaves the `Fixed` domain is a content bug — a
 * magnitude authored three orders of magnitude off — and silently wrapping it
 * would surface as a negative research rate a hundred ticks later.
 */
function assertRepresentable(value: Fixed, operation: string): Fixed {
  if (!Number.isInteger(value) || value < FP_MIN || value > FP_MAX) {
    throw new RangeError(
      `${operation} left the fixed-point domain: ${String(value)} is outside ` +
        `[${String(FP_MIN)}, ${String(FP_MAX)}]. Check the authored magnitudes.`,
    );
  }
  return value;
}

/**
 * Plain summation. The rule for `area-denial`, `summon`, `lifespan`, and the
 * per-tick side of `direct-damage`.
 *
 * Exact: no division, so no rounding. Negative magnitudes (a debuff) sum by the
 * same path as positive ones rather than through a sign-dependent branch.
 *
 * @returns `0` for no sources.
 */
export function additive(magnitudes: readonly Fixed[]): Fixed {
  let total: Fixed = 0;
  for (const magnitude of magnitudes) {
    total += magnitude;
  }
  return assertRepresentable(total, 'additive stacking');
}

/**
 * `(1 + Σbonus)` — the rule for every world-scale rate multiplier.
 *
 * This is the `+40%` answer, and it is the one the contract picks. Two `+20%`
 * bonuses give `fp(1024) + fp(204) + fp(204)`, not `mul(fp(1228), fp(1228))`.
 * The reason is compounding: the design contains two loops that feed each other
 * (worship, and knowledge-as-capital), and multiplying rate bonuses together
 * inside a compounding loop is how a strategy game acquires an unbeatable
 * opening that nobody designed.
 *
 * Exact: no division.
 *
 * @returns `FP_ONE` for no sources.
 */
export function additiveIntoMultiplier(bonuses: readonly Fixed[]): Fixed {
  return assertRepresentable(FP_ONE + additive(bonuses), 'additive-into-multiplier stacking');
}

/**
 * Multiplicative on the remainder — the rule for `ward` and `concealment`.
 *
 * Each source removes its fraction of *what is left*, not of the original. Two
 * 50% wards therefore prevent 75%, not 100%: the second ward halves the half
 * that survived the first. Summing instead would make two ordinary defences
 * produce total immunity, which is both a balance hole and an unplayable
 * matchup.
 *
 * Implemented on the surviving remainder rather than on the prevented fraction
 * because the remainder is what the arithmetic is actually about, and because
 * the result composes directly with {@link applyWard}.
 *
 * **Rounding.** `mul` floors, so the surviving remainder is floored and the
 * prevented fraction is rounded *up* by at most one part in 1024 — the
 * defender's favour. Uniformly, for every value and every sign, because the
 * floor is the shared one. The alternative (accumulating the prevented fraction
 * directly) would round in the attacker's favour on some inputs and the
 * defender's on others, which is precisely the sign-dependent asymmetry
 * `contracts.md` §3 bans.
 *
 * @param fractions - Prevented fractions, `fp(512)` meaning "half".
 * @returns The combined prevented fraction; `0` for no sources.
 */
export function multiplicativeOnRemainder(fractions: readonly Fixed[]): Fixed {
  // Sorted before folding, and this is a correctness requirement rather than
  // tidiness.
  //
  // `mul` floors, and floored multiplication does not associate: with three or
  // more factors, `(a·b)·c` and `(c·b)·a` can differ by one unit at scale 1024.
  // Adversarial testing found `[300, 500, 700]` giving 907 and `[700, 500, 300]`
  // giving 908 — and, worse, the same set of ward sources landing on either side
  // of the registry cap depending only on the order they were visited, which
  // flips the clamp counter that exists to make cap pressure visible.
  //
  // The stack is defined over a *multiset* of sources: which mage's ward was
  // read first is not a fact about the game. Leaving the fold order-sensitive
  // makes the result a function of iteration order, and iteration order is a
  // function of the destroy history — so two peers holding identical state
  // could compute different damage. That is a desync, and it is precisely the
  // class of bug the whole determinism apparatus exists to prevent.
  //
  // Sorting makes the answer a deterministic function of the multiset. It does
  // not make the fold exact — the one-unit rounding loss is inherent to
  // flooring at each step — but a rule that is uniformly slightly lossy is a
  // balance question, while a rule that disagrees with itself is a bug.
  // A negative prevented fraction is **refused**, not floored.
  //
  // It is not a weaker ward, it is a sign-inversion: `FP_ONE - (-200)` is
  // `1224`, the remainder grows past `FP_ONE`, and `applyWard(1000, -200)`
  // returns **1195** — twenty percent more damage than no ward at all. The cap
  // cannot catch it, because a cap is a ceiling and this leaves through the
  // floor.
  //
  // Refusing rather than clamping to zero, for the reason the overflow guard
  // below already gave for `FP_MIN`: a magnitude this function cannot interpret
  // is a defect upstream, and silently reading it as "no ward" turns a
  // sign-inverted defence into a defence that merely does nothing — which is
  // the harder of the two to ever notice.
  //
  // Content cannot reach this. `permitsNegativeMagnitude` refuses a negative on
  // every `multiplicative-on-remainder` primitive, which is the primary defence
  // and the one that names the offending node in a diagnostic. This is the
  // second, and it is here rather than in a caller because a raid arbitrating
  // under a *host's* ruleset reads magnitudes this package cannot re-validate.
  //
  // Only the lower end is bounded. A fraction **above** `FP_ONE` — "prevents
  // more than everything" — carries the same flip at three or more sources, and
  // bounding it would change what a shipped `ward` magnitude means today, so it
  // is left as an authored question rather than silently redefined here.
  for (const fraction of fractions) {
    if (fraction < 0) {
      throw new RangeError(
        `multiplicative-on-remainder stacking received a negative prevented fraction ` +
          `(${String(fraction)}). A negative fraction amplifies rather than prevents, and no cap ` +
          'bounds it: contracts.md §3 permits a negative magnitude only under ' +
          'additive-into-multiplier, and the content loader refuses one here.',
      );
    }
  }

  const ordered = [...fractions].sort((a, b) => a - b);

  let remainder: Fixed = FP_ONE;
  for (const fraction of ordered) {
    remainder = mul(remainder, FP_ONE - fraction);
  }
  return assertRepresentable(FP_ONE - remainder, 'multiplicative-on-remainder stacking');
}

/**
 * The largest source wins — the rule for `blink` and `knowledge-steal`.
 *
 * A second escape does not carry you twice as far, and a second theft attempt
 * is a better chance rather than a cumulative certainty. Order-independent and
 * exact.
 *
 * `Math.max` is used directly and is one of the five integer-safe `Math`
 * members the lint allowlist permits.
 *
 * @returns `0` for no sources.
 */
export function maxOf(magnitudes: readonly Fixed[]): Fixed {
  // Seeded from the first magnitude, not from zero.
  //
  // Seeding at zero silently floored an all-negative set: `maxOf([-100, -50])`
  // returned 0 rather than -50, so a max-stacked debuff became no effect at
  // all. Debuffs are a supported concept here — `additive`'s comment is
  // explicit that negative magnitudes sum by the same path as positive ones
  // rather than through a sign-dependent branch — and a rule that quietly
  // discards them is the kind of thing that reads as a balance result.
  //
  // No content authors a negative `max` magnitude today, which is exactly why
  // this was worth fixing before one does: the failure would arrive as a
  // primitive that mysteriously does nothing.
  if (magnitudes.length === 0) {
    return 0;
  }
  let best: Fixed = magnitudes[0] as Fixed;
  for (const magnitude of magnitudes) {
    best = Math.max(best, magnitude);
  }
  return assertRepresentable(best, 'max stacking');
}

/**
 * A boolean gate — the rule for `portal`, whose magnitude carries no meaning.
 *
 * @returns `FP_ONE` if any source is present, `0` otherwise.
 */
export function presence(magnitudes: readonly Fixed[]): Fixed {
  return magnitudes.length > 0 ? FP_ONE : 0;
}

/**
 * Applies one ward factor to an already-summed damage total.
 *
 * `contracts.md` §3 requires that ten small hits equal one large hit: damage is
 * summed per target per tick and **one** ward factor is applied to the sum. Two
 * separate applications of a 50% ward to two fp(5) hits lose a unit each to
 * rounding; one application to their fp(10) sum does not. Shipping this here
 * rather than leaving it to `rules-raid` is what keeps that guarantee from
 * being re-derived — and re-derived slightly differently.
 *
 * **Rounding.** The surviving damage is `mul(damage, 1 - prevented)`, floored
 * toward negative infinity: the defender keeps the fractional unit. One floor,
 * one direction, whatever the sign of either operand.
 *
 * @param damage - The summed damage before wards.
 * @param preventedFraction - The combined, already-capped ward fraction.
 */
export function applyWard(damage: Fixed, preventedFraction: Fixed): Fixed {
  return mul(damage, FP_ONE - preventedFraction);
}
