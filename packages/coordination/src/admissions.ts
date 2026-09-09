/*
 * Multiverse Mages — the university admission pass: capacity refuses, and the
 * refusal is a number.
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
 * ## What was wrong, measured rather than argued
 *
 * `universities/capacity.ts` states the spec it implements: *"Admission beyond
 * capacity MUST be refused rather than silently truncated, and the refused
 * demand MUST be observable."* It then states the reason, which is the reason
 * this file exists: *"a bound that is never observed to bind is a bound nobody
 * can tune."*
 *
 * Until this pass, `admitStudents` and `AdmissionRefusals` had no caller
 * outside their own unit tests, and the world loop implemented the **silent
 * truncation** the spec forbids: `world-step.ts` passed
 * `universityCapacity: completedCapacity(state)` straight into
 * `computeOccupationDemand`, which makes `demand[student]` *equal* to the seat
 * count. `reallocateOccupations` then moves `demand − supply` people into
 * `student` and stops. Nobody is ever refused, because nobody is ever asked.
 *
 * The reference universe at `cohortSize 4`, seed `0x00090001`, 600 ticks,
 * measured on this tree before the change:
 *
 * | tick | students | idle | seats |
 * | ---: | ---: | ---: | ---: |
 * | 120 | 11 | 17 | 64 |
 * | 240 | 28 | 17 | 64 |
 * | 360 | 55 | 16 | 64 |
 * | 480 | **64** | 52 | 64 |
 * | 600 | **64** | 132 | 64 |
 *
 * Students pin to exactly the seat count and stay there while the idle
 * population triples past it. That is a capacity bound *binding hard* — and
 * producing no observable of any kind, because it binds through the demand
 * signal rather than through a refusal. A hundred and thirty-two people were
 * turned away from a university at tick 600 and the run said nothing.
 *
 * ## What this pass does, and the one thing it deliberately does not
 *
 * It asks the question in the order the spec asks it:
 *
 * 1. **Who wants a seat.** The students already studying, plus the idle who are
 *    permitted to become students — the same predicate `reallocateOccupations`
 *    applies at the move, {@link mayTransitionTo}, so the want and the move
 *    cannot disagree about who is eligible. `sourcePriorityFor(student)` is
 *    `[idle]` and nothing else, which is why no other occupation is counted:
 *    `reallocation.ts` records the measurement behind that rule, and a want
 *    that counted scribes would be a want the mover could never satisfy.
 * 2. **How many the universities can take.** {@link admitStudents} against
 *    {@link effectiveCapacity}, per university, in ascending handle order.
 * 3. **What is left.** The residual is the refusal, and it is reported.
 *
 * What it does **not** do is move anybody. The seat grant becomes
 * `demand[student]`, and `reallocateOccupations` remains the only thing that
 * changes an occupation. Two writers of the occupation column is the
 * second-source-of-truth defect this codebase spends most of its comments
 * avoiding, and the rate limit — `contracts.md`'s governor that cannot
 * bang-bang — lives in the mover.
 *
 * ## Why this cannot reduce anybody's intake, which is checkable arithmetic
 *
 * Old demand is `seats`. New demand is `min(students + eligibleIdle, seats)`.
 * `reallocateOccupations` computes `need = demand − students`, so:
 *
 *     need_new = min(eligibleIdle, seats − students)  ≤  seats − students = need_old
 *
 * and `need_new ≥ min(eligibleIdle, …)` is still at least every person the
 * mover could physically have taken, because the mover can only take from
 * eligible idle cohorts in the first place. So the number of people who
 * actually become students is **unchanged**, and what changes is the two
 * observables: `unmetDemand[student]` stops reporting seats nobody could ever
 * have filled (`reallocation.ts` measured that phantom at thirty thousand
 * person-ticks over a 600-tick run), and {@link AdmissionOutcome.refused}
 * starts reporting the people the bound actually turned away.
 *
 * ## No draw is taken
 *
 * Every order here is total and derived from state — ascending university
 * handle, and a walk over the cohort store — so no RNG stream moves and
 * `contracts.md` §6's insertion invariance is untouched. Nothing in
 * `sim-core/src/rng/streams.ts` changes.
 *
 * ## Where the refusal lives, and why it is not a component
 *
 * In the tick report, beside `affiliationsRefused`, which is the identical kind
 * of number for the mage half of the same bound. `world-step.ts` states the
 * rule for both: *"a projection stored in state would be inside every snapshot
 * and therefore inside every hash — at which point two peers could 'desync'
 * over a number no rule reads."* A cumulative refusal tally in world state
 * would be exactly that.
 *
 * "Observable after a save" is satisfied the stronger way instead: every input
 * this pass reads — cohort counts, cohort keys, `UNIVERSITY.capacity`,
 * `UNIVERSITY.buildProgress` — is already in the snapshot, so a universe
 * restored from a save and stepped reports the same refusal. That is a property
 * a stored counter would only imitate, and
 * `admissions-survive-a-save.test.ts` checks it by round-tripping the state.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import type { UniversityRecord } from '@mm/state';
import { OCCUPATION, UNIVERSITY, collectRecords } from '@mm/state';
import type { AdmissionOutcome, CohortStore, SpeciesDemographyLookup } from '@mm/rules-world';
import {
  AdmissionRefusals,
  RETIREMENT_NORMALIZED_AGE,
  admitStudents,
  cohortAgeMonths,
  effectiveCapacity,
  mayTransitionTo,
  normalizedCohortAge,
  requireDemography,
} from '@mm/rules-world';

/** Seats one university refused this tick. */
export interface StudentRefusal {
  /** The university handle. */
  readonly university: EntityHandle;
  /**
   * Applicants it turned away.
   *
   * **Offers refused at this door, not people refused a seat.** An applicant
   * turned away by a full university and admitted by the next one is counted
   * here and is *not* counted in {@link StudentAdmissions.refused} — which is
   * the pair of facts capacity tuning needs, and the same distinction
   * `settleAffiliations` draws for mages. This one answers *"how many more
   * seats would this university have filled"*; the universe-level figure
   * answers *"how many people studied nowhere"*.
   */
  readonly refused: number;
}

/** One tick's admission decision for the whole universe. */
export interface StudentAdmissions {
  /** Students studying plus idle people eligible to study. */
  readonly applicants: number;
  /**
   * Seats granted across every completed university.
   *
   * This is what `demand[student]` becomes. Never above the seat count and
   * never above {@link StudentAdmissions.applicants}.
   */
  readonly granted: number;
  /**
   * Applicants who got a seat nowhere. The number the spec requires.
   *
   * ## It is offers refused at a door, and in the reference universe it is not
   * the bound that binds. Measured, not argued.
   *
   * *2026-08-17, `integration/all-branches` @ `49597350`,
   * `node scripts/w257-university-refill-probe.mjs --ticks 900` — the reference
   * universe at `cohortSize 4`, seed `0x00090001`:*
   *
   * | tick | refused | seats | seats **free** | `unseated` |
   * | ---: | ---: | ---: | ---: | ---: |
   * | 337 | 23 | 64 | 58 | 0 |
   * | 601 | 182 | 64 | 57 | 0 |
   * | 841 | 460 | 64 | **56** | 0 |
   *
   * Four hundred and sixty people turned away from an academy with fifty-six
   * empty chairs, on the same tick, in the same report. Both numbers are
   * correct and they are about different gates:
   *
   * - **This one** counts everybody `countApplicants` calls eligible — which is
   *   every non-senescent idle person, children included — against
   *   `effectiveCapacity`. It is the *want*.
   * - `demand[student]` is then `min(min(granted, sited), latentMagicUsers)`,
   *   and `latentMagicUsers` applies `prevalence` **and only counts school-age
   *   cohorts**. In this run it sits at 14–34 for the whole nine hundred ticks,
   *   always *below* the 64 seats. So the seats never actually constrain
   *   anything, and `WorldStepReport.unseated` — the count of people who
   *   reached the enrolment gate and found no chair — is **zero on every tick**.
   *
   * The consequence for a reader, and it is the one worth carrying away: on
   * this build **a non-zero `refused` is not evidence that another university
   * would activate another mage.** `latent` is the operative bound, so more
   * seats change nothing until the populace does. `unseated` is the number that
   * moves when a god funds a building; this one moves when the populace grows.
   *
   * Whether the applicant pool *ought* to be filtered through `prevalence` so
   * that the two agree is a design decision and is deliberately not taken here.
   */
  readonly refused: number;
  /** Per-university refusals, ascending by handle. Empty when nobody refused. */
  readonly byUniversity: readonly StudentRefusal[];
}

/**
 * Nobody applied and nobody was refused — an empty world's answer.
 *
 * Deliberately **not exported**. It is the shape of a zero, not a value another
 * module has any business holding, and an exported constant with no production
 * caller is precisely what `scripts/check-reachability.mjs` exists to report.
 */
const NO_ADMISSIONS: StudentAdmissions = Object.freeze({
  applicants: 0,
  granted: 0,
  refused: 0,
  byUniversity: Object.freeze([]) as readonly StudentRefusal[],
});

/** What the pass needs to know about the world outside the entity store. */
export interface AdmissionOptions {
  /** Lifespan and maturity per species, for the eligibility predicate. */
  readonly species: SpeciesDemographyLookup;
  /** The tick being stepped. Cohort age is measured against it. */
  readonly worldTick: number;
}

/**
 * Seats this tick's applicants against every completed university.
 *
 * Called before `stepPopulace`, because its answer is an input to
 * `computeOccupationDemand` and that is `stepPopulace`'s argument. The
 * consequence is that the applicant pool is counted before this tick's deaths,
 * exactly as `completedCapacity(state)` was read before them; a want is not an
 * affordability check, and `demand.ts` says so about the scribing queue for the
 * same reason.
 *
 * @returns The decision. A universe that has finished no university refuses
 * every applicant rather than seating them — an unfinished site has
 * {@link effectiveCapacity} zero — and its `byUniversity` is empty, because a
 * building that is not open did not turn anybody away.
 */
export function admitStudentBodies(
  state: SimState,
  cohorts: CohortStore,
  options: AdmissionOptions,
): StudentAdmissions {
  const applicants = countApplicants(cohorts, options);
  // Nobody wants a seat, so nobody is refused one and no university is asked.
  // The early return is the difference between an empty `byUniversity` and one
  // listing every completed university with a refusal of zero — and
  // `AdmissionRefusals.record` already treats zero as a no-op for the same
  // reason: a university that turned nobody away did not refuse.
  if (applicants === 0) return NO_ADMISSIONS;

  // Ascending handle. The only quantity this pass arbitrates is a seat, and
  // `staff.ts` states the argument for the same choice: which claimant gets the
  // last unit of a shared resource must depend on the state and not on the
  // destroy history that reached it. Library depth is deliberately *not* the
  // order — that would be a second policy beside `universityPreference`'s, and
  // a policy is only worth having where it changes an outcome the loop can see.
  const universities: { handle: EntityHandle; row: UniversityRecord }[] = [];
  for (const { handle, row } of collectRecords(state, UNIVERSITY)) {
    // Half-built universities are skipped rather than asked. `admitStudents`
    // would answer for one correctly — `effectiveCapacity` is zero until
    // `buildProgress` reaches `fp(1024)`, so it admits nobody — but it would
    // then record a refusal against a building nobody could have attended, and
    // `byUniversity` is supposed to say which *institutions* are short of
    // seats. `construction.ts` calls this the single gate on "is this place
    // open", and reading `buildProgress` here instead would be the second
    // place that decides it.
    if (effectiveCapacity(row) <= 0) continue;
    universities.push({ handle, row });
  }
  universities.sort((a, b) => a.handle - b.handle);

  const refusals = new AdmissionRefusals();
  let granted = 0;
  let remaining = applicants;
  for (const entry of universities) {
    // `hosted` is zero because a student is not linked to a university in world
    // state — `contracts.md` §1.4 puts `staffCohorts` on the university and
    // gives students no such edge — so the whole applicant pool is seated
    // afresh each tick rather than accumulated. `capacity.ts` licenses exactly
    // this reading: *"capacity is concurrent, not cumulative … admission is a
    // function of the hosted count now."*
    const outcome: AdmissionOutcome = admitStudents(entry.row, 0, remaining);
    granted += outcome.admitted;
    refusals.record(entry.handle, outcome.refused);
    remaining = outcome.refused;
    if (remaining === 0) break;
  }

  const byUniversity = refusals
    .universities()
    .map((university) => ({ university, refused: refusals.at(university) }));

  return { applicants, granted, refused: remaining, byUniversity };
}

/**
 * People who would take a university seat this tick.
 *
 * Students plus eligible idle. A senescent cohort is excluded by
 * {@link mayTransitionTo} — `occupations.ts` retires it into `idle` and forbids
 * it every destination but `idle` — which is what keeps this figure from
 * counting the retired population that the reference run's idle column is
 * mostly made of.
 */
function countApplicants(cohorts: CohortStore, options: AdmissionOptions): number {
  let applicants = 0;
  cohorts.forEach((_handle, key, count) => {
    if (count <= 0) return;
    if (key.occupation === OCCUPATION.student) {
      applicants += count;
      return;
    }
    if (key.occupation !== OCCUPATION.idle) return;

    const demography = requireDemography(options.species, key.speciesId);
    const age = cohortAgeMonths(key.birthTickBucket, options.worldTick);
    const eligible = mayTransitionTo(OCCUPATION.student, {
      mature: age >= demography.maturityMonths,
      senescent:
        normalizedCohortAge(age, demography.lifespanMonths) >= RETIREMENT_NORMALIZED_AGE,
    });
    if (eligible) applicants += count;
  });
  return applicants;
}
