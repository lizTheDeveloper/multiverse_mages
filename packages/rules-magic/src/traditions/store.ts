/*
 * Multiverse Mages — the `store` tradition hook: where knowledge can live.
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
import { fromInt, mul } from '@mm/sim-core';
import type { LocationKindValue } from '@mm/state';
import { LOCATION_KIND } from '@mm/state';

import type { ResolvedHook } from './hook-for.js';
import { assertHookPoint, booleanParam, integerParam, unimplementedKind } from './hook-for.js';

/**
 * Hook two of four (`vision.md` §4a): **where knowledge can live.**
 *
 * `contracts.md` §1.5 gives an instance four possible locations — mind,
 * grimoire, library, palace — and the `store` hook decides which of them this
 * tradition admits, how many a mage may hold, whether a written copy can be
 * made at all, and what survives the holder's death. Everything else about an
 * instance is somebody else's hook or nobody's.
 *
 * World-time, therefore home-tradition across a portal: what a raider is
 * carrying and how she is carrying it is settled before she leaves.
 */
export interface StorePolicy {
  /** The kind that produced this policy, for diagnostics and for reporting. */
  readonly kind: string;
  /**
   * Location kinds an instance may occupy under this tradition, ascending.
   *
   * `mind` is in every policy. A mage who knows a thing knows it; no tradition
   * in the enumeration removes the head as a place knowledge sits, and one that
   * did would be describing a species, not a tradition.
   */
  readonly holdableLocationKinds: readonly LocationKindValue[];
  /**
   * Where a newly acquired personal instance lands.
   *
   * `mind` under `standard`; `palace` under `palace`. This is the whole of what
   * "the Art of Memory stores knowledge in a mental palace rather than a
   * grimoire" means mechanically — the instance is created somewhere else, and
   * every consequence follows from where it sits rather than from a flag.
   */
  readonly personalLocationKind: LocationKindValue;
  /**
   * How many instances one mage may hold at {@link personalLocationKind}, or
   * {@link UNBOUNDED_SLOTS} for no limit.
   */
  readonly slotsPerMage: number;
  /** Whether mind → grimoire scribing may be attempted at all. */
  readonly scribingAvailable: boolean;
  /** Whether an instance at this location can be taken as an object. */
  lootableAt(locationKind: LocationKindValue): boolean;
  /** Whether an instance at this location can be handed to another holder. */
  transferableAt(locationKind: LocationKindValue): boolean;
  /** Whether an instance at this location can be destroyed by burning it. */
  burnableAt(locationKind: LocationKindValue): boolean;
  /**
   * Location kinds destroyed when the mage holding them dies.
   *
   * `mind` always. `palace` additionally, and that is the tradition's whole
   * bargain: unburnable and unlootable in exchange for utterly mortal.
   */
  readonly perishesWithHolder: readonly LocationKindValue[];
  /**
   * `fp` coefficient turning a mage's palace into library depth (task 6.9).
   *
   * `0` under `standard`, where library depth comes from shelved grimoires
   * instead and a palace contribution would be double-counting nothing.
   */
  readonly libraryDepthCoefficient: Fixed;
}

/** {@link StorePolicy.slotsPerMage} when the tradition declares no bound. */
export const UNBOUNDED_SLOTS = 0;

/**
 * As much of a {@link StorePolicy} as an acquisition needs to be bounded.
 *
 * `research` and `teach` take one of these rather than the whole policy: the
 * three fields here are everything the slot bound is a function of, and a
 * narrower input is one a caller can satisfy without resolving looting,
 * burning, mortality and library depth as well. `StorePolicy` is assignable to
 * it, so the tradition layer hands its policy straight through.
 *
 * `kind` is carried only so a refusal can name the hook that refused. Nothing
 * in the acquisition path branches on it — that would be the fifth hook
 * `vision.md` §4a caps out.
 */
export type PersonalStore = Pick<
  StorePolicy,
  'kind' | 'personalLocationKind' | 'slotsPerMage'
>;

/** Written copies: the two location kinds a grimoire's instance moves between. */
const WRITTEN_KINDS: readonly LocationKindValue[] = [LOCATION_KIND.grimoire, LOCATION_KIND.library];

/** Resolves a `store` hook into the policy the knowledge subsystem consults. */
export function storePolicy(hook: ResolvedHook): StorePolicy {
  assertHookPoint(hook, 'store');

  switch (hook.kind) {
    case 'standard':
      return standardStore();
    case 'bounded':
      return boundedStore(hook);
    case 'palace':
      return palaceStore(hook);
    default:
      throw unimplementedKind(hook);
  }
}

/**
 * The baseline: knowledge sits in heads and in books, and books are objects.
 *
 * A written copy is lootable, transferable, and burnable in both of the states
 * `design.md` gives it — held as a grimoire and shelved in a library — because
 * it is the same physical book either way and only the instance's `locationId`
 * moved. A mind instance is none of the three: reading a mind is the
 * `knowledge-steal` primitive, which is a spell, not a theft of an object.
 */
function standardStore(): StorePolicy {
  return {
    kind: 'standard',
    holdableLocationKinds: [LOCATION_KIND.mind, ...WRITTEN_KINDS],
    personalLocationKind: LOCATION_KIND.mind,
    slotsPerMage: UNBOUNDED_SLOTS,
    scribingAvailable: true,
    lootableAt: (locationKind) => WRITTEN_KINDS.includes(locationKind),
    transferableAt: (locationKind) => WRITTEN_KINDS.includes(locationKind),
    burnableAt: (locationKind) => WRITTEN_KINDS.includes(locationKind),
    perishesWithHolder: [LOCATION_KIND.mind],
    libraryDepthCoefficient: 0,
  };
}

/**
 * `standard`, with a ceiling on what one head may carry.
 *
 * The whole difference from {@link standardStore} is {@link
 * StorePolicy.slotsPerMage}, and that one difference occupies a corner of the
 * store space no v1 tradition could reach. `standard` hardcodes
 * {@link UNBOUNDED_SLOTS}; `palace` takes a slot count but sets
 * `scribingAvailable: false`. So a universe whose mages have finite memory *and*
 * whose scribes still copy books — the Witch's Bond, and every "you may hold
 * only so many pacts" regime — had no kind to declare, and this is it.
 *
 * Deliberately not a param added to `standard`. `standard` is the answer a
 * tradition gets for saying nothing, and its unbounded-ness is what makes
 * `personalStoreFull` return before counting; giving it a required param would
 * make every tradition that declares no store hook pay for a rule it did not
 * ask for.
 *
 * Knowledge is still mortal exactly as far as `standard` makes it mortal — the
 * mind dies, the book does not — because a capacity bound is a statement about
 * how much fits, not about what survives.
 */
function boundedStore(hook: ResolvedHook): StorePolicy {
  return {
    ...standardStore(),
    kind: 'bounded',
    slotsPerMage: integerParam(hook, 'slotsPerMage'),
  };
}

/**
 * The Art of Memory: a mental palace instead of a shelf.
 *
 * Four consequences, all of them one decision (`vision.md` §5): a palace
 * instance is unburnable because there is nothing to burn, unlootable because
 * there is nothing to carry off, un-loanable because it cannot be handed over,
 * and utterly lost when its holder dies. Scribing is unavailable, so an Art of
 * Memory universe creates no grimoire and no library instance at all — which is
 * why `libraryDepthCoefficient` exists next door, and why it is a parameter
 * rather than a constant.
 *
 * `mind` stays holdable. A tradition change into the Art of Memory must not
 * silently erase what its mages already know — the palace replaces the
 * *grimoire*, not the head — and `magic-traditions`'s own switching scenario
 * names grimoire and library as the kinds that resolve, and does not name mind.
 */
function palaceStore(hook: ResolvedHook): StorePolicy {
  const lootable = booleanParam(hook, 'lootable');
  const burnable = booleanParam(hook, 'burnable');

  return {
    kind: 'palace',
    holdableLocationKinds: [LOCATION_KIND.mind, LOCATION_KIND.palace],
    personalLocationKind: LOCATION_KIND.palace,
    slotsPerMage: integerParam(hook, 'slotsPerMage'),
    scribingAvailable: false,
    // The params govern the palace. They say nothing about a mind, which is not
    // an object under any tradition, and nothing about written copies, which
    // this tradition cannot produce.
    lootableAt: (locationKind) => locationKind === LOCATION_KIND.palace && lootable,
    transferableAt: (locationKind) => locationKind === LOCATION_KIND.palace && lootable,
    burnableAt: (locationKind) => locationKind === LOCATION_KIND.palace && burnable,
    perishesWithHolder: [LOCATION_KIND.mind, LOCATION_KIND.palace],
    libraryDepthCoefficient: integerParam(hook, 'libraryDepthCoefficient'),
  };
}

/** Whether an instance may exist at this location under this tradition. */
export function canHoldAt(policy: StorePolicy, locationKind: LocationKindValue): boolean {
  return policy.holdableLocationKinds.includes(locationKind);
}

/** Whether the holder's death destroys an instance sitting here. */
export function perishesWithHolder(
  policy: StorePolicy,
  locationKind: LocationKindValue,
): boolean {
  return policy.perishesWithHolder.includes(locationKind);
}

/** The answer to "may this mage take one more instance into store?" */
export interface StoreAdmission {
  readonly admitted: boolean;
  /** Where the instance would land. Meaningful only when admitted. */
  readonly locationKind: LocationKindValue;
  /** Empty when admitted; otherwise names the bound that refused it. */
  readonly refusal: string;
}

/**
 * Admits one newly acquired instance into a mage's personal store, or refuses
 * it and names the slot count.
 *
 * The refusal names the number because the number is content: a player who
 * cannot see *twelve* in the message has no way to tell a tradition's declared
 * bound from a bug, and `magic-traditions` asks for the count by name.
 *
 * **Takes a {@link PersonalStore} rather than the whole policy.** It reads
 * three fields and always did; demanding the rest made it callable only from
 * somewhere that had already resolved looting and mortality, which is a reason
 * the acquisition path never called it at all.
 */
export function admitToStore(policy: PersonalStore, heldPersonalInstances: number): StoreAdmission {
  const locationKind = policy.personalLocationKind;

  if (policy.slotsPerMage !== UNBOUNDED_SLOTS && heldPersonalInstances >= policy.slotsPerMage) {
    return {
      admitted: false,
      locationKind,
      refusal:
        `This mage already holds ${String(heldPersonalInstances)} instances and the "${policy.kind}" ` +
        `store hook allows ${String(policy.slotsPerMage)} per mage.`,
    };
  }

  return { admitted: true, locationKind, refusal: '' };
}

/** The answer to "may this universe write this down?" */
export interface ScribeAvailability {
  readonly available: boolean;
  readonly refusal: string;
}

/**
 * Whether scribing may proceed under this tradition.
 *
 * Checked before any cost is computed and before any RNG is drawn. A refusal
 * that happened after a draw would make the scribing stream advance differently
 * under the Art of Memory than under any other tradition, and `contracts.md` §6
 * exists precisely so that one subsystem's draws do not depend on another
 * subsystem's decisions.
 */
export function scribeAvailability(policy: StorePolicy): ScribeAvailability {
  if (policy.scribingAvailable) return { available: true, refusal: '' };
  return {
    available: false,
    refusal:
      `The "${policy.kind}" store hook has no written form: knowledge lives in a memory palace, ` +
      'so no grimoire and no library instance can be created (vision.md §5).',
  };
}

/** One living mage's palace, weighted the way library depth weights a shelf. */
export interface PalaceContribution {
  /** Opaque mage handle. `rules-magic` never resolves it. */
  readonly mageId: number;
  /**
   * Tier-weighted count of that mage's usable palace instances — the same unit
   * `libraryDepth` reports for a shelf, so the two are commensurable.
   */
  readonly tierWeightedCount: number;
}

/**
 * Library depth contributed by the palaces of a university's living mages.
 *
 * Without this, an Art of Memory universe has zero library depth by
 * construction and `vision.md` §6a's knowledge-as-capital loop is switched off
 * for one of the three v1 traditions — not balanced differently, switched off,
 * and untestably so until the harness exists at 0.5.0.
 *
 * With it, the loop runs and its capital is mortal: the research advantage of
 * an Art of Memory university literally ages out and has to be continuously
 * replaced. That is the sharpest available expression of "it dies with the
 * mage" that does not disable a core system, and the coefficient is a hook
 * param so the harness can move it — including to zero — without a code change.
 *
 * Callers pass only *living* mages. Whether a mage is alive is `rules-world`'s
 * fact (`contracts.md` §1.2), and reaching for it here is the import cycle §5
 * forbids.
 *
 * @returns `fp` depth. Zero under any policy whose coefficient is zero, which
 * includes every `standard` tradition — a `standard` university's depth comes
 * from its shelves and adding a palace term there would count nothing twice.
 */
export function palaceLibraryDepth(
  policy: StorePolicy,
  livingMagePalaces: readonly PalaceContribution[],
): Fixed {
  if (policy.libraryDepthCoefficient === 0) return 0;

  let total = 0;
  for (const contribution of livingMagePalaces) {
    if (contribution.tierWeightedCount <= 0) continue;
    total += contribution.tierWeightedCount;
  }
  if (total === 0) return 0;

  return mul(fromInt(total), policy.libraryDepthCoefficient);
}
