/*
 * Multiverse Mages — completing `affiliate`, which is one field write and no
 * journey.
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

import type { MageRecord } from '@mm/state';

import type { UniversityHandle } from '../coordination.js';
import { changeAffiliation } from '../mages/roles.js';
import type { MageOutlook } from './outlook.js';

/**
 * ## The whole mechanism is one assignment, and that is the requirement
 *
 * `mage-autonomy`: *"WHEN a mage selects `affiliate` and the goal completes
 * THEN its `universityId` changes in that tick with no intervening travel
 * state."* `contracts.md` §0 and vision §7a are the reason — world-scale
 * entities have no coordinates, so there is nowhere to travel *from* and no
 * duration a journey could take.
 *
 * This module exists because the tempting elaboration is small and looks like
 * flavour: a `travellingTo` field, a couple of ticks in transit, a mage who is
 * "between universities". Every one of those is a position model in disguise —
 * a duration is a distance divided by a speed — and adding one would mean the
 * mage component carries state that `contracts.md` §1.2 does not list, for a
 * fiction the design has already decided against.
 *
 * ## Role survives the move
 *
 * {@link changeAffiliation} writes exactly one field, and `roles.ts` explains
 * why that is enforced there rather than trusted here. This function adds only
 * the choice of destination.
 *
 * ## Why the outlook is a `Pick` and not a `MageOutlook`
 *
 * The caller is the **work phase**, which runs before the autonomy phase and
 * builds no outlooks: `spendTheMonth` walks a slot-ordered roster reading two
 * columns, and constructing the frontier scan a full `MageOutlook` needs — for
 * every mage, every tick, to answer a question about one field — is the
 * unbounded work the outlook shape exists to bound. Two fields are all this
 * function has ever read, and `universityPreference` produces both from one
 * scan of the shelves. Naming exactly those two is what lets the phase that has
 * them call this without pretending to be a phase that does not.
 */

/**
 * The part of a {@link MageOutlook} affiliation is decided from.
 *
 * Both fields come from `universityPreference`, and they are a pair: the
 * boolean is `preferred !== current`, computed once so that no second
 * computation can disagree with it.
 */
export type AffiliationPreference = Pick<
  MageOutlook,
  'betterAffiliationAvailable' | 'preferredUniversity'
>;

/**
 * Applies a completed `affiliate` goal.
 *
 * @param outlook - The outlook from the tick the goal *completed* in, not the
 * one it was adopted in. `MageOutlook.preferredUniversity` is resolved fresh
 * for exactly this reason: a handle held across a commitment period is a handle
 * that may since have been destroyed and its slot reissued to something else,
 * and the generation counter in the handle would make that a silent no-op
 * rather than a visible failure.
 * @returns The handle the mage now belongs to. Equal to her previous one when
 * the outlook offers nowhere better, which is a completed goal that changed
 * nothing rather than an error — the universe may have lost the university she
 * was aiming at while she was deciding.
 */
export function completeAffiliation(
  mage: MageRecord,
  outlook: AffiliationPreference,
): UniversityHandle {
  const destination = outlook.betterAffiliationAvailable ? outlook.preferredUniversity : mage.universityId;
  changeAffiliation(mage, destination);
  return destination;
}
