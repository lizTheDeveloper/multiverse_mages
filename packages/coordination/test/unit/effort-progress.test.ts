/*
 * Multiverse Mages — progress outlives a goal switch, and a mage resumes what
 * she set down.
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
 * The claim this file exists for is the one the whole component was added to
 * make true: **a mage bumped off a project by hysteresis and returning to it
 * later resumes rather than restarts.** That is asserted directly, against a
 * control that shows what the rejected design would have cost — storing progress
 * on the goal commitment, where a switch takes it with it.
 *
 * The rng here is pinned to one tick on purpose. A month's research is jittered
 * from stream 3 keyed on `(tick, subject)`, so two runs that spend the same
 * months at different ticks legitimately differ by a month; holding the tick
 * fixed makes each month's increment identical and turns "she resumed" into an
 * exact equality rather than an inequality with slack in it.
 */

import { describe, expect, it } from 'vitest';

import type { KnowledgeRng } from '@mm/rules-magic';
import { KnowledgeSubsystem } from '@mm/rules-magic';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { createState, rngFromRootSeed } from '@mm/sim-core';
import {
  EFFORT_KIND,
  EFFORT_PROGRESS,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  attachRecord,
  captureRuleset,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';

import type { MaterialsAccess } from '../../src/index.js';
import {
  CoordinatingKnowledgeGateway,
  EffortLedger,
  MAX_EFFORTS_PER_MAGE,
  effortKey,
} from '../../src/index.js';

import {
  catalogAndCells,
  registry,
  scribingTraditionId,
  shippedAcquirePolicy,
  shippedStorePolicy,
  speciesTable,
} from './world-fixtures.js';

const ROOT_SEED = 0x0eff_0001;
/** A quarter of a mage-month per call, so a project takes enough steps to interrupt. */
const SLICE = 256;

interface Laboratory {
  readonly state: SimState;
  readonly knowledge: KnowledgeSubsystem;
  readonly efforts: EffortLedger;
  readonly mages: readonly EntityHandle[];
  /** A fresh gateway, as every phase of the world loop builds one. */
  readonly gateway: () => CoordinatingKnowledgeGateway;
  readonly materialsSpent: () => number;
}

/** The step RNG, pinned to one tick. See the module note. */
function pinnedRng(rootSeed: number): KnowledgeRng {
  const source = rngFromRootSeed(rootSeed);
  return {
    stream: (subsystemId) => source.stream(subsystemId, 0),
    actorStream: (subsystemId, actorKey) => source.actorStream(subsystemId, 0, actorKey),
  };
}

/** A universe with `mageCount` mages of the first shipped species, and nothing else. */
function laboratory(mageCount = 2, rootSeed = ROOT_SEED): Laboratory {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf, ids } = speciesTable();
  const speciesId = ids[0] as number;
  const species = speciesOf(speciesId);
  if (species === undefined) throw new Error('the shipped registry declares no species');
  // A tradition that writes things down: this file exercises scribing, and under
  // the Art of Memory the honest answer is that no book is ever written.
  const traditionId = scribingTraditionId();

  const state = createState({
    rootSeed,
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
    materials: 10_000 * 1024,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });

  const mages: EntityHandle[] = [];
  for (let index = 0; index < mageCount; index += 1) {
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
    mages.push(mage);
  }

  const knowledge = KnowledgeSubsystem.fromState(state, catalog.nodeCount);
  const efforts = new EffortLedger(state);
  const ruleset = captureRuleset(state, universe);

  let spent = 0;
  const materials: MaterialsAccess = {
    available: () => 10_000 * 1024 - spent,
    consume: (amount) => {
      spent += amount;
    },
  };

  return {
    state,
    knowledge,
    efforts,
    mages,
    materialsSpent: () => spent,
    gateway: () =>
      new CoordinatingKnowledgeGateway({
        state,
        knowledge,
        catalog,
        cells,
        ruleset,
        ratesOf: () => ({
          learnRate: species.learnRate,
          rediscoveryAffinity: species.rediscoveryAffinity,
          depthCeiling: species.depthCeiling,
          scribeAffinity: species.scribeAffinity,
        }),
        store: shippedStorePolicy(traditionId),
        acquire: shippedAcquirePolicy(traditionId),
        effort: efforts,
        rng: pinnedRng(rootSeed),
        materials,
      }),
  };
}

/** The two cheapest nodes this mage could begin now, as `[project, distraction]`. */
function twoTargets(lab: Laboratory, mage: EntityHandle): [number, number] {
  const frontier = lab.gateway().researchFrontier(mage, 4);
  const first = frontier[0]?.nodeId;
  const second = frontier[1]?.nodeId;
  if (first === undefined || second === undefined) {
    throw new Error('the shipped catalog offers fewer than two openable nodes');
  }
  return [first, second];
}

/** Spends one slice on a node, through a gateway built fresh for the "phase". */
function spendOn(lab: Laboratory, mage: EntityHandle, nodeId: number): void {
  lab.gateway().contributeResearch(mage, nodeId, SLICE);
}

/** How many slices this mage still needs on `nodeId`, from wherever she is now. */
function slicesToFinish(lab: Laboratory, mage: EntityHandle, nodeId: number): number {
  for (let spent = 1; spent <= 200; spent += 1) {
    spendOn(lab, mage, nodeId);
    if (lab.gateway().knows(mage, nodeId)) return spent;
  }
  throw new Error('research did not complete within 200 slices; the fixture is not researching');
}

describe('progress survives a goal switch', () => {
  it('resumes a set-down project instead of restarting it', () => {
    // Three slices in, distracted onto another node for two, then back. The
    // detour is exactly what hysteresis does to a mage: `select.ts` rewrites her
    // commitment, and nothing in that path touches this component.
    const detoured = laboratory();
    const mage = detoured.mages[0] as EntityHandle;
    const [project, distraction] = twoTargets(detoured, mage);

    for (let slice = 0; slice < 3; slice += 1) spendOn(detoured, mage, project);
    const banked = detoured.efforts.progressOf(
      effortKey(EFFORT_KIND.research, mage, project, 0),
    );
    expect(banked).toBeGreaterThan(0);

    for (let slice = 0; slice < 2; slice += 1) spendOn(detoured, mage, distraction);
    expect(
      detoured.efforts.progressOf(effortKey(EFFORT_KIND.research, mage, project, 0)),
    ).toBe(banked);

    // The same mage in an untouched universe, never distracted.
    const straight = laboratory();
    const twin = straight.mages[0] as EntityHandle;
    const [sameProject] = twoTargets(straight, twin);
    expect(sameProject).toBe(project);

    for (let slice = 0; slice < 3; slice += 1) spendOn(straight, twin, sameProject);

    expect(slicesToFinish(detoured, mage, project)).toBe(
      slicesToFinish(straight, twin, sameProject),
    );
  });

  it('costs the detour every banked slice if the progress is thrown away', () => {
    // The control, and the design that was rejected: progress kept on the goal
    // commitment goes with the goal. Clearing the row at the switch is exactly
    // what that would have done, and the mage pays the three slices again.
    const lab = laboratory();
    const mage = lab.mages[0] as EntityHandle;
    const [project] = twoTargets(lab, mage);
    const key = effortKey(EFFORT_KIND.research, mage, project, 0);

    for (let slice = 0; slice < 3; slice += 1) spendOn(lab, mage, project);
    const withProgress = laboratory();
    const twin = withProgress.mages[0] as EntityHandle;
    for (let slice = 0; slice < 3; slice += 1) spendOn(withProgress, twin, project);

    lab.efforts.clear(key);
    expect(lab.efforts.progressOf(key)).toBe(0);

    expect(slicesToFinish(lab, mage, project)).toBeGreaterThan(
      slicesToFinish(withProgress, twin, project),
    );
  });

  it('quotes a resumed node as cheaper than an untouched one', () => {
    // The other half of "she resumes": the frontier a mage is *offered* nets off
    // what she has banked, so `compareTargets` puts a half-finished node ahead of
    // an untouched one at the same authored cost without any rule saying so.
    const lab = laboratory();
    const mage = lab.mages[0] as EntityHandle;
    const [project] = twoTargets(lab, mage);
    const before = lab.gateway().researchFrontier(mage, 8).find((t) => t.nodeId === project);

    for (let slice = 0; slice < 3; slice += 1) spendOn(lab, mage, project);
    const after = lab.gateway().researchFrontier(mage, 8).find((t) => t.nodeId === project);

    expect(before?.remainingCost).toBeGreaterThan(0);
    expect(after?.remainingCost).toBeLessThan(before?.remainingCost ?? 0);
  });

  it('forgets a project the moment it completes', () => {
    const lab = laboratory();
    const mage = lab.mages[0] as EntityHandle;
    const [project] = twoTargets(lab, mage);
    slicesToFinish(lab, mage, project);

    expect(lab.efforts.progressOf(effortKey(EFFORT_KIND.research, mage, project, 0))).toBe(0);
    expect(lab.efforts.effortsOf(mage)).toHaveLength(0);
    // The entity goes too. A row per node every mage ever finished would be an
    // unbounded leak dressed as history.
    expect(componentOf(lab.state, EFFORT_PROGRESS).size).toBe(0);
  });
});

describe('the ledger keeps one row per project and bounds them per mage', () => {
  it('separates two projects over the same node by what kind of work they are', () => {
    // A mage who holds a node can be teaching it and writing it down at once,
    // and those are different costs. Keying on `(subject, nodeId)` alone would
    // let a month at the desk finish a student's education.
    const lab = laboratory();
    const mage = lab.mages[0] as EntityHandle;
    const teaching = effortKey(EFFORT_KIND.teaching, mage, 7, lab.mages[1] as EntityHandle);
    const scribing = effortKey(EFFORT_KIND.scribing, mage, 7, 0);

    lab.efforts.accrue(teaching, 512);
    expect(lab.efforts.progressOf(scribing)).toBe(0);
    lab.efforts.accrue(scribing, 128);
    expect(lab.efforts.progressOf(teaching)).toBe(512);
  });

  it('separates one teacher’s two students, because a lesson belongs to a pair', () => {
    const lab = laboratory(3);
    const [teacher, first, second] = lab.mages as readonly EntityHandle[];
    const one = effortKey(EFFORT_KIND.teaching, teacher as number, 7, first as number);
    const other = effortKey(EFFORT_KIND.teaching, teacher as number, 7, second as number);

    lab.efforts.accrue(one, 512);
    lab.efforts.accrue(other, 128);
    expect(lab.efforts.progressOf(one)).toBe(512);
    expect(lab.efforts.progressOf(other)).toBe(128);
  });

  it('gives up the least-invested project when a mage reaches her bound', () => {
    const lab = laboratory();
    const mage = lab.mages[0] as EntityHandle;
    for (let index = 0; index < MAX_EFFORTS_PER_MAGE; index += 1) {
      // Ascending investment, so the first node is the one with least in it.
      lab.efforts.accrue(effortKey(EFFORT_KIND.research, mage, index + 1, 0), 64 * (index + 1));
    }
    expect(lab.efforts.effortsOf(mage)).toHaveLength(MAX_EFFORTS_PER_MAGE);

    lab.efforts.accrue(effortKey(EFFORT_KIND.research, mage, 99, 0), 32);
    expect(lab.efforts.effortsOf(mage)).toHaveLength(MAX_EFFORTS_PER_MAGE);
    expect(lab.efforts.progressOf(effortKey(EFFORT_KIND.research, mage, 1, 0))).toBe(0);
    expect(lab.efforts.progressOf(effortKey(EFFORT_KIND.research, mage, 2, 0))).toBe(128);
    expect(lab.efforts.progressOf(effortKey(EFFORT_KIND.research, mage, 99, 0))).toBe(32);
  });

  it('takes a dead mage’s projects with her, on either side of a lesson', () => {
    const lab = laboratory(2);
    const [teacher, student] = lab.mages as readonly EntityHandle[];
    lab.efforts.accrue(effortKey(EFFORT_KIND.research, teacher as number, 3, 0), 256);
    lab.efforts.accrue(
      effortKey(EFFORT_KIND.teaching, teacher as number, 7, student as number),
      256,
    );
    lab.efforts.accrue(effortKey(EFFORT_KIND.research, student as number, 5, 0), 256);

    lab.efforts.clearSubject(student as number);

    // Her own project and the lesson she was half of; not the teacher's.
    expect(lab.efforts.progressOf(effortKey(EFFORT_KIND.research, student as number, 5, 0))).toBe(0);
    expect(
      lab.efforts.progressOf(
        effortKey(EFFORT_KIND.teaching, teacher as number, 7, student as number),
      ),
    ).toBe(0);
    expect(lab.efforts.progressOf(effortKey(EFFORT_KIND.research, teacher as number, 3, 0))).toBe(
      256,
    );
  });

  it('round-trips through a save, which is the whole reason it is a component', () => {
    const lab = laboratory();
    const mage = lab.mages[0] as EntityHandle;
    const key = effortKey(EFFORT_KIND.research, mage, 4, 0);
    lab.efforts.accrue(key, 768);

    const reloaded = new EffortLedger(lab.state);
    expect(reloaded.progressOf(key)).toBe(768);
  });
});

describe('a lesson and a book finish through the same ledger', () => {
  /** Puts a node in a mage's head at a stated mastery, as a founding grant would. */
  function grant(lab: Laboratory, mage: EntityHandle, nodeId: number, mastery: number): void {
    const instance = lab.state.entities.create();
    attachRecord(lab.state, KNOWLEDGE_INSTANCE, instance, {
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery,
    });
    lab.knowledge.rebuild();
  }

  /** A node with no prerequisites, so a granted holder can pass it straight on. */
  function openNode(lab: Laboratory, mage: EntityHandle): number {
    return twoTargets(lab, mage)[0];
  }

  /** Books in this universe. */
  function grimoiresIn(lab: Laboratory): number {
    return componentOf(lab.state, GRIMOIRE).size;
  }

  it('transmits the node once the pair has paid teachCost, and not before', () => {
    const lab = laboratory(2);
    const [teacher, student] = lab.mages as readonly EntityHandle[];
    const nodeId = openNode(lab, teacher as EntityHandle);
    grant(lab, teacher as EntityHandle, nodeId, 1024);

    const teachCost = lab.gateway().teachCostOf(nodeId);
    expect(teachCost).toBeGreaterThan(0);

    lab.gateway().contributeTeaching(
      teacher as number,
      student as number,
      nodeId,
      teachCost - 1,
    );
    expect(lab.gateway().knows(student as number, nodeId)).toBe(false);

    lab.gateway().contributeTeaching(teacher as number, student as number, nodeId, 1);
    expect(lab.gateway().knows(student as number, nodeId)).toBe(true);
    // Finished projects are forgotten, teaching included.
    expect(
      lab.efforts.progressOf(
        effortKey(EFFORT_KIND.teaching, teacher as number, nodeId, student as number),
      ),
    ).toBe(0);
  });

  it('lets either end of a lesson push it, because the cost is the pair’s', () => {
    const lab = laboratory(2);
    const [teacher, student] = lab.mages as readonly EntityHandle[];
    const nodeId = openNode(lab, teacher as EntityHandle);
    grant(lab, teacher as EntityHandle, nodeId, 1024);

    const half = Math.ceil(lab.gateway().teachCostOf(nodeId) / 2);
    const key = effortKey(EFFORT_KIND.teaching, teacher as number, nodeId, student as number);

    // The teacher's half-month, then the student's, into one row. Half alone is
    // not a lesson; the two halves together are.
    lab.gateway().contributeTeaching(teacher as number, student as number, nodeId, half);
    expect(lab.efforts.progressOf(key)).toBe(half);
    expect(lab.gateway().knows(student as number, nodeId)).toBe(false);

    lab.gateway().contributeTeaching(teacher as number, student as number, nodeId, half);
    expect(lab.gateway().knows(student as number, nodeId)).toBe(true);
  });

  it('writes a book once the desk time is paid, and charges its materials then', () => {
    const lab = laboratory(1);
    const mage = lab.mages[0] as EntityHandle;
    const nodeId = openNode(lab, mage);
    grant(lab, mage, nodeId, 1024);

    const key = effortKey(EFFORT_KIND.scribing, mage, nodeId, 0);
    lab.gateway().contributeScribing(mage, nodeId, 256);
    expect(lab.efforts.progressOf(key)).toBe(256);
    // Nothing is charged for a half-written book: a stock that had paid for
    // parchment nobody can point at is a stock nobody can reconcile.
    expect(lab.materialsSpent()).toBe(0);
    expect(grimoiresIn(lab)).toBe(0);

    // Until the tier's desk time is paid. The count of slices is not the claim —
    // the tier is content's to author — so this spends until the book appears
    // rather than pinning a number that content could move.
    let slices = 1;
    while (grimoiresIn(lab) === 0 && slices < 64) {
      lab.gateway().contributeScribing(mage, nodeId, 256);
      slices += 1;
    }

    expect(grimoiresIn(lab)).toBe(1);
    expect(lab.materialsSpent()).toBeGreaterThan(0);
    expect(lab.efforts.progressOf(key)).toBe(0);
  });
});
