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
 * A goal id is not an implementation detail of the utility-AI. It is reported
 * in the per-tick goal histogram, it will key `winRateByPrimitive`-style
 * ablation output at 0.5.0, and every committed Monte Carlo baseline records it
 * as a number rather than as a name. Renumbering one therefore does not break a
 * build — it silently makes every historical run mean something different, and
 * the symptom is a balance finding nobody can reproduce.
 *
 * This is the same rule `RNG_STREAM` states in `@mm/sim-core` and
 * `GOLDEN_ACTION` states in the golden fixtures, for the same reason. The
 * registry is **append-only**: a new goal takes the next unused id, and nothing
 * already here moves. `goal-registry.test.ts` pins the whole table against a
 * literal copy, and its failure message says what a renumbering costs rather
 * than only that two arrays differ.
 *
 * ## `idle` is id 0, and it is the floor
 *
 * `mages-and-species/design.md`: *"`idle` is always feasible and always scores
 * at the floor, so the argmax is total and there is no 'no goal' branch to get
 * wrong."* Both halves of that live in code — {@link GOAL_BASE_APPEAL} gives
 * `idle` a base of zero and no term touches it, and the feasibility mask never
 * removes it. Id 0 is a convenience on top: the absent-value convention in
 * `contracts.md` §0 is `0`, so a zeroed goal component reads as `idle` rather
 * than as a goal nobody selected.
 *
 * ## Two goals here are placeholders for capabilities that do not exist
 *
 * `ward-duty` and `raid-readiness` are scored and selectable at 0.4.0 but the
 * pressures that make them attractive are `god-agency`'s and
 * `raid-engagement`'s. They are enumerated now rather than appended later
 * because appending them later is free only for the *ids* — the balance
 * baselines taken between now and then would have been taken over a goal set
 * that could not express warding, and every one of them would need retaking.
 *
 * ## `practice` is id 9, and it is the first goal appended after 0.4.0
 *
 * It is here because `decay.ts` asked for it by name — *"Nothing in this
 * subsystem restores mastery; practice does, and practice is an operation
 * somebody has to perform"* — and because nobody performed it, mastery in this
 * game was monotonically non-increasing for every instance ever created.
 * `ages-of-magic.md` §2c is the design half of that: publish-or-perish with the
 * publish half missing, and 93.4% of held instances below the teach threshold as
 * the measurement of it.
 *
 * It is a **goal** rather than a background restoration for one reason, and the
 * reason is the whole design: a month spent keeping a node sharp is a month not
 * spent researching, teaching, scribing or standing watch. Appending it moves
 * every strategy's goal mix, so every baseline taken before it is a baseline
 * over a nine-goal world — which is exactly what the append-only rule above
 * exists to make legible rather than silent.
 */

/**
 * Every goal a mage may pursue, with its permanent id.
 *
 * Order of declaration is the id order, and the ids are the numbers a baseline
 * is keyed on. See the module note: append only.
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
   * The ninth goal, and the first that is not about knowledge. See
   * `rules-world/src/economy/application.ts` for what it consumes and what it
   * makes; the short version is that until it existed a mage could *hold* a
   * node and could never *work* one, so nothing anybody knew ever touched
   * anything.
   */
  applyMagic: 9,
  /**
   * Keep a node she already holds sharp, restoring its mastery.
   *
   * The tenth goal. It was authored on its branch as the ninth and takes 10
   * here because `applyMagic` reached `main` first — the registry is
   * append-only (`state/src/components.ts` serializes `goalId` into
   * `goal-commitment`), so ids 0-8 are untouched and the two new goals are
   * ordered by which one landed, not by which is more important.
   */
  practice: 10,
} as const;

/** Any id in the permanent registry. */
export type GoalId = (typeof GOAL)[keyof typeof GOAL];

/**
 * Every goal, ascending by id.
 *
 * The one iteration order for scoring, masking, and histogram reporting.
 * Written as a literal rather than derived from `Object.values(GOAL)` for the
 * reason `OCCUPATIONS_IN_ORDER` gives next door: the order is a declaration a
 * reviewer checks against the spec, not a property of how an object literal
 * happened to be built.
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
  GOAL.practice,
];

/** How many goals the enumeration holds. Grows; never shrinks. */
export const GOAL_COUNT: number = GOALS_IN_ORDER.length;

/**
 * The spelling of each id, for histogram keys and for error messages.
 *
 * A name is safe to change; an id is not. Nothing mechanical may key on these
 * strings — they exist so that a failure reads "research-node" rather than "1".
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
  [GOAL.practice]: 'practice',
};

/** Whether a number names a goal in the permanent registry. */
export function isGoalId(value: number): value is GoalId {
  return Number.isInteger(value) && value >= 0 && value < GOAL_COUNT;
}

/**
 * The goals that need a node to work on.
 *
 * Selection carries a target node id for these and `0` — the §0 absent
 * reference — for the rest. Kept as a set rather than as a `targetRequired`
 * flag on each goal so that adding a goal cannot forget to answer the question.
 */
export const GOALS_NEEDING_A_TARGET: readonly GoalId[] = [
  GOAL.researchNode,
  GOAL.rediscoverNode,
  GOAL.seekTeaching,
  GOAL.teach,
  GOAL.scribe,
  GOAL.applyMagic,
  GOAL.practice,
];

/** Whether a goal is meaningless without a node to point it at. */
export function needsTarget(goal: GoalId): boolean {
  return GOALS_NEEDING_A_TARGET.includes(goal);
}
