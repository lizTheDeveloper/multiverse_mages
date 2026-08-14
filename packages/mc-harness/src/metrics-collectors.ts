/*
 * Multiverse Mages — the collectors behind every metric in contracts.md §7.
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
 * Tasks 6.4 through 6.12.
 *
 * ## The one rule every collector in this file obeys
 *
 * A collector returns a measurement **or** an `unavailable` status with a reason
 * code. It never returns a number it could not measure. Zero is a measurement,
 * `null` is a serialization accident, and both of them fold into a mean —
 * `design.md` rejects each by name. Every early return below is one of the four
 * reason codes, and the reason is chosen to distinguish four genuinely different
 * situations that would otherwise all read as "no number":
 *
 * - `mechanic-absent` — the feature has not shipped. Nothing was measured
 *   because there is nothing to measure.
 * - `no-observations` — the mechanic exists and this run produced no sample.
 * - `censored` — the run ended before the estimator's event occurred.
 * - `per-arm-scope` — the metric is not a per-run quantity at all.
 *
 * ## A known defect these metrics inherit, recorded rather than hidden
 *
 * **Loss-event attribution is destruction-order dependent.** When one sweep
 * empties a node held both in a mage's mind and in a library, the loss event
 * names the location kind of whichever instance was destroyed *last*;
 * `rules-magic`'s `rediscovery-boundaries.test.ts` asserts the *set* of lost
 * nodes is order-independent and deliberately does not assert the order.
 *
 * `knowledgeHalfLife` and `libraryDependence` exist precisely to tell "an
 * archmage died" from "the library burned", so they are the two metrics this
 * bites. It does **not** affect the numbers below: both are computed from
 * *existence counts* at census ticks, never from loss events, so a node that
 * left the universe left it whichever instance went last. It will affect any
 * later breakdown of loss *cause*, and whoever adds one should fix the
 * attribution first rather than baseline it. Recorded here so that a surprising
 * number has somewhere to be traced to.
 */

import { attributePrimitive, attributionEntry, mirroredSideProblems } from './ablation.js';
import type { JsonValue } from './canonical.js';
import type { MetricDetail, MetricEntry } from './metrics.js';
import { UNAVAILABLE_REASON } from './metrics.js';
import { nearestRank } from './metrics-gini.js';
import { gini } from './metrics-gini.js';
import type { SurvivalObservation } from './metrics-survival.js';
import { kaplanMeier, survivalQuantile } from './metrics-survival.js';
import type { ArmTelemetry, CensusSample, RaidObservation, RunTelemetry } from './metrics-telemetry.js';
import { terminalReasonName } from './session.js';

/* ------------------------------------------------------------------------- *
 * Pinned constants. Every one of these is covered by the `definitionVersion`
 * of the metrics that read it — see `metrics-registry.ts` and task 6.13.
 * ------------------------------------------------------------------------- */

/** §7's `timeToTierBySpecies` spans 6 species × 7 tiers. */
export const TIER_MIN = 1;
/** `contracts.md` §2.3 numbers node tiers 1–7. */
export const TIER_MAX = 7;
/** 6 × 7. Asserted, not assumed: content declaring five species is a mismatch. */
export const TIER_PAIR_COUNT = 42;

/** Checkpoint world ticks for both snowball metrics. */
export const SNOWBALL_CHECKPOINT_TICKS: readonly number[] = Object.freeze([60, 120, 240, 480, 1200]);

/** Histogram bin width for `raidLengthDistribution`, in engagement ticks. */
export const RAID_LENGTH_BIN_WIDTH_TICKS = 10;

/** `agent-api`'s no-op. Named so the no-op share is not a magic index. */
export const NOOP_ACTION_ID = 0;

/** The survival fraction `knowledgeHalfLife` is the time to. */
export const HALF_LIFE_QUANTILE = 0.5;

/**
 * Above this fraction of runs censoring a `(species, tier)` pair, the arm
 * aggregate reports the censoring instead of a median.
 *
 * "More than half", from the capability spec: a median computed from the
 * surviving minority of runs is a median of the runs that happened to get there,
 * which is the same selection-on-outcome error truncated runs are kept in the
 * denominator to avoid.
 */
export const HEAVY_CENSORING_FRACTION = 0.5;

/** A collector could not run at all. The harness records the run as `failed`. */
export class MetricCollectionError extends Error {
  readonly metricId: string;

  constructor(metricId: string, message: string, options?: { cause?: unknown }) {
    super(`Collecting ${metricId}: ${message}`, options);
    this.name = 'MetricCollectionError';
    this.metricId = metricId;
  }
}

/** Shorthand for the four reason codes, so no collector spells one wrong. */
function unavailable(
  reason: (typeof UNAVAILABLE_REASON)[keyof typeof UNAVAILABLE_REASON],
  detail?: MetricDetail,
): MetricEntry {
  return { status: 'unavailable', reason, ...(detail === undefined ? {} : { detail }) };
}

function measured(value: number, detail?: MetricDetail): MetricEntry {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `A collector produced ${String(value)}. canonicalJson renders NaN and ±Infinity as null, so ` +
        'a non-finite measurement would reach disk indistinguishable from an absence.',
    );
  }
  return { status: 'measured', value, ...(detail === undefined ? {} : { detail }) };
}

/* ------------------------------------------------------------------------- *
 * 6.5 — knowledgeHalfLife
 * ------------------------------------------------------------------------- */

/**
 * Turns a run's census into pooled survival observations.
 *
 * Each census tick `t` opens a cohort `K(t)` of every node then existing. A
 * member is watched forward to the first later census at which it is absent —
 * an **event**, at elapsed `t_absent − t` — or to the last census, where it is
 * **right-censored** at elapsed `t_last − t`.
 *
 * This is what makes rediscovery behave the way the capability spec's first
 * scenario demands without any special case: a node lost at tick 300 and back at
 * 500 is absent at the first census after 300, so every cohort that held it
 * before then records a loss; it is present again from the census after 500, so
 * it joins those cohorts as a fresh subject.
 *
 * Exported because the fixture-heavy tests for it read far better against the
 * observations than against the entry the collector wraps them in.
 */
export function survivalObservationsFrom(
  census: readonly CensusSample[],
): SurvivalObservation[] {
  const observations: SurvivalObservation[] = [];
  if (census.length === 0) return observations;
  const last = census[census.length - 1] as CensusSample;

  const present = census.map((sample) => new Set(sample.existingNodeIds));

  for (const [index, sample] of census.entries()) {
    for (const nodeId of sample.existingNodeIds) {
      let lossTick: number | undefined;
      for (let later = index + 1; later < census.length; later += 1) {
        if (!(present[later] as Set<number>).has(nodeId)) {
          lossTick = (census[later] as CensusSample).worldTick;
          break;
        }
      }
      observations.push(
        lossTick === undefined
          ? { elapsed: last.worldTick - sample.worldTick, event: false }
          : { elapsed: lossTick - sample.worldTick, event: true },
      );
    }
  }
  return observations;
}

/**
 * §7: *"world ticks for 50% of nodes known at tick t to be lost by tick t+n"*.
 *
 * Genuinely collects at 0.5.0: knowledge instances, loss and rediscovery all
 * exist as of `knowledge-model`, so this measures something real.
 *
 * Three outcomes, and the third is the one that matters:
 *
 * - a half-life, when the pooled curve falls to or below 0.5;
 * - `no-observations`, when no census ever found a node — an empty universe
 *   measured for a thousand ticks has no knowledge whose lifetime could be
 *   estimated;
 * - **`censored`**, when the curve never reaches 0.5 before the run ends. The
 *   entry then carries the longest observed elapsed time as a lower bound and
 *   the lowest survival the curve reached. Reporting the run length as the
 *   half-life instead would convert "we never saw half of it lost" into "half of
 *   it was lost at the moment we stopped looking", and that number would be
 *   perfectly plausible, stable across runs, and wrong.
 */
export function collectKnowledgeHalfLife(telemetry: RunTelemetry): MetricEntry {
  const observations = survivalObservationsFrom(telemetry.census);
  if (observations.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      censusSamples: telemetry.census.length,
      reasonDetail: 'no census sample found a node existing in the universe.',
    });
  }

  const curve = kaplanMeier(observations);
  const halfLife = survivalQuantile(curve, HALF_LIFE_QUANTILE);
  const detail: MetricDetail = {
    cohortObservations: curve.observations,
    losses: curve.events,
    rightCensored: curve.censored,
    longestObservedTicks: curve.longestObserved,
    lowestSurvival: curve.lowestSurvival,
    censusSamples: telemetry.census.length,
  };

  if (halfLife === null) {
    return unavailable(UNAVAILABLE_REASON.censored, {
      ...detail,
      lowerBoundTicks: curve.longestObserved,
    });
  }
  return measured(halfLife, detail);
}

/* ------------------------------------------------------------------------- *
 * 6.6 — libraryDependence
 * ------------------------------------------------------------------------- */

/**
 * §7: *"fraction of known nodes with exactly one surviving instance"*, evaluated
 * at every census tick and reported as the **mean over census samples**, with
 * the maximum and the final sample alongside.
 *
 * Genuinely collects at 0.5.0.
 *
 * The three figures answer three different questions and the mean alone answers
 * none of them well: a universe that spends four hundred ticks entirely
 * dependent on one library and then builds redundancy has a comfortable mean and
 * a maximum of 1, and it is the maximum that describes how close it came to
 * losing everything.
 *
 * **Empty-universe samples are excluded and counted.** A census finding no nodes
 * has no denominator; the capability spec requires the exclusion and requires
 * the count to be recorded, so a mean over three samples out of two hundred is
 * visibly a mean over three samples.
 */
export function collectLibraryDependence(telemetry: RunTelemetry): MetricEntry {
  const fractions: number[] = [];
  let excluded = 0;
  for (const sample of telemetry.census) {
    const existing = sample.existingNodeIds.length;
    if (existing === 0) {
      excluded += 1;
      continue;
    }
    fractions.push(sample.singleInstanceNodeIds.length / existing);
  }

  if (fractions.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      censusSamples: telemetry.census.length,
      excludedEmptySamples: excluded,
    });
  }

  let total = 0;
  let maximum = fractions[0] as number;
  for (const fraction of fractions) {
    total += fraction;
    if (fraction > maximum) maximum = fraction;
  }

  return measured(total / fractions.length, {
    samples: fractions.length,
    excludedEmptySamples: excluded,
    maximum,
    final: fractions[fractions.length - 1] as number,
  });
}

/* ------------------------------------------------------------------------- *
 * 6.7 — timeToTierBySpecies
 * ------------------------------------------------------------------------- */

/** One `(species, tier)` pair's outcome in one run. */
export interface TierPairOutcome {
  readonly speciesId: string;
  readonly tier: number;
  /** First world tick reached, or `null` when the pair was censored. */
  readonly worldTick: number | null;
  /** The termination tick the pair was right-censored at, when it was. */
  readonly censoredAt: number | null;
}

/** All 42 pairs for one run, in a stable `(species, tier)` order. */
export function tierPairOutcomes(telemetry: RunTelemetry): TierPairOutcome[] {
  const speciesIds = telemetry.speciesIds;
  const pairCount = speciesIds.length * (TIER_MAX - TIER_MIN + 1);
  if (pairCount !== TIER_PAIR_COUNT) {
    throw new MetricCollectionError(
      'timeToTierBySpecies',
      `the loaded content declares ${String(speciesIds.length)} species, which makes ` +
        `${String(pairCount)} (species, tier) pairs against tiers ${String(TIER_MIN)}–` +
        `${String(TIER_MAX)}. contracts.md §7 and the capability spec both pin 42. A run that ` +
        'quietly reported 35 pairs would compare against a 42-pair baseline as 7 newly-censored ' +
        'pairs rather than as the content change it is.',
    );
  }

  const first = new Map<string, number>();
  for (const reach of telemetry.tierFirstReached) {
    if (reach.tier < TIER_MIN || reach.tier > TIER_MAX) {
      throw new MetricCollectionError(
        'timeToTierBySpecies',
        `a reach was reported for tier ${String(reach.tier)}, outside ${String(TIER_MIN)}–` +
          `${String(TIER_MAX)}.`,
      );
    }
    const key = `${reach.speciesId}:${String(reach.tier)}`;
    const existing = first.get(key);
    // "First" is a minimum, not "whichever the executor happened to emit first".
    if (existing === undefined || reach.worldTick < existing) first.set(key, reach.worldTick);
  }

  const outcomes: TierPairOutcome[] = [];
  for (const speciesId of speciesIds) {
    for (let tier = TIER_MIN; tier <= TIER_MAX; tier += 1) {
      const reached = first.get(`${speciesId}:${String(tier)}`);
      outcomes.push({
        speciesId,
        tier,
        worldTick: reached ?? null,
        censoredAt: reached === undefined ? telemetry.ticksRun : null,
      });
    }
  }
  return outcomes;
}

/**
 * §7: *"world ticks for a species to first reach each node tier"*, over all 42
 * pairs, right-censored at run termination.
 *
 * Genuinely collects at 0.5.0: species, mages, node tiers and mind-held
 * knowledge instances all exist as of `mages-and-species`.
 *
 * The per-run scalar is the **median of the reached pairs**, with censored pairs
 * excluded from it — the capability spec's *"is excluded from the median"*. The
 * detail carries all 42 outcomes, because the scalar is what a baseline gates on
 * and the table is what makes a moved scalar diagnosable.
 *
 * A run in which no pair was reached reports `censored` rather than
 * `no-observations`: something was watched, and it did not happen in time. The
 * two are different claims about the same empty result and the reason code is
 * the only place the difference survives.
 */
export function collectTimeToTierBySpecies(telemetry: RunTelemetry): MetricEntry {
  const outcomes = tierPairOutcomes(telemetry);
  const reached = outcomes
    .filter((outcome) => outcome.worldTick !== null)
    .map((outcome) => outcome.worldTick as number)
    .sort((a, b) => a - b);

  const detail: MetricDetail = {
    pairs: outcomes.map((outcome) => ({
      speciesId: outcome.speciesId,
      tier: outcome.tier,
      status: outcome.worldTick === null ? 'censored' : 'reached',
      worldTick: outcome.worldTick,
      censoredAt: outcome.censoredAt,
    })),
    pairCount: outcomes.length,
    reachedPairs: reached.length,
    censoredPairs: outcomes.length - reached.length,
  };

  if (reached.length === 0) {
    return unavailable(UNAVAILABLE_REASON.censored, {
      ...detail,
      censoredAtTick: telemetry.ticksRun,
    });
  }
  return measured(nearestRank(reached, 0.5), detail);
}

/** One pair's arm-level aggregate. */
export interface TierPairAggregate {
  readonly speciesId: string;
  readonly tier: number;
  readonly status: 'measured' | 'censored';
  /** Median first-reach tick over the runs that reached it, or `null`. */
  readonly medianWorldTick: number | null;
  readonly reachedRuns: number;
  readonly censoredRuns: number;
  readonly censoringFraction: number;
}

/**
 * Per-pair medians across an arm, with the heavily-censored rule.
 *
 * When more than half an arm's runs censor a pair, the aggregate reports
 * `censored` **with the censoring fraction** and no median. The alternative — a
 * median over the minority that got there — describes the runs that reached
 * tier 6, not the game, and it moves in the *wrong direction* when the game gets
 * harder: fewer runs reach the tier, the survivors are the fastest, and the
 * median falls. A metric that improves as the thing it measures gets worse is
 * the most expensive kind of green.
 *
 * @param runs - Each run's pair outcomes, **already in canonical run order**.
 */
export function aggregateTierPairs(
  runs: readonly (readonly TierPairOutcome[])[],
): TierPairAggregate[] {
  if (runs.length === 0) return [];
  const keys: { speciesId: string; tier: number }[] = (runs[0] as readonly TierPairOutcome[]).map(
    (outcome) => ({ speciesId: outcome.speciesId, tier: outcome.tier }),
  );

  return keys.map(({ speciesId, tier }) => {
    const reached: number[] = [];
    let censoredRuns = 0;
    for (const run of runs) {
      const outcome = run.find(
        (candidate) => candidate.speciesId === speciesId && candidate.tier === tier,
      );
      if (outcome === undefined || outcome.worldTick === null) {
        censoredRuns += 1;
        continue;
      }
      reached.push(outcome.worldTick);
    }
    const censoringFraction = censoredRuns / runs.length;
    if (censoringFraction > HEAVY_CENSORING_FRACTION || reached.length === 0) {
      return {
        speciesId,
        tier,
        status: 'censored',
        medianWorldTick: null,
        reachedRuns: reached.length,
        censoredRuns,
        censoringFraction,
      };
    }
    return {
      speciesId,
      tier,
      status: 'measured',
      medianWorldTick: nearestRank([...reached].sort((a, b) => a - b), 0.5),
      reachedRuns: reached.length,
      censoredRuns,
      censoringFraction,
    };
  });
}

/* ------------------------------------------------------------------------- *
 * 6.8 — worshipSnowball and capitalSnowball
 * ------------------------------------------------------------------------- */

/** What a snowball metric measures at a checkpoint. */
export type SnowballQuantity = 'favorRegenPerTick' | 'libraryNodeCount';

/** One checkpoint's coefficient, its sample, and what it excluded. */
export interface CheckpointGini {
  readonly worldTick: number;
  readonly coefficient: number | null;
  readonly sampleCount: number;
  /** Runs that terminated before this checkpoint. */
  readonly excludedEarlyTerminations: number;
  /** Runs that reached the checkpoint but reported no value for the quantity. */
  readonly excludedMissing: number;
}

/**
 * The Gini coefficient at each pinned checkpoint, over an arm's runs.
 *
 * Exported separately from the two collectors because both use it unchanged —
 * see `metrics-gini.ts` on why there is exactly one implementation.
 *
 * **Runs that terminated before a checkpoint are excluded from it and counted.**
 * A universe that stagnated at tick 300 has no favor regeneration at tick 1200,
 * and folding it in as 0 would make early terminations read as extreme
 * inequality — inflating exactly the coefficient §7 thresholds at ≤ 0.35.
 */
export function checkpointGinis(
  arm: ArmTelemetry,
  quantity: SnowballQuantity,
): CheckpointGini[] {
  return SNOWBALL_CHECKPOINT_TICKS.map((worldTick) => {
    const values: number[] = [];
    let excludedEarlyTerminations = 0;
    let excludedMissing = 0;

    for (const run of arm.runs) {
      if (run.ticksRun < worldTick) {
        excludedEarlyTerminations += 1;
        continue;
      }
      const sample = run.checkpoints.find((candidate) => candidate.worldTick === worldTick);
      if (sample === undefined) {
        excludedMissing += 1;
        continue;
      }
      const value = quantity === 'favorRegenPerTick' ? sample.favorRegenPerTick : sample.libraryNodeCount;
      if (value === null) {
        excludedMissing += 1;
        continue;
      }
      values.push(value);
    }

    const result = gini(values);
    return {
      worldTick,
      coefficient: result.coefficient,
      sampleCount: result.sampleCount,
      excludedEarlyTerminations,
      excludedMissing,
    };
  });
}

/** Folds per-checkpoint coefficients into the one scalar a baseline gates on. */
function snowballEntry(
  checkpoints: readonly CheckpointGini[],
  extra: MetricDetail,
): MetricEntry {
  const measuredCheckpoints = checkpoints.filter((entry) => entry.coefficient !== null);
  const detail: MetricDetail = {
    ...extra,
    checkpoints: checkpoints.map((entry) => ({
      worldTick: entry.worldTick,
      coefficient: entry.coefficient,
      sampleCount: entry.sampleCount,
      excludedEarlyTerminations: entry.excludedEarlyTerminations,
      excludedMissing: entry.excludedMissing,
    })),
  };
  if (measuredCheckpoints.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, detail);
  }
  // The scalar is the **last checkpoint with a sample**, not a mean across
  // checkpoints: the coefficients at tick 60 and tick 1200 measure different
  // stages of the same run and averaging them produces a number describing
  // neither. §7's threshold is about where the universe ends up.
  const last = measuredCheckpoints[measuredCheckpoints.length - 1] as CheckpointGini;
  return measured(last.coefficient as number, { ...detail, scalarCheckpointTick: last.worldTick });
}

/**
 * §7: *"Gini coefficient of favor regen across MC runs at fixed tick counts"*,
 * threshold ≤ 0.35 plus p95:p50 regen ≤ 3:1.
 *
 * **`mechanic-absent` at 0.5.0.** `contracts.md` §8 leaves the worship and
 * favor-regeneration formulas to `god-agency`, and `rules-world` is scanned for
 * a write to `favor` or `worship` and fails on one — so there is no
 * regeneration rate in this build to take a coefficient of. The estimator, the
 * checkpoints, the exclusion counting and the tail ratio all ship here and are
 * tested against supplied samples; the flag is the only thing missing, and
 * flipping it is `god-agency`'s to do.
 */
export function collectWorshipSnowball(arm: ArmTelemetry): MetricEntry {
  if (!arm.mechanics.worship) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, {
      owner: 'god-agency',
      reasonDetail:
        'contracts.md §8 leaves the worship and favor-regeneration formulas to god-agency; this ' +
        'build has no regeneration rate to take a coefficient of.',
    });
  }
  const checkpoints = checkpointGinis(arm, 'favorRegenPerTick');
  return snowballEntry(checkpoints, {
    quantity: 'favorRegenPerTick',
    thresholdMax: 0.35,
    worshipByClass: worshipClassShares(arm),
  });
}

/**
 * The arm's mean worship contribution per source class, at each checkpoint.
 *
 * `god-agency` task 7.2, and the argument for it is that the coefficient alone
 * is not actionable: `worshipSnowball` above 0.35 says inequality is growing and
 * says nothing about *which* of the three saturated classes produced it, while
 * the retune for a mage-driven runaway and a populace-driven one are different
 * knobs. Reported here rather than in a separate sweep because it is a
 * decomposition of the very samples the coefficient was taken over.
 *
 * Means are folded over the arm's runs **in the order `ArmTelemetry.runs`
 * already guarantees**, which is canonical. `null` for a class at a checkpoint
 * no run reported, never 0 — a class contributing nothing and a class nobody
 * measured are different findings, and one of them is a balance result.
 */
function worshipClassShares(arm: ArmTelemetry): JsonValue {
  return SNOWBALL_CHECKPOINT_TICKS.map((worldTick) => {
    let mages = 0;
    let universities = 0;
    let populace = 0;
    let samples = 0;
    for (const run of arm.runs) {
      if (run.ticksRun < worldTick) continue;
      const sample = run.checkpoints.find((candidate) => candidate.worldTick === worldTick);
      if (sample?.worshipByClass === undefined) continue;
      mages += sample.worshipByClass.mages;
      universities += sample.worshipByClass.universities;
      populace += sample.worshipByClass.populace;
      samples += 1;
    }
    return {
      worldTick,
      samples,
      mages: samples === 0 ? null : mages / samples,
      universities: samples === 0 ? null : universities / samples,
      populace: samples === 0 ? null : populace / samples,
    };
  });
}

/**
 * §7: *"same, over library depth — the §6a loop"*.
 *
 * **Genuinely collects at 0.5.0.** Library-located knowledge instances exist as
 * of `knowledge-model`, so the count of distinct nodes held in libraries is a
 * real quantity — and an arm in which every run holds nothing reports a
 * coefficient of 0, which is the honest answer for a perfectly equal
 * distribution rather than a placeholder.
 */
export function collectCapitalSnowball(arm: ArmTelemetry): MetricEntry {
  const checkpoints = checkpointGinis(arm, 'libraryNodeCount');
  return snowballEntry(checkpoints, { quantity: 'libraryNodeCount' });
}

/* ------------------------------------------------------------------------- *
 * 6.9 — raidLengthDistribution
 * ------------------------------------------------------------------------- */

/** A raid-length histogram over fixed bins plus the overflow bin. */
export interface RaidLengthHistogram {
  readonly binWidthTicks: number;
  /** Counts for bins `[0,10)`, `[10,20)`, … up to the stability bound. */
  readonly bins: readonly number[];
  /** Raids exceeding their own initial portal stability. Must stay 0. */
  readonly overflow: number;
  readonly p50: number;
  readonly p95: number;
  readonly maximum: number;
  readonly raidCount: number;
}

/**
 * Bins raid lengths, and refuses to bin one that broke its own bound.
 *
 * §7 says the distribution *"must be bounded by portal stability"*, and
 * `contracts.md` §1.6 makes that a proof rather than an observation: no effect
 * primitive may modify `portalStability`, and `stabilityDecayPerTick` is an
 * authored integer ≥ 1, so every raid terminates in at most its initial
 * stability in engagement ticks.
 *
 * The overflow bin therefore is not a catch-all — it is an **assertion**. A raid
 * in it means the termination proof was violated, which is a rules defect and
 * not a long tail, so this throws and the harness records the run as `failed`
 * naming the raid and its seed. Silently widening the histogram would turn a
 * broken guarantee into a wide distribution nobody looked at twice.
 *
 * @throws MetricCollectionError when any raid exceeded its initial stability.
 */
export function raidLengthHistogram(
  raids: readonly {
    readonly raidId: number;
    readonly raidSeed: number;
    readonly engagementTicks: number;
    readonly initialPortalStabilityTicks: number;
  }[],
): RaidLengthHistogram {
  const overflowing = raids.filter(
    (raid) => raid.engagementTicks > raid.initialPortalStabilityTicks,
  );
  if (overflowing.length > 0) {
    const named = overflowing
      .map(
        (raid) =>
          `raid ${String(raid.raidId)} (seed ${String(raid.raidSeed)}) ran ` +
          `${String(raid.engagementTicks)} engagement ticks against an initial portal stability of ` +
          `${String(raid.initialPortalStabilityTicks)}`,
      )
      .join('; ');
    throw new MetricCollectionError(
      'raidLengthDistribution',
      `the overflow bin is non-empty: ${named}. contracts.md §1.6 makes raid termination a proof — ` +
        'no primitive may modify portalStability and decay is an authored integer ≥ 1 — so this is ' +
        'a violated guarantee, not an outlier.',
    );
  }

  let bound = 0;
  for (const raid of raids) {
    if (raid.initialPortalStabilityTicks > bound) bound = raid.initialPortalStabilityTicks;
  }
  const binCount = Math.max(1, Math.ceil((bound + 1) / RAID_LENGTH_BIN_WIDTH_TICKS));
  const bins = new Array<number>(binCount).fill(0);
  const lengths: number[] = [];
  for (const raid of raids) {
    const bin = Math.floor(raid.engagementTicks / RAID_LENGTH_BIN_WIDTH_TICKS);
    bins[Math.min(bin, binCount - 1)] = (bins[Math.min(bin, binCount - 1)] as number) + 1;
    lengths.push(raid.engagementTicks);
  }
  lengths.sort((a, b) => a - b);

  return {
    binWidthTicks: RAID_LENGTH_BIN_WIDTH_TICKS,
    bins,
    overflow: 0,
    p50: lengths.length === 0 ? 0 : nearestRank(lengths, 0.5),
    p95: lengths.length === 0 ? 0 : nearestRank(lengths, 0.95),
    maximum: lengths.length === 0 ? 0 : (lengths[lengths.length - 1] as number),
    raidCount: lengths.length,
  };
}

/**
 * §7: *"engagement ticks to resolution; must be bounded by portal stability"*.
 *
 * **`mechanic-absent` at 0.5.0.** `raid-engagement` has not landed, `rules-raid`
 * is a skeleton, and no run produces a raid. The histogram, the bounds
 * assertion and the summary statistics ship here and are tested against supplied
 * raids.
 *
 * When raids *do* exist and a run simply had none, the reason is
 * `no-observations`. Keeping those two apart is the capability spec's
 * *"Absent and empty are distinguishable"* scenario, and it is why
 * {@link RunTelemetry.raids} is `undefined` rather than `[]` on this build.
 */
export function collectRaidLengthDistribution(telemetry: RunTelemetry): MetricEntry {
  if (!telemetry.mechanics.raidEngagement || telemetry.raids === undefined) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, {
      owner: 'raid-engagement',
      reasonDetail: 'no raid mechanic in this build; rules-raid is a skeleton.',
    });
  }
  if (telemetry.raids.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail: 'raids exist in this build; this run initiated none.',
    });
  }
  const histogram = raidLengthHistogram(telemetry.raids);
  return measured(histogram.p50, {
    binWidthTicks: histogram.binWidthTicks,
    bins: histogram.bins,
    overflow: histogram.overflow,
    p50: histogram.p50,
    p95: histogram.p95,
    maximum: histogram.maximum,
    raidCount: histogram.raidCount,
  });
}

/**
 * §7: *"world ticks a universe spends frozen in engagement as a defender, as a
 * fraction of elapsed multiverse time"* — the griefing guard.
 *
 * **`mechanic-absent` at 0.5.0**, for the same reason as above. The arithmetic
 * is one division and is written out so that `raid-engagement` inherits the
 * denominator decision — elapsed world ticks of *this run*, not of the sweep —
 * rather than re-deciding it.
 */
export function collectInboundRaidTempoLoss(telemetry: RunTelemetry): MetricEntry {
  if (!telemetry.mechanics.raidEngagement || telemetry.raids === undefined) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, { owner: 'raid-engagement' });
  }
  if (telemetry.ticksRun === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail: 'the run elapsed no world ticks, so there is no elapsed time to be a fraction of.',
    });
  }
  let frozen = 0;
  for (const raid of telemetry.raids) frozen += raid.defenderFrozenWorldTicks;
  return measured(frozen / telemetry.ticksRun, {
    frozenWorldTicks: frozen,
    elapsedWorldTicks: telemetry.ticksRun,
    inboundRaids: telemetry.raids.length,
  });
}

/**
 * §7: *"tempo an attacker forgoes per raid, for comparison against what they
 * gain"*.
 *
 * **`mechanic-absent` at 0.5.0.** Per *raid*, not per run — the comparison §7
 * asks for is against what one raid gains.
 */
export function collectRaidInitiationCost(telemetry: RunTelemetry): MetricEntry {
  if (!telemetry.mechanics.raidEngagement || telemetry.raids === undefined) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, { owner: 'raid-engagement' });
  }
  if (telemetry.raids.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail: 'raids exist in this build; this run initiated none.',
    });
  }
  let cost = 0;
  for (const raid of telemetry.raids) cost += raid.attackerTempoCostWorldTicks;
  return measured(cost / telemetry.raids.length, { raids: telemetry.raids.length });
}

/* ------------------------------------------------------------------------- *
 * combatActionEconomy and combatThresholdEfficiency
 * ------------------------------------------------------------------------- */

/**
 * The two things every raid metric here has to check before it computes
 * anything, in the order §7 requires them.
 *
 * `mechanic-absent` when the build declares no raids — which is this build, so
 * both combat metrics report it on `main` rather than a misleading zero.
 * `no-observations` when raids exist and this run had none. Collapsing the two
 * is the confusion the reason codes exist to end, and it is easy to do by
 * accident because both produce an empty list.
 */
function raidsOrReason(telemetry: RunTelemetry): readonly RaidObservation[] | MetricEntry {
  if (!telemetry.mechanics.raidEngagement || telemetry.raids === undefined) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, {
      owner: 'raid-engagement',
      reasonDetail:
        'this build declares no raid mechanic, so no cast has ever removed anybody from action. ' +
        'A zero here would read as "combat primitives are worthless", which is a finding this ' +
        'build has not earned.',
    });
  }
  if (telemetry.raids.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail: 'raids exist in this build; this run initiated none.',
    });
  }
  return telemetry.raids;
}

/** Folds every raid's per-source rows into one table, ascending by source. */
function foldCombatSources(
  raids: readonly RaidObservation[],
): Map<string, { denied: number; hp: number; removing: number; hurting: number; spent: number }> {
  const table = new Map<
    string,
    { denied: number; hp: number; removing: number; hurting: number; spent: number }
  >();
  for (const raid of raids) {
    for (const row of raid.combatSources) {
      const entry = table.get(row.source) ?? { denied: 0, hp: 0, removing: 0, hurting: 0, spent: 0 };
      entry.denied += row.deniedCombatantTicks;
      entry.hp += row.hitPointsRemoved;
      entry.removing += row.removingAttempts;
      entry.hurting += row.hurtingAttempts;
      entry.spent += row.spentAttempts;
      table.set(row.source, entry);
    }
  }
  return table;
}

function sortedSources(
  table: Map<string, { denied: number; hp: number; removing: number; hurting: number; spent: number }>,
): string[] {
  return [...table.keys()].sort();
}

/** The union of every raid's declared unimplemented channels, ascending. */
function declaredChannels(raids: readonly RaidObservation[]): string[] {
  const channels = new Set<string>();
  for (const raid of raids) for (const channel of raid.unimplementedCombatChannels) channels.add(channel);
  return [...channels].sort();
}

/**
 * **What a combat node is actually worth**, and the metric this project did not
 * have.
 *
 * Every existing measure of a combat primitive is a measure of *damage*:
 * `RaidOutcome.primitiveApplication` totals magnitude put on the field, and
 * `winRateByPrimitive` attributes wins to a primitive without saying through
 * what. Two findings say damage is the wrong primary quantity — over twenty
 * seeds the share of hit points removed ran roughly half to `area-denial`,
 * roughly half to summons and soldier detachments and under two percent to cast
 * `direct-damage`; and survival-regret measured zero on every seed, because the
 * raider took the objectives and left before combat decided anything.
 *
 * So the primary measure is **action economy**: combatant-ticks of enemy action
 * denied, over the combatant-ticks the raid contained. `rules-raid` computes the
 * attribution — see `action-economy.ts` for the three channels it can produce
 * and the fourth it declares absent — and this collector normalises and pools.
 *
 * The scalar is a **rate, not a level**: a raid twice as long contains twice the
 * combatant-ticks, and a level would then rank raid length above combat. A rate
 * near zero is the direct statement that combat does not decide raids.
 */
export function collectCombatActionEconomy(telemetry: RunTelemetry): MetricEntry {
  const raids = raidsOrReason(telemetry);
  if (!Array.isArray(raids)) return raids as MetricEntry;
  const observed = raids as readonly RaidObservation[];

  let span = 0;
  let removals = 0;
  let summonsRemoved = 0;
  for (const raid of observed) {
    span += raid.totalCombatantTicks;
    removals += raid.worldScaleRemovals;
    summonsRemoved += raid.summonsRemoved;
  }
  if (span === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail:
        'the raids in this run contained no combatant-ticks at all — every raid resolved on the ' +
        'tick it opened. There is no denominator, and reporting 0 would say combat denied nothing ' +
        'when in truth there was nothing to deny.',
    });
  }

  const table = foldCombatSources(observed);
  let denied = 0;
  for (const entry of table.values()) denied += entry.denied;

  const bySource: Record<string, { deniedCombatantTicks: number; shareOfDenied: number; hitPointsRemoved: number; shareOfHitPoints: number }> = {};
  let hpTotal = 0;
  for (const entry of table.values()) hpTotal += entry.hp;
  let dominance = 0;
  for (const source of sortedSources(table)) {
    const entry = table.get(source) as { denied: number; hp: number };
    const share = denied === 0 ? 0 : entry.denied / denied;
    if (share > dominance) dominance = share;
    bySource[source] = {
      deniedCombatantTicks: entry.denied,
      shareOfDenied: share,
      hitPointsRemoved: entry.hp,
      shareOfHitPoints: hpTotal === 0 ? 0 : entry.hp / hpTotal,
    };
  }

  return measured(denied / span, {
    deniedCombatantTicks: denied,
    totalCombatantTicks: span,
    // The share held by the largest single source. A combat layer in which one
    // primitive does everything reads near 1; one in which the sources trade
    // reads near 1/n. It is the concentration the current tuning has and the
    // reason this metric was asked for.
    dominanceShare: dominance,
    bySource,
    worldScaleRemovals: removals,
    // Outside the scalar on purpose: a summon costs its owner nothing at world
    // scale, so crediting its removal would let damage farm denial on free
    // bodies. Reported so the exclusion's failure mode is visible.
    summonsRemoved,
    raidCount: observed.length,
    unimplementedChannels: declaredChannels(observed),
  });
}

/**
 * **Threshold efficiency**: of the combat attempts that landed, the fraction
 * that removed a target rather than merely hurting one.
 *
 * The companion question to action economy, and the one that separates a
 * primitive that is *small* from a primitive that is *below a threshold*. A bolt
 * doing a thirtieth of a mage's hit points is not one-thirtieth as good as a
 * bolt that kills; against a target that is healed, replaced, or simply
 * withdrawn before the ninetieth cast lands, it is worth nothing at all. A ratio
 * near zero says the primitive never crosses; a ratio near one says every
 * application is decisive and the primitive is probably too strong.
 *
 * **Attempts that landed nothing are in neither the numerator nor the
 * denominator**, and counted separately. An attempt that a target evaded says
 * nothing about whether its source crosses a removal threshold, and folding it
 * into the denominator would charge the caster for the *enemy's* concealment.
 */
export function collectCombatThresholdEfficiency(telemetry: RunTelemetry): MetricEntry {
  const raids = raidsOrReason(telemetry);
  if (!Array.isArray(raids)) return raids as MetricEntry;
  const observed = raids as readonly RaidObservation[];

  const table = foldCombatSources(observed);
  let removing = 0;
  let hurting = 0;
  let spent = 0;
  for (const entry of table.values()) {
    removing += entry.removing;
    hurting += entry.hurting;
    spent += entry.spent;
  }
  const landed = removing + hurting;
  if (landed === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail:
        'no combat attempt in this run removed a hit point. The ratio has no denominator, and 0 ' +
        'would claim every attempt failed to cross a threshold when none was tested.',
    });
  }

  const bySource: Record<
    string,
    { removingAttempts: number; hurtingAttempts: number; spentAttempts: number; efficiency: number | null }
  > = {};
  for (const source of sortedSources(table)) {
    const entry = table.get(source) as { removing: number; hurting: number; spent: number };
    const denominator = entry.removing + entry.hurting;
    bySource[source] = {
      removingAttempts: entry.removing,
      hurtingAttempts: entry.hurting,
      spentAttempts: entry.spent,
      // `null`, never 0: a source whose every attempt was evaded has an
      // undefined efficiency, and a zero there is a claim it was tested.
      efficiency: denominator === 0 ? null : entry.removing / denominator,
    };
  }

  return measured(removing / landed, {
    removingAttempts: removing,
    hurtingAttempts: hurting,
    spentAttempts: spent,
    bySource,
    raidCount: observed.length,
  });
}

/* ------------------------------------------------------------------------- *
 * 6.10 — ascensionRate
 * ------------------------------------------------------------------------- */

/**
 * §7: *"fraction of runs reaching ascension. Target band: 5–20%"*.
 *
 * **Genuinely collects at 0.5.0.** The terminal statuses exist and every run
 * carries one, so the fraction is a real measurement — including when it is 0,
 * which is a finding about placeholder content and not an absence.
 *
 * Two rules, both of which change the number:
 *
 * - **Truncated runs are in the denominator.** A run that hit the world-tick cap
 *   is a universe that did not ascend, and dropping it would compute the
 *   ascension rate over a population selected on the outcome being measured. The
 *   number would then sit comfortably inside the 5–20% band by construction.
 * - **Failed runs are excluded from both numerator and denominator, and reported
 *   separately.** A crashed worker is not evidence about the game. The count
 *   goes into the detail so a rate computed over 490 of 500 runs is visibly so.
 *
 * The band is *reported*, never enforced here: the capability spec puts
 * out-of-band detection in the regression gate, because a collector that clamped
 * would make the metric agree with the target by definition.
 */
export function collectAscensionRate(arm: ArmTelemetry): MetricEntry {
  let ascended = 0;
  let eligible = 0;
  let failed = 0;
  const byStatus: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  for (const run of arm.runs) {
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    const reason = terminalReasonName(run.terminalReason);
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    if (run.status === 'failed') {
      failed += 1;
      continue;
    }
    if (run.status === 'running') continue;
    eligible += 1;
    if (run.status === 'ascended') ascended += 1;
  }

  const detail: MetricDetail = {
    ascended,
    denominator: eligible,
    failedExcluded: failed,
    countsByStatus: sortedCounts(byStatus),
    // The rate's own numerator, split. §1.1 gives two routes to a summit and
    // `status` collapses them, so a rate inside the 0.05–0.20 band built
    // entirely out of one route is a different game from the same rate built
    // out of both — and until this line nothing reported the difference.
    countsByTerminalReason: sortedCounts(byReason),
    targetBandMin: 0.05,
    targetBandMax: 0.2,
  };

  if (eligible === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, detail);
  }
  return measured(ascended / eligible, detail);
}

/* ------------------------------------------------------------------------- *
 * 6.11 — prestigeAdvantage
 * ------------------------------------------------------------------------- */

/**
 * §7: *"win rate of a high-prestige universe vs. a fresh one. Must stay under
 * 60%"*, over mirrored pairs sharing run seeds with the sides swapped.
 *
 * **`mechanic-absent` at 0.5.0, and deliberately so.** The metric needs *the
 * maximum permitted prestige carry-forward*, and nobody has chosen one:
 * `design.md`'s open questions defer the magnitude to `god-agency`, which is
 * where prestige acquires one. Picking a placeholder here would produce a
 * perfectly stable win rate measuring a prestige level that no released build
 * ever grants — and every later baseline would inherit it.
 *
 * So the mirrored-pair arithmetic ships and is tested, gated on two things being
 * true at once: the build declaring the mechanic, and the arm carrying a
 * non-`null` carry-forward maximum. `null` is not a default; it is the statement
 * that the decision has not been made.
 */
export function collectPrestigeAdvantage(arm: ArmTelemetry): MetricEntry {
  if (!arm.mechanics.prestigeCarryForward || arm.prestigeCarryForwardMax === null) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, {
      owner: 'god-agency',
      reasonDetail:
        'the maximum permitted prestige carry-forward has not been defined; the collector will not ' +
        'choose a magnitude.',
    });
  }
  const plays = arm.mirroredPlays ?? [];
  if (plays.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail: 'no mirrored prestige pairs were scheduled in this arm.',
    });
  }

  const problems = mirroredPairProblems(plays);
  if (problems.length > 0) {
    throw new MetricCollectionError('prestigeAdvantage', problems.join(' '));
  }

  let wins = 0;
  for (const play of plays) if (play.prestigeWon) wins += 1;
  return measured(wins / plays.length, {
    plays: plays.length,
    pairs: plays.length / 2,
    prestigeWins: wins,
    carryForwardMax: arm.prestigeCarryForwardMax,
    thresholdMax: 0.6,
  });
}

/**
 * Checks that every play is genuinely mirrored.
 *
 * Mirroring is the whole mechanism by which side bias cancels: each run seed is
 * played twice with the prestige-seeded universe on each side. An arm holding an
 * odd number of plays, or two plays of one seed on the same side, produces a win
 * rate contaminated by whatever advantage side 0 has — and it produces it
 * quietly, as a number near 50% that drifts.
 */
export function mirroredPairProblems(
  plays: readonly { readonly runSeed: number; readonly prestigeSide: 0 | 1 }[],
): string[] {
  return mirroredSideProblems(
    plays.map((play) => ({ runSeed: play.runSeed, side: play.prestigeSide })),
  );
}

/* ------------------------------------------------------------------------- *
 * 6.12 — illegalActionRate
 * ------------------------------------------------------------------------- */

/**
 * §7: *"fraction of agent actions rejected by the mask; a spec-clarity smell"*.
 *
 * **Genuinely collects at 0.5.0.** It is the one metric here computed from a
 * counter that already exists: `agent-api`'s `accounting()` reports `submitted`,
 * `rejected` and `rejectedByAction`, and `illegalActionCount()` reports the
 * core's own tally out of state. The capability spec requires the metric to be
 * *derived from those counters rather than recounted independently* — a second
 * tally that disagreed with the session's would be undiscoverable, because both
 * would look like plausible integers.
 *
 * **No-ops are in the denominator**, per the capability spec's first scenario:
 * 900 no-ops and 100 other actions with 20 rejections is `0.02`, not `0.2`. A
 * denominator of "interesting actions only" would make a strategy look worse the
 * more it engaged with the game.
 *
 * The no-op *share* is reported when the executor can supply submissions by
 * action id — see {@link RunTelemetry.submittedByActionId} for why that counter
 * is optional and what it is waiting on.
 */
export function collectIllegalActionRate(telemetry: RunTelemetry): MetricEntry {
  const { submissions, rejections, byActionId } = telemetry.accounting;
  if (submissions === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail: 'the run submitted no actions, so there is no denominator.',
    });
  }
  if (rejections > submissions) {
    throw new MetricCollectionError(
      'illegalActionRate',
      `${String(rejections)} rejections against ${String(submissions)} submissions. Every rejection ` +
        'is a submission; a rate above 1 means the two counters came from different episodes.',
    );
  }

  const rejectionRateByAction: Record<string, number> = {};
  for (const actionId of Object.keys(byActionId).sort()) {
    rejectionRateByAction[actionId] = (byActionId[actionId] as number) / submissions;
  }

  const submittedByActionId = telemetry.submittedByActionId;
  const noOpShare =
    submittedByActionId === undefined
      ? undefined
      : (submittedByActionId[String(NOOP_ACTION_ID)] ?? 0) / submissions;

  return measured(rejections / submissions, {
    submissions,
    rejections,
    rejectionsByActionId: sortedCounts(byActionId),
    rejectionRateByActionId: rejectionRateByAction,
    ...(noOpShare === undefined ? {} : { noOpShare, noOpActionId: NOOP_ACTION_ID }),
  });
}

/** One strategy's slice of the illegal-action accounting. */
export interface StrategyIllegalActions {
  readonly strategyId: string;
  readonly submissions: number;
  readonly rejections: number;
  /** `null` when the strategy submitted nothing — never 0, which folds. */
  readonly rate: number | null;
  readonly rejectionsByActionId: Readonly<Record<string, number>>;
}

/**
 * The per-`strategyId` breakdown the capability spec requires.
 *
 * Attribution is by **even split across the run's slots**, and that limitation is
 * stated rather than hidden: `agent-api` accounts per *session*, and a run whose
 * slots are played by two different strategies reports one set of counters for
 * both. A run with a single strategy — every arm the gate sweep schedules —
 * attributes exactly. A mixed-strategy run attributes proportionally, which is
 * right in aggregate and wrong for any individual run, and which is why the
 * result carries the submission count a reader can sanity-check against.
 *
 * The fix is per-slot accounting in `agent-api`, not arithmetic here.
 *
 * @param runs - Each run's strategy assignment and accounting, in canonical order.
 */
export function illegalActionsByStrategy(
  runs: readonly {
    readonly strategies: readonly string[];
    readonly accounting: {
      readonly submissions: number;
      readonly rejections: number;
      readonly byActionId: Readonly<Record<string, number>>;
    };
  }[],
): StrategyIllegalActions[] {
  const totals = new Map<
    string,
    { submissions: number; rejections: number; byActionId: Record<string, number> }
  >();

  for (const run of runs) {
    const slots = run.strategies.length;
    if (slots === 0) continue;
    for (const strategyId of run.strategies) {
      const entry = totals.get(strategyId) ?? { submissions: 0, rejections: 0, byActionId: {} };
      entry.submissions += run.accounting.submissions / slots;
      entry.rejections += run.accounting.rejections / slots;
      for (const [actionId, count] of Object.entries(run.accounting.byActionId)) {
        entry.byActionId[actionId] = (entry.byActionId[actionId] ?? 0) + count / slots;
      }
      totals.set(strategyId, entry);
    }
  }

  return [...totals.keys()].sort().map((strategyId) => {
    const entry = totals.get(strategyId) as {
      submissions: number;
      rejections: number;
      byActionId: Record<string, number>;
    };
    return {
      strategyId,
      submissions: entry.submissions,
      rejections: entry.rejections,
      rate: entry.submissions === 0 ? null : entry.rejections / entry.submissions,
      rejectionsByActionId: sortedCounts(entry.byActionId),
    };
  });
}

/* ------------------------------------------------------------------------- *
 * winRateByPrimitive — registered here, measured by task group 7
 * ------------------------------------------------------------------------- */

/**
 * §7: *"raid win rate attributed to each primitive via ablation runs"*.
 *
 * **`mechanic-absent` at 0.5.0**, and for the plainest possible reason: it is a
 * *raid* win rate, and there are no raids. Neutralizing `research-rate` in a
 * build with no combat produces no outcome that could be attributed to it.
 *
 * Everything downstream of that flag now exists: the mask in the primitive
 * stacking layer and its draw-count invariance (tasks 7.1–7.3, in
 * `@mm/primitives`), and paired-seed arm scheduling, mirrored sides, the Wilson
 * interval, `no-detected-effect` and `not-attributable` (tasks 7.4–7.8, in
 * `ablation.ts`). The order of the checks below is the order the claims get
 * weaker in, and it matters:
 *
 * 1. no raids at all — `mechanic-absent`, owned by `raid-engagement`;
 * 2. this arm is `portal`'s — `not-attributable`, whatever it produced;
 * 3. this arm scheduled no ablation — `no-observations`;
 * 4. otherwise, the Wilson-interval attribution.
 *
 * Checking `portal` *after* the mechanic flag rather than before it is
 * deliberate: on a build with no raids, "there are no raids" is the more
 * informative answer, and `not-attributable` would read as a permanent verdict
 * on a primitive when it is really a statement about the experiment.
 */
export function collectWinRateByPrimitive(arm: ArmTelemetry): MetricEntry {
  if (!arm.mechanics.raidEngagement) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, {
      owner: 'raid-engagement',
      reasonDetail:
        'winRateByPrimitive is a raid win rate and this build has no raids; the ablation ' +
        'arms can be scheduled and their seeds paired, but nothing resolves a raid to attribute.',
    });
  }
  const primitiveId = arm.ablatedPrimitiveId;
  if (primitiveId === undefined || primitiveId === null) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reasonDetail:
        'this is a control arm, or an arm that named no ablated primitive. An attribution is a ' +
        'comparison between two arms and a control arm is one half of it.',
    });
  }
  return attributionEntry(attributePrimitive(primitiveId, arm.ablationPlays ?? []));
}

/** Rebuilds a counts object with sorted keys, so details serialize canonically. */
function sortedCounts(counts: Readonly<Record<string, number>>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(counts).sort()) sorted[key] = counts[key] as number;
  return sorted;
}
