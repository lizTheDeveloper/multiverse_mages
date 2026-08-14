/*
 * Multiverse Mages — an institution owns its staff, or it is not an institution.
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

import type { EntityHandle, SimState } from '@mm/sim-core';
import { UNIVERSITY, UNIVERSITY_STAFF, attachRecord, collectRecords, componentOf } from '@mm/state';

import { BUILD_COMPLETE } from './construction.js';

/**
 * ## The component existed; nothing wrote it and nothing read it
 *
 * `contracts.md` §1.4 gives a university `staffCohorts`, and
 * `@mm/state` has carried {@link UNIVERSITY_STAFF} in `WORLD_COMPONENTS` since
 * `mages-and-species`. Until this module there was no writer and no reader, and
 * the consequence was written down in `world-step.ts` in the honest form:
 * *"Taking the whole scribe population is the honest placeholder."* Every
 * university in the universe drew on the same global pool of scribes, so
 * founding a second one cost materials and bought nothing, and a thousand of
 * them bought a thousand times nothing. That is the arithmetic behind
 * `archivist` building roughly 1,300 universities and reaching the same node
 * count as doing nothing at all.
 *
 * ## The link is whole-cohort and therefore must be injective
 *
 * `UNIVERSITY_STAFF` is `(universityId, cohortId)` and carries **no count**. So
 * a link means *this whole cohort staffs this university*, and a cohort linked
 * to two universities would have its scribes counted twice — the global-pool
 * defect again, reached by a different route. {@link staffUniversity} therefore
 * refuses a cohort that already staffs somewhere, rather than adding a second
 * row and leaving the double-count for a reader to notice.
 *
 * Adding a count field instead would be a `contracts.md` §1.4 amendment and a
 * `WORLD_SCHEMA_VERSION` bump. It is the right answer eventually — a cohort of
 * four thousand scribes split across three universities is a thing a
 * civilisation does — and it is deliberately not this change. Whole-cohort
 * links are enough to make an institution own staff, which is the claim being
 * tested.
 *
 * ## Cohort handles die, so links are pruned rather than trusted
 *
 * `CohortStore.reconcile` merges duplicate keys and mortality empties cohorts
 * outright; `world-step.ts` already refuses to hold a cohort handle across the
 * populace phase for exactly this reason. A staff link is *meant* to outlive a
 * tick — that is what makes the staff the university's rather than the moment's
 * — so the links persist and {@link pruneStaffLinks} removes the ones whose
 * cohort no longer exists, at a point in the tick where the populace phase has
 * already run. Readers here additionally skip a dead handle, because a reader
 * that trusts a link it was handed is one phase-order change away from counting
 * a destroyed cohort's scribes.
 *
 * ## Every order is by ascending handle
 *
 * The same rule `applyLibraryUpkeep` states: which university gets the staff
 * when there are not enough cohorts to go round is a question about a shared
 * resource, and answering it in scan order would make the answer depend on the
 * history that reached the state rather than on the state.
 */

/** One staffing link, as stored. */
export interface StaffLink {
  readonly handle: EntityHandle;
  readonly university: EntityHandle;
  readonly cohort: EntityHandle;
}

/** Every staffing link in the world, ascending by university then cohort. */
export function staffLinks(state: SimState): readonly StaffLink[] {
  return [...collectRecords(state, UNIVERSITY_STAFF)]
    .map(({ handle, row }) => ({
      handle,
      university: row.universityId as EntityHandle,
      cohort: row.cohortId as EntityHandle,
    }))
    .sort((a, b) => (a.university === b.university ? a.cohort - b.cohort : a.university - b.university));
}

/**
 * The cohorts staffing one university, ascending by cohort handle.
 *
 * @param isLive - Whether a cohort handle still names a cohort. Supplied
 * because the cohort store is the authority on that and this module holds no
 * reference to it. Absent, every link is taken at face value, which is correct
 * only for a caller that has just pruned.
 */
export function staffCohortsOf(
  state: SimState,
  university: EntityHandle,
  isLive?: (cohort: EntityHandle) => boolean,
): readonly EntityHandle[] {
  const cohorts: EntityHandle[] = [];
  for (const { row } of collectRecords(state, UNIVERSITY_STAFF)) {
    if (row.universityId !== university) continue;
    const cohort = row.cohortId as EntityHandle;
    if (isLive !== undefined && !isLive(cohort)) continue;
    cohorts.push(cohort);
  }
  return cohorts.sort((a, b) => a - b);
}

/** The university a cohort staffs, or `0` when it staffs none. */
export function universityOf(state: SimState, cohort: EntityHandle): EntityHandle {
  let found = 0;
  for (const { row } of collectRecords(state, UNIVERSITY_STAFF)) {
    if (row.cohortId !== cohort) continue;
    // Lowest university handle wins, so that a state which somehow holds two
    // links answers deterministically rather than by scan order.
    if (found === 0 || row.universityId < found) found = row.universityId;
  }
  return found as EntityHandle;
}

/**
 * Puts a cohort on a university's staff.
 *
 * @returns The link handle, or `0` when the link was refused — because the
 * university does not exist, or because the cohort already staffs somewhere.
 * A refusal rather than a throw: the assignment pass offers cohorts to
 * universities in a loop, and "already taken" is the ordinary case rather than
 * a defect.
 */
export function staffUniversity(
  state: SimState,
  university: EntityHandle,
  cohort: EntityHandle,
): EntityHandle {
  if (!componentOf(state, UNIVERSITY).has(university)) return 0 as EntityHandle;
  if (universityOf(state, cohort) !== 0) return 0 as EntityHandle;

  const handle = state.entities.create();
  attachRecord(state, UNIVERSITY_STAFF, handle, { universityId: university, cohortId: cohort });
  return handle;
}

/**
 * Takes a cohort off a university's staff.
 *
 * @returns Whether a link was removed.
 */
export function unstaffUniversity(
  state: SimState,
  university: EntityHandle,
  cohort: EntityHandle,
): boolean {
  const store = componentOf(state, UNIVERSITY_STAFF);
  for (const { handle, row } of collectRecords(state, UNIVERSITY_STAFF)) {
    if (row.universityId !== university || row.cohortId !== cohort) continue;
    store.remove(handle);
    state.entities.destroy(handle);
    return true;
  }
  return false;
}

/**
 * Removes links whose university or cohort no longer exists.
 *
 * @returns How many links were dropped. Reported rather than swallowed: a run
 * that prunes a link every tick is a run whose cohorts are churning, and that
 * is a fact about the populace worth surfacing rather than a housekeeping
 * detail.
 */
export function pruneStaffLinks(
  state: SimState,
  isLive: (cohort: EntityHandle) => boolean,
): number {
  const universities = componentOf(state, UNIVERSITY);
  const store = componentOf(state, UNIVERSITY_STAFF);
  const doomed = [...collectRecords(state, UNIVERSITY_STAFF)]
    .filter(
      ({ row }) =>
        !universities.has(row.universityId as EntityHandle) || !isLive(row.cohortId as EntityHandle),
    )
    .map(({ handle }) => handle)
    // Descending, so removing one cannot move another that is still to be
    // removed into a slot this loop has already passed.
    .sort((a, b) => b - a);

  for (const handle of doomed) {
    store.remove(handle);
    state.entities.destroy(handle);
  }
  return doomed.length;
}

/** A cohort offered to the assignment pass. */
export interface StaffCandidate {
  readonly cohort: EntityHandle;
  /** People in it. Used only to skip empty cohorts. */
  readonly count: number;
}

/** What one assignment pass did. */
export interface StaffAssignment {
  /** Links created, ascending by university handle. */
  readonly assigned: readonly StaffLink[];
  /** Links dropped because their cohort or university had gone. */
  readonly pruned: number;
  /**
   * Completed universities that ended the pass with no staff at all.
   *
   * The number `archivist` should have been able to see: a universe with 1,300
   * universities and forty scribe cohorts has 1,260 empty institutions, and
   * under the global pool every one of them reported full throughput.
   */
  readonly unstaffed: number;
}

/**
 * Assigns unassigned cohorts to completed universities, round-robin by handle.
 *
 * **Round-robin rather than fill-the-first.** Construction deliberately does the
 * opposite — `advanceUniversities` spends the stone budget on the first site so
 * that a shortage leaves one finished university rather than five permanently
 * unfinished ones. Staffing wants the other answer: a cohort assigned to a
 * university that already has four adds less than the same cohort assigned to
 * one that has none, and the point of the whole change is that founding an
 * institution has to buy something. Both choices are stated where they are made
 * so that a reader who finds them inconsistent can see they were decided rather
 * than inherited.
 *
 * Only **completed** universities are staffed: `construction.ts` states the edge
 * — *"A university MUST NOT admit students, host staff, or contribute library
 * capital until `buildProgress` reaches `fp(1024)`"* — and this is the "host
 * staff" half of it, which until now nothing enforced because nothing hosted
 * staff.
 *
 * Idempotent within a tick: a cohort that already staffs somewhere is skipped,
 * so calling twice assigns nothing the second time.
 */
export function assignStaff(
  state: SimState,
  candidates: readonly StaffCandidate[],
  isLive: (cohort: EntityHandle) => boolean,
): StaffAssignment {
  const pruned = pruneStaffLinks(state, isLive);

  const open = [...collectRecords(state, UNIVERSITY)]
    .filter(({ row }) => row.buildProgress >= BUILD_COMPLETE)
    .map(({ handle }) => handle)
    .sort((a, b) => a - b);

  const load = new Map<EntityHandle, number>(open.map((handle) => [handle, 0]));
  for (const link of staffLinks(state)) {
    if (load.has(link.university)) load.set(link.university, (load.get(link.university) ?? 0) + 1);
  }

  const free = [...candidates]
    .filter((entry) => entry.count > 0 && isLive(entry.cohort) && universityOf(state, entry.cohort) === 0)
    .sort((a, b) => a.cohort - b.cohort);

  const assigned: StaffLink[] = [];
  for (const entry of free) {
    if (open.length === 0) break;
    // The least-loaded open university, ties broken by ascending handle. A sort
    // per cohort rather than a heap: the loop runs once per *unassigned* cohort,
    // which is zero on almost every tick of a steady universe.
    let best = open[0] as EntityHandle;
    for (const handle of open) {
      if ((load.get(handle) ?? 0) < (load.get(best) ?? 0)) best = handle;
    }
    const handle = staffUniversity(state, best, entry.cohort);
    if (handle === 0) continue;
    load.set(best, (load.get(best) ?? 0) + 1);
    assigned.push({ handle, university: best, cohort: entry.cohort });
  }

  let unstaffed = 0;
  for (const handle of open) if ((load.get(handle) ?? 0) === 0) unstaffed += 1;

  return {
    assigned: assigned.sort((a, b) =>
      a.university === b.university ? a.cohort - b.cohort : a.university - b.university,
    ),
    pruned,
    unstaffed,
  };
}
