/*
 * Multiverse Mages — the axis-price factor: what a permit costs, as a swept
 * parameter rather than a number in a data file.
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
 * `permit-technique` and `permit-form` are `god-cost.json`'s two most consequential
 * prices and both are still `"tuningStatus": "untuned"`. W82 measured what that
 * costs: *"going from 1×1 to the whole grid costs 84 favor, once"*, so the
 * opening square is a starting position rather than a limit, and four of the
 * twelve pool strategies erase the difference between a 1×2 opening and a 3×4
 * one entirely.
 *
 * The repository's own rule is that *"every situation where a number should be
 * figured out is a search space"*. This file makes the price a **factor** — one
 * scalar, in `fp`, applied to the whole axis family — so a sweep can vary it the
 * way it already varies `openingTechniqueCount` and `foundingNodes`, without a
 * data-file edit and without a code edit.
 *
 * ## Why the scale is applied to the registry and not to the resolver
 *
 * The price is read in **two** places that must never disagree: `coordination`'s
 * {@link https | interventionCost} charges it, and `agent-api`'s mask refuses an
 * action the god cannot pay for. `cheapestAxisMultiplier`'s docstring already
 * names the symptom of a drift between them — *"one action in a thousand
 * admitted by the mask and refused by the resolver"*.
 *
 * Both read the same `ContentRegistry.godCost(actionId)`: `resolveGodCosts` fills
 * `deps.god.costs` from it and `contentCatalogue` fills the mask's
 * `ActionCostTable` from the same struct. So there is exactly one place to apply
 * a scale such that the two cannot diverge, and it is the registry. Scaling in
 * the resolver would leave the mask pricing the shipped number.
 *
 * ## All four axis actions move together, because the loader requires it
 *
 * `packages/content/src/god.ts`'s `symmetric(1, 2, …)` and `symmetric(3, 4, …)`
 * make permit/forbid price equality a **checked** invariant, on vision pillar 1's
 * argument that *"prohibiting something is a real strategic option, not a
 * penalty"*. Scaling only the permits would produce a registry the loader would
 * reject, so this scales the family: technique permit and forbid, form permit and
 * forbid, by the identical factor. The technique:form ratio of 2:1 is preserved
 * for the same reason — it encodes fourteen cells against five, which the price
 * of a permit does not change.
 *
 * ## What this deliberately does *not* do
 *
 * It does not make the price scale with how much is already permitted. That is a
 * different mechanism (a per-breadth escalator, or a recurring upkeep — see the
 * campaign plan's "add drains, do not cut"), and conflating the two would make
 * the sweep unable to say which of them the measurement supports. This factor
 * answers exactly one question: *is there a flat price at which the opening
 * square binds?*
 */

import type { ContentRegistry, GodCostRecord } from '@mm/content';
import { FP_ONE, mul } from '@mm/sim-core';

/**
 * The `fp` scale that means "the shipped price", and the unit every level is
 * expressed in. `2048` is 2×, `8192` is 8×.
 */
export const AXIS_PRICE_IDENTITY = FP_ONE;

/**
 * `contracts.md` §4.2 action ids whose price this factor moves.
 *
 * Permit and forbid, technique and form. See the file docstring for why forbid
 * cannot be left behind.
 */
export const AXIS_PRICE_ACTION_IDS: readonly number[] = Object.freeze([1, 2, 3, 4]);

/** The action id whose price every other non-zero price must exceed. */
const ASSIGN_ROLE_ACTION_ID = 10;

/**
 * The scale a derived registry already carries.
 *
 * A `Symbol` rather than a field so it cannot collide with content and does not
 * appear in any serialization, and **enumerable** so object spread carries it —
 * which is the point: it is what lets {@link withAxisPriceScale} refuse a second,
 * different scale rather than silently compounding it. A registry scaled 2× and
 * then handed to a 4× arm would produce an 8× universe, every run of which would
 * complete and none of which would match its record.
 */
const APPLIED_SCALE = Symbol.for('mm.scenario.axisPriceScale');

/** The scale a registry has already been through, or `undefined` for shipped. */
export function appliedAxisPriceScale(registry: ContentRegistry): number | undefined {
  return (registry as { [APPLIED_SCALE]?: number })[APPLIED_SCALE];
}

/**
 * A registry whose four axis prices are the shipped ones multiplied by `scale`.
 *
 * `0` and `1024` both return the argument **unchanged and by identity**, which is
 * what makes a sweep that does not name this factor produce byte-identical runs
 * to one written before the factor existed — the same promise
 * `openingTechniqueCount`'s zero makes, for the same reason.
 *
 * The returned object shares every field with its source but for `godCosts` and
 * `godCost`. Sharing is safe because a `ContentRegistry` is immutable loaded
 * content; the two `WeakMap`s keyed on the registry object
 * (`rules-magic/effects/registry-lookup.ts`) simply take a second entry, and
 * their values are derived from fields this does not touch.
 *
 * `contentRevision` is deliberately **not** modified. A scaled registry is a
 * measurement instrument, not a content release, and moving the revision would
 * put a number no content file contains inside every snapshot hash and every
 * provenance record in the campaign's committed baselines. The price a run used
 * belongs in its `levels`, which is where a sweep already records it.
 *
 * @throws Error if the scale is not a non-negative integer, or if the scaled
 * price would violate `god-cost.json`'s own loader invariants — the axis prices
 * must stay strictly above `assign-role`'s, or the cheapest-intervention rule
 * that keeps most of the action space affordable is broken. Refusing is the
 * point: a sweep level the content model would reject must not run and be
 * recorded as though it were a price.
 */
export function withAxisPriceScale(registry: ContentRegistry, scale: number): ContentRegistry {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error(
      `axisPriceScale is ${JSON.stringify(scale)}, which is not a non-negative integer. It is an ` +
        `fp multiplier at 1/1024 — ${String(AXIS_PRICE_IDENTITY)} is the shipped price, ` +
        `${String(AXIS_PRICE_IDENTITY * 8)} is eight times it.`,
    );
  }
  if (scale === 0 || scale === AXIS_PRICE_IDENTITY) return registry;

  const already = appliedAxisPriceScale(registry);
  if (already !== undefined) {
    if (already === scale) return registry;
    throw new Error(
      `This registry is already priced at axisPriceScale ${String(already)} and was asked for ` +
        `${String(scale)}. Scaling a scaled registry compounds the two — a 2× set handed to a 4× ` +
        'arm is an 8× universe recorded as a 4× one. Resolve each price from the shipped ' +
        'registry.',
    );
  }

  const floor = registry.godCost(ASSIGN_ROLE_ACTION_ID)?.favorCost ?? 0;
  const scaled = new Map<number, GodCostRecord>();
  const godCosts = registry.godCosts.map((entry) => {
    const { record } = entry;
    if (!AXIS_PRICE_ACTION_IDS.includes(record.actionId)) return entry;
    const favorCost = mul(record.favorCost, scale);
    if (favorCost <= floor) {
      throw new Error(
        `axisPriceScale ${String(scale)} prices "${record.id}" at ${String(favorCost)}, which is ` +
          `not more than the ${String(floor)} that assigning a role costs. god-cost.json's ` +
          'loader refuses that ordering, and a sweep may not run a price the content model ' +
          'would not accept.',
      );
    }
    const next: GodCostRecord = { ...record, favorCost };
    scaled.set(record.actionId, next);
    return { contentId: entry.contentId, record: next };
  });

  const derived: ContentRegistry = {
    ...registry,
    godCosts,
    godCost: (actionId: number) => scaled.get(actionId) ?? registry.godCost(actionId),
  };
  Object.defineProperty(derived, APPLIED_SCALE, { value: scale, enumerable: true });
  return derived;
}

/**
 * What one axis action costs under a scale, without building a registry.
 *
 * For tools and reports that want to state a price beside a measurement. Reads
 * the same record the rules path reads, so it cannot quote a number the
 * simulation did not charge.
 */
export function axisPriceUnder(
  registry: ContentRegistry,
  actionId: number,
  scale: number,
): number {
  const base = registry.godCost(actionId)?.favorCost ?? 0;
  if (scale === 0 || scale === AXIS_PRICE_IDENTITY) return base;
  return mul(base, scale);
}
