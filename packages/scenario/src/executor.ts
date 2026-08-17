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
import { ablationMaskFor } from '@mm/coordination';
import type { AblationMask, GodTickReport, WorldStepReport } from '@mm/coordination';
import type {
  AgentSession,
  ArmContribution,
  CensusTracePoint,
  CheckpointSample,
  IllegalActionAccounting,
  JsonValue,
  MechanicAvailability,
  MetricEntries,
  MetricEntry,
  Provenance,
  RaidObservation,
  RunExecutor,
  RunOutcome,
  RunTask,
  RunTelemetry,
  TerminalStatus,
} from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  BOT_POOL_REGISTRY,
  SNOWBALL_CHECKPOINT_TICKS,
  adaptAgentSession,
  canonicalHash,
  collectRunMetrics,
  metricDefinitionVersions,
  policiesForRun,
  runEpisode,
} from '@mm/mc-harness';

import type { ActionEconomyReport } from '@mm/rules-raid';

import type { CensusSample } from './census.js';
import { censusOf } from './census.js';
import type { RunMeasurement } from './measures.js';
import { REFERENCE_METRIC_VERSIONS, collectReferenceMetrics } from './measures.js';
import type { RaidRecord } from './raids.js';
import type { SandboxSpec } from './sandbox.js';
import { sandboxProvenance } from './sandbox.js';
import type { ReferenceContent } from './reference-universe.js';
import {
  AXIS_PRICE_FACTOR_ID,
  TRADITION_FACTOR_ID,
  referenceContent,
  referenceScenario,
} from './reference-universe.js';

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

/**
 * What this build implements, as the §7 collectors need to be told.
 *
 * Checked against the tree rather than copied from a milestone plan:
 * `worldDeps` supplies `deps.god`, so `coordination`'s worship and favor systems
 * run every world tick and both `worship` and `prestigeCarryForward` are real.
 *
 * **`raidEngagement` is this commit's flip, and it is honestly true.** `raids.ts`
 * installs a system that opens portals — from the god's action 14 against a
 * caller-supplied target list, and from an arrival process for inbound raids —
 * drives `rules-raid`'s engine to termination, and writes the consequences back
 * into world state through `applyRaidOutcome`. Mages die permanently, libraries
 * burn, knowledge is stolen, and nodes leave the universe. The four
 * raid-dependent metrics of §7 therefore stop reporting `mechanic-absent`; a run
 * that happened to initiate none now reports `no-observations` instead, which is
 * the distinction the flag exists to keep.
 *
 * A scenario built with `raids: false` is a different build and says so — see
 * {@link executeReferenceRun}, which reports the flag off in that case.
 */
const REFERENCE_MECHANICS: MechanicAvailability = Object.freeze({
  worship: true,
  raidEngagement: true,
  prestigeCarryForward: true,
});

/** The same declaration, for a scenario built with raids switched off. */
const RAIDLESS_MECHANICS: MechanicAvailability = Object.freeze({
  ...REFERENCE_MECHANICS,
  raidEngagement: false,
});

/** A session that keeps a census every {@link CENSUS_INTERVAL_TICKS} ticks. */
interface CensusRecorder<TConfig> {
  readonly session: AgentSession<TConfig>;
  /** Readings so far, ascending by world tick. */
  readonly samples: readonly CensusSample[];
  /** The snowball checkpoints this run reached, ascending by world tick. */
  readonly checkpoints: readonly CheckpointSample[];
  /**
   * This run's census readings at {@link CENSUS_TRACE_TICKS}, ascending.
   *
   * A trajectory rather than an ending. The terminal reading answers *"where did
   * this universe finish"*; it cannot distinguish *"the effect was real and the
   * ceiling absorbed it"* from *"the effect was never there"*, and this campaign
   * has needed that distinction repeatedly.
   */
  readonly trace: readonly CensusTracePoint[];
  /**
   * Cumulative favor the god **spent**, by §4.2 action id.
   *
   * Read off the favor ledger, which `coordination` deliberately does not store
   * in world state — *"a projection inside a snapshot is inside every hash, at
   * which point two peers can desync over a number no rule reads."* That
   * prohibition is why the accumulation is here, in the measurement layer, and
   * not a component. Nothing in the rules path reads this and nothing can.
   *
   * Applied spend only: the resolver folds a cost in *after* the deduction
   * succeeds, so a refused or unaffordable action contributes nothing.
   */
  readonly godSpendByAction: Readonly<Record<string, number>>;
  /** Takes a reading now, whatever the interval says. */
  takeNow(): CensusSample;
  /**
   * World ticks whose material ledger did not balance. **Always zero.**
   *
   * A function rather than a field because it is a running count and a frozen
   * number read at the wrong moment would report the wrong run — the same reason
   * `samples` is drained after the episode rather than during it.
   */
  conservationBreachTicks(): number;
}

/**
 * The world ticks a census trace point is kept at.
 *
 * All multiples of {@link CENSUS_INTERVAL_TICKS}, so each is a reading the
 * recorder already takes rather than an interpolation between two. 600 is
 * `ascension-min-tick` — the last tick every run is guaranteed to reach,
 * whatever it does afterwards — which is what makes it the honest common
 * comparison point between two arms that terminate at different times.
 */
export const CENSUS_TRACE_TICKS: readonly number[] = Object.freeze([
  144, 300, 600, 900, 1200, 1800, 2400,
]);

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
  godReport: () => GodTickReport | undefined,
  worldReport: () => WorldStepReport | undefined,
): CensusRecorder<TConfig> {
  const samples: CensusSample[] = [];
  const checkpoints: CheckpointSample[] = [];
  const checkpointTicks = new Set(SNOWBALL_CHECKPOINT_TICKS);
  const checkpointsTaken = new Set<number>();
  const trace: CensusTracePoint[] = [];
  const traceTicks = new Set(CENSUS_TRACE_TICKS);
  const traceTaken = new Set<number>();
  const godSpendByAction: Record<string, number> = {};
  let lastLedgerTick = -1;
  let lastRecordedTick = -1;
  let lastConservationTick = -1;
  let breachTicks = 0;

  /**
   * Counts a tick whose material ledger did not balance.
   *
   * Deduplicated on the world report's own tick, for the reason
   * {@link accumulateSpend} is: the report lags the observation by one tick and
   * `observe()` may be called more than once per tick when a run has several
   * agent slots. Keying on the quantity's own timestamp makes both correct.
   *
   * This can only ever count on a build whose in-`step` assertion has been
   * disabled — the loop throws on a breach — and that is the point: the series
   * is evidence the check ran, where a silent assertion is evidence of nothing.
   */
  const accumulateConservation = (): void => {
    const report = worldReport();
    if (report === undefined || report.worldTick <= lastConservationTick) return;
    lastConservationTick = report.worldTick;
    if (report.conservationBreaches.length > 0) breachTicks += 1;
  };

  /**
   * Folds one completed tick's applied spend into the run total.
   *
   * Deduplicated on the ledger's own world tick rather than on the observation's
   * because the report lags the observation by one tick — the same lag
   * {@link checkpoint} documents — and because `observe()` may be called more
   * than once within a tick when an episode runs more than one agent slot.
   * Keying on the quantity's own timestamp makes both cases correct without the
   * caller having to know about either.
   */
  const accumulateSpend = (): void => {
    const report = godReport();
    if (report === undefined || report.ledger.worldTick <= lastLedgerTick) return;
    lastLedgerTick = report.ledger.worldTick;
    for (const [actionId, amount] of Object.entries(report.ledger.spentByAction)) {
      godSpendByAction[actionId] = (godSpendByAction[actionId] ?? 0) + amount;
    }
  };

  /** Keeps this reading if it lands on a pinned trace tick, once. */
  const traceOf = (sample: CensusSample): void => {
    if (!traceTicks.has(sample.worldTick) || traceTaken.has(sample.worldTick)) return;
    traceTaken.add(sample.worldTick);
    trace.push({
      worldTick: sample.worldTick,
      nodesKnown: sample.nodesKnown,
      knowledgeInstances: sample.knowledgeInstances,
      libraryDepth: sample.libraryDepth,
      livingMages: sample.livingMages,
      population: sample.population,
      grimoires: sample.grimoires,
    });
  };

  const record = (sample: CensusSample): CensusSample => {
    if (sample.worldTick !== lastRecordedTick) {
      lastRecordedTick = sample.worldTick;
      samples.push(sample);
    }
    return sample;
  };

  /**
   * Takes a snowball checkpoint, once, at each pinned tick this run reaches.
   *
   * `favorRegenPerTick` is the **last completed world tick's** regeneration, off
   * the god's favor ledger. There is a one-tick lag in that and it is stated
   * rather than corrected: the report is written at the end of a tick and the
   * observation is taken at the start of the next, so the alternative would be
   * to sample the rate before the tick that produced it had run. Regeneration is
   * a smooth function of worship, which is a first-order lag on its own target,
   * so one tick of lag is far below the resolution of a Gini coefficient over
   * two hundred universes.
   *
   * `null` before the first god report — at world tick 0 no tick has completed —
   * and `null` is not 0. The collector counts it as an exclusion and says so.
   */
  const checkpoint = (sample: CensusSample): void => {
    if (!checkpointTicks.has(sample.worldTick) || checkpointsTaken.has(sample.worldTick)) return;
    checkpointsTaken.add(sample.worldTick);
    const report = godReport();
    checkpoints.push({
      worldTick: sample.worldTick,
      favorRegenPerTick: report === undefined ? null : report.ledger.regenerated,
      libraryNodeCount: sample.libraryDepth,
      ...(report === undefined
        ? {}
        : {
            worshipByClass: {
              mages: report.worshipByClass.mages,
              universities: report.worshipByClass.universities,
              populace: report.worshipByClass.populace,
            },
          }),
    });
  };

  const takeNow = (): CensusSample => {
    const sample = record(censusOf(inner.observe()));
    checkpoint(sample);
    traceOf(sample);
    accumulateSpend();
    accumulateConservation();
    return sample;
  };

  return {
    samples,
    checkpoints,
    trace,
    godSpendByAction,
    takeNow,
    conservationBreachTicks: () => breachTicks,
    session: {
      reset(runSeed: number, scenarioConfig: TConfig): void {
        inner.reset(runSeed, scenarioConfig);
        samples.length = 0;
        checkpoints.length = 0;
        checkpointsTaken.clear();
        trace.length = 0;
        traceTaken.clear();
        for (const key of Object.keys(godSpendByAction)) delete godSpendByAction[key];
        lastLedgerTick = -1;
        lastRecordedTick = -1;
        lastConservationTick = -1;
        breachTicks = 0;
        takeNow();
      },
      observe(): Float64Array {
        const observation = inner.observe();
        const sample = censusOf(observation);
        if (sample.worldTick % intervalTicks === 0) record(sample);
        checkpoint(sample);
        traceOf(sample);
        accumulateSpend();
        accumulateConservation();
        return observation;
      },
      legalActions: () => inner.legalActions(),
      candidates: () => inner.candidates(),
      submit: (actionId: number, parameter?: number) => {
        inner.submit(actionId, parameter);
      },
      status: (): TerminalStatus => inner.status(),
      terminalReason: (): number => inner.terminalReason(),
      accounting: (): IllegalActionAccounting => inner.accounting(),
    },
  };
}

/**
 * Every metric this executor can put in a record, at the version it collects.
 *
 * Both registries, because this executor now collects from both: the vital
 * signs of `measures.ts` and `contracts.md` §7's registry. A record whose
 * provenance omitted a metric it carries would leave a reader with a number and
 * no way to know which definition produced it — and the gate compares a
 * baseline's per-metric `definitionVersion` against the sweep's, which it can
 * only do for versions that were written down.
 *
 * Both scopes of §7 are listed, not only the per-run half. The five arm-scoped
 * metrics are computed by `runner.ts` out of this executor's `armContribution`
 * and land in the sweep **summary**; they are as much this build's output as the
 * per-run ones, and a summary whose arm metrics had no declared versions is the
 * same gap one level up.
 *
 * `metricDefinitionVersions` is not one of the provenance keys the gate compares
 * as a block, so widening this map does not invalidate a committed baseline —
 * the per-metric comparison only ever runs against metrics the baseline records.
 */
const COLLECTED_METRIC_VERSIONS: Readonly<Record<string, number>> = Object.freeze({
  ...REFERENCE_METRIC_VERSIONS,
  ...metricDefinitionVersions(),
});

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
    metricDefinitionVersions: COLLECTED_METRIC_VERSIONS,
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
  /**
   * The sandbox cheat sheet, or absent — which is the default and the only
   * setting anything shipped uses.
   *
   * It is here at all so the refusal one level up has a **positive control**.
   * `provenanceProblems` rejecting a cheated record is worth nothing unless a
   * cheated record can actually be produced by the ordinary executor and seen
   * to be rejected; a gate that has never fired is not known to work, and this
   * repository has found five checkers that answered about the wrong input. So
   * this path exists precisely to be refused, and `sandbox.test.ts` runs it end
   * to end.
   */
  readonly sandbox?: SandboxSpec;
  /** Ticks between census readings. Defaults to {@link CENSUS_INTERVAL_TICKS}. */
  readonly censusIntervalTicks?: number;
  /**
   * Whether portals open and raids resolve. Defaults to `true`.
   *
   * The A/B switch. `false` reproduces the pre-raid build exactly — no portal
   * targets, so action 14 stays masked; no arrival roll, so no stream is
   * touched — and the run then declares `raidEngagement: false` rather than
   * reporting an empty raid list on a build that has the mechanic.
   */
  readonly raids?: boolean;
}

/**
 * Content resolved per **(tradition, axis price)**, memoized for the life of the
 * process.
 *
 * Neither of those can ride in {@link ReferenceExecutorOptions.content} the way
 * everything else does, because both are chosen by a *sweep level* and the
 * content is resolved before any task is seen. Memoizing keeps the promise
 * `makeReferenceExecutor` makes — that a worker pays for the three hundred
 * nodes, the seventy-cell grid and the territory once rather than once per run —
 * while letting a worker serve more than one tradition. Nothing in a
 * `ReferenceContent` is written to, so sharing one across runs is the same claim
 * the executor already makes.
 *
 * **The key is a pair and must stay one.** A worker serves whichever tasks the
 * pool deals it, and a sweep crossing two prices deals both to the same worker.
 * Keyed on the tradition alone, the second price would be served the first
 * price's content: every run would complete, every number would be plausible,
 * and the record would name a price the simulation never charged. That is
 * `CLAUDE.md`'s *"a checker that answers about the wrong input"* with a whole
 * sweep behind it, so `contentCacheKey` is written once and used on every path.
 */
const CONTENT_BY_LEVELS = new Map<string, ReferenceContent>();

/** The memo key. ` ` because no content id and no `fp` integer contains it. */
function contentCacheKey(tradition: string | undefined, axisPriceScale: number): string {
  return `${tradition ?? ''} ${String(axisPriceScale)}`;
}

/**
 * The tradition level a task names, validated.
 *
 * Refuses a non-string for the reason `referenceOptions` refuses a mistyped
 * count: a level the scenario cannot read would run the default and be recorded
 * as the level that was asked for.
 */
function traditionOf(task: RunTask): string | undefined {
  const level = task.levels[TRADITION_FACTOR_ID];
  if (level === undefined) return undefined;
  if (typeof level !== 'string') {
    throw new Error(
      `Factor ${TRADITION_FACTOR_ID} has level ${JSON.stringify(level)}, which is not a string. ` +
        "A tradition is named by its `tradition.json` id — 'vancian-memorization', " +
        "'true-naming', 'art-of-memory' — never by its interned number, which is assigned by " +
        'sorting the ids and would move the day a tradition is added.',
    );
  }
  return level;
}

/**
 * The axis-price level a task names, validated.
 *
 * `0` — the value an absent factor resolves to — is the shipped price, so a
 * sweep that never heard of this factor gets the content it always got. Refuses
 * a non-integer for {@link traditionOf}'s reason.
 */
function axisPriceOf(task: RunTask): number {
  const level = task.levels[AXIS_PRICE_FACTOR_ID];
  if (level === undefined) return 0;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0) {
    throw new Error(
      `Factor ${AXIS_PRICE_FACTOR_ID} has level ${JSON.stringify(level)}, which is not a ` +
        'non-negative integer. It is an fp multiplier on the four §4.2 axis prices at 1/1024: ' +
        '1024 is the shipped price and 0 means the same thing.',
    );
  }
  return level;
}

/**
 * The content one task runs against: the explicitly supplied set unless the task
 * names a tradition or an axis price, in which case the levels win.
 *
 * The precedence matters. `makeReferenceExecutor` pre-resolves content and hands
 * it to every run, so a sweep declaring a `tradition` factor against a
 * pre-resolved executor would otherwise have its levels silently ignored and
 * every arm would measure the default tradition. `axisPriceScale` is on the same
 * path for the same reason, and *both* levels are consulted before the
 * pre-resolved set is taken — a task naming a price and no tradition used to
 * fall through the first line and would have measured the shipped price.
 */
function contentForTask(task: RunTask, options: ReferenceExecutorOptions): ReferenceContent {
  const named = traditionOf(task);
  const axisPriceScale = axisPriceOf(task);
  if (named === undefined && axisPriceScale === 0) return options.content ?? referenceContent();
  const key = contentCacheKey(named, axisPriceScale);
  const memoized = CONTENT_BY_LEVELS.get(key);
  if (memoized !== undefined) return memoized;
  const resolved = referenceContent(options.content?.registry, named, axisPriceScale);
  CONTENT_BY_LEVELS.set(key, resolved);
  return resolved;
}

/** One completed run, before it becomes a record. */
export interface ReferenceRunResult {
  readonly outcome: RunOutcome;
  /** Every census reading, ascending by world tick. Reporting only. */
  readonly samples: readonly CensusSample[];
  /**
   * Every raid the run resolved, in the shape §7's three run-scoped raid
   * collectors read.
   *
   * `undefined` — never `[]` — when this build has no raid mechanic, because
   * `collectRaidLengthDistribution` distinguishes *"raids do not exist"* from
   * *"raids exist and this run had none"* on exactly that difference.
   */
  readonly raids: readonly RaidObservation[] | undefined;
  /**
   * The same raids, unreduced.
   *
   * §7's three run-scoped raid collectors read {@link RaidObservation} and no
   * more, but that shape drops the two numbers this change is most often asked
   * about — which side of the portal this universe was on, and what crossed it.
   * Reporting only, never a metric input: a caller that wanted to invent a
   * thirteenth §7 metric out of these would be inventing a metric.
   */
  readonly rawRaids: readonly RaidRecord[];
  /** What this run declares it implements. Feeds every §7 availability check. */
  readonly mechanics: MechanicAvailability;
  /**
   * Everything §7's seven per-run collectors read, as they read it.
   *
   * Exported beside the outcome so a test can assert what a metric was computed
   * *from* rather than only what it came to. The outcome carries the declared
   * metrics and nothing more, because that is what a record is made of.
   */
  readonly telemetry: RunTelemetry;
}

/**
 * Collects the metrics a task declared, from whichever registry defines each.
 *
 * The reference scenario now answers to two registries, and the split is by id
 * rather than by guess: `measures.ts` owns everything prefixed `reference`, and
 * `contracts.md` §7 owns the twelve in `BALANCE_METRIC_REGISTRY`. The prefix was
 * chosen for exactly this moment — *"a metric registry whose ids collide with
 * §7's would let a sweep declare `nodesKnown` and be validated against a
 * definition nobody wrote"*.
 *
 * `collectRunMetrics` is called once and its entries selected from, rather than
 * per requested id. That is not an optimization: the function's first documented
 * property is that *"every registered metric gets an entry"*, and calling it per
 * id would quietly reduce it to a per-metric collector and lose the guarantee
 * that a dead collector fails the run instead of writing a missing key.
 *
 * @throws Error naming a metric neither registry defines. The sweep validator
 * rejects that before dispatch, so reaching here means a hand-built task.
 */
export function collectDeclaredMetrics(
  requested: readonly string[],
  measurement: RunMeasurement,
  telemetry: RunTelemetry,
): MetricEntries {
  const referenceIds = requested.filter((metricId) => !BALANCE_METRIC_REGISTRY.has(metricId));
  const entries: Record<string, MetricEntry> = {
    ...collectReferenceMetrics(referenceIds, measurement),
  };
  if (referenceIds.length === requested.length) return entries;

  const balance = collectRunMetrics(telemetry);
  for (const metricId of requested) {
    if (!BALANCE_METRIC_REGISTRY.has(metricId)) continue;
    entries[metricId] = balance[metricId] as MetricEntry;
  }
  return entries;
}

/**
 * The ablation mask a task asks for, or `undefined` on the control arm.
 *
 * **This function is the fix for a seam that was open from the day task group 7
 * landed.** `RunTask.ablatedPrimitives` has been set by `tasks.ts` and carried
 * across the worker boundary since then, and nothing on this side of the
 * boundary ever read it. A sweep declaring `ablation.mode: "one-sided"`
 * therefore ran its arm against an unmasked universe: instrumenting
 * `stackMagnitudes` over a 300-tick reference run showed **0 of 70,462** stacked
 * magnitudes seeing a mask, and the declared arm's `RunOutcome` was byte-identical
 * to the control's. That is precisely the condition `winRateByPrimitive`'s own
 * `disprovedBy` names — *"a control arm and an ablation arm producing
 * byte-identical run records"* — and it is the same failure shape as `raids`
 * being *"declared on the options type and silently dropped"* in
 * {@link makeReferenceExecutor}, three paragraphs down this file.
 *
 * Empty returns `undefined` rather than `NO_ABLATION`, so a control run leaves
 * `WorldStepDeps.ablation` unset and takes the identical branch it always took.
 * See `ReferenceScenarioOptions.ablation` for why that distinction is worth a
 * line of code on a path with committed baselines on it.
 *
 * `ablationMaskFor` rather than `neutralizing(ids[0])`, so a task naming two
 * primitives is refused by name here instead of quietly ablating the first and
 * being recorded under both.
 */
function ablationFor(task: RunTask): AblationMask | undefined {
  if (task.ablatedPrimitives.length === 0) return undefined;
  return ablationMaskFor(task.ablatedPrimitives);
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
  // The tradition is a *content* fact, so it is resolved before the scenario is
  // built rather than read out of the options inside it, and it is memoized for
  // the reason `referenceContent` is resolved once per process: a worker runs
  // thousands of episodes and re-resolving the node graph for each is the
  // dominant cost of a sweep. See `TRADITION_FACTOR_ID`.
  const content = contentForTask(task, options);
  const interval = options.censusIntervalTicks ?? CENSUS_INTERVAL_TICKS;

  const raiding = options.raids ?? true;
  const ablation = ablationFor(task);
  const { scenario, lastGodReport, lastReport, raids, balanceTelemetry, sandbox } =
    referenceScenario(content, {
    raids: raiding,
    ...(ablation === undefined ? {} : { ablation }),
    ...(options.sandbox === undefined ? {} : { sandbox: options.sandbox }),
  });
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
    lastGodReport,
    lastReport,
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
    // Counted from the world loop's own per-tick report rather than recomputed
    // here. The loop already asserts conservation inside `step`, so a non-zero
    // figure means the assertion was disabled rather than that it was missed —
    // and the metric exists so that a passing sweep is *evidence* the check ran,
    // which a silent assertion cannot be.
    conservationBreachTicks: recorder.conservationBreachTicks(),
  };

  const mechanics = raiding ? REFERENCE_MECHANICS : RAIDLESS_MECHANICS;
  const raidObservations = raiding
    ? raids().map((record) => raidObservationOf(record, lastGodReport()))
    : undefined;

  // After the episode, deliberately: `balanceTelemetry()` takes the terminal
  // census sample, which is the one a system inside `step` cannot reach.
  const balance = balanceTelemetry();
  const runTelemetry: RunTelemetry = {
    coordinates: task.coordinates,
    status: episode.status,
    ticksRun: episode.ticksRun,
    mechanics,
    census: balance.census,
    speciesIds: balance.speciesIds,
    tierFirstReached: balance.tierFirstReached,
    checkpoints: recorder.checkpoints,
    raids: raidObservations,
    accounting: episode.accounting,
  };

  return {
    samples: recorder.samples,
    mechanics,
    raids: raidObservations,
    rawRaids: raiding ? [...raids()] : [],
    telemetry: runTelemetry,
    outcome: {
      status: episode.status,
      // §1.1's ending, carried through rather than re-derived from the status.
      // `status` cannot hold it: `agent-api`'s session folds apotheosis and
      // canon into one `'ascended'`, so a record built from the status alone
      // could not say which summit a universe took.
      terminalReason: episode.terminalReason,
      ticksRun: episode.ticksRun,
      metrics: collectDeclaredMetrics(task.metrics, measurement, runTelemetry),
      accounting: episode.accounting,
      // Stamped here rather than by the caller, so that a cheated run cannot be
      // recorded honestly by somebody forgetting a step. The stamp is what
      // `provenanceProblems` refuses on.
      provenance:
        sandbox === undefined
          ? referenceProvenance(content)
          : sandboxProvenance(referenceProvenance(content), sandbox.digest),
      armContribution: armContributionOf(recorder.checkpoints, content, mechanics),
      godSpendByAction: { ...recorder.godSpendByAction },
      censusTrace: [...recorder.trace],
    },
  };
}

/**
 * One raid, in the shape §7's collectors read.
 *
 * Two of the three fields are direct measurements and the third is a
 * derivation, and the difference is stated because a reader of
 * `raidInitiationCost` would otherwise take it for a measurement too.
 *
 * - `defenderFrozenWorldTicks` is **zero, measured**. `portals`' own spec says a
 *   raid *"SHALL consume zero world ticks"* and *"both universes resume at the
 *   world tick recorded at portal open"*, and this build honours that exactly:
 *   the whole engagement runs inside one world tick. Vision §8's tempo cost is
 *   relative to *uninvolved* universes — the third party who researches while
 *   you fight — and `contracts.md` §1.1 puts one universe in a simulation
 *   instance, so there is no third party here for it to be relative to. The
 *   griefing guard cannot bite in a single-universe Monte Carlo, and reporting
 *   a fabricated non-zero would be worse than reporting the zero.
 * - `attackerTempoCostWorldTicks` is **derived**: the favor an attacker paid for
 *   action 14, divided by the favor its universe regenerates in a world tick.
 *   That is the world time the raid actually cost — the ticks the god must wait
 *   before it can afford its next intervention — expressed in the unit §7 asks
 *   for, and it uses no constant this change invented. It floors at zero when
 *   regeneration is zero, which is the opening position of every run: a universe
 *   that regenerates nothing cannot have forgone any, and dividing by it would
 *   be an infinity in a metric.
 */
function raidObservationOf(record: RaidRecord, god: GodTickReport | undefined): RaidObservation {
  const regenerated = god?.ledger.regenerated ?? 0;
  return {
    raidId: record.raidId,
    raidSeed: record.raidSeed,
    engagementTicks: record.engagementTicks,
    initialPortalStabilityTicks: record.initialPortalStabilityTicks,
    defenderFrozenWorldTicks: 0,
    attackerTempoCostWorldTicks:
      regenerated <= 0 ? 0 : Math.floor(record.attackerFavorCost / regenerated),

    raidersFielded: record.raidersFielded,
    raidersWithdrawn: record.raidersWithdrawn,
    raidersStranded: record.raidersStranded,
    nodesTakenByAttacker: record.nodesTakenByAttacker,
    directivesApplied: record.directivesApplied,
    directiveFavorSpent: record.directiveFavorSpent,
    victor: record.victor,
    reason: record.reason,

    // The action-economy fields, now measured rather than declared absent.
    //
    // They used to read `combatSources: []`, a zero denominator, and
    // `['removal', 'save', 'decoy', 'displacement']` — three of those four
    // channels named as unimplemented *in this executor* while `rules-raid`
    // implemented all three. That was honest at the time and it was expensive:
    // it made `combatActionEconomy` and `combatThresholdEfficiency` two of the
    // six §7 metrics with no committed measurement, and it made every sweep arm
    // ablating a combat primitive report a null for a live wire.
    //
    // Only `displacement` is genuinely absent, and the list is no longer
    // written here — it is `rules-raid`'s own `UNIMPLEMENTED_CHANNELS`, carried
    // through the record, so the declaration and the engine cannot drift apart.
    ...combatObservationOf(record.actionEconomy),
  };
}

/**
 * `ActionEconomyReport` in the shape §7's two combat collectors read.
 *
 * A regrouping and nothing else. Every number here is a sum of numbers
 * `rules-raid` computed: the per-side pairs are added, because the metric pools
 * both sides and a raid-relative pair has no meaning to a collector that does
 * not know which side this universe was on. **No division happens here** —
 * `combatActionEconomy`'s scalar is a rate and its denominator is a pinned
 * constant of the metric, so normalising on this side of the boundary would put
 * the arithmetic somewhere other than the definition that names it.
 *
 * The three tables are keyed independently by `rules-raid` — a source can have
 * attempts and no denial, or denial credited by a removal it did not attempt
 * this raid — so the row set is their union, ascending, and a source missing
 * from one table contributes zero rather than dropping the row.
 */
function combatObservationOf(
  report: ActionEconomyReport,
): Pick<
  RaidObservation,
  | 'combatSources'
  | 'totalCombatantTicks'
  | 'worldScaleRemovals'
  | 'summonsRemoved'
  | 'unimplementedCombatChannels'
> {
  const denied = new Map(report.deniedTicks);
  const hp = new Map(report.hpRemoved);
  const attempts = new Map(report.attempts);
  const sources = [...new Set([...denied.keys(), ...hp.keys(), ...attempts.keys()])].sort();

  return {
    combatSources: sources.map((source) => {
      const deniedPair = denied.get(source) ?? [0, 0];
      const hpPair = hp.get(source) ?? [0, 0];
      const counts = attempts.get(source) ?? { removing: 0, hurting: 0, spent: 0 };
      return {
        source,
        deniedCombatantTicks: deniedPair[0] + deniedPair[1],
        hitPointsRemoved: hpPair[0] + hpPair[1],
        removingAttempts: counts.removing,
        hurtingAttempts: counts.hurting,
        spentAttempts: counts.spent,
      };
    }),
    totalCombatantTicks: report.totalCombatantTicks,
    worldScaleRemovals: report.removals[0] + report.removals[1],
    summonsRemoved: report.summonsRemoved[0] + report.summonsRemoved[1],
    unimplementedCombatChannels: report.unimplementedChannels,
  };
}

/**
 * What this run contributes to the five `per-arm` metrics of `contracts.md` §7.
 *
 * The piece the harness declared and nothing built: `ArmTelemetry` existed with
 * five collectors reading it and no code anywhere constructed one, so every
 * arm-scoped metric was defined and never measured. This is the executor half —
 * `aggregate.ts`'s `buildArmTelemetry` folds these into the arm.
 *
 * `prestigeCarryForwardMax` is `PRESTIGE_CAP`, read out of loaded content rather
 * than chosen here. That number is not a knob: `god-agency`'s content check
 * asserts `PRESTIGE_CAP × (fp(1024) − PRESTIGE_RETENTION) == PRESTIGE_EARN_MAX ×
 * fp(1024)`, which makes it the analytic limit of the carry-forward recurrence
 * at its earning ceiling — the level an infinite streak of perfect runs
 * approaches and never exceeds. That is exactly *"the maximum permitted prestige
 * carry-forward"* `prestigeAdvantage` asks for, and it is why the collector can
 * stop reporting `mechanic-absent` without anybody inventing a magnitude.
 *
 * No `mirroredPlay` and no `ablationPlay` are reported, and neither is an
 * oversight. A `prestigeAdvantage` play needs a winner between two universes and
 * this build has no way to declare one — `god-agency`'s provisional
 * terminal-score ordering (its task 5.7) is not implemented and raids do not
 * exist. So the collector sees a mechanic that exists and an arm with no pairs,
 * and reports `no-observations`. That is a different and more useful sentence
 * than `mechanic-absent`, and it is the true one.
 */
function armContributionOf(
  checkpoints: readonly CheckpointSample[],
  content: ReferenceContent,
  mechanics: MechanicAvailability,
): ArmContribution {
  return {
    mechanics,
    checkpoints,
    prestigeCarryForwardMax: content.prestigeCap,
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
  // A caller's explicit content set is honoured and pins the tradition with it;
  // an *absent* one is resolved per run, because `tradition` is a sweep factor
  // and a content set closed over here would silently answer every level of it
  // with the same tradition. The resolve-once property the note above claims is
  // kept by `contentForTask`'s process-level cache — three entries at most, one
  // per shipped tradition, rather than one per run.
  const resolved: ReferenceExecutorOptions = {
    ...(options.content === undefined ? {} : { content: options.content }),
    ...(options.censusIntervalTicks === undefined
      ? {}
      : { censusIntervalTicks: options.censusIntervalTicks }),
    // `raids` was declared on the options type and silently dropped here, so
    // every caller that passed it got the default and every raid measurement
    // taken through this factory was taken on one arm. A metric-reachability
    // probe found it: with the switch actually forwarded, raids move four of
    // thirteen metrics — they were never inert, only unreachable through the
    // factory the whole pipeline uses.
    ...(options.raids === undefined ? {} : { raids: options.raids }),
  };
  return (task: RunTask): RunOutcome => executeReferenceRun(task, resolved).outcome;
}
