/*
 * Multiverse Mages — the content invariant the 3× claim stands on.
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
 * The rediscovery clamp in `research.ts` guarantees the release claim for any
 * *loaded* content. This file checks the other half: that content declaring a
 * `rediscoveryMultiplier` below `fp(3072)` never loads at all.
 *
 * The two are not redundant. The clamp keeps the claim true; the loader keeps
 * the clamp from being the only thing standing between an author and a node
 * whose declared cost silently means nothing. `knowledge-instances` requires
 * both, and a validation rule with no test that it *fires* is a rule that has
 * been correct-looking and porous since the day it was written — which is
 * exactly the history of this repository's `import()` ban.
 *
 * It lives here rather than in `packages/content` because it is this group's
 * claim that depends on it, and because the projection under test
 * ({@link catalogFromRegistry}) is this package's.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NodeRecord } from '@mm/content';
import {
  CONTENT_FILES,
  loadContent,
  memorySource,
  shippedContentSource,
  shippedDataDirectory,
  validateContent,
} from '@mm/content';

import { catalogFromRegistry } from '../../src/instances/catalog.js';
import { REDISCOVERY_MULTIPLIER_FLOOR } from '../../src/instances/constants.js';

/** The shipped data files, with one node's rediscovery multiplier rewritten. */
function contentWithMultiplier(multiplier: number): Record<string, string> {
  const directory = shippedDataDirectory();
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] = readFileSync(join(directory, fileName), 'utf8');
  }
  const nodes = JSON.parse(files['node.json'] as string) as NodeRecord[];
  const first = nodes[0];
  expect(first).toBeDefined();
  files['node.json'] = JSON.stringify(
    nodes.map((node, index) => (index === 0 ? { ...node, rediscoveryMultiplier: multiplier } : node)),
  );
  return files;
}

describe('content declaring a cheap rediscovery', () => {
  it('fails to load below the fp(3072) invariant', () => {
    const result = validateContent(memorySource(contentWithMultiplier(2048)));

    expect(result.registry).toBeUndefined();
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.pointer.endsWith('/rediscoveryMultiplier'),
      ),
    ).toBe(true);
  });

  it('loads unchanged when the same edit stays above the invariant', () => {
    const result = validateContent(memorySource(contentWithMultiplier(8192)));
    expect(result.diagnostics).toEqual([]);
  });
});

describe('the shipped node graph', () => {
  it('projects into a catalog every node of which clears the floor', () => {
    const registry = loadContent(shippedContentSource());
    const catalog = catalogFromRegistry(registry);

    expect(registry.nodes.length).toBeGreaterThan(0);
    for (const entry of registry.nodes) {
      const node = catalog.node(entry.contentId);
      expect(node).toBeDefined();
      expect(node?.researchCost).toBe(entry.record.researchCost);
      expect(node?.prerequisites).toHaveLength(entry.record.prerequisites.length);
      expect(node?.rediscoveryMultiplier).toBeGreaterThanOrEqual(REDISCOVERY_MULTIPLIER_FLOOR);
    }
  });

  it('interns prerequisites, so a prerequisite check needs no string work', () => {
    const registry = loadContent(shippedContentSource());
    const catalog = catalogFromRegistry(registry);

    for (const entry of registry.nodes) {
      const projected = catalog.node(entry.contentId);
      entry.record.prerequisites.forEach((prerequisite, index) => {
        expect(projected?.prerequisites[index]).toBe(registry.intern('node', prerequisite));
      });
    }
  });
});
