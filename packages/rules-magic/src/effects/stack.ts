/*
 * Multiverse Mages — handing gathered contributions to the shared stacker.
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
 * ## This file deliberately does no arithmetic
 *
 * Not "little", none. It groups magnitudes by primitive and calls
 * `stackMagnitudes` from `@mm/primitives`, which owns the declared stacking
 * rule, the cap, the clamp counter, and every rounding direction. There is no
 * `+`, no `*`, and no comparison of two magnitudes anywhere below.
 *
 * The rule is `contracts.md` §3 and the reason is stated there: stacking is the
 * field most likely to be silently assumed differently by two implementers, and
 * two `+20%` research bonuses making `+44%` in one package and `+40%` in
 * another is a divergence that compounds across a Monte Carlo run until a
 * balance baseline is irreproducible for reasons nobody can name. `@mm/rules-
 * magic` is a consumer of that arithmetic and must never become a second source
 * of it — which is also why `BAN_INLINE_PRIMITIVE_STACKING` lints this
 * directory.
 *
 * One consequence worth naming: `multiplicativeOnRemainder` sorts its sources
 * before folding, because floored multiplication does not associate. That
 * reasoning lives in `packages/primitives/src/stacking.ts` and is not repeated
 * or re-derived here. Grouping below preserves gather order and hands the group
 * over as-is; whether order matters is the stacker's question to answer.
 */

import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import type { ClampCounters, StackOptions, StackOutcome } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { EffectContribution } from './contribution.js';
import { requirePrimitive } from './registry-lookup.js';

export interface EffectStackContext {
  readonly registry: ContentRegistry;
  /**
   * Where clamps are counted. Optional, but the harness always passes one: an
   * uncounted clamp is a balance finding that never surfaces
   * (`packages/primitives/src/caps.ts`).
   */
  readonly counters?: ClampCounters;
  /** For a `fraction-of-species-base` cap — `lifespan`'s, and only that one. */
  readonly speciesBase?: Fixed;
  /**
   * Primitives to report even when nothing contributed to them.
   *
   * A caller asking "what is this mage's effective research rate" wants an
   * answer when she knows no research magic — and the answer is the stacking
   * rule's identity, `FP_ONE`, not a missing key the caller has to substitute a
   * default for. Substituting it at the call site is exactly how one consumer
   * comes to use `0` where another uses `fp(1024)`.
   */
  readonly primitiveIds?: readonly string[];
}

/** Builds the options object `stackMagnitudes` takes, under exactOptionalPropertyTypes. */
function optionsFor(context: EffectStackContext): StackOptions {
  const options: { counters?: ClampCounters; speciesBase?: Fixed } = {};
  if (context.counters !== undefined) options.counters = context.counters;
  if (context.speciesBase !== undefined) options.speciesBase = context.speciesBase;
  return options;
}

/**
 * Groups contributions by primitive, in registry order.
 *
 * Registry order rather than arrival order because the result is iterated by
 * callers and reported by the harness, and a report whose row order depends on
 * which mage was visited first is a diff nobody reads — the same reasoning
 * `ClampCounters.entries()` gives for sorting.
 */
function groupByPrimitive(
  registry: ContentRegistry,
  contributions: readonly EffectContribution[],
  extraPrimitiveIds: readonly string[],
): ReadonlyMap<PrimitiveRecord, readonly Fixed[]> {
  const collected = new Map<string, Fixed[]>();
  for (const primitiveId of extraPrimitiveIds) {
    // Resolved eagerly so an unknown id fails here, naming itself, rather than
    // silently producing no row.
    requirePrimitive(registry, primitiveId);
    if (!collected.has(primitiveId)) collected.set(primitiveId, []);
  }
  for (const contribution of contributions) {
    const magnitudes = collected.get(contribution.primitiveId);
    if (magnitudes === undefined) collected.set(contribution.primitiveId, [contribution.magnitude]);
    else magnitudes.push(contribution.magnitude);
  }

  const ordered = new Map<PrimitiveRecord, readonly Fixed[]>();
  for (const entry of registry.primitives) {
    const magnitudes = collected.get(entry.record.id);
    if (magnitudes !== undefined) ordered.set(entry.record, magnitudes);
  }
  return ordered;
}

/**
 * The stacked, capped value of every primitive these contributions touch.
 *
 * One call to `stackMagnitudes` per primitive, with that primitive's registry
 * record — so the rule and the cap come from content, never from this package's
 * memory of what `contracts.md` §3 said.
 *
 * @returns primitive id to outcome, in registry order.
 */
export function stackContributions(
  contributions: readonly EffectContribution[],
  context: EffectStackContext,
): ReadonlyMap<string, StackOutcome> {
  const options = optionsFor(context);
  const grouped = groupByPrimitive(context.registry, contributions, context.primitiveIds ?? []);

  const stacked = new Map<string, StackOutcome>();
  for (const [primitive, magnitudes] of grouped) {
    stacked.set(primitive.id, stackMagnitudes(primitive, magnitudes, options));
  }
  return stacked;
}
