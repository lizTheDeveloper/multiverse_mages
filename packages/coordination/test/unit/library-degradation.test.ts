/*
 * Multiverse Mages — what an unpaid shelf costs, and what a well-made book is worth.
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
 * `durability` is the one structural difference between the species — dwarf
 * `scribeAffinity` 1792 against orc 384, a factor of nearly five — and until
 * W23 it had never changed an outcome. It was written once at scribing and read
 * only by `grimoireBurnResistCap` in a raid consequence that has never run.
 *
 * `degradeLibrary` now spends unpaid upkeep against it: a book costs
 * `max(1, floorDiv(durability, DEGRADATION_PER_SHORTFALL))` of shortfall to
 * destroy. **This file is the clean attribution.** The 2,400-tick species runs
 * that would seem to prove the same thing are hopelessly confounded — an
 * orc-only universe has fertility 1536 against a dwarf's 768 and `laborAffinity`
 * 1536 against 1280, so the two differ in population and production wholesale,
 * and the orcish reference run in fact goes *extinct* before tick 400 and
 * retains nothing for reasons that have nothing to do with how it writes. Here
 * the only thing that differs between the two arms is the number in the
 * `durability` field.
 *
 * Nothing below is a balance claim. It asserts a mechanism — that the price of
 * neglect is a function of the book — and would still hold if every magnitude
 * moved.
 */

import type { SimState } from '@mm/sim-core';
import { createState, floorDiv, rngFromRootSeed } from '@mm/sim-core';
import {
  GRIMOIRE,
  HOLDER_KIND,
  LIBRARY,
  LOCATION_KIND,
  MATERIAL_STOCK,
  UNIVERSITY,
  attachRecord,
  captureRuleset,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import type { Handle } from '@mm/state';
import type { KnowledgeRng } from '@mm/rules-magic';
import { KnowledgeSubsystem } from '@mm/rules-magic';
import { DEGRADATION_PER_SHORTFALL } from '@mm/rules-world';
import { describe, expect, it } from 'vitest';

import { CoordinatingKnowledgeGateway, EffortLedger } from '../../src/index.js';

import {
  catalogAndCells,
  nodeFacets,
  registry,
  scribingTraditionId,
  shippedAcquirePolicy,
  shippedStorePolicy,
  speciesTable,
} from './world-fixtures.js';

const ROOT_SEED = 0x0e23_0001;
const FP_ONE = 1024;

/** The three affinities the species table actually ships, as durabilities. */
const ORCISH = 384;
const REFERENCE = 1024;
const DWARVEN = 1792;

interface Shelf {
  readonly state: SimState;
  readonly knowledge: KnowledgeSubsystem;
  readonly library: Handle;
  readonly gateway: () => CoordinatingKnowledgeGateway;
}

function pinnedRng(rootSeed: number): KnowledgeRng {
  const source = rngFromRootSeed(rootSeed);
  return {
    stream: (subsystemId) => source.stream(subsystemId, 0),
    actorStream: (subsystemId, actorKey) => source.actorStream(subsystemId, 0, actorKey),
  };
}

/**
 * One library, and books on it of exactly the durabilities asked for.
 *
 * The books are attached directly rather than scribed, because scribing rolls
 * `durability` off an RNG stream and the whole point here is to hold everything
 * but that number fixed. Each book carries a **distinct** `nodeId` so that the
 * duplicates-before-singles partition cannot be what separates the two arms.
 */
function shelfOf(books: readonly Book[]): Shelf {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf, ids } = speciesTable();
  const speciesId = ids[0] as number;
  const species = speciesOf(speciesId);
  if (species === undefined) throw new Error('the shipped registry declares no species');
  const traditionId = scribingTraditionId();

  const state = createState({
    rootSeed: ROOT_SEED,
    schema: defineWorldStateSchema(),
    contentRevision: registry().contentRevision,
  });
  const universeHandle = createUniverse(state, {
    permittedTechniques: 0b11111,
    permittedForms: 0b11111111111111,
    edictBudget: 0,
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
  // `materials` left the universe layout when `city-and-supply-chain` split the
  // economy into three kinds. Zero in every kind, which is what this fixture's
  // `materials: 0` meant: the degradation path under test is charged against a
  // stock that cannot pay it.
  attachRecord(state, MATERIAL_STOCK, universeHandle, { food: 0, stone: 0, vellum: 0 });

  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 16,
    buildProgress: FP_ONE,
  });

  const knowledge = KnowledgeSubsystem.fromState(state, catalog.nodeCount);
  const efforts = new EffortLedger(state);
  const ruleset = captureRuleset(state, universeHandle);

  for (const { durability, nodeId } of books) {
    const grimoire = state.entities.create();
    attachRecord(state, GRIMOIRE, grimoire, {
      nodeId,
      durability,
      holderKind: HOLDER_KIND.library,
      holderId: library,
    });
    knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.library,
      locationId: library,
      acquiredTick: 0,
      mastery: 0,
      grimoire,
    });
  }

  return {
    state,
    knowledge,
    library,
    gateway: () =>
      new CoordinatingKnowledgeGateway({
        state,
        knowledge,
        catalog,
        cells,
        facets: nodeFacets(),
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
        rng: pinnedRng(ROOT_SEED),
        materials: { available: () => 0, consume: () => undefined },
      }),
  };
}

/** Books still on the shelf. */
function shelved(work: Shelf): number {
  return work.knowledge.instancesAt(LOCATION_KIND.library, work.library).length;
}

/** One book on the shelf: how well it was made, and what it is about. */
interface Book {
  readonly durability: number;
  readonly nodeId: number;
}

/**
 * `times` books of one durability, each about a **different** node.
 *
 * Distinct nodes throughout, so that the duplicates-before-singles partition
 * cannot be what separates two arms of a comparison — every book is a last
 * copy, and the only thing left to tell them apart is durability.
 */
function repeat(durability: number, times: number): Book[] {
  return Array.from({ length: times }, (_unused, index) => ({ durability, nodeId: index + 1 }));
}

describe('unpaid upkeep is spent against a book, not counted off a shelf', () => {
  it('destroys a well-made library more slowly than a badly made one, same shortfall', () => {
    // The one difference between the arms is the durability field. Same shelf
    // size, same shortfall, same handles, same everything else.
    const shortfall = 20 * DEGRADATION_PER_SHORTFALL;

    const dwarven = shelfOf(repeat(DWARVEN, 40));
    const orcish = shelfOf(repeat(ORCISH, 40));

    const dwarvenLost = dwarven.gateway().degradeLibrary(dwarven.library, shortfall, 1);
    const orcishLost = orcish.gateway().degradeLibrary(orcish.library, shortfall, 1);

    expect(orcishLost.destroyed).toBeGreaterThan(dwarvenLost.destroyed);
    // The ratio is the affinity ratio, because the price is linear in it:
    // 640 / floorDiv(1792, 32) = 11 dwarven books, 640 / floorDiv(384, 32) = 53
    // -- capped at the 40 on the shelf.
    expect(dwarvenLost.destroyed).toBe(floorDiv(shortfall, floorDiv(DWARVEN, DEGRADATION_PER_SHORTFALL)));
    expect(orcishLost.destroyed).toBe(40);
    expect(shelved(dwarven)).toBe(40 - dwarvenLost.destroyed);
    expect(shelved(orcish)).toBe(0);
  });

  it('prices a reference book at exactly what the flat rule used to charge', () => {
    // `durability = mul(1024, scribeAffinity) + roll`, so a scribe of the
    // reference affinity fp(1024) makes a book of ~1024, and 1024/32 = 32 --
    // the flat price every book used to pay. The change is neutral at the
    // affinity the old constant was implicitly calibrated for, which is what
    // makes it a differentiation rather than a global discount.
    const work = shelfOf(repeat(REFERENCE, 30));
    const lost = work.gateway().degradeLibrary(work.library, 10 * DEGRADATION_PER_SHORTFALL, 1);
    expect(lost.destroyed).toBe(10);
  });

  it('still destroys — a shelf whose universe pays nothing is not safe', () => {
    // The brief this came from is explicit that switching upkeep off is not the
    // fix: `degradeLibrary` is the only non-raid destruction channel in the
    // game, and a record that cannot be lost is as broken as one that cannot
    // persist. A large enough shortfall still empties the sturdiest shelf.
    const work = shelfOf(repeat(DWARVEN, 12));
    const lost = work.gateway().degradeLibrary(work.library, 12 * DWARVEN, 1);
    expect(lost.destroyed).toBe(12);
    expect(shelved(work)).toBe(0);
  });

  it('cannot destroy a book it cannot afford, and never partially', () => {
    // A shortfall one unit short of the cheapest book on the shelf takes
    // nothing. Nothing is banked for next tick -- see `applyLibraryUpkeep`.
    const work = shelfOf(repeat(DWARVEN, 5));
    const price = floorDiv(DWARVEN, DEGRADATION_PER_SHORTFALL);
    expect(work.gateway().degradeLibrary(work.library, price - 1, 1).destroyed).toBe(0);
    expect(shelved(work)).toBe(5);
    expect(work.gateway().degradeLibrary(work.library, price, 1).destroyed).toBe(1);
    expect(shelved(work)).toBe(4);
  });

  it('charges at least one for a book of no durability at all', () => {
    // Floor of 1, so that a single unit of shortfall cannot empty a shelf of
    // books that were somehow recorded with durability zero.
    const work = shelfOf(repeat(0, 100));
    const lost = work.gateway().degradeLibrary(work.library, 7, 1);
    expect(lost.destroyed).toBe(7);
  });

  it('takes nothing at all when the upkeep was paid in full', () => {
    const work = shelfOf(repeat(REFERENCE, 20));
    expect(work.gateway().degradeLibrary(work.library, 0, 1).destroyed).toBe(0);
    expect(shelved(work)).toBe(20);
  });

  it('sheds duplicates before last copies, and durability does not reorder that', () => {
    // Durability prices the shelf; it must not sort it. Two copies of node 1
    // made superbly and one copy of node 2 made badly: the brake is a cost on
    // hoarding, so the duplicate goes first even though it is the dearer book.
    const work = shelfOf([
      { durability: DWARVEN, nodeId: 1 },
      { durability: DWARVEN, nodeId: 1 },
      { durability: ORCISH, nodeId: 2 },
    ]);
    const budget = floorDiv(DWARVEN, DEGRADATION_PER_SHORTFALL);
    const lost = work.gateway().degradeLibrary(work.library, budget, 1);
    // One dwarven book destroyed, and it cost a dwarven price -- not the orcish
    // one, which a durability-ordered shelf would have taken first and which
    // would have been affordable three times over.
    expect(lost.destroyed).toBe(1);
    expect(shelved(work)).toBe(2);
  });
});
