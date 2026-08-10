/*
 * Multiverse Mages — worlds for the observation and action-space tests.
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
 * Two deliberately *different* universes, plus an engagement.
 *
 * Different is the point. `observation-action-space`'s first scenario is *"two
 * universes with different rulesets, populations, and knowledge"* producing
 * identical shapes, and a fixture pair that differed only in one field would
 * make that assertion nearly vacuous — the shape would match because almost
 * nothing changed. So the two below disagree on every axis the observation
 * reads: ruleset bitmasks, edicts, tradition, resources, species mix,
 * occupation mix, mage count, node depth, institutions, and world tick.
 *
 * Built here rather than imported from `packages/state/test`: a cross-package
 * relative import escapes this project's `rootDir` and would quietly make one
 * package's test suite depend on another's private fixtures.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import type { Engagement } from '@mm/state';
import {
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  EDICT,
  EDICT_KIND,
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
  attachRecord,
  beginEngagement,
  captureRuleset,
  cellIdAt,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';

import type { CatalogueNode, ContentCatalogue } from '@mm/agent-api';
import { buildCatalogue } from '@mm/agent-api';

/** `fp(1.0)`, spelled out so the fixtures read as game values. */
export const FP = 1024;

/** 32 lowercase hex characters — the full width `contracts.md` §0 requires. */
export const FIXTURE_CONTENT_REVISION = '0c0ffee10c0ffee10c0ffee10c0ffee1';

/**
 * A catalogue spanning several cells and tiers.
 *
 * Node ids are dense from 1 and cells are picked to be spread across the grid,
 * so a test asserting a knowledge channel is asserting an offset that a
 * one-cell fixture could not distinguish from a wrong one.
 */
export const FIXTURE_NODES: readonly CatalogueNode[] = Object.freeze([
  { nodeId: 1, cellId: cellIdAt(0, 0), tier: 1 },
  { nodeId: 2, cellId: cellIdAt(0, 0), tier: 3 },
  { nodeId: 3, cellId: cellIdAt(2, 5), tier: 1 },
  { nodeId: 4, cellId: cellIdAt(2, 5), tier: 6 },
  { nodeId: 5, cellId: cellIdAt(4, 13), tier: 7 },
  { nodeId: 6, cellId: cellIdAt(1, 2), tier: 2 },
]);

export const FIXTURE_CATALOGUE: ContentCatalogue = buildCatalogue(FIXTURE_NODES, [1, 2, 3]);

export interface FixtureWorld {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly mages: readonly EntityHandle[];
  readonly university: EntityHandle;
  readonly library: EntityHandle;
}

/**
 * A settled universe: three techniques, several forms, one interdiction, four
 * mages of two species at different depths, a university with a stocked
 * library.
 */
export function firstUniverse(): FixtureWorld {
  const state = createState({
    rootSeed: 0x1111_0001,
    schema: defineWorldStateSchema(),
    contentRevision: FIXTURE_CONTENT_REVISION,
  });

  const universe = createUniverse(state, {
    permittedTechniques: 0b00111,
    permittedForms: 0b00000000111111,
    edictBudget: 4,
    traditionId: 2,
    favor: 40 * FP,
    worship: 12 * FP,
    worshipTier: 3,
    materials: 500 * FP,
    prestige: 2 * FP,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 100 * FP,
    ascended: 0,
  });

  const edict = state.entities.create();
  attachRecord(state, EDICT, edict, { cellId: cellIdAt(1, 2), kind: EDICT_KIND.interdiction });

  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 12 });

  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 240,
    buildProgress: FP,
  });

  for (const [speciesId, occupation, count] of [
    [1, OCCUPATION.laborer, 40_000],
    [1, OCCUPATION.student, 900],
    [3, OCCUPATION.scribe, 120],
  ] as const) {
    const cohort = state.entities.create();
    attachRecord(state, POPULACE_COHORT, cohort, {
      speciesId,
      occupation,
      count,
      birthTickBucket: -120,
    });
  }

  const mages: EntityHandle[] = [];
  for (const [speciesId, roleId, vigor, alive] of [
    [1, MAGE_ROLE.researcher, 3 * FP, 1],
    [1, MAGE_ROLE.professor, 1 * FP, 1],
    [3, MAGE_ROLE.warden, 4 * FP, 1],
    [3, MAGE_ROLE.raider, 2 * FP, 0],
  ] as const) {
    const mage = state.entities.create();
    attachRecord(state, MAGE, mage, {
      speciesId,
      birthTick: -400,
      roleId,
      universityId: university,
      curiosity: 512,
      ambition: FP,
      caution: FP,
      vigor,
      maxVigor: 4 * FP,
      alive,
    });
    mages.push(mage);
  }

  // Mage 0 knows a tier-1 and a tier-3 node; mage 2 knows a tier-6 one. Mage 1
  // knows nothing, which is the case `mageTierSlot` documents as bucketless.
  addInstance(state, 1, LOCATION_KIND.mind, mages[0] as EntityHandle);
  addInstance(state, 2, LOCATION_KIND.mind, mages[0] as EntityHandle);
  addInstance(state, 4, LOCATION_KIND.mind, mages[2] as EntityHandle);
  // Two copies of node 1 in the library: redundancy without extra depth.
  addInstance(state, 1, LOCATION_KIND.library, library);
  addInstance(state, 1, LOCATION_KIND.library, library);
  addInstance(state, 3, LOCATION_KIND.library, library);

  const grimoire = state.entities.create();
  attachRecord(state, GRIMOIRE, grimoire, {
    nodeId: 3,
    durability: 2 * FP,
    holderKind: HOLDER_KIND.library,
    holderId: library,
  });

  return { state, universe, mages, university, library };
}

/**
 * A universe unlike the first in every readable way: a different ruleset, a
 * different tradition, no edicts, one species, no institutions, no knowledge,
 * and a clock well into a later era.
 */
export function secondUniverse(): FixtureWorld {
  const state = createState({
    rootSeed: 0x2222_0002,
    schema: defineWorldStateSchema(),
    contentRevision: FIXTURE_CONTENT_REVISION,
  });

  const universe = createUniverse(state, {
    permittedTechniques: 0b11000,
    permittedForms: 0b11000000000000,
    edictBudget: 8,
    traditionId: 3,
    favor: 5 * FP,
    worship: 1 * FP,
    worshipTier: 0,
    materials: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 20 * FP,
    ascended: 0,
  });

  const cohort = state.entities.create();
  attachRecord(state, POPULACE_COHORT, cohort, {
    speciesId: 6,
    occupation: OCCUPATION.idle,
    count: 12,
    birthTickBucket: 0,
  });

  const mage = state.entities.create();
  attachRecord(state, MAGE, mage, {
    speciesId: 6,
    birthTick: 0,
    roleId: MAGE_ROLE.researcher,
    universityId: 0,
    curiosity: FP,
    ambition: FP,
    caution: FP,
    vigor: 4 * FP,
    maxVigor: 4 * FP,
    alive: 1,
  });

  // A clock deep into the run, so the clock block differs too.
  state.clock.worldTick = 1_200;

  return { state, universe, mages: [mage], university: 0, library: 0 };
}

/** Attaches one knowledge instance. */
export function addInstance(
  state: SimState,
  nodeId: number,
  locationKind: number,
  locationId: EntityHandle,
): EntityHandle {
  const instance = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId,
    locationKind,
    locationId,
    acquiredTick: 1,
    mastery: FP,
  });
  return instance;
}

/**
 * Freezes a world into an engagement and populates it.
 *
 * The world's clock enters engagement mode, which is what makes the mask's one
 * branch fire and what the "shape is constant across scales" scenario compares
 * against.
 */
export function engageWorld(world: FixtureWorld): Engagement {
  const ruleset = captureRuleset(world.state, world.universe);
  const engagement = beginEngagement(world.state, {
    hostRuleset: ruleset,
    raiderRuleset: ruleset,
    portalStability: 600,
    stabilityDecayPerTick: 3,
    raidSeed: 0x3333_0003,
  });

  const entities = engagement.entities;
  for (const [side, hp, vigor] of [
    [RAID_SIDE.attacker, 30 * FP, 3 * FP],
    [RAID_SIDE.attacker, 20 * FP, 1 * FP],
    [RAID_SIDE.defender, 25 * FP, 4 * FP],
  ] as const) {
    const combatant = entities.entities.create();
    attachRecord(entities, COMBATANT, combatant, {
      sourceKind: COMBATANT_SOURCE_KIND.mage,
      sourceId: 1,
      side,
      x: 10 * FP,
      y: 10 * FP,
      hp,
      maxHp: 30 * FP,
      vigor,
      maxVigor: 4 * FP,
      concealment: 128,
    });
    const prepared = entities.entities.create();
    attachRecord(entities, PREPARED_SPELL, prepared, { combatantId: combatant, nodeId: 1 });
  }

  for (const [valueFp, statusKind] of [
    [9 * FP, OBJECTIVE_STATUS.held],
    [2 * FP, OBJECTIVE_STATUS.looted],
  ] as const) {
    const objective = entities.entities.create();
    attachRecord(entities, OBJECTIVE, objective, {
      kind: 1,
      targetId: 0,
      x: 100 * FP,
      y: 100 * FP,
      valueFp,
      statusKind,
      capturedBy: 0,
    });
  }

  return engagement;
}
