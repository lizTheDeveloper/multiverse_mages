/*
 * Multiverse Mages — worker entry point for cross-process raid reproduction.
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
 * A bare `worker_threads` worker that builds and runs one raid, posting back
 * the outcome JSON.
 *
 * This file is `.mjs` rather than `.ts` because it must load in a bare Node
 * worker — one that has no Vitest resolver and no workspace aliases. The
 * source-resolution hook from `packages/scenario` is registered before any
 * `@mm/*` import, so the worker runs against workspace source rather than a
 * stale `dist/`.
 *
 * `workerData` carries the build parameters: `raidSeed`, `raiderNodes`,
 * `hostNodes`, and `withSoldiers`.
 */

import { parentPort, workerData } from 'node:worker_threads';

// The source-resolution hook must be registered before any `@mm/*` import.
// It uses Node 22's `registerHooks` from `node:module`, which resolves
// `@mm/<name>` to `packages/<name>/src/index.ts` and `.js` specifiers to
// `.ts` when the source exists.
import { useWorkspaceSource } from '../../../scenario/test/fixtures/source-resolution.mjs';

useWorkspaceSource();

const { buildRaid } = await import('./raid-fixture.ts');
const { runRaid } = await import('@mm/rules-raid');

const { raidSeed, raiderNodes, hostNodes, withSoldiers } = workerData;

const built = buildRaid({
  raiderNodes: [...raiderNodes],
  hostNodes: [...hostNodes],
  withSoldiers,
  seed: raidSeed,
});

const outcome = runRaid(built.raid);
const outcomeJson = JSON.stringify(outcome);

parentPort.postMessage({ outcomeJson });
