/*
 * Multiverse Mages — the worker W192's strategy sweep spawns.
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
 * `packages/scenario/bin/sweep-worker.mjs`, resolving its content through this
 * arm's opening square.
 *
 * `W192_ARM` reaches here because `worker_threads` inherits `process.env`, and
 * `armFromEnvironment` **refuses** an absent one rather than defaulting — a
 * worker that quietly ran the control would fill an arm's output with the
 * control's runs and nothing would report an error.
 */

import { serveRuns } from '@mm/mc-harness';

import { executor } from './scenario.mjs';

serveRuns(executor);
