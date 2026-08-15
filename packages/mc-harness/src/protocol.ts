/*
 * Multiverse Mages — the task and result shapes exchanged with a run worker.
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
 * The wire between the pool and a worker, and the shape of what comes back.
 *
 * Everything here must survive the structured clone algorithm, which rules out
 * functions, class instances, and anything holding a closure. That is not a
 * limitation to work around — it is the enforcement mechanism for "no shared
 * mutable state between runs". A task that could carry a live object could carry
 * a metric accumulator, and two runs sharing one accumulator is the defect the
 * capability spec names in its second scenario.
 */

import type { JsonValue } from './canonical.js';
import type { MetricEntries } from './metrics.js';
import type { CheckpointSample, MechanicAvailability, MirroredPlay } from './metrics-telemetry.js';
import type { IllegalActionAccounting, TerminalStatus } from './session.js';
import type { RunCoordinates } from './seed.js';

/**
 * The provenance keys every record carries (task 4.2).
 *
 * All of them are supplied by the caller's executor rather than computed here.
 * The harness cannot compute a content hash without importing content, and §5
 * grants it no such edge — which is the right answer for a different reason
 * too: the hash must describe the content *the worker actually loaded*, and only
 * the worker knows that.
 */
export interface Provenance {
  /** The build the run executed against. A version, a commit, or both. */
  readonly buildVersion: string;
  /** Hash of the content set loaded. */
  readonly contentHash: string;
  /** Hash of the `contracts.md` §6 RNG stream registry. */
  readonly rngRegistryHash: string;
  /** `agent-api`'s `observationSchemaVersion`. */
  readonly observationSchemaVersion: number;
  /** `agent-api`'s observation layout digest. */
  readonly observationLayoutDigest: string;
  /** Every collected metric's `definitionVersion`, keyed by metric id. */
  readonly metricDefinitionVersions: Readonly<Record<string, number>>;
}

/** Why a run failed. Recorded instead of a status the simulation could produce. */
export const FAILURE_CLASS = {
  /** The executor threw. */
  threw: 'threw',
  /** The run exceeded `termination.perRunTimeoutMs` and was abandoned. */
  timeout: 'timeout',
  /** The worker emitted an `error` event. */
  workerError: 'worker-error',
  /** The worker exited while holding a task. */
  workerExit: 'worker-exit',
  /** The worker sent something the pool could not interpret. */
  protocol: 'protocol',
} as const;

/** Any classification from {@link FAILURE_CLASS}. */
export type FailureClass = (typeof FAILURE_CLASS)[keyof typeof FAILURE_CLASS];

/** One unit of work, as handed to a worker. Structured-cloneable throughout. */
export interface RunTask {
  /** The run's coordinates. Also its identity, everywhere. */
  readonly coordinates: RunCoordinates;
  /** Derived from the coordinates, carried so the worker never re-derives it. */
  readonly runSeed: number;
  /** This cell's factor levels, keyed by factor id. */
  readonly levels: Readonly<Record<string, JsonValue>>;
  /** Strategy id per agent slot, in slot order. */
  readonly strategies: readonly string[];
  /** The declared world-tick cap. */
  readonly worldTickCap: number;
  /** Metric ids to collect. Every one gets an entry in the result. */
  readonly metrics: readonly string[];
  /** Primitives to neutralize, or empty. Task group 7 gives this meaning. */
  readonly ablatedPrimitives: readonly string[];
  /**
   * The agent slot that plays the neutralized ruleset, on a mirrored ablation
   * arm; absent on the control arm and on every non-ablation sweep.
   *
   * Optional because it is meaningless without {@link ablatedPrimitives}, and
   * because a required field here would change every task ever constructed by a
   * caller that has no ablation in it. See `ablation.ts` on why one primitive
   * produces two arms and why the side is what distinguishes them.
   */
  readonly ablatedSlotIndex?: number;
}

/**
 * What one run contributes to the metrics defined **across** an arm.
 *
 * `contracts.md` §7 has five `per-arm` metrics — two Gini coefficients, two win
 * rates, one ascension rate — and none of them has a per-run value. The run
 * record carries `{unavailable, per-arm-scope}` for each; the number itself can
 * only be computed once every run of the arm has finished. This is the per-run
 * *input* to that computation, and it exists because the alternative — the
 * runner reaching back into the simulation after the fact — is not available to
 * a package whose only edge is `agent-api` and whose runs happen in other
 * threads.
 *
 * Every field is structured-cloneable, because it crosses a worker boundary, and
 * every field is also written into the run record, because task 4.5's offline
 * re-aggregation has to reproduce the arm metrics from stored records alone.
 *
 * **Optional in its entirety.** An executor that describes no arm — the toy
 * world in this package's fixtures, or any caller written before task group 6 —
 * contributes nothing, and the sweep reports no arm metrics rather than
 * reporting them over an empty arm. A Gini coefficient of nothing is 0, and 0 is
 * the answer for a perfectly equal population; the two must not be confused.
 */
export interface ArmContribution {
  /** What the build implements. Must agree across every run of the arm. */
  readonly mechanics: MechanicAvailability;
  /** This run's samples at the pinned snowball checkpoints, ascending by tick. */
  readonly checkpoints: readonly CheckpointSample[];
  /**
   * The maximum permitted prestige carry-forward, or `null` when nobody has
   * chosen one. Must agree across every run of the arm.
   */
  readonly prestigeCarryForwardMax: number | null;
  /** This run's mirrored `prestigeAdvantage` play, when it was one half of a pair. */
  readonly mirroredPlay?: MirroredPlay;
  /** This run's mirrored ablation play, when the arm is an ablation arm. */
  readonly ablationPlay?: {
    readonly runSeed: number;
    readonly retainingSide: 0 | 1;
    readonly retainingWon: boolean;
  };
}

/**
 * One census reading, carried through to the record so a run has a trajectory
 * and not only an ending.
 *
 * The reference executor already samples these every twelve world ticks and
 * keeps only the **last** one, which answers *"where did this universe finish"*
 * and cannot answer *"when did it get there"*. Those are different questions,
 * and the campaign has repeatedly needed the second one: "much sooner, same
 * place" and "the ceiling subsumed the effect" are indistinguishable from a
 * terminal reading alone.
 *
 * A trace point rather than a new registered metric, deliberately.
 * {@link Provenance.metricDefinitionVersions} covers the whole reference metric
 * registry, so adding a metric id moves provenance on every record and makes the
 * balance gate refuse cross-build comparison — a baseline movement caused by an
 * instrument rather than by the game. The field is additive and optional; a
 * reader that does not know it is unaffected.
 *
 * Declared here rather than imported from `@mm/scenario` because §5 runs the
 * dependency edge the other way: the scenario package implements
 * {@link RunExecutor}, and the harness must not import it.
 */
export interface CensusTracePoint {
  readonly worldTick: number;
  /** Distinct nodes of which the universe holds at least one instance. */
  readonly nodesKnown: number;
  /** Knowledge instances, held and written. §7's redundancy quantity. */
  readonly knowledgeInstances: number;
  /** Distinct nodes held in libraries. The §6a capital loop's stock variable. */
  readonly libraryDepth: number;
  readonly livingMages: number;
  readonly population: number;
  readonly grimoires: number;
}

/** What an executor returns for a run that completed, however it ended. */
export interface RunOutcome {
  readonly status: TerminalStatus;
  /**
   * §1.1's ending. See {@link RunRecord.terminalReason}.
   *
   * Optional so that an executor written before the field existed still
   * satisfies the type; it then records `none`, which is the honest reading of
   * "this executor does not report a route".
   */
  readonly terminalReason?: number;
  readonly ticksRun: number;
  readonly metrics: MetricEntries;
  readonly accounting: IllegalActionAccounting;
  readonly provenance: Provenance;
  /** See {@link ArmContribution}. Absent when the executor describes no arm. */
  readonly armContribution?: ArmContribution;
  /**
   * Cumulative favor the god actually **spent**, keyed by §4.2 action id.
   *
   * Applied spend only. `coordination`'s intervention resolver folds a cost into
   * its tally *after* the deduction succeeds and rolls back before refusing, so
   * an action that was masked, unaffordable or refused by a precondition
   * contributes nothing here. That is the honest quantity for "what did this god
   * buy", and it is why an attempted-submission count is not a substitute:
   * between the two sits affordability, which is exactly the thing a spend
   * comparison has to be able to see.
   *
   * Keys are stringified action ids, because JSON object keys are strings and a
   * numeric-keyed record round-trips as a string-keyed one either way.
   *
   * Absent when the executor does not observe a god. **Not stored in world
   * state**, and that is a requirement rather than an omission: `coordination`'s
   * favor ledger documents that a projection inside a snapshot is inside every
   * hash, at which point two peers can desync over a number no rule reads. The
   * accumulation happens in the measurement layer, above the step loop.
   */
  readonly godSpendByAction?: Readonly<Record<string, number>>;
  /** See {@link CensusTracePoint}. Absent when the executor keeps no trace. */
  readonly censusTrace?: readonly CensusTracePoint[];
}

/**
 * Executes one run. The caller supplies this; the harness never writes one.
 *
 * It is the *only* place the simulation is reached, which is what lets this
 * package sit behind `contracts.md` §5's boundary while the session API is
 * still being built next door.
 */
export type RunExecutor = (task: RunTask) => RunOutcome | Promise<RunOutcome>;

/** Pool to worker. */
export type WorkerRequest =
  | { readonly kind: 'run'; readonly taskId: number; readonly task: RunTask }
  | { readonly kind: 'shutdown' };

/** Worker to pool. */
export type WorkerResponse =
  | { readonly kind: 'ready' }
  | { readonly kind: 'result'; readonly taskId: number; readonly outcome: RunOutcome }
  | {
      readonly kind: 'threw';
      readonly taskId: number;
      readonly message: string;
    };
