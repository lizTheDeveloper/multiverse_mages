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
 * Not "little", none. It turns each contribution into a *signed* magnitude
 * per `compositional-content.md` §3.3's mode table, groups those by primitive,
 * and calls `stackMagnitudes` from `@mm/primitives`, which owns the declared
 * stacking rule, the cap, the floor, the control clamp, the clamp counters,
 * and every rounding direction. There is no `+`, no `*`, and no comparison of
 * two magnitudes anywhere below — turning a mode into a sign is a lookup, not
 * arithmetic on a magnitude.
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
 *
 * ## The mode table, as signs
 *
 * `compositional-content.md` §3.3:
 *
 * - `create` — `+magnitude` on its own primitive.
 * - `remove` — `−magnitude` on its own primitive.
 * - `transform` — `−magnitude` on its own primitive, `+magnitude` on
 *   `transformTo`. One contribution becomes two signed entries.
 * - `reveal` — no magnitude at all. It already did its work in `gather.ts`;
 *   here it is skipped entirely.
 * - `control` — no magnitude either. Its `{floor, ceiling}` payload is
 *   collected per primitive and combined with `combineControls`, then handed
 *   to `stackMagnitudes` as `options.clamp` rather than folded as a magnitude.
 */

import type { ContentRegistry, PrimitiveCap, PrimitiveRecord } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import type { ClampCounters, EffectControl, StackOptions, StackOutcome } from '@mm/primitives';
import { capLimit, combineControls, stackMagnitudes } from '@mm/primitives';

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

/** One signed magnitude, aimed at the primitive it actually stacks against. */
interface SignedMagnitude {
  readonly primitiveId: string;
  readonly magnitude: Fixed;
}

/**
 * Turns one contribution into zero, one, or two signed magnitudes, per
 * `compositional-content.md` §3.3's mode table. This is a sign lookup, not
 * arithmetic on a stacked value — see this module's opening note.
 *
 * @throws RangeError if a `transform` contribution names no `transformTo`.
 * `node.schema.json`'s `mode-payload-missing` diagnostic is supposed to make
 * this unreachable from real content — reaching it means the registry and the
 * gathered contribution disagree, the same failure mode `requirePrimitive`
 * guards against elsewhere in this pipeline.
 */
function signedMagnitudes(contribution: EffectContribution): readonly SignedMagnitude[] {
  switch (contribution.mode) {
    case 'create':
      return [{ primitiveId: contribution.primitiveId, magnitude: contribution.magnitude }];
    case 'remove':
      return [{ primitiveId: contribution.primitiveId, magnitude: -contribution.magnitude }];
    case 'transform': {
      const transformTo = contribution.transformTo;
      if (transformTo === undefined) {
        throw new RangeError(
          `a "transform" contribution from node ${String(contribution.nodeId)} on primitive ` +
            `"${contribution.primitiveId}" names no transformTo. node.schema.json's ` +
            '"mode-payload-missing" check should have refused this content at load time.',
        );
      }
      return [
        { primitiveId: contribution.primitiveId, magnitude: -contribution.magnitude },
        { primitiveId: transformTo, magnitude: contribution.magnitude },
      ];
    }
    case 'reveal':
    case 'control':
      // Neither contributes a magnitude (compositional-content.md §3.3).
      // `control`'s payload is handled separately, in groupByPrimitive below.
      return [];
  }
}

/** What one pass over the contributions produces, before any primitive is stacked. */
interface Grouped {
  /** Signed magnitudes per primitive, in registry order. */
  readonly magnitudes: ReadonlyMap<PrimitiveRecord, readonly Fixed[]>;
  /** Every `control`-mode payload touching a primitive, keyed by its id. */
  readonly controls: ReadonlyMap<string, readonly EffectControl[]>;
}

/**
 * Groups signed magnitudes and control payloads by primitive, in registry
 * order for the magnitudes.
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
): Grouped {
  const collected = new Map<string, Fixed[]>();
  const controls = new Map<string, EffectControl[]>();

  for (const primitiveId of extraPrimitiveIds) {
    // Resolved eagerly so an unknown id fails here, naming itself, rather than
    // silently producing no row.
    requirePrimitive(registry, primitiveId);
    if (!collected.has(primitiveId)) collected.set(primitiveId, []);
  }

  for (const contribution of contributions) {
    if (contribution.mode === 'control') {
      if (contribution.control === undefined) continue;
      const primitiveId = contribution.primitiveId;
      requirePrimitive(registry, primitiveId);
      if (!collected.has(primitiveId)) collected.set(primitiveId, []);
      const existing = controls.get(primitiveId);
      if (existing === undefined) controls.set(primitiveId, [contribution.control]);
      else existing.push(contribution.control);
      continue;
    }

    for (const signed of signedMagnitudes(contribution)) {
      // Resolves `transformTo` as a real primitive too, not just the
      // contribution's own (already-gathered) `primitiveId`.
      requirePrimitive(registry, signed.primitiveId);
      const magnitudes = collected.get(signed.primitiveId);
      if (magnitudes === undefined) collected.set(signed.primitiveId, [signed.magnitude]);
      else magnitudes.push(signed.magnitude);
    }
  }

  const orderedMagnitudes = new Map<PrimitiveRecord, readonly Fixed[]>();
  for (const entry of registry.primitives) {
    const magnitudes = collected.get(entry.record.id);
    if (magnitudes !== undefined) orderedMagnitudes.set(entry.record, magnitudes);
  }

  return { magnitudes: orderedMagnitudes, controls };
}

/**
 * The stacked outcome's options for one primitive: the caller's shared
 * `counters`/`speciesBase`, plus this primitive's own resolved floor and
 * combined control clamp. Built under `exactOptionalPropertyTypes`, so an
 * absent value is an absent key, never an explicit `undefined`.
 */
function optionsFor(
  context: EffectStackContext,
  floor: Fixed | undefined,
  clamp: EffectControl | undefined,
): StackOptions {
  const options: {
    counters?: ClampCounters;
    speciesBase?: Fixed;
    floor?: Fixed;
    clamp?: EffectControl;
  } = {};
  if (context.counters !== undefined) options.counters = context.counters;
  if (context.speciesBase !== undefined) options.speciesBase = context.speciesBase;
  if (floor !== undefined) options.floor = floor;
  if (clamp !== undefined) options.clamp = clamp;
  return options;
}

/**
 * The primitive's own authored floor (`primitive.json`'s `floor` field),
 * resolved to a bare `Fixed` bound the same way a cap is — `capLimit` handles
 * all three capped kinds, though every W20 floor so far is `fp`.
 *
 * `@mm/content`'s `PrimitiveRecord` does not declare `floor` — it is this
 * task group's own field, authored in `primitive.json`/`primitive.schema.json`
 * alongside `diminishing` stacking, neither of which `@mm/content`'s types
 * have caught up to (unlike `mode`/`when`/`reveals`/`control`/`transformTo`,
 * which `packages/content/src` picked up while this task group was in
 * flight — see `contribution.ts`'s opening note). This local extension reads
 * the real field the loader already passes through regardless.
 */
function primitiveFloor(primitive: PrimitiveRecord, speciesBase: Fixed | undefined): Fixed | undefined {
  const record = primitive as PrimitiveRecord & { floor?: PrimitiveCap };
  if (record.floor === undefined) return undefined;
  return capLimit(record.floor, speciesBase === undefined ? {} : { speciesBase });
}

/**
 * The stacked, capped value of every primitive these contributions touch.
 *
 * One call to `stackMagnitudes` per primitive, with that primitive's registry
 * record — so the rule, the floor, and the cap all come from content, never
 * from this package's memory of what `contracts.md` §3 said.
 *
 * @returns primitive id to outcome, in registry order.
 */
export function stackContributions(
  contributions: readonly EffectContribution[],
  context: EffectStackContext,
): ReadonlyMap<string, StackOutcome> {
  const { magnitudes: grouped, controls } = groupByPrimitive(
    context.registry,
    contributions,
    context.primitiveIds ?? [],
  );

  const stacked = new Map<string, StackOutcome>();
  for (const [primitive, magnitudes] of grouped) {
    const floor = primitiveFloor(primitive, context.speciesBase);
    const primitiveControls = controls.get(primitive.id);
    const clamp = primitiveControls === undefined ? undefined : combineControls(primitiveControls);
    const resolvedClamp = clamp?.floor === undefined && clamp?.ceiling === undefined ? undefined : clamp;

    const options = optionsFor(context, floor, resolvedClamp);
    stacked.set(primitive.id, stackMagnitudes(primitive, magnitudes, options));
  }
  return stacked;
}
