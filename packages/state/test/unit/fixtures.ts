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
  AXIS_CHANGE_COUNTER,
  AXIS_KIND,
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  EDICT,
  EDICT_KIND,
  ENCOURAGED_CELL,
  EVER_KNOWN,
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  OBJECTIVE,
  OBJECTIVE_STATUS,
  OCCUPATION,
  POPULACE_COHORT,
  PREPARED_SPELL,
  RAID_SIDE,
  UNIVERSITY,
  UNIVERSITY_STAFF,
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
    materials: 900 * FP_ONE,
    prestige: 4 * FP_ONE,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 40 * FP_ONE,
    ascended: 0,
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

  const everKnown = state.entities.create();
  attachRecord(state, EVER_KNOWN, everKnown, { nodeId: 7 });

  assertEveryWorldComponentPopulated(state);
  return { state, universe, mage, cohort, university, library, grimoire };
}

/** Fails if any world component has no rows, so "every component" stays true. */
export function assertEveryWorldComponentPopulated(state: SimState): void {
  // Widened to the base spec type on purpose: `WORLD_COMPONENTS` is a `const`
  // tuple, so its element type is a union of twelve distinct layouts and
  // `componentOf` would try to infer one of them for all twelve.
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
