/*
 * Multiverse Mages — where a finished book goes, and where it goes when its
 * author dies.
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
 * The world loop wrote books for twenty world years and shelved none of them:
 * every grimoire stayed in its author's hands, `libraryDepth` read zero forever,
 * and the two §7 metrics defined over it were reporting a number about an empty
 * shelf. `reference-universe.test.ts` carried that as a tripwire.
 *
 * This file pins the rule that closed it — see `gateway.ts`'s module note for
 * the argument, which is that at this build a book cannot be written except by
 * an affiliated mage at her university's desk, so the book is the institution's.
 * What is asserted here is the mechanism, not a magnitude: *whose shelf*, *how
 * many instances*, and *what death does*. Nothing below is a balance claim, and
 * nothing below would change if the rates moved.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import { createState, rngFromRootSeed } from '@mm/sim-core';
import type { Handle } from '@mm/state';
import {
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  UNIVERSITY,
  attachRecord,
  captureRuleset,
  collectRecords,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import type { KnowledgeRng } from '@mm/rules-magic';
import { KnowledgeSubsystem, MASTERY_MAX } from '@mm/rules-magic';
import { NO_INHERITOR } from '@mm/rules-world';
import { describe, expect, it } from 'vitest';

import { CoordinatingKnowledgeGateway, EffortLedger } from '../../src/index.js';

import { catalogAndCells, nodeFacets, registry, scribingTraditionId, shippedAcquirePolicy, shippedStorePolicy, speciesTable } from './world-fixtures.js';

const ROOT_SEED = 0x0e1f_0001;

/** `fp(1.0)`: a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/** How a scriptorium is set up for one case. */
interface DeskOptions {
  /** Give the universe a university. */
  readonly university?: boolean;
  /** Give that university a library. Ignored without a university. */
  readonly library?: boolean;
  /** Affiliate the mage with it. Ignored without a university. */
  readonly affiliated?: boolean;
}

interface Desk {
  readonly state: SimState;
  readonly knowledge: KnowledgeSubsystem;
  readonly mage: EntityHandle;
  readonly university: Handle;
  readonly library: Handle;
  /** A fresh gateway, as every phase of the world loop builds one. */
  readonly gateway: () => CoordinatingKnowledgeGateway;
}

/** The step RNG, pinned to one tick, as `effort-progress.test.ts` pins it. */
function pinnedRng(rootSeed: number): KnowledgeRng {
  const source = rngFromRootSeed(rootSeed);
  return {
    stream: (subsystemId) => source.stream(subsystemId, 0),
    actorStream: (subsystemId, actorKey) => source.actorStream(subsystemId, 0, actorKey),
  };
}

/** One mage, one tradition that writes things down, and whatever institution the case needs. */
function desk(options: DeskOptions = {}): Desk {
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

  let library: Handle = 0;
  let university: Handle = 0;
  if (options.university === true) {
    if (options.library !== false) {
      library = state.entities.create();
      attachRecord(state, LIBRARY, library as EntityHandle, { foundedTick: 0 });
    }
    university = state.entities.create();
    attachRecord(state, UNIVERSITY, university as EntityHandle, {
      libraryId: library,
      capacity: 16,
      buildProgress: FP_ONE,
    });
  }

  const mage = state.entities.create();
  attachRecord(state, MAGE, mage, {
    speciesId,
    birthTick: 0,
    roleId: MAGE_ROLE.researcher,
    universityId: options.affiliated === true ? university : 0,
    curiosity: species.curiosity,
    ambition: FP_ONE,
    caution: FP_ONE,
    vigor: FP_ONE,
    maxVigor: FP_ONE,
    alive: 1,
  });

  const knowledge = KnowledgeSubsystem.fromState(state, catalog.nodeCount);
  const efforts = new EffortLedger(state);
  const ruleset = captureRuleset(state, universeHandle);
  let spent = 0;

  return {
    state,
    knowledge,
    mage,
    university,
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
        materials: {
          available: () => 10_000 * FP_ONE - spent,
          consume: (amount) => {
            spent += amount;
          },
        },
      }),
  };
}

/** A node this mage could write down, granted at full mastery so she may. */
function grantedNode(work: Desk): number {
  const target = work.gateway().researchFrontier(work.mage, 1)[0];
  if (target === undefined) throw new Error('the shipped catalog offers this mage no node');
  work.knowledge.createInstance({
    nodeId: target.nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: work.mage,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  return target.nodeId;
}

/** Spends desk time until the book exists, and returns it. */
function writeOneBook(work: Desk, nodeId: number): Handle {
  for (let slice = 0; slice < 64 && componentOf(work.state, GRIMOIRE).size === 0; slice += 1) {
    work.gateway().contributeScribing(work.mage, nodeId, 256);
  }
  const books = collectRecords(work.state, GRIMOIRE);
  expect(books).toHaveLength(1);
  return (books[0] as { handle: EntityHandle }).handle;
}

/** A book's holder, and the location of the one instance that is its contents. */
function whereIs(work: Desk, grimoire: Handle) {
  const book = componentOf(work.state, GRIMOIRE);
  const instance = work.knowledge.instanceForGrimoire(grimoire);
  const view = work.knowledge.read(instance);
  return {
    holderKind: book.get(grimoire as EntityHandle, 'holderKind'),
    holderId: book.get(grimoire as EntityHandle, 'holderId'),
    locationKind: view.locationKind,
    locationId: view.locationId,
  };
}

/** Every knowledge instance in the universe, however located. */
function instanceCount(work: Desk): number {
  return componentOf(work.state, KNOWLEDGE_INSTANCE).size;
}

describe('a finished book goes to the shelf of the scriptorium that produced it', () => {
  it('shelves an affiliated mage’s book in her university’s library, from its first tick', () => {
    const work = desk({ university: true, affiliated: true });
    const nodeId = grantedNode(work);
    const grimoire = writeOneBook(work, nodeId);

    const at = whereIs(work, grimoire);
    expect(at.holderKind).toBe(HOLDER_KIND.library);
    expect(at.holderId).toBe(work.library);
    // §1.5's rewrite, not a second record: the instance names the library.
    expect(at.locationKind).toBe(LOCATION_KIND.library);
    expect(at.locationId).toBe(work.library);
  });

  it('creates one instance for the book, not one for the book and one for the shelf', () => {
    const work = desk({ university: true, affiliated: true });
    const nodeId = grantedNode(work);
    // The granted mind instance, and nothing else, before the book is written.
    expect(instanceCount(work)).toBe(1);

    writeOneBook(work, nodeId);
    expect(instanceCount(work)).toBe(2);
    // Which is the whole reason §1.5 rewrites rather than duplicates: a
    // double-counted shelved book inflates every redundancy metric in the
    // reassuring direction.
    expect(work.knowledge.instanceCount(nodeId)).toBe(2);
  });

  it('leaves the book in an unaffiliated mage’s hands, because there is no shelf', () => {
    const work = desk();
    const nodeId = grantedNode(work);
    const grimoire = writeOneBook(work, nodeId);

    const at = whereIs(work, grimoire);
    expect(at.holderKind).toBe(HOLDER_KIND.mage);
    expect(at.holderId).toBe(work.mage);
    expect(at.locationKind).toBe(LOCATION_KIND.grimoire);
    expect(at.locationId).toBe(grimoire);
  });

  it('leaves it in her hands when her university keeps no library', () => {
    // A `libraryId` of `0` is §0's absent reference, and shelving into it would
    // put the book at a location `libraryDepth` counts and `destroyLibrary` can
    // never reach — loss understated, silently.
    const work = desk({ university: true, library: false, affiliated: true });
    const nodeId = grantedNode(work);
    const at = whereIs(work, writeOneBook(work, nodeId));

    expect(work.library).toBe(0);
    expect(at.holderKind).toBe(HOLDER_KIND.mage);
    expect(at.locationKind).toBe(LOCATION_KIND.grimoire);
  });

  it('takes no draw of its own: the same seed writes the same book to either place', () => {
    // The stream-split rule, asserted where it would be easiest to break it.
    // Choosing a shelf is a state read, so a book written onto a shelf and the
    // same book written into a hand must come out of stream 5 identically — a
    // shelving draw would re-roll durability and rot every committed baseline
    // taken before it, with nothing failing to say so.
    //
    // Both universes are built with the academy, and differ only in the mage's
    // `universityId`. That is not fussiness: `contracts.md` §6 keys the scribing
    // stream on the *scribe*, so a universe holding two fewer entities gives her
    // a different handle and a legitimately different draw — which would make
    // this test pass or fail for a reason that has nothing to do with shelving.
    const shelved = desk({ university: true, affiliated: true });
    const shelvedBook = writeOneBook(shelved, grantedNode(shelved));

    const carried = desk({ university: true, affiliated: false });
    const carriedBook = writeOneBook(carried, grantedNode(carried));
    expect(carried.mage).toBe(shelved.mage);
    expect(whereIs(shelved, shelvedBook).locationKind).toBe(LOCATION_KIND.library);
    expect(whereIs(carried, carriedBook).locationKind).toBe(LOCATION_KIND.grimoire);

    const durabilityOf = (work: Desk, grimoire: Handle): number =>
      componentOf(work.state, GRIMOIRE).get(grimoire as EntityHandle, 'durability');
    expect(durabilityOf(shelved, shelvedBook)).toBe(durabilityOf(carried, carriedBook));
  });
});

describe('what death does to a book still in a mage’s hands', () => {
  /** Puts a book in the mage's own hands, whatever her affiliation. */
  function bookInHand(work: Desk): { grimoire: Handle; nodeId: number } {
    const nodeId = grantedNode(work);
    const grimoire = work.state.entities.create();
    attachRecord(work.state, GRIMOIRE, grimoire as EntityHandle, {
      nodeId,
      durability: FP_ONE,
      holderKind: HOLDER_KIND.mage,
      holderId: work.mage,
    });
    work.knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.grimoire,
      locationId: grimoire,
      acquiredTick: 0,
      mastery: 0,
      grimoire,
    });
    return { grimoire, nodeId };
  }

  it('shelves it in the inheritor’s library when she had one', () => {
    const work = desk({ university: true, affiliated: true });
    const { grimoire } = bookInHand(work);

    work.gateway().onMageDied(work.mage, work.university);

    const at = whereIs(work, grimoire);
    expect(at.holderKind).toBe(HOLDER_KIND.library);
    expect(at.holderId).toBe(work.library);
    expect(at.locationKind).toBe(LOCATION_KIND.library);
    expect(at.locationId).toBe(work.library);
  });

  it('makes it unowned when she had none — not in transit to anywhere', () => {
    // `contracts.md` §1.5, in as many words. `unowned` is `HOLDER_KIND` 0 for
    // exactly this case, and `inTransit` is the answer `mage-lifecycle` gives
    // that the contract and `death.ts` both refuse. Asserted as an inequality as
    // well as an equality, because "not in transit" is the half a later edit
    // would silently reverse.
    const work = desk();
    const { grimoire } = bookInHand(work);

    work.gateway().onMageDied(work.mage, NO_INHERITOR);

    const at = whereIs(work, grimoire);
    expect(at.holderKind).toBe(HOLDER_KIND.unowned);
    expect(at.holderKind).not.toBe(HOLDER_KIND.inTransit);
    expect(at.holderId).toBe(0);
    // An unowned book is unshelved, so its contents are back at the book itself.
    expect(at.locationKind).toBe(LOCATION_KIND.grimoire);
    expect(at.locationId).toBe(grimoire);
  });

  it('destroys her mind’s instances and none of her books', () => {
    // Vision §5's "knowledge is physical", at its sharpest: what she knew dies
    // with her, what she wrote does not. Two instances go in — the granted mind
    // copy and the book's — and exactly one comes out.
    const work = desk();
    const { nodeId } = bookInHand(work);
    expect(work.knowledge.instanceCount(nodeId)).toBe(2);

    work.gateway().onMageDied(work.mage, NO_INHERITOR);

    expect(work.knowledge.instanceCount(nodeId)).toBe(1);
    expect(componentOf(work.state, GRIMOIRE).size).toBe(1);
  });

  it('leaves a mage who died holding nothing untouched', () => {
    const work = desk({ university: true, affiliated: true });
    grantedNode(work);
    work.gateway().onMageDied(work.mage, work.university);
    expect(componentOf(work.state, GRIMOIRE).size).toBe(0);
  });
});
