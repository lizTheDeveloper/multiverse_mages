/*
 * Multiverse Mages — the balance metric registry: every metric in contracts.md
 * §7, with its definition, collector, scope, aggregation, unit and version.
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
 * Task 6.1, and the table `contracts.md` §7 points at when it says *"the precise
 * definitions live in the `agent-interface` capability specs, under an explicit
 * `definitionVersion`, not here"*.
 *
 * ## Why the definition is a string in the registry and not only in a document
 *
 * A metric's prose definition travelling with its collector is what makes a run
 * record self-describing. §7's warning is that *"a metric whose definition
 * drifts silently makes every committed baseline meaningless while still
 * appearing green"*, and the way that happens in practice is that the code moves
 * and the document does not. Keeping the normative sentence beside the function
 * does not prevent drift by itself — nothing can — but it puts the two things
 * that must agree on adjacent lines of the same diff.
 *
 * ## `pinnedConstants` is the load-bearing field
 *
 * §7 defines each metric in one line, which leaves free parameters this change
 * had to invent: the census interval, the Gini checkpoints, the histogram bin
 * width, the censoring rules, the percentile convention. `design.md` is blunt
 * about the risk — *"inventing them silently would be the worst outcome — a
 * later change would re-invent them differently and the baselines would compare
 * two different quantities under one name"*.
 *
 * So every invented constant is declared here, per metric, and
 * `metrics-conformance.ts` digests them. Changing one without bumping
 * `definitionVersion` fails a check that names the metric (task 6.13).
 */

import type { MetricDefinition, MetricEntries, MetricEntry, MetricRegistry, MetricScope } from './metrics.js';
import { METRIC_SCOPE, UNAVAILABLE_REASON } from './metrics.js';
import type { JsonValue } from './canonical.js';
import { KNOWLEDGE_CENSUS_INTERVAL_TICKS } from './metrics-census.js';
import {
  HALF_LIFE_QUANTILE,
  HEAVY_CENSORING_FRACTION,
  MetricCollectionError,
  NOOP_ACTION_ID,
  RAID_LENGTH_BIN_WIDTH_TICKS,
  SNOWBALL_CHECKPOINT_TICKS,
  TIER_MAX,
  TIER_MIN,
  TIER_PAIR_COUNT,
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
} from './metrics-collectors.js';
import type { ArmTelemetry, RunTelemetry } from './metrics-telemetry.js';

/** The full registry entry for one §7 metric. */
export interface BalanceMetricDefinition extends MetricDefinition {
  /** The normative definition, in the terms `contracts.md` §7 uses. */
  readonly definition: string;
  /** Whether the metric has a per-run value at all. */
  readonly scope: MetricScope;
  /** Present on every `per-run` metric. */
  readonly collectRun?: (telemetry: RunTelemetry) => MetricEntry;
  /** Present on every `per-arm` metric. */
  readonly collectArm?: (arm: ArmTelemetry) => MetricEntry;
  /**
   * Every free parameter this change pinned for the metric.
   *
   * Digested into `definitionVersion`'s conformance check. A constant that is
   * not here is a constant nobody is guarding.
   */
  readonly pinnedConstants: Readonly<Record<string, JsonValue>>;
  /** The capability that owns the *threshold*, per §7's ownership split. */
  readonly thresholdOwner: string;
}

/** {@link MetricRegistry}, plus access to the full definitions. */
export interface BalanceMetricRegistry extends MetricRegistry {
  readonly definitions: readonly BalanceMetricDefinition[];
  balance(id: string): BalanceMetricDefinition | undefined;
}

/**
 * The twelve metrics of `contracts.md` §7.
 *
 * Ordered as §7 tabulates them, so a reader can hold the two side by side. The
 * registry sorts ids for every canonical purpose; this array is for humans.
 */
const DEFINITIONS: readonly BalanceMetricDefinition[] = Object.freeze([
  {
    id: 'winRateByPrimitive',
    definition:
      'Raid win rate of the arm retaining primitive p against the arm in which p is neutralized, ' +
      'over mirrored pairs sharing derived run seeds with the sides swapped. 0.5 means no ' +
      'measured contribution.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectWinRateByPrimitive,
    aggregation: 'mean',
    unit: 'win rate (fraction of mirrored plays)',
    definitionVersion: 1,
    pinnedConstants: { mirrored: true, pairwiseAblation: false },
    thresholdOwner: 'raid-engagement',
  },
  {
    id: 'timeToTierBySpecies',
    definition:
      'First world tick at which any living mage of a species holds a knowledge instance, at ' +
      'location kind mind, of a node whose tier equals the given tier; over all 42 (species, tier) ' +
      'pairs, right-censored at run termination. The per-run scalar is the median over reached ' +
      'pairs, censored pairs excluded.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectTimeToTierBySpecies,
    aggregation: 'mean',
    unit: 'world ticks',
    definitionVersion: 1,
    pinnedConstants: {
      tierMin: TIER_MIN,
      tierMax: TIER_MAX,
      pairCount: TIER_PAIR_COUNT,
      percentileRule: 'nearest-rank',
      heavyCensoringFraction: HEAVY_CENSORING_FRACTION,
      locationKind: 'mind',
    },
    thresholdOwner: 'mages-and-species',
  },
  {
    id: 'knowledgeHalfLife',
    definition:
      'Smallest elapsed world-tick count at which a pooled Kaplan–Meier survival estimate over ' +
      'census cohorts falls to or below 0.5. A cohort is every node existing at a census tick; ' +
      'members are observed to the first later census at which the node has no instances, or ' +
      'right-censored at run termination.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectKnowledgeHalfLife,
    aggregation: 'mean',
    unit: 'world ticks',
    definitionVersion: 1,
    pinnedConstants: {
      censusIntervalTicks: KNOWLEDGE_CENSUS_INTERVAL_TICKS,
      censusStartTick: 0,
      quantile: HALF_LIFE_QUANTILE,
      estimator: 'kaplan-meier',
      censoring: 'right-censored at run termination',
      cohorts: 'pooled',
    },
    thresholdOwner: 'knowledge-model',
  },
  {
    id: 'libraryDependence',
    definition:
      'Fraction of existing nodes with exactly one surviving instance, evaluated at each census ' +
      'tick and reported per run as the mean over census samples, with the maximum and final ' +
      'sample alongside. Censuses finding an empty universe are excluded and counted.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectLibraryDependence,
    aggregation: 'mean',
    unit: 'fraction of existing nodes',
    definitionVersion: 1,
    pinnedConstants: {
      censusIntervalTicks: KNOWLEDGE_CENSUS_INTERVAL_TICKS,
      censusStartTick: 0,
      excludeEmptyUniverseSamples: true,
    },
    thresholdOwner: 'knowledge-model',
  },
  {
    id: 'worshipSnowball',
    definition:
      'Gini coefficient of instantaneous favor regeneration per world tick, across the runs of an ' +
      'arm, at fixed checkpoint world ticks. Runs terminating before a checkpoint are excluded ' +
      'from it and counted.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectWorshipSnowball,
    aggregation: 'mean',
    unit: 'Gini coefficient',
    definitionVersion: 1,
    pinnedConstants: {
      checkpointTicks: [...SNOWBALL_CHECKPOINT_TICKS],
      estimator: 'G = (2·Σ i·x_i) / (n·Σ x_i) − (n+1)/n, ascending, 1-based',
      smallSampleCorrection: false,
      degenerateTotalIsZero: 0,
      quantity: 'instantaneous favor regeneration per world tick',
      scalarCheckpoint: 'last checkpoint with a sample',
    },
    thresholdOwner: 'god-agency',
  },
  {
    id: 'capitalSnowball',
    definition:
      'Gini coefficient of the count of distinct nodes held in instances whose location kind is ' +
      'library, summed across all libraries, across the runs of an arm, at the same fixed ' +
      'checkpoint world ticks as worshipSnowball.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectCapitalSnowball,
    aggregation: 'mean',
    unit: 'Gini coefficient',
    definitionVersion: 1,
    pinnedConstants: {
      checkpointTicks: [...SNOWBALL_CHECKPOINT_TICKS],
      estimator: 'G = (2·Σ i·x_i) / (n·Σ x_i) − (n+1)/n, ascending, 1-based',
      smallSampleCorrection: false,
      degenerateTotalIsZero: 0,
      quantity: 'distinct nodes in library-kind instances',
      scalarCheckpoint: 'last checkpoint with a sample',
    },
    thresholdOwner: 'god-agency',
  },
  {
    id: 'raidLengthDistribution',
    definition:
      'Engagement ticks from raid start to resolution for every raid in a run, as a histogram over ' +
      'fixed 10-tick bins spanning zero to the maximum initial portal stability, plus an overflow ' +
      'bin that must stay empty. The per-run scalar is p50; p95 and the maximum accompany it.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectRaidLengthDistribution,
    aggregation: 'mean',
    unit: 'engagement ticks',
    definitionVersion: 1,
    pinnedConstants: {
      binWidthTicks: RAID_LENGTH_BIN_WIDTH_TICKS,
      overflowBinMustBeEmpty: true,
      percentileRule: 'nearest-rank',
      scalar: 'p50',
    },
    thresholdOwner: 'raid-engagement',
  },
  {
    id: 'ascensionRate',
    definition:
      'Fraction of runs whose terminal status is ascended, over a denominator of all runs whose ' +
      'status is ascended, stagnated, or truncated. Failed runs are excluded from both numerator ' +
      'and denominator and reported separately. Target band 5–20%, reported not enforced.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectAscensionRate,
    aggregation: 'mean',
    unit: 'fraction of runs',
    definitionVersion: 1,
    pinnedConstants: {
      denominatorStatuses: ['ascended', 'stagnated', 'truncated'],
      excludedStatuses: ['failed'],
      targetBandMin: 0.05,
      targetBandMax: 0.2,
    },
    thresholdOwner: 'god-agency',
  },
  {
    id: 'prestigeAdvantage',
    definition:
      'Win rate of a universe seeded with the maximum permitted prestige carry-forward against an ' +
      'otherwise identical universe seeded with zero prestige, over mirrored pairs sharing run ' +
      'seeds with the sides swapped. Must stay under 60%.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectPrestigeAdvantage,
    aggregation: 'mean',
    unit: 'win rate (fraction of mirrored plays)',
    definitionVersion: 1,
    pinnedConstants: {
      mirrored: true,
      carryForwardMax: null,
      thresholdMax: 0.6,
    },
    thresholdOwner: 'god-agency',
  },
  {
    id: 'illegalActionRate',
    definition:
      'Fraction of submitted actions rejected by the legality mask, over a denominator of all ' +
      'submitted actions including no-ops, derived from the counters agent-api exports rather than ' +
      'recounted. Reported per run, per action id, and per strategyId.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectIllegalActionRate,
    aggregation: 'mean',
    unit: 'fraction of submitted actions',
    definitionVersion: 1,
    pinnedConstants: {
      denominatorIncludesNoOps: true,
      noOpActionId: NOOP_ACTION_ID,
      source: 'agent-api accounting()',
      strategyAttribution: 'even split across the run slots',
    },
    thresholdOwner: 'agent-interface',
  },
  {
    id: 'inboundRaidTempoLoss',
    definition:
      'World ticks a universe spends frozen in engagement as the defender, as a fraction of the ' +
      "run's elapsed world ticks. The griefing guard.",
    scope: METRIC_SCOPE.perRun,
    collectRun: collectInboundRaidTempoLoss,
    aggregation: 'mean',
    unit: 'fraction of elapsed world ticks',
    definitionVersion: 1,
    pinnedConstants: { denominator: 'elapsed world ticks of this run' },
    thresholdOwner: 'raid-engagement',
  },
  {
    id: 'raidInitiationCost',
    definition:
      'World ticks of tempo an attacker forgoes per raid, averaged over the raids a run initiated, ' +
      'for comparison against what a raid gains.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectRaidInitiationCost,
    aggregation: 'mean',
    unit: 'world ticks per raid',
    definitionVersion: 1,
    pinnedConstants: { denominator: 'raids initiated' },
    thresholdOwner: 'raid-engagement',
  },
]);

function buildRegistry(definitions: readonly BalanceMetricDefinition[]): BalanceMetricRegistry {
  const byId = new Map<string, BalanceMetricDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new Error(`Duplicate metric id ${definition.id} in the balance registry.`);
    }
    if (definition.scope === METRIC_SCOPE.perRun && definition.collectRun === undefined) {
      throw new Error(`${definition.id} is per-run and has no collectRun.`);
    }
    if (definition.scope === METRIC_SCOPE.perArm && definition.collectArm === undefined) {
      throw new Error(`${definition.id} is per-arm and has no collectArm.`);
    }
    byId.set(definition.id, definition);
  }
  const ids = [...byId.keys()].sort();
  return {
    ids,
    definitions,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    balance: (id) => byId.get(id),
  };
}

/** The registry `contracts.md` §7 is checked against. */
export const BALANCE_METRIC_REGISTRY: BalanceMetricRegistry = buildRegistry(DEFINITIONS);

/** Every §7 metric id, sorted. The key set of every run record. */
export const BALANCE_METRIC_IDS: readonly string[] = BALANCE_METRIC_REGISTRY.ids;

/** Each metric's `definitionVersion`, for a record's provenance block. */
export function metricDefinitionVersions(
  registry: BalanceMetricRegistry = BALANCE_METRIC_REGISTRY,
): Record<string, number> {
  const versions: Record<string, number> = {};
  for (const id of registry.ids) {
    versions[id] = (registry.balance(id) as BalanceMetricDefinition).definitionVersion;
  }
  return versions;
}

/**
 * Collects every registered metric for one run.
 *
 * Three properties, each of which is a scenario in the capability spec:
 *
 * 1. **Every registered metric gets an entry.** The result covers the whole key
 *    set, always. A missing key is a harness failure and cannot be produced by
 *    this function at all.
 * 2. **A `per-arm` metric is `{unavailable, per-arm-scope}` here**, filled in
 *    centrally rather than by each arm-scoped collector, because a collector
 *    that forgot would produce a run-level number for a quantity defined across
 *    runs and nothing would catch it.
 * 3. **A collector that raises or returns nothing fails the run.** The throw is
 *    wrapped in a {@link MetricCollectionError} naming the metric and re-raised;
 *    the harness records the run as `failed`. Swallowing it and writing
 *    `unavailable` instead would make a dead collector indistinguishable from an
 *    absent mechanic — which is the confusion the reason codes exist to end.
 */
export function collectRunMetrics(
  telemetry: RunTelemetry,
  registry: BalanceMetricRegistry = BALANCE_METRIC_REGISTRY,
): MetricEntries {
  const entries: Record<string, MetricEntry> = {};
  for (const id of registry.ids) {
    const definition = registry.balance(id) as BalanceMetricDefinition;
    if (definition.scope === METRIC_SCOPE.perArm) {
      entries[id] = { status: 'unavailable', reason: UNAVAILABLE_REASON.perArmScope };
      continue;
    }
    entries[id] = runCollector(definition, telemetry);
  }
  return entries;
}

function runCollector(
  definition: BalanceMetricDefinition,
  telemetry: RunTelemetry,
): MetricEntry {
  const collect = definition.collectRun as (input: RunTelemetry) => MetricEntry;
  let entry: MetricEntry | undefined;
  try {
    entry = collect(telemetry);
  } catch (cause) {
    if (cause instanceof MetricCollectionError) throw cause;
    throw new MetricCollectionError(definition.id, (cause as Error).message, { cause });
  }
  if (entry === undefined) {
    throw new MetricCollectionError(
      definition.id,
      'the collector returned nothing. A collector returns a measurement or an unavailable status; ' +
        'returning nothing writes a record with a missing key.',
    );
  }
  return entry;
}

/**
 * Collects every registered metric for one arm.
 *
 * The mirror of {@link collectRunMetrics}: `per-run` metrics have no arm-level
 * collector of their own here and are folded from the run records by
 * `aggregate.ts`, so they appear as `per-arm-scope`'s opposite — absent from
 * this map rather than present with a status. That asymmetry is deliberate. A
 * run record's key set is a contract with a reader years from now; an arm
 * summary's aggregate list is built from the sweep's declared metric ids and is
 * already complete by construction.
 */
export function collectArmMetrics(
  arm: ArmTelemetry,
  registry: BalanceMetricRegistry = BALANCE_METRIC_REGISTRY,
): MetricEntries {
  const entries: Record<string, MetricEntry> = {};
  for (const id of registry.ids) {
    const definition = registry.balance(id) as BalanceMetricDefinition;
    if (definition.scope !== METRIC_SCOPE.perArm) continue;
    const collect = definition.collectArm as (input: ArmTelemetry) => MetricEntry;
    let entry: MetricEntry | undefined;
    try {
      entry = collect(arm);
    } catch (cause) {
      if (cause instanceof MetricCollectionError) throw cause;
      throw new MetricCollectionError(id, (cause as Error).message, { cause });
    }
    if (entry === undefined) {
      throw new MetricCollectionError(id, 'the arm collector returned nothing.');
    }
    entries[id] = entry;
  }
  return entries;
}
