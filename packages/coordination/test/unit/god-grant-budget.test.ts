/*
 * Multiverse Mages — founding grants are scarce, not weak.
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
 * The budget's half of action 8, asserted against the dispatch.
 *
 * Two claims carry the design and each is checked here rather than described:
 *
 * 1. **The grant's shape is unchanged.** A grant inside budget is still a full
 *    instance at `grantMastery`. When this suite was written that was
 *    load-bearing twice over: `setMastery`'s only non-test caller was the decay
 *    pass and it lowers, so a granted instance was the universe's *one* source
 *    of knowledge above the teach threshold, and a budget that quietly weakened
 *    the grant would have deleted that source while appearing to ration it.
 *    `rules-magic`'s `practice` (`w196/mastery-rises`) is a second source now,
 *    so the assertion below is about the grant staying a gift rather than about
 *    it being the only thing keeping knowledge transmissible.
 * 2. **A universe with no budget row is unbounded.** Every world built before
 *    this component existed is such a world, and reading absence as a budget of
 *    zero would switch founding grants off for all of them at once.
 *
 * Refusals are asserted the way this suite asserts every refusal — the state is
 * unchanged, the favor pool is unchanged, and the illegal-action counter moved —
 * because any one of the three alone is satisfied by an implementation that is
 * wrong in a different way.
 */

import { describe, expect, it } from 'vitest';

import type { Action, EntityHandle, SimState } from '@mm/sim-core';
import { TIME_MODE, createState, rngFromRootSeed } from '@mm/sim-core';
import {
  EVER_KNOWN,
  GRANT_BUDGET,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  UNIVERSE,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  foundingGrantsRemaining,
  permits,
  readRecord,
  readRulesetForObservation,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import type { InterventionDeps } from '../../src/index.js';
import { ACTION, resolveInterventions } from '../../src/index.js';

import { catalogAndCells, registry } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const SCHEMA = defineWorldStateSchema();
const C = constants();
const COSTS = costs();

interface Bench {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly mages: readonly EntityHandle[];
  readonly deps: InterventionDeps;
}

/** A god world, optionally carrying a budget row. No row means no budget. */
/**
 * A tick-bound RNG for the resolver, which needs one only for action 16's
 * personality roll. Bound at tick 0: these benches resolve one action against a
 * hand-built world, and the tick a draw is keyed on is not what any of them
 * measures.
 */
const TEST_RNG = {
  rootSeed: 1,
  stream: (subsystemId: number) => rngFromRootSeed(1).stream(subsystemId, 0),
  actorStream: (subsystemId: number, actorKey: number) =>
    rngFromRootSeed(1).actorStream(subsystemId, 0, actorKey),
};

function bench(budget?: {
  startingGrants: number;
  accrualNodes?: number;
  cap?: number;
  seededNodes?: number;
}): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000, mages: 3 });
  const { catalog, cells } = catalogAndCells();
  const deps: InterventionDeps = {
    god: { constants: C, costs: COSTS },
    catalog,
    cells,
    knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
    edictBudgetMax: 8,
    portalNodes: new Set(nodesCarrying('portal').keys()),
    invitableSpecies: new Set<number>(),
    speciesOf: () => undefined,
    rng: TEST_RNG,
    requestEngagement: () => {},
  };
  if (budget !== undefined) {
    attachRecord(world.state, GRANT_BUDGET, world.universe, {
      startingGrants: budget.startingGrants,
      accrualNodes: budget.accrualNodes ?? 0,
      cap: budget.cap ?? 65_535,
      grantsUsed: 0,
      seededNodes: budget.seededNodes ?? 0,
    });
  }
  return { ...world, deps };
}

function resolve(b: Bench, actions: readonly Action[], worldTick = 0) {
  return resolveInterventions(b.state, actions, worldTick, TIME_MODE.world, b.deps);
}

function mage(b: Bench, index: number): EntityHandle {
  const handle = b.mages[index];
  if (handle === undefined) throw new Error(`the bench seeded no mage at index ${String(index)}`);
  return handle;
}

function favorOf(b: Bench): number {
  return componentOf(b.state, UNIVERSE).get(b.universe, 'favor');
}

function budgetRow(b: Bench) {
  return readRecord(b.state, GRANT_BUDGET, b.universe);
}

function instanceCount(b: Bench): number {
  return collectRecords(b.state, KNOWLEDGE_INSTANCE).length;
}

/** Prerequisite-free nodes in permitted cells, ascending. What a grant may name. */
function grantableNodes(b: Bench, count: number): number[] {
  const { catalog, cells } = catalogAndCells();
  const ruleset = readRulesetForObservation(b.state, b.universe);
  const found: number[] = [];
  for (let nodeId = 1; nodeId <= catalog.nodeCount && found.length < count; nodeId += 1) {
    const node = catalog.node(nodeId);
    if (node === undefined || node.prerequisites.length > 0) continue;
    if (!permits(ruleset, cells.cellOf(nodeId))) continue;
    found.push(nodeId);
  }
  if (found.length < count) {
    throw new Error(
      `the shipped content offers ${String(found.length)} prerequisite-free nodes in permitted ` +
        `cells and this test needs ${String(count)}`,
    );
  }
  return found;
}

const grant = (b: Bench, mageIndex: number, nodeId: number): Action => ({
  kind: ACTION.grantFoundingKnowledge,
  params: [mage(b, mageIndex), nodeId],
});

describe('a grant inside budget is the grant it always was', () => {
  it('is still a full instance at grantMastery — scarce, not weak', () => {
    // The claim the whole design turns on. If a budget shipped alongside a
    // weakened grant, the universe would lose its only source of teachable
    // knowledge and the loss would read as a tuning result.
    const b = bench({ startingGrants: 2 });
    const [nodeId] = grantableNodes(b, 1) as [number];
    resolve(b, [grant(b, 0, nodeId)]);

    const instances = collectRecords(b.state, KNOWLEDGE_INSTANCE).filter(
      ({ row }) => row.nodeId === nodeId,
    );
    expect(instances).toHaveLength(1);
    expect(instances[0]?.row.mastery).toBe(C.grantMastery);
    expect(instances[0]?.row.locationKind).toBe(LOCATION_KIND.mind);
    expect(instances[0]?.row.locationId).toBe(mage(b, 0));
  });

  it('charges one grant against the ledger and records the node it seeded', () => {
    const b = bench({ startingGrants: 2 });
    const [nodeId] = grantableNodes(b, 1) as [number];
    resolve(b, [grant(b, 0, nodeId)]);
    expect(budgetRow(b).grantsUsed).toBe(1);
    expect(budgetRow(b).seededNodes).toBe(1);
    expect(foundingGrantsRemaining(b.state, b.universe)).toBe(1);
  });
});

describe('the budget runs out, and the rules refuse rather than overspend', () => {
  it('refuses the grant after the allowance is gone', () => {
    const b = bench({ startingGrants: 1 });
    const [first, second] = grantableNodes(b, 2) as [number, number];

    expect(resolve(b, [grant(b, 0, first)]).refused).toBe(0);
    const favorBefore = favorOf(b);
    const instancesBefore = instanceCount(b);

    const report = resolve(b, [grant(b, 1, second)]);
    expect(report.refused).toBe(1);
    expect(favorOf(b)).toBe(favorBefore);
    expect(instanceCount(b)).toBe(instancesBefore);
    expect(budgetRow(b).grantsUsed).toBe(1);
  });

  it('refuses every grant at an allowance of zero — the pure-discovery control', () => {
    const b = bench({ startingGrants: 0 });
    const [nodeId] = grantableNodes(b, 1) as [number];
    const favorBefore = favorOf(b);

    expect(resolve(b, [grant(b, 0, nodeId)]).refused).toBe(1);
    expect(favorOf(b)).toBe(favorBefore);
    expect(instanceCount(b)).toBe(0);
  });

  it('refuses for the budget even when everything else about the grant is legal', () => {
    // The control that separates "the budget refused it" from "some other
    // precondition did": the same action against the same node succeeds the
    // moment the allowance is raised, and nothing else about the world moves.
    const zero = bench({ startingGrants: 0 });
    const [nodeId] = grantableNodes(zero, 1) as [number];
    expect(resolve(zero, [grant(zero, 0, nodeId)]).refused).toBe(1);

    const one = bench({ startingGrants: 1 });
    expect(resolve(one, [grant(one, 0, nodeId)]).refused).toBe(0);
  });
});

describe('accrual is earned by the mages, not by the god', () => {
  it('opens a further grant once the universe has discovered enough on its own', () => {
    const b = bench({ startingGrants: 1, accrualNodes: 2 });
    expect(foundingGrantsRemaining(b.state, b.universe)).toBe(1);

    // Two nodes the universe found for itself: not grants, so not `seededNodes`.
    for (const nodeId of [901, 902]) {
      attachRecord(b.state, EVER_KNOWN, b.state.entities.create(), { nodeId });
    }
    expect(foundingGrantsRemaining(b.state, b.universe)).toBe(2);
  });

  it('does not credit the god for the node its own grant introduced', () => {
    // The loop `seededNodes` exists to break: without it, a grant makes a node
    // ever-known, the accrual reads that as a discovery, and a budget of one
    // with an accrual of one is a budget of infinity.
    const b = bench({ startingGrants: 1, accrualNodes: 1 });
    const [nodeId] = grantableNodes(b, 1) as [number];
    resolve(b, [grant(b, 0, nodeId)]);

    expect(budgetRow(b).seededNodes).toBe(1);
    expect(foundingGrantsRemaining(b.state, b.universe)).toBe(0);
  });

  it('does not count a re-seeded node twice, because it seeded nothing new', () => {
    // A node the universe once held and lost is already ever-known, so granting
    // it again introduces nothing. Crediting it would let a god inflate the very
    // count its own accrual is measured against.
    const b = bench({ startingGrants: 2, accrualNodes: 4 });
    const [nodeId] = grantableNodes(b, 1) as [number];

    resolve(b, [grant(b, 0, nodeId)]);
    expect(budgetRow(b).seededNodes).toBe(1);

    // Lose the instance through the subsystem that owns loss, so the node stays
    // ever-known — which is the whole situation being tested — and then re-grant.
    for (const instance of b.deps.knowledge.instancesOf(nodeId)) {
      b.deps.knowledge.destroyInstance(instance, 1);
    }
    expect(b.deps.knowledge.instanceCount(nodeId)).toBe(0);
    expect(b.deps.knowledge.wasEverKnown(nodeId)).toBe(true);
    resolve(b, [grant(b, 1, nodeId)], 1);

    expect(budgetRow(b).grantsUsed).toBe(2);
    expect(budgetRow(b).seededNodes).toBe(1);
  });
});

describe('a universe carrying no budget row is unbounded', () => {
  it('grants as many times as favor allows, exactly as it did before the budget existed', () => {
    const b = bench();
    const nodes = grantableNodes(b, 3);
    for (const [index, nodeId] of nodes.entries()) {
      expect(resolve(b, [grant(b, index % 3, nodeId)], index).refused).toBe(0);
    }
    expect(instanceCount(b)).toBe(nodes.length);
    expect(componentOf(b.state, GRANT_BUDGET).size).toBe(0);
  });

  it('writes no ledger into a world that declined to have one', () => {
    // Half a ledger in a budget-less world would turn "no budget" into "a budget
    // of zero" the moment anything created the row.
    const b = bench();
    const [nodeId] = grantableNodes(b, 1) as [number];
    resolve(b, [grant(b, 0, nodeId)]);
    expect(componentOf(b.state, GRANT_BUDGET).has(b.universe)).toBe(false);
  });
});

describe('the state schema carries the budget', () => {
  it('declares grant-budget, so a fresh world can hold one', () => {
    const state = createState({
      rootSeed: 1,
      schema: SCHEMA,
      contentRevision: registry().contentRevision,
    });
    expect(componentOf(state, GRANT_BUDGET).size).toBe(0);
  });
});
