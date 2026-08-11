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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import { catalogOf } from '../../src/instances/catalog.js';
import { libraryDepth } from '../../src/instances/library-depth.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { palaceLibraryDepth } from '../../src/traditions/index.js';
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

/**
 * The published-not-applied rule, scanned over the package the spec names.
 *
 * `magic-primitives` says the check scans **`rules-magic`**. This scanned
 * `src/instances/` — which left `src/traditions/store.ts` unscanned, and
 * `store.ts` computes `palaceLibraryDepth`, the parallel depth path for the
 * Art of Memory. The rule that library depth is *published and never applied
 * here* is exactly as load-bearing for a palace's depth as for a shelf's, and
 * a `cost.ts` that discounted research by a mage's palace depth would have
 * walked past the narrower scan without a word.
 *
 * Two definers rather than one is the point of the widening: `libraryDepth`
 * lives in `instances/library-depth.ts`, `palaceLibraryDepth` in
 * `traditions/store.ts`, and they are commensurable by construction. Both are
 * *published*, both are for `mages-and-species` to consume, and neither may be
 * read inside this package.
 */
describe('the published-not-applied rule', () => {
  /** `libraryDepth`, `palaceLibraryDepth`, `libraryDepthCoefficient` — any casing. */
  const DEPTH_MENTION = /librarydepth/iu;

  /**
   * The files permitted to name a depth. Two definers and two barrels.
   *
   * Listed rather than pattern-matched so that adding a third depth path is a
   * decision somebody makes here, with this header in front of them.
   */
  const PUBLISHERS = new Set([
    'instances/library-depth.ts',
    'traditions/store.ts',
    'instances/index.ts',
    'traditions/index.ts',
  ]);

  const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));

  /** Every `.ts` file under `packages/rules-magic/src`, path-relative, sorted. */
  function sourceFiles(directory = '', out: string[] = []): string[] {
    for (const entry of readdirSync(SRC_ROOT + directory).sort()) {
      const relative = directory === '' ? entry : `${directory}/${entry}`;
      if (statSync(SRC_ROOT + relative).isDirectory()) {
        sourceFiles(relative, out);
        continue;
      }
      if (relative.endsWith('.ts')) out.push(relative);
    }
    return out;
  }

  const files = sourceFiles();

  it('scans the whole package, not one directory of it', () => {
    // "No offenders" and "the scanner never looked" are the same green run
    // otherwise. Both depth paths must be in view, in different directories.
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain('instances/library-depth.ts');
    expect(files).toContain('traditions/store.ts');
    expect(files).toContain('traditions/cost.ts');
  });

  it('is named by nothing in rules-magic outside the modules that publish it', () => {
    const offenders = files
      .filter((file) => !PUBLISHERS.has(file))
      .filter((file) => DEPTH_MENTION.test(readFileSync(SRC_ROOT + file, 'utf8')));

    expect(
      offenders,
      'A rules-magic module naming a library depth is this package applying its own published ' +
        'value, which would close the capital loop of vision.md §6a inside one package and ' +
        'pre-decide the capitalSnowball metric the harness exists to measure. Depth is reported ' +
        'to mages-and-species; it is never read back here.',
    ).toEqual([]);
  });

  it('still finds the two definitions, so the exclusions are not covering an absence', () => {
    // A publisher list can go stale in the safe-looking direction: rename
    // `palaceLibraryDepth` out of existence and the check keeps passing while
    // enforcing nothing about a path that no longer exists.
    for (const publisher of ['instances/library-depth.ts', 'traditions/store.ts']) {
      expect(DEPTH_MENTION.test(readFileSync(SRC_ROOT + publisher, 'utf8')), publisher).toBe(true);
    }
    expect(typeof libraryDepth).toBe('function');
    expect(typeof palaceLibraryDepth).toBe('function');
  });

  it('would catch the application it exists to catch', () => {
    // The staged failure, in each of the two spellings a mistake arrives in.
    expect(DEPTH_MENTION.test('const bonus = libraryDepth(inputs);')).toBe(true);
    expect(DEPTH_MENTION.test('const bonus = palaceLibraryDepth(store, palaces);')).toBe(true);
    expect(DEPTH_MENTION.test('const bonus = policy.libraryDepthCoefficient;')).toBe(true);
    // And the thing it must not mistake for one.
    expect(DEPTH_MENTION.test('const shelf = library.depthOfField;')).toBe(false);
  });
});
