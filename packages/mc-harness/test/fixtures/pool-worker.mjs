/*
 * Multiverse Mages — the worker entry point the pool tests spawn.
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
 * What a real worker entry point looks like, in full. In production it is:
 *
 * ```js
 * import { serveRuns } from '@mm/mc-harness';
 * import { executor } from './my-scenario.js';
 * serveRuns(executor);
 * ```
 *
 * Here it reaches into `../../src/` with explicit `.ts` extensions instead of
 * importing the package, and that difference is the whole reason this file is
 * `.mjs` rather than `.ts`:
 *
 * - It must load in a **bare Node worker**, not under Vitest, because that is
 *   what the pool actually spawns. So it may not rely on the workspace alias.
 * - It must run against **source**, not `dist/`, because a test that only
 *   passes after a build is a test that silently stops covering anything the
 *   day someone runs `vitest` on its own.
 * - Node strips types from a `.ts` file but does **not** rewrite a `./x.js`
 *   specifier into `./x.ts`. Hence the explicit `.ts` extensions here, and hence
 *   the rule that `src/worker-main.ts` and `toy-world.ts` carry no runtime
 *   relative imports of their own.
 */

import { workerData } from 'node:worker_threads';

import { serveRuns } from '../../src/worker-main.ts';
import { makeToyExecutor } from './toy-world.ts';

serveRuns(makeToyExecutor(workerData ?? {}));
