/*
 * Multiverse Mages — the raid economy: the portal's cooldown and the two faucets every universe has.
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
 * Playtest round 4 (main `0cc40e9c`): passage had no producer in most
 * universes, one god raided 46 times in a century because a raid cost no
 * tempo, and insight ran dry. These tests hold the three repairs at the
 * resolver, where a price is actually taken:
 *
 * - a paid portal starts `raid-cooldown-ticks` of recharge, the resolver
 *   refuses action 14 inside it **without charging**, and accepts it again on
 *   the tick it ends;
 * - a mage holding a permitted portal node at usable mastery keeps a threshold
 *   and yields passage, counted up to the cap;
 * - research the archive paid for yields insight.
 *
 * Each fails with its mechanism removed: no recharge row is written (the second
 * press is applied), `thresholdKeepers` counts nobody, or `tendedYield` yields
 * nothing.
 */

import { describe, expect, it } from 'vitest';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, TIME_MODE, rngFromRootSeed } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MATERIAL_STOCK,
  UNIVERSE,
  attachRecord,
  componentOf,
  defineWorldStateSchema,
  portalReadyTick,
  portalRechargeRemaining,
  readRulesetForObservation,
} from '@mm/state';
import { KnowledgeSubsystem, MASTERY_ACTIVATION_THRESHOLD } from '@mm/rules-magic';
import { MAGE_ROLE } from '@mm/state';
import type { InterventionDeps } from '../../src/index.js';
import { ACTION, resolveInterventions, tendedYield, thresholdKeepers } from '../../src/index.js';
import { catalogAndCells, registry } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const SCHEMA = defineWorldStateSchema([]);
const PORTAL_NODES = new Set(nodesCarrying('portal').keys());
const TEST_RNG = {
  rootSeed: 1,
  stream: (subsystemId: number) => rngFromRootSeed(1).stream(subsystemId, 0),
  actorStream: (subsystemId: number, actorKey: number) => rngFromRootSeed(1).actorStream(subsystemId, 0, actorKey),
};

interface Bench {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly mages: readonly EntityHandle[];
  readonly deps: InterventionDeps;
  readonly engagements: () => number;
}

/** A universe with `holders` mages holding a portal node at full mastery, and one raider. */
function bench(holders: number, mastery = FP_ONE): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000, mages: holders + 1 });
  const portalNode = [...PORTAL_NODES][0];
  if (portalNode === undefined) throw new Error('the shipped content carries no portal node');
  for (let index = 0; index < holders; index += 1) {
    attachRecord(world.state, KNOWLEDGE_INSTANCE, world.state.entities.create(), {
      nodeId: portalNode,
      locationKind: LOCATION_KIND.mind,
      locationId: world.mages[index] as EntityHandle,
      acquiredTick: 0,
      mastery,
    });
  }
  componentOf(world.state, MAGE).set(world.mages[holders] as EntityHandle, 'roleId', MAGE_ROLE.raider);
  const { catalog, cells } = catalogAndCells();
  let engagements = 0;
  const deps: InterventionDeps = {
    god: { constants: C, costs: COSTS },
    catalog,
    cells,
    knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
    edictBudgetMax: 8,
    portalNodes: PORTAL_NODES,
    invitableSpecies: new Set<number>(),
    speciesOf: () => undefined,
    rng: TEST_RNG,
    requestEngagement: () => {
      engagements += 1;
    },
  };
  return { state: world.state, universe: world.universe, mages: world.mages, deps, engagements: () => engagements };
}

function press(b: Bench, worldTick: number): ReturnType<typeof resolveInterventions> {
  return resolveInterventions(b.state, [{ kind: ACTION.openPortal, params: [1] }], worldTick, TIME_MODE.world, b.deps);
}

function favor(b: Bench): number {
  return componentOf(b.state, UNIVERSE).get(b.universe, 'favor');
}

function passage(b: Bench): number {
  return componentOf(b.state, MATERIAL_STOCK).get(b.universe, 'passage');
}

describe('a paid portal costs tempo: raid-cooldown-ticks before the next', () => {
  it('ships a cooldown of several world years', () => {
    // The constant is the claim: one raid per few years at most. Zero would be
    // the playtest's 46 raids a century again.
    expect(C.raidCooldownTicks).toBeGreaterThanOrEqual(24);
  });

  it('refuses action 14 inside the cooldown without charging, and accepts it the tick it ends', () => {
    const b = bench(1);
    expect(portalReadyTick(b.state, b.universe)).toBe(0);
    expect(press(b, 100).applied).toBe(1);
    expect(b.engagements()).toBe(1);
    expect(portalReadyTick(b.state, b.universe)).toBe(100 + C.raidCooldownTicks);

    // Every tick of the cooldown: refused, and neither currency moves.
    for (let tick = 101; tick < 100 + C.raidCooldownTicks; tick += 1) {
      const favorBefore = favor(b);
      const passageBefore = passage(b);
      const report = press(b, tick);
      expect(report.refused, `tick ${String(tick)}`).toBe(1);
      expect(favor(b)).toBe(favorBefore);
      expect(passage(b)).toBe(passageBefore);
      expect(portalRechargeRemaining(b.state, b.universe, tick)).toBe(100 + C.raidCooldownTicks - tick);
    }
    expect(b.engagements()).toBe(1);

    // The tick it ends.
    expect(press(b, 100 + C.raidCooldownTicks).applied).toBe(1);
    expect(b.engagements()).toBe(2);
  });

  it('starts no cooldown for a portal it refused', () => {
    // A god must never be made to wait for a raid that did not happen: the
    // recharge row is written inside the paid apply, never before it.
    const b = bench(1);
    componentOf(b.state, MATERIAL_STOCK).set(b.universe, 'passage', 0);
    expect(press(b, 50).refused).toBe(1);
    expect(portalReadyTick(b.state, b.universe)).toBe(0);
  });
});

describe('a kept threshold yields passage', () => {
  const { cells } = catalogAndCells();
  const weights = {
    portalNodes: PORTAL_NODES,
    usableMastery: MASTERY_ACTIVATION_THRESHOLD,
    passagePerKeeper: registry().autonomyWeight('passage-per-keeper'),
    maxKeepers: registry().autonomyWeight('passage-keepers-max'),
    researchInsightPerMonth: registry().autonomyWeight('research-insight-per-month'),
  };

  it('counts a living mage holding a permitted portal node at usable mastery', () => {
    const b = bench(3);
    const ruleset = readRulesetForObservation(b.state, b.universe);
    expect(thresholdKeepers(b.state, ruleset, cells, weights)).toBe(3);
  });

  it('does not count a holder below usable mastery, a dead one, or one in a forbidden cell', () => {
    const decayed = bench(2, MASTERY_ACTIVATION_THRESHOLD - 1);
    expect(thresholdKeepers(decayed.state, readRulesetForObservation(decayed.state, decayed.universe), cells, weights)).toBe(0);

    const dead = bench(1);
    componentOf(dead.state, MAGE).set(dead.mages[0] as EntityHandle, 'alive', 0);
    expect(thresholdKeepers(dead.state, readRulesetForObservation(dead.state, dead.universe), cells, weights)).toBe(0);

    const forbidden = bench(1);
    componentOf(forbidden.state, UNIVERSE).set(forbidden.universe, 'permittedForms', 0);
    expect(
      thresholdKeepers(forbidden.state, readRulesetForObservation(forbidden.state, forbidden.universe), cells, weights),
    ).toBe(0);
  });

  it('yields passage per keeper up to the cap, and insight per research month paid for', () => {
    expect(weights.passagePerKeeper).toBeGreaterThan(0);
    expect(weights.researchInsightPerMonth).toBeGreaterThan(0);
    expect(tendedYield(1, 0, weights).passage).toBe(weights.passagePerKeeper);
    expect(tendedYield(weights.maxKeepers + 5, 0, weights).passage).toBe(weights.maxKeepers * weights.passagePerKeeper);
    expect(tendedYield(0, 0, weights).passage).toBe(0);
    expect(tendedYield(0, 10 * FP_ONE, weights).insight).toBe(10 * weights.researchInsightPerMonth);
    // Nothing else: the faucets make passage and insight and no third kind.
    const both = tendedYield(2, FP_ONE, weights);
    expect(both.food + both.stone + both.vellum + both.labor + both.essence).toBe(0);
  });

  it('lets a universe with one keeper afford a portal within a generation', () => {
    // The design target: one raid every few years for a universe that invests
    // (several keepers), and a single keeper not shut out for good.
    const price = COSTS.materialByAction[ACTION.openPortal]?.passage ?? 0;
    expect(price).toBeGreaterThan(0);
    const ticksForOne = Math.ceil(price / weights.passagePerKeeper);
    const ticksForMax = Math.ceil(price / (weights.passagePerKeeper * weights.maxKeepers));
    expect(ticksForOne).toBeLessThanOrEqual(12 * 15);
    expect(ticksForMax).toBeLessThanOrEqual(C.raidCooldownTicks);
  });
});
