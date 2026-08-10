/*
 * Multiverse Mages — research, rediscovery, and the 3× floor.
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

import { mul } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import { catalogOf } from '../../src/instances/catalog.js';
import { REDISCOVERY_MULTIPLIER_FLOOR } from '../../src/instances/constants.js';
import type { ResearchInputs } from '../../src/instances/research.js';
import {
  effectiveRediscoveryMultiplier,
  research,
  researchRequirement,
} from '../../src/instances/research.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  CHILD_NODE,
  CROSS_CELL_CHILD,
  HOME_CELL,
  OTHER_CELL,
  OTHER_CELL_NODE,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SUBJECT = 4096;
const FULL = 1024;

function fixture(): { knowledge: KnowledgeSubsystem } {
  return { knowledge: new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT) };
}

function inputs(
  knowledge: KnowledgeSubsystem,
  overrides: Partial<ResearchInputs> = {},
): ResearchInputs {
  return {
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(9, 3),
    subject: SUBJECT,
    nodeId: ROOT_NODE,
    worldTick: 3,
    progress: 0,
    effort: 0,
    learnRate: FULL,
    researchRate: FULL,
    rediscoveryAffinity: FULL,
    ...overrides,
  };
}

describe('research', () => {
  it('creates a mind instance when progress reaches the requirement', () => {
    const { knowledge } = fixture();
    const outcome = research(inputs(knowledge, { progress: 4096, effort: 1024 }));

    expect(outcome.refusal).toBeUndefined();
    expect(outcome.completed).toBe(true);
    expect(outcome.instance).not.toBe(0);
    const created = knowledge.read(outcome.instance);
    expect(created.locationKind).toBe(LOCATION_KIND.mind);
    expect(created.locationId).toBe(SUBJECT);
    expect(created.acquiredTick).toBe(3);
    expect(created.mastery).toBeGreaterThan(0);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });

  it('accumulates progress without completing, and carries it forward', () => {
    const { knowledge } = fixture();
    const first = research(inputs(knowledge, { progress: 0, effort: 512 }));
    expect(first.completed).toBe(false);
    expect(first.instance).toBe(0);
    expect(first.progress).toBeGreaterThan(0);
    expect(first.progress).toBeLessThan(first.required);

    const second = research(inputs(knowledge, { progress: first.progress, effort: 512 }));
    expect(second.progress).toBeGreaterThan(first.progress);
  });

  it('refuses an interdicted cell, naming it, and accumulates nothing', () => {
    const { knowledge } = fixture();
    const outcome = research(
      inputs(knowledge, { ruleset: interdicting(HOME_CELL), progress: 4096, effort: 4096 }),
    );

    expect(outcome.refusal).toEqual({
      reason: 'forbidden-cell',
      nodeId: ROOT_NODE,
      cellId: HOME_CELL,
    });
    expect(outcome.progress).toBe(4096);
    expect(outcome.instance).toBe(0);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  it('refuses an unheld prerequisite, naming it', () => {
    const { knowledge } = fixture();
    const outcome = research(
      inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 1024 }),
    );

    expect(outcome.refusal).toEqual({
      reason: 'unsatisfied-prerequisite',
      nodeId: CHILD_NODE,
      prerequisiteId: ROOT_NODE,
      subject: SUBJECT,
    });
    expect(outcome.instance).toBe(0);
  });

  it('accepts a prerequisite the subject holds, and refuses a dormant one', () => {
    const { knowledge } = fixture();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SUBJECT,
      acquiredTick: 0,
      mastery: FULL,
    });

    const held = research(inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 1024 }));
    expect(held.refusal).toBeUndefined();
    expect(held.completed).toBe(true);

    // Re-permitting is what restores it; a dormant instance satisfies nothing,
    // so a god cannot route research *through* their own interdiction.
    const dormant = research(
      inputs(knowledge, {
        nodeId: CHILD_NODE,
        progress: 99999,
        effort: 1024,
        ruleset: interdicting(HOME_CELL),
      }),
    );
    expect(dormant.refusal?.reason).toBe('forbidden-cell');
  });

  it('satisfies a prerequisite in another cell, and refuses when that cell is forbidden', () => {
    const { knowledge } = fixture();
    knowledge.createInstance({
      nodeId: OTHER_CELL_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SUBJECT,
      acquiredTick: 0,
      mastery: FULL,
    });

    const permitted = research(
      inputs(knowledge, { nodeId: CROSS_CELL_CHILD, progress: 99999, effort: 0 }),
    );
    expect(permitted.refusal).toBeUndefined();
    expect(permitted.completed).toBe(true);

    // The node's own cell stays permitted; only its prerequisite's is closed.
    // A god may not route research *through* their own interdiction.
    const routed = research(
      inputs(knowledge, {
        nodeId: CROSS_CELL_CHILD,
        progress: 99999,
        effort: 0,
        ruleset: interdicting(OTHER_CELL),
      }),
    );
    expect(routed.refusal).toEqual({
      reason: 'unsatisfied-prerequisite',
      nodeId: CROSS_CELL_CHILD,
      prerequisiteId: OTHER_CELL_NODE,
      subject: SUBJECT,
    });
  });

  it('throws on a node this content set does not declare', () => {
    const { knowledge } = fixture();
    expect(() => research(inputs(knowledge, { nodeId: 99 }))).toThrow(/No node with id 99/u);
  });

  it('draws its jitter from stream 3, so the same seed reproduces the step', () => {
    const { knowledge } = fixture();
    const once = research(inputs(knowledge, { effort: 1024, rng: stepRng(11, 3) }));
    const again = research(inputs(knowledge, { effort: 1024, rng: stepRng(11, 3) }));
    const elsewhere = research(inputs(knowledge, { effort: 1024, rng: stepRng(12, 3) }));

    expect(again.progress).toBe(once.progress);
    expect(elsewhere.progress).not.toBe(once.progress);
  });
});

describe('rediscovery', () => {
  const lostNode = (): KnowledgeSubsystem => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 55,
      acquiredTick: 0,
      mastery: FULL,
    });
    knowledge.destroyInstance(instance, 1);
    return knowledge;
  };

  it('costs the declared multiplier, and completion below it creates nothing', () => {
    const knowledge = lostNode();
    const required = mul(4096, mul(4096, FULL));

    const short = research(inputs(knowledge, { progress: required - 1, effort: 0 }));
    expect(short.rediscovery).toBe(true);
    expect(short.required).toBe(required);
    expect(short.completed).toBe(false);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);

    const enough = research(inputs(knowledge, { progress: required, effort: 0 }));
    expect(enough.completed).toBe(true);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
  });

  it('lets affinity differentiate above the floor', () => {
    const knowledge = lostNode();
    const gnomish = research(inputs(knowledge, { progress: 0, effort: 0, rediscoveryAffinity: 768 }));
    const ordinary = research(inputs(knowledge, { progress: 0, effort: 0, rediscoveryAffinity: FULL }));

    expect(gnomish.required).toBeLessThan(ordinary.required);
    expect(gnomish.required).toBeGreaterThanOrEqual(mul(4096, REDISCOVERY_MULTIPLIER_FLOOR));
    expect(ordinary.required).toBeGreaterThanOrEqual(mul(4096, REDISCOVERY_MULTIPLIER_FLOOR));
  });

  it('clamps to three times research cost however strong the affinity', () => {
    const knowledge = lostNode();
    const atTheFloor = catalogOf([
      {
        nodeId: ROOT_NODE,
        tier: 1,
        prerequisites: [],
        researchCost: 4096,
        teachCost: 1024,
        scribeCost: 2048,
        rediscoveryMultiplier: REDISCOVERY_MULTIPLIER_FLOOR,
      },
    ]);

    const outcome = research(
      inputs(knowledge, {
        catalog: atTheFloor,
        progress: 0,
        effort: 0,
        rediscoveryAffinity: 512,
      }),
    );

    expect(outcome.required).toBe(mul(4096, REDISCOVERY_MULTIPLIER_FLOOR));
    expect(outcome.required).toBe(4096 * 3);
  });

  it('never yields an effective multiplier below the floor, for any affinity', () => {
    for (const affinity of [1, 128, 512, 768, FULL, 2048]) {
      expect(effectiveRediscoveryMultiplier(REDISCOVERY_MULTIPLIER_FLOOR, affinity)).toBeGreaterThanOrEqual(
        REDISCOVERY_MULTIPLIER_FLOOR,
      );
      expect(effectiveRediscoveryMultiplier(8192, affinity)).toBeGreaterThanOrEqual(
        REDISCOVERY_MULTIPLIER_FLOOR,
      );
    }
  });

  it('charges ordinary research for a node this universe never knew', () => {
    const { knowledge } = fixture();
    const outcome = research(inputs(knowledge, { progress: 0, effort: 0 }));
    expect(outcome.rediscovery).toBe(false);
    expect(outcome.required).toBe(4096);
  });

  it('charges ordinary research while an instance still survives', () => {
    const { knowledge } = fixture();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 55,
      acquiredTick: 0,
      mastery: FULL,
    });

    const outcome = research(inputs(knowledge, { progress: 0, effort: 0 }));
    expect(outcome.rediscovery).toBe(false);
    expect(outcome.required).toBe(4096);
  });

  it('stays at three times the same subject’s ordinary cost at any rate', () => {
    // The claim is a *ratio*, not an absolute figure: learn rate scales the
    // requirement, so "three times research" means three times what research
    // would have cost this same subject. `div` floors, and floor(3x) is never
    // below 3·floor(x), so the ratio survives the rounding in both terms.
    const node = testCatalog().node(ROOT_NODE);
    expect(node).toBeDefined();

    for (const learnRate of [512, FULL, 2048]) {
      for (const researchRate of [768, FULL, 1536]) {
        const ordinary = researchRequirement(node!, {
          rediscovery: false,
          rediscoveryAffinity: FULL,
          learnRate,
          researchRate,
        });
        const rediscovered = researchRequirement(node!, {
          rediscovery: true,
          rediscoveryAffinity: 128,
          learnRate,
          researchRate,
        });
        expect(rediscovered).toBeGreaterThanOrEqual(ordinary * 3);
      }
    }
  });

  it('scales the requirement by learn rate and the stacked research-rate multiplier', () => {
    const node = testCatalog().node(ROOT_NODE);
    expect(node).toBeDefined();

    const slow = researchRequirement(node!, {
      rediscovery: false,
      rediscoveryAffinity: FULL,
      learnRate: 512,
      researchRate: FULL,
    });
    const quick = researchRequirement(node!, {
      rediscovery: false,
      rediscoveryAffinity: FULL,
      learnRate: 2048,
      researchRate: FULL,
    });

    expect(slow).toBeGreaterThan(4096);
    expect(quick).toBeLessThan(4096);
  });
});
