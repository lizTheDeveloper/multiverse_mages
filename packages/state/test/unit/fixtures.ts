/*
 * Multiverse Mages — a world carrying one row of every declared component.
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
 * The `state-schema` round-trip scenario asks for *"a state populated with
 * every defined component type"*. Building that by hand in each test would
 * leave a new component uncovered the day it is added, so it is built here from
 * {@link WORLD_COMPONENTS} — and {@link assertEveryWorldComponentPopulated}
 * fails if any component ends up with no rows, which is what turns "we covered
 * everything" from a claim into a check.
 */

import type { ComponentFields, ComponentSpec, EntityHandle, SimState } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import {
  ASCENSION_PATH,
  AXIS_CHANGE_COUNTER,
  AXIS_KIND,
  BLESSING,
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  EDICT,
  EDICT_KIND,
  EFFORT_KIND,
  EFFORT_PROGRESS,
  ENCOURAGED_CELL,
  ERA_EVALUATION,
  EVER_KNOWN,
  GOAL_COMMITMENT,
  GOD_STATE,
  GRANT_BUDGET,
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_FIDELITY,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  MATERIAL_STOCK,
  MID_RAID_CHANGE,
  OBJECTIVE,
  OBJECTIVE_STATUS,
  OCCUPATION,
  POPULACE_COHORT,
  PREPARED_SPELL,
  RAID_SIDE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  UPHEAVAL,
  WORLD_COMPONENTS,
  attachRecord,
  cellIdAt,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import type { RulesetSnapshot } from '@mm/state';

/** `fp(1.0)`, spelled out so the fixtures read as game values. */
const FP_ONE = 1024;

export const FIXTURE_ROOT_SEED = 0x5eed_0001;
/** 32 lowercase hex characters — the full width `contracts.md` §0 requires. */
export const FIXTURE_CONTENT_REVISION = 'abcd1234abcd1234abcd1234abcd1234';

export interface PopulatedWorld {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly mage: EntityHandle;
  readonly cohort: EntityHandle;
  readonly university: EntityHandle;
  readonly library: EntityHandle;
  readonly grimoire: EntityHandle;
  /** The shelved knowledge instance, which also carries the fidelity row. */
  readonly instance: EntityHandle;
  readonly effort: EntityHandle;
}

/**
 * A world with one row of every world-scale component, all fields non-zero
 * where the width allows.
 *
 * Non-zero on purpose. A row left at its zeroed default would round-trip
 * through a snapshot correctly even if the serializer dropped it entirely,
 * because "absent" and "all zeroes" would look the same coming back.
 */
export function populatedWorld(): PopulatedWorld {
  const state = createState({
    rootSeed: FIXTURE_ROOT_SEED,
    schema: defineWorldStateSchema(),
    contentRevision: FIXTURE_CONTENT_REVISION,
  });

  const universe = createUniverse(state, {
    permittedTechniques: 0b10101,
    permittedForms: 0b10101010101010,
    edictBudget: 6,
    traditionId: 2,
    favor: 12 * FP_ONE,
    worship: 7 * FP_ONE,
    worshipTier: 3,
    prestige: 4 * FP_ONE,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 40 * FP_ONE,
    ascended: 0,
  });

  // The three kinds `materials` used to be one number for — on the universe's
  // own handle, like `god-state`, since §1.1 still describes one economy per
  // universe rather than one per kind.
  attachRecord(state, MATERIAL_STOCK, universe, {
    food: 500 * FP_ONE,
    stone: 250 * FP_ONE,
    vellum: 150 * FP_ONE,
  });

  const edict = state.entities.create();
  attachRecord(state, EDICT, edict, {
    cellId: cellIdAt(4, 3),
    kind: EDICT_KIND.interdiction,
  });

  const encouraged = state.entities.create();
  attachRecord(state, ENCOURAGED_CELL, encouraged, { cellId: cellIdAt(1, 2), expiryTick: 96 });

  const axisCounter = state.entities.create();
  attachRecord(state, AXIS_CHANGE_COUNTER, axisCounter, {
    axisKind: AXIS_KIND.form,
    axisBit: 3,
    changeCount: 2,
  });

  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 24 });

  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 120,
    buildProgress: FP_ONE,
  });

  const cohort = state.entities.create();
  attachRecord(state, POPULACE_COHORT, cohort, {
    speciesId: 1,
    occupation: OCCUPATION.scribe,
    count: 10_000,
    birthTickBucket: -120,
  });

  const staff = state.entities.create();
  attachRecord(state, UNIVERSITY_STAFF, staff, { universityId: university, cohortId: cohort });

  const mage = state.entities.create();
  attachRecord(state, MAGE, mage, {
    speciesId: 1,
    birthTick: -600,
    roleId: MAGE_ROLE.professor,
    universityId: university,
    curiosity: 512,
    ambition: FP_ONE,
    caution: 1536,
    vigor: 3 * FP_ONE,
    maxVigor: 4 * FP_ONE,
    alive: 1,
  });

  const grimoire = state.entities.create();
  attachRecord(state, GRIMOIRE, grimoire, {
    nodeId: 7,
    durability: 1792,
    holderKind: HOLDER_KIND.library,
    holderId: library,
  });

  const instance = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId: 7,
    locationKind: LOCATION_KIND.library,
    locationId: library,
    acquiredTick: 33,
    mastery: FP_ONE,
  });

  // On the instance's own handle, which is what makes the component a sparse
  // side table rather than two more columns on every instance in a Monte Carlo
  // run. The values are deliberately *not* the defaults: an absent row already
  // means generation zero and sound, so a fixture row carrying zeros would
  // round-trip identically to no row at all and would test nothing.
  attachRecord(state, KNOWLEDGE_FIDELITY, instance, { copyGeneration: 1536, corruption: 1 });

  const everKnown = state.entities.create();
  attachRecord(state, EVER_KNOWN, everKnown, { nodeId: 7 });

  // On the mage's own handle, which is the whole point of the component: a
  // commitment is found by the handle every other subsystem already holds, and
  // a mage with no row is a mage who has never chosen.
  attachRecord(state, GOAL_COMMITMENT, mage, {
    goalId: 5,
    targetNodeId: 7,
    adoptedTick: 30,
    score: 640,
  });

  // An entity of its own, not the mage's handle: a mage may have several
  // projects set down at once, which is the whole reason progress is not stored
  // on the commitment. See `components.ts`.
  const effort = state.entities.create();
  attachRecord(state, EFFORT_PROGRESS, effort, {
    subject: mage,
    kind: EFFORT_KIND.research,
    nodeId: 9,
    counterparty: 0,
    progress: 3 * FP_ONE,
  });

  // `god-agency`'s four. The god-state row hangs on the universe's own handle,
  // which is what makes it a singleton without a second uniqueness rule: there
  // is one universe per instance (§1.1), so there is one place to put it.
  attachRecord(state, GOD_STATE, universe, {
    favorWasted: 544,
    magelessTicks: 3,
    lowWorshipTicks: 7,
    stasisTicks: 11,
    lastEverKnown: 4,
    lastExisting: 3,
    ascensionFirstMetTick: 612,
    ascensionPath: ASCENSION_PATH.apotheosis,
    peakWorshipTier: 4,
    deepestTier: 5,
    lastEraRecorded: 2,
    eraNodesLost: 1,
    goodEraRun: 2,
    overBudgetEdicts: 1,
    terminalTick: 0,
  });

  // On the mage's own handle, like her goal commitment and for the same reason:
  // one mage holds at most one blessing, so re-blessing refreshes the row she
  // already has rather than adding a second.
  attachRecord(state, BLESSING, mage, { mageId: mage, expiryTick: 150 });

  const upheaval = state.entities.create();
  attachRecord(state, UPHEAVAL, upheaval, { factor: 512, expiryTick: 54 });

  const eraEvaluation = state.entities.create();
  attachRecord(state, ERA_EVALUATION, eraEvaluation, {
    era: 2,
    libraryDependence: 192,
    nodesLost: 1,
    passed: 1,
  });

  // On the universe handle too, and for the same singleton reason as god-state:
  // one universe, one budget. Every field distinct and none of them zero, so a
  // round-trip that dropped or transposed one is visible.
  attachRecord(state, GRANT_BUDGET, universe, {
    startingGrants: 2,
    accrualNodes: 8,
    cap: 12,
    grantsUsed: 1,
    seededNodes: 3,
  });

  // One raid-scarred technique, so the mark `raid-engagement.md` §1 leaves is
  // in the round-trip like everything else.
  const midRaidChange = state.entities.create();
  attachRecord(state, MID_RAID_CHANGE, midRaidChange, {
    scope: RULE_SCOPE.technique,
    targetId: 3,
    changeKind: RULE_CHANGE_KIND.forbid,
    paidCost: 4096,
    markedTick: 41,
  });

  assertEveryWorldComponentPopulated(state);
  return { state, universe, mage, cohort, university, library, grimoire, instance, effort };
}

/** Fails if any world component has no rows, so "every component" stays true. */
export function assertEveryWorldComponentPopulated(state: SimState): void {
  // Widened to the base spec type on purpose: `WORLD_COMPONENTS` is a `const`
  // tuple, so its element type is a union of every declared layout and
  // `componentOf` would try to infer one of them for all of them.
  const specs: readonly ComponentSpec<ComponentFields>[] = WORLD_COMPONENTS;
  const empty = specs.filter((spec) => componentOf(state, spec).size === 0).map((spec) => spec.name);
  if (empty.length > 0) {
    throw new Error(
      `The fixture leaves ${empty.join(', ')} with no rows, so any test claiming to cover every ` +
        'component is covering less than it says.',
    );
  }
}

/** A ruleset snapshot matching the fixture world, for raid tests. */
export function fixtureRuleset(overrides: Partial<RulesetSnapshot> = {}): RulesetSnapshot {
  return Object.freeze({
    permittedTechniques: 0b10101,
    permittedForms: 0b10101010101010,
    edicts: Object.freeze([]),
    traditionId: 2,
    contentRevision: FIXTURE_CONTENT_REVISION,
    ...overrides,
  });
}

/** Populates an engagement store with one row of every engagement component. */
export function populateEngagement(entities: SimState): void {
  const combatant = entities.entities.create();
  attachRecord(entities, COMBATANT, combatant, {
    sourceKind: COMBATANT_SOURCE_KIND.mage,
    sourceId: 1234,
    side: RAID_SIDE.attacker,
    x: 100 * FP_ONE,
    y: 25 * FP_ONE,
    hp: 30 * FP_ONE,
    maxHp: 30 * FP_ONE,
    vigor: 3 * FP_ONE,
    maxVigor: 4 * FP_ONE,
    concealment: 256,
  });

  const prepared = entities.entities.create();
  attachRecord(entities, PREPARED_SPELL, prepared, { combatantId: combatant, nodeId: 7 });

  const objective = entities.entities.create();
  attachRecord(entities, OBJECTIVE, objective, {
    kind: 1,
    targetId: 4321,
    x: 180 * FP_ONE,
    y: 180 * FP_ONE,
    valueFp: 5 * FP_ONE,
    statusKind: OBJECTIVE_STATUS.held,
    capturedBy: 0,
  });
}
