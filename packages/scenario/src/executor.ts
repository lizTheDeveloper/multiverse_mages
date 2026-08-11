/*
 * Multiverse Mages — the run executor: one Monte Carlo task, one real universe.
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
 * This is the seam `contracts.md` §5 leaves open on purpose. `mc-harness` owns
 * scheduling, seeds, records and aggregation and *"deliberately does not own
 * what a run is"*; the caller supplies a `RunExecutor`, which is the only code
 * that touches the simulation. Until now the only executor in this repository
 * was the toy world in the harness's own fixtures, which says of itself: *"it is
 * **not** a universe."* This one is.
 *
 * Everything below goes through `agent-api`: the session, the strategies'
 * observations and masks, and — see `census.ts` — the numbers recorded at the
 * end. Nothing reads the `SimState` the scenario built, even though this package
 * is the thing that built it.
 */

import { OBSERVATION_LAYOUT_DIGEST, OBSERVATION_SCHEMA_VERSION, createSession } from '@mm/agent-api';
import type { ScenarioConfig } from '@mm/agent-api';
import { RNG_STREAM } from '@mm/sim-core';
import type {
  AgentSession,
  IllegalActionAccounting,
  JsonValue,
  Provenance,
  RunExecutor,
  RunOutcome,
  RunTask,
  TerminalStatus,
} from '@mm/mc-harness';
import {
  BOT_POOL_REGISTRY,
  adaptAgentSession,
  canonicalHash,
  policiesForRun,
  runEpisode,
} from '@mm/mc-harness';

import type { CensusSample } from './census.js';
import { censusOf } from './census.js';
import type { RunMeasurement } from './measures.js';
import { REFERENCE_METRIC_VERSIONS, collectReferenceMetrics } from './measures.js';
import type { ReferenceContent } from './reference-universe.js';
import { referenceContent, referenceScenario } from './reference-universe.js';

/**
 * The build every reference record claims to have run against.
 *
 * A constant rather than a filesystem read at run time: a worker reading
 * `package.json` would report whatever tree it happened to be started from,
 * which is exactly the ambiguity a provenance block exists to remove.
 * `provenance.test.ts` asserts it equals the workspace version, so bumping one
 * without the other fails the suite rather than mislabelling a baseline.
 */
export const SCENARIO_BUILD_VERSION = '0.3.0';

/**
 * World ticks between census readings.
 *
 * Twelve — one world year (`contracts.md` §0). It matches the interval task 6.4
 * pins for §7's knowledge census, deliberately, so that the vital signs recorded
 * now and the balance metrics recorded later describe the same sampling grid.
 * This is not that census; see `measures.ts`.
 */
export const CENSUS_INTERVAL_TICKS = 12;

/** A session that keeps a census every {@link CENSUS_INTERVAL_TICKS} ticks. */
interface CensusRecorder<TConfig> {
  readonly session: AgentSession<TConfig>;
  /** Readings so far, ascending by world tick. */
  readonly samples: readonly CensusSample[];
  /** Takes a reading now, whatever the interval says. */
  takeNow(): CensusSample;
}

/**
 * Wraps a session so that driving it records the universe's vital signs.
 *
 * A decorator rather than a change to `runEpisode`, because the episode loop is
 * the harness's and a loop that sampled would be a loop with an opinion about
 * what is worth measuring. `observe()` is called once per slot per round, which
 * is once per world tick for the single-slot episode a reference sweep runs, so
 * this sees every tick and keeps one in twelve.
 */
function recordingSession<TConfig>(
  inner: AgentSession<TConfig>,
  intervalTicks: number,
): CensusRecorder<TConfig> {
  const samples: CensusSample[] = [];
  let lastRecordedTick = -1;

  const record = (sample: CensusSample): CensusSample => {
    if (sample.worldTick !== lastRecordedTick) {
      lastRecordedTick = sample.worldTick;
      samples.push(sample);
    }
    return sample;
  };

  const takeNow = (): CensusSample => record(censusOf(inner.observe()));

  return {
    samples,
    takeNow,
    session: {
      reset(runSeed: number, scenarioConfig: TConfig): void {
        inner.reset(runSeed, scenarioConfig);
        samples.length = 0;
        lastRecordedTick = -1;
        takeNow();
      },
      observe(): Float64Array {
        const observation = inner.observe();
        const sample = censusOf(observation);
        if (sample.worldTick % intervalTicks === 0) record(sample);
        return observation;
      },
      legalActions: () => inner.legalActions(),
      submit: (actionId: number, parameter?: number) => {
        inner.submit(actionId, parameter);
      },
      status: (): TerminalStatus => inner.status(),
      accounting: (): IllegalActionAccounting => inner.accounting(),
    },
  };
}

/** What the harness believes about a build that runs the reference universe. */
export function referenceProvenance(content: ReferenceContent = referenceContent()): Provenance {
  return {
    buildVersion: SCENARIO_BUILD_VERSION,
    // The content hash is `contentRevision` itself: §0 already defines it as the
    // hash two universes compare to agree they can play together, and a second
    // hash over the same files would be a second answer to one question.
    contentHash: content.registry.contentRevision,
    rngRegistryHash: canonicalHash(RNG_STREAM as unknown as JsonValue, 'rng-stream-registry'),
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    metricDefinitionVersions: REFERENCE_METRIC_VERSIONS,
  };
}

/**
 * The scenario config one task asks for.
 *
 * Every factor level is passed through, not only the ones this scenario reads.
 * The sweep validator has already rejected a factor the scenario does not read
 * (task 3.4), so anything arriving here is a level somebody declared on purpose,
 * and `referenceOptions` refuses one whose *type* is wrong rather than silently
 * substituting a default.
 */
function configFor(task: RunTask): ScenarioConfig {
  const options: Record<string, number | string | boolean> = {};
  for (const [key, level] of Object.entries(task.levels)) {
    if (typeof level !== 'number' && typeof level !== 'string' && typeof level !== 'boolean') {
      throw new Error(
        `Factor ${key} has level ${JSON.stringify(level)}. A scenario configuration carries ` +
          'scalars only, so that a sweep can hash a config into a run record without inventing a ' +
          'serialization for it.',
      );
    }
    options[key] = level;
  }
  return { worldTickCap: task.worldTickCap, options };
}

/** How a reference executor is built. */
export interface ReferenceExecutorOptions {
  /** Resolved content. Defaults to the shipped set, resolved once per process. */
  readonly content?: ReferenceContent;
  /** Ticks between census readings. Defaults to {@link CENSUS_INTERVAL_TICKS}. */
  readonly censusIntervalTicks?: number;
}

/** One completed run, before it becomes a record. */
export interface ReferenceRunResult {
  readonly outcome: RunOutcome;
  /** Every census reading, ascending by world tick. Reporting only. */
  readonly samples: readonly CensusSample[];
}

/**
 * Runs one task over a real universe and reports what it did.
 *
 * Exported beside {@link makeReferenceExecutor} so a test can read the census a
 * run produced. The executor the harness drives returns only the `RunOutcome`,
 * because that is what a record is made of.
 */
export function executeReferenceRun(
  task: RunTask,
  options: ReferenceExecutorOptions = {},
): ReferenceRunResult {
  const content = options.content ?? referenceContent();
  const interval = options.censusIntervalTicks ?? CENSUS_INTERVAL_TICKS;

  const { scenario } = referenceScenario(content);
  const strategyId = task.strategies[0];
  if (strategyId === undefined) {
    throw new Error(
      `Run ${String(task.runSeed)} was assigned no strategy. Every episode has at least one agent ` +
        'slot, even when the strategy in it is the passive control.',
    );
  }

  const recorder = recordingSession(
    adaptAgentSession(createSession({ scenario, agentSlotIndex: 0, strategyId })),
    interval,
  );

  const episode = runEpisode({
    session: recorder.session,
    runSeed: task.runSeed,
    scenarioConfig: configFor(task),
    policies: policiesForRun({
      registry: BOT_POOL_REGISTRY,
      strategies: task.strategies,
      runSeed: task.runSeed,
    }),
    worldTickCap: task.worldTickCap,
  });

  const last = recorder.takeNow();
  const first = recorder.samples[0] ?? last;
  const measurement: RunMeasurement = {
    first,
    last,
    samples: recorder.samples,
    ticksRun: episode.ticksRun,
  };

  return {
    samples: recorder.samples,
    outcome: {
      status: episode.status,
      ticksRun: episode.ticksRun,
      metrics: collectReferenceMetrics(task.metrics, measurement),
      accounting: episode.accounting,
      provenance: referenceProvenance(content),
    },
  };
}

/**
 * Builds the executor a sweep or a reproduction drives.
 *
 * The content set is resolved once and closed over, so a worker pays for the
 * three hundred nodes, the seventy-cell grid and the territory once rather than
 * once per run. Nothing in it is written to; the sweep suite's worker-count
 * invariance test is what holds that claim up.
 */
export function makeReferenceExecutor(options: ReferenceExecutorOptions = {}): RunExecutor {
  const content = options.content ?? referenceContent();
  const resolved: ReferenceExecutorOptions = {
    content,
    ...(options.censusIntervalTicks === undefined
      ? {}
      : { censusIntervalTicks: options.censusIntervalTicks }),
  };
  return (task: RunTask): RunOutcome => executeReferenceRun(task, resolved).outcome;
}
