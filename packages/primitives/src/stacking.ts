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

import { FP_MAX, FP_MIN, FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { PrimitiveStacking } from '@mm/content';

/**
 * `PrimitiveStacking` (`@mm/content`) plus `diminishing`
 * (`docs/design/compositional-content.md` §3.3, `lifespan`'s stacking rule,
 * added after `@mm/content`'s own enum was last touched).
 *
 * `@mm/content`'s union is out of scope for this change — `packages/content/src`
 * belongs to a different task group — but `primitive.schema.json` and
 * `primitive.json` (both in scope here) already accept and author the value,
 * and `load.ts` passes a primitive record through without stripping fields it
 * does not type (confirmed: it is a bare `as` cast over the parsed JSON, not a
 * field-by-field reconstruction). So the value is real at runtime; only the
 * static type lags. This alias is what keeps {@link stackByRule} in `stack.ts`
 * an exhaustive switch — the whole reason that switch has no `default` — until
 * `@mm/content` catches up, at which point this alias collapses to
 * `PrimitiveStacking` and can be deleted.
 */
export type PrimitiveStackingRule = PrimitiveStacking | 'diminishing';

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
 * **A negative source suppresses the gate to `0`.** `docs/design/
 * compositional-content.md` §3.3 gives Perdo's `remove` mode a signed
 * `−magnitude` into whichever rule its primitive already uses; on `presence`,
 * `sound-design.md` §4.1's line for Perdo — *"Perdo's signature is a hole"* —
 * is the mechanical instruction, not just the flavour: unmaking a portal does
 * not need to out-magnitude the sources that raised it, because there is
 * nothing here for two opposed magnitudes to net against. Presence is binary,
 * so once *any* source is a hole, the gate reads as absent regardless of how
 * many other sources are still asserting it.
 *
 * @returns `FP_ONE` if at least one source is present and none is negative;
 * `0` if there are no sources, or if any source is negative.
 */
export function presence(magnitudes: readonly Fixed[]): Fixed {
  if (magnitudes.length === 0) {
    return 0;
  }
  for (const magnitude of magnitudes) {
    if (magnitude < 0) {
      return 0;
    }
  }
  return FP_ONE;
}

/**
 * Diminishing returns — the rule for `lifespan` alone.
 *
 * `docs/design/compositional-content.md` §3.3, per the author's instruction:
 * *"it should be **log**, so that the slow dragons are worth it."* The design
 * this completes: the knowledge tree is deep and schools are mutually
 * exclusive per mage (`compositional-content.md` §3.2), so reaching the
 * deepest nodes means either being born long-lived or bootstrapping —
 * surviving long enough to learn life extension before it can extend anyone.
 * If stacked extensions summed linearly, enough of them would let a
 * short-lived species buy its way to a draconic lifespan node by node.
 * Diminishing returns are what stop that substitution: **a naturally
 * long-lived species has to stay worth having.**
 *
 * `lifespan`'s existing cap (`fraction-of-species-base`, `contracts.md` §3) is
 * not replaced by this and is not redundant with it. The cap bounds the
 * *total* — already proportional to what a mage already is, so an orc caps at
 * +50% of a short life and a dragon at +50% of a long one. This rule shapes
 * the *approach*: how much a second, third, and further extension are each
 * still worth once the first is held. Complementary axes, not alternatives.
 *
 * **Fixed point forbids floats, so this is an integer series, not a real
 * logarithm.** Sources are sorted **descending**, then folded as
 * `Σ magnitude_i / 2^min(i, MAX_DIMINISHING_RANK)` — the largest extension
 * counts in full, the second at half, the third at a quarter, and so on,
 * using {@link floorDiv} rather than a bitwise shift for the same uniform,
 * sign-agnostic floor `@mm/sim-core`'s own division exists to guarantee. The
 * rank is clamped because past `MAX_DIMINISHING_RANK` terms the divisor has
 * already collapsed every remaining source to `0`.
 *
 * **Sorting first is a correctness requirement, not tidiness — the same
 * requirement, for the same reason, as {@link multiplicativeOnRemainder}
 * above.** The weight here depends on *rank*, so `(a at rank 0) + (b at rank
 * 1)` and `(b at rank 0) + (a at rank 1)` disagree whenever `a !== b`, and the
 * stack is defined over a multiset of sources, not the order two peers happen
 * to visit them in. Leaving this unsorted would reproduce exactly the
 * order-dependent-result, order-dependent-clamp bug that comment documents
 * finding in ward stacking — same shape, different rule.
 *
 * **The halving is untuned.** Shifting by one rank per position is the
 * cheapest exact integer decay, chosen because it is representable and
 * invertible, not because anything has measured that halving — rather than,
 * say, a gentler `floor(rank / 2)` shift, or a small per-tier table authored
 * in `primitive.json` — is the right curve. `docs/design/compositional-
 * content.md` §3.3 and `contracts.md` §3 both flag it as a placeholder for the
 * balance harness.
 *
 * @returns `0` for no sources. `N` copies of one magnitude `M` never reach
 * `N × M`: the series is bounded above by `2M` for any `N`, which is the
 * property that makes stacking substitute poorly for being long-lived.
 */
export function diminishing(magnitudes: readonly Fixed[]): Fixed {
  // Past this many ranks the divisor (2^31) already exceeds the fixed-point
  // domain, so every further term has floored to 0 regardless.
  const MAX_DIMINISHING_RANK = 30;

  const ordered = [...magnitudes].sort((a, b) => b - a);

  let total: Fixed = 0;
  for (let rank = 0; rank < ordered.length; rank += 1) {
    const magnitude = ordered[rank] as Fixed;
    const shift = Math.min(rank, MAX_DIMINISHING_RANK);
    total += floorDiv(magnitude, 1 << shift);
  }
  return assertRepresentable(total, 'diminishing stacking');
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
