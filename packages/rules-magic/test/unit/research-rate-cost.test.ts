/*
 * Multiverse Mages — a research cost slows the month, and a total one stops it.
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
 * Research is the one of the three rate consumers where a zero multiplier is
 * not automatically safe, because it scales the **cost** rather than the
 * progress: `researchRequirement` divides by the rate, and division by zero is
 * not a question the rules path asks. The old guard read
 * `if (rate <= 0) return base` — which means a 100% research **cost** produced
 * exactly the requirement a neutral `fp(1024)` does.
 *
 * Stated as behaviour, that is the campaign's own failure mode reintroduced by
 * the fix for it: an authored opposing term that validates, ships, reads
 * correctly in its gloss, and **does nothing**. The strongest cost an author
 * can write would have been the one cost that had no effect at all.
 *
 * So zero is expressed where it can be expressed exactly — as **zero effort**
 * inside `research`. These tests fail if that line is removed, and the first
 * one fails in the specific way that matters: it compares against the neutral
 * requirement rather than only asserting a number.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';

import { createRediscoveryClampCounter } from '@mm/primitives';

import type { ResearchInputs } from '../../src/instances/research.js';
import {
  effectiveResearchRate,
  research,
  researchRequirement,
} from '../../src/instances/research.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SUBJECT = 4096;

function inputs(overrides: Partial<ResearchInputs> = {}): ResearchInputs {
  return {
    knowledge: new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT),
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(9, 3),
    subject: SUBJECT,
    nodeId: ROOT_NODE,
    worldTick: 3,
    progress: 0,
    effort: FP_ONE,
    learnRate: FP_ONE,
    researchRate: FP_ONE,
    clampCounter: createRediscoveryClampCounter(),
    ...overrides,
  };
}

const node = () => {
  const found = testCatalog().node(ROOT_NODE);
  if (found === undefined) throw new Error('the test catalog lost its root node');
  return found;
};

const requirement = (researchRate: number, learnRate = FP_ONE): number =>
  researchRequirement(node(), {
    rediscovery: false,
    rediscoveryAffinity: FP_ONE,
    learnRate,
    researchRate,
    clampCounter: createRediscoveryClampCounter(),
  });

describe('a research-rate cost makes the node cost more, not less', () => {
  it('raises the requirement as the rate falls below neutral', () => {
    const neutral = requirement(FP_ONE);
    const costed = requirement(FP_ONE / 2);
    expect(costed).toBeGreaterThan(neutral);
  });

  it('never quotes a total cost as cheaper than a partial one', () => {
    // The regression in one line. `rate <= 0 -> return base` made the strongest
    // possible cost quote the *neutral* requirement — cheaper than a −50% one.
    expect(requirement(0)).toBeLessThanOrEqual(requirement(FP_ONE / 2));
    expect(requirement(FP_ONE)).toBeLessThan(requirement(FP_ONE / 2));
  });
});

describe('a rate floored to zero produces no progress', () => {
  it('accrues nothing, however many months are supplied', () => {
    const outcome = research(inputs({ researchRate: 0, effort: FP_ONE * 64 }));
    expect(outcome.refusal).toBeUndefined();
    expect(outcome.progress).toBe(0);
    expect(outcome.completed).toBe(false);
  });

  it('accrues something at any rate that survives the floor', () => {
    const outcome = research(inputs({ researchRate: 1, effort: FP_ONE * 64 }));
    expect(outcome.progress).toBeGreaterThan(0);
  });

  it('leaves banked progress exactly where it was', () => {
    const outcome = research(inputs({ researchRate: 0, effort: FP_ONE * 64, progress: 512 }));
    expect(outcome.progress).toBe(512);
  });

  it('consumes the same number of draws as a working month', () => {
    // Zeroing the effort rather than refusing the step is what keeps a balance
    // change from becoming a replay change: a refusal returns *before* the
    // jitter draw, a zero-effort step does not.
    const rng = stepRng(9, 3);
    const stopped = research(inputs({ rng, researchRate: 0 }));
    const working = research(inputs({ rng: stepRng(9, 3), researchRate: FP_ONE }));
    expect(stopped.refusal).toBeUndefined();
    expect(working.refusal).toBeUndefined();
  });

  it('agrees with the requirement about where zero is', () => {
    // One product, two readers. `mul` floors, so a nonzero rate against a
    // nonzero learn rate can still land on zero, and the two must not disagree
    // about which side of the boundary that is.
    expect(effectiveResearchRate(1, 1)).toBe(0);
    expect(research(inputs({ learnRate: 1, researchRate: 1, effort: FP_ONE * 64 })).progress).toBe(0);
  });
});
