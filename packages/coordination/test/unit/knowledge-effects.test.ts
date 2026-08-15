/*
 * Multiverse Mages — a universe's own held knowledge now has world-scale
 * consequences.
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
 * The negative control this whole workstream exists to fix: before
 * `knowledge-effects.ts`, `gatherEffects` and `stackContributions`
 * (`@mm/rules-magic`) had zero production callers, so a mage holding a
 * `research-rate` node got nothing from it. The first `describe` block below
 * is the test that would have caught that — a universe holding the node
 * researches strictly faster than one that does not, through the exact
 * `knowledgeEffectHooks` → `WorldStepDeps.knowledgeEffectsFor` seam
 * `world-step.ts` now reads.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import { findUniverse } from '@mm/state';
import { KnowledgeSubsystem, MagicGrid, catalogFromRegistry } from '@mm/rules-magic';
import { ClampCounters, combineControls } from '@mm/primitives';
import { capitalRateMultiplier, primitiveFloor } from '@mm/rules-world';

import { knowledgeEffectHooks } from '../../src/knowledge-effects.js';
import type { KnowledgeEffectDeps } from '../../src/knowledge-effects.js';

import {
  addSyntheticNode,
  inMind,
  internedNodeId,
  registryWith,
  seedUniverse,
  worldState,
} from './knowledge-effects-fixtures.js';

/** Builds the deps `knowledgeEffectHooks` takes, over one mutated registry. */
function depsFor(mutate: Parameters<typeof registryWith>[0]): KnowledgeEffectDeps {
  const registry = registryWith(mutate);
  const catalog = catalogFromRegistry(registry);
  const cells = MagicGrid.from(registry);
  return {
    registry,
    cells,
    knowledgeFor: (state: SimState) => KnowledgeSubsystem.fromState(state, catalog.nodeCount),
  };
}

describe('a universe holding a research-rate node researches measurably faster', () => {
  it('produces a strictly higher research-rate multiplier than one holding nothing', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-boost', {
        primitive: 'research-rate',
        magnitude: 256,
        mode: 'create',
        target: 'universe',
      });
    });
    const nodeId = internedNodeId(deps.registry, 'kn-research-boost');
    const researchRate = deps.registry.primitives.find((entry) => entry.record.id === 'research-rate')?.record;
    if (researchRate === undefined) throw new Error('research-rate missing from the fixture registry');

    const idle = worldState(1);
    seedUniverse(idle, deps.registry);
    const idleEffects = knowledgeEffectHooks(deps).knowledgeEffectsFor(idle, 0);
    expect(idleEffects.researchRateBonuses).toEqual([]);

    const learned = worldState(2);
    const learnedUniverse = seedUniverse(learned, deps.registry);
    inMind(learned, learnedUniverse, nodeId);
    const learnedEffects = knowledgeEffectHooks(deps).knowledgeEffectsFor(learned, 0);
    expect(learnedEffects.researchRateBonuses).toEqual([256]);

    const idleRate = capitalRateMultiplier(researchRate, idleEffects.researchRateBonuses, 0).multiplier;
    const learnedRate = capitalRateMultiplier(researchRate, learnedEffects.researchRateBonuses, 0).multiplier;
    expect(idleRate).toBe(FP_ONE);
    expect(learnedRate).toBeGreaterThan(idleRate);
  });

  it('contributes nothing below the mastery activation threshold', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-unlearned', {
        primitive: 'research-rate',
        magnitude: 256,
        mode: 'create',
        target: 'universe',
      });
    });
    const nodeId = internedNodeId(deps.registry, 'kn-research-unlearned');
    const state = worldState(3);
    const universe = seedUniverse(state, deps.registry);
    inMind(state, universe, nodeId, 0); // freshly learned, below MASTERY_ACTIVATION_THRESHOLD
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);
    expect(effects.researchRateBonuses).toEqual([]);
  });
});

describe('a remove-mode world effect lowers a rate', () => {
  it('produces a strictly lower research-rate multiplier than the create-only universe', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-boost', {
        primitive: 'research-rate',
        magnitude: 512,
        mode: 'create',
        target: 'universe',
      });
      addSyntheticNode(documents, 'kn-research-drain', {
        primitive: 'research-rate',
        magnitude: 200,
        mode: 'remove',
        target: 'universe',
      });
    });
    const boostId = internedNodeId(deps.registry, 'kn-research-boost');
    const drainId = internedNodeId(deps.registry, 'kn-research-drain');
    const researchRate = deps.registry.primitives.find((entry) => entry.record.id === 'research-rate')?.record;
    if (researchRate === undefined) throw new Error('research-rate missing from the fixture registry');

    const blessedOnly = worldState(4);
    const blessedUniverse = seedUniverse(blessedOnly, deps.registry);
    inMind(blessedOnly, blessedUniverse, boostId);
    const blessedEffects = knowledgeEffectHooks(deps).knowledgeEffectsFor(blessedOnly, 0);
    expect(blessedEffects.researchRateBonuses).toEqual([512]);

    const blessedAndDrained = worldState(5);
    const drainedUniverse = seedUniverse(blessedAndDrained, deps.registry);
    inMind(blessedAndDrained, drainedUniverse, boostId);
    inMind(blessedAndDrained, drainedUniverse, drainId);
    const drainedEffects = knowledgeEffectHooks(deps).knowledgeEffectsFor(blessedAndDrained, 0);
    // The signed-magnitude lookup: `remove` contributes `-magnitude`, not the
    // raw authored (always-positive) value.
    expect(drainedEffects.researchRateBonuses).toEqual([512, -200]);

    const blessedRate = capitalRateMultiplier(researchRate, blessedEffects.researchRateBonuses, 0).multiplier;
    const drainedRate = capitalRateMultiplier(researchRate, drainedEffects.researchRateBonuses, 0).multiplier;
    expect(drainedRate).toBeLessThan(blessedRate);
    expect(drainedRate).toBe(FP_ONE + 512 - 200);
  });
});

describe('a control effect gates a rate without joining its magnitude', () => {
  it('a floor holds the rate up above what its bonuses alone would produce', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-floor', {
        primitive: 'research-rate',
        magnitude: 1,
        mode: 'control',
        target: 'universe',
        control: { floor: 2048 },
      });
    });
    const nodeId = internedNodeId(deps.registry, 'kn-research-floor');
    const researchRate = deps.registry.primitives.find((entry) => entry.record.id === 'research-rate')?.record;
    if (researchRate === undefined) throw new Error('research-rate missing from the fixture registry');

    const state = worldState(6);
    const universe = seedUniverse(state, deps.registry);
    inMind(state, universe, nodeId);
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);

    // The control effect contributes no magnitude of its own.
    expect(effects.researchRateBonuses).toEqual([]);
    expect(effects.controlFor('research-rate')).toEqual({ floor: 2048 });

    const withoutClamp = capitalRateMultiplier(researchRate, effects.researchRateBonuses, 0).multiplier;
    expect(withoutClamp).toBe(FP_ONE); // no bonuses at all, unclamped

    const clamped = capitalRateMultiplier(
      researchRate,
      effects.researchRateBonuses,
      0,
      undefined,
      effects.controlFor('research-rate'),
    ).multiplier;
    expect(clamped).toBe(2048);
    expect(clamped).toBeGreaterThan(withoutClamp);
  });

  it('a ceiling holds the rate down below what its bonuses alone would produce', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-boost', {
        primitive: 'research-rate',
        magnitude: 512,
        mode: 'create',
        target: 'universe',
      });
      addSyntheticNode(documents, 'kn-research-ceiling', {
        primitive: 'research-rate',
        magnitude: 1,
        mode: 'control',
        target: 'universe',
        control: { ceiling: 1200 },
      });
    });
    const boostId = internedNodeId(deps.registry, 'kn-research-boost');
    const ceilingId = internedNodeId(deps.registry, 'kn-research-ceiling');
    const researchRate = deps.registry.primitives.find((entry) => entry.record.id === 'research-rate')?.record;
    if (researchRate === undefined) throw new Error('research-rate missing from the fixture registry');

    const state = worldState(7);
    const universe = seedUniverse(state, deps.registry);
    inMind(state, universe, boostId);
    inMind(state, universe, ceilingId);
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);

    expect(effects.researchRateBonuses).toEqual([512]);
    expect(effects.controlFor('research-rate')).toEqual({ ceiling: 1200 });

    const unclamped = capitalRateMultiplier(researchRate, effects.researchRateBonuses, 0).multiplier;
    expect(unclamped).toBe(FP_ONE + 512);

    const clamped = capitalRateMultiplier(
      researchRate,
      effects.researchRateBonuses,
      0,
      undefined,
      effects.controlFor('research-rate'),
    ).multiplier;
    expect(clamped).toBe(1200);
    expect(clamped).toBeLessThan(unclamped);
  });

  it('combines two control sources through combineControls, tightest bound winning', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-control-a', {
        primitive: 'research-rate',
        magnitude: 1,
        mode: 'control',
        target: 'universe',
        control: { floor: 1500 },
      });
      addSyntheticNode(documents, 'kn-control-b', {
        primitive: 'research-rate',
        magnitude: 1,
        mode: 'control',
        target: 'universe',
        control: { floor: 1800 },
      });
    });
    const aId = internedNodeId(deps.registry, 'kn-control-a');
    const bId = internedNodeId(deps.registry, 'kn-control-b');

    const state = worldState(8);
    const universe = seedUniverse(state, deps.registry);
    inMind(state, universe, aId);
    inMind(state, universe, bId);
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);

    expect(effects.controlFor('research-rate')).toEqual(combineControls([{ floor: 1500 }, { floor: 1800 }]));
    expect(effects.controlFor('research-rate')).toEqual({ floor: 1800 });
  });
});

describe('the primitive floor stops a Perdo stack driving a rate to zero', () => {
  it('holds the rate at the authored floor rather than at zero or negative', () => {
    const deps = depsFor((documents) => {
      for (let index = 0; index < 3; index += 1) {
        addSyntheticNode(documents, `kn-research-perdo-${String(index)}`, {
          primitive: 'research-rate',
          magnitude: 500,
          mode: 'remove',
          target: 'universe',
        });
      }
    });
    const researchRate = deps.registry.primitives.find((entry) => entry.record.id === 'research-rate')?.record;
    if (researchRate === undefined) throw new Error('research-rate missing from the fixture registry');
    const floor = primitiveFloor(researchRate);
    expect(floor).toBeDefined();

    const state = worldState(9);
    const universe = seedUniverse(state, deps.registry);
    for (let index = 0; index < 3; index += 1) {
      inMind(state, universe, internedNodeId(deps.registry, `kn-research-perdo-${String(index)}`));
    }
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);
    expect(effects.researchRateBonuses).toEqual([-500, -500, -500]);

    // Unfloored: `1024 - 1500 = -476`. A negative research-rate multiplier is
    // exactly the division hazard `primitive.json`'s `floor` exists to stop.
    const counters = new ClampCounters();
    const outcome = capitalRateMultiplier(researchRate, effects.researchRateBonuses, 0, counters);
    expect(outcome.multiplier).toBe(floor);
    expect(outcome.multiplier).toBeGreaterThan(0);
    expect(counters.count('research-rate')).toBeGreaterThan(0);
  });
});

describe('the WeakMap cache', () => {
  it('returns the same answer twice for one state, and a fresh answer for a clone', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-boost', {
        primitive: 'research-rate',
        magnitude: 256,
        mode: 'create',
        target: 'universe',
      });
    });
    const nodeId = internedNodeId(deps.registry, 'kn-research-boost');
    const state = worldState(10);
    const universe = seedUniverse(state, deps.registry);
    inMind(state, universe, nodeId);

    const hooks = knowledgeEffectHooks(deps);
    const first = hooks.knowledgeEffectsFor(state, 0);
    const second = hooks.knowledgeEffectsFor(state, 0);
    expect(second).toBe(first); // identity, not merely equality — the WeakMap hit

    const cloned = state.clone();
    const third = hooks.knowledgeEffectsFor(cloned, 0);
    expect(third).not.toBe(first); // a new state is a new key
    expect(third.researchRateBonuses).toEqual(first.researchRateBonuses); // same content, fresh object

    // A different tick against the same state object is also a fresh build,
    // not a stale hit against the previous tick's answer.
    const fourth = hooks.knowledgeEffectsFor(state, 1);
    expect(fourth).not.toBe(first);
  });

  it('finds no universe as the all-empty answer rather than throwing', () => {
    const deps = depsFor(() => {
      /* no mutation needed */
    });
    const state = worldState(11); // no createUniverse call at all
    expect(findUniverse(state)).toBe(0);
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);
    expect(effects.researchRateBonuses).toEqual([]);
    expect(effects.teachRateBonuses).toEqual([]);
    expect(effects.resourceYieldBonuses).toEqual([]);
    expect(effects.fertilityBonuses).toEqual([]);
    expect(effects.scribeRateBonuses).toEqual([]);
    expect(effects.lifespanBonuses).toEqual([]);
    expect(effects.controlFor('research-rate')).toEqual({});
  });
});

describe('a target: "self" effect is not this file\'s business', () => {
  it('does not appear in the world-scale bonuses', () => {
    const deps = depsFor((documents) => {
      addSyntheticNode(documents, 'kn-research-self', {
        primitive: 'research-rate',
        magnitude: 256,
        mode: 'create',
        target: 'self',
      });
    });
    const nodeId = internedNodeId(deps.registry, 'kn-research-self');
    const state = worldState(12);
    const universe = seedUniverse(state, deps.registry);
    inMind(state, universe, nodeId);
    const effects = knowledgeEffectHooks(deps).knowledgeEffectsFor(state, 0);
    expect(effects.researchRateBonuses).toEqual([]);
  });
});
