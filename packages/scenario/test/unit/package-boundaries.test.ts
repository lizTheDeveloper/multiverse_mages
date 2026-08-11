/*
 * Multiverse Mages — the composition root's own boundary, and its provenance.
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
 * This package is granted more edges than any other in the workspace, and the
 * argument for that (`contracts.md` §5, the fourth deviation) rests on two
 * claims a reader cannot check by eye: that it takes no third-party runtime
 * dependency, and that nothing depends on it. The second is asserted in
 * `sim-core`'s dependency-graph suite, where the §5 table lives; this file
 * asserts the first, and pins the two properties of the worker entry points
 * that nothing else would notice breaking.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SCENARIO_BUILD_VERSION, referenceProvenance } from '@mm/scenario';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../../', import.meta.url);
const repoRoot = new URL('../../../../', import.meta.url);

function read(base: URL, relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, base)), 'utf8');
}

describe('the scenario package pays for its edges', () => {
  it('declares no third-party runtime dependency', () => {
    const manifest = JSON.parse(read(packageRoot, 'package.json')) as Record<string, unknown>;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const name of Object.keys((manifest[field] ?? {}) as Record<string, string>)) {
        expect(
          name.startsWith('@mm/'),
          `packages/scenario declares ${name}. It is not in the dependency-purity script's ` +
            'PURE_PACKAGES — it reads the filesystem, like mc-harness — so this is the only ' +
            'thing holding the zero-third-party claim its §5 note makes.',
        ).toBe(true);
      }
    }
  });

  it('declares AGPL-3.0-or-later, like every package here', () => {
    const manifest = JSON.parse(read(packageRoot, 'package.json')) as Record<string, unknown>;
    expect(manifest['license']).toBe('AGPL-3.0-or-later');
    expect(manifest['author']).toBe('Ann Kelner');
  });

  it('is covered by the workspace dependency-graph test', () => {
    // The §5 table lives in sim-core's suite. Asserting the entry exists here
    // means deleting it there fails two suites rather than none.
    const graph = read(repoRoot, 'packages/sim-core/test/unit/module-boundaries.test.ts');
    expect(graph).toContain('scenario: {');
    expect(graph).toContain('keeps the scenario package a leaf');
  });
});

describe('a run record says which build produced it', () => {
  it('reports the workspace version rather than a number of its own', () => {
    // A constant in `executor.ts`, because a worker reading `package.json` would
    // report whichever tree it was started from. This is what keeps the constant
    // honest: bump one without the other and the suite says so, rather than a
    // baseline quietly claiming to come from a release it did not.
    const workspace = JSON.parse(read(repoRoot, 'package.json')) as { version: string };
    expect(SCENARIO_BUILD_VERSION).toBe(workspace.version);
  });

  it('fills every key a reader of a run record will assume', () => {
    const provenance = referenceProvenance();
    expect(provenance.buildVersion).toBe(SCENARIO_BUILD_VERSION);
    // §0's content revision: 32 lowercase hex characters.
    expect(provenance.contentHash).toMatch(/^[0-9a-f]{32}$/);
    expect(provenance.rngRegistryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(provenance.observationSchemaVersion).toBeGreaterThan(0);
    expect(provenance.observationLayoutDigest.length).toBeGreaterThan(0);
    expect(Object.keys(provenance.metricDefinitionVersions).length).toBeGreaterThan(0);
  });
});

describe('the worker entry points stay four lines and one difference', () => {
  it('runs the same executor in production and in the test fixture', () => {
    const production = read(packageRoot, 'bin/sweep-worker.mjs');
    const fixture = read(packageRoot, 'test/fixtures/sweep-worker.mjs');
    for (const source of [production, fixture]) {
      expect(source).toContain('serveRuns(makeReferenceExecutor(');
    }
    // The one difference: the fixture resolves the workspace to source first, so
    // a pool test never depends on a prior build.
    expect(fixture).toContain('useWorkspaceSource()');
    expect(production).not.toContain('useWorkspaceSource');
  });

  it('registers source resolution before the fixture imports anything from the workspace', () => {
    // Static imports are hoisted, so a static `import { serveRuns } from
    // '@mm/mc-harness'` here would resolve through the workspace symlink to
    // dist/ before the hook was installed — and the failure would be a stale
    // universe rather than an error.
    const fixture = read(packageRoot, 'test/fixtures/sweep-worker.mjs');
    const staticWorkspaceImports = [...fixture.matchAll(/^import\s[^;]*?from\s+'(@mm\/[^']*)'/gm)];
    expect(staticWorkspaceImports.map((match) => match[1])).toEqual([]);
    expect(fixture).toContain("await import('@mm/mc-harness')");
  });
});
