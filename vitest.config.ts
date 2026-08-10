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
    },
  },
  test: {
    // `npm test` runs the unit tests and the golden replay suite together, in
    // one command, so a determinism regression cannot pass by running only the
    // fast half. The golden suite lands in task group 8 under test/golden.
    include: ['packages/*/test/unit/**/*.test.ts', 'packages/*/test/golden/**/*.test.ts'],
    environment: 'node',
    // Deterministic reporting: no randomised file or test ordering.
    sequence: { shuffle: false, concurrent: false },
  },
});
