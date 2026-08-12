/*
 * Multiverse Mages — resolving `@mm/*` to source inside a bare Node worker.
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
 * What `vitest.config.ts`'s alias table does, for a thread Vitest does not own.
 *
 * The pool spawns real `worker_threads`, and a worker is a bare Node process:
 * it knows nothing of Vitest's resolver, so `@mm/content` would resolve through
 * the workspace symlink to `packages/content/dist/index.js` — a build artefact.
 * That is the outcome this repository refuses everywhere else, in
 * `vitest.config.ts`'s own words: *"a test could quietly pass against a stale
 * build"*. Worse for a scenario test specifically, because the thing under test
 * is what a universe is made of, and a stale `dist/` is a different universe.
 *
 * The harness's own pool fixture dodges this by having its toy world import
 * nothing at runtime. A real universe cannot: it is `@mm/content`,
 * `@mm/coordination` and `@mm/agent-api` composed. So this file reproduces the
 * alias table with Node's synchronous module hooks, and the worker registers it
 * before importing anything.
 *
 * Two rules, both of which Node's type stripping needs:
 *
 * 1. `@mm/<name>` resolves to `packages/<name>/src/index.ts`.
 * 2. A relative `./x.js` whose `./x.ts` exists resolves to the `.ts`. Node
 *    strips types from a `.ts` file but does **not** rewrite specifiers, and
 *    every source file in this workspace writes `./x.js` because that is what
 *    `NodeNext` emits.
 *
 * It is test-only. Production loads the built package: see `bin/sweep-worker.mjs`.
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { URL, fileURLToPath } from 'node:url';

/** From packages/scenario/test/fixtures/ up to the repository root. */
const REPO_ROOT = new URL('../../../../', import.meta.url);

const WORKSPACE_SCOPE = '@mm/';

/**
 * Points this thread's module resolver at workspace source.
 *
 * Idempotent in practice — a worker calls it once, before its first import —
 * and deliberately not exported as anything a `src/` module could reach.
 */
export function useWorkspaceSource() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith(WORKSPACE_SCOPE)) {
        const name = specifier.slice(WORKSPACE_SCOPE.length);
        return {
          url: new URL(`packages/${name}/src/index.ts`, REPO_ROOT).href,
          shortCircuit: true,
        };
      }
      if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL !== undefined) {
        const asSource = new URL(`${specifier.slice(0, -'.js'.length)}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(asSource))) {
          return { url: asSource.href, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
  });
}
