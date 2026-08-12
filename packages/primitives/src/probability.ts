/*
 * Multiverse Mages — one probability check, one draw, ablated or not.
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
 * ## Draw-count invariance, and why it needs a function rather than a rule
 *
 * `contracts.md` §6 keys every draw on
 * `(rootSeed, stream, tick, actorKey, drawOrdinal)` and calls the resulting
 * property insertion invariance: adding a combatant, or adding a draw,
 * disturbs nobody else's rolls. Ablation needs the same property along a
 * different axis — **a neutralized primitive must consume exactly the draws its
 * control consumed** — and §6's keying does not give it. The stream is a pure
 * function of its coordinates, but `drawOrdinal` is still a position, so an arm
 * that skips a roll shifts every later draw *within that actor's tick stream*.
 * Ablate `knowledge-steal` and the second theft attempt of the tick inherits
 * the first attempt's number.
 *
 * That is not a subtle degradation. Common random numbers are what make the
 * paired design affordable; once the arms' streams are offset, the pairing is
 * gone and the difference between them is dominated by noise that has nothing
 * to do with the ablated primitive.
 *
 * The failure is one line, and it is a *reasonable* line:
 *
 *     if (probability === 0) return false;   // why draw when it cannot succeed?
 *
 * In ordinary play that is a free optimisation. Under ablation it is the whole
 * bug, because a neutralized primitive's probability is exactly zero.
 *
 * So the roll is a function, callers get no probability to branch on before it,
 * and {@link rollStackedProbability} **draws before it stacks**. There is no
 * ordering in which the mask could be observed first, and there is nowhere to
 * put the `if`.
 *
 * ## Why the draw is `nextBounded(stream, FP_ONE)`
 *
 * `2^32 mod 1024` is zero, so `nextBounded` never rejects at this bound and the
 * cost is exactly one `nextUint32` per roll for every probability — rejection
 * sampling would make the draw count a function of the drawn values, which is
 * still invariant between arms but no longer constant, and a constant is
 * cheaper to assert. The result is compared as `draw < probability` at scale
 * 1/1024: `fp(0)` never fires, `fp(1024)` always does, and a probability above
 * `FP_ONE` (which the registry permits for the uncapped `knowledge-steal`) is
 * certainty rather than an error.
 */

import { FP_ONE, nextBounded } from '@mm/sim-core';
import type { Fixed, RngStream } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';

import { stackMagnitudes } from './stack.js';
import type { StackOptions } from './stack.js';

/** One probability check: what was rolled, against what, and what happened. */
export interface ProbabilityRoll {
  /** The stacked, capped, possibly-neutralized probability, at scale 1/1024. */
  readonly probability: Fixed;
  /** The draw that was spent, in `[0, FP_ONE)`. Reported so a harness can trace it. */
  readonly draw: Fixed;
  /** `draw < probability`. */
  readonly succeeded: boolean;
  /** Whether the primitive's cap bound the probability. */
  readonly clamped: boolean;
}

/**
 * The registry unit prefix that marks a primitive as a probability.
 *
 * `contracts.md` §3 gives exactly two primitives an fp-probability unit —
 * `concealment` and `knowledge-steal` — and the units are checked against that
 * table by `packages/content/test/unit/primitive-contract.test.ts`, so this
 * prefix is a contract and not a guess about naming.
 */
const PROBABILITY_UNIT_PREFIX = 'fp-probability';

/**
 * Stacks a primitive's sources into a probability and rolls against it,
 * spending exactly one draw whether or not the primitive is neutralized.
 *
 * The draw comes first. Not for efficiency — for the guarantee: whatever the
 * mask does to the probability, it happens after the generator has already
 * advanced, so a control run and its paired ablation run leave the stream in
 * the same position and every later draw on it is identical.
 *
 * The probability itself comes from {@link stackMagnitudes} rather than from
 * any arithmetic here, so the declared stacking rule, the cap, the clamp
 * counter and the ablation mask all behave exactly as they do everywhere else.
 *
 * @param primitive - The registry record. Its unit must name a probability.
 * @param magnitudes - One entry per applying source.
 * @param stream - The subsystem stream from `contracts.md` §6 this attempt
 * belongs to, already positioned. It is advanced by exactly one draw.
 * @param options - Passed through to {@link stackMagnitudes}, including the
 * `ablation` mask.
 * @throws RangeError if the primitive's unit is not an fp probability.
 */
export function rollStackedProbability(
  primitive: PrimitiveRecord,
  magnitudes: readonly Fixed[],
  stream: RngStream,
  options: StackOptions = {},
): ProbabilityRoll {
  if (!primitive.unit.startsWith(PROBABILITY_UNIT_PREFIX)) {
    throw new RangeError(
      `"${primitive.id}" is measured in ${primitive.unit}, not a probability, so rolling ` +
        'against it would produce a plausible boolean from a category error. ' +
        'contracts.md §3 gives an fp-probability unit to concealment and knowledge-steal only.',
    );
  }

  // Before the stack, before the mask, before anything can decide the roll is
  // pointless. See this module's note: the `if` that belongs here is the bug.
  const draw = nextBounded(stream, FP_ONE);

  const stacked = stackMagnitudes(primitive, magnitudes, options);
  return {
    probability: stacked.value,
    draw,
    succeeded: draw < stacked.value,
    clamped: stacked.clamped,
  };
}
