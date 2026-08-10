/*
 * Multiverse Mages — changing a universe's tradition, totally.
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

import type { LocationKindValue } from '@mm/state';

import type { ResolvedHook } from './hook-for.js';
import type { StorePolicy } from './store.js';
import { canHoldAt, storePolicy } from './store.js';

/**
 * Changing a universe's tradition (`vision.md` §4a, `magic-traditions`).
 *
 * A tradition is an identity decision, not a build option, and changing it
 * throws the civilization into upheaval. **Quantifying that ruin is
 * `god-agency`'s** — it owns the action, the favor price, and the unrest. What
 * this change owes is narrower and harder to get right later: the operation
 * must be *total*. No knowledge instance may be left sitting at a location the
 * incoming `store` kind does not define.
 *
 * The failure this prevents is a slow one. A universe switches to the Art of
 * Memory, its grimoires are neither destroyed nor moved, and every later query
 * that iterates instances by location finds books in a tradition that has no
 * concept of a book. Nothing throws. Library depth counts them, theft can loot
 * them, and the tradition's whole identity — *unburnable, unstealable, dies
 * with the mage* — is quietly false for every node the universe knew before the
 * switch.
 *
 * Pure, and returns a description rather than mutating: the caller applies the
 * whole result or none of it, which is how the operation's atomicity is
 * expressed in a package that owns no state.
 */

/** What became of one instance the incoming store kind could not hold. */
export const RESOLUTION = {
  /** The incoming kind holds this location; nothing happened to it. */
  kept: 0,
  /** The incoming kind has no such location; the instance is destroyed. */
  destroyed: 1,
} as const;

export type ResolutionValue = (typeof RESOLUTION)[keyof typeof RESOLUTION];

/** One instance, as the caller already holds it. Handles stay opaque. */
export interface InstanceView {
  /** Opaque instance handle — `rules-magic` never resolves it. */
  readonly instanceId: number;
  readonly nodeId: number;
  readonly locationKind: LocationKindValue;
  readonly locationId: number;
}

/** What the operation did to one instance, reported per instance. */
export interface InstanceResolution {
  readonly instanceId: number;
  readonly nodeId: number;
  readonly locationKind: LocationKindValue;
  readonly resolution: ResolutionValue;
  /** Empty for a kept instance; otherwise why the incoming kind refused it. */
  readonly reason: string;
}

/**
 * A node leaving the universe (task 4.9's shape).
 *
 * Deliberately identical in form to every other loss: `magic-traditions`
 * requires a tradition change's losses to be *indistinguishable* from a
 * mage's death or a burned library. A distinguishable one would let a consumer
 * — and, worse, the `knowledgeHalfLife` metric — treat god-caused loss as a
 * separate category, which is exactly the accounting that hides how expensive
 * the god's own switch is.
 *
 * Structurally duplicated from the knowledge-instance subsystem's loss event
 * rather than imported, because that module lands in the same change from a
 * different task group. Reconciling the two into one declaration is a
 * follow-up, not a difference of opinion.
 */
export interface KnowledgeLossEvent {
  readonly nodeId: number;
  readonly worldTick: number;
  readonly locationKind: LocationKindValue;
}

/** Inputs to a tradition change. */
export interface TraditionChangeInput {
  /** The `store` hook in force now. */
  readonly outgoingStore: ResolvedHook;
  /** The `store` hook of the tradition being adopted. */
  readonly incomingStore: ResolvedHook;
  /** Every knowledge instance in the universe, in a stable order. */
  readonly instances: readonly InstanceView[];
  /** The world tick the change lands on, for the loss events. */
  readonly worldTick: number;
}

/** The full description of what a tradition change would do. */
export interface TraditionChangeResult {
  /** Whether the change may be applied at all. `false` leaves state untouched. */
  readonly applied: boolean;
  /** One entry per supplied instance, in the order supplied. */
  readonly resolutions: readonly InstanceResolution[];
  /** Instances the caller must destroy, in the order supplied. */
  readonly destroyed: readonly number[];
  /** Nodes whose last instance this change destroys. */
  readonly losses: readonly KnowledgeLossEvent[];
  /** Empty when applied; otherwise why the operation refused. */
  readonly refusal: string;
}

/**
 * Resolves every instance against the incoming `store` kind.
 *
 * The resolution rule is destruction, and it is the least inventive of the
 * available readings rather than the most interesting one. A universe adopting
 * the Art of Memory has grimoires with nowhere legal to live; converting them
 * into palace instances would hand every mage a free library and make the
 * switch a *reward*, and leaving them in place would make the operation
 * partial, which is the one thing `magic-traditions` forbids outright. So they
 * burn, the burning is reported per instance, and any node whose last copy was
 * among them leaves the universe with an ordinary loss event.
 *
 * `mind` is holdable under every kind in the enumeration, so a change never
 * costs a mage what she personally knows — only what her civilization had
 * written down, or, switching away from the Art of Memory, what it had
 * committed to palaces.
 *
 * Whether the god should be *able* to pay this is `god-agency`'s question. This
 * function answers only what it costs in knowledge.
 */
export function changeTradition(input: TraditionChangeInput): TraditionChangeResult {
  const outgoing = storePolicy(input.outgoingStore);
  const incoming = storePolicy(input.incomingStore);

  // Validate first, apply second. Every instance is checked against the
  // *outgoing* kind before anything is resolved against the incoming one, so a
  // universe whose instances the current tradition cannot describe is refused
  // whole rather than half-migrated. That ordering is the entire mechanism
  // behind `magic-traditions`'s atomicity scenario — in a package that owns no
  // state, "the state is unchanged" can only mean "the result describes no
  // change at all".
  const refusal = refuse(outgoing, input.instances);
  if (refusal !== '') {
    return { applied: false, resolutions: [], destroyed: [], losses: [], refusal };
  }

  // Counted before anything is resolved, so "this was the last one" is a fact
  // about the universe as it stood, not about how far the loop had got.
  const instancesPerNode = new Map<number, number>();
  for (const instance of input.instances) {
    instancesPerNode.set(instance.nodeId, (instancesPerNode.get(instance.nodeId) ?? 0) + 1);
  }

  const resolutions: InstanceResolution[] = [];
  const destroyed: number[] = [];
  const destroyedPerNode = new Map<number, number>();
  const losses: KnowledgeLossEvent[] = [];

  for (const instance of input.instances) {
    if (canHoldAt(incoming, instance.locationKind)) {
      resolutions.push({
        instanceId: instance.instanceId,
        nodeId: instance.nodeId,
        locationKind: instance.locationKind,
        resolution: RESOLUTION.kept,
        reason: '',
      });
      continue;
    }

    resolutions.push({
      instanceId: instance.instanceId,
      nodeId: instance.nodeId,
      locationKind: instance.locationKind,
      resolution: RESOLUTION.destroyed,
      reason:
        `The incoming "${incoming.kind}" store hook holds no instance at location kind ` +
        `${String(instance.locationKind)}.`,
    });
    destroyed.push(instance.instanceId);

    const gone = (destroyedPerNode.get(instance.nodeId) ?? 0) + 1;
    destroyedPerNode.set(instance.nodeId, gone);
    if (gone === (instancesPerNode.get(instance.nodeId) ?? 0)) {
      losses.push({
        nodeId: instance.nodeId,
        worldTick: input.worldTick,
        locationKind: instance.locationKind,
      });
    }
  }

  return { applied: true, resolutions, destroyed, losses, refusal: '' };
}

/**
 * The precondition: the outgoing tradition must be able to describe the state
 * it is being asked to hand over.
 *
 * An instance sitting where the *current* `store` kind cannot hold it means an
 * earlier change was partial, or something wrote a location no tradition
 * defines. Resolving on top of that would launder the older defect into a
 * deliberate-looking destruction and lose the evidence, so the operation
 * refuses and names the instance.
 *
 * Note what is deliberately *not* refused: adopting a tradition whose `store`
 * kind matches the outgoing one. Vancian memorization and True Naming both
 * store knowledge the standard way, and swapping between them is a genuine and
 * expensive change of identity that simply costs this operation nothing —
 * `acquire` is where those two differ. Refusing it would make the store hook
 * the arbiter of whether a tradition change is a tradition change.
 */
function refuse(outgoing: StorePolicy, instances: readonly InstanceView[]): string {
  for (const instance of instances) {
    if (canHoldAt(outgoing, instance.locationKind)) continue;
    return (
      `Instance ${String(instance.instanceId)} of node ${String(instance.nodeId)} sits at location ` +
      `kind ${String(instance.locationKind)}, which the universe's current "${outgoing.kind}" ` +
      'store hook does not hold. The state is already outside what a tradition defines, and ' +
      'resolving on top of it would hide that rather than fix it.'
    );
  }
  return '';
}
