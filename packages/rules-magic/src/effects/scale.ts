/*
 * Multiverse Mages — routing an effect by the scale its primitive declares.
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

import type { PrimitiveRecord, PrimitiveScale } from '@mm/content';
import type { TimeMode } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';

/**
 * Whether a primitive of this scale applies in this clock mode.
 *
 * `contracts.md` §3 gives every primitive a scale, and exactly one of them —
 * `concealment` — is `both`. That single row is why this is a function rather
 * than a comparison at the call site: `scale === mode` is correct for fifteen
 * primitives and silently wrong for the sixteenth, and the way it is wrong is
 * that concealment stops working in world time, which reads as a balance
 * result rather than as a bug. A raider who cannot be *detected* at world scale
 * and a raider who cannot be *targeted* in combat are two different mechanics
 * and `contracts.md` §3 gives them one primitive.
 *
 * The `switch` is exhaustive over {@link PrimitiveScale} with no `default`, for
 * the reason `@mm/primitives`' own dispatch is: a scale added to
 * `primitive.schema.json` without a decision here should be a compile error,
 * not an effect that quietly applies nowhere.
 */
export function appliesInMode(scale: PrimitiveScale, mode: TimeMode): boolean {
  switch (scale) {
    case 'world':
      return mode === TIME_MODE.world;
    case 'engagement':
      return mode === TIME_MODE.engagement;
    case 'both':
      return true;
  }
}

/** {@link appliesInMode}, taking the registry record rather than its field. */
export function primitiveAppliesInMode(primitive: PrimitiveRecord, mode: TimeMode): boolean {
  return appliesInMode(primitive.scale, mode);
}
