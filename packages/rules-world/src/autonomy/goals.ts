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
 * ## The tenth goal was appended, not inserted
 *
 * `practice` took id 10 because the registry is append-only and `applyMagic`
 * already held 9. Every baseline taken before it exists is keyed on a goal set
 * that could not express practice — which is a fact about those baselines, not
 * a reason to renumber anything.
 *
 * ## Two goals here are placeholders for capabilities that do not exist
 *
 * `ward-duty` and `raid-readiness` are scored and selectable at 0.4.0, but the
 * pressures that make them attractive are `god-agency`'s and
 * `raid-engagement`'s. Enumerated now rather than appended later because
 * appending is free only for the *ids*: every balance baseline taken in between
 * would have been taken over a goal set that could not express warding, and
 * would need retaking.
 *
 * ## `practice` is id 10, and it is the first goal appended after 0.4.0
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
  /**
   * Spend the month **drilling a node she already holds**, raising her mastery
   * of it.
   *
   * The tenth goal, and the one that closes the knowledge lifecycle. Before it
   * existed nothing in the rules path raised mastery at all: research created
   * an instance at 256, the teach threshold sat at 512, and `setMastery`'s only
   * caller was the decay sweep, which lowers. A mage could discover something
   * and was structurally incapable of ever passing it on.
   *
   * `docs/design/metis-from-use-results.md` §6 named this goal and its shape —
   * *"a tenth entry in the permanent goal registry… it competes. A mage
   * practising is not researching, not teaching, not on the wall"* — and the
   * competition is the point. An accrual that did not cost a month would rank
   * gods by how little they interfere, which is the finding that killed the
   * hook §6 was recommending against.
   *
   * See `rules-magic`'s `practice.ts` for the ceiling that keeps a population
   * stratified while mastery rises.
   */
  practice: 10,
  /**
   * Spend the month **keeping a working standing** — lighting one over a node
   * she holds, or renewing one before it lapses.
   *
   * The eleventh goal, and the first whose whole content is *upkeep*. The other
   * ten either produce something — a node, an instance, a book, a harvest — or
   * stand watch. This one buys nothing new. It buys the continued existence of
   * something already bought.
   *
   * That is the tradeoff `node.json`'s Muto glosses have been describing since
   * the grid was authored and the rules had never charged for: *"the change is
   * worn, not granted"*, *"renewed about as often as a sentry is changed"*, *"a
   * wall you have agreed to build twice"*. A month spent renewing is a month not
   * spent researching, and a universe that has lit more workings than it can
   * staff watches some of them go out — which is a strategic position rather
   * than a failure state, and the first one in this game a player can reach by
   * succeeding too fast.
   *
   * It **competes**, exactly as `practice` does and for the same reason. An
   * upkeep that ran in the background for free would rank gods by how many
   * workings they could accumulate, which is a resource counter rather than a
   * decision.
   *
   * See `rules-magic`'s `workings/standing.ts` for what a working is, and
   * `coordination`'s `standing-workings.ts` for the sweep that ends one.
   */
  sustainWorking: 11,
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
  GOAL.practice,
  GOAL.sustainWorking,
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
  [GOAL.practice]: 'practice',
  [GOAL.sustainWorking]: 'sustain-working',
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
  GOAL.practice,
  // A working stands over a *node*. Without one there is nothing to renew, and
  // a `sustain-working` commitment carrying `targetNodeId: 0` would be a month
  // spent on nothing that the report would nonetheless count as upkeep.
  GOAL.sustainWorking,
];

/** Whether a goal is meaningless without a node to point it at. */
export function needsTarget(goal: GoalId): boolean {
  return GOALS_NEEDING_A_TARGET.includes(goal);
}
