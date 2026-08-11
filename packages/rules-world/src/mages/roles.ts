/*
 * Multiverse Mages — standing roles, and the affiliation changes that leave
 * them alone.
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

import type { MageRecord, MageRoleValue } from '@mm/state';
import { MAGE_ROLE } from '@mm/state';

import type { UniversityHandle } from '../coordination.js';

/**
 * ## The role is the player's single lever on a mage
 *
 * `docs/design/vision.md` §7: *"You set the role; they decide everything
 * else."* Roles are the whole of the god's direct authority over an individual
 * mage — there are no orders, not even in a raid — so the rule that a mage may
 * never change her own role is not a detail of the utility-AI, it is the
 * boundary that makes autonomy mean anything.
 *
 * That boundary is easy to erode by accident. A goal-selection routine that
 * "helpfully" switches a badly-matched professor to researcher is a small,
 * plausible, well-intentioned change that deletes a design pillar. So the write
 * lives here, in a function whose name says who is allowed to call it, and the
 * autonomy layer has no role-writing function to reach for at all.
 *
 * ## Roles persist; affiliations move
 *
 * A mage who transfers between universities keeps her role, and a mage who
 * finishes a goal keeps her role. Both are stated as scenarios in the
 * `mage-lifecycle` spec because both are the kind of thing an implementation
 * loses by writing a whole record back from a partially-populated object.
 * {@link changeAffiliation} therefore writes exactly one field, and its test
 * asserts the other nine are untouched.
 */

/**
 * The role a newly promoted mage receives when the god has not intervened.
 *
 * Researcher, per the `mage-lifecycle` spec. Aliased from `@mm/state`'s
 * enumeration rather than written as `0`: the numbering is `contracts.md` §1.2's
 * listing order, and a literal here would be a second, silent copy of it that
 * survives a renumbering.
 */
export const DEFAULT_MAGE_ROLE: MageRoleValue = MAGE_ROLE.researcher;

/** Every legal role, for validation and for iterating in a test. */
export const MAGE_ROLE_VALUES: readonly MageRoleValue[] = [
  MAGE_ROLE.researcher,
  MAGE_ROLE.warden,
  MAGE_ROLE.professor,
  MAGE_ROLE.raider,
];

/** Whether a number names a role in `contracts.md` §1.2's enumeration. */
export function isMageRole(value: number): value is MageRoleValue {
  return MAGE_ROLE_VALUES.includes(value as MageRoleValue);
}

/**
 * Sets a mage's standing role. **The god's assign-role action, and nothing
 * else, may call this.**
 *
 * @throws RangeError on a value outside the enumeration. A `uint8` field will
 * happily store 7, and a mage with role 7 falls through every role-bias lookup
 * to whatever the default branch happens to be.
 */
export function assignRole(mage: MageRecord, roleId: number): void {
  if (!isMageRole(roleId)) {
    throw new RangeError(
      `${String(roleId)} is not a mage role. contracts.md §1.2 enumerates researcher, warden, ` +
        'professor and raider, and only the god may assign one.',
    );
  }
  mage.roleId = roleId;
}

/**
 * Moves a mage to a different university, or to unaffiliated.
 *
 * Writes `universityId` and nothing else — in particular not `roleId`, which
 * the spec requires to survive the move.
 *
 * @param universityId - The new university handle, or `0` for unaffiliated.
 * `contracts.md` §0: absent references are `0`, never `-1` or `undefined`.
 */
export function changeAffiliation(mage: MageRecord, universityId: UniversityHandle): void {
  if (!Number.isInteger(universityId) || universityId < 0) {
    throw new RangeError(
      `a university handle must be a non-negative integer, received ${String(universityId)}`,
    );
  }
  mage.universityId = universityId;
}
