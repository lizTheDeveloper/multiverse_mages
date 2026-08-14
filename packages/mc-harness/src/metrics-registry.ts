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

import { NOT_ATTRIBUTABLE_PRIMITIVES, WILSON_Z_95 } from './ablation.js';
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
import {
  RECOVERY_FRACTION,
  VERSATILITY_HEGEMONY_FRACTION,
  collectLossShockRecovery,
  collectRoleAssignmentDemographicCost,
  OCCUPANCY_DEFINITION,
  collectSpeciesCellOccupancy,
  collectSpeciesGridVersatility,
} from './metrics-species-health.js';
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
  /**
   * The observation that would show this metric is measuring the wrong thing.
   *
   * `docs/design/invariants.md` has carried a *"Disproved by"* column since
   * 0.2.0 and this registry has not, which a prior audit called out. The gap
   * matters more here than there: an invariant that fails goes red, while a
   * metric that is measuring the wrong quantity stays green and keeps
   * publishing a number. Four have — `libraryDependence` pinned at 0,
   * `capitalSnowball`'s byte-identical checkpoints, `referenceLibraryDepth` at
   * 1.00, and a coverage gate counting primitives nothing consumed — and in
   * every case the disproof was cheap and nobody had written down what it was.
   *
   * A sentence naming a *specific observation*, not "if it looks wrong". It is
   * deliberately **not** part of {@link definitionDigest}: a sharper disproof
   * for the same quantity is an improvement, and forcing it through a
   * `definitionVersion` bump would make it look like the metric changed.
   * `metrics-registry.test.ts` guards it instead, by requiring one on every
   * entry.
   */
  readonly disprovedBy: string;
}

/** {@link MetricRegistry}, plus access to the full definitions. */
export interface BalanceMetricRegistry extends MetricRegistry {
  readonly definitions: readonly BalanceMetricDefinition[];
  balance(id: string): BalanceMetricDefinition | undefined;
}

/**
 * The metrics of `contracts.md` §7 — the original twelve, plus the three
 * species measurements `mages-and-species` added.
 *
 * Ordered as §7 tabulates them, so a reader can hold the two side by side. The
 * registry sorts ids for every canonical purpose; this array is for humans.
 */
const DEFINITIONS: readonly BalanceMetricDefinition[] = Object.freeze([
  {
    id: 'winRateByPrimitive',
    definition:
      'Raid win rate of the arm retaining primitive p against the arm in which p is neutralized, ' +
      'over mirrored pairs sharing derived run seeds with the sides swapped, reported with a 95% ' +
      'Wilson score interval. An interval containing 0.5 is reported as no-detected-effect ' +
      'alongside the point estimate; the portal primitive is not-attributable.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectWinRateByPrimitive,
    aggregation: 'mean',
    unit: 'win rate (fraction of mirrored plays)',
    // Bumped by task group 7: the metric was a placeholder reporting
    // `mechanic-absent` and is now an interval-gated estimate with a stated z, a
    // stated no-effect rule and a named exclusion. Same name, different quantity.
    definitionVersion: 2,
    pinnedConstants: {
      mirrored: true,
      pairwiseAblation: false,
      interval: 'wilson-score',
      intervalZ: WILSON_Z_95,
      noDetectedEffectRule: 'interval contains 0.5',
      notAttributablePrimitives: Object.keys(NOT_ATTRIBUTABLE_PRIMITIVES).sort(),
    },
    thresholdOwner: 'raid-engagement',
    disprovedBy:
      'A control arm and an ablation arm producing byte-identical run records — the ' +
      'neutralization did not reach the simulation, and every interval would then be centred on ' +
      '0.5 for a reason that has nothing to do with the primitive.',
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
    disprovedBy:
      'Two species with materially different learnRate and depthCeiling reporting the same ' +
      'first-reach tick across seeds, which would mean the measurement is reading a tick the ' +
      'species traits do not gate.',
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
    disprovedBy:
      'A run in which nodes are observed being lost while the estimate stays at the censoring ' +
      'bound — the census would be sampling a quantity the loss path does not move.',
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
    disprovedBy:
      'The fraction sitting at exactly 0 across every census of a run that demonstrably holds ' +
      'single-instance nodes. It has done exactly this, which is why the sentence is here.',
  },
  {
    id: 'worshipSnowball',
    definition:
      'Gini coefficient of instantaneous favor regeneration per world tick, across the runs of an ' +
      'arm, at fixed checkpoint world ticks. Runs terminating before a checkpoint are excluded ' +
      'from it and counted. The three saturated worship source classes are reported alongside it, ' +
      'per checkpoint, so a runaway is attributable without a second sweep.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectWorshipSnowball,
    aggregation: 'mean',
    unit: 'Gini coefficient',
    // Bumped by god-agency task 7.2: the quantity is now named as the ledger's
    // regeneration rather than "favor regen", and the per-class decomposition is
    // part of what the metric reports.
    definitionVersion: 2,
    pinnedConstants: {
      checkpointTicks: [...SNOWBALL_CHECKPOINT_TICKS],
      estimator: 'G = (2·Σ i·x_i) / (n·Σ x_i) − (n+1)/n, ascending, 1-based',
      smallSampleCorrection: false,
      degenerateTotalIsZero: 0,
      quantity: 'instantaneous favor regeneration per world tick, off the god favor ledger',
      scalarCheckpoint: 'last checkpoint with a sample',
      perClassContributions: ['mages', 'universities', 'populace'],
    },
    thresholdOwner: 'god-agency',
    disprovedBy:
      'Checkpoints whose Gini is identical across arms with different worship inputs, or a ' +
      'coefficient that does not move when a single universe is handed a large favor advantage.',
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
    disprovedBy:
      'Byte-identical checkpoint samples across runs with different library outcomes. Observed ' +
      'once already: identical checkpoints mean the quantity is not being read from the ' +
      'libraries.',
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
    disprovedBy:
      'Any raid landing in the overflow bin, which contradicts §1.6\'s termination proof rather ' +
      'than describing a long tail.',
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
    disprovedBy:
      'A rate that stays inside the 5-20% band while the denominator excludes truncated runs — ' +
      'the band would then be an artefact of selecting on the outcome being measured.',
  },
  {
    id: 'prestigeAdvantage',
    definition:
      'Win rate of a universe seeded with the maximum permitted prestige carry-forward against an ' +
      'otherwise identical universe seeded with zero prestige, over mirrored pairs sharing run ' +
      'seeds with the sides swapped. Must stay under 60%. The maximum is PRESTIGE_CAP, read out ' +
      'of loaded god-constant content, which the loader asserts is the analytic limit of the ' +
      'carry-forward recurrence at its earning ceiling.',
    scope: METRIC_SCOPE.perArm,
    collectArm: collectPrestigeAdvantage,
    aggregation: 'mean',
    unit: 'win rate (fraction of mirrored plays)',
    // Bumped by agent-interface task group 10: `carryForwardMax` was `null` —
    // the statement that nobody had chosen a magnitude — and is now a named
    // content constant. The collector's arithmetic did not change; what it is
    // allowed to run against did.
    definitionVersion: 2,
    pinnedConstants: {
      mirrored: true,
      carryForwardMax: 'PRESTIGE_CAP, from loaded god-constant content',
      thresholdMax: 0.6,
    },
    thresholdOwner: 'god-agency',
    disprovedBy:
      'A win rate at exactly 0.5 across mirrored pairs whose seeded prestige differs, which ' +
      'would mean the carry-forward is not reaching the seeded universe.',
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
    disprovedBy:
      'The collector\'s numerator disagreeing with agent-api\'s own rejection counter, which ' +
      'would mean somebody has started recounting.',
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
    disprovedBy:
      'Frozen world ticks reported for a universe that was never a defender, or a fraction ' +
      'above 1.',
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
    disprovedBy:
      'A non-zero cost reported by a run that initiated no raid, which would mean the ' +
      'denominator is not raids initiated.',
  },
  {
    id: 'speciesGridVersatility',
    definition:
      'Per species, the count of grid cells it can staff with a qualified researcher, over the ' +
      'full seventy and over the cells the ruleset permits, reported separately. A cell is ' +
      'staffable when some node in it is reachable within the species depthCeiling over the ' +
      'global transitive prerequisite closure. The per-run scalar is the highest per-species ' +
      'staffable fraction over the full grid — a maximum, because the failure mode is one species ' +
      'that can do everything and a mean would average it against five that cannot. Cells whose ' +
      'deepest node the species can reach, and the world ticks it keeps a fully-mastered node ' +
      'above the teach threshold, accompany it.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectSpeciesGridVersatility,
    aggregation: 'max',
    unit: 'fraction of grid cells staffable',
    definitionVersion: 1,
    pinnedConstants: {
      hegemonyFraction: VERSATILITY_HEGEMONY_FRACTION,
      staffableRule: 'some node in the cell reachable within depthCeiling',
      closureScope: 'global transitive prerequisite closure over the whole catalogue',
      depthComparison: 'node.tier > depthCeiling refuses, mirroring the gateway',
      scalar: 'maximum per-species staffable fraction over the full grid',
      enabledDenominator: 'cells permits() accepts, never a hardcoded twelve',
      teachableWindowRule:
        'floor((MASTERY_MAX - DEFAULT_TEACH_THRESHOLD) / masteryDecayPerTick(retention))',
    },
    thresholdOwner: 'mages-and-species',
    disprovedBy:
      'A species this metric scores as unable to staff a cell, observed holding a mind instance ' +
      'of a node in that cell during any run. The predicted-staffable set must be a superset of ' +
      'the observed-staffed set, and one counterexample means the gates are wrong. The weaker ' +
      'reading is disproved too: if every species scores 70/70 forever the metric is measuring ' +
      'the grid rather than the species, and the teachable window beside it is where the ' +
      'separation actually lives.',
  },
  {
    id: 'speciesCellOccupancy',
    definition:
      'Per species, the count of grid cells it actually occupies at run end — a cell is occupied ' +
      'when a living mage of that species holds a knowledge instance of some node in it, in a ' +
      'mind — reported over the full seventy and over the cells the ruleset permits. The per-run ' +
      'scalar is the Gini coefficient over those per-species counts, so that "one species can ' +
      'staff everything" is a number: 0 is an even spread and a rising value is a roster ' +
      'collapsing onto one species. Living mages and distinct nodes held accompany each count, ' +
      'so a zero can be read as "none alive" rather than as incapacity.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectSpeciesCellOccupancy,
    // Max, not mean: the failure this guards against is a single run in which
    // occupancy has collapsed onto one species, and averaging it against runs
    // that stayed even is the arithmetic that would hide it.
    aggregation: 'max',
    unit: 'Gini coefficient over per-species occupied-cell counts',
    definitionVersion: 1,
    pinnedConstants: {
      occupancyRule: OCCUPANCY_DEFINITION,
      locationKinds: 'mind only; library and grimoire copies are excluded',
      livingOnly: true,
      scalar: 'Gini over per-species occupied-cell counts, the shared metrics-gini estimator',
      enabledDenominator: 'cells permits() accepts, never a hardcoded twelve',
      readingTick: 'run end',
      assertsNoTarget:
        'all six species are tuningStatus untuned; this metric measures the spread, it does not ' +
        'declare what the spread should be, and no gate reads it',
    },
    thresholdOwner: 'mages-and-species',
    disprovedBy:
      'A species this metric scores as occupying a cell that `speciesGridVersatility` scores as ' +
      'unstaffable by that species. The two are capability and outcome over one grid, and ' +
      'versatility\'s own falsification test is stated over exactly this observation: the ' +
      'predicted-staffable set must be a superset of the observed-occupied set. The weaker ' +
      'reading is disproved too — if this reads a flat zero on every run whose species are alive ' +
      'and holding nodes, it is counting something other than cells.',
  },
  {
    id: 'lossShockRecovery',
    definition:
      'World ticks a species roster takes to return to its pre-shock headcount after a ' +
      'deterministic cull of a fixed fraction of living mages at a fixed world tick, per species, ' +
      'right-censored at run termination. The per-run scalar is the maximum over species that ' +
      'recovered — the slowest species determines whether a loss compounds across an era — with ' +
      'censored species named alongside, and with the nodes held before the shock and never ' +
      'regained reported per species beside the headcount.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectLossShockRecovery,
    aggregation: 'max',
    unit: 'world ticks to regain the pre-shock roster',
    definitionVersion: 1,
    pinnedConstants: {
      recoveryFraction: RECOVERY_FRACTION,
      selectionRule: 'every k-th living mage by ascending entity handle, no RNG draw',
      censoring: 'right-censored at run termination',
      unshockedRunReports: 'no-observations, never 0',
      knowledgeRecovery: 'distinct nodes held in a mind by a living mage of the species',
    },
    thresholdOwner: 'mages-and-species',
    disprovedBy:
      'Two species whose per-member mage-production rate and maturity lag differ by two orders of ' +
      'magnitude reporting the same recovery time. Content puts orc at roughly 340x draconic once ' +
      'fertility, mageAptitude and maturityMonths are composed, so equal recovery times would ' +
      'mean the measurement is not reading the pipeline that regrows a roster.',
  },
  {
    id: 'roleAssignmentDemographicCost',
    definition:
      'The largest fall in any species share of the mage roster at run end, at fp scale, in an ' +
      'arm that assigned long-lived species to lossy roles against a paired arm sharing run seeds ' +
      'that assigned none. Positive means role assignment consumed a species. Reported ' +
      'mechanic-absent when the build has no raid engagement, because role assignment reaches ' +
      'mortality only through combatant eligibility; no-observations when no role was assigned; ' +
      'and a measured zero only when roles were assigned, raids were fought, and the share did ' +
      'not move.',
    scope: METRIC_SCOPE.perRun,
    collectRun: collectRoleAssignmentDemographicCost,
    aggregation: 'max',
    unit: 'fp share of the mage roster',
    definitionVersion: 1,
    pinnedConstants: {
      paired: true,
      lossyRoleRule: 'RAIDING_ROLES, which is {raider} — the only role that raises death risk',
      mortalityPathway: 'raid combatant eligibility; roleId does not enter the mortality hazard',
      scalar: 'largest per-species fall against the control, fp scale',
      absentMechanic: 'raidEngagement',
    },
    thresholdOwner: 'mages-and-species',
    disprovedBy:
      'A measured non-zero cost in a build whose mortality hazard has no role term and whose ' +
      'raids never deployed — that would mean the difference is coming from seed divergence ' +
      'between the arms rather than from the assignment. The pairing is what makes that ' +
      'checkable: identical seeds with no assignments must difference to exactly zero.',
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
