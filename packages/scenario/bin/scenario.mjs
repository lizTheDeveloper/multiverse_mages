/*
 * Multiverse Mages — the scenario module `mm-run-sweep` and `mm-reproduce-run`
 * load.
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
 * `ScenarioModule` in `mc-harness/src/cli.ts`: an executor, the registries a
 * sweep file is validated against, a provenance block, and the module the
 * pool's workers load. Run `npm run typecheck` first — this loads `dist/`.
 *
 *     node packages/mc-harness/bin/run-sweep.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --sweep    ./balance/sweeps/reference-shakedown.json \
 *       --out      ./mc-results \
 *       --workers  8
 *
 * The sweep specification this package commits is `REFERENCE_SWEEP`; task 8.5
 * of `agent-interface` owns turning committed sweeps into files under
 * `balance/sweeps/`, and until it does, `--sweep` takes any file matching
 * `SweepSpec`.
 */

import { URL } from 'node:url';

import { makeReferenceExecutor, referenceProvenance, REFERENCE_REGISTRIES } from '../dist/index.js';

export const executor = makeReferenceExecutor();
export const registries = REFERENCE_REGISTRIES;
export const provenance = referenceProvenance();
export const workerUrl = new URL('./sweep-worker.mjs', import.meta.url);
