/*
 * Multiverse Mages — the worker entry point a reference sweep's pool spawns,
 * running against source.
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
 * The production entry point is four lines and lives in `bin/sweep-worker.mjs`.
 * This is the same four lines with workspace source resolution in front of
 * them, so the pool tests spawn a worker that runs *this tree's* universe rather
 * than whatever was last built into `dist/`.
 *
 * The imports are dynamic because the hooks must be registered before the first
 * `@mm/*` specifier is resolved, and static imports are hoisted above every
 * statement in the module.
 *
 * `workerData` carries an optional census interval, so a test can ask a worker
 * for a denser sampling grid than the default without a second entry point.
 */

import { workerData } from 'node:worker_threads';

import { useWorkspaceSource } from './source-resolution.mjs';

useWorkspaceSource();

const { serveRuns } = await import('@mm/mc-harness');
const { makeReferenceExecutor } = await import('@mm/scenario');

serveRuns(makeReferenceExecutor(workerData ?? {}));
