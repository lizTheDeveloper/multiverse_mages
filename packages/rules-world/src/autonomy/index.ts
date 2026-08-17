/*
 * Multiverse Mages — the utility-AI's public surface.
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
 * Mage autonomy: the mechanism behind vision §7's *"you set the role; they
 * decide everything else."*
 *
 * Five rules run through the whole directory, and each is argued where it
 * applies rather than only here:
 *
 * - **Goal ids are permanent** (`goals.ts`). They key balance baselines, so
 *   renumbering one rewrites history rather than breaking a build.
 * - **Feasibility is a mask, never a weight** (`feasibility.ts`). An infeasible
 *   goal is removed and counted, so a career that evaporates is a number rather
 *   than an inference.
 * - **Scores are additive and clamped once** (`terms.ts`, `scoring.ts`). A
 *   product cannot answer "why did this mage choose to scribe?", and ablation
 *   is how `contracts.md` §7's methodology works.
 * - **Nothing here touches a position** (`outlook.ts`). The outlook has no
 *   coordinate to read, and a conformance check scans the directory anyway.
 * - **Roles bias; they never dictate** (`role-bias.ts`). The bound is checked
 *   in CI against the other five terms' extremes, because "biases" is only a
 *   claim once it is a number.
 *
 * Every magnitude in this directory is **untuned**. There is no balance harness
 * before 0.5.0 (`docs/design/release-plan.md`), and no release before then may
 * claim any of these numbers is right.
 */

export type { AgeBandValue } from './age-bands.js';
export {
  AGE_BAND,
  AGE_BANDS_IN_ORDER,
  AGE_BAND_NAMES,
  PRIME_BEGINS_AT,
  SENESCENCE_BEGINS_AT,
  ageBandOf,
} from './age-bands.js';

export type { AffiliationPreference } from './affiliation.js';
export { completeAffiliation } from './affiliation.js';

export {
  clearCommitment,
  hasCommitment,
  readCommitment,
  writeCommitment,
} from './commitment-store.js';

export type { SplitFrontier } from './candidates.js';
export {
  MAX_CANDIDATE_TARGETS,
  boundCandidates,
  compareNovelty,
  compareTargets,
  gatherFrontier,
  withinDepthCeiling,
} from './candidates.js';

export type { FeasibilityOutcome } from './feasibility.js';
export { isFeasible, maskGoals } from './feasibility.js';

export type { GoalId } from './goals.js';
export {
  GOAL,
  GOALS_IN_ORDER,
  GOALS_NEEDING_A_TARGET,
  GOAL_COUNT,
  GOAL_NAMES,
  isGoalId,
  needsTarget,
} from './goals.js';

export type { HistogramCell } from './histogram.js';
export {
  GoalHistogram,
  MONOCULTURE_SHARE,
  MONOCULTURE_SUSTAINED_TICKS,
  histogramCellCount,
} from './histogram.js';

export type { MageOutlook } from './outlook.js';

export type { RoleBiasRow } from './role-bias.js';
export { ROLE_BIAS, ROLE_BIAS_MAX, ROLE_BIAS_TUNING_STATUS, roleBiasFor } from './role-bias.js';

export type { MageGoalCommitment, ReevaluationInput, ReevaluationReason, ScheduleOptions } from './schedule.js';
export {
  EVAL_PERIOD,
  HYSTERESIS_MARGIN,
  MIN_COMMITMENT_TICKS,
  displaces,
  isEvaluationTick,
  reevaluationReason,
  shouldReevaluate,
} from './schedule.js';

export type { GoalScore, ScoringOptions } from './scoring.js';
export { SCORE_CEILING, SCORE_FLOOR, combineTerms, scoreGoal, scoreGoals } from './scoring.js';

export type { Selection, SelectionInput } from './select.js';
export { argmaxWithTieBreak, chooseTarget, selectGoal } from './select.js';

export type { AutonomyTickInput, AutonomyTickReport, MageDecision } from './tick.js';
export { stepMageAutonomy } from './tick.js';

export type {
  CellEmphasis,
  SpeciesAffinities,
  TargetAppealOptions,
  TargetAppealSource,
  TargetAppealWeights,
  TargetScore,
  TargetTermKind,
  TargetTerms,
} from './target-appeal.js';
export {
  NO_AFFINITIES,
  NO_EMPHASIS,
  TARGET_APPEAL_TUNING_STATUS,
  TARGET_TERM_KINDS,
  affinityTerm,
  ageTargetTerm,
  compareAppeal,
  effortTerm,
  emphasisTerm,
  personalityTargetTerm,
  readTargetAppeal,
  resolveSpeciesAffinities,
  roleTargetTerm,
  speciesTargetTerm,
  targetAppeal,
  targetTerms,
} from './target-appeal.js';

export type {
  AffiliationAppeal,
  GoalAppealSource,
  GoalAppealWeights,
  ScoreTerms,
  TermKind,
} from './terms.js';
export {
  AGE_TERM,
  GOAL_BASE_APPEAL,
  OPPORTUNITY_CANDIDATE_CAP,
  OPPORTUNITY_PER_CANDIDATE,
  SCORING_TUNING_STATUS,
  TERM_BOUND,
  TERM_KINDS,
  ageTerm,
  opportunityTerm,
  personalityTerm,
  readGoalAppeal,
  speciesTerm,
  termsFor,
} from './terms.js';
