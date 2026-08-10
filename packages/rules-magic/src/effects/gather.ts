/*
 * Multiverse Mages — gathering effect contributions from usable instances.
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
 * ## One gate, in one place
 *
 * Four questions decide whether a held instance contributes anything:
 *
 * 1. Is it held somewhere that can act — a mind or a palace, not a book?
 * 2. Is its mastery at or above the activation threshold?
 * 3. Is its cell permitted, i.e. is it not dormant?
 * 4. Does the primitive's declared scale apply in the current clock mode?
 *
 * All four are asked here, and question 3 is asked **exactly once per candidate
 * instance**, before any contribution exists. That is `magic-primitives`'
 * "single-point legality" requirement, and the reason for it is not efficiency.
 * A pipeline that carried a `legal` flag forward would let two consumers
 * disagree about what to do with `false` — one skipping, one assuming the skip
 * already happened — and neither call site would look wrong. So an illegal
 * instance produces no contribution at all, and {@link EffectContribution} has
 * nowhere to record that a question was ever asked.
 *
 * ## What this file may not do
 *
 * It may not combine anything. Two instances of the same primitive produce two
 * contributions, not one sum. Combining is `@mm/primitives`, via `stack.ts` —
 * see `contracts.md` §3 and the lint rule that enforces it.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Fixed, TimeMode } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import { permits } from '@mm/state';

import type { EffectContribution, EffectSourceInstance } from './contribution.js';
import { CONTRIBUTING_LOCATION_KINDS, MASTERY_ACTIVATION_THRESHOLD } from './contribution.js';
import { requireNode, requirePrimitive } from './registry-lookup.js';
import { primitiveAppliesInMode } from './scale.js';

/**
 * Everything gathering needs that is not the instances themselves.
 *
 * `cellOf` is a parameter rather than an import because `magic-grid` owns cell
 * addressing and this file owns effects; passing it keeps the two independently
 * testable and keeps there being exactly one implementation of each. `permits`
 * is imported directly, because `contracts.md` §1.1 says there is one
 * arbitration function and this is a consumer of it, not a second one.
 */
export interface EffectGatherContext {
  readonly registry: ContentRegistry;
  /** The universe's ruleset, or a raid's captured snapshot (`contracts.md` §1.1). */
  readonly ruleset: Ruleset;
  /** The clock mode effects are being gathered for. */
  readonly mode: TimeMode;
  /** `magic-grid`'s cell addressing: the interned cell id a node belongs to. */
  readonly cellOf: (nodeId: ContentId) => number;
  /** Defaults to {@link MASTERY_ACTIVATION_THRESHOLD}. */
  readonly activationThreshold?: Fixed;
}

/**
 * Whether an instance is a candidate at all, before legality is considered.
 *
 * Split out so the two cheap, purely local tests happen before the ruleset walk
 * — and, more importantly, so that a grimoire never causes a legality question
 * to be asked about it. Nothing downstream can then mistake "this book's cell
 * is permitted" for "this book contributes".
 */
function isContributingLocation(instance: EffectSourceInstance): boolean {
  return CONTRIBUTING_LOCATION_KINDS.has(instance.locationKind);
}

/**
 * Every effect contributed by these instances, in this mode, under this ruleset.
 *
 * Order is deterministic and meaningful: instances in the order given, and
 * within an instance the node's effects in declared order. Nothing sorts, so
 * two peers holding the same instances in the same order produce byte-identical
 * contribution lists — and the one place order genuinely must not matter, the
 * fold over magnitudes, is `@mm/primitives`' problem and is solved there.
 *
 * Instances are read and never written. A dormant instance is skipped, not
 * destroyed: `contracts.md` §1.1 is explicit that a mage may hold knowledge her
 * universe has since forbidden.
 */
export function gatherEffects(
  instances: Iterable<EffectSourceInstance>,
  context: EffectGatherContext,
): readonly EffectContribution[] {
  const { registry, ruleset, mode, cellOf } = context;
  const threshold = context.activationThreshold ?? MASTERY_ACTIVATION_THRESHOLD;

  const contributions: EffectContribution[] = [];

  for (const instance of instances) {
    if (!isContributingLocation(instance)) continue;
    if (instance.mastery < threshold) continue;

    // ---- The single legality point. Asked once; the answer is never stored. ----
    if (!permits(ruleset, cellOf(instance.nodeId))) continue;

    const node = requireNode(registry, instance.nodeId);
    for (const effect of node.effects) {
      const primitive = requirePrimitive(registry, effect.primitive);
      if (!primitiveAppliesInMode(primitive, mode)) continue;

      contributions.push({
        nodeId: instance.nodeId,
        primitiveId: primitive.id,
        magnitude: effect.magnitude,
        target: effect.target,
        durationTicks: effect.durationTicks,
      });
    }
  }

  return contributions;
}
