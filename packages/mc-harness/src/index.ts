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
 * `@mm/mc-harness` — the Monte Carlo runner of `agent-interface` task groups 3,
 * 4 and 5: the `worker_threads` pool, the sweep specification format,
 * deterministic seed derivation, append-only result storage, canonical-order
 * aggregation, single-run reproduction, the scripted bot pool, and tournament
 * scheduling with its pairwise outcome matrix.
 *
 * Group 6 (the metric registry proper) and group 7 (ablation) land on top of
 * this; the shapes they need — {@link MetricRegistry}, {@link AblationSpec} —
 * are declared here and left empty.
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
  MetricEntries,
  MetricEntry,
  MetricRegistry,
  StrategyRegistry,
  UnavailableReason,
} from './metrics.js';
export {
  EMPTY_FACTOR_REGISTRY,
  EMPTY_METRIC_REGISTRY,
  EMPTY_STRATEGY_REGISTRY,
  UNAVAILABLE_REASON,
  factorRegistry,
  isMeasured,
  metricRegistry,
  strategyRegistry,
} from './metrics.js';

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
  TERMINAL_STATUS,
  adaptAgentSession,
  normalizeSubmission,
  runEpisode,
} from './session.js';

export type {
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
export { runTasksInline, runTasksOnPool } from './pool.js';

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
  countByFailureClass,
  countByStatus,
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
export { buildTasks, reaggregate, runSweep } from './runner.js';

export type { ReproduceOptions, ReproductionResult, RunSelector } from './reproduce.js';
export { compareToRecord, reproduceRun, taskFor } from './reproduce.js';

export type { CliSink, ReproduceArgs, RunSweepArgs, ScenarioModule } from './cli.js';
export { DEFAULT_OUTPUT_MODE, describeSweep, reproduceCommand, runSweepCommand } from './cli.js';

export type {
  BotStrategyRegistry,
  DegeneracyReport,
  PreferenceInput,
  StrategyContext,
  StrategyDefinition,
} from './strategies.js';
export {
  BOT_POOL,
  BOT_POOL_REGISTRY,
  POOL_BUILD_LIMITS,
  botStrategyRegistry,
  degeneracyOf,
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
