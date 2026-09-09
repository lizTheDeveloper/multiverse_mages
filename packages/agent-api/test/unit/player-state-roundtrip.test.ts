/*
 * Multiverse Mages — the projection round-trips to §4.1's vector byte for byte.
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
 * Step 1 of `docs/design/observation-entitlement.md`, and its proof.
 *
 * `project()` is an **independent** re-derivation of every aggregate — it does
 * not call `rawObservation` and decode. That is the point of this file: if the
 * projection delegated to the encoder, byte-identity would hold by construction
 * and would say nothing about whether the named reducer is faithful to the
 * positional one. It is two implementations, checked against each other.
 *
 * **A happy path is not a proof.** One settled universe would agree under a
 * dozen wrong reducers, so every state below is chosen for a branch the encoder
 * actually has: no universe entity, more edicts than the budget, a node the
 * catalogue does not name, an Art-of-Memory palace instance, a dead mage, a
 * missing material-stock row, more objectives than slots, and a combatant on a
 * side that does not exist.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import type { Engagement } from '@mm/state';
import {
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  EDICT,
  EDICT_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  OBJECTIVE,
  OBJECTIVE_STATUS,
  PREPARED_SPELL,
  RAID_SIDE,
  attachRecord,
  beginEngagement,
  captureRuleset,
  cellIdAt,
  defineWorldStateSchema,
} from '@mm/state';

import type { EngagementView, ObservationInput } from '@mm/agent-api';
import { encodePlayerState, project, rawObservation } from '@mm/agent-api';

import {
  FIXTURE_CATALOGUE,
  FIXTURE_CONTENT_REVISION,
  FP,
  addInstance,
  engageWorld,
  firstUniverse,
  secondUniverse,
} from './fixtures.js';

/**
 * The assertion this whole file exists to make.
 *
 * Compared element by element rather than with a deep-equal on the two typed
 * arrays, so that a failure names the channel that diverged. A report of
 * *"Int32Array(400) !== Int32Array(400)"* would send a reader to diff four
 * hundred numbers by eye.
 */
function expectRoundTrip(input: ObservationInput): void {
  const encoded = rawObservation(input);
  const projected = encodePlayerState(project(input));

  expect(projected.length).toBe(encoded.length);
  const divergences: string[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (projected[index] !== encoded[index]) {
      divergences.push(
        `[${String(index)}] projected ${String(projected[index])} vs encoded ${String(encoded[index])}`,
      );
    }
  }
  expect(divergences).toEqual([]);
}

describe('project() round-trips to the §4.1 vector', () => {
  it('agrees on a settled universe with institutions and knowledge', () => {
    const world = firstUniverse();
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  });

  it('agrees on a universe unlike it in every readable way', () => {
    const world = secondUniverse();
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  });

  it('agrees during an engagement, own side either way', () => {
    const world = firstUniverse();
    const engagement = engageWorld(world);
    for (const ownSide of [RAID_SIDE.attacker, RAID_SIDE.defender]) {
      expectRoundTrip({
        state: world.state,
        catalogue: FIXTURE_CATALOGUE,
        engagement: { engagement, ownSide },
      });
    }
  });

  /**
   * `writeRuleset`, `writeTradition` and `writeResources` all return early when
   * `findUniverse` is `0`, leaving three blocks zero. A projection that threw,
   * or that read a universe that is not there, would diverge here and nowhere
   * else — and a half-built test world is a world.
   */
  it('agrees on a world with no universe entity at all', () => {
    const state = createState({
      rootSeed: 0x5151_0001,
      schema: defineWorldStateSchema(),
      contentRevision: FIXTURE_CONTENT_REVISION,
    });
    expectRoundTrip({ state, catalogue: FIXTURE_CATALOGUE });
  });

  /**
   * The encoder slices at `EDICT_BUDGET_MAX` because an unbounded write would
   * run past the ruleset block and report a ninth edict's cell id as the
   * universe's tradition. The projection truncates at the same point.
   */
  it('agrees when there are more edicts than the block has room for', () => {
    const world = firstUniverse();
    for (let extra = 0; extra < 12; extra += 1) {
      const edict = world.state.entities.create();
      attachRecord(world.state, EDICT, edict, {
        cellId: cellIdAt(extra % 5, extra % 14),
        kind: extra % 2 === 0 ? EDICT_KIND.interdiction : EDICT_KIND.dispensation,
      });
    }
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  });

  /**
   * A `nodeId` the catalogue does not name is skipped rather than thrown on —
   * §0's `contentRevision` is the mechanism for a state/content mismatch, and a
   * throw here would crash a Monte Carlo worker over a stale catalogue. Both
   * halves must skip it, or the instance counts diverge.
   */
  it('agrees when knowledge refers to a node the catalogue does not name', () => {
    const world = firstUniverse();
    addInstance(world.state, 9_999, LOCATION_KIND.mind, world.mages[0] as EntityHandle);
    addInstance(world.state, 9_998, LOCATION_KIND.library, world.library);
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  });

  /**
   * §1.5: a palace instance is the Art of Memory `store` hook, and it counts as
   * the mage knowing the node. A reducer reading only `mind` would put an Art
   * of Memory mage in the untaught bucket.
   */
  it('agrees when a mage keeps her knowledge in a memory palace', () => {
    const world = firstUniverse();
    // Mage 1 knows nothing through `mind`; give her a tier-7 node in a palace.
    addInstance(world.state, 5, LOCATION_KIND.palace, world.mages[1] as EntityHandle);
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  });

  /**
   * A dead mage is excluded from the histogram entirely — `alive` is a filter,
   * not a key or a value. `firstUniverse` already ships one; this adds a dead
   * mage who *knows* something, which is the case where a reducer that filtered
   * in the wrong order would put a phantom in a high tier bucket.
   */
  it('agrees when a dead mage knew a deep node', () => {
    const world = firstUniverse();
    const corpse = world.state.entities.create();
    attachRecord(world.state, MAGE, corpse, {
      speciesId: 3,
      birthTick: -900,
      roleId: MAGE_ROLE.researcher,
      universityId: world.university,
      curiosity: FP,
      ambition: FP,
      caution: FP,
      vigor: 0,
      maxVigor: 4 * FP,
      alive: 0,
    });
    attachRecord(world.state, KNOWLEDGE_INSTANCE, world.state.entities.create(), {
      nodeId: 5,
      locationKind: LOCATION_KIND.mind,
      locationId: corpse,
      acquiredTick: 1,
      mastery: FP,
    });
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  });

  /**
   * Twelve objective slots, ranked most valuable first with ties broken by
   * ascending handle. A thirteenth reaches no slot, and *which* twelve survive
   * is the assertion — a reducer that took the first twelve in row order would
   * agree on the count and disagree on the contents.
   */
  it('agrees when a raid has more objectives than slots, including ties', () => {
    const world = firstUniverse();
    const engagement = engageWorld(world);
    const entities = engagement.entities;
    for (let extra = 0; extra < 18; extra += 1) {
      const objective = entities.entities.create();
      attachRecord(entities, OBJECTIVE, objective, {
        kind: (extra % 4) + 1,
        targetId: 0,
        x: 0,
        y: 0,
        // Deliberately repeating values, so the handle tiebreak is exercised
        // rather than every objective being separable by value alone.
        valueFp: (extra % 5) * FP,
        statusKind: OBJECTIVE_STATUS.held,
        capturedBy: extra % 3 === 0 ? 1 : 0,
      });
    }
    expectRoundTrip({
      state: world.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: { engagement, ownSide: RAID_SIDE.attacker },
    });
  });

  /**
   * A combatant on a side outside `{attacker, defender}` is `rules-raid`'s bug,
   * and the encoder drops it rather than bucketing it. So does a spell prepared
   * by a combatant that is gone. Both halves must drop the same rows.
   */
  it('agrees when a combatant is on a side that does not exist', () => {
    const world = firstUniverse();
    const engagement = engageWorld(world);
    const entities = engagement.entities;

    const stray = entities.entities.create();
    attachRecord(entities, COMBATANT, stray, {
      sourceKind: COMBATANT_SOURCE_KIND.mage,
      sourceId: 1,
      side: 7,
      x: 0,
      y: 0,
      hp: 99 * FP,
      maxHp: 99 * FP,
      vigor: 9 * FP,
      maxVigor: 9 * FP,
      concealment: 9 * FP,
    });
    // Prepared by the dropped combatant, and prepared by nobody at all.
    attachRecord(entities, PREPARED_SPELL, entities.entities.create(), {
      combatantId: stray,
      nodeId: 2,
    });
    attachRecord(entities, PREPARED_SPELL, entities.entities.create(), {
      combatantId: 0,
      nodeId: 3,
    });

    expectRoundTrip({
      state: world.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: { engagement, ownSide: RAID_SIDE.defender },
    });
  });

  /**
   * An engagement with no combatants and no objectives. The two side summaries
   * are the empty ones and the twelve objective slots stay zero, which is
   * indistinguishable from world scale for those channels — fine, because the
   * clock block says which scale the observation was taken at, and that channel
   * must still differ.
   */
  it('agrees on an empty engagement, and the clock still says engaged', () => {
    const world = secondUniverse();
    const ruleset = captureRuleset(world.state, world.universe);
    const engagement: Engagement = beginEngagement(world.state, {
      hostRuleset: ruleset,
      raiderRuleset: ruleset,
      portalStability: 1,
      stabilityDecayPerTick: 1,
      raidSeed: 0x7171_0007,
    });
    const view: EngagementView = { engagement, ownSide: RAID_SIDE.attacker };
    expectRoundTrip({ state: world.state, catalogue: FIXTURE_CATALOGUE, engagement: view });

    const projected = project({
      state: world.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: view,
    });
    expect(projected.clock.inEngagement).toBe(true);
    expect(projected.engagement?.own.combatantCount).toBe(0);
  });
});

describe('the projection is named, not positional', () => {
  /**
   * The reason the type exists. A strategy author reading `observation[36]` has
   * to already know that is favor; these assertions are what replaces that.
   */
  it('names the resources a strategy could previously only reach by offset', () => {
    const world = firstUniverse();
    const player = project({ state: world.state, catalogue: FIXTURE_CATALOGUE });

    expect(player.resources.favor).toBe(40 * FP);
    expect(player.resources.worship).toBe(12 * FP);
    expect(player.resources.worshipTier).toBe(3);
    expect(player.resources.prestige).toBe(2 * FP);
    // The sum of the three material kinds, which is the whole slot.
    expect(player.resources.materials).toBe(500 * FP);
    expect(player.traditionId).toBe(2);
  });

  /**
   * The lossiest mapping in the vector, stated as four named numbers. Note what
   * is *not* here: no library count, because `LIBRARY` reaches no slot at all.
   */
  it('names the four numbers every institution amounts to', () => {
    const world = firstUniverse();
    const player = project({ state: world.state, catalogue: FIXTURE_CATALOGUE });

    expect(player.institutions.universityCount).toBe(1);
    expect(player.institutions.universityCapacity).toBe(240);
    // Distinct nodes in libraries: node 1 twice and node 3 once is depth 2.
    expect(player.institutions.libraryDepth).toBe(2);
    expect(player.institutions.grimoireCount).toBe(1);
  });

  /**
   * A `PlayerState` carries no field for a withheld trait — that is what makes
   * withholding expressible. If one of these ever becomes observable the
   * inventory row changes first, then the type.
   */
  it('carries no field for a trait the inventory records as withheld', () => {
    const world = firstUniverse();
    const player = project({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const resources: Record<string, unknown> = { ...player.resources };

    // favorCap is withheld while favor is observable: a player reads the pool
    // and not its ceiling.
    expect(resources['favorCap']).toBeUndefined();
    expect(resources['prestigeEarned']).toBeUndefined();
    // edictBudget likewise: the edicts standing are observable, how many more
    // may be issued is not.
    const ruleset: Record<string, unknown> = { ...player.ruleset };
    expect(ruleset['edictBudget']).toBeUndefined();
  });
});
