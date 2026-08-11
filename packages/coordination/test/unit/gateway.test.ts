/*
 * Multiverse Mages — the knowledge port, and the one thing it refuses to do.
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

import { describe, expect, it } from 'vitest';

import { createState } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  attachRecord,
  captureRuleset,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import { CoordinatingKnowledgeGateway } from '../../src/index.js';

import { catalogAndCells, registry, shippedStorePolicy, speciesTable } from './world-fixtures.js';

function universeWithOneMage(): ReturnType<typeof buildWorld> {
  return buildWorld();
}

function buildWorld() {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf, ids } = speciesTable();
  const speciesId = ids[0] as number;
  const traditionId = registry().traditions[0]?.contentId ?? 1;

  const state = createState({
    rootSeed: 7,
    schema: defineWorldStateSchema(),
    contentRevision: registry().contentRevision,
  });
  const universe = createUniverse(state, {
    permittedTechniques: 0b11111,
    permittedForms: 0b11111111111111,
    edictBudget: 0,
    traditionId,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    materials: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });

  const species = speciesOf(speciesId);
  if (species === undefined) throw new Error('the shipped registry declares no species');

  const mage = state.entities.create();
  attachRecord(state, MAGE, mage, {
    speciesId,
    birthTick: 0,
    roleId: MAGE_ROLE.researcher,
    universityId: 0,
    curiosity: species.curiosity,
    ambition: 1024,
    caution: 1024,
    vigor: 1024,
    maxVigor: 1024,
    alive: 1,
  });

  const knowledge = KnowledgeSubsystem.fromState(state, catalog.nodeCount);
  const gateway = new CoordinatingKnowledgeGateway({
    state,
    knowledge,
    catalog,
    cells,
    ruleset: captureRuleset(state, universe),
    ratesOf: () => ({
      learnRate: species.learnRate,
      rediscoveryAffinity: species.rediscoveryAffinity,
      depthCeiling: species.depthCeiling,
    }),
    store: shippedStorePolicy(traditionId),
  });

  return { state, knowledge, gateway, mage, catalog, species };
}

describe('the port answers the questions rules-world asks', () => {
  it('offers a bounded, cheapest-first research frontier of legal, prerequisite-free nodes', () => {
    const { gateway, mage } = universeWithOneMage();
    const frontier = gateway.researchFrontier(mage, 8);

    expect(frontier.length).toBeGreaterThan(0);
    expect(frontier.length).toBeLessThanOrEqual(8);
    for (const target of frontier) {
      expect(target.remainingCost).toBeGreaterThan(0);
      expect(target.tier).toBeGreaterThanOrEqual(1);
    }
  });

  it('stops offering a node once the mage holds it', () => {
    const { state, knowledge, gateway, mage } = universeWithOneMage();
    const held = gateway.researchFrontier(mage, 1)[0];
    expect(held).toBeDefined();

    const instance = state.entities.create();
    attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
      nodeId: held?.nodeId ?? 0,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: 1024,
    });
    knowledge.rebuild();

    // A fresh gateway: the memoized scans are a view of one phase, and the world
    // has just changed. That is the contract this test also pins.
    const after = buildGatewayOver(state, knowledge, gateway);
    expect(after.researchFrontier(mage, 8).map((target) => target.nodeId)).not.toContain(
      held?.nodeId,
    );
    expect(after.knows(mage, held?.nodeId ?? 0)).toBe(true);
    expect(after.heldNodes(mage)).toEqual([held?.nodeId]);
  });
});

describe('the port refuses to accrue work it cannot persist', () => {
  // The honest state of this layer, asserted rather than commented. Partial
  // research, teaching and scribing progress has nowhere to live: `rules-magic`
  // takes it as a parameter and says the caller owns storing it, and nothing
  // owns it yet. A silent per-tick accrual would run, look plausible over two
  // hundred years, and produce a universe where research never completes.
  it('names the missing decision rather than discarding the work', () => {
    const { gateway } = universeWithOneMage();
    for (const accrue of [
      () => gateway.contributeResearch(),
      () => gateway.contributeTeaching(),
      () => gateway.contributeScribing(),
    ]) {
      expect(accrue).toThrow(/nowhere to persist/);
      expect(accrue).toThrow(/migration/);
    }
  });
});

/** Rebuilds the gateway with the same deps, for the "one view per phase" rule. */
function buildGatewayOver(
  state: ReturnType<typeof buildWorld>['state'],
  knowledge: KnowledgeSubsystem,
  previous: CoordinatingKnowledgeGateway,
): CoordinatingKnowledgeGateway {
  void previous;
  const { catalog, cells } = catalogAndCells();
  const { speciesOf, ids } = speciesTable();
  const species = speciesOf(ids[0] as number);
  if (species === undefined) throw new Error('the shipped registry declares no species');
  const traditionId = registry().traditions[0]?.contentId ?? 1;

  return new CoordinatingKnowledgeGateway({
    state,
    knowledge,
    catalog,
    cells,
    ruleset: {
      permittedTechniques: 0b11111,
      permittedForms: 0b11111111111111,
      edicts: [],
    },
    ratesOf: () => ({
      learnRate: species.learnRate,
      rediscoveryAffinity: species.rediscoveryAffinity,
      depthCeiling: species.depthCeiling,
    }),
    store: shippedStorePolicy(traditionId),
  });
}
