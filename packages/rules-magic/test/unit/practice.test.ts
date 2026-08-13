/*
 * Multiverse Mages — practice: mastery comes back, at a price, and never in a
 * forbidden cell.
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
 * The counterweight `decay.ts` named and nobody had written. Four of these are
 * refusals, and the forbidden-cell one is the load-bearing one: without it the
 * god's interdiction becomes reversible by the universe's own labour, which is
 * the recovery `decayedMastery`'s monotonicity clamp exists to close.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import {
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_MAX,
  PRACTICE_COST_PER_TIER,
  PRACTICE_MASTERY_RESTORE,
} from '../../src/instances/constants.js';
import { decayHeldKnowledge } from '../../src/instances/decay.js';
import { practice, practiceRequirement } from '../../src/instances/practice.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const HOLDER = 400;
const STRANGER = 401;
const RETENTION = 1024;

/** One mage holding one node at a stated mastery. */
function held(mastery: number): { knowledge: KnowledgeSubsystem; instance: number } {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const instance = knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: HOLDER,
    acquiredTick: 0,
    mastery,
  });
  return { knowledge, instance };
}

/** One step of practice by `HOLDER` on `ROOT_NODE`. */
function step(
  knowledge: KnowledgeSubsystem,
  options: {
    progress?: number;
    effort?: number;
    forbidden?: boolean;
    subject?: number;
    practiceRate?: number;
  } = {},
) {
  return practice({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: options.forbidden === true ? interdicting(HOME_CELL) : permissiveRuleset(),
    subject: options.subject ?? HOLDER,
    nodeId: ROOT_NODE,
    worldTick: 10,
    progress: options.progress ?? 0,
    effort: options.effort ?? 0,
    ...(options.practiceRate === undefined ? {} : { practiceRate: options.practiceRate }),
  });
}

describe('practice restores mastery, and it is the only thing that does', () => {
  it('gives back one quantum when the months are paid', () => {
    const { knowledge, instance } = held(256);
    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);

    const outcome = step(knowledge, { effort: required });

    expect(outcome.completed).toBe(true);
    expect(outcome.restored).toBe(PRACTICE_MASTERY_RESTORE);
    expect(knowledge.read(instance).mastery).toBe(256 + PRACTICE_MASTERY_RESTORE);
  });

  it('changes nothing until the requirement is met', () => {
    const { knowledge, instance } = held(256);
    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);

    const outcome = step(knowledge, { effort: required - 1 });

    expect(outcome.completed).toBe(false);
    expect(outcome.progress).toBe(required - 1);
    expect(knowledge.read(instance).mastery).toBe(256);
  });

  it('carries banked progress across steps, so a project finishes over months', () => {
    const { knowledge, instance } = held(256);
    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);
    const half = Math.floor(required / 2);

    const first = step(knowledge, { effort: half });
    expect(first.completed).toBe(false);
    const second = step(knowledge, { progress: first.progress, effort: required - half });

    expect(second.completed).toBe(true);
    expect(knowledge.read(instance).mastery).toBe(256 + PRACTICE_MASTERY_RESTORE);
  });

  it('clamps at full mastery rather than writing above it', () => {
    const { knowledge, instance } = held(MASTERY_MAX - 1);
    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);

    const outcome = step(knowledge, { effort: required });

    expect(outcome.restored).toBe(1);
    expect(knowledge.read(instance).mastery).toBe(MASTERY_MAX);
  });
});

describe('what practice refuses', () => {
  it('refuses a forbidden cell, so an interdiction cannot be practised away', () => {
    const { knowledge, instance } = held(64);
    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);

    const outcome = step(knowledge, { effort: required * 4, forbidden: true });

    expect(outcome.refusal?.reason).toBe('forbidden-cell');
    expect(outcome.completed).toBe(false);
    // The fragment is exactly where dormant decay left it. This is the property
    // `decay.ts` protects from the other side: recovering means keeping what
    // survived, not being handed back what was already lost.
    expect(knowledge.read(instance).mastery).toBe(64);
  });

  it('refuses a mage who does not hold the node', () => {
    const { knowledge } = held(256);
    const outcome = step(knowledge, { effort: 1e6, subject: STRANGER });
    expect(outcome.refusal?.reason).toBe('node-not-held');
  });

  it('refuses a node already at full mastery', () => {
    const { knowledge, instance } = held(MASTERY_MAX);
    const outcome = step(knowledge, { effort: 1e6 });
    expect(outcome.refusal?.reason).toBe('mastery-at-maximum');
    expect(knowledge.read(instance).mastery).toBe(MASTERY_MAX);
  });

  it('leaves banked progress alone on a refusal', () => {
    const { knowledge } = held(64);
    const outcome = step(knowledge, { progress: 512, effort: 4096, forbidden: true });
    expect(outcome.progress).toBe(512);
  });
});

describe('the price of keeping a node sharp', () => {
  it('scales with tier, so the fundamentals are cheap and the specialty is not', () => {
    const tierOne = practiceRequirement({ ...testCatalog().node(ROOT_NODE)!, tier: 1 });
    const tierSeven = practiceRequirement({ ...testCatalog().node(ROOT_NODE)!, tier: 7 });

    expect(tierOne).toBe(PRACTICE_COST_PER_TIER);
    expect(tierSeven).toBe(PRACTICE_COST_PER_TIER * 7);
  });

  it('falls as the practice rate rises, which is the seam the god reaches through', () => {
    const node = testCatalog().node(ROOT_NODE)!;
    // fp(2048) is a doubled rate: `libraryRateMultiplier` hands this channel a
    // stacked multiplier, and a deeper library or a cell encouragement is what
    // makes it larger than fp(1024).
    expect(practiceRequirement(node, 2048)).toBe(Math.floor(practiceRequirement(node) / 2));
  });

  it('treats a zero rate as a mage who cannot practise rather than one who practises instantly', () => {
    const node = testCatalog().node(ROOT_NODE)!;
    expect(practiceRequirement(node, 0)).toBe(practiceRequirement(node));
  });
});

describe('publish or perish, closed', () => {
  it('carries a scholar who fell below the teaching threshold back over it', () => {
    // Start where `ages-of-magic.md` §2c's 93.4% sit: held, alive, and no longer
    // able to supervise the subject.
    const { knowledge, instance } = held(DEFAULT_TEACH_THRESHOLD - 1);
    expect(knowledge.read(instance).mastery).toBeLessThan(DEFAULT_TEACH_THRESHOLD);

    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);
    let progress = 0;
    let projects = 0;
    while (knowledge.read(instance).mastery < DEFAULT_TEACH_THRESHOLD && projects < 100) {
      const outcome = step(knowledge, { progress, effort: required });
      progress = outcome.completed ? 0 : outcome.progress;
      if (outcome.completed) projects += 1;
    }

    expect(knowledge.read(instance).mastery).toBeGreaterThanOrEqual(DEFAULT_TEACH_THRESHOLD);
    // One project is not enough by construction: a quantum that restored
    // standing in a single completion would make publish-or-perish a formality.
    expect(projects).toBe(1);
  });

  it('races decay rather than outlawing it — practice adds, decay still subtracts', () => {
    const { knowledge, instance } = held(512);
    const required = practiceRequirement(testCatalog().node(ROOT_NODE)!);

    step(knowledge, { effort: required });
    const afterPractice = knowledge.read(instance).mastery;
    expect(afterPractice).toBe(512 + PRACTICE_MASTERY_RESTORE);

    decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset: permissiveRuleset(),
      elapsedTicks: 40,
      worldTick: 50,
      retentionOf: () => RETENTION,
    });

    // Decay is untouched by this change: it still runs, still monotone, still
    // floored at retention. Practice is a second force on the same number, not a
    // suspension of the first.
    expect(knowledge.read(instance).mastery).toBeLessThan(afterPractice);
  });
});
