/*
 * Multiverse Mages — the `cost` tradition hook: what casting takes out of the caster.
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

import type { ResolvedHook } from './hook-for.js';
import { assertHookPoint, unimplementedKind } from './hook-for.js';

/**
 * Hook four of four (`vision.md` §4a): **what casting takes out of the caster.**
 *
 * ## What it deducts from
 *
 * `design.md` recorded this as an open question, because at the time
 * `contracts.md` §1.2 gave a mage no fatigue, vigor, or reserve field and §1.6
 * gave a combatant only `hp` and `concealment` — so the hook had nothing
 * declared to spend and was, in its own words, decorative. That question is now
 * closed in the contract rather than here: §1.2 gives a mage `vigor`/`maxVigor`
 * and names them *"the resource a tradition's `cost` hook deducts from"*, and
 * §1.6 carries the same pair onto a combatant, *"the host tradition's `cost`
 * hook deducts from it"*.
 *
 * So this returns a magnitude in the `vigor` scale, and the deduction itself is
 * the engagement layer's. Returning the magnitude rather than mutating a
 * combatant keeps the hook testable with no engagement running and keeps
 * `rules-magic` out of `raid-engagement`'s state, which `contracts.md` §5
 * requires anyway.
 *
 * Engagement-time, therefore host-tradition across a portal: `vision.md` §4a's
 * "carries her own preparations but pays the host's price" is exactly a
 * statement about this hook resolving to the host.
 */
export interface CostPolicy {
  readonly kind: string;
  /**
   * Whether the price was already paid before the moment of release.
   *
   * Not the same as "the price is zero". A `prepaid` tradition charges at
   * preparation time; the release is free because the money is gone, and a
   * reader of a combat log needs to be able to tell that from a spell that
   * happens to be cheap.
   */
  readonly paidAtPreparation: boolean;
}

/** Resolves a `cost` hook into the policy the engagement layer consults. */
export function costPolicy(hook: ResolvedHook): CostPolicy {
  assertHookPoint(hook, 'cost');

  switch (hook.kind) {
    case 'standard':
      return { kind: 'standard', paidAtPreparation: false };
    case 'prepaid':
      return { kind: 'prepaid', paidAtPreparation: true };
    default:
      throw unimplementedKind(hook);
  }
}

/**
 * What releasing a node costs its caster, in the `vigor` scale.
 *
 * `baseCost` is the caller's — derived from the node, the caster, and whatever
 * `mages-and-species` decides makes a spell tiring. This function's entire
 * authority is whether the tradition charges it.
 *
 * @returns `fp` vigor. `standard` returns the caller's figure unchanged;
 * `prepaid` returns zero, because the price was paid at memorisation.
 */
export function castCost(policy: CostPolicy, baseCost: Fixed): Fixed {
  return policy.paidAtPreparation ? 0 : baseCost;
}

/**
 * What *preparing* a node costs, for the traditions that charge in advance.
 *
 * The mirror of {@link castCost}, and the reason `prepaid` is not simply a
 * discount: under Vancian memorisation the vigor leaves the caster when she
 * memorises, so a mage who prepares four spells and casts none has still spent
 * the day. Under `standard` preparation does not exist and this is zero.
 *
 * Untuned, like every magnitude in this change — whether charging the full
 * cast price at preparation is the right exchange rate is not knowable before
 * the balance harness exists at 0.5.0, and nothing here claims it is.
 */
export function preparationCost(policy: CostPolicy, baseCost: Fixed): Fixed {
  return policy.paidAtPreparation ? baseCost : 0;
}

/**
 * Both halves at once, so a caller cannot charge twice by consulting only one.
 *
 * The double-charge is the realistic mistake: `castCost` and
 * {@link preparationCost} are individually obvious and, called at the two
 * points they name, individually correct. What is not obvious is that their sum
 * must be the base cost under every kind in the enumeration, and this is where
 * that invariant is stated and where a test can assert it.
 */
export function costSplit(policy: CostPolicy, baseCost: Fixed): {
  readonly atPreparation: Fixed;
  readonly atRelease: Fixed;
} {
  return {
    atPreparation: preparationCost(policy, baseCost),
    atRelease: castCost(policy, baseCost),
  };
}

/** Guard for a dispatch handed a hook from the wrong point. */
export function assertCostHook(hook: ResolvedHook): void {
  assertHookPoint(hook, 'cost');
  if (hook.kind !== 'standard' && hook.kind !== 'prepaid') throw unimplementedKind(hook);
}
