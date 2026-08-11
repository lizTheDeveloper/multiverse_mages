/*
 * Multiverse Mages — the harness's own boundary, task 3.1.
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
 * `contracts.md` §5 grants `mc-harness` exactly one edge, to `agent-api`, and
 * the workspace dependency-graph test in `packages/sim-core/test/unit` already
 * asserts it over parsed imports. What that test cannot see is the **manifest**:
 * a package can declare a dependency it does not yet import, and the day someone
 * imports it the graph test is the only thing standing in the way. This file
 * closes that gap from the harness's side, and pins two properties of the worker
 * entry point that nothing else would notice breaking.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../../', import.meta.url);

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, packageRoot)), 'utf8');
}

describe('the harness depends on agent-api and nothing else', () => {
  it('declares no runtime dependency outside the one edge §5 grants', () => {
    const manifest = JSON.parse(readSource('package.json')) as Record<string, unknown>;
    const permitted = new Set(['@mm/agent-api']);
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const declared = Object.keys((manifest[field] ?? {}) as Record<string, string>);
      for (const name of declared) {
        expect(
          permitted.has(name),
          `packages/mc-harness declares ${name}. §5 grants mc-harness one edge, to @mm/agent-api: ` +
            'the harness and a trained policy must observe the same universe through the same ' +
            'interface, or a baseline measured here would not describe what an agent sees.',
        ).toBe(true);
      }
    }
  });

  it('declares AGPL-3.0-or-later, like every package here', () => {
    const manifest = JSON.parse(readSource('package.json')) as Record<string, unknown>;
    expect(manifest['license']).toBe('AGPL-3.0-or-later');
    expect(manifest['author']).toBe('Ann Kelner');
  });

  it('is covered by the workspace dependency-graph test', () => {
    // The §5 table lives in sim-core's suite. Asserting the entry exists here
    // means deleting it there fails two suites rather than none.
    const graph = readFileSync(
      fileURLToPath(new URL('../sim-core/test/unit/module-boundaries.test.ts', packageRoot)),
      'utf8',
    );
    expect(graph).toContain("'mc-harness': { value: ['agent-api'], typeOnly: [] }");
  });
});

describe('the worker entry point stays loadable by a bare Node worker', () => {
  it('has no runtime relative imports in src/worker-main.ts', () => {
    // Node strips types from a .ts file but does not rewrite './x.js' into
    // './x.ts', so a single runtime relative import here breaks every
    // pool test with a module-resolution error that points at the wrong file.
    const source = readSource('src/worker-main.ts');
    const relative = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'(\.[^']*)'/gm)].map(
      (match) => match[1],
    );
    expect(relative).toEqual([]);

    // Not vacuous: it does import something, and it does import a type.
    expect(source).toContain("from 'node:worker_threads'");
    expect(source).toContain("import type { RunExecutor, WorkerRequest, WorkerResponse } from './protocol.js'");
  });

  it('has no runtime relative imports in the toy world the fixture worker loads', () => {
    const source = readSource('test/fixtures/toy-world.ts');
    const relative = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'(\.[^']*)'/gm)].map(
      (match) => match[1],
    );
    expect(relative).toEqual([]);
  });
});
