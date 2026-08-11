/*
 * Multiverse Mages — each v1 tradition differs, and only where it declares it does.
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
 * Task 6.15, which is two claims and needs both halves to mean anything.
 *
 * The first half — every pair of v1 traditions is distinguishable on some
 * seeded scenario — is the 0.3.0 release claim that each tradition *changes
 * measurable behaviour*. Without it a tradition is a label.
 *
 * The second half — all three agree on a scenario outside their differing
 * hooks — is what stops "different" from meaning "randomly different". A
 * tradition that perturbed unrelated outcomes would still pass the first half
 * while being exactly the thing `vision.md` §4a caps hooks to prevent: a
 * bespoke behaviour the balance harness cannot enumerate, showing up as
 * unexplained variance in a Monte Carlo sweep at 0.5.0.
 *
 * Deterministic by construction. Nothing here draws from an RNG stream, so the
 * "seed" is the fixed script below: the same inputs, in the same order, under
 * each tradition, with the only variable being which tradition governs.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, fromInt, mul } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import { EDICT_KIND, LOCATION_KIND } from '@mm/state';

import { isDormant } from '../../src/dormancy.js';
import { MagicGrid } from '../../src/grid.js';
import { DEFAULT_INITIAL_MASTERY, MASTERY_MAX } from '../../src/instances/constants.js';
import { decayHeldKnowledge, decayedMastery, masteryFloor } from '../../src/instances/decay.js';
import type { ResearchOutcome } from '../../src/instances/research.js';
import { research } from '../../src/instances/research.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type { StorePolicy } from '../../src/traditions/index.js';
import {
  admitToStore,
  applyAcquire,
  castCost,
  castPolicy,
  costPolicy,
  expendOnCast,
  hooksOfTradition,
  palaceLibraryDepth,
  prepare,
  scribeAvailability,
  storePolicy,
} from '../../src/traditions/index.js';

import {
  CHILD_NODE,
  CROSS_CELL_CHILD,
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';
import { fixtureNodeId, gridContentFixture } from './fixtures.js';
import { ART_OF_MEMORY, TRADITIONS, TRUE_NAMING, V1_TRADITIONS, VANCIAN } from './tradition-fixtures.js';

/** The fixed script. Identical for every tradition; only the hooks change. */
const SCRIPT = {
  nodeId: 7,
  baseResearchCost: mul(fromInt(6), FP_ONE),
  baseTeachCost: mul(fromInt(2), FP_ONE),
  baseCastCost: mul(fromInt(3), FP_ONE),
  heldPersonalInstances: 12,
  palaceTierWeight: 15,
} as const;

/** Everything one run of the script observed, as a comparable record. */
interface Outcome {
  readonly researchCost: number;
  readonly teachCost: number;
  readonly initialMastery: number;
  readonly stolenMastery: number;
  readonly personalLocationKind: number;
  readonly admittedThirteenth: boolean;
  readonly scribingAvailable: boolean;
  readonly canPrepare: boolean;
  readonly preparedAfterCast: readonly number[];
  readonly costAtRelease: number;
  readonly palaceDepth: number;
}

/**
 * Runs the script under one tradition, through all four hooks.
 *
 * Everything world-side is supplied. `contracts.md` §5 forbids `rules-magic`
 * from importing `rules-world`, so species rates and mage handles arrive as
 * parameters — which is also what makes this scenario reproducible without a
 * simulation running.
 */
function run(tradition: number): Outcome {
  const hooks = hooksOfTradition(tradition, TRADITIONS);

  const terms = applyAcquire(hooks.acquire, {
    baseResearchCost: SCRIPT.baseResearchCost,
    baseTeachCost: SCRIPT.baseTeachCost,
    baseInitialMastery: 0,
    baseStolenMastery: 0,
  });

  const store = storePolicy(hooks.store);
  const cast = castPolicy(hooks.cast);
  const cost = costPolicy(hooks.cost);

  const preparation = prepare(cast, [], { nodeId: SCRIPT.nodeId, usable: true, dormant: false });
  const released = expendOnCast(cast, preparation.preparedSpells, SCRIPT.nodeId);

  return {
    researchCost: terms.researchCost,
    teachCost: terms.teachCost,
    initialMastery: terms.initialMastery,
    stolenMastery: terms.stolenMastery,
    personalLocationKind: store.personalLocationKind,
    admittedThirteenth: admitToStore(store, SCRIPT.heldPersonalInstances).admitted,
    scribingAvailable: scribeAvailability(store).available,
    canPrepare: preparation.prepared,
    preparedAfterCast: released.preparedSpells,
    costAtRelease: castCost(cost, SCRIPT.baseCastCost),
    palaceDepth: palaceLibraryDepth(store, [
      { mageId: 1, tierWeightedCount: SCRIPT.palaceTierWeight },
    ]),
  };
}

describe('each pair of v1 traditions is distinguishable', () => {
  const outcomes = new Map(V1_TRADITIONS.map(([name, id]) => [name, run(id)]));

  for (let i = 0; i < V1_TRADITIONS.length; i += 1) {
    for (let j = i + 1; j < V1_TRADITIONS.length; j += 1) {
      const left = V1_TRADITIONS[i]?.[0] ?? '';
      const right = V1_TRADITIONS[j]?.[0] ?? '';

      it(`${left} differs from ${right}`, () => {
        expect(outcomes.get(left)).not.toEqual(outcomes.get(right));
      });
    }
  }

  it('differs through the hook each tradition declares, not incidentally', () => {
    const vancian = outcomes.get('vancian-memorization');
    const trueNaming = outcomes.get('true-naming');
    const artOfMemory = outcomes.get('art-of-memory');

    // Vancian stresses cast and cost: preparation is required, and release is free.
    expect(vancian?.canPrepare).toBe(true);
    expect(vancian?.costAtRelease).toBe(0);
    expect(vancian?.preparedAfterCast).toEqual([]);

    // True Naming stresses acquire: dearer research, cheaper teaching, whole instances.
    expect(trueNaming?.researchCost).toBeGreaterThan(vancian?.researchCost ?? 0);
    expect(trueNaming?.teachCost).toBeLessThan(vancian?.teachCost ?? 0);
    expect(trueNaming?.initialMastery).toBe(FP_ONE);

    // The Art of Memory stresses store: palaces, bounded, unwritable, and the
    // only one of the three whose universities get depth from living minds.
    expect(artOfMemory?.personalLocationKind).toBe(LOCATION_KIND.palace);
    expect(artOfMemory?.admittedThirteenth).toBe(false);
    expect(artOfMemory?.scribingAvailable).toBe(false);
    expect(artOfMemory?.palaceDepth).toBeGreaterThan(0);
    expect(vancian?.palaceDepth).toBe(0);
  });

  it('is reproducible: the same script under the same tradition twice', () => {
    for (const [, id] of V1_TRADITIONS) expect(run(id)).toEqual(run(id));
  });
});

/**
 * The agreement half, driven by the functions the simulation actually calls.
 *
 * `magic-traditions` names the scenario: *"a scenario exercising only research
 * prerequisites and cell legality ... run under all three traditions with
 * identical supplied rates"*. This section used to stand in for both with a
 * hand-rolled arithmetic loop written inside this file — a loop whose output
 * had no data dependency on the tradition at all, and which therefore could not
 * fail. It called neither {@link research} nor {@link decayHeldKnowledge}.
 *
 * What replaces it drives the real ones. Each tradition's hooks are resolved,
 * and the *tradition-derived* values that a research or decay call legitimately
 * receives are fed in — `initialMastery` from the `acquire` hook, and the
 * location an instance is created at from the `store` hook. Everything else is
 * supplied identically: the same catalog, the same ruleset, the same rates, the
 * same subject, and the same seeded RNG.
 *
 * The claim is therefore not "these functions ignore an argument they never
 * take". It is: *feeding a research step and a decay sweep everything the four
 * hooks legitimately produce changes nothing outside those hooks' domains.*
 * The leak that would break it is concrete and plausible — a prerequisite check
 * that stopped counting a palace as a place a mage holds knowledge, a decay
 * sweep that skipped a location kind, a research requirement that reached for
 * the acquire hook's `researchCost` instead of the node's. Each of those would
 * turn one tradition's run red here while leaving the distinguishability half
 * above perfectly green.
 */

/** The subject who does the researching, and the retention supplied for her. */
const SUBJECT = 41;
const RETENTION = FP_ONE;

/** Identical supplied rates, per the scenario's "with identical supplied rates". */
const LEARN_RATE = FP_ONE;
const RESEARCH_RATE = FP_ONE;
const EFFORT = fromInt(1) * 1024;

const AGREEMENT_SEED = 4242;
const AGREEMENT_TICK = 9;

/** The grid the dormancy predicate reads, and two of its cells. */
const GRID_CONTENT = gridContentFixture({
  v1Cells: ['perdo-mentem', 'rego-limen'],
  nodes: [
    { id: 'pm-unmake', cell: 'perdo-mentem', tier: 1 },
    { id: 'rl-portal', cell: 'rego-limen', tier: 2 },
  ],
});
const GRID = MagicGrid.from(GRID_CONTENT);

/** A subsystem in which {@link SUBJECT} already holds the root node. */
function withRootHeld(store: StorePolicy, mastery: number): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId: ROOT_NODE,
    // Where the *store* hook puts a personal instance. Under the Art of Memory
    // that is a palace, and a prerequisite held in a palace must count exactly
    // as a prerequisite held in a mind does.
    locationKind: store.personalLocationKind,
    locationId: SUBJECT,
    acquiredTick: 0,
    mastery,
  });
  return knowledge;
}

/** The comparable part of a research outcome: everything outside the four hooks. */
function comparable(outcome: ResearchOutcome) {
  // `instance` is an entity handle and is deliberately excluded — it is a
  // slot number, not a result. The created instance's *mastery* is excluded for
  // a stronger reason: it is the acquire hook's declared domain, and asserting
  // it equal across traditions would assert that True Naming does nothing.
  return {
    required: outcome.required,
    progress: outcome.progress,
    completed: outcome.completed,
    rediscovery: outcome.rediscovery,
    refusal: outcome.refusal,
  };
}

/**
 * One run of the agreement script under one tradition.
 *
 * Three research steps and two dormancy questions: a step whose prerequisite is
 * held, a step whose prerequisite is not, and a step into an interdicted cell.
 * Prerequisites and cell legality, which is exactly the pair the scenario names.
 */
function agreementScenario(tradition: number) {
  const hooks = hooksOfTradition(tradition, TRADITIONS);
  const store = storePolicy(hooks.store);
  const terms = applyAcquire(hooks.acquire, {
    baseResearchCost: SCRIPT.baseResearchCost,
    baseTeachCost: SCRIPT.baseTeachCost,
    baseInitialMastery: DEFAULT_INITIAL_MASTERY,
    baseStolenMastery: 0,
  });

  /** Everything a research step needs that is not the ruleset or the node. */
  const step = (mastery: number) => ({
    knowledge: withRootHeld(store, mastery),
    catalog: testCatalog(),
    cells: testCells,
    rng: stepRng(AGREEMENT_SEED, AGREEMENT_TICK),
    subject: SUBJECT,
    worldTick: AGREEMENT_TICK,
    progress: 0,
    effort: EFFORT,
    learnRate: LEARN_RATE,
    researchRate: RESEARCH_RATE,
    rediscoveryAffinity: FP_ONE,
    // The two tradition-derived inputs a research step legitimately takes.
    initialMastery: terms.initialMastery,
    locationKind: store.personalLocationKind,
  });

  const permitted = permissiveRuleset();

  return {
    /** Prerequisite held: the step proceeds. */
    satisfied: comparable(
      research({ ...step(MASTERY_MAX), ruleset: permitted, nodeId: CHILD_NODE }),
    ),
    /** Prerequisite in another cell and not held: refused, identically. */
    unsatisfied: comparable(
      research({ ...step(MASTERY_MAX), ruleset: permitted, nodeId: CROSS_CELL_CHILD }),
    ),
    /** The node's own cell interdicted: refused for the other reason. */
    forbidden: comparable(
      research({ ...step(MASTERY_MAX), ruleset: interdicting(HOME_CELL), nodeId: CHILD_NODE }),
    ),
    /** Cell legality as the derived predicate, over a permitted and a forbidden cell. */
    dormancy: [
      isDormant(GRID, ALL_PERMITTED, fixtureNodeId(GRID_CONTENT, 'pm-unmake')),
      isDormant(GRID, INTERDICTING_PM, fixtureNodeId(GRID_CONTENT, 'pm-unmake')),
      isDormant(GRID, INTERDICTING_PM, fixtureNodeId(GRID_CONTENT, 'rl-portal')),
    ],
  };
}

/** Every technique and form the grid fixture uses, permitted. */
const ALL_PERMITTED: Ruleset = {
  permittedTechniques: 0xff,
  permittedForms: 0xffff,
  edicts: [],
};

const INTERDICTING_PM: Ruleset = {
  ...ALL_PERMITTED,
  edicts: [{ cellId: GRID.cellByName('perdo-mentem').cellId, kind: EDICT_KIND.interdiction }],
};

describe('all three traditions agree outside their differing hooks', () => {
  const runs = V1_TRADITIONS.map(([name, id]) => [name, agreementScenario(id)] as const);

  it('reaches every branch the scenario claims to exercise', () => {
    // Without this, "all three agree" would also be true of a script in which
    // every step was refused for the same reason, or none was.
    const [, first] = runs[0] ?? [];
    expect(first?.satisfied.completed).toBe(true);
    expect(first?.satisfied.refusal).toBeUndefined();
    expect(first?.unsatisfied.refusal?.reason).toBe('unsatisfied-prerequisite');
    expect(first?.forbidden.refusal?.reason).toBe('forbidden-cell');
    expect(first?.dormancy).toEqual([false, true, false]);
  });

  it('produces one identical research outcome for every v1 tradition', () => {
    const [, first] = runs[0] ?? [];
    for (const [name, other] of runs.slice(1)) {
      expect(other, `${name} disagrees with vancian-memorization outside its hooks`).toEqual(first);
    }
  });

  it('counts a prerequisite held in a palace exactly as one held in a mind', () => {
    // The specific leak the Art of Memory run would expose, named so that a
    // future failure reads as a diagnosis rather than as a puzzle.
    const artOfMemory = runs.find(([name]) => name === 'art-of-memory')?.[1];
    expect(storePolicy(hooksOfTradition(ART_OF_MEMORY, TRADITIONS).store).personalLocationKind).toBe(
      LOCATION_KIND.palace,
    );
    expect(artOfMemory?.satisfied.completed).toBe(true);
  });

  it('is sensitive to the things it is comparing — a supplied rate moves the result', () => {
    // The vacuity control, and the one the previous version of this file did
    // not have: prove that `required` and the refusal *can* differ, so that
    // finding them equal across traditions is evidence rather than arithmetic.
    const store = storePolicy(hooksOfTradition(VANCIAN, TRADITIONS).store);
    const base = {
      knowledge: withRootHeld(store, MASTERY_MAX),
      catalog: testCatalog(),
      cells: testCells,
      ruleset: permissiveRuleset(),
      rng: stepRng(AGREEMENT_SEED, AGREEMENT_TICK),
      subject: SUBJECT,
      worldTick: AGREEMENT_TICK,
      progress: 0,
      effort: EFFORT,
      learnRate: LEARN_RATE,
      researchRate: RESEARCH_RATE,
      rediscoveryAffinity: FP_ONE,
      nodeId: CHILD_NODE,
    };

    const halfRate = research({ ...base, learnRate: FP_ONE / 2 });
    expect(halfRate.required).toBeGreaterThan(research(base).required);

    // And that where the prerequisite sits is a thing this script can see: a
    // copy on a library shelf is not knowledge the researcher holds.
    const shelved = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const grimoire = shelved.state.entities.create();
    shelved.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.library,
      locationId: SUBJECT,
      acquiredTick: 0,
      mastery: 0,
      grimoire,
    });
    expect(research({ ...base, knowledge: shelved }).refusal?.reason).toBe(
      'unsatisfied-prerequisite',
    );
  });
});

/**
 * Decay, through `instances/decay.ts` rather than through arithmetic retyped
 * here.
 *
 * `magic-traditions` names this one directly: *"a True Naming mind instance is
 * carried forward under a supplied retention value → it decays by exactly the
 * same amount as an identical instance under a standard `acquire` tradition."*
 * The acquire hook's whole vocabulary is four costs; it has no word for decay,
 * and this is what makes that a fact about the code rather than about the
 * comment above the hook.
 */

/** One sweep's decay of an instance created by a tradition's own acquire hook. */
function decayUnderTradition(tradition: number, elapsedTicks: number) {
  const hooks = hooksOfTradition(tradition, TRADITIONS);
  const terms = applyAcquire(hooks.acquire, {
    baseResearchCost: SCRIPT.baseResearchCost,
    baseTeachCost: SCRIPT.baseTeachCost,
    // Deliberately below MASTERY_MAX, so that a `standard` acquire and True
    // Naming's fixed mastery are genuinely different starting points and the
    // claim has to be about the *amount* decayed rather than the value reached.
    baseInitialMastery: STANDARD_START_MASTERY,
    baseStolenMastery: 0,
  });

  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const instance = knowledge.createInstance({
    nodeId: ROOT_NODE,
    // Pinned to a mind: the scenario says "a True Naming mind instance", and
    // the store hook's own choice of location is exercised by the sweep below.
    locationKind: LOCATION_KIND.mind,
    locationId: SUBJECT,
    acquiredTick: 0,
    mastery: terms.initialMastery,
  });

  decayHeldKnowledge({
    knowledge,
    cells: testCells,
    ruleset: permissiveRuleset(),
    elapsedTicks,
    worldTick: elapsedTicks,
    retentionOf: () => RETENTION,
  });

  const after = knowledge.read(instance).mastery;
  return { before: terms.initialMastery, after, lost: terms.initialMastery - after };
}

/** Below `MASTERY_MAX`, and far enough above the retention floor to decay freely. */
const STANDARD_START_MASTERY = 640;

/** How long one sweep runs. Chosen so no instance reaches its floor — see below. */
const DECAY_TICKS = 4;

describe('decay is untouched by the acquire hook', () => {
  const runs = V1_TRADITIONS.map(([name, id]) => [name, decayUnderTradition(id, DECAY_TICKS)] as const);

  it('leaves every instance above its retention floor, so the amounts are comparable', () => {
    // The trap this avoids: at the floor, `decayedMastery` clamps, two
    // different starting masteries lose different amounts, and a test asserting
    // equal amounts would be asserting the clamp. Stated as an assertion rather
    // than as a comment, because the constants above could drift.
    const floor = masteryFloor(RETENTION, false);
    for (const [name, run_] of runs) {
      expect(run_.after, `${name} decayed to its floor; the comparison below would be vacuous`)
        .toBeGreaterThan(floor);
      expect(run_.lost).toBeGreaterThan(0);
    }
  });

  it('takes exactly the same amount from a True Naming instance as from a standard one', () => {
    const [, vancian] = runs.find(([name]) => name === 'vancian-memorization') ?? [];
    const [, trueNaming] = runs.find(([name]) => name === 'true-naming') ?? [];

    // The premise, so a reader can see this is not two identical instances:
    // True Naming's acquire hook creates at its declared mastery, not the
    // supplied one, so the two start in different places.
    expect(trueNaming?.before).not.toBe(vancian?.before);
    expect(trueNaming?.lost).toBe(vancian?.lost);
  });

  it('takes the same amount under all three traditions', () => {
    const amounts = new Set(runs.map(([, run_]) => run_.lost));
    expect(amounts.size).toBe(1);
  });

  it('agrees with the pure function, at the same retention', () => {
    // `decayHeldKnowledge` and `decayedMastery` are the sweep and the formula.
    // A sweep that quietly applied a second adjustment would pass every
    // cross-tradition comparison above, because it would apply it three times.
    for (const [name, run_] of runs) {
      expect(decayedMastery(run_.before, DECAY_TICKS, RETENTION, false), name).toBe(run_.after);
    }
  });

  it('is sensitive to retention, so equality across traditions is evidence', () => {
    const forgetful = decayedMastery(STANDARD_START_MASTERY, DECAY_TICKS, FP_ONE / 4, false);
    const retentive = decayedMastery(STANDARD_START_MASTERY, DECAY_TICKS, FP_ONE, false);
    expect(forgetful).toBeLessThan(retentive);
  });
});

/**
 * The store hook chooses where an instance lives; decay does not care which it
 * chose.
 *
 * The full arc, through the real sweep: an instance settles at its retention
 * floor while its cell is permitted, erodes without a floor once the cell is
 * interdicted, and is destroyed when it reaches zero — emitting the loss event
 * that names the node. Run under each tradition, at that tradition's own
 * personal location kind, so mind and palace are both covered.
 */
function dormancyArc(tradition: number) {
  const store = storePolicy(hooksOfTradition(tradition, TRADITIONS).store);
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const instance = knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: store.personalLocationKind,
    locationId: SUBJECT,
    acquiredTick: 0,
    mastery: STANDARD_START_MASTERY,
  });

  const masteries: number[] = [];
  const lost: { nodeId: number; worldTick: number }[] = [];
  for (let sweep = 0; sweep < 12; sweep += 1) {
    // Long enough permitted to settle at the retention floor, then the god
    // forbids the cell and never relents.
    const ruleset = sweep < DORMANT_FROM_SWEEP ? permissiveRuleset() : interdicting(HOME_CELL);
    for (const event of decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset,
      elapsedTicks: 8,
      worldTick: sweep,
      retentionOf: () => RETENTION,
    })) {
      lost.push({ nodeId: event.nodeId, worldTick: event.worldTick });
    }
    masteries.push(knowledge.isInstance(instance) ? knowledge.read(instance).mastery : -1);
  }
  return { masteries, lost, exists: knowledge.exists(ROOT_NODE) };
}

/** The sweep the god's interdiction takes effect on. */
const DORMANT_FROM_SWEEP = 6;

describe('the store hook’s location changes where knowledge sits, not how it fades', () => {
  const arcs = V1_TRADITIONS.map(([name, id]) => [name, dormancyArc(id)] as const);

  it('runs the whole arc: a floor, then erosion, then destruction', () => {
    // Without this the agreement assertion below could hold over three arcs
    // that all did nothing. Every stage is named: still falling, settled at the
    // floor, then destroyed once the floor goes away.
    const [, first] = arcs[0] ?? [];
    const floor = masteryFloor(RETENTION, false);
    expect(first?.masteries[0]).toBeGreaterThan(floor);
    expect(first?.masteries[DORMANT_FROM_SWEEP - 1]).toBe(floor);
    expect(first?.masteries.at(-1)).toBe(-1);
    expect(first?.lost).toEqual([{ nodeId: ROOT_NODE, worldTick: 9 }]);
    expect(first?.exists).toBe(false);
  });

  it('produces the same arc in a memory palace as in a mind', () => {
    const [, first] = arcs[0] ?? [];
    for (const [name, other] of arcs.slice(1)) {
      expect(other, `${name} fades differently, which no hook declares`).toEqual(first);
    }
  });

  it('is not vacuous — the same script does differ when a hook is involved', () => {
    // Guards the agreement assertions against passing because the script does
    // nothing at all.
    expect(run(VANCIAN)).not.toEqual(run(TRUE_NAMING));
  });
});
