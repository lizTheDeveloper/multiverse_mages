/*
 * Multiverse Mages — preparations readied at home and spent abroad.
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
import type { LocationKindValue } from '@mm/state';

import type { CastPolicy } from './cast.js';
import { UNBOUNDED_PREPARATION, castPolicy, expendOnCast } from './cast.js';
import type { CostPolicy } from './cost.js';
import { castCost, costPolicy } from './cost.js';
import type { PortalHookSet } from './hook-for.js';
import type { StorePolicy } from './store.js';
import { canHoldAt, storePolicy } from './store.js';

/**
 * The clock split, applied to one raider (`contracts.md` §1.6, `vision.md` §4a).
 *
 * `contracts.md` §1.6 is unusually precise about `preparedSpells`, and the
 * precision is load-bearing: *"readied at home, spent abroad."* The raider's
 * **home** `cast` hook populates the list at portal entry, drawing on what her
 * **home** `store` hook makes available; the **host's** `cast` hook governs how
 * casting consumes it, and the **host's** `cost` hook sets the price.
 *
 * The alternative reading — the host's `cast` kind populating the list too —
 * fails in both directions and neither failure is subtle. A Vancian raider
 * entering a `standard` sky would arrive holding every node she knows, and
 * Vancian's entire limitation would evaporate the moment she stepped through a
 * door. A `standard` raider entering a Vancian sky would arrive with nothing
 * prepared and no world time in which to prepare it, and would be disarmed by
 * arriving.
 *
 * Both halves of the split resolve through {@link hookFor}, so nothing here
 * reads a `traditionId`.
 */

/** The four hooks a raider fights under, each already resolved to its owner. */
export interface PortalHooks {
  /** Home: what she may hold, and where. */
  readonly homeStore: StorePolicy;
  /** Home: how her preparations were readied before she left. */
  readonly homeCast: CastPolicy;
  /** Host: how casting spends them under this sky. */
  readonly hostCast: CastPolicy;
  /** Host: what release costs her here. */
  readonly hostCost: CostPolicy;
}

/**
 * Resolves every hook a raid needs, once, at portal open.
 *
 * Resolved once and carried rather than re-resolved per cast. `contracts.md`
 * §1.1 makes a raid evaluate against an immutable ruleset snapshot captured at
 * portal open precisely so that no rule can change mid-raid; re-reading the
 * traditions per tick would reintroduce exactly the mutability the snapshot
 * exists to remove.
 */
export function resolvePortalHooks(set: PortalHookSet): PortalHooks {
  return {
    homeStore: storePolicy(set.homeStore),
    homeCast: castPolicy(set.homeCast),
    hostCast: castPolicy(set.hostCast),
    hostCost: costPolicy(set.hostCost),
  };
}

/**
 * One node a raider might carry through, as her home universe already knows it.
 *
 * Location kind is here because the home `store` hook decides what she can draw
 * a preparation from: an Art of Memory raider readies from her palace, a
 * standard one from her mind, and neither may ready from a book she left on a
 * shelf.
 */
export interface CarriedNode {
  readonly nodeId: number;
  /** `contracts.md` §1.5 location kind of the instance she holds it at. */
  readonly locationKind: LocationKindValue;
  /** Whether the instance is usable at home: held, above threshold, not dormant. */
  readonly usable: boolean;
  /**
   * Whether she had this node prepared when the portal opened.
   *
   * Only meaningful under a `prepared` home cast kind, and it is the caller's
   * record of world-time preparation rather than something this function can
   * derive — memorising is an act that happened over the preceding weeks.
   */
  readonly preparedAtHome: boolean;
}

/** What a raider arrives holding, and why. */
export interface PortalEntry {
  /** `contracts.md` §1.6 `preparedSpells`, in the order they were readied. */
  readonly preparedSpells: readonly number[];
  /** Whether casting in this sky spends from that list at all. */
  readonly spentFromPreparations: boolean;
}

/**
 * Populates `preparedSpells` at portal entry, by the raider's **home** cast kind.
 *
 * Under a `prepared` home kind the list is exactly what she memorised, capped at
 * her home tradition's slot count — she cannot smuggle a fifth preparation
 * through a door.
 *
 * Under a `standard` home kind the list is empty, and that is not a gap. A
 * `standard` tradition has no notion of a readied spell to carry, so there is
 * nothing for the raider to have prepared; what she can do in a `prepared` host
 * sky is `raid-engagement`'s question, because it is a question about what the
 * host permits an unprepared caster to do, not about what she brought. Recorded
 * as an open ambiguity for this change's closeout rather than answered here by
 * picking whichever reading was convenient.
 */
export function populatePreparedSpells(
  hooks: PortalHooks,
  carried: readonly CarriedNode[],
): PortalEntry {
  const spentFromPreparations = hooks.hostCast.preparationRequired;

  if (!hooks.homeCast.preparationRequired) {
    return { preparedSpells: [], spentFromPreparations };
  }

  const preparedSpells: number[] = [];
  for (const node of carried) {
    if (!node.preparedAtHome || !node.usable) continue;
    // Drawn "on what her home store hook makes available" (§1.6) — a node held
    // only in a book she is not carrying was never readied.
    if (!canHoldAt(hooks.homeStore, node.locationKind)) continue;
    if (
      hooks.homeCast.slotsPerMage !== UNBOUNDED_PREPARATION &&
      preparedSpells.length >= hooks.homeCast.slotsPerMage
    ) {
      break;
    }
    preparedSpells.push(node.nodeId);
  }

  return { preparedSpells, spentFromPreparations };
}

/** What releasing one node abroad did, and what it cost. */
export interface ReleaseAbroad {
  readonly cast: boolean;
  readonly preparedSpells: readonly number[];
  /** `fp` vigor deducted, by the **host's** `cost` hook. */
  readonly cost: Fixed;
  readonly refusal: string;
}

/**
 * Releases one node in a foreign sky: the host spends it, and the host prices it.
 *
 * This is `vision.md` §4a's worked example in code — *"a Vancian raider in an
 * Art of Memory universe carries her own preparations but pays the host's price
 * to release them."* Her four preparations came with her because her home cast
 * kind readied them; the Art of Memory's `standard` cast kind does not consume
 * a preparation, and its `standard` cost kind charges her the full price her
 * own `prepaid` tradition would have waived.
 *
 * The refusal path charges nothing. A cost deducted for a cast that did not
 * happen is the kind of asymmetry that only shows up as an unexplained vigor
 * drain in a Monte Carlo run months later.
 */
export function releaseAbroad(
  hooks: PortalHooks,
  preparedSpells: readonly number[],
  nodeId: number,
  baseCost: Fixed,
): ReleaseAbroad {
  const outcome = expendOnCast(hooks.hostCast, preparedSpells, nodeId);
  if (!outcome.cast) {
    return {
      cast: false,
      preparedSpells: outcome.preparedSpells,
      cost: 0,
      refusal: outcome.refusal,
    };
  }

  return {
    cast: true,
    preparedSpells: outcome.preparedSpells,
    cost: castCost(hooks.hostCost, baseCost),
    refusal: '',
  };
}
