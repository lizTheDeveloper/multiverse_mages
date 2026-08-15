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
import { FP_ONE, createState, rngFromRootSeed } from '@mm/sim-core';
import type { WorldSchema } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  MATERIAL_STOCK,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  componentOf,
  createUniverse,
} from '@mm/state';
import type { AcquirePolicy, ExclusionResolver, NodeCatalog, StorePolicy } from '@mm/rules-magic';
import {
  KnowledgeSubsystem,
  MagicGrid,
  acquirePolicy,
  catalogFromRegistry,
  hookFor,
  storePolicy,
  traditionTableFrom,
} from '@mm/rules-magic';
import type { TargetAppealWeights } from '@mm/rules-world';
import {
  readApplicationWeights,
  readTargetAppeal,
  resolveSpeciesAffinities,
  territoryExtent,
  territoryYieldShares,
} from '@mm/rules-world';
import type { NodeFacetResolver, WorldStepDeps } from '../../src/index.js';
import { nodeFacetsFrom } from '../../src/index.js';

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

/** The v1 tradition's resolved `acquire` hook: what learning costs here. */
export function shippedAcquirePolicy(traditionId: number): AcquirePolicy {
  const table = traditionTableFrom(registry());
  return acquirePolicy(hookFor('acquire', traditionId, traditionId, table));
}

/**
 * A shipped tradition whose `store` hook keeps written copies.
 *
 * `traditions[0]` is not it — content ids are interned, so first is not the file
 * order, and the first tradition happens to resolve to the Art of Memory, which
 * writes nothing down and caps a mage at twelve nodes. A test of scribing under
 * that tradition asserts that the Art of Memory refuses, which is true and is
 * not what the test is for. Chosen by asking the hook rather than by naming a
 * tradition, so content may reorder without this going quietly wrong.
 */
export function scribingTraditionId(): number {
  for (const entry of registry().traditions) {
    if (shippedStorePolicy(entry.contentId).scribingAvailable) return entry.contentId;
  }
  throw new Error('no shipped tradition keeps written copies, so nothing can ever be scribed');
}

/** The node catalog and the grid's node-to-cell addressing. */
export function catalogAndCells(): { catalog: NodeCatalog; cells: ExclusionResolver } {
  const grid = MagicGrid.from(registry());
  return { catalog: catalogFromRegistry(registry()), cells: grid };
}

/** The node cell/form/effect index, over shipped content. */
export function nodeFacets(): NodeFacetResolver {
  return nodeFacetsFrom(registry());
}

/** The target-appeal weights, read from shipped `autonomy-weight.json`. */
export function appealWeights(): TargetAppealWeights {
  return readTargetAppeal(registry());
}

/** The deps a world simulation is built from, over shipped content. */
export function worldDeps(traditionId: number): WorldStepDeps {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf } = speciesTable();
  return {
    speciesOf,
    catalog,
    cells,
    facets: nodeFacets(),
    affinitiesOf: (species) => resolveSpeciesAffinities(species, registry()),
    appeal: appealWeights(),
    // Shipped, like every other magnitude here. `apply-magic` is nonetheless
    // masked for every mage in this fixture, because applicability also needs
    // `universeEffects` and that is deliberately absent — see the note below.
    application: readApplicationWeights(registry()),
    store: shippedStorePolicy(traditionId),
    acquire: shippedAcquirePolicy(traditionId),
    territory: territoryExtent(registry().territories.map((entry) => entry.record)),
    // The same records the extent is summed from, read for their yield mix
    // instead of their capacity — `scenario`'s composition root does the same
    // (`content-set.ts`). Required on `WorldStepDeps` since `w29`, so a fixture
    // that omitted it would fail to compile rather than silently step a
    // universe whose land yields nothing.
    yieldShares: territoryYieldShares(registry().territories.map((entry) => entry.record)),
    primitives: {
      lifespan: primitiveNamed('lifespan'),
      resourceYield: primitiveNamed('resource-yield'),
      // Construction's only multiplier. Present here even though this file's
      // default `worldDeps` does not wire `universeEffects` (see the note
      // below on `seededWorld`'s abundant stone), because the field is
      // required whether or not any node ever contributes to it.
      buildRate: primitiveNamed('build-rate'),
      researchRate: primitiveNamed('research-rate'),
      teachRate: primitiveNamed('teach-rate'),
      scribeRate: primitiveNamed('scribe-rate'),
      fertility: primitiveNamed('fertility'),
    },
    knowledgeFor: (state) => KnowledgeSubsystem.fromState(state, catalog.nodeCount),
    // `universeEffects` is deliberately absent here. Most of the tests in this
    // package predate the wire `universe-effects.ts` describes and assert
    // behaviour that has nothing to do with it; wiring it into the shared
    // default would make every one of them a test of the wire too, silently.
    // `universe-effects.test.ts` builds its own deps with it present, which is
    // the caller `world-step.ts`'s own doc comment names as the point of
    // making the field optional: "a thing a test can assert against rather
    // than a silent degradation."
  };
}

/** How a seeded universe starts, so two runs can be built identically. */
export interface SeedOptions {
  readonly rootSeed: number;
  /**
   * Members per starting cohort, per species, per seeded occupation.
   *
   * Small on purpose. The logistic brake in `carrying-capacity.ts` shuts births
   * off entirely at and above `K` — so a "generous" starting population is a
   * population against its own carrying capacity, in which the births phase
   * correctly does nothing and a test of it asserts nothing.
   */
  readonly cohortSize?: number;
  /** Mages seeded per species. */
  readonly magesPerSpecies?: number;
  /**
   * The universe's tradition. Defaults to the first shipped one, which is the
   * Art of Memory — see {@link scribingTraditionId} before assuming otherwise.
   */
  readonly traditionId?: number;
  /**
   * Whether to found one completed university with a library, seeded with a
   * tier-1 book so that it has a curriculum.
   *
   * **Off by default, and the default is the conservative choice rather than the
   * right one.** Since W193 enrolment requires a seat at a university that has
   * something to teach — a universe with no university produces no new mages at
   * all, which is the design (*"the more universities you have, the more latent
   * magic users you can activate"*) turned into a hard edge. So a fixture with
   * no university no longer exercises the enrolment phase.
   *
   * It is opt-in because most files in this package found their own
   * institutions and a second, invisible one would change what they are
   * measuring. `world-step.test.ts` asks for it, because its claim is that every
   * phase reports work.
   */
  readonly withUniversity?: boolean;
}

/**
 * A universe with every shipped species present as laborers, students and
 * scribes, plus a handful of mages — and, on request, one university.
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
  const traditionId = options.traditionId ?? traditions[0]?.contentId ?? 1;

  const universe = createUniverse(state, {
    // Three techniques × four forms is the v1 rectangle's shape; the exact bits
    // are the shipped content's business and the loop only asks `permits`.
    permittedTechniques: 0b11111,
    permittedForms: 0b11111111111111,
    edictBudget: 4,
    traditionId,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });
  // A working stock, not a lever on `K` — and, since `w29`, three of them
  // rather than one. Carrying capacity comes from the shipped territory
  // (`contracts.md` §2.7) and sits far above the seeded population whatever
  // the stock is; materials only modulate it, within the bound
  // `carrying-capacity.ts` states. Each kind gets the same abundant figure the
  // single scalar used to carry, so no claimant is a bottleneck by default —
  // a test that wants one starves a specific kind itself, the way
  // `knowledge-capital.test.ts` zeroes `vellum` to force a library upkeep
  // shortfall.
  attachRecord(state, MATERIAL_STOCK, universe, {
    food: 1000 * 1024,
    stone: 1000 * 1024,
    vellum: 1000 * 1024,
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

  if (options.withUniversity === true) {
    const library = state.entities.create();
    attachRecord(state, LIBRARY, library, { foundedTick: 0 });
    const university = state.entities.create();
    attachRecord(state, UNIVERSITY, university, {
      libraryId: library,
      capacity: 64,
      buildProgress: FP_ONE,
    });
    // The founding mages are its faculty. Without an affiliation the university
    // has nobody who could teach, `hasCurriculum` is false, and enrolment
    // refuses at the door — which is correct behaviour and a useless fixture.
    const store = componentOf(state, MAGE);
    store.forEach((_row, handle) => {
      store.set(handle, 'universityId', university);
    });

    // **And one book, because faculty who hold nothing teach nothing.** The
    // seeded mages arrive holding no knowledge instances at all, so the faculty
    // half of `hasCurriculum` is false at tick zero and would stay false until
    // somebody finished a research project — by which time the student cohorts
    // have aged out of nothing in particular. An endowed shelf is what an
    // institution is founded with, and it is the cheapest honest way to give
    // this fixture a curriculum.
    const { catalog } = catalogAndCells();
    let endowed = 0;
    for (let nodeId = 1; nodeId <= catalog.nodeCount && endowed < 1; nodeId += 1) {
      if (catalog.node(nodeId)?.tier !== 1) continue;
      const instance = state.entities.create();
      attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
        nodeId,
        locationKind: LOCATION_KIND.library,
        locationId: library,
        acquiredTick: 0,
        mastery: 1024,
      });
      endowed += 1;
    }
  }

  return { state, mages };
}

/** A seeded `RngSource` matching a state's root seed. */
export function sourceFor(rootSeed: number): ReturnType<typeof rngFromRootSeed> {
  return rngFromRootSeed(rootSeed);
}
