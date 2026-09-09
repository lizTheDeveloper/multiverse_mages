/*
 * Multiverse Mages — summation and the one clamp, kept apart from the terms so
 * both can be tested alone.
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

import type { Fixed } from '@mm/sim-core';

import type { GoalId } from './goals.js';
import type { MageOutlook } from './outlook.js';
import type { GoalAppealWeights, ScoreTerms, TermKind } from './terms.js';
import { TERM_KINDS, termsFor } from './terms.js';

/**
 * ## One clamp, at the end
 *
 * `score(g) = clamp(base + roleBias + speciesTerm + personalityTerm + ageTerm +
 * opportunityTerm, 0, fp(4096))`. The `mage-autonomy` spec states the position
 * of the clamp as a scenario of its own — *"the clamp is applied after
 * summation, not per term"* — because clamping each addend as it lands is the
 * natural way to write this and it produces a different, order-dependent
 * number.
 *
 * The per-term bounds in `terms.ts` are a different mechanism and do not
 * conflict with this: they condition each *input axis* onto a documented range
 * so the sum has a provable range at all, and they are applied before any
 * addition happens. Nothing is clamped between two additions, which is what the
 * scenario is about.
 *
 * ## The ceiling does not currently bind, and that is worth knowing
 *
 * Summing `TERM_BOUND` across the six terms gives 2,688 — well under
 * `fp(4096)`. So the clamp is a guard rail rather than a live constraint at
 * 0.4.0, and a run in which it fires means a term bound has been raised without
 * anyone rechecking the ceiling. Stated here rather than discovered later,
 * because a clamp that never fires and a clamp that always fires produce
 * indistinguishable output — `caps.ts` in `@mm/primitives` makes the same
 * argument about the primitive caps, and the answer there is the same as the
 * answer here: count it. {@link scoreGoal} reports `clamped`.
 *
 * ## Ablation is a first-class operation
 *
 * `contracts.md` §7's balance methodology works by removing one input and
 * measuring what changed. {@link scoreGoal} therefore takes a term to suppress,
 * and the suppressed term is reported as zero in the breakdown rather than
 * omitted — a caller comparing two breakdowns compares two records with the
 * same six keys.
 */

/**
 * The upper clamp on a goal score, in fixed point.
 *
 * `fp(4096)` is the same number `contracts.md` §3 uses for world-scale
 * primitive stacking. Reused deliberately: two ceilings on two quantities that
 * are conceptually "how strongly does something pull" is two numbers to move in
 * step, and nobody ever moves both.
 */
export const SCORE_CEILING: Fixed = 4096;

/** The lower clamp. `idle` sits here, and so does any goal whose terms cancel out. */
export const SCORE_FLOOR: Fixed = 0;

/** One goal's score with its arithmetic still visible. */
export interface GoalScore {
  readonly goal: GoalId;
  /** The clamped score. This is what selection compares. */
  readonly score: Fixed;
  /** The six terms, before summation. Sums to the *unclamped* total. */
  readonly terms: ScoreTerms;
  /** The sum before clamping, for a test that needs to see the clamp bite. */
  readonly rawTotal: Fixed;
  /** Whether the clamp changed the answer. */
  readonly clamped: boolean;
}

/** How a caller asks for a term to be left out. */
export interface ScoringOptions {
  /**
   * A term to zero, for ablation. `undefined` — the normal case — scores with
   * all six.
   */
  readonly ablate?: TermKind | undefined;
}

/**
 * Sums six terms and applies the single clamp.
 *
 * Separated from {@link scoreGoal} so a test can drive the clamp directly. The
 * term bounds mean no real outlook can reach {@link SCORE_CEILING}, and a
 * requirement that cannot be exercised through the public path is one that
 * quietly stops being checked.
 */
export function combineTerms(terms: ScoreTerms): { total: Fixed; clamped: boolean } {
  let total = 0;
  for (const kind of TERM_KINDS) {
    total += terms[kind];
  }
  if (total > SCORE_CEILING) return { total: SCORE_CEILING, clamped: true };
  if (total < SCORE_FLOOR) return { total: SCORE_FLOOR, clamped: true };
  return { total, clamped: false };
}

/** Zeroes one term, leaving the other five and the record's shape alone. */
function ablated(terms: ScoreTerms, ablate: TermKind | undefined): ScoreTerms {
  if (ablate === undefined) return terms;
  return { ...terms, [ablate]: 0 };
}

/**
 * Scores one goal for one mage.
 *
 * @param weights - The goal-appeal magnitudes, read from content. Required
 * rather than defaulted, for the reason `SelectionInput.appeal` is: a default
 * would have to be a literal, and a defaulted weight table is a universe
 * silently running on numbers nobody authored while every test that supplied
 * one goes on passing.
 */
export function scoreGoal(
  goal: GoalId,
  outlook: MageOutlook,
  weights: GoalAppealWeights,
  options: ScoringOptions = {},
): GoalScore {
  const terms = ablated(termsFor(goal, outlook, weights), options.ablate);
  const rawTotal = TERM_KINDS.reduce((sum, kind) => sum + terms[kind], 0);
  const { total, clamped } = combineTerms(terms);
  return { goal, score: total, terms, rawTotal, clamped };
}

/**
 * Scores a set of goals, in the order given.
 *
 * Takes the feasible set rather than every goal, because scoring a masked goal
 * is work whose only possible use is selecting it. Order is the caller's — the
 * feasibility mask returns ascending goal id, and selection depends on that
 * being stable, not on this function imposing it.
 */
export function scoreGoals(
  goals: readonly GoalId[],
  outlook: MageOutlook,
  weights: GoalAppealWeights,
  options: ScoringOptions = {},
): readonly GoalScore[] {
  return goals.map((goal) => scoreGoal(goal, outlook, weights, options));
}
