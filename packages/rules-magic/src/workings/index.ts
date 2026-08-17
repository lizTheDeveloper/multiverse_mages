/*
 * Multiverse Mages — the workings barrel.
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

export type { StandingWorkingLike, StandingWorkings } from './standing.js';
export {
  NO_WORKINGS_STAND,
  RENEWAL_WINDOW_DENOMINATOR,
  authoredDurationOf,
  expiryTickOf,
  hasLapsed,
  isLive,
  needsRenewal,
  requiresWorking,
} from './standing.js';
