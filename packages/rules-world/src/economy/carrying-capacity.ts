/*
 * Multiverse Mages — carrying capacity, and the logistic brake that keeps
 * population under it without a ceiling.
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

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { FP_ONE, RNG_STREAM, floorDiv, mul, nextBounded } from '@mm/sim-core';
import type { PrimitiveRecord, TerritoryRecord } from '@mm/content';
import type { ClampCounters, EffectControl } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { StepRng } from '../mages/rng.js';
import { primitiveFloor } from './primitive-floor.js';

/**
 * ## `K` is derived from land, because land is the one thing a run cannot make
 *
 * Carrying capacity used to be `CAPACITY_PER_MATERIAL × materials`, plus a flat
 * addend per completed university seat. Both terms are quantities the universe
 * *produces*, and that is a loop rather than a bound: people make materials,
 * materials raise `K`, `K` permits more people. Net materials per person per
 * tick is `laborShare × MATERIALS_PER_LABORER − SUBSISTENCE_PER_PERSON` in raw
 * `fp`, so for any laborer share above one eighth the stock grows without limit
 * and `K` grows with it. Composing the shipped functions —
 * {@link materialsProduced} → {@link consumeMaterials} → `carryingCapacity` →
 * {@link fertilityBrake} → {@link expectedBirths} — over 2,400 ticks reached
 * `K` = 289,997 at a laborer share of one half, still accelerating at the end.
 *
 * The failure was worse than a large number, because `P < K` held the whole way.
 * The `economy` spec's *"total population never exceeds `K`"* therefore passed
 * **vacuously**: a bound that runs away ahead of the thing it bounds is never
 * violated and never checked. The requirement had no documented number in it,
 * so there was nothing a test could have compared against.
 *
 * So `K` is a function of **territory** (`contracts.md` §2.7), the one economic
 * quantity nothing in a run creates:
 *
 * ```
 * base         = Σ landUnits × capacityPerLandUnit        (content, fixed)
 * provisioning = fp(1024) + materialsBonus + seatsBonus   (each separately capped)
 * K            = base × provisioning / fp(1024), less the subsistence penalty
 * ```
 *
 * ## Materials still matter, and still cannot run away with it
 *
 * A well-supplied territory holds more people than a bare one — that reading is
 * worth keeping, and dropping materials entirely would have thrown it away to
 * fix the loop. What changes is *where* materials enter: as a bounded multiplier
 * on a fixed base rather than as an unbounded addend. Two properties follow, and
 * both are the point:
 *
 * - **`K` has a stated ceiling**, {@link maxCarryingCapacity} — `base ×
 *   MAX_PROVISIONING / fp(1024)`, which is a function of content and of nothing
 *   that happens during a run. That is the number task 9.4 asserts against.
 * - **The bound is structural, not a clamp.** `Math.min` on a runaway leaves the
 *   runaway there, pressed against the ceiling, and every derived rate reads as
 *   saturated forever. Here the two modulating terms saturate on their own
 *   ramps, and `K` stops moving because its inputs stopped mattering, not
 *   because a comparison caught it.
 *
 * Each modulator is measured **per land unit**, not in total and not per person.
 * Per land unit is what makes it a *density*: the same stock spread over more
 * country is thinner, which is the sentence the arithmetic should mean. Per
 * person was considered and rejected — it makes `K` fall as population rises,
 * so `K` can drop below a population that has already been born, and the spec's
 * "never exceeds `K`" would then be violated by a `K` that moved rather than by
 * a population that grew. Per land unit keeps `K` independent of population, so
 * the brake remains the only thing standing between the two.
 *
 * The shape — `(1 + Σ)` with a cap per term and a cap on the sum — is the same
 * one `@mm/primitives` uses for every other multiplier in the project. It is not
 * imported from there because these are not primitive bonuses and routing them
 * through `stackMagnitudes` would put territory under an effect primitive's cap.
 *
 * ## A brake, not a ceiling
 *
 * `mages-and-species/design.md` rejects the hard cap by name: *"a hard ceiling
 * makes population a sawtooth against the cap, and every downstream rate
 * inherits the sawtooth. A logistic brake is the same bound with a continuous
 * approach, which is what the 0.4.0 'no unbounded growth' claim needs to be
 * checkable against a stated number."*
 *
 * So births scale by `clamp((K − population) × fp(1024) / K, 0, fp(1024))` and
 * nothing anywhere rejects a birth for being one too many. Population
 * approaches `K` and does not exceed it because the brake reaches zero there,
 * which is a different mechanism from refusing at the door and produces a
 * different shape in every metric derived from population.
 *
 * ## Extinction is an absorbing state and is not prevented
 *
 * A species whose cohorts are all at zero produces no births, forever. That is
 * a legitimate world outcome; the 0.4.0 claim is scenario-specific — *the
 * reference seeded scenario* loses no species over 200 world years — rather
 * than a universal impossibility, and nothing here synthesizes a founding
 * population to keep the claim true.
 *
 * ## One draw per cohort, on stream 6
 *
 * The same arithmetic as promotion and cohort mortality, for the same reason:
 * `contracts.md` §1.3 forbids per-person randomness, and a Bernoulli trial per
 * prospective parent is exactly that, arriving through a mechanism nobody
 * thinks of as "simulating individuals". Integer part plus one fractional draw
 * carries the expectation at O(cohorts) — but only down to the resolution the
 * expectation is computed at, which is the next section.
 *
 * ## Births are computed at extended scale, and this is not optional
 *
 * A birth rate per member per month is a small number divided by a long span:
 * a member has a handful of children across hundreds of months, so the per-tick
 * figure is inherently below one `fp` unit. Computing it at `fp` scale floors it
 * to **zero** — deterministically, for every seed — and the remainder draw that
 * was supposed to carry the fraction never sees a fraction, because the floor
 * happened upstream of it. That is the same defect `lifespan-rate.ts` exists to
 * make impossible on the mortality side, arriving from the other direction:
 * there the divisor is long, here the dividend is small, and the fix is the same
 * one. `design.md` rejected plain truncation by name for promotion — *"it
 * truncates to zero every time [...] and the bias is silent"* — and flooring
 * before the draw is that truncation wearing a draw as a hat.
 *
 * Worse, the floor is per cohort, so it made the same headcount fertile or
 * sterile according to how finely it happened to be bucketed. A populace is
 * legitimately spread over `5 occupations × ceil(lifespanMonths / 120)` cohorts,
 * so the penalty fell hardest on the longest-lived species — biasing exactly the
 * differentiation 0.4.0 claims to ship.
 *
 * So {@link expectedBirths} returns units of `1 / BIRTH_RATE_ONE` and
 * {@link cohortBirths} takes its draw over that same range. Nothing narrows back
 * to `fp` before the draw — `lifespan-rate.ts` says why, and this module is the
 * second call site its header predicted.
 *
 * Three floors remain, one per multiplier, each at most one extended unit. That
 * is a residue of at most three parts in {@link BIRTH_RATE_ONE} per cohort per
 * tick rather than the exact zero it was: not exact, and no longer the
 * difference between a species that reproduces and one that does not.
 *
 * **Everything here is untuned** (`docs/design/release-plan.md`).
 */

/**
 * The most the materials stock can add to the provisioning multiplier, `fp`.
 *
 * `fp(512)` — a fully-stocked territory holds half again as many people as a
 * bare one, and not one more however much is piled up beyond saturation.
 * **Untuned.**
 */
export const MATERIALS_PROVISION_CAP: Fixed = 512;

/**
 * The materials stock **per land unit** at which {@link MATERIALS_PROVISION_CAP}
 * is reached, `fp`. **Untuned.**
 *
 * `fp(4096)` — four materials per land unit. Read against the shipped territory
 * (6,000 land units, 54,900 base capacity) and `SUBSISTENCE_PER_PERSON`, that is
 * 24,000 materials, or roughly 450 ticks of subsistence for the base populace:
 * a generation's food in the barns. Stated in those terms rather than left as a
 * bare number, because a saturation point nobody can read against anything is a
 * saturation point nobody can argue with.
 *
 * The ramp to it is linear, for the reason the subsistence penalty below is
 * linear: a curve that "feels like development" is one nobody could tune against
 * a measurement.
 */
export const MATERIALS_PROVISION_SATURATION: Fixed = 4096;

/** The most completed university seats can add to the multiplier, `fp`. **Untuned.** */
export const SEATS_PROVISION_CAP: Fixed = 512;

/**
 * Completed seats **per land unit** at which {@link SEATS_PROVISION_CAP} is
 * reached, `fp`. **Untuned.**
 *
 * `fp(128)` — one seat per eight land units, so 750 seats over the shipped
 * territory's 6,000. Institutions raise what a country can hold, and a country
 * with a seat for every seventy-odd people is as institutional as this term is
 * willing to credit.
 */
export const SEATS_PROVISION_SATURATION: Fixed = 128;

/**
 * The largest provisioning multiplier `K` can be built with, `fp`.
 *
 * `fp(1024) + fp(512) + fp(512) = fp(2048)`: a fully-provisioned territory holds
 * twice what bare land holds. This is the constant the population bound is
 * stated in terms of — see {@link maxCarryingCapacity}.
 */
export const MAX_PROVISIONING: Fixed = FP_ONE + MATERIALS_PROVISION_CAP + SEATS_PROVISION_CAP;

/**
 * How far sustained subsistence shortfall can drive `K` down, in `fp`.
 *
 * `fp(512)` — a universe that cannot feed itself halves what it can hold, and
 * no further. Bounded rather than unbounded because an unbounded penalty turns
 * one bad tick into extinction, and the `economy` spec asks for a consequence
 * that is *recorded* rather than for a cliff.
 */
export const MAX_SUBSISTENCE_PENALTY: Fixed = 512;

/**
 * A universe's territory, reduced to the two numbers `K` reads.
 *
 * Built by {@link territoryExtent} from content and then carried, rather than
 * recomputed per tick from the records: the sum is fixed for the length of a run
 * by construction, and summing it inside the births phase would invite somebody
 * to make it depend on something that is not.
 */
export interface TerritoryExtent {
  /** Land units summed across every region. A count, not `fp`. */
  readonly landUnits: number;
  /** People the bare land carries, a headcount: `Σ landUnits × capacityPerLandUnit`. */
  readonly baseCapacity: number;
}

/** A universe with no land at all, which carries nobody. */
export const NO_TERRITORY: TerritoryExtent = { landUnits: 0, baseCapacity: 0 };

/**
 * Sums content territory records into the extent `K` is derived from.
 *
 * An empty list yields {@link NO_TERRITORY} rather than throwing. A universe
 * with no land carries nobody, the brake stops every birth, and that is a
 * coherent — if short — world; the shipped schema requires at least one region,
 * so reaching this case at all means somebody built a content set on purpose.
 */
export function territoryExtent(regions: readonly TerritoryRecord[]): TerritoryExtent {
  let landUnits = 0;
  let baseCapacity = 0;
  for (const region of regions) {
    if (!Number.isInteger(region.landUnits) || region.landUnits < 0) {
      throw new RangeError(
        `territory "${region.id}" declares ${String(region.landUnits)} land units; land is a ` +
          'non-negative count, and a negative one would subtract capacity from the regions beside it',
      );
    }
    landUnits += region.landUnits;
    baseCapacity += floorDiv(region.landUnits * Math.max(0, region.capacityPerLandUnit), FP_ONE);
  }
  return { landUnits, baseCapacity };
}

/**
 * The ceiling `K` cannot pass for a given territory — the **documented bound**.
 *
 * `mages-and-species` task 9.4 asks the reference run to keep total population
 * "within its documented bound". This is that bound, and it is assertable
 * because it names only content: no materials stock, no seat count, and nothing
 * about how long the run went on. For the shipped territory it is 109,800.
 */
export function maxCarryingCapacity(territory: TerritoryExtent): number {
  return floorDiv(Math.max(0, territory.baseCapacity) * MAX_PROVISIONING, FP_ONE);
}

/** What carrying capacity is derived from. */
export interface CapacityInput {
  /** The fixed resource: what the land itself holds. */
  readonly territory: TerritoryExtent;
  /**
   * The universe's **food** stock, `fp`. Modulates, never drives.
   *
   * Food and not the sum of the three kinds, and the constant next door already
   * argued for it before there were kinds to choose between:
   * {@link MATERIALS_PROVISION_SATURATION} reads its own saturation point as
   * *"a generation's food in the barns"*. A country holds more people because
   * there is more to eat, not because there is more gravel — piling up quarried
   * stone should raise what a universe can *build*, which it now does through
   * construction, rather than what it can feed.
   */
  readonly food: Fixed;
  /** Seats across **completed** universities. Unfinished ones carry nobody. */
  readonly completedCapacity: number;
  /**
   * How badly subsistence went unmet, `fp` in `[0, fp(1024)]` — the share of
   * this tick's subsistence demand that could not be paid.
   */
  readonly subsistenceShortfallShare?: Fixed | undefined;
}

/**
 * One modulating term's contribution to the provisioning multiplier, `fp`.
 *
 * `have` and `saturation` are in whatever unit the caller chose, so long as both
 * are in the same one; the ramp is linear from zero to `cap` and flat after.
 *
 * The early return past saturation is not an optimisation. It is what keeps the
 * multiplication off a stock that has been accumulating for a hundred thousand
 * ticks — the product would still be a safe integer for any run this project
 * will do, and "still" is not an argument anybody should have to check again.
 */
function provisionBonus(have: number, saturation: number, cap: Fixed): Fixed {
  if (saturation <= 0) return have > 0 ? cap : 0;
  if (have <= 0) return 0;
  if (have >= saturation) return cap;
  return floorDiv(have * cap, saturation);
}

/**
 * The population a universe can carry.
 *
 * @returns A headcount, not a fixed-point value: `K` is compared against a
 * population, and carrying half a person is not a thing. Never more than
 * {@link maxCarryingCapacity} of the territory it was given.
 */
export function carryingCapacity(input: CapacityInput): number {
  const { landUnits, baseCapacity } = input.territory;
  if (baseCapacity <= 0) return 0;

  // Both terms are densities over the fixed resource: materials per land unit at
  // `fp` scale (the stock is already `fp`, land units are a count), and seats per
  // land unit compared at `fp` scale for the same reason.
  const materialsBonus = provisionBonus(
    Math.max(0, input.food),
    landUnits * MATERIALS_PROVISION_SATURATION,
    MATERIALS_PROVISION_CAP,
  );
  const seatsBonus = provisionBonus(
    Math.max(0, input.completedCapacity) * FP_ONE,
    landUnits * SEATS_PROVISION_SATURATION,
    SEATS_PROVISION_CAP,
  );

  const provisioning = FP_ONE + materialsBonus + seatsBonus;
  const base = floorDiv(baseCapacity * provisioning, FP_ONE);

  const share = Math.min(FP_ONE, Math.max(0, input.subsistenceShortfallShare ?? 0));
  if (share === 0) return base;

  // A shortfall of the whole demand costs MAX_SUBSISTENCE_PENALTY of K; half a
  // demand costs half of that. Linear, and stated here because the alternative
  // -- an exponent that "feels like famine" -- is a curve nobody could tune
  // against a measurement.
  const penalty = mul(share, MAX_SUBSISTENCE_PENALTY);
  return floorDiv(base * (FP_ONE - penalty), FP_ONE);
}

/**
 * The logistic brake on births, `fp` in `[0, fp(1024)]`.
 *
 * `fp(1024)` at an empty world, zero at and beyond `K`. A `K` of zero brakes
 * everything to a stop rather than dividing by it — a universe that can carry
 * nobody has no births, which is the right answer and not an error.
 */
export function fertilityBrake(population: number, capacity: number): Fixed {
  if (capacity <= 0) return 0;
  const headroom = capacity - Math.max(0, population);
  if (headroom <= 0) return 0;
  return Math.min(FP_ONE, floorDiv(headroom * FP_ONE, capacity));
}

/** What one cohort's births are computed from. */
export interface BirthInput {
  /** The cohort's member count. */
  readonly count: number;
  /** The species `fertility` trait, `fp`. */
  readonly fertility: Fixed;
  /** The `fertility` primitive record, for its stacking rule and its own cap. */
  readonly fertilityPrimitive: PrimitiveRecord;
  /** `fertility` bonuses from nodes and effects, `fp`. */
  readonly fertilityBonuses: readonly Fixed[];
  /** The logistic brake, from {@link fertilityBrake}. */
  readonly brake: Fixed;
  readonly counters?: ClampCounters | undefined;
  /** Rego's combined clamp for `fertility`. See `ProductionInput.clamp` in `materials.ts`. */
  readonly clamp?: EffectControl | undefined;
}

/**
 * Extra bits of precision the birth expectation is carried at, beyond `fp`.
 *
 * Chosen the way `lifespan-rate.ts` chose its ten: by naming the worst case in
 * shipped content and checking it is clear of zero. Here the worst case is one
 * member of the least fertile species (`fertility` 96) with a neutral primitive
 * multiplier and the smallest non-zero {@link fertilityBrake} — a universe
 * sitting right under `K`. That is `(4 / 1024) × (96 / 1024) × (1 / 1024)`
 * births per tick, which at `fp` scale is zero, at twelve bits is one unit, and
 * at sixteen is **24**.
 *
 * Twelve bits is the least that clears zero at all, and a knife-edge one content
 * change pushes back over. Sixteen leaves the worst case an order of magnitude
 * clear and still keeps every cohort up to roughly twenty-two million members
 * inside exact integer arithmetic at the highest shipped `fertility` — see
 * {@link scaleAtExtendedScale}, which refuses rather than rounds beyond that.
 *
 * It is deliberately *not* `LIFESPAN_RATE_SHIFT`. The two constants answer the
 * same question about different worst cases: ten bits is what a draconic hazard
 * needs, and ten bits is not what a barren cohort under a full brake needs. One
 * shared number would have to be the larger of the two, and widening the hazard
 * path is a change to mortality nobody asked for.
 */
export const BIRTH_RATE_SHIFT = 16;

/**
 * The value that means "one birth" at extended scale — the range the fractional
 * draw is taken over.
 *
 * `fp(1024) << 16 = 2^26`. A power of two that divides `2^32` exactly, so
 * `nextBounded` never rejects and one draw is still one word.
 */
export const BIRTH_RATE_ONE: number = FP_ONE << BIRTH_RATE_SHIFT;

/**
 * Births per member per world tick at neutral fertility, in units of
 * `1 / BIRTH_RATE_ONE`. **Untuned.**
 *
 * Four `fp` units, written at extended scale — the same magnitude it has always
 * been (`4 / 1024` of a child per member per month, so a member of a 600-month
 * species has a little over two children in a lifetime), carried at a resolution
 * fine enough that the three multipliers below cannot floor it away. Its scale
 * is the return scale of {@link expectedBirths}; the two move together on
 * purpose, because a test that reads one against the other should not have to
 * know a conversion.
 */
export const BIRTHS_PER_MEMBER: number = 4 << BIRTH_RATE_SHIFT;

/**
 * Expected births for one cohort this tick, in units of `1 / BIRTH_RATE_ONE` —
 * the value before the fractional draw.
 *
 * Separated from {@link cohortBirths} so a test can assert the *expectation*
 * without a stream, which is the only way to check that the brake is monotonic
 * without averaging over draws.
 *
 * The multiplications use {@link floorDiv} on the raw product rather than
 * {@link mul}, because `mul` asserts both operands into the 32-bit `Fixed`
 * domain and the running value here is deliberately outside it. The count enters
 * *first*, before any of the three fp-scale factors, so that every floor lands
 * on a value already multiplied up by the cohort — which is what keeps the
 * relative loss at one part in the cohort's own expectation rather than one part
 * in a per-member rate that is smaller than the quantum.
 *
 * @throws RangeError if the widened product would leave exact integer
 * arithmetic. A refusal rather than a saturation, for the same reason
 * `perLifespanRate` refuses: a cohort this function cannot count births for is
 * not a cohort it should hand back a plausible-looking number for.
 */
export function expectedBirths(input: BirthInput): number {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new RangeError(`a cohort count must be a non-negative integer, received ${String(input.count)}`);
  }
  const floor = primitiveFloor(input.fertilityPrimitive);
  const multiplier = stackMagnitudes(input.fertilityPrimitive, input.fertilityBonuses, {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
    ...(input.clamp === undefined ? {} : { clamp: input.clamp }),
    ...(floor === undefined ? {} : { floor }),
  }).value;

  const base = input.count * BIRTHS_PER_MEMBER;
  const withSpecies = scaleAtExtendedScale(base, input.fertility);
  const withPrimitives = scaleAtExtendedScale(withSpecies, multiplier);
  return scaleAtExtendedScale(withPrimitives, Math.min(FP_ONE, Math.max(0, input.brake)));
}

/**
 * One extended-scale value multiplied by one `fp`-scale factor, floored.
 *
 * The one place the widened arithmetic is written, so that the overflow refusal
 * is one refusal rather than three chances to forget it.
 */
function scaleAtExtendedScale(value: number, factor: Fixed): number {
  const product = value * factor;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(
      `expectedBirths overflowed extended scale at ${String(value)} × ${String(factor)}. A cohort ` +
        'large enough to do this is a populace defect upstream, not a number to round off here.',
    );
  }
  return floorDiv(product, FP_ONE);
}

/**
 * Births for one cohort this tick, as a headcount.
 *
 * Integer part plus **exactly one** draw on stream 6, keyed on the cohort's own
 * handle. The draw is taken whether or not the remainder is zero, so the draw
 * count is a function of the cohort count and nothing else — a conditional draw
 * would make one cohort's sequence depend on another cohort's arithmetic, which
 * is the attribution loss `contracts.md` §6 is about.
 *
 * The draw is over {@link BIRTH_RATE_ONE}, the scale the expectation was
 * computed at, and not over `FP_ONE`: narrowing first would put the floor back
 * exactly where this module removed it.
 */
export function cohortBirths(rng: StepRng, cohort: EntityHandle, input: BirthInput): number {
  const expected = expectedBirths(input);
  const whole = floorDiv(expected, BIRTH_RATE_ONE);
  const remainder = expected - whole * BIRTH_RATE_ONE;
  const draw = nextBounded(rng.actorStream(RNG_STREAM.populace, cohort), BIRTH_RATE_ONE);
  return whole + (draw < remainder ? 1 : 0);
}
