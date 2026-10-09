/*
 * Multiverse Mages — why the portal is or is not open, in facts a page can print.
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
 * A read-only report of `rules-raid`'s portal gate for one universe, published
 * beside each frame so a page can say *which* condition holds the portal shut.
 *
 * ## Why this exists
 *
 * Playtest round 3: for ~470 in-game years the open-portal blocker read *"no
 * living mage holds a portal node"* while eleven mages held Open the Portal.
 * The gate that actually refused was mastery — `portalGate` counts a holder
 * only at or above `CASTABLE_MASTERY` — and mastery was published nowhere. The
 * page had a count of nodes known and nothing that could explain the "no".
 *
 * ## What it is not
 *
 * Not a rule. Every verdict here is `rules-raid`'s own: {@link portalGate} is
 * called with the same arguments `raids.ts` gives it (favor cost zero — the
 * price is the mask's question, and the page already answers it from
 * `content.actionCosts`), and the holder list is the gate's own predicate
 * (`enablesGate` on `portal`, mind or palace, living mage). Nothing is written
 * to state and nothing reads it back, so no hash, fixture or baseline moves.
 */

import type { ContentId } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import { MAGE, MAGE_ROLE, collectRecords } from '@mm/state';
import { MASTERY_MAX, MagicGrid } from '@mm/rules-magic';
import type { PortalRefusal } from '@mm/rules-raid';
import { CASTABLE_MASTERY, COMBAT_PRIMITIVES, enablesGate, heldInstancesOf, portalGate } from '@mm/rules-raid';

import { participantOf } from './raids.js';
import type { ReferenceContent } from './reference-universe.js';

/** One living mage's hold on one portal node. */
export interface PortalHolder {
  readonly handle: number;
  readonly nodeId: number;
  /** Raw mastery, `0..masteryMax`. */
  readonly mastery: number;
  readonly roleId: number;
  /** `LOCATION_KIND` of the held instance — a mind or a memory palace. */
  readonly locationKind: number;
  /** `mastery >= usableMastery`: this holder alone would satisfy the knowledge arm of the gate. */
  readonly usable: boolean;
}

/** The portal gate's standing this tick. */
export interface PortalStanding {
  /** `rules-raid`'s `CASTABLE_MASTERY` — the mastery a holder needs. */
  readonly usableMastery: number;
  /** `rules-magic`'s `MASTERY_MAX`, so a page can show mastery as a share. */
  readonly masteryMax: number;
  /**
   * `portalGate`'s refusal with the price left out, or `''` when the gate is
   * open: `'cell-forbidden'`, `'knowledge-lost'` (nobody holds a portal node
   * at usable mastery), or `'already-engaged'`.
   */
  readonly refusal: PortalRefusal;
  /** Every living mage's hold on a gate-enabling portal node, strongest first. */
  readonly holders: readonly PortalHolder[];
  /** Living mages holding the raider role — the people a portal would send. */
  readonly livingRaiders: number;
  /**
   * Whether a raider's readiness months drill her own portal knowledge — true
   * only when the world loop was built with a raid kit that includes `portal`
   * (`raidKitPrimitives`). A page offers "name her a raider" as the way to
   * raise her mastery only when this says it works.
   */
  readonly raiderDrillsPortal: boolean;
}

/** What is built once per registry: the grid and the portal node set. */
interface PerRegistry {
  readonly grid: MagicGrid;
  readonly portalNodes: ReadonlySet<ContentId>;
}
const perRegistry = new WeakMap<object, PerRegistry>();
function cached(content: ReferenceContent): PerRegistry {
  let hit = perRegistry.get(content.registry);
  if (hit === undefined) {
    const portalNodes = new Set(
      content.registry.nodes
        .filter(({ record }) => record.effects.some((effect) => enablesGate(effect, COMBAT_PRIMITIVES.portal)))
        .map(({ contentId }) => contentId),
    );
    hit = { grid: MagicGrid.from(content.registry), portalNodes };
    perRegistry.set(content.registry, hit);
  }
  return hit;
}

/**
 * Whether the world loop's raider drill covers `portal`: `worldDeps`'
 * `raidKitPrimitives` (the raid-readiness drill, #251) holds the interned
 * `portal` primitive. Read by property presence because a build without the
 * drill has no such field at all — and then the answer is false, which is the
 * truth there. `portal-legibility.test.ts` pins this against an independent
 * signal of the drill (`rules-world`'s `takesOptionalTarget`), so a renamed
 * field cannot leave it silently false.
 */
function raiderDrillsPortal(content: ReferenceContent): boolean {
  const deps: object = content.deps;
  if (!('raidKitPrimitives' in deps)) return false;
  const kit = deps.raidKitPrimitives;
  return kit instanceof Set && kit.has(content.registry.intern('primitive', COMBAT_PRIMITIVES.portal));
}

/**
 * The portal gate's standing for the universe in `state`, or `undefined` when
 * there is none or it has ended.
 */
export function portalStandingOf(state: SimState, content: ReferenceContent): PortalStanding | undefined {
  const participant = participantOf(state, content);
  if (participant === undefined) return undefined;
  const { grid, portalNodes } = cached(content);

  const holders: PortalHolder[] = [];
  let livingRaiders = 0;
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive !== 1) continue;
    if (row.roleId === MAGE_ROLE.raider) livingRaiders += 1;
    for (const held of heldInstancesOf(participant, handle as EntityHandle)) {
      if (!portalNodes.has(held.nodeId)) continue;
      holders.push({
        handle,
        nodeId: held.nodeId,
        mastery: held.mastery,
        roleId: row.roleId,
        locationKind: held.locationKind,
        usable: held.mastery >= CASTABLE_MASTERY,
      });
    }
  }
  holders.sort((a, b) => b.mastery - a.mastery || a.handle - b.handle || a.nodeId - b.nodeId);

  const gate = portalGate({
    attackerWorld: state,
    attackerRuleset: participant.ruleset,
    registry: content.registry,
    grid,
    favor: 0,
    favorCost: 0,
    alreadyEngaged: state.clock.mode !== TIME_MODE.world,
    heldOf: (mage) => heldInstancesOf(participant, mage),
  });

  return {
    usableMastery: CASTABLE_MASTERY,
    masteryMax: MASTERY_MAX,
    refusal: gate.refusal,
    holders,
    livingRaiders,
    raiderDrillsPortal: raiderDrillsPortal(content),
  };
}
