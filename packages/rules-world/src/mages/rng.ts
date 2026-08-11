/*
 * Multiverse Mages — the randomness handle the mage lifecycle draws from.
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

import type { StepContext } from '@mm/sim-core';

/**
 * The step-bound RNG: `StepContext['rng']`.
 *
 * Aliased here rather than imported by name because `@mm/sim-core`'s barrel
 * exports `StepContext` and not the `StepRng` interface behind its `rng` field.
 * Projecting the field is exact — it is the same type, not a structural
 * lookalike that could drift — and it costs this package no change to a file
 * another agent owns.
 *
 * **The tick is already bound, and that is the whole point.** `RngSource` takes
 * a tick per call; `StepRng` does not, because the step supplies it. There is
 * therefore no correct-tick discipline for a rules author to remember here, and
 * no way to draw last month's randomness by passing a stale number.
 */
export type StepRng = StepContext['rng'];
