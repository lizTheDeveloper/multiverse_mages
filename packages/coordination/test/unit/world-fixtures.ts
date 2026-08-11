/*
 * Multiverse Mages — a small, real universe for the world-loop tests.
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
 * **Real content, synthetic population.** The species, the node graph, the
 * primitives and the traditions all come from the shipped registry, because a
 * loop test over invented species would prove that the arithmetic responds to
 * its inputs and nothing about whether the game's content can be stepped at all.
 * The starting population is invented, because *how a universe is seeded* is
 * group 9's reference scenario and this is not it.
 */

import type { ContentRegistry, PrimitiveRecord, SpeciesRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { createState, rngFromRootSeed } from '@mm/sim-core';
import type { WorldSchema } from '@mm/sim-core';
import {
  MAGE,
  MAGE_ROLE,
  OCCUPATION,
  POPULACE_COHORT,
  attachRecord,
  createUniverse,
} from '@mm/state';
import type { CellResolver, NodeCatalog, StorePolicy } from '@mm/rules-magic';
import {
  KnowledgeSubsystem,
  MagicGrid,
  catalogFromRegistry,
  hookFor,
  storePolicy,
  traditionTableFrom,
} from '@mm/rules-magic';
import type { WorldStepDeps } from '../../src/index.js';

/** The shipped content, loaded once for a whole test file. */
let cached: ContentRegistry | undefined;
export function registry(): ContentRegistry {
  cached ??= loadContent(shippedContentSource());
  return cached;
}

function primitiveNamed(id: string): PrimitiveRecord {
  const found = registry().primitives.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`no "${id}" primitive in the shipped registry`);
  return found.record;
}

/** Every shipped species, by interned id, and the ids in ascending order. */
export function speciesTable(): {
  speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  ids: number[];
} {
  const byId = new Map<number, SpeciesRecord>(
    registry().species.map((entry) => [entry.contentId, entry.record]),
  );
  return {
    speciesOf: (speciesId) => byId.get(speciesId),
    ids: [...byId.keys()].sort((a, b) => a - b),
  };
}

/** The v1 tradition's resolved `store` hook. */
export function shippedStorePolicy(traditionId: number): StorePolicy {
  const table = traditionTableFrom(registry());
  return storePolicy(hookFor('store', traditionId, traditionId, table));
}

/** The node catalog and the grid's node-to-cell addressing. */
export function catalogAndCells(): { catalog: NodeCatalog; cells: CellResolver } {
  const grid = MagicGrid.from(registry());
  return { catalog: catalogFromRegistry(registry()), cells: grid };
}

/** The deps a world simulation is built from, over shipped content. */
export function worldDeps(traditionId: number): WorldStepDeps {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf } = speciesTable();
  return {
    speciesOf,
    catalog,
    cells,
    store: shippedStorePolicy(traditionId),
    primitives: {
      lifespan: primitiveNamed('lifespan'),
      resourceYield: primitiveNamed('resource-yield'),
      scribeRate: primitiveNamed('scribe-rate'),
      fertility: primitiveNamed('fertility'),
    },
    knowledgeFor: (state) => KnowledgeSubsystem.fromState(state, catalog.nodeCount),
  };
}

/** How a seeded universe starts, so two runs can be built identically. */
export interface SeedOptions {
  readonly rootSeed: number;
  /**
   * Members per starting cohort, per species, per seeded occupation.
   *
   * Small on purpose. The logistic brake in `carrying-capacity.ts` shuts births
   * off entirely at and above `K`, and `K` is derived from the materials stock —
   * so a "generous" starting population is a population above its own carrying
   * capacity, in which the births phase correctly does nothing and a test of it
   * asserts nothing.
   */
  readonly cohortSize?: number;
  /** Mages seeded per species. */
  readonly magesPerSpecies?: number;
}

/**
 * A universe with every shipped species present as laborers, students and
 * scribes, plus a handful of mages.
 *
 * Deliberately not the group 9 reference scenario: that one is committed,
 * seeded with zero player input, and run for 200 world years. This is the
 * smallest population in which every phase of the loop has something to do.
 */
export function seededWorld(
  schema: WorldSchema,
  options: SeedOptions,
): { state: SimState; mages: EntityHandle[] } {
  const state = createState({
    rootSeed: options.rootSeed,
    schema,
    contentRevision: registry().contentRevision,
  });
  const { speciesOf, ids } = speciesTable();
  const cohortSize = options.cohortSize ?? 60;
  const magesPerSpecies = options.magesPerSpecies ?? 2;

  const traditions = registry().traditions;
  const traditionId = traditions[0]?.contentId ?? 1;

  createUniverse(state, {
    // Three techniques × four forms is the v1 rectangle's shape; the exact bits
    // are the shipped content's business and the loop only asks `permits`.
    permittedTechniques: 0b11111,
    permittedForms: 0b11111111111111,
    edictBudget: 4,
    traditionId,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    // Enough stock that carrying capacity sits above the seeded population, so
    // the brake is damping births rather than forbidding them. `K` is
    // `materials × 2 / fp(1024)` plus completed university seats, of which
    // there are none until a god founds one.
    materials: 1000 * 1024,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });

  const mages: EntityHandle[] = [];
  for (const speciesId of ids) {
    const species = speciesOf(speciesId);
    if (species === undefined) continue;

    for (const occupation of [OCCUPATION.laborer, OCCUPATION.student, OCCUPATION.scribe]) {
      const cohort = state.entities.create();
      attachRecord(state, POPULACE_COHORT, cohort, {
        speciesId,
        occupation,
        count: cohortSize,
        // Born a maturity ago, so the student cohorts are promotable from the
        // first tick rather than after a century of nothing happening.
        birthTickBucket: -species.maturityMonths,
      });
    }

    for (let index = 0; index < magesPerSpecies; index += 1) {
      const mage = state.entities.create();
      attachRecord(state, MAGE, mage, {
        speciesId,
        birthTick: -species.maturityMonths,
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
  }

  return { state, mages };
}

/** A seeded `RngSource` matching a state's root seed. */
export function sourceFor(rootSeed: number): ReturnType<typeof rngFromRootSeed> {
  return rngFromRootSeed(rootSeed);
}
