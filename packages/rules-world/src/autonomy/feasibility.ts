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
 * Masking gives what the penalty lacks: infeasibility becomes a *state you can
 * count*, not a behaviour inferred from output that looks like idleness. So
 * {@link maskGoals} returns the count beside the set, and not optionally — the
 * `mage-autonomy` spec requires it *"recorded for that evaluation and
 * reportable in aggregate"*, and a counter nobody is forced to take is a
 * counter nobody takes.
 *
 * Mirrors `contracts.md` §4.2's legality mask deliberately, so the agent-facing
 * action space and the mage-facing goal space fail the same way.
 *
 * ## `idle` is never masked
 *
 * Why there is no "no goal selected" branch anywhere: an argmax over a set that
 * always contains `idle` is total, and a mage with nothing to do is doing
 * `idle`, not in an undefined state. Asserted, not assumed — {@link maskGoals}
 * refuses to return a set without it.
 *
 * ## Depth gating happens before this module, not in it
 *
 * `species-traits` requires a node above a species' `depthCeiling` infeasible
 * *"at any rate"*; `mage-autonomy` repeats it for `research-node` and
 * `seek-teaching`. Enforced in `candidates.ts`, filtering the frontier as it is
 * gathered, so an over-deep node never reaches an outlook. Filtering here would
 * leave the tempting shape — a scoring path that can see a target it must not
 * select — one edit from being wrong.
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
 * Cheapest, not first: `scribe`'s mask turns on affordability — `mage-autonomy`
 * masks it when materials are *"below the cost of the cheapest available
 * scribing"* — so one affordable option among twenty expensive ones is not
 * masked.
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
 * Exported so a test can ask about one goal without rebuilding the whole
 * outcome, and so `select.ts` can re-ask about the incumbent alone when
 * deciding whether commitment was interrupted.
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
      // Nothing castable the world can feel, nothing to apply. The list is
      // already filtered — mind or palace, at or above the activation
      // threshold, permitted cell, `resource-yield` effect whose form routes to
      // a material — because each is a question this package may not ask
      // (`contracts.md` §5 rule 3), answered by the coordinating layer in one
      // pass.
      return anyOf(outlook.applicableTargets);
    case GOAL.practice:
      // A mage with nothing left to perfect has nothing to practise. The list
      // is already filtered by the coordinating layer to nodes she holds, in
      // cells permitted now, whose mastery is **below** what `practiceCeiling`
      // allows her — so a month of practice is never a month spent on a node
      // that cannot improve. Every one of those is again a question this
      // package may not ask (`contracts.md` §5 rule 3).
      return anyOf(outlook.practiceTargets);
    case GOAL.sustainWorking:
      // A mage with no duration-bearing node she can cast has no working to
      // light and none to renew. The list is already filtered by the
      // coordinating layer — held, permitted now, at or above the activation
      // threshold, and authored with a non-zero `durationTicks` — every one of
      // which is a question this package may not ask (`contracts.md` §5 rule 3).
      //
      // **Feasibility here is deliberately *not* "a working stands".** Requiring
      // one would make lighting the first working impossible: nobody could ever
      // sustain what nobody had ever lit, and the goal would be masked in every
      // universe forever while looking perfectly well wired.
      return anyOf(outlook.sustainableTargets);
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
 * @throws Error if `idle` came out infeasible — impossible through
 * {@link isFeasible}, and it would mean the argmax was handed a possibly empty
 * set. Thrown, not repaired: a silently repaired invariant stops being one.
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
