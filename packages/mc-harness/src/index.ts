/*
 * Multiverse Mages — Monte Carlo harness package public surface.
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
 * `@mm/mc-harness` — the Monte Carlo runner of `agent-interface` task groups 3
 * through 6, 8 and 9: the `worker_threads` pool, the sweep specification format,
 * deterministic seed derivation, append-only result storage, canonical-order
 * aggregation, single-run reproduction, the scripted bot pool, tournament
 * scheduling with its pairwise outcome matrix, the §7 metric registry, and — in
 * `baseline.ts`, `standard-error.ts`, `gate.ts` and `regenerate.ts` — the
 * committed balance baselines, the regression gate that reads them, and the
 * separately-invoked command that is the only thing allowed to write one.
 *
 * Group 7 (ablation) lands on top of this; the shape it needs —
 * {@link AblationSpec} — is declared here and left mostly empty.
 *
 * ## The one property everything else serves
 *
 * Two executions of the same sweep at the same root seed produce **byte-identical
 * records and identical aggregates**, with no tolerance anywhere in the
 * comparison. Three mechanisms hold it up, and each has a whole file arguing for
 * itself:
 *
 * - `seed.ts` — a run's seed is a pure function of its four coordinates, so
 *   nothing about scheduling reaches the simulation.
 * - `aggregate.ts` — every floating-point fold walks records sorted by
 *   `(cellIndex, replicateIndex)`, because eight workers do not finish in an
 *   order and float addition is not associative.
 * - `canonical.ts` — records serialize with sorted keys and reject the values
 *   JSON cannot carry faithfully, so "identical numbers" and "identical bytes"
 *   are the same claim.
 *
 * The wall-clock throughput figures live in a separate performance section that
 * every reproducibility comparison excludes — see `reproducibleSummary`.
 *
 * ## Unlike the rules packages, this one is host-side tooling
 *
 * It owns worker processes, reads a wall clock to report throughput, and writes
 * result files, so it sees Node's ambient types and is deliberately outside the
 * rules-path purity block. Its determinism obligation is to run the core
 * faithfully, not to be integer-only itself.
 *
 * §5 grants it one edge, to `@mm/agent-api`, and the bot pool is what finally
 * uses it: the strategies name §4.2's action ids, read §4.1's observation block
 * offsets, and draw from `agent-api`'s own agent-side generator, rather than
 * from local copies of any of the three. What still reaches the *simulation* is
 * a caller-supplied {@link RunExecutor} and nothing else — `session.ts`'s
 * {@link adaptAgentSession} is what such an executor wraps `agent-api`'s
 * session in, and `contracts.md` §5 keeps the world-building on the caller's
 * side of the boundary because building one needs `@mm/content` and
 * `@mm/coordination`, which the harness may not import.
 */

export type { JsonValue } from './canonical.js';
export { canonicalHash, canonicalJson, sha256Hex } from './canonical.js';

export type {
  AggregationRule,
  FactorRegistry,
  MetricDefinition,
  MetricDetail,
  MetricEntries,
  MetricEntry,
  MetricRegistry,
  MetricScope,
  StrategyRegistry,
  UnavailableReason,
} from './metrics.js';
export {
  EMPTY_FACTOR_REGISTRY,
  EMPTY_METRIC_REGISTRY,
  EMPTY_STRATEGY_REGISTRY,
  METRIC_SCOPE,
  UNAVAILABLE_REASON,
  factorRegistry,
  isMeasured,
  metricRegistry,
  strategyRegistry,
} from './metrics.js';

export type {
  ArmRunSummary,
  ArmTelemetry,
  CensusSample,
  CheckpointSample,
  MechanicAvailability,
  MirroredPlay,
  LossShockSample,
  RaidObservation,
  RoleDemographySample,
  RosterSample,
  RunTelemetry,
  SpeciesGridReach,
  SpeciesVersatilitySample,
  TierReach,
} from './metrics-telemetry.js';
export { MECHANICS_AT_0_5_0, NO_MECHANICS } from './metrics-telemetry.js';

export type {
  LossShockFinding,
  RoleDemographyFinding,
  SpeciesVersatilityFinding,
} from './metrics-species-health.js';
export {
  RECOVERY_FRACTION,
  STAFFABLE_DEFINITION,
  VERSATILITY_HEGEMONY_FRACTION,
  collectLossShockRecovery,
  collectRoleAssignmentDemographicCost,
  collectSpeciesGridVersatility,
} from './metrics-species-health.js';

export {
  KNOWLEDGE_CENSUS_INTERVAL_TICKS,
  KnowledgeCensus,
  censusProblems,
  censusTicks,
  isCensusTick,
} from './metrics-census.js';

export type { SurvivalCurve, SurvivalObservation, SurvivalStep } from './metrics-survival.js';
export { kaplanMeier, survivalQuantile } from './metrics-survival.js';

export type { GiniResult } from './metrics-gini.js';
export { gini, nearestRank, tailRatio } from './metrics-gini.js';

export type {
  CheckpointGini,
  RaidLengthHistogram,
  SnowballQuantity,
  StrategyIllegalActions,
  TierPairAggregate,
  TierPairOutcome,
} from './metrics-collectors.js';
export {
  HALF_LIFE_QUANTILE,
  HEAVY_CENSORING_FRACTION,
  MetricCollectionError,
  NOOP_ACTION_ID,
  RAID_LENGTH_BIN_WIDTH_TICKS,
  SNOWBALL_CHECKPOINT_TICKS,
  TIER_MAX,
  TIER_MIN,
  TIER_PAIR_COUNT,
  aggregateTierPairs,
  checkpointGinis,
  collectAscensionRate,
  collectCapitalSnowball,
  collectIllegalActionRate,
  collectInboundRaidTempoLoss,
  collectKnowledgeHalfLife,
  collectLibraryDependence,
  collectPrestigeAdvantage,
  collectRaidInitiationCost,
  collectRaidLengthDistribution,
  collectTimeToTierBySpecies,
  collectWinRateByPrimitive,
  collectWorshipSnowball,
  illegalActionsByStrategy,
  mirroredPairProblems,
  raidLengthHistogram,
  survivalObservationsFrom,
  tierPairOutcomes,
} from './metrics-collectors.js';

export type { BalanceMetricDefinition, BalanceMetricRegistry } from './metrics-registry.js';
export {
  BALANCE_METRIC_IDS,
  BALANCE_METRIC_REGISTRY,
  collectArmMetrics,
  collectRunMetrics,
  metricDefinitionVersions,
} from './metrics-registry.js';

export type { ConformanceReport, DefinitionPin, DefinitionPins } from './metrics-conformance.js';
export {
  contractSection7MetricIds,
  currentDefinitionPins,
  definitionDigest,
  definitionVersionConformance,
  registryConformance,
} from './metrics-conformance.js';

export type { RunCoordinates } from './seed.js';
export {
  MAX_CELL_INDEX,
  MAX_REPLICATE_INDEX,
  REPLICATE_INDEX_BITS,
  SEED_DERIVATION_VERSION,
  deriveRunSeed,
  fnv1a32,
  seedMatchesCoordinates,
} from './seed.js';

export type {
  AblationSpec,
  AgentPoolSpec,
  AssignmentRule,
  SweepCell,
  SweepFactor,
  SweepKind,
  SweepPlan,
  SweepRegistries,
  SweepSpec,
  TerminationSpec,
} from './sweep-spec.js';
export {
  ASSIGNMENT_RULE,
  SWEEP_KIND,
  assignStrategies,
  expandSweep,
  sweepConfigurationHash,
  validateSweep,
} from './sweep-spec.js';

export type {
  ActionSubmission,
  AgentSession,
  EpisodeInput,
  EpisodeOutcome,
  IllegalActionAccounting,
  SlotPolicy,
  TerminalStatus,
} from './session.js';
export {
  RECORDED_STATUSES,
  TERMINAL_REASON_NAME,
  TERMINAL_STATUS,
  adaptAgentSession,
  normalizeSubmission,
  runEpisode,
  terminalReasonName,
} from './session.js';

/**
 * §1.1's endings, passed through from `agent-api` (which passes them through
 * from `@mm/state`).
 *
 * Re-exported here so a consumer of the harness can name the number
 * {@link RunRecord.terminalReason} carries without adding a second package
 * edge for one enum — and, more to the point, without transcribing it.
 */
export { TERMINAL_REASON } from '@mm/agent-api';

export type {
  ArmContribution,
  CensusTracePoint,
  FailureClass,
  Provenance,
  RunExecutor,
  RunOutcome,
  RunTask,
  WorkerRequest,
  WorkerResponse,
} from './protocol.js';
export { FAILURE_CLASS } from './protocol.js';

export { serveRuns } from './worker-main.js';

export type { PoolFailure, PoolOptions, PoolResult } from './pool.js';
export { DEFAULT_BOOT_TIMEOUT_MS, runTasksInline, runTasksOnPool } from './pool.js';

export type {
  MetricAggregate,
  PerformanceSection,
  RunRecord,
  SweepSummary,
} from './records.js';
export {
  RECORD_FORMAT_VERSION,
  buildRunRecord,
  decodeRecord,
  encodeRecord,
  encodeSummary,
  provenanceDisagreements,
  provenanceProblems,
  reproducibleSummary,
} from './records.js';

export {
  aggregateMetrics,
  buildArmTelemetry,
  countByFailureClass,
  countByStatus,
  countByTerminalReason,
  sortCanonically,
  totalWorldTicks,
} from './aggregate.js';

export type { OutputMode, SweepOutput } from './storage.js';
export {
  OUTPUT_MODE,
  existingExecutions,
  openSweepOutput,
  readRunRecords,
  readSweepSummary,
} from './storage.js';

export type { RunSweepOptions, SweepExecution, SweepResult } from './runner.js';
export { reaggregate, runSweep } from './runner.js';

export { buildTasks } from './tasks.js';

export type { ShardResults, ShardSelector } from './shard.js';
export {
  decodeShardResults,
  encodeShardResults,
  mergeShardResults,
  selectShard,
  shardAssignment,
} from './shard.js';

export type {
  AblationArm,
  AblationPlay,
  AblationRole,
  ArmSchedule,
  AttributionStatus,
  PrimitiveAttribution,
  WilsonInterval,
} from './ablation.js';
export {
  ABLATION_ROLE,
  ATTRIBUTION_STATUS,
  CONTROL_ARM,
  MIRRORED_SLOT_COUNT,
  NOT_ATTRIBUTABLE_PRIMITIVES,
  WILSON_Z_95,
  ablationArms,
  ablationPairProblems,
  ablationProblems,
  armSpec,
  attributePrimitive,
  attributionDetail,
  attributionEntry,
  isAttributable,
  mirroredSideProblems,
  pairedSeedProblems,
  scheduleAblation,
  validateAblationSweep,
  wilsonInterval,
} from './ablation.js';

export type { ReproduceOptions, ReproductionResult, RunSelector } from './reproduce.js';
export { compareToRecord, reproduceRun, taskFor } from './reproduce.js';

export type { CliSink, ReproduceArgs, RunSweepArgs, ScenarioModule } from './cli.js';
export { DEFAULT_OUTPUT_MODE, describeSweep, reproduceCommand, runSweepCommand } from './cli.js';

export type { SweepFileResult } from './sweep-file.js';
export { parseSweepFile, readSweepFile } from './sweep-file.js';

export type { ArmScopedRun, ScopedMetricId } from './arm-scope.js';
export {
  ARM_SCOPE_SEPARATOR,
  armScopedMetricId,
  distinctStrategyKeys,
  parseMetricScope,
  strategyKeyOf,
} from './arm-scope.js';
export type { StandardErrorEstimate, StandardErrorMethod } from './standard-error.js';
export { STANDARD_ERROR_METHOD, standardErrorOf } from './standard-error.js';

export type { Baseline, BaselineMetric, SupersededDelta, UnhashedBaseline } from './baseline.js';
export {
  BASELINE_FORMAT_VERSION,
  baselineContentHash,
  baselineMetrics,
  baselineProblems,
  encodeBaseline,
  parseBaseline,
  sealBaseline,
} from './baseline.js';

export type { GateComparison, GateInput, GateReport, GateStatus } from './gate.js';
export {
  GATE_STATUS,
  compareToBaseline,
  describeGate,
  missingBaselineReport,
  provenanceMismatches,
} from './gate.js';

export type { RegenerateInput, RegenerateResult } from './regenerate.js';
export { regenerateBaseline } from './regenerate.js';

export type { GateCommandResult, GateSweepOptions, RegenerateArgs } from './balance-cli.js';
export { gateCommand, loadBaseline, regenerateCommand } from './balance-cli.js';

export type {
  AscensionStance,
  BotStrategyRegistry,
  DegeneracyReport,
  PreferenceInput,
  StrategyContext,
  StrategyDefinition,
} from './strategies.js';
export {
  ASCENSION_STANCE,
  BOT_POOL,
  BOT_POOL_REGISTRY,
  POOL_BUILD_LIMITS,
  botStrategyRegistry,
  degeneracyOf,
  effectivePreferences,
  policiesForRun,
  policyFor,
  poolDegeneracy,
} from './strategies.js';

export type { BlockDivergence, ObservationDivergence } from './divergence.js';
export { describeDivergence, observationDivergence } from './divergence.js';

export type {
  DominanceStatus,
  PairwiseMatrix,
  PairwiseOutcome,
  TournamentRun,
  TournamentSchedule,
} from './tournament.js';
export {
  DOMINANCE_STATUS,
  TOURNAMENT_WORLD_SEED_FACTOR,
  describeMatrix,
  orderedPairings,
  pairwiseMatrix,
  tournamentSchedule,
  tournamentSpec,
} from './tournament.js';

export type {
  Band,
  BalanceScore,
  ScoreWeights,
  StrategyOutcome,
  TuningAxis,
} from './tuner.js';
export {
  DOMINANCE_LIMIT,
  EXPLOIT_PROBE,
  candidatesForAxis,
  correlationOf,
  scoreBalance,
  varietyOf,
} from './tuner.js';
