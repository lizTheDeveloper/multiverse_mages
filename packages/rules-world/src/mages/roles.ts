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
import { GOD_ASSIGNABLE_MAGE_ROLES, MAGE_ROLE, isGodAssignableRole } from '@mm/state';

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

/**
 * Every legal role, for validation and for iterating in a test.
 *
 * **Five since W193, and the fifth is not assignable.** `student` is a real role
 * — it is written into `roleId`, it has a `ROLE_BIAS` row, and a mage wearing it
 * is a living mage in every scan — so it belongs in the list a validator checks
 * against. It does not belong in {@link GOD_ASSIGNABLE_MAGE_ROLES}, which is the
 * separate, narrower list the god's action 10 enumerates.
 */
export const MAGE_ROLE_VALUES: readonly MageRoleValue[] = [
  MAGE_ROLE.researcher,
  MAGE_ROLE.warden,
  MAGE_ROLE.professor,
  MAGE_ROLE.raider,
  MAGE_ROLE.student,
];

/** Whether a number names a role in `contracts.md` §1.2's enumeration. */
export function isMageRole(value: number): value is MageRoleValue {
  return MAGE_ROLE_VALUES.includes(value as MageRoleValue);
}

/**
 * Sets a mage's standing role. **The god's assign-role action, and nothing
 * else, may call this.**
 *
 * **`student` is rejected here even though it is a legal role.** Enrolment is
 * the only writer of it and graduation the only clearer, and a god able to send
 * a professor back to school would be a lever §7 never granted him — as well as
 * a fifth entry in action 10's candidate space, which every trained policy is
 * sized against. The refusal is a `RangeError` rather than a silent no-op for
 * the reason the paragraph below gives about role 7: a write that quietly does
 * nothing is indistinguishable from one that worked.
 *
 * @throws RangeError on a value outside the enumeration, or on `student`. A
 * `uint8` field will happily store 7, and a mage with role 7 falls through every
 * role-bias lookup to whatever the default branch happens to be.
 */
export function assignRole(mage: MageRecord, roleId: number): void {
  if (!isGodAssignableRole(roleId)) {
    throw new RangeError(
      `${String(roleId)} is not a role the god may assign. contracts.md §1.2 enumerates ` +
        'researcher, warden, professor and raider; `student` is written by enrolment and cleared ' +
        'by graduation, and by nothing else.',
    );
  }
  mage.roleId = roleId;
}

/** The four roles the god may assign, re-exported so callers need one import. */
export const ASSIGNABLE_MAGE_ROLES = GOD_ASSIGNABLE_MAGE_ROLES;

/**
 * Whether this mage is enrolled and has not yet graduated.
 *
 * One predicate rather than `roleId === MAGE_ROLE.student` scattered across four
 * packages, because *"is she a student"* is asked by things that have nothing to
 * do with each other — who may teach, who defends a portal, which bias row she
 * scores against, whether her seat is taken — and each of those is a place the
 * comparison could be written the wrong way round exactly once.
 */
export function isStudent(roleId: number): boolean {
  return roleId === MAGE_ROLE.student;
}

/**
 * Graduates a student into the default standing role.
 *
 * ## Graduation is curriculum completion, and this function does not decide it
 *
 * *"They're students until they learn everything that the university they
 * enrolled in can teach them."* The **condition** lives in `@mm/coordination`,
 * because deciding it requires reaching across the port into `rules-magic` for
 * what a shelf holds and what a colleague could pass on, and `contracts.md` §5
 * rule 3 keeps `rules-world` out of `rules-magic`. What lives *here* is the
 * write, next to {@link assignRole}, so that there is exactly one file that can
 * change a `roleId` and a reviewer has one place to check.
 *
 * ## What this replaces
 *
 * The old promotion gate was `worldTick - birthTickBucket >= maturityMonths` —
 * **age since birth** — which is why `teach-rate` was inert. A rate that makes
 * lessons land faster cannot move a date fixed at birth, and the measurement
 * said so: research completions `+28.8%`, `nodesKnown` `+58.6%`, lessons
 * `+0.1%`, living mages flat. Teaching now moves the date, because the date is
 * *when she has learned it all*.
 *
 * She keeps her university. A graduate stays where she studied until she
 * chooses otherwise, which is `affiliate`'s decision and not this one.
 */
export function graduate(mage: MageRecord): void {
  if (!isStudent(mage.roleId)) {
    throw new RangeError(
      `only a student graduates; this mage holds role ${String(mage.roleId)}. Calling this on a ` +
        'standing mage would reset her role to researcher, which is the god\'s write and not ' +
        'the world loop\'s.',
    );
  }
  mage.roleId = DEFAULT_MAGE_ROLE;
}

/** The role a mage is enrolled at. Written by the enrolment phase only. */
export const STUDENT_MAGE_ROLE: MageRoleValue = MAGE_ROLE.student;

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
