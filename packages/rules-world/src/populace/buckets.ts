/*
 * Multiverse Mages — decade bucketing, and the age a counted cohort has.
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
import { FP_ONE, WORLD_TICKS_PER_YEAR, floorDiv } from '@mm/sim-core';
import type { Tick } from '@mm/state';

/**
 * ## Why a cohort has an age at all, when its members do not
 *
 * `docs/design/contracts.md` §1.3 is a **performance contract**: populace is
 * counted, never enumerated, because simulating a whole population as
 * individuals is what would make Monte Carlo unaffordable. The consequence
 * nobody states is that a cohort still needs an age — mortality is indexed by
 * one (§1.3's `birthTickBucket` exists for exactly that) — and the only age
 * available is the one the *bucket* implies, shared by every member.
 *
 * So this module is the whole of what "age" means on the populace side. It is
 * small, and it is separate, because every alternative reading of
 * `birthTickBucket` produces a different population curve and the choice needs
 * somewhere to be written down.
 *
 * ## The three decisions
 *
 * 1. **A bucket is a decade of world time, and its stored value is the tick the
 *    decade starts on.** Ten world years is `10 × WORLD_TICKS_PER_YEAR = 120`
 *    ticks, and that constant is what bounds cohort entities at
 *    `6 species × 5 occupations × ceil(maxLifespanMonths / 120)` — 4,500 for the
 *    draconic placeholder of 18,000 months. Storing the start tick rather than a
 *    bucket *index* keeps the field a `Tick`, which is what §1.3's `int32`
 *    column says it is, and makes "older than lifespanMonths" a subtraction
 *    rather than a multiplication nobody remembers to do.
 *
 * 2. **Flooring is toward negative infinity.** A founding scenario may seed
 *    cohorts with birth ticks before tick 0, and truncation toward zero would
 *    put tick −1 and tick +1 in the same decade. `floorDiv` is the repository's
 *    one rounding rule and this is one more place it applies.
 *
 * 3. **A cohort ages from the *midpoint* of its bucket.** Its members were born
 *    across 120 ticks and the bucket names only the first of them, so any single
 *    representative is wrong for almost everyone in it; the midpoint is the
 *    choice whose error is symmetric and bounded at ±60 ticks. Taking the start
 *    instead would make every cohort up to a decade older than its members are,
 *    which is a *uniform absolute* bias and therefore a much larger relative
 *    one for the short-lived species than for the long-lived — the exact shape
 *    of systematic error that reads as a balance finding at 0.5.0.
 *
 *    The midpoint costs one edge case, handled in {@link cohortAgeMonths}:
 *    newborns enter the bucket containing the current tick, so for up to 60
 *    ticks their representative birth is in the *future*. Age clamps at zero.
 *    It also means the retirement threshold and the §1.3 tail allowance are
 *    both stated against an age that runs half a decade behind the bucket
 *    boundary, which is why both are declared with slack rather than tightly.
 */

/**
 * A birth bucket is one decade of world time — `contracts.md` §1.3's "bucketed
 * by decade of birth, not per-person".
 *
 * Derived from {@link WORLD_TICKS_PER_YEAR} rather than written as `120`, so
 * that a change to what a world year means cannot leave this silently meaning
 * something other than a decade.
 */
export const BIRTH_BUCKET_TICKS: number = 10 * WORLD_TICKS_PER_YEAR;

/**
 * How far past its species' nominal lifespan a live birth bucket may still be,
 * in normalized age. **Untuned.**
 *
 * The `economy` spec requires that no live cohort's birth bucket be older than
 * "its species `lifespanMonths` plus the documented tail allowance, which is
 * what makes the cohort entity bound hold". This is that allowance, and it is
 * larger than it first looks for two compounding reasons:
 *
 * - The shared hazard table only reaches "effectively certain" at normalized
 *   age `fp(1536)` — **1.5× the nominal lifespan** — so a cohort is not even
 *   under heavy attrition until then. That is the table's shape, not this
 *   module's choice.
 * - Attrition is *stochastic*, not a cliff. A cohort of `n` at a per-tick
 *   hazard `h` takes on the order of `ln(n) / h` further ticks to reach zero,
 *   which for a large cohort is a further decade or so of world time.
 *
 * `fp(1024)` — a whole extra lifespan, so twice nominal — is therefore slack
 * rather than tight, deliberately. A tight allowance here produces a test that
 * fails on the seed nobody ran, and the thing it is guarding (that buckets
 * retire *at all*, rather than accumulating for the length of the run) is
 * checked just as well by a loose one.
 *
 * The observed maximum is recorded by the long-run test rather than assumed.
 */
export const BIRTH_BUCKET_TAIL_ALLOWANCE: Fixed = FP_ONE;

/**
 * The oldest normalized age a live cohort may have — nominal lifespan plus
 * {@link BIRTH_BUCKET_TAIL_ALLOWANCE}.
 */
export const MAX_LIVE_NORMALIZED_AGE: Fixed = FP_ONE + BIRTH_BUCKET_TAIL_ALLOWANCE;

function assertIntegerTick(tick: number, role: string): void {
  if (!Number.isInteger(tick)) {
    throw new RangeError(
      `${role} must be an integer world tick, received ${String(tick)}. The rules path is ` +
        'float-free (contracts.md §0).',
    );
  }
}

/**
 * The bucket a birth tick falls in, as the tick that decade starts on.
 *
 * Idempotent: bucketing a bucket returns it, which is what lets callers pass
 * either a raw birth tick or a stored `birthTickBucket` without a second
 * spelling of the same rule.
 */
export function birthBucketOf(birthTick: Tick): Tick {
  assertIntegerTick(birthTick, 'birthTick');
  return floorDiv(birthTick, BIRTH_BUCKET_TICKS) * BIRTH_BUCKET_TICKS;
}

/**
 * The representative birth tick of a bucket: its midpoint.
 *
 * See this module's note — the midpoint is the unbiased choice, and `±60` is
 * the whole of the error it admits.
 */
export function bucketMidBirthTick(birthTickBucket: Tick): Tick {
  assertIntegerTick(birthTickBucket, 'birthTickBucket');
  return birthTickBucket + floorDiv(BIRTH_BUCKET_TICKS, 2);
}

/**
 * How old, in months, the members of a bucket are at `worldTick`.
 *
 * Clamped at zero. The clamp is not defensive tidiness: newborns are inserted
 * into the bucket containing the current tick (`economy` spec, "Newborns are
 * idle"), so for the first half-decade of every bucket the midpoint lies ahead
 * of now, and a negative age would index the hazard table below its first
 * entry.
 */
export function cohortAgeMonths(birthTickBucket: Tick, worldTick: Tick): number {
  assertIntegerTick(worldTick, 'worldTick');
  const age = worldTick - bucketMidBirthTick(birthTickBucket);
  return age > 0 ? age : 0;
}

/**
 * Age as a fraction of a species' lifespan, in fixed point: `fp(1024)` is
 * exactly the nominal lifespan.
 *
 * This is the index into the shared, scale-free hazard table, and being
 * scale-free is what lets one table give a human eighty years and a draconic
 * fifteen hundred (`mages-and-species/design.md`). Note that it is *not* where
 * the draconic precision trap lives: normalized age genuinely is `0` for the
 * first seventeen months of an 18,000-month life, and that is correct. The trap
 * is in dividing a hazard *by* `lifespanMonths`, which is
 * `lifespan-rate.ts`'s job.
 *
 * @throws RangeError if `lifespanMonths` is not a positive integer — a refusal
 * rather than a zero, because a species with no lifespan is malformed content
 * and a plausible-looking answer would hide it.
 */
export function normalizedCohortAge(ageMonths: number, lifespanMonths: number): Fixed {
  if (!Number.isInteger(lifespanMonths) || lifespanMonths <= 0) {
    throw new RangeError(
      `normalizedCohortAge needs a positive integer lifespanMonths, received ${String(lifespanMonths)}`,
    );
  }
  assertIntegerTick(ageMonths, 'ageMonths');
  return floorDiv(ageMonths * FP_ONE, lifespanMonths);
}
