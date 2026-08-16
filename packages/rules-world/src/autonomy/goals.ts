/*
 * Multiverse Mages — the fixed, append-only enumeration of mage goals.
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
 * ## These ids are permanent
 *
 * A goal id is not an implementation detail. It is in the per-tick goal
 * histogram, it will key `winRateByPrimitive`-style ablation output at 0.5.0,
 * and every committed Monte Carlo baseline records it as a number, not a name.
 * Renumbering breaks no build — it silently makes every historical run mean
 * something else, and the symptom is a balance finding nobody can reproduce.
 *
 * Same rule as `RNG_STREAM` in `@mm/sim-core` and `GOLDEN_ACTION` in the golden
 * fixtures, same reason. **Append-only**: a new goal takes the next unused id,
 * nothing here moves. `goal-registry.test.ts` pins the table against a literal
 * copy, and its failure message says what renumbering costs rather than only
 * that two arrays differ.
 *
 * ## `idle` is id 0, and it is the floor
 *
 * `mages-and-species/design.md`: *"`idle` is always feasible and always scores
 * at the floor, so the argmax is total and there is no 'no goal' branch to get
 * wrong."* Both halves are in code — {@link GOAL_BASE_APPEAL} gives `idle` a
 * base of zero and no term touches it; the feasibility mask never removes it.
 * Id 0 is a convenience on top: `contracts.md` §0's absent value is `0`, so a
 * zeroed goal component reads as `idle` rather than as a goal nobody selected.
 *
 * ## Two goals here are placeholders for capabilities that do not exist
 *
 * `ward-duty` and `raid-readiness` are scored and selectable at 0.4.0, but the
 * pressures that make them attractive are `god-agency`'s and
 * `raid-engagement`'s. Enumerated now rather than appended later because
 * appending is free only for the *ids*: every balance baseline taken in between
 * would have been taken over a goal set that could not express warding, and
 * would need retaking.
 */

/**
 * Every goal a mage may pursue, with its permanent id.
 *
 * Declaration order is id order, and the ids are what a baseline is keyed on.
 * See the module note: append only.
 */
export const GOAL = {
  /** Do nothing productive. Always feasible, always at the score floor. */
  idle: 0,
  /** Self-directed research toward a node this universe has never held. */
  researchNode: 1,
  /** Self-directed research toward a node this universe knew and lost. */
  rediscoverNode: 2,
  /** Seek a teacher for a node someone else already holds. */
  seekTeaching: 3,
  /** Teach a node to a student who can receive it. */
  teach: 4,
  /** Commit a node to a grimoire. */
  scribe: 5,
  /** Change university affiliation. */
  affiliate: 6,
  /** Stand watch over a university and its library. */
  wardDuty: 7,
  /** Prepare for a raid. */
  raidReadiness: 8,
  /**
   * Spend the month casting a node she already holds **at** the world.
   *
   * The ninth goal, and the first not about knowledge. `economy/application.ts`
   * has what it consumes and makes. Until it existed a mage could *hold* a node
   * and never *work* one, so nothing anybody knew ever touched anything.
   */
  applyMagic: 9,
} as const;

/** Any id in the permanent registry. */
export type GoalId = (typeof GOAL)[keyof typeof GOAL];

/**
 * Every goal, ascending by id.
 *
 * The one iteration order for scoring, masking and histogram reporting. A
 * literal rather than `Object.values(GOAL)`, for the reason
 * `OCCUPATIONS_IN_ORDER` gives next door: the order is a declaration a reviewer
 * checks against the spec, not a side effect of how a literal was built.
 */
export const GOALS_IN_ORDER: readonly GoalId[] = [
  GOAL.idle,
  GOAL.researchNode,
  GOAL.rediscoverNode,
  GOAL.seekTeaching,
  GOAL.teach,
  GOAL.scribe,
  GOAL.affiliate,
  GOAL.wardDuty,
  GOAL.raidReadiness,
  GOAL.applyMagic,
];

/** How many goals the enumeration holds. Grows; never shrinks. */
export const GOAL_COUNT: number = GOALS_IN_ORDER.length;

/**
 * The spelling of each id, for histogram keys and for error messages.
 *
 * A name is safe to change; an id is not. Nothing mechanical may key on these
 * strings — they exist so a failure reads "research-node", not "1".
 */
export const GOAL_NAMES: Readonly<Record<GoalId, string>> = {
  [GOAL.idle]: 'idle',
  [GOAL.researchNode]: 'research-node',
  [GOAL.rediscoverNode]: 'rediscover-node',
  [GOAL.seekTeaching]: 'seek-teaching',
  [GOAL.teach]: 'teach',
  [GOAL.scribe]: 'scribe',
  [GOAL.affiliate]: 'affiliate',
  [GOAL.wardDuty]: 'ward-duty',
  [GOAL.raidReadiness]: 'raid-readiness',
  [GOAL.applyMagic]: 'apply-magic',
};

/** Whether a number names a goal in the permanent registry. */
export function isGoalId(value: number): value is GoalId {
  return Number.isInteger(value) && value >= 0 && value < GOAL_COUNT;
}

/**
 * The goals that need a node to work on.
 *
 * Selection carries a target node id for these and `0` — §0's absent reference
 * — for the rest. A set rather than a `targetRequired` flag per goal, so adding
 * a goal cannot forget to answer the question.
 */
export const GOALS_NEEDING_A_TARGET: readonly GoalId[] = [
  GOAL.researchNode,
  GOAL.rediscoverNode,
  GOAL.seekTeaching,
  GOAL.teach,
  GOAL.scribe,
  GOAL.applyMagic,
];

/** Whether a goal is meaningless without a node to point it at. */
export function needsTarget(goal: GoalId): boolean {
  return GOALS_NEEDING_A_TARGET.includes(goal);
}
