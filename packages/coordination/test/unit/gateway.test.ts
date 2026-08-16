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
import {
  DEFAULT_TEACH_THRESHOLD,
  KnowledgeSubsystem,
  MASTERY_ACTIVATION_THRESHOLD,
} from '@mm/rules-magic';

import { CoordinatingKnowledgeGateway } from '../../src/index.js';

import { catalogAndCells, nodeFacets, registry, shippedAcquirePolicy, shippedStorePolicy, speciesTable } from './world-fixtures.js';

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
    facets: nodeFacets(),
    ruleset: captureRuleset(state, universe),
    ratesOf: () => ({
      learnRate: species.learnRate,
      rediscoveryAffinity: species.rediscoveryAffinity,
      depthCeiling: species.depthCeiling,
      scribeAffinity: species.scribeAffinity,
    }),
    store: shippedStorePolicy(traditionId),
    acquire: shippedAcquirePolicy(traditionId),
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

  it('separates what a mage holds from what she can cast', () => {
    // `castableNodes` is the gateway's half of `GOAL.applyMagic`'s
    // applicability, and it is three of `gatherEffects`' four gates asked of one
    // mage. The one that is easy to get wrong is the mastery threshold: a node
    // finished last month sits at `DEFAULT_INITIAL_MASTERY` and is held without
    // being castable, and a build that conflated the two would let a mage
    // harvest with a spell she cannot yet perform.
    const { state, knowledge, gateway, mage } = universeWithOneMage();
    const [low, high] = gateway.researchFrontier(mage, 2);
    expect(low).toBeDefined();
    expect(high).toBeDefined();

    for (const [target, mastery] of [
      [low, MASTERY_ACTIVATION_THRESHOLD - 1],
      [high, MASTERY_ACTIVATION_THRESHOLD],
    ] as const) {
      attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
        nodeId: target?.nodeId ?? 0,
        locationKind: LOCATION_KIND.mind,
        locationId: mage,
        acquiredTick: 0,
        mastery,
      });
    }
    knowledge.rebuild();

    const after = buildGatewayOver(state, knowledge, gateway);
    expect(after.heldNodes(mage)).toContain(low?.nodeId);
    expect(after.heldNodes(mage)).toContain(high?.nodeId);
    // At the threshold, not above it: the comparison is `>=`, and a strict `>`
    // would move the whole activation boundary by one fixed-point unit for
    // every consumer of it.
    expect(after.castableNodes(mage)).toEqual([high?.nodeId]);
  });

  it('stops offering a cast the moment the ruleset stops permitting it', () => {
    // Permission is evaluated when the question is asked, so an interdiction
    // takes the verb away without touching what anybody knows. Asserted through
    // a second gateway over the *same* state with a different ruleset, which is
    // the only difference between the two answers.
    const { state, knowledge, gateway, mage } = universeWithOneMage();
    const target = gateway.researchFrontier(mage, 1)[0];
    attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
      nodeId: target?.nodeId ?? 0,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: 1024,
    });
    knowledge.rebuild();

    expect(buildGatewayOver(state, knowledge, gateway).castableNodes(mage)).toEqual([
      target?.nodeId,
    ]);
    expect(forbiddenGateway(state, knowledge).castableNodes(mage)).toEqual([]);
    // And she still knows it.
    expect(forbiddenGateway(state, knowledge).knows(mage, target?.nodeId ?? 0)).toBe(true);
  });
});

describe('a gateway built without a ledger is query-only, and says so', () => {
  // This replaces the refusal that used to stand here. That one said partial
  // progress had nowhere in the *project* to live, which is no longer true — it
  // lives in `EFFORT_PROGRESS`, and `effort-progress.test.ts` exercises it. What
  // survives is the narrower guard: most of this port is questions, and a
  // caller that only asks them need not build a ledger. Accruing without one is
  // a wiring mistake, and a wiring mistake that silently discarded a month of
  // work is the failure the original refusal was protecting against.
  it('refuses to accrue rather than dropping the month on the floor', () => {
    const { gateway, mage } = universeWithOneMage();
    const nodeId = gateway.researchFrontier(mage, 1)[0]?.nodeId ?? 1;
    for (const accrue of [
      () => gateway.contributeResearch(mage, nodeId, 1024),
      () => gateway.contributeTeaching(mage, mage, nodeId, 1024),
    ]) {
      expect(accrue).toThrow(/effort ledger/);
    }
  });
});

/** Rebuilds the gateway with the same deps, for the "one view per phase" rule. */
/**
 * The same state under a ruleset that permits nothing.
 *
 * Written as a whole second gateway rather than as a mutated ruleset, because a
 * gateway memoizes its scans against the ruleset it was built with — that is
 * what makes it a view of one phase — and mutating one in place would answer a
 * question that was never asked.
 */
function forbiddenGateway(
  state: ReturnType<typeof buildWorld>['state'],
  knowledge: KnowledgeSubsystem,
): CoordinatingKnowledgeGateway {
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
    facets: nodeFacets(),
    ruleset: { permittedTechniques: 0, permittedForms: 0, edicts: [] },
    ratesOf: () => ({
      learnRate: species.learnRate,
      rediscoveryAffinity: species.rediscoveryAffinity,
      depthCeiling: species.depthCeiling,
      scribeAffinity: species.scribeAffinity,
    }),
    store: shippedStorePolicy(traditionId),
    acquire: shippedAcquirePolicy(traditionId),
  });
}

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
    facets: nodeFacets(),
    ruleset: {
      permittedTechniques: 0b11111,
      permittedForms: 0b11111111111111,
      edicts: [],
    },
    ratesOf: () => ({
      learnRate: species.learnRate,
      rediscoveryAffinity: species.rediscoveryAffinity,
      depthCeiling: species.depthCeiling,
      scribeAffinity: species.scribeAffinity,
    }),
    store: shippedStorePolicy(traditionId),
    acquire: shippedAcquirePolicy(traditionId),
  });
}

describe('what the frontier quotes is what research charges', () => {
  /**
   * `researchFrontier` used to price rediscovery on `wasEverKnown` alone.
   *
   * That flag is set by `createInstance` and never cleared, so it is true of
   * every node anybody in the universe has *ever* learned — the ones still on
   * the shelf included. `research()` prices the same work with `isRediscovery`,
   * which is `wasEverKnown && !exists`. The two therefore disagreed on exactly
   * the set of nodes the universe currently holds, and disagreed in the
   * direction that hurts: the quote said "at least three times", the charge said
   * "ordinary", and a mage ranking her options priced held nodes off the list.
   *
   * The setup below is the minimum that reproduces it — two mages, one of whom
   * holds the node the other is considering.
   */
  function twoMages(): ReturnType<typeof buildWorld> & { readonly second: number } {
    const world = buildWorld();
    const { speciesOf, ids } = speciesTable();
    const species = speciesOf(ids[0] as number);
    if (species === undefined) throw new Error('the shipped registry declares no species');

    const second = world.state.entities.create();
    attachRecord(world.state, MAGE, second, {
      speciesId: ids[0] as number,
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
    return { ...world, second };
  }

  function quoteFor(
    gateway: CoordinatingKnowledgeGateway,
    mage: number,
    nodeId: number,
  ): number | undefined {
    return gateway.researchFrontier(mage, 512).find((target) => target.nodeId === nodeId)
      ?.remainingCost;
  }

  it('quotes a node a colleague still holds at the ordinary price, not the rediscovery one', () => {
    const { state, knowledge, gateway, mage, second } = twoMages();
    const target = gateway.researchFrontier(second, 1)[0];
    expect(target).toBeDefined();
    const nodeId = target?.nodeId ?? 0;
    const before = quoteFor(gateway, second, nodeId);
    expect(before).toBeGreaterThan(0);

    // The first mage learns it, through the subsystem rather than by attaching a
    // record: `createInstance` is what sets the persisted ever-known mark, and
    // that mark is the whole subject of this test.
    knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: 1024,
    });

    const after = buildGatewayOver(state, knowledge, gateway);
    // The persisted mark is set and stays set — read off the subsystem, because
    // that is where §1.5's record lives. What the *gateway* reports is the
    // narrower question its callers actually ask, and the answer is no: a node
    // somebody is holding is not a lost art.
    expect(knowledge.wasEverKnown(nodeId)).toBe(true);
    expect(after.instanceCount(nodeId)).toBe(1);
    expect(after.rediscovery(nodeId)).toBe(false);
    // Unchanged: somebody else holding it is not the second mage rediscovering
    // a lost art, and `research()` would charge her exactly what it charged
    // before.
    expect(quoteFor(after, second, nodeId)).toBe(before);
  });

  it('still quotes the rediscovery price once the last copy is gone', () => {
    const { state, knowledge, gateway, mage, second } = twoMages();
    const nodeId = gateway.researchFrontier(second, 1)[0]?.nodeId ?? 0;
    const ordinary = quoteFor(gateway, second, nodeId);
    expect(ordinary).toBeGreaterThan(0);

    const instance = knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: 1024,
    });
    knowledge.destroyInstance(instance, 1);

    const after = buildGatewayOver(state, knowledge, gateway);
    expect(knowledge.wasEverKnown(nodeId)).toBe(true);
    expect(after.instanceCount(nodeId)).toBe(0);
    // And the gateway agrees, so goal selection buckets this one as a
    // rediscovery and the quote above prices it as one.
    expect(after.rediscovery(nodeId)).toBe(true);
    // Known once, now gone: the gap `contracts.md` prices at three times, and
    // the half of the old behaviour that was right.
    expect(quoteFor(after, second, nodeId)).toBeGreaterThan(ordinary as number);
  });
});

/**
 * **The candidacy gate on `practice`, pinned because a comment is not a test.**
 *
 * `practisableBy` offered any held node below `MASTERY_MAX`, and
 * `MASTERY_DECAY_PER_TICK` takes a point off every held instance every month —
 * so the condition was satisfied by every instance in the universe within a
 * month of acquiring it, and `practice` was feasible for every mage on every
 * tick forever. It also meant a mage could pay a whole month to practise a node
 * at `fp(1023)` and get **one point** back against the clamp.
 *
 * The gate is `DEFAULT_TEACH_THRESHOLD` now: practice is maintenance of teaching
 * *standing*, so it is offered to a scholar who has lost it and withdrawn from
 * one who has not. Nothing in the suite pinned the old boundary either, which is
 * how it survived to be measured in a two-century run instead of here.
 */
describe('practice is offered for lost standing, not for any imperfection', () => {
  /** A gateway whose mage holds `nodeId` at a stated mastery. */
  function holding(mastery: number) {
    const world = universeWithOneMage();
    const nodeId = world.gateway.researchFrontier(world.mage, 1)[0]?.nodeId;
    if (nodeId === undefined) throw new Error('the shipped catalog offers no frontier node');
    world.knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: world.mage,
      acquiredTick: 0,
      mastery,
    });
    // A fresh gateway over the mutated state: the instance was created after
    // `world.gateway` memoized its holdings, and this file's other tests take
    // the same step for the same reason.
    const gateway = buildGatewayOver(world.state, world.knowledge, world.gateway);
    return { gateway, nodeId, mage: world.mage };
  }

  it('offers a node held below the teaching threshold', () => {
    const { gateway, mage, nodeId } = holding(DEFAULT_TEACH_THRESHOLD - 1);
    const candidate = gateway.practisableBy(mage, nodeId);
    expect(candidate).toBeDefined();
    expect(candidate?.nodeId).toBe(nodeId);
    expect(candidate?.remainingCost).toBeGreaterThan(0);
  });

  it('withdraws the node the moment standing is regained', () => {
    // Exactly at the threshold is standing regained, not standing lost: this is
    // the same boundary `canTeach` reads, and the two must agree or a mage
    // practises to become able to teach and is then told she still cannot.
    const { gateway, mage, nodeId } = holding(DEFAULT_TEACH_THRESHOLD);
    expect(gateway.practisableBy(mage, nodeId)).toBeUndefined();
  });

  it('does not offer a nearly-perfect node, which the month could not pay for', () => {
    // The case that made the old gate expensive rather than merely permanent.
    const { gateway, mage, nodeId } = holding(1023);
    expect(gateway.practisableBy(mage, nodeId)).toBeUndefined();
  });

  it('offers nothing for a node the mage does not hold', () => {
    const { gateway, mage } = universeWithOneMage();
    const nodeId = gateway.researchFrontier(mage, 1)[0]?.nodeId;
    if (nodeId === undefined) throw new Error('the shipped catalog offers no frontier node');
    expect(gateway.practisableBy(mage, nodeId)).toBeUndefined();
  });
});
