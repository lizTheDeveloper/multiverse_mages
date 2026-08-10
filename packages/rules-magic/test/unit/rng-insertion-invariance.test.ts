/*
 * Multiverse Mages — adding a draw to one operation moves nobody else's rolls.
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
 * The property every committed balance baseline rests on.
 *
 * `contracts.md` §6: draws key on `(rootSeed, stream, tick, actorKey,
 * drawOrdinal)`, which gives **insertion invariance** — adding a mage, or
 * adding a draw, disturbs nobody else's rolls. Without it, an ablation run
 * diverges from its control for reasons unrelated to the ablated primitive, and
 * every attribution measurement the harness produces becomes noise. Nothing
 * fails when this breaks. The run stays deterministic, stays reproducible from
 * its seed, and passes every test that reruns the same scenario unchanged.
 *
 * So the check has to be adversarial: perturb one subsystem on purpose, and
 * demand the others are bit-identical.
 */

import { describe, expect, it } from 'vitest';

import { RNG_STREAM, nextUint32 } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import { research } from '../../src/instances/research.js';
import { STANDARD_STORE, scribe } from '../../src/instances/scribing.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { teach } from '../../src/instances/teaching.js';
import {
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SEED = 4242;
const TICK = 11;
const TEACHER = 100;
const STUDENT = 200;
const SCRIBE = 300;
const OTHER_TEACHER = 700;

function world(): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  for (const holder of [TEACHER, SCRIBE, OTHER_TEACHER]) {
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      acquiredTick: 0,
      mastery: 768,
    });
  }
  return knowledge;
}

const shared = {
  catalog: testCatalog(),
  cells: testCells,
  ruleset: permissiveRuleset(),
  worldTick: TICK,
};

/**
 * The RNG a step hands out, with one subsystem's operations drawing `extra`
 * values before the ones they use.
 *
 * This is how "a draw was added to research" is expressed without editing
 * `research.ts`: the operation derives its stream through this wrapper and
 * finds the cursor already advanced, which is bit-for-bit what an extra
 * `nextUint32` inside the function body would do. Advancing a *separately*
 * derived cursor would prove nothing at all — every derivation is independent,
 * so an outside draw cannot move an inside one, which is the very property
 * under test and cannot also be the test's method.
 */
function drawingMore(subsystemId: number, extra: number) {
  const base = stepRng(SEED, TICK);
  return {
    stream: (id: number) => base.stream(id),
    actorStream: (id: number, actorKey: number) => {
      const stream = base.actorStream(id, actorKey);
      if (id === subsystemId) {
        for (let i = 0; i < extra; i += 1) nextUint32(stream);
      }
      return stream;
    },
  };
}

function runTeaching(
  knowledge: KnowledgeSubsystem,
  teacher = TEACHER,
  student = STUDENT,
  rng = stepRng(SEED, TICK),
): number {
  return teach({ ...shared, knowledge, rng, teacher, student, nodeId: ROOT_NODE }).mastery;
}

function runScribing(knowledge: KnowledgeSubsystem, rng = stepRng(SEED, TICK)): number {
  return scribe({
    ...shared,
    knowledge,
    rng,
    scribe: SCRIBE,
    nodeId: ROOT_NODE,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 4096,
    materials: 4096,
  }).durability;
}

function runResearch(knowledge: KnowledgeSubsystem, rng = stepRng(SEED, TICK)): number {
  return research({
    ...shared,
    knowledge,
    rng,
    subject: TEACHER,
    nodeId: ROOT_NODE,
    progress: 0,
    effort: 1024,
    learnRate: 1024,
    researchRate: 1024,
    rediscoveryAffinity: 1024,
  }).progress;
}

describe('adding a draw to one knowledge operation', () => {
  it('leaves teaching and scribing bit-identical when research draws more', () => {
    const control = world();
    const controlTeaching = runTeaching(control);
    const controlScribing = runScribing(control);
    const controlResearch = runResearch(control);

    const perturbed = world();
    const rng = drawingMore(RNG_STREAM.research, 7);
    const perturbedResearch = runResearch(perturbed, rng);
    const perturbedTeaching = runTeaching(perturbed, TEACHER, STUDENT, rng);
    const perturbedScribing = runScribing(perturbed, rng);

    expect(perturbedTeaching).toBe(controlTeaching);
    expect(perturbedScribing).toBe(controlScribing);
    // The perturbation must be real, or the assertions above prove nothing.
    expect(perturbedResearch).not.toBe(controlResearch);
  });

  it('leaves research and scribing bit-identical when teaching draws more', () => {
    const control = world();
    const controlResearch = runResearch(control);
    const controlScribing = runScribing(control);
    const controlTeaching = runTeaching(control);

    const perturbed = world();
    const rng = drawingMore(RNG_STREAM.teaching, 5);
    expect(runResearch(perturbed, rng)).toBe(controlResearch);
    expect(runScribing(perturbed, rng)).toBe(controlScribing);
    expect(runTeaching(perturbed, TEACHER, STUDENT, rng)).not.toBe(controlTeaching);
  });

  it('leaves every other actor’s teaching unchanged when one is inserted', () => {
    const control = world();
    const alone = runTeaching(control, TEACHER, STUDENT);

    const crowded = world();
    // A second teacher, working first. Under a shared per-subsystem cursor this
    // would consume the draws the first teacher was going to get.
    runTeaching(crowded, OTHER_TEACHER, 800);
    expect(runTeaching(crowded, TEACHER, STUDENT)).toBe(alone);
  });

  it('keeps each stream a pure function of its own coordinates', () => {
    const rng = stepRng(SEED, TICK);
    const sample = (subsystemId: number, actorKey: number): number[] => {
      const stream = rng.actorStream(subsystemId, actorKey);
      return [nextUint32(stream), nextUint32(stream), nextUint32(stream)];
    };

    const teachingFirst = sample(RNG_STREAM.teaching, TEACHER);
    const researchStream = rng.actorStream(RNG_STREAM.research, TEACHER);
    for (let i = 0; i < 20; i += 1) nextUint32(researchStream);
    const teachingAfter = sample(RNG_STREAM.teaching, TEACHER);

    expect(teachingAfter).toEqual(teachingFirst);
    expect(sample(RNG_STREAM.scribing, TEACHER)).not.toEqual(teachingFirst);
    expect(sample(RNG_STREAM.teaching, OTHER_TEACHER)).not.toEqual(teachingFirst);
  });
});
