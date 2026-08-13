/*
 * Multiverse Mages — the argmax, the tie-break, and the one place a goal is
 * adopted.
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

import { RNG_STREAM, nextBounded } from '@mm/sim-core';
import type { ContentId } from '@mm/content';

import type { KnowledgeTarget } from '../coordination.js';
import type { StepRng } from '../mages/rng.js';
import { MAX_CANDIDATE_TARGETS } from './candidates.js';
import type { FeasibilityOutcome } from './feasibility.js';
import { isFeasible, maskGoals } from './feasibility.js';
import type { GoalId } from './goals.js';
import { GOAL, needsTarget } from './goals.js';
import type { MageOutlook } from './outlook.js';
import type { MageGoalCommitment, ReevaluationReason, ScheduleOptions } from './schedule.js';
import { HYSTERESIS_MARGIN, displaces, reevaluationReason } from './schedule.js';
import type { GoalScore, ScoringOptions } from './scoring.js';
import { scoreGoal, scoreGoals } from './scoring.js';
import type { TargetAppealWeights } from './target-appeal.js';
import type { TargetScore } from './target-appeal.js';
import { compareAppeal, targetAppeal } from './target-appeal.js';

/**
 * ## Determinism has two halves and only one of them is the RNG
 *
 * The `mage-autonomy` spec: *"Ties MUST be broken by a draw on RNG stream 7 and
 * never by iteration order of a hash structure."* The second clause is the one
 * that gets violated silently. Iteration order over a `Map` is stable within a
 * process and *reproducible* across processes on the same engine, so a
 * hash-ordered tie-break passes a determinism test and still means that two
 * states which are equal as states resolve differently because they were
 * reached by different insertion histories.
 *
 * So every order in this file is a declared one: goals come out of
 * {@link maskGoals} ascending by permanent id, and targets are ordered by
 * `compareAppeal` — highest utility first, then cheapest, then **node id**,
 * which depends on nothing but the targets and the mage's own outlook.
 *
 * ## The draw happens only on an actual tie, and that is safe
 *
 * `nextBounded` is called once when two or more goals share the top score, and
 * not at all otherwise. A varying draw count would be a hazard if the stream
 * were shared, but `contracts.md` §6 keys stream 7 on the mage's handle, so one
 * mage's tie cannot shift another mage's sequence — which is exactly the
 * property "adding a draw in another subsystem does not change it" is about,
 * one level finer.
 *
 * ## Selection never writes a role
 *
 * `roles.ts` makes the argument: the god's assignment is the whole of the
 * player's authority over an individual mage, and a goal-selection routine that
 * "helpfully" re-roles a badly matched professor deletes a design pillar. There
 * is no role write in this file and there is no function in this package to
 * reach for.
 */

/** What one evaluation decided, with everything a metric or a test needs. */
export interface Selection {
  /** The commitment after this tick. Identical to the incumbent when held. */
  readonly commitment: MageGoalCommitment;
  /** Why the mage did or did not reconsider. */
  readonly reason: ReevaluationReason;
  /** Whether goals were scored this tick. `false` means the phase held. */
  readonly evaluated: boolean;
  /** Whether the goal changed. Feeds the goal-switch counter. */
  readonly switched: boolean;
  /** Goals removed as infeasible, or `0` when nothing was evaluated. */
  readonly maskedCount: number;
  /** Every feasible goal's score, in ascending goal id. Empty when held. */
  readonly scores: readonly GoalScore[];
  /** How many goals shared the top score. `1` means no draw was taken. */
  readonly tiedAtTop: number;
}

/** Everything one evaluation needs. */
export interface SelectionInput {
  readonly outlook: MageOutlook;
  readonly worldTick: number;
  /** The mage's current commitment, or `undefined` for a newly promoted mage. */
  readonly incumbent: MageGoalCommitment | undefined;
  /** Whether the incumbent goal finished this tick. The caller's judgement. */
  readonly incumbentComplete?: boolean | undefined;
  readonly rng: StepRng;
  /**
   * Every magnitude {@link chooseTarget} is made of, read once from content.
   *
   * Required rather than defaulted. A default would have to be a literal, and
   * `CLAUDE.md` puts every magnitude in validated content data; worse, a
   * defaulted weight table is a universe silently running on numbers nobody
   * authored while every test that supplied one went on passing.
   */
  readonly appeal: TargetAppealWeights;
  readonly scoring?: ScoringOptions | undefined;
  readonly schedule?: ScheduleOptions | undefined;
}

/** The candidate list a goal draws its target from. */
function targetsFor(goal: GoalId, outlook: MageOutlook): readonly KnowledgeTarget[] {
  switch (goal) {
    case GOAL.researchNode:
      return outlook.discoveryTargets;
    case GOAL.rediscoverNode:
      return outlook.rediscoveryTargets;
    case GOAL.seekTeaching:
      return outlook.teachableToMe;
    case GOAL.teach:
      return outlook.teachableByMe;
    case GOAL.scribe:
      return outlook.scribableTargets;
    case GOAL.practice:
      return outlook.practiceTargets;
    default:
      return [];
  }
}

/**
 * The node a goal points at, or `0`.
 *
 * **The argmax of a utility score**, which is what vision §7 asks for and what
 * this function did not do until 0.4.0: *"mages act on utility-scored goals
 * shaped by species, age, personality, and their assigned standing role."* Goal
 * selection was already scored; target selection ordered by `remainingCost` and
 * then `nodeId`, and because v1 `researchCost` is a pure function of tier that
 * was one fixed queue every universe walked and stopped at a different point
 * along. See `target-appeal.ts` for the measurement and the six terms.
 *
 * Ties fall to {@link compareTargets} — cheapest first, **then node id**, which
 * remains the final tie-break. The order is therefore total and takes no draw,
 * so no RNG stream moves and no balance baseline can rot from a re-roll.
 */
export function chooseTarget(
  goal: GoalId,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): ContentId {
  if (!needsTarget(goal)) return 0;
  const candidates = targetsFor(goal, outlook);
  let best: { target: KnowledgeTarget; score: TargetScore } | undefined;
  for (const target of candidates) {
    const entry = { target, score: targetAppeal(target, outlook, weights) };
    if (best === undefined || compareAppeal(entry, best) < 0) best = entry;
  }
  return best?.target.nodeId ?? 0;
}

/**
 * Whether a committed target is still among the goal's candidates.
 *
 * ## A full list is evidence and a truncated one is not
 *
 * The candidate lists on a {@link MageOutlook} are `candidates.ts`' output, and
 * that module is explicit about what its bound is for: it is a **cost** device,
 * bought so that *"adding a hundred nodes is a content decision rather than a
 * performance regression"*. A cost device that changes behaviour has not been
 * bought, it has been borrowed against.
 *
 * It did change behaviour. Absence from the list was read as infeasibility, and
 * `reevaluationReason` ranks `'infeasible'` above both the evaluation phase and
 * `MIN_COMMITMENT_TICKS` — so sixteen cheaper nodes appearing anywhere in the
 * universe threw every mage off a perfectly researchable target, reset her
 * `adoptedTick`, and reported a goal switch indistinguishable in the histogram
 * from a mage whose project genuinely became impossible.
 *
 * So the rule here is about what the list can *support*. A list shorter than the
 * bound is everything the gather found: a target missing from it is missing
 * because it is not a candidate, and that is real information the commitment
 * must yield to — a node someone else finished, or one a lost prerequisite put
 * out of reach. A list *at* the bound has been cut off, and the absence of any
 * particular node from it says nothing at all. Reading the second case as the
 * first is reading a truncation as a fact about the world.
 *
 * ## Why this seam and not the other two
 *
 * The fix could have gone in `candidates.ts` (seed the gather with the committed
 * node) or in whatever assembles the outlook (keep the incumbent's target
 * pinned). Both push the commitment down into a layer that has no business
 * knowing about commitments: `gatherFrontier` answers "what could this mage work
 * on", a question with one answer per mage per tick, and giving it a second
 * answer that depends on what she happens to be doing makes it un-cacheable and
 * un-shareable for the sake of one caller. It would also have to be repeated in
 * `boundCandidates` for teaching and scribing, which is the "a filter one call
 * site can forget" failure that file already warns about.
 *
 * `select.ts` is the only place that holds a commitment and a candidate list at
 * the same time, which makes it the only place that can tell the difference
 * between the two absences. One function, one rule, every target-taking goal.
 */
function targetStillAvailable(commitment: MageGoalCommitment, outlook: MageOutlook): boolean {
  if (!needsTarget(commitment.goalId)) return true;
  const candidates = targetsFor(commitment.goalId, outlook);
  if (candidates.some((candidate) => candidate.nodeId === commitment.targetNodeId)) return true;
  return candidates.length >= MAX_CANDIDATE_TARGETS;
}

/**
 * Picks the winner from scored goals, drawing on stream 7 only on a tie.
 *
 * Exported so a test can drive the tie-break without constructing a whole
 * evaluation, and so the draw count is measurable at the point it happens.
 */
export function argmaxWithTieBreak(
  scores: readonly GoalScore[],
  rng: StepRng,
  mage: number,
): { winner: GoalScore; tiedAtTop: number } {
  let best = scores[0];
  if (best === undefined) {
    throw new Error(
      'goal selection was handed an empty score list; idle is unconditionally feasible, so an ' +
        'empty list means the feasibility mask was bypassed',
    );
  }
  const tied: GoalScore[] = [];
  for (const entry of scores) {
    if (entry.score > best.score) best = entry;
  }
  for (const entry of scores) {
    if (entry.score === best.score) tied.push(entry);
  }
  if (tied.length === 1) return { winner: best, tiedAtTop: 1 };

  const stream = rng.actorStream(RNG_STREAM.autonomy, mage);
  const chosen = tied[nextBounded(stream, tied.length)];
  if (chosen === undefined) {
    throw new Error('the stream-7 tie-break drew an index outside the tied set');
  }
  return { winner: chosen, tiedAtTop: tied.length };
}

/** The commitment a mage holds when nothing has been chosen yet. */
function idleCommitment(worldTick: number): MageGoalCommitment {
  return { goalId: GOAL.idle, targetNodeId: 0, adoptedTick: worldTick, score: 0 };
}

/**
 * One mage's goal decision for one world tick.
 *
 * The whole of the utility-AI's control flow, in the order the spec fixes it:
 * decide whether to reconsider at all, mask, score, argmax, then apply
 * hysteresis against the incumbent's *current* score rather than the score it
 * was adopted at. Re-scoring the incumbent matters — a goal adopted at 900 in a
 * universe that has since changed is not still worth 900, and comparing a fresh
 * challenger against a stale incumbent is how a mage ends up defending a
 * position that no longer exists.
 */
export function selectGoal(input: SelectionInput): Selection {
  const { outlook, worldTick, incumbent, rng } = input;
  const incumbentComplete = input.incumbentComplete ?? false;
  const incumbentFeasible =
    incumbent !== undefined &&
    isFeasible(incumbent.goalId, outlook) &&
    targetStillAvailable(incumbent, outlook);

  const reason = reevaluationReason({
    worldTick,
    mage: outlook.mage,
    incumbent,
    incumbentFeasible,
    incumbentComplete,
    options: input.schedule,
  });

  if (reason === 'held') {
    // `incumbent` is defined whenever the reason is 'held' — 'no-incumbent'
    // outranks it — but the narrowing is written out rather than asserted,
    // because a non-null assertion here would be load-bearing and invisible.
    const held = incumbent ?? idleCommitment(worldTick);
    return {
      commitment: held,
      reason,
      evaluated: false,
      switched: false,
      maskedCount: 0,
      scores: [],
      tiedAtTop: 0,
    };
  }

  const mask: FeasibilityOutcome = maskGoals(outlook);
  const scores = scoreGoals(mask.feasible, outlook, input.scoring ?? {});
  const { winner, tiedAtTop } = argmaxWithTieBreak(scores, rng, outlook.mage);

  const margin = input.schedule?.hysteresisMargin ?? HYSTERESIS_MARGIN;
  const keepsIncumbent =
    incumbent !== undefined &&
    incumbentFeasible &&
    !incumbentComplete &&
    winner.goal !== incumbent.goalId &&
    !displaces(winner.score, scoreGoal(incumbent.goalId, outlook, input.scoring ?? {}).score, margin);

  if (keepsIncumbent && incumbent !== undefined) {
    return {
      commitment: incumbent,
      reason,
      evaluated: true,
      switched: false,
      maskedCount: mask.maskedCount,
      scores,
      tiedAtTop,
    };
  }

  const sameGoal = incumbent !== undefined && !incumbentComplete && winner.goal === incumbent.goalId;
  const targetNodeId =
    sameGoal && incumbentFeasible
      ? incumbent.targetNodeId
      : chooseTarget(winner.goal, outlook, input.appeal);

  return {
    commitment: {
      goalId: winner.goal,
      targetNodeId,
      // Re-adopting the same goal does not restart the commitment clock. A goal
      // that reset its own clock every evaluation could never be displaced by
      // anything, which would make the commitment period a permanent lock
      // rather than a floor.
      adoptedTick: sameGoal && incumbent !== undefined ? incumbent.adoptedTick : worldTick,
      score: winner.score,
    },
    reason,
    evaluated: true,
    switched: !sameGoal,
    maskedCount: mask.maskedCount,
    scores,
    tiedAtTop,
  };
}
