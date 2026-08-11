/*
 * Multiverse Mages — world rules package public surface.
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
 * `@mm/rules-world` — mages and their autonomy, species, populace cohorts,
 * universities, and the materials economy. Empty until `mages-and-species`.
 *
 * The skeleton exists now rather than later because the boundary it sits inside
 * is the deliverable: `contracts.md` §5 forbids this package from importing
 * `@mm/rules-magic` or `@mm/agent-api`, and a rule with no package to apply to
 * is a rule nothing has ever tested. The dependency-graph test
 * (`packages/sim-core/test/unit/module-boundaries.test.ts`) asserts those edges
 * against these directories from the day the directories exist.
 *
 * The utility-AI scoring functions for mage autonomy are deliberately left open
 * by `contracts.md` §8 and are this package's to fix.
 */

export {};
