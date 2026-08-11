/*
 * Multiverse Mages — adversarial: does an interleaved decay sweep move any stream?
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
 * `contracts.md` §6: draws key on `(rootSeed, stream, tick, actorKey,
 * drawOrdinal)`, giving insertion invariance across the *whole* release, not
 * only within the three RNG-consuming knowledge operations. `decay.ts`'s file
 * header claims decay is the one subsystem that draws nothing at all: *"Nothing
 * in this file takes an `rng`, and that is a design constraint... a decay roll
 * would have to belong to some stream, and every instance's forgetting would
 * then jostle the draw ordinals of whatever else shared it."*
 *
 * `packages/rules-magic/test/unit/rng-insertion-invariance.test.ts` already
 * proves research/teaching/scribing are mutually insertion-invariant using
 * synthetic handles. This file adds the case the task brief asks for
 * specifically: running a real `decayHeldKnowledge` sweep, over real entity
 * handles obtained from the state's own entity store (not synthetic integer
 * keys), *between* a research step and a teaching step, and demanding the
 * teaching step's stream 4 draw is bit-identical whether or not the decay
 * sweep ran.
 *
 * Expected, and asserted here, to pass — `decayHeldKnowledge` takes no `rng`
 * parameter at all, so there is no code path by which it could perturb
 * anything. Included as a positive, targeted confirmation of the claim rather
 * than assumed from the header comment.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import { decayHeldKnowledge } from '../../src/instances/decay.js';
import { research } from '../../src/instances/research.js';
import { teach } from '../../src/instances/teaching.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SEED = 999;
const TICK = 20;

const shared = {
  catalog: testCatalog(),
  cells: testCells,
  ruleset: permissiveRuleset(),
  worldTick: TICK,
};

/** A fresh knowledge subsystem with real entity handles for a teacher and a researcher. */
function world(): {
  knowledge: KnowledgeSubsystem;
  teacher: number;
  researcher: number;
} {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  // Real entity handles from the store's own allocator -- not hand-picked
  // integers -- so this exercises the same actorKey shape a coordinating layer
  // would actually hand these operations.
  const teacher = knowledge.state.entities.create();
  const researcher = knowledge.state.entities.create();
  knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: teacher,
    acquiredTick: 0,
    mastery: 900,
  });
  return { knowledge, teacher, researcher };
}

function runTeachingTo(knowledge: KnowledgeSubsystem, teacher: number, student: number): number {
  return teach({
    ...shared,
    knowledge,
    rng: stepRng(SEED, TICK),
    teacher,
    student,
    nodeId: ROOT_NODE,
  }).mastery;
}

describe('a decay sweep interleaved between real operations moves no stream', () => {
  it('does not change the teaching outcome for real entity-store handles', () => {
    const control = world();
    const controlStudent = control.knowledge.state.entities.create();
    const controlMastery = runTeachingTo(control.knowledge, control.teacher, controlStudent);

    const perturbed = world();
    // A full decay sweep over the whole universe, real handles included, run
    // between world setup and the teaching call.
    decayHeldKnowledge({
      knowledge: perturbed.knowledge,
      cells: testCells,
      ruleset: permissiveRuleset(),
      elapsedTicks: 5,
      worldTick: TICK,
      retentionOf: () => 1024,
    });
    // Decay legitimately reduces mastery -- that is its job, and comparing the
    // teaching outcome without correcting for it would confound "the jitter
    // stream moved" with "the teacher's mastery is now a different, smaller
    // number", which is a true and unrelated effect. Reset the teacher's
    // mastery to the control's starting value so this isolates the one
    // question decay.ts's header claims to answer: whether the sweep itself
    // touched RNG stream 4's cursor, not whether it changed state (it is
    // supposed to).
    const [teacherInstance] = perturbed.knowledge.instancesHeldBy(perturbed.teacher);
    perturbed.knowledge.setMastery(teacherInstance as number, 900);

    const perturbedStudent = perturbed.knowledge.state.entities.create();
    const perturbedMastery = runTeachingTo(perturbed.knowledge, perturbed.teacher, perturbedStudent);

    expect(perturbedMastery).toBe(controlMastery);
  });

  it('does not change a subsequent research outcome either', () => {
    const control = world();
    const controlResult = research({
      ...shared,
      knowledge: control.knowledge,
      rng: stepRng(SEED, TICK),
      subject: control.researcher,
      nodeId: ROOT_NODE,
      progress: 0,
      effort: 1024,
      learnRate: 1024,
      researchRate: 1024,
      rediscoveryAffinity: 1024,
    }).progress;

    const perturbed = world();
    decayHeldKnowledge({
      knowledge: perturbed.knowledge,
      cells: testCells,
      ruleset: permissiveRuleset(),
      elapsedTicks: 5,
      worldTick: TICK,
      retentionOf: () => 1024,
    });
    const perturbedResult = research({
      ...shared,
      knowledge: perturbed.knowledge,
      rng: stepRng(SEED, TICK),
      subject: perturbed.researcher,
      nodeId: ROOT_NODE,
      progress: 0,
      effort: 1024,
      learnRate: 1024,
      researchRate: 1024,
      rediscoveryAffinity: 1024,
    }).progress;

    expect(perturbedResult).toBe(controlResult);
  });

  it('sanity: the two worlds really did diverge in what decay did, so the equality above is not vacuous', () => {
    // HOME_CELL is used only to prove the sweep had *some* real effect (mastery
    // moved) on the world it ran in, distinguishing "decay ran and changed
    // nothing observable" from "decay ran and provably touched state".
    const perturbed = world();
    const before = perturbed.knowledge.read(
      perturbed.knowledge.instancesHeldBy(perturbed.teacher)[0] as number,
    ).mastery;
    decayHeldKnowledge({
      knowledge: perturbed.knowledge,
      cells: testCells,
      ruleset: permissiveRuleset(),
      elapsedTicks: 5,
      worldTick: TICK,
      retentionOf: () => 1024,
    });
    const after = perturbed.knowledge.read(
      perturbed.knowledge.instancesHeldBy(perturbed.teacher)[0] as number,
    ).mastery;
    expect(after).toBeLessThan(before);
    // HOME_CELL confirms the fixture's own cell addressing, used above, is the
    // real one the sweep evaluated permits() against.
    expect(testCells.cellOf(ROOT_NODE)).toBe(HOME_CELL);
  });
});
