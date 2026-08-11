/*
 * Multiverse Mages — the species trait registry and its one application site.
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
import { FP_ONE, div, mul } from '@mm/sim-core';

import type { SpeciesRecord } from '@mm/content';

/**
 * ## Why a registry rather than eight field reads
 *
 * `docs/design/contracts.md` §2.4 gives a species eight `fp` traits, and the
 * `species-traits` spec requires that **every one of them is higher-is-better**.
 * That rule is easy to state and impossible to keep by convention, because one
 * of the eight — `rediscoveryAffinity` — scales a *cost* rather than a benefit,
 * so honouring the rule means dividing by it where the other seven multiply.
 * Written out at each call site, "higher is better" survives exactly until
 * somebody writes the obvious `mul(cost, affinity)` and produces a species that
 * is punished for being good at rediscovery. Nothing about that reads as wrong
 * at the call site; it only reads as wrong against the rule.
 *
 * So the direction is *data* here, the arithmetic that honours it lives in one
 * function ({@link applySpeciesTrait}), and a conformance test walks the
 * registry and proves mechanically that raising any trait never lowers that
 * species' advantage. A trait added later without a descriptor fails the
 * registry-completeness test rather than silently defaulting to "multiply".
 *
 * **No magnitude lives here.** Every number a species carries is content
 * (`packages/content/data/species.json`), untuned until the balance harness in
 * 0.5.0. This module knows the *shape* of a trait and nothing about its value —
 * which is also what the species-literal conformance check enforces over this
 * whole package.
 */

/** The `fp` traits of `contracts.md` §2.4, in the order the contract lists them. */
export const SPECIES_FP_TRAITS = [
  'curiosity',
  'learnRate',
  'retention',
  'fertility',
  'scribeAffinity',
  'rediscoveryAffinity',
  'mageAptitude',
  'laborAffinity',
] as const;

export type SpeciesFpTrait = (typeof SPECIES_FP_TRAITS)[number];

/**
 * How a trait enters an arithmetic expression.
 *
 * `multiplier` scales the quantity up; `divisor` scales it down. The two exist
 * because the quantity being scaled is sometimes a benefit and sometimes a
 * cost, and "higher is better" means the opposite arithmetic in each case.
 */
export type TraitApplication = 'multiplier' | 'divisor';

/**
 * Whether the quantity the trait scales is something a species wants more of.
 *
 * Derivable from {@link TraitApplication} today, and stated separately anyway:
 * the two would come apart the moment a benefit is ever expressed as a divisor,
 * and the conformance test needs to compare *advantage* against trait value
 * without re-deriving which way round that is from the arithmetic it is
 * checking. A check that infers its expectation from the thing under test is a
 * check that cannot fail.
 */
export type TraitOutputKind = 'benefit' | 'cost';

export interface SpeciesTraitDescriptor {
  readonly trait: SpeciesFpTrait;
  /**
   * Pinned to the single permitted value. It is a field rather than an implicit
   * property of the registry so that the CI check reads a declaration instead of
   * assuming one, per the `species-traits` spec's "direction is asserted, not
   * assumed".
   */
  readonly direction: 'higher-is-better';
  readonly application: TraitApplication;
  readonly outputKind: TraitOutputKind;
  /** What the trait scales, for diagnostics and for the reader. */
  readonly scales: string;
}

/**
 * Every `fp` species trait, with the direction it is applied in.
 *
 * `rediscoveryAffinity` is the one divisor, and `contracts.md` §2.4 now says so
 * in the schema comment. The reading was genuinely open — the contract once
 * called it a "multiplier against `rediscoveryMultiplier`", which does not say
 * whether a high value makes rediscovery cheaper or dearer — and
 * `mages-and-species`' design note resolves it as higher-is-better so that the
 * six species are read the same way on all eight axes. Under any other reading
 * a content author has to remember which column is inverted, and vision §5's
 * "gnomes are unusually good at rediscovery" would be encoded as a *low* number.
 */
export const SPECIES_TRAIT_REGISTRY: Readonly<Record<SpeciesFpTrait, SpeciesTraitDescriptor>> = {
  curiosity: {
    trait: 'curiosity',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'the appeal of initiating self-directed research, and the personality mean at birth',
  },
  learnRate: {
    trait: 'learnRate',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'teaching and research throughput',
  },
  retention: {
    trait: 'retention',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'resistance to mastery decay',
  },
  fertility: {
    trait: 'fertility',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'cohort birth rate',
  },
  scribeAffinity: {
    trait: 'scribeAffinity',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'grimoire durability and scribing throughput',
  },
  rediscoveryAffinity: {
    trait: 'rediscoveryAffinity',
    direction: 'higher-is-better',
    application: 'divisor',
    outputKind: 'cost',
    scales: "a node's rediscovery multiplier, which is a cost — so the trait divides it",
  },
  mageAptitude: {
    trait: 'mageAptitude',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'the share of matured students promoted to mage',
  },
  laborAffinity: {
    trait: 'laborAffinity',
    direction: 'higher-is-better',
    application: 'multiplier',
    outputKind: 'benefit',
    scales: 'non-magical labour productivity per cohort member',
  },
};

/**
 * The one place a species trait meets a quantity.
 *
 * @param descriptor - The registry entry for the trait being applied.
 * @param base - The unmodified quantity, in fixed point.
 * @param traitValue - The species' value for that trait, in fixed point.
 * @returns `base` scaled by the trait in the declared direction.
 *
 * @throws RangeError on a non-positive trait value. The schema already floors
 * `fp` traits at 1, so this is unreachable from valid content — it is here
 * because a divisor of zero would otherwise be the one input that turns a
 * uniform rule into a crash inside `div`, and a species-shaped crash should say
 * "species trait" rather than "div by zero".
 */
export function applySpeciesTrait(
  descriptor: SpeciesTraitDescriptor,
  base: Fixed,
  traitValue: Fixed,
): Fixed {
  if (!Number.isInteger(traitValue) || traitValue <= 0) {
    throw new RangeError(
      `species trait ${descriptor.trait} must be a positive fixed-point integer, received ` +
        `${String(traitValue)}. Content validation should have rejected this before it reached the rules path.`,
    );
  }
  return descriptor.application === 'divisor' ? div(base, traitValue) : mul(base, traitValue);
}

/** Reads a species' value for one registered trait. */
export function traitValueOf(species: SpeciesRecord, trait: SpeciesFpTrait): Fixed {
  return species[trait];
}

/**
 * How advantageous an outcome is, in a sense that is comparable across traits.
 *
 * For a benefit, more output is better; for a cost, less is. Negating the cost
 * is what lets one property test assert a single monotonicity statement — "a
 * higher trait value never lowers advantage" — over all eight traits at once,
 * including the inverted one. Without it the test would need a per-trait
 * expectation, which is the hand-maintained table the registry exists to avoid.
 */
export function advantageOf(descriptor: SpeciesTraitDescriptor, output: Fixed): number {
  return descriptor.outputKind === 'cost' ? -output : output;
}

/**
 * A neutral trait value: applying it changes nothing, in either direction.
 *
 * `fp(1024)` is the identity for both `mul` and `div`, which is not a
 * coincidence — it is why the contract's "each defaults to `fp(1024)`" is a
 * sane default for a divisor trait as well as a multiplier one.
 */
export const TRAIT_NEUTRAL: Fixed = FP_ONE;
