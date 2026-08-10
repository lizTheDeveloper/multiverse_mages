/*
 * Multiverse Mages — the `cast` tradition hook: how a held spell is expended.
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

import type { ResolvedHook } from './hook-for.js';
import { assertHookPoint, integerParam, unimplementedKind } from './hook-for.js';

/**
 * Hook three of four (`vision.md` §4a): **how a held spell is expended.**
 *
 * Engagement-time, therefore host-tradition across a portal — with one
 * deliberate exception that `contracts.md` §1.6 spells out and `portal.ts`
 * implements: the *list* of prepared spells is populated at portal entry by the
 * raider's own home `cast` kind, because loading preparations is a world-time
 * act performed before she leaves. Only the spending of that list is the host's.
 */
export interface CastPolicy {
  readonly kind: string;
  /**
   * Whether a node must be prepared in advance before it can be cast.
   *
   * `false` under `standard`, where a mage casts anything she usably holds.
   */
  readonly preparationRequired: boolean;
  /** How many nodes may be prepared at once, or {@link UNBOUNDED_PREPARATION}. */
  readonly slotsPerMage: number;
}

/** {@link CastPolicy.slotsPerMage} when the kind declares no preparation. */
export const UNBOUNDED_PREPARATION = 0;

/** Resolves a `cast` hook into the policy the engagement layer consults. */
export function castPolicy(hook: ResolvedHook): CastPolicy {
  assertHookPoint(hook, 'cast');

  switch (hook.kind) {
    case 'standard':
      return { kind: 'standard', preparationRequired: false, slotsPerMage: UNBOUNDED_PREPARATION };
    case 'prepared':
      return {
        kind: 'prepared',
        preparationRequired: true,
        slotsPerMage: integerParam(hook, 'slotsPerMage'),
      };
    default:
      throw unimplementedKind(hook);
  }
}

/** What a mage may draw a preparation from, as the caller already knows it. */
export interface PreparationCandidate {
  /** The node to prepare. */
  readonly nodeId: number;
  /**
   * Whether the mage holds a usable instance of it: held, above the effect
   * pipeline's activation threshold, and not dormant.
   *
   * Supplied rather than computed. Usability is a fact about instances and
   * about `permits()`, both of which belong to other task groups in this change;
   * recomputing it here would give the simulation two answers to one question.
   */
  readonly usable: boolean;
  /** Whether the node's cell is currently forbidden (`design.md`, dormancy). */
  readonly dormant: boolean;
}

/** The outcome of one preparation attempt. */
export interface PreparationOutcome {
  readonly prepared: boolean;
  /** The list after the attempt — unchanged when the attempt was refused. */
  readonly preparedSpells: readonly number[];
  /** Empty when prepared; otherwise says which rule refused it. */
  readonly refusal: string;
}

/**
 * Prepares one node, bounded by the tradition's declared slot count.
 *
 * Vancian memorization is the tradition that makes this hook worth having: a
 * mage holds a limited number of readied spells, and the limit is the whole
 * character of the tradition. So the refusals are specific and each names its
 * rule — a player who is refused needs to know whether she is out of slots, has
 * not learned the thing, or has had it interdicted out from under her.
 *
 * Under a `standard` cast kind there is no preparation at all, and this
 * refuses rather than silently succeeding: a caller preparing spells in a sky
 * that has no such concept has misread which tradition governs, and a quiet
 * success would hide that until the list was spent.
 */
export function prepare(
  policy: CastPolicy,
  preparedSpells: readonly number[],
  candidate: PreparationCandidate,
): PreparationOutcome {
  if (!policy.preparationRequired) {
    return {
      prepared: false,
      preparedSpells,
      refusal:
        `The "${policy.kind}" cast hook prepares nothing — a mage casts what she usably holds. ` +
        'Preparing under it is a caller that resolved the wrong tradition.',
    };
  }

  if (candidate.dormant) {
    return {
      prepared: false,
      preparedSpells,
      refusal:
        `Node ${String(candidate.nodeId)} is dormant: its cell is not permitted, so it cannot be ` +
        'cast, taught, scribed, or prepared.',
    };
  }

  if (!candidate.usable) {
    return {
      prepared: false,
      preparedSpells,
      refusal:
        `This mage holds no usable instance of node ${String(candidate.nodeId)} to prepare from.`,
    };
  }

  if (
    policy.slotsPerMage !== UNBOUNDED_PREPARATION &&
    preparedSpells.length >= policy.slotsPerMage
  ) {
    return {
      prepared: false,
      preparedSpells,
      refusal:
        `This mage holds ${String(preparedSpells.length)} prepared spells and the ` +
        `"${policy.kind}" cast hook allows ${String(policy.slotsPerMage)}.`,
    };
  }

  return { prepared: true, preparedSpells: [...preparedSpells, candidate.nodeId], refusal: '' };
}

/** The outcome of releasing one node. */
export interface CastOutcome {
  readonly cast: boolean;
  /** The list after the release. One entry shorter under `prepared`. */
  readonly preparedSpells: readonly number[];
  /** Empty when cast; otherwise says which rule refused it. */
  readonly refusal: string;
}

/**
 * Expends one node, consuming a preparation if the governing tradition has them.
 *
 * The knowledge instance is untouched either way. `magic-traditions` is explicit
 * about this and it matters: casting a memorised spell spends the *memorisation*,
 * not the knowledge, and a Vancian mage who has fired all four preparations
 * still knows every node she knew this morning. Conflating the two would make
 * casting a form of knowledge loss and would put a spike in `knowledgeHalfLife`
 * that no raid and no death caused.
 *
 * Exactly one preparation is removed, the first match, so a mage who prepared
 * the same node twice may cast it twice. That the *first* match goes is what
 * keeps the list in a deterministic order across peers.
 */
export function expendOnCast(
  policy: CastPolicy,
  preparedSpells: readonly number[],
  nodeId: number,
): CastOutcome {
  if (!policy.preparationRequired) {
    return { cast: true, preparedSpells, refusal: '' };
  }

  const at = preparedSpells.indexOf(nodeId);
  if (at === -1) {
    return {
      cast: false,
      preparedSpells,
      refusal:
        `Node ${String(nodeId)} is not prepared. The "${policy.kind}" cast hook releases only ` +
        'what was readied in advance; the knowledge is still held and can be prepared again.',
    };
  }

  return {
    cast: true,
    preparedSpells: [...preparedSpells.slice(0, at), ...preparedSpells.slice(at + 1)],
    refusal: '',
  };
}

/**
 * Whether a mage could cast a node right now, ignoring cost.
 *
 * Under `standard` this is exactly "does she usably hold it". Under `prepared`
 * it is "is it in the list" — she may hold it and still not be able to cast it,
 * which is the tradition's entire point.
 */
export function isCastable(
  policy: CastPolicy,
  preparedSpells: readonly number[],
  candidate: PreparationCandidate,
): boolean {
  if (candidate.dormant) return false;
  if (!policy.preparationRequired) return candidate.usable;
  return preparedSpells.includes(candidate.nodeId);
}
