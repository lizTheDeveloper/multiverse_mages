/*
 * Multiverse Mages — agent interface package public surface.
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
 * `@mm/agent-api` — the fixed-shape observation vector, the discrete masked
 * action space, the outcome record, and the explain channel. Empty until
 * `agent-interface` (task group 4 of this change).
 *
 * Two properties of this package are structural rather than stylistic:
 *
 * 1. **This is the only place floating point is permitted.** `contracts.md`
 *    §4.1 pins the exported observation as a `Float64Array` in `[0, 1]` with
 *    `fp(1024)` mapping to `1.0`. Normalization happens here, at the boundary,
 *    precisely so the float ban holds everywhere behind it. That is why this
 *    package is outside the `RULES_SRC` lint block in `eslint.config.mjs`.
 * 2. **Nothing in the rules path may import it.** §5 rule 4: the dependency
 *    runs one way. A rules package that could read the observation layer would
 *    make the observation an input to the simulation, and the fixed shape RL
 *    depends on would start feeding back into the thing it measures.
 */

export {};
