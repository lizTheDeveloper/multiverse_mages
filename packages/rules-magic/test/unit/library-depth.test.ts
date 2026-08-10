/*
 * Multiverse Mages — library depth, and the proof it is applied nowhere here.
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

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import { catalogOf } from '../../src/instances/catalog.js';
import { libraryDepth } from '../../src/instances/library-depth.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  CHILD_NODE,
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  testCells,
  testWorld,
} from '../support/scenario.js';

const LIBRARY = 900;

function tieredCatalog(rootTier: number, childTier: number) {
  const base = {
    prerequisites: [] as number[],
    researchCost: 4096,
    teachCost: 1024,
    scribeCost: 2048,
    rediscoveryMultiplier: 4096,
  };
  return catalogOf([
    { ...base, nodeId: ROOT_NODE, tier: rootTier },
    { ...base, nodeId: CHILD_NODE, tier: childTier },
  ]);
}

function shelve(knowledge: KnowledgeSubsystem, nodeId: number): void {
  const grimoire = knowledge.state.entities.create();
  knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.library,
    locationId: LIBRARY,
    acquiredTick: 0,
    mastery: 0,
    grimoire,
  });
}

describe('library depth', () => {
  it('rises when another book is shelved', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const inputs = {
      knowledge,
      catalog: tieredCatalog(3, 3),
      cells: testCells,
      ruleset: permissiveRuleset(),
      library: LIBRARY,
    };

    shelve(knowledge, ROOT_NODE);
    const shallow = libraryDepth(inputs);
    shelve(knowledge, ROOT_NODE);
    expect(libraryDepth(inputs)).toBeGreaterThan(shallow);
  });

  it('weights by tier, so an equal count of deeper books is worth more', () => {
    const shallowLibrary = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const deepLibrary = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    for (const knowledge of [shallowLibrary, deepLibrary]) {
      shelve(knowledge, ROOT_NODE);
      shelve(knowledge, CHILD_NODE);
    }

    const shallow = libraryDepth({
      knowledge: shallowLibrary,
      catalog: tieredCatalog(1, 1),
      cells: testCells,
      ruleset: permissiveRuleset(),
      library: LIBRARY,
    });
    const deep = libraryDepth({
      knowledge: deepLibrary,
      catalog: tieredCatalog(5, 5),
      cells: testCells,
      ruleset: permissiveRuleset(),
      library: LIBRARY,
    });

    expect(deep).toBeGreaterThan(shallow);
  });

  it('counts dormant shelves as nothing, and destroys none of them', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    shelve(knowledge, ROOT_NODE);
    shelve(knowledge, CHILD_NODE);

    const depth = libraryDepth({
      knowledge,
      catalog: tieredCatalog(3, 3),
      cells: testCells,
      ruleset: interdicting(HOME_CELL),
      library: LIBRARY,
    });

    expect(depth).toBe(0);
    expect(knowledge.instancesAt(LOCATION_KIND.library, LIBRARY)).toHaveLength(2);
  });

  it('reports zero for a library holding nothing', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    expect(
      libraryDepth({
        knowledge,
        catalog: tieredCatalog(3, 3),
        cells: testCells,
        ruleset: permissiveRuleset(),
        library: LIBRARY,
      }),
    ).toBe(0);
  });
});

describe('the published-not-applied rule', () => {
  it('is mentioned by no other module in the knowledge subsystem', () => {
    const directory = fileURLToPath(new URL('../../src/instances/', import.meta.url));
    const offenders = readdirSync(directory)
      .filter((name) => name.endsWith('.ts'))
      .filter((name) => name !== 'library-depth.ts' && name !== 'index.ts')
      .filter((name) => readFileSync(`${directory}${name}`, 'utf8').includes('libraryDepth'));

    // `index.ts` re-exports it and `library-depth.ts` defines it. Anything else
    // naming it is this package applying its own published value, which would
    // close the capital loop of vision.md §6a inside one package and pre-decide
    // the capitalSnowball metric the harness exists to measure.
    expect(offenders).toEqual([]);
  });
});
