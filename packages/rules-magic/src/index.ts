/*
 * Multiverse Mages — magic rules package public surface.
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
 * `@mm/rules-magic` — grid legality, node research and teaching, knowledge
 * instances, and the four tradition hooks. Empty until `knowledge-model`.
 *
 * The skeleton exists now rather than later because the boundary it sits inside
 * is the deliverable: `contracts.md` §5 forbids this package from importing
 * `@mm/rules-world` or `@mm/agent-api`, and a rule with no package to apply to
 * is a rule nothing has ever tested. The dependency-graph test
 * (`packages/sim-core/test/unit/module-boundaries.test.ts`) asserts those edges
 * against these directories from the day the directories exist.
 *
 * Where this package and `@mm/rules-world` genuinely interact — a mage learning
 * a node — the interaction belongs in `@mm/rules-raid` or another coordinating
 * layer that imports both, never in a cycle between them.
 */

export {};
