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
  MATERIAL_STOCK,
  OCCUPATION,
  POPULACE_COHORT,
  attachRecord,
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
    casting: { vellumPerMonth: 0 },
    // Zero, like `casting` above: the shared fixture prices nothing, so a test
    // that wants a sink to bind supplies its own weights. `material-economy`'s
    // two world-loop sinks follow that convention rather than inventing a
    // default nobody authored.
    teaching: { insightPerMonth: 0, insightTeachBonus: 0 },
    hiredLabour: { laborPerMonth: 0 },
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
   * The permitted-form bitmask, defaulting to all fourteen.
   *
   * Present because `material-economy` made seven more forms economically live:
   * with every form permitted, a mage in this fixture researches whatever the
   * frontier offers and may apply a node in a form the test is not about, so an
   * assertion of the shape *"this run produced only `insight`"* is a statement
   * about what the roster happened to study. Narrowing the ruleset is what
   * makes such an assertion about the routing table instead.
   */
  readonly permittedForms?: number;
  /** The permitted-technique bitmask, defaulting to all five. */
  readonly permittedTechniques?: number;
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
  const traditionId = options.traditionId ?? traditions[0]?.contentId ?? 1;

  const universe = createUniverse(state, {
    // Three techniques × four forms is the v1 rectangle's shape; the exact bits
    // are the shipped content's business and the loop only asks `permits`.
    permittedTechniques: options.permittedTechniques ?? 0b11111,
    permittedForms: options.permittedForms ?? 0b11111111111111,
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
    labor: 0,
    essence: 0,
    insight: 0,
    passage: 0,
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

/** The permitted-form bit for one shipped form, as a mask. */
export function formMask(...formIds: readonly string[]): number {
  let mask = 0;
  for (const formId of formIds) {
    const form = registry().forms.find((entry) => entry.record.id === formId);
    if (form === undefined) throw new Error(`form.json declares no "${formId}"`);
    mask |= 1 << form.record.bit;
  }
  return mask;
}

/** A seeded `RngSource` matching a state's root seed. */
export function sourceFor(rootSeed: number): ReturnType<typeof rngFromRootSeed> {
  return rngFromRootSeed(rootSeed);
}
