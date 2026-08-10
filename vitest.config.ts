/*
 * Multiverse Mages — Vitest configuration.
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

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const packageSrc = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests import workspace packages by name but run against source, so a test
    // run never depends on a prior build.
    alias: {
      '@mm/sim-core': packageSrc('sim-core'),
      // Without the alias the workspace symlink resolves @mm/content to dist/,
      // so a test could quietly pass against a stale build.
      '@mm/content': packageSrc('content'),
      '@mm/primitives': packageSrc('primitives'),
      '@mm/state': packageSrc('state'),
      '@mm/rules-magic': packageSrc('rules-magic'),
      '@mm/agent-api': packageSrc('agent-api'),
    },
  },
  test: {
    // `npm test` runs the unit tests, the golden replay suite, and the
    // adversarial suite together, in one command, so a determinism regression
    // cannot pass by running only the fast half.
    //
    // `test/adversarial` holds tests written by agents whose brief was to break
    // this package rather than to demonstrate it. They are listed explicitly
    // because a directory that is not in this glob is a directory whose tests
    // silently never run — which is how a suite grows tests nobody has executed
    // in months.
    include: [
      'packages/*/test/unit/**/*.test.ts',
      'packages/*/test/golden/**/*.test.ts',
      'packages/*/test/adversarial/**/*.test.ts',
    ],
    environment: 'node',
    // Deterministic reporting: no randomised file or test ordering.
    sequence: { shuffle: false, concurrent: false },
    // Vitest's 5s default is sized for tests that only compute. Two suites here
    // boot a real ESLint instance instead — `purity-lint.test.ts` and
    // `stacking-lint.test.ts`, which lint synthetic source to prove the bans
    // actually fire — and that first `lintText` call loads the flat config, the
    // TypeScript parser, and the plugin graph. It takes ~500 ms on an idle
    // machine and comfortably exceeds 5 s on a busy one, so the suite failed
    // intermittently, always on whichever ESLint test ran first, and always
    // with a timeout rather than an assertion. A conformance suite that goes
    // red for reasons unrelated to the code under test is a suite people learn
    // to re-run rather than read.
    //
    // Raised globally rather than per-test because the next test to boot a
    // toolchain should not have to rediscover this. Nothing here is expected to
    // take seconds, so a genuine hang still fails the run — just later.
    testTimeout: 30_000,
  },
});
