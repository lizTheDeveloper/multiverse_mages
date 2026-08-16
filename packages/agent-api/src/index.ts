/*
 * Multiverse Mages — agent interface package public surface.
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
 * `@mm/agent-api` — `docs/design/contracts.md` §4: the fixed-shape observation
 * vector, the discrete masked action space, the slot-indexed candidate lists,
 * the outcome record, and boundary normalization.
 *
 * > One interface serves scripted bots, Monte Carlo, and reinforcement
 * > learning. It is defined once, here, because building it twice guarantees
 * > divergence.
 *
 * Two properties of this package are structural rather than stylistic:
 *
 * 1. **This is the only place floating point is permitted.** §4.1 pins the
 *    exported observation as a `Float64Array` in `[0, 1]` with `fp(1024)`
 *    mapping to `1.0`. Normalization happens here, at the boundary, precisely
 *    so the float ban holds everywhere behind it. That is why this package is
 *    outside the `RULES_SRC` lint block in `eslint.config.mjs`, and
 *    `./normalize.ts` argues the case at length.
 * 2. **Nothing in the rules path may import it.** §5 rule 4: the dependency
 *    runs one way. A rules package that could read the observation layer would
 *    make the observation an input to the simulation, and the fixed shape RL
 *    depends on would start feeding back into the thing it measures.
 *
 * ## The shape of a step, from a caller's side
 *
 * ```ts
 * const view = observe({ state, catalogue });          // §4.1–4.4
 * const chosen = policy(view.normalized, view.mask);   // the caller's business
 * const { admitted } = admit({ state, catalogue }, chosen);  // §4.2, §4.4
 * const next = step(state, admitted, rng);             // sim-core
 * ```
 *
 * `admit` is the only function here that writes to state, and it writes exactly
 * one thing: `illegalActionCount`, which §4.2 requires and §7's
 * `illegalActionRate` is computed from.
 *
 * ## What this package deliberately does not do
 *
 * It does not **apply** actions. §5 puts observation, the action space, and
 * legality masks here; §8 leaves the god's mechanics — prices, hysteresis, what
 * encouragement does — to `god-agency`. `admit` decides what reaches the rules;
 * the rules decide what it means.
 *
 * It emits no **reward**. §4.3 is explicit that reward belongs to a training
 * objective and not to the game. `sparseTerminalReward` is a shipped default,
 * and the signature it satisfies is the contract.
 */

export type {
  ActionCostTable,
  ActionMaterialCost,
  CatalogueNode,
  ContentCatalogue,
} from './catalogue.js';
export { EMPTY_CATALOGUE, buildCatalogue } from './catalogue.js';

export type { GodActionId } from './actions.js';
export {
  ACTION_SPACE_SIZE,
  ALL_GOD_ACTIONS,
  CANDIDATE_SLOTS,
  GOD_ACTION,
  PARAMETERIZED_ACTIONS,
  RULESET_ACTIONS,
  candidateSlotCount,
  isGodAction,
} from './actions.js';

export type {
  NormalizationDescriptor,
  NormalizationRule,
  ObservationBlock,
  ObservationBlockName,
} from './layout.js';
export {
  BOOLEAN_SCALE,
  IDENTITY_SCALE,
  NORMALIZATION_RULES,
  boundedScale,
  flagScale,
  identityScale,
  logBucketScale,
  ratioScale,
  ENGAGEMENT_OBJECTIVE_CHANNELS,
  ENGAGEMENT_SIDE_CHANNELS,
  FP_SCALE,
  OBSERVATION_BLOCKS,
  OBSERVATION_BLOCK_NAMES,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_KNOWLEDGE_CHANNELS,
  OBSERVATION_OBJECTIVE_CHANNELS,
  OBSERVATION_OBJECTIVE_SLOTS,
  OBSERVATION_OCCUPATION_COUNT,
  OBSERVATION_SCALE,
  OBSERVATION_SIDE_CHANNELS,
  OBSERVATION_SIZE,
  OBSERVATION_SPECIES_COUNT,
  MAGE_TIER_SLOTS,
  OBSERVATION_TIER_COUNT,
  UNTAUGHT_TIER_SLOT,
  OBSERVATION_MAX_TRADITION_ID,
  OBSERVATION_MAX_WORSHIP_TIER,
  cohortSlot,
  descriptorAt,
  knowledgeSlot,
  mageTierSlot,
  observationBlock,
  saturate,
  speciesSlot,
} from './layout.js';

export type { EngagementView, ObservationInput } from './observation.js';
export { isEngaged, rawObservation } from './observation.js';

/**
 * §4.1's observation, named rather than positional — the entitlement half of
 * `docs/design/observation-entitlement.md`.
 *
 * `PlayerState` says *what a player may see*; `OBSERVATION_BLOCKS` says where it
 * goes. Those were one statement until now, made positionally, which is why a
 * trait could be added to the world and silently reach nobody.
 */
export type {
  PlayerEngagement,
  PlayerInstitutions,
  PlayerKnowledgeCell,
  PlayerObjective,
  PlayerResources,
  PlayerSide,
  PlayerState,
  PlayerClock,
} from './player-state.js';
export { encodePlayerState, playerStateFields, project } from './player-state.js';

export type { TraitClass, TraitClassification, UnencodedGap, WithholdingReason } from './entitlement.js';
export {
  DECLARED_UNENCODED,
  TRAIT_CLASSES,
  TRAIT_CLASSIFICATION,
  WITHHOLDING_REASONS,
  assertAllTraitsClassified,
  assertNoUndeclaredGaps,
  unclassifiedTraits,
  unencodedObservables,
} from './entitlement.js';

export type { Candidate, CandidateInput, CandidateLists } from './candidates.js';
export { buildCandidates, candidateAt } from './candidates.js';

export type { MaskInput } from './mask.js';
export { isLegal, legalityMask, unaffordableReason } from './mask.js';

export type { AdmissionResult, GateInput, RejectedAction, RejectionReason } from './gate.js';
export { admit } from './gate.js';

export { applyDescriptor, normalizedObservation } from './normalize.js';

export type { ObservationSlot } from './digest.js';
export {
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SLOTS,
  assertLayoutValid,
  layoutDigest,
  layoutEncoding,
  layoutProblems,
  slotDescriptor,
} from './digest.js';

export type {
  BalanceMetricDeltas,
  OutcomeInput,
  OutcomeRecord,
  RewardFunction,
} from './outcome.js';
export { outcomeOf, sparseTerminalReward } from './outcome.js';

/**
 * §1.1's five endings, re-exported so a caller can name the number
 * {@link OutcomeRecord.terminalReason} carries.
 *
 * It is defined in `@mm/state` and belongs there; this is a pass-through, not a
 * second definition. The reason it is worth the line: §5 gives `mc-harness` one
 * edge into the simulation and it is this package, so without the re-export the
 * harness would have to transcribe the numbering to report which ascension
 * route a run took — and a transcribed enum is a copy that can drift silently
 * from the one the dispatch writes.
 */
export type { TerminalReasonValue } from '@mm/state';
export { TERMINAL_REASON } from '@mm/state';

export type { AgentView, ObserveInput } from './view.js';
export { observe } from './view.js';

export type { ExplainProjection, ExplainedDecision } from './explain.js';

/**
 * §4.4's second projection: the knowledge census (vision §5).
 *
 * Exported beside the explain channel and **not** from {@link AgentView}, for
 * the reason `./explain.ts` gives about itself — a field on the observation
 * would be a channel a policy could learn to read, and §4.4's "no simulation
 * behaviour may depend on whether it was requested" would then rest on
 * everybody remembering. `./knowledge-census.ts` argues the placement at length.
 */
export type {
  CensusOptions,
  ContainmentReport,
  InstanceMastery,
  KnowledgeCensus,
  LocationSplit,
  MageRepertoire,
  MarooningSummary,
  MasteryModel,
  NodeCensusEntry,
  NodeMastery,
} from './knowledge-census.js';
export {
  CENSUS_LOCATION_KINDS,
  knowledgeCensus,
  locationSharePerMille,
  mageContainment,
} from './knowledge-census.js';

export type { AgentRng, AgentRngInput } from './agent-rng.js';
export { agentRng } from './agent-rng.js';

export type {
  AgentSession,
  EpisodeAccounting,
  EpisodeStatus,
  Scenario,
  ScenarioConfig,
  SessionOptions,
  SubmitResult,
} from './session.js';
export { createSession } from './session.js';
