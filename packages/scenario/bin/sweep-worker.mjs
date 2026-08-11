/*
 * Multiverse Mages — the worker entry point a reference sweep's pool spawns.
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
 * The whole of a worker entry point, as `worker-main.ts` describes it. Run
 * `npm run typecheck` first, or `npm run verify`, which orders them: this file
 * loads the built packages, and a worker is a bare Node process with no
 * bundler in front of it.
 *
 * The test suite spawns `test/fixtures/sweep-worker.mjs` instead, which is these
 * same lines with workspace-source resolution in front of them so that a test
 * run never depends on a prior build.
 */

import { serveRuns } from '@mm/mc-harness';

import { makeReferenceExecutor } from '../dist/index.js';

serveRuns(makeReferenceExecutor());
