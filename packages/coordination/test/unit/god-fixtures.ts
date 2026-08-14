/*
 * Multiverse Mages — a universe with a god in it, for the god-agency tests.
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
 * `world-fixtures.ts` builds a universe the world loop can step. This adds the
 * god: the resolved content tables, the `worship-yield` and `portal` node sets,
 * and the two systems installed either side of the world tick.
 *
 * **Shipped content, every time.** Every magnitude these tests assert against is
 * read out of `god-constant.json` rather than written into the test, so a retune
 * moves the assertion with the number it is about. A test carrying its own copy
 * of `worship-mage-cap` would keep passing after the cap was halved, and would
 * be asserting the shape of a formula nobody runs.
 *
 * The one thing tests here *do* spell out is a *relationship* — that the
 * ceiling is the sum of the three caps, that fall exceeds rise, that a half-point
 * yields half a cap. Those survive any retune, which is what makes them worth
 * asserting.
 */

import type { PrimitiveRecord } from '@mm/content';
import type { EntityHandle, Fixed, SimState, WorldSchema } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import {
  MAGE,
  MAGE_ROLE,
  MATERIAL_STOCK,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  createUniverse,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import type { GodContent, GodDeps, WorldStepDeps } from '../../src/index.js';
import { godEffectHooks, resolveGodContent } from '../../src/index.js';

import { catalogAndCells, registry, worldDeps } from './world-fixtures.js';

/** The resolved cost and constant tables, from the shipped content. */
let cachedContent: GodContent | undefined;
export function godContent(): GodContent {
  cachedContent ??= resolveGodContent(registry());
  return cachedContent;
}

/** Every magnitude the rules read, by its struct field name. */
export function constants(): GodContent['constants'] {
  return godContent().constants;
}

/** Base favor prices by `contracts.md` §4.2 action id. */
export function costs(): GodContent['costs'] {
  return godContent().costs;
}

function primitiveNamed(id: string): PrimitiveRecord {
  const found = registry().primitives.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`no "${id}" primitive in the shipped registry`);
  return found.record;
}

/** The `worship-yield` registry record, for the shared stacking channel. */
export function worshipYieldPrimitive(): PrimitiveRecord {
  return primitiveNamed('worship-yield');
}

/**
 * Interned node ids carrying a primitive, with their magnitudes unstacked.
 *
 * The same shape `scenario` hands the god systems, and for the same reason: how
 * several sources of one primitive combine is the registry's declared `stacking`
 * rule, and `stackMagnitudes` is the only thing permitted to apply it.
 */
export function nodesCarrying(primitiveId: string): Map<number, readonly Fixed[]> {
  const found = new Map<number, readonly Fixed[]>();
  for (const entry of registry().nodes) {
    const magnitudes = entry.record.effects
      .filter((effect) => effect.primitive === primitiveId)
      .map((effect) => effect.magnitude);
    if (magnitudes.length > 0) found.set(entry.contentId, Object.freeze(magnitudes));
  }
  return found;
}

/** The god half of `WorldStepDeps`, over shipped content. */
export function godDeps(): GodDeps {
  const { catalog, cells } = catalogAndCells();
  return {
    content: godContent(),
    catalog,
    cells,
    knowledgeFor: (state) => KnowledgeSubsystem.fromState(state, catalog.nodeCount),
    worshipYield: worshipYieldPrimitive(),
    worshipYieldNodes: nodesCarrying('worship-yield'),
    portalNodes: new Set(nodesCarrying('portal').keys()),
  };
}

/** World deps with the god installed, and the four effect seams filled. */
export function godlyWorldDeps(traditionId: number): WorldStepDeps {
  return {
    ...worldDeps(traditionId),
    god: godDeps(),
    ...godEffectHooks({ constants: constants() }),
  };
}

/** How a god-side test universe starts. Every field is a deliberate choice. */
export interface GodWorldOptions {
  readonly rootSeed?: number;
  /** Living mages, all of one species and all researchers. */
  readonly mages?: number;
  /** Members in a single laborer cohort. `0` seeds no populace at all. */
  readonly populace?: number;
  /** Universities at `buildProgress` of `fp(1024)`, i.e. complete. */
  readonly completedUniversities?: number;
  /** Universities at zero progress, which contribute nothing to worship. */
  readonly incompleteUniversities?: number;
  readonly favor?: Fixed;
  readonly worship?: Fixed;
  readonly permittedTechniques?: number;
  readonly permittedForms?: number;
  readonly traditionId?: number;
  /**
   * Every kind of the working stock, at the same figure — `world-fixtures.ts`'s
   * `seededWorld` seeds all three abundantly for the same reason, and no test
   * here has needed to differentiate them, so a single override keeps this
   * fixture's surface the same shape it had before `MATERIAL_STOCK` split the
   * one field into three.
   */
  readonly materials?: Fixed;
  readonly prestige?: Fixed;
}

/** The universe and the handles a test needs to name things in it. */
export interface GodWorld {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly mages: readonly EntityHandle[];
  readonly universities: readonly EntityHandle[];
}

/**
 * A universe sized by the caller, with nothing in it the caller did not ask for.
 *
 * Deliberately *not* `world-fixtures.ts`'s `seededWorld`, which seeds six
 * species and eighteen cohorts so that every phase of the world loop has
 * something to do. Worship is a function of three counts, and a test that wants
 * "exactly fifty mages" cannot get it from a fixture whose population is
 * whatever six species happened to produce.
 */
export function godWorld(schema: WorldSchema, options: GodWorldOptions = {}): GodWorld {
  const rootSeed = options.rootSeed ?? 0x0006_0000;
  const state = createState({
    rootSeed,
    schema,
    contentRevision: registry().contentRevision,
  });

  const traditions = registry().traditions;
  const traditionId = options.traditionId ?? traditions[0]?.contentId ?? 1;
  const universe = createUniverse(state, {
    permittedTechniques: options.permittedTechniques ?? 0b11111,
    permittedForms: options.permittedForms ?? 0b11111111111111,
    edictBudget: 1,
    traditionId,
    favor: options.favor ?? 0,
    worship: options.worship ?? 0,
    worshipTier: 0,
    prestige: options.prestige ?? 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });
  const materials = options.materials ?? 1000 * 1024;
  attachRecord(state, MATERIAL_STOCK, universe, {
    food: materials,
    stone: materials,
    vellum: materials,
  });

  const speciesId = registry().species[0]?.contentId ?? 1;
  const species = registry().species[0]?.record;

  const mages: EntityHandle[] = [];
  for (let index = 0; index < (options.mages ?? 0); index += 1) {
    const mage = state.entities.create();
    attachRecord(state, MAGE, mage, {
      speciesId,
      birthTick: 0,
      roleId: MAGE_ROLE.researcher,
      universityId: 0,
      curiosity: species?.curiosity ?? 1024,
      ambition: 1024,
      caution: 1024,
      vigor: 1024,
      maxVigor: 1024,
      alive: 1,
    });
    mages.push(mage);
  }

  if ((options.populace ?? 0) > 0) {
    const cohort = state.entities.create();
    attachRecord(state, POPULACE_COHORT, cohort, {
      speciesId,
      occupation: OCCUPATION.laborer,
      count: options.populace ?? 0,
      birthTickBucket: 0,
    });
  }

  const universities: EntityHandle[] = [];
  const addUniversity = (buildProgress: Fixed): void => {
    const handle = state.entities.create();
    attachRecord(state, UNIVERSITY, handle, {
      buildProgress,
      capacity: 8,
      libraryId: 0,
    });
    universities.push(handle);
  };
  for (let index = 0; index < (options.completedUniversities ?? 0); index += 1) addUniversity(1024);
  for (let index = 0; index < (options.incompleteUniversities ?? 0); index += 1) addUniversity(0);

  return { state, universe, mages, universities };
}
