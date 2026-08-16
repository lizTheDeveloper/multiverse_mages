/*
 * Multiverse Mages — feasibility as a mask, and the count of what it removed.
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

import type { KnowledgeTarget } from '../coordination.js';
import type { GoalId } from './goals.js';
import { GOAL, GOALS_IN_ORDER, GOAL_NAMES } from './goals.js';
import type { MageOutlook } from './outlook.js';

/**
 * ## A mask, not a weight, and the difference is a whole career
 *
 * `mages-and-species/design.md` rejects the large negative penalty by name: *"a
 * very high weight on an infeasible goal is a silent failure mode: the mage
 * 'chooses' it, nothing happens, and a whole career quietly evaporates into a
 * goal that could never complete."*
 *
 * The masked form has the property the penalty form lacks — infeasibility
 * becomes a *state you can count* rather than a behaviour you have to infer
 * from an output that looks like idleness. {@link maskGoals} therefore returns
 * the count alongside the set, and the count is not optional: the
 * `mage-autonomy` spec makes "the number of goals masked as infeasible is
 * recorded for that evaluation and is reportable in aggregate" a requirement,
 * and a counter nobody is forced to take is a counter nobody takes.
 *
 * This mirrors `contracts.md` §4.2's legality mask deliberately, so that the
 * agent-facing action space and the mage-facing goal space fail the same way.
 *
 * ## `idle` is never masked
 *
 * It is the reason there is no "no goal selected" branch anywhere. The argmax
 * over a set that always contains `idle` is total, and a mage with nothing to
 * do is a mage doing `idle` rather than a mage in an undefined state. Asserted
 * rather than assumed — {@link maskGoals} refuses to return a set without it.
 *
 * ## Depth gating happens before this module, not in it
 *
 * The `species-traits` spec requires a node above a species' `depthCeiling` to
 * be infeasible "at any rate", and the `mage-autonomy` spec repeats it for
 * `research-node` and `seek-teaching`. It is enforced in `candidates.ts`, where
 * the frontier is filtered as it is gathered, so an over-deep node never
 * reaches an outlook at all. Filtering here instead would leave the tempting
 * shape — a scoring path that can see a target it must not select — one edit
 * away from being wrong.
 */

/** The feasible goals for one mage, and what masking removed to get there. */
export interface FeasibilityOutcome {
  /** Feasible goals, ascending by id. Always contains {@link GOAL.idle}. */
  readonly feasible: readonly GoalId[];
  /** How many goals were removed. `GOAL_COUNT - feasible.length`. */
  readonly maskedCount: number;
  /** Which goals were removed, ascending, for attributing a stall. */
  readonly masked: readonly GoalId[];
}

/** Whether a list of candidate targets has anything in it. */
function anyOf(targets: readonly KnowledgeTarget[]): boolean {
  return targets.length > 0;
}

/**
 * The cheapest thing in a candidate list, or `undefined` for an empty one.
 *
 * Cheapest rather than first because affordability is what `scribe`'s mask
 * turns on — the `mage-autonomy` spec says `scribe` is masked when materials
 * are "below the cost of the cheapest available scribing", so a mage with one
 * affordable option and twenty expensive ones is not masked.
 */
function cheapest(targets: readonly KnowledgeTarget[]): KnowledgeTarget | undefined {
  let best: KnowledgeTarget | undefined;
  for (const target of targets) {
    if (best === undefined || target.remainingCost < best.remainingCost) best = target;
  }
  return best;
}

/**
 * Whether one goal is feasible for one mage right now.
 *
 * Exported so a test can ask about a single goal without reconstructing the
 * whole outcome, and so `select.ts` can re-ask about the incumbent alone when
 * deciding whether commitment has been interrupted.
 */
export function isFeasible(goal: GoalId, outlook: MageOutlook): boolean {
  switch (goal) {
    case GOAL.idle:
      return true;
    case GOAL.researchNode:
      return anyOf(outlook.discoveryTargets);
    case GOAL.rediscoverNode:
      return anyOf(outlook.rediscoveryTargets);
    case GOAL.seekTeaching:
      return anyOf(outlook.teachableToMe);
    case GOAL.teach:
      return anyOf(outlook.teachableByMe);
    case GOAL.scribe: {
      // Three conditions, and all three are the spec's. No scribe staff means
      // no throughput and the goal is masked (`universities`); no materials
      // means it is masked for every mage in the universe (`mage-autonomy`);
      // and nothing worth writing down means there is nothing to scribe.
      if (outlook.scribeThroughput <= 0) return false;
      const target = cheapest(outlook.scribableTargets);
      if (target === undefined) return false;
      return outlook.materials >= target.remainingCost;
    }
    case GOAL.affiliate:
      return outlook.betterAffiliationAvailable;
    case GOAL.wardDuty:
      // A mage with no institution has nothing to stand watch over. Warding is
      // about a library, and an unaffiliated mage's books are unowned rather
      // than housed (`contracts.md` §1.5).
      return outlook.universityId !== 0;
    case GOAL.raidReadiness:
      return true;
    case GOAL.applyMagic:
      // A mage with nothing castable that the world can feel has nothing to
      // apply. The list is already filtered — held at mind or palace, at or
      // above the activation threshold, in a permitted cell, carrying a
      // `resource-yield` effect whose form routes to a material — because every
      // one of those is a question this package may not ask (`contracts.md` §5
      // rule 3) and the coordinating layer answers them all in one pass.
      return anyOf(outlook.applicableTargets);
    case GOAL.practice:
      // A mage with nothing left to perfect has nothing to practise. The list
      // is already filtered by the coordinating layer to nodes she holds, in
      // cells permitted now, whose mastery is **below** what `practiceCeiling`
      // allows her — so a month of practice is never a month spent on a node
      // that cannot improve. Every one of those is again a question this
      // package may not ask (`contracts.md` §5 rule 3).
      return anyOf(outlook.practiceTargets);
    default:
      throw new RangeError(
        `${String(goal)} is not a goal id; the registry in goals.ts is append-only and this ` +
          'number is not in it',
      );
  }
}

/**
 * Masks every goal the mage cannot currently pursue.
 *
 * @throws Error if `idle` came out infeasible, which cannot happen through
 * {@link isFeasible} and would mean somebody has given the argmax an empty set
 * to work over. Thrown rather than repaired: a silently repaired invariant is
 * one that stops being an invariant.
 */
export function maskGoals(outlook: MageOutlook): FeasibilityOutcome {
  const feasible: GoalId[] = [];
  const masked: GoalId[] = [];
  for (const goal of GOALS_IN_ORDER) {
    if (isFeasible(goal, outlook)) feasible.push(goal);
    else masked.push(goal);
  }
  if (!feasible.includes(GOAL.idle)) {
    throw new Error(
      `${GOAL_NAMES[GOAL.idle]} was masked, which would leave the goal argmax with a possibly ` +
        'empty set; idle is feasible unconditionally so that there is no "no goal" state',
    );
  }
  return { feasible, masked, maskedCount: masked.length };
}
