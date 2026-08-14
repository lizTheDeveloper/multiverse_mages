/*
 * Multiverse Mages — the six scoring terms, each bounded and each ablatable on
 * its own.
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
import { FP_ONE, floorDiv } from '@mm/sim-core';

import type { AgeBandValue } from './age-bands.js';
import { AGE_BAND, ageBandOf } from './age-bands.js';
import type { GoalId } from './goals.js';
import { GOAL } from './goals.js';
import type { MageOutlook } from './outlook.js';
import { ROLE_BIAS_MAX, roleBiasFor } from './role-bias.js';

/**
 * ## Additive, because a product cannot be interrogated
 *
 * `mages-and-species/design.md` rejects the classical multiplicative
 * utility-AI on three grounds, and the third is the one this module is built
 * around: *"a single near-zero factor annihilates the product, so 'why did this
 * mage choose to scribe?' has no attributable answer. Additive terms are
 * individually ablatable, and ablation is exactly how `contracts.md` §7's
 * `winRateByPrimitive` methodology works."*
 *
 * So each term is computed separately, returned separately in
 * {@link ScoreTerms}, and only then summed and clamped once. Zeroing one and
 * re-running is a supported operation ({@link TERM_KINDS}) rather than a
 * debugging manoeuvre someone has to reconstruct at 0.5.0.
 *
 * ## Every term is bounded, and the bounds are load-bearing
 *
 * {@link TERM_BOUND} is not decoration. Two requirements read it directly:
 *
 * - The `mage-autonomy` spec requires no role-bias entry to *"dominate the sum
 *   of all other terms at their extremes"*. That sentence is only checkable
 *   against numbers, and these are the numbers. `role-bias.test.ts` asserts
 *   `ROLE_BIAS_MAX` is under the sum of the other five bounds.
 * - Every term clamps to its own bound before summation, so an out-of-range
 *   *input* — a species trait authored at `fp(8192)`, a ward pressure a future
 *   capability sends in too large — cannot silently become the only thing that
 *   decides a mage's life.
 *
 * The per-term clamps are not the score clamp. `scoring.ts` applies exactly one
 * clamp to the sum, which is what the spec means by "the clamp is applied after
 * summation, not per term"; these are input conditioning on each term's own
 * axis, and they are why the sum has a provable range at all.
 *
 * ## Everything here is untuned
 *
 * The tables encode orderings the vision names — the curious research, the
 * cautious preserve, the old teach — and no release before 0.5.0 may claim any
 * of them is balanced (`docs/design/release-plan.md`).
 */

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const SCORING_TUNING_STATUS = 'untuned';

/** The six terms, in the order the spec's formula writes them. */
export const TERM_KINDS = [
  'base',
  'role',
  'species',
  'personality',
  'age',
  'opportunity',
] as const;

/** One of the six. Also the ablation selector. */
export type TermKind = (typeof TERM_KINDS)[number];

/** One goal's score, taken apart. Summed and clamped by `scoring.ts`. */
export type ScoreTerms = Readonly<Record<TermKind, Fixed>>;

/**
 * The largest magnitude each term may contribute.
 *
 * `role` is {@link ROLE_BIAS_MAX} rather than a second copy of it: the role
 * table validates itself against its own constant, and restating the number
 * here is how the two drift.
 */
export const TERM_BOUND: Readonly<Record<TermKind, Fixed>> = {
  base: 512,
  role: ROLE_BIAS_MAX,
  species: 512,
  personality: 512,
  age: 256,
  opportunity: 512,
};

/** Clamps a term onto its own axis. Symmetric: terms may be negative. */
function boundTerm(kind: TermKind, value: Fixed): Fixed {
  const bound = TERM_BOUND[kind];
  return Math.min(bound, Math.max(-bound, value));
}

/**
 * A signed share of how far a trait or personality axis sits from neutral.
 *
 * `fp(1024)` is neutral for every `fp` trait and for every personality axis, so
 * the deviation is the signal and the level is not. Floor division rather than
 * a shift: `floorDiv` is the one division in the rules path, it floors toward
 * negative infinity for both signs, and a `>> 1` on a negative would round the
 * other way and make the arithmetic sign-dependent.
 */
function shareOfDeviation(value: Fixed, denominator: number): Fixed {
  return floorDiv(value - FP_ONE, denominator);
}

/**
 * What each goal is worth before anything about the mage is considered.
 * **Untuned.**
 *
 * `idle` is zero, and that is the floor the design note promises: no term below
 * touches `idle`, so its score is zero for every mage in every situation and
 * the argmax always has something to return.
 */
export const GOAL_BASE_APPEAL: Readonly<Record<GoalId, Fixed>> = {
  [GOAL.idle]: 0,
  [GOAL.researchNode]: 512,
  [GOAL.rediscoverNode]: 384,
  [GOAL.seekTeaching]: 448,
  [GOAL.teach]: 448,
  [GOAL.scribe]: 384,
  // Level with `research-node` at the top of the band, and the only entry here
  // that is not a statement about an activity. Affiliation accomplishes
  // nothing: it produces no node, no lesson and no book. What it does is
  // *unlock* — an unaffiliated mage may neither scribe (`scribeThroughputFor`
  // is zero for `universityId === 0`) nor ward (`feasibility.ts` masks
  // `ward-duty` on the same field), so two of her nine goals do not exist until
  // she joins something. A gate on two goals is worth what the goals behind it
  // are worth, and the highest of those is a research-scale number.
  //
  // The base term is where that belongs precisely because it is unconditional:
  // it is what the *goal* is worth before anything about the mage is
  // considered. Whether she should act on it *now* is the opportunity term's
  // job, and that term is what separates a mage with no university from one who
  // merely has a better option — see {@link opportunityTerm}.
  [GOAL.affiliate]: 512,
  [GOAL.wardDuty]: 320,
  [GOAL.raidReadiness]: 256,
};

/**
 * How each age band shifts each goal. **Untuned.**
 *
 * The senescent row is the design's own answer to mortality, and
 * `mages-and-species/design.md` records why it matters more than its size
 * suggests: *"it means a species' `knowledgeHalfLife` depends on its age
 * distribution, not merely its lifespan. A civilization that has recently lost
 * a generation loses knowledge faster than its lifespan numbers predict,
 * because the mages who would have written things down are not old yet."*
 *
 * The `prime` row is all zeroes on purpose rather than absent. A band that
 * contributes nothing is a statement — the middle of a life is the baseline the
 * other two are shifts away from — and writing it out means the table has one
 * row per band and a reader can see that none is missing.
 */
export const AGE_TERM: Readonly<Record<AgeBandValue, Readonly<Record<GoalId, Fixed>>>> = {
  [AGE_BAND.young]: {
    [GOAL.idle]: 0,
    [GOAL.researchNode]: 64,
    [GOAL.rediscoverNode]: 0,
    [GOAL.seekTeaching]: 256,
    [GOAL.teach]: -192,
    [GOAL.scribe]: -128,
    [GOAL.affiliate]: 128,
    [GOAL.wardDuty]: -64,
    [GOAL.raidReadiness]: 64,
  },
  [AGE_BAND.prime]: {
    [GOAL.idle]: 0,
    [GOAL.researchNode]: 0,
    [GOAL.rediscoverNode]: 0,
    [GOAL.seekTeaching]: 0,
    [GOAL.teach]: 0,
    [GOAL.scribe]: 0,
    [GOAL.affiliate]: 0,
    [GOAL.wardDuty]: 0,
    [GOAL.raidReadiness]: 0,
  },
  [AGE_BAND.senescent]: {
    [GOAL.idle]: 0,
    [GOAL.researchNode]: -256,
    [GOAL.rediscoverNode]: -128,
    [GOAL.seekTeaching]: -128,
    [GOAL.teach]: 256,
    [GOAL.scribe]: 256,
    [GOAL.affiliate]: -64,
    [GOAL.wardDuty]: 64,
    [GOAL.raidReadiness]: -256,
  },
};

/** Opportunity contributed per available candidate target. **Untuned.** */
export const OPPORTUNITY_PER_CANDIDATE: Fixed = 64;

/**
 * Candidates past which more of them add nothing.
 *
 * Concave by truncation, and for the same reason the library table is concave:
 * a mage with forty researchable nodes is not forty times as keen as a mage
 * with one, and an unbounded count would let a large node graph swamp every
 * other term. Four is a placeholder.
 */
export const OPPORTUNITY_CANDIDATE_CAP = 4;

function candidateOpportunity(count: number): Fixed {
  return Math.min(count, OPPORTUNITY_CANDIDATE_CAP) * OPPORTUNITY_PER_CANDIDATE;
}

/**
 * The two magnitudes affiliation is priced with, read once from content.
 *
 * **Two, because the codebase already names two operations.**
 * `completeAffiliation` and `changeAffiliation` are separate functions, and
 * `MageOutlook` carries `betterAffiliationAvailable` beside `universityId`
 * rather than instead of it. Getting a first university is a near-necessity —
 * it is the gate on scribing and warding. Moving between universities is a
 * preference about library depth. Pricing both with one number is what made
 * `affiliate` a goal that scored ≈640 against research's ≈832 and was never
 * chosen by anybody in any run.
 */
export interface AffiliationAppeal {
  /**
   * Opportunity for a mage with **no** university, `fp`.
   *
   * Bounded by `TERM_BOUND.opportunity`, and the shipped value is that bound:
   * the strongest statement this axis can make, for the one case where the goal
   * is a prerequisite rather than an option.
   */
  readonly firstOpportunity: Fixed;
  /** Opportunity for a mage who has one and could have a deeper one, `fp`. */
  readonly transferOpportunity: Fixed;
}

/** Every goal-scoring magnitude that is content rather than a table above. */
export interface GoalAppealWeights {
  readonly affiliation: AffiliationAppeal;
}

/** The part of `@mm/content`'s registry {@link readGoalAppeal} reads. */
export interface GoalAppealSource {
  autonomyWeight(id: string): number;
}

/**
 * Reads the goal-appeal magnitudes, once.
 *
 * Eager and by name, exactly as `readTargetAppeal` is and for the same two
 * reasons: `autonomyWeight` throws on an id the table does not declare, so a
 * content mistake fails before a single mage has chosen anything; and a
 * registry lookup per goal per mage per tick is the hot loop the Monte Carlo
 * harness runs millions of times.
 */
export function readGoalAppeal(source: GoalAppealSource): GoalAppealWeights {
  return Object.freeze({
    affiliation: Object.freeze({
      firstOpportunity: source.autonomyWeight('goal-affiliate-first-opportunity'),
      transferOpportunity: source.autonomyWeight('goal-affiliate-transfer-opportunity'),
    }),
  });
}

/**
 * The species term: what a mage's *kind* makes appealing.
 *
 * The `mage-autonomy` spec requires `curiosity` to raise both research goals
 * and says nothing about the rest; the other three trait uses are here because
 * each is the trait's own meaning in `contracts.md` §2.4 pointed at the goal it
 * describes, and leaving them out would make the whole species term a synonym
 * for curiosity.
 */
export function speciesTerm(goal: GoalId, outlook: MageOutlook): Fixed {
  const species = outlook.species;
  switch (goal) {
    case GOAL.researchNode:
      return boundTerm('species', shareOfDeviation(species.curiosity, 2));
    case GOAL.rediscoverNode:
      return boundTerm(
        'species',
        shareOfDeviation(species.curiosity, 4) + shareOfDeviation(species.rediscoveryAffinity, 2),
      );
    case GOAL.seekTeaching:
      return boundTerm('species', shareOfDeviation(species.learnRate, 2));
    case GOAL.teach:
      return boundTerm('species', shareOfDeviation(species.learnRate, 4));
    case GOAL.scribe:
      return boundTerm('species', shareOfDeviation(species.scribeAffinity, 2));
    default:
      return 0;
  }
}

/**
 * The personality term: what *this* mage makes appealing.
 *
 * All three axes shift at least one goal, which the spec requires, and caution
 * is the one that moves three — up on `scribe` and `ward-duty`, down on
 * `rediscover-node`. That is the spec's scenario written as arithmetic:
 * rediscovery is the risky way to recover something, and a cautious mage would
 * rather it had been written down in the first place.
 */
export function personalityTerm(goal: GoalId, outlook: MageOutlook): Fixed {
  const { curiosity, ambition, caution } = outlook.personality;
  switch (goal) {
    case GOAL.researchNode:
      return boundTerm('personality', shareOfDeviation(curiosity, 2));
    case GOAL.rediscoverNode:
      return boundTerm(
        'personality',
        shareOfDeviation(curiosity, 4) - shareOfDeviation(caution, 2),
      );
    case GOAL.seekTeaching:
      return boundTerm('personality', shareOfDeviation(curiosity, 4));
    case GOAL.teach:
      return boundTerm('personality', shareOfDeviation(ambition, 4));
    case GOAL.scribe:
      return boundTerm('personality', shareOfDeviation(caution, 2));
    case GOAL.affiliate:
      // **Ambition prices a transfer and does not price a first affiliation.**
      // Moving to a deeper library to make a bigger name is what ambition is;
      // needing an institution before you may write anything down is not a
      // matter of temperament. Leaving ambition on both would have left a real
      // tail — a low-ambition mage takes −256 here, which is enough to keep her
      // unaffiliated for a whole life, and "the unambitious never learn to
      // write" is a rule nobody chose.
      return outlook.universityId === 0
        ? 0
        : boundTerm('personality', shareOfDeviation(ambition, 2));
    case GOAL.wardDuty:
      return boundTerm('personality', shareOfDeviation(caution, 2));
    case GOAL.raidReadiness:
      return boundTerm('personality', shareOfDeviation(ambition, 2));
    default:
      return 0;
  }
}

/** The age term, read off {@link AGE_TERM} by the band the normalized age falls in. */
export function ageTerm(goal: GoalId, outlook: MageOutlook): Fixed {
  const band = ageBandOf(outlook.normalizedAge);
  return boundTerm('age', AGE_TERM[band][goal]);
}

/**
 * The opportunity term: how much of the goal there currently is to do.
 *
 * **Nothing here is a distance.** The `mage-autonomy` spec is explicit that
 * opportunity is computed "from affiliation and the teaching graph only", and
 * every input below is a count of candidates the gateway already produced, a
 * throughput, or a boolean about affiliation. There is no coordinate in
 * `MageOutlook` to reach for.
 */
export function opportunityTerm(
  goal: GoalId,
  outlook: MageOutlook,
  weights: GoalAppealWeights,
): Fixed {
  switch (goal) {
    case GOAL.researchNode:
      return boundTerm('opportunity', candidateOpportunity(outlook.discoveryTargets.length));
    case GOAL.rediscoverNode:
      return boundTerm('opportunity', candidateOpportunity(outlook.rediscoveryTargets.length));
    case GOAL.seekTeaching:
      return boundTerm('opportunity', candidateOpportunity(outlook.teachableToMe.length));
    case GOAL.teach:
      return boundTerm('opportunity', candidateOpportunity(outlook.teachableByMe.length));
    case GOAL.scribe:
      return boundTerm('opportunity', floorDiv(outlook.scribeThroughput, 4));
    case GOAL.affiliate:
      // Three cases and only two of them are weights. Nothing available is
      // zero — and `feasibility.ts` has already masked the goal in that case,
      // so this arm is reachable only through a direct call.
      if (!outlook.betterAffiliationAvailable) return 0;
      return boundTerm(
        'opportunity',
        outlook.universityId === 0
          ? weights.affiliation.firstOpportunity
          : weights.affiliation.transferOpportunity,
      );
    case GOAL.wardDuty:
      return boundTerm('opportunity', outlook.wardPressure);
    case GOAL.raidReadiness:
      return boundTerm('opportunity', outlook.raidPressure);
    default:
      return 0;
  }
}

/**
 * All six terms for one goal, before summation.
 *
 * `idle` short-circuits to six zeroes rather than falling through the tables,
 * so "idle scores at the floor" is a property of one line rather than of nine
 * table rows all happening to hold a zero.
 */
export function termsFor(
  goal: GoalId,
  outlook: MageOutlook,
  weights: GoalAppealWeights,
): ScoreTerms {
  if (goal === GOAL.idle) {
    return { base: 0, role: 0, species: 0, personality: 0, age: 0, opportunity: 0 };
  }
  return {
    base: boundTerm('base', GOAL_BASE_APPEAL[goal]),
    role: boundTerm('role', roleBiasFor(outlook.roleId, goal)),
    species: speciesTerm(goal, outlook),
    personality: personalityTerm(goal, outlook),
    age: ageTerm(goal, outlook),
    opportunity: opportunityTerm(goal, outlook, weights),
  };
}
