/*
 * Multiverse Mages — how far a species-separation claim moves when the seeds
 * are re-rolled, and how many standard errors a claimed gap is worth.
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
 * `mages-and-species` task 9.9 asks that species *"differ by more than the
 * observed cross-seed spread."* Everything this project has ever published
 * about that has reported the first half and not the second, and it has cost
 * two wrong findings.
 *
 * ## The two failures this file exists to prevent
 *
 * **The first was caught.** A claim that orc had separated from a fast trio was
 * read off one six-seed interval, `[32, 51]`. Re-rolling the six seeds moved it
 * to `[25, 40]` and it folded back in. The mechanism behind the claim was real;
 * the *separation* was inside the spread between one set of six seeds and
 * another set of six seeds.
 *
 * **The second was not caught, because nothing could catch it.** A later claim
 * that four species form a strict chain was measured the same way — one set of
 * six seeds, point estimates that happen not to cross — and there was no
 * instrument that could say whether a re-roll would erase it.
 *
 * A strict ordering is exactly the statistic most likely to look clean by
 * chance: it asks only that intervals not overlap, and it gets easier the fewer
 * seeds you take. **A balance claim that a re-roll can erase is not a claim.**
 *
 * ## What is measured, and why it is a set of sets
 *
 * `reference-time-to-tier.test.ts` takes one fixed list of six seeds and reports
 * `[min, max]` per species. That statistic has no standard error — a range is
 * not a mean — and it is not even stable in *n*: adding seeds can only widen it,
 * so a wider seed list makes non-overlap strictly harder and a narrower one
 * makes it strictly easier. Two honest measurements at different *n* are not
 * comparable, and the published numbers are all at n = 6.
 *
 * So this measures **K independent seed sets of N seeds each**, holding N at the
 * six the published claims were taken at, and varying the thing that actually
 * moved between #127's two readings: which six seeds. That yields, per species,
 * K observations of a set-level statistic, which *does* have a spread.
 *
 * Three numbers come out of it, and each answers a different question:
 *
 * 1. **Reproduction rate.** In how many of the K sets does the claimed strict
 *    ordering hold, judged exactly as the published claim judges it — six-seed
 *    intervals that do not overlap? This is the statistic that vanished under
 *    re-roll in #127, and it makes no distributional assumption at all.
 * 2. **Paired standard errors.** Both species of a pair are measured *inside the
 *    same run*, so the comparison is paired and common random numbers apply.
 *    Per set, take `d = mean(slower) − mean(faster)`; across sets, `mean(d)` and
 *    `sd(d)/√K`. The ratio is how many standard errors the pair separates by.
 *    Pairing is not a nicety here: the between-set variation is largely a
 *    property of the seed set, shared by every species in it, and differencing
 *    inside a set removes it.
 * 3. **Endpoint travel.** How far each species' six-seed `[min, max]` endpoints
 *    move across sets, in ticks. This is the number a reader needs in order to
 *    look at a published gap and know whether it means anything: a claimed gap
 *    of one tick against endpoint travel of eleven is noise wearing a decimal
 *    point.
 *
 * ## Why the seeds come from `deriveRunSeed` and not from a scheme invented here
 *
 * `mc-harness`'s derivation is the project's answer to "where does a run seed
 * come from", it is versioned, and it is what every committed baseline is taken
 * under. Re-rolling seeds is, in its vocabulary, **re-running the same sweep at
 * a different root seed** — so a seed set here is one `rootSeed`, and the sets
 * differ in nothing else. `deriveRunSeed`'s base is `mix32(rootSeed, …)`, a full
 * avalanche, so distinct root seeds give uncorrelated sets; within a set the run
 * seeds are a fixed stride apart and `sim-core`'s `deriveStream` decorrelates
 * them, which is the same delegation `seed.ts` documents and relies on.
 *
 * The root seeds themselves are derived the same way from one base constant, so
 * the whole design is a pure function of {@link SEPARATION_BASE_SEED} and
 * reproduces exactly.
 *
 * ## What this file deliberately does not do
 *
 * It does not tune anything, it does not touch a `balance/` baseline, and it
 * does not rewrite the assertions in `reference-time-to-tier.test.ts`. It
 * reports. Where a separation those assertions record turns out to be inside the
 * spread, that is a finding to publish, not a test to edit.
 */

import { deriveRunSeed } from '@mm/mc-harness';

import type { ReferenceContent } from './reference-universe.js';
import { referenceContent } from './reference-universe.js';
import type { LongRunResult } from './long-run.js';
import { runLongReference, timeToTierBySpecies } from './long-run.js';

/**
 * The base constant every root seed and every run seed below descends from.
 *
 * Arbitrary, and fixed forever: changing it is not a refactor, it is a new
 * experiment, and any number published from this file is a number about this
 * constant.
 */
export const SEPARATION_BASE_SEED = 0x0099_0001;

/** The `sweepId` the per-set root seeds are derived under. */
export const SEPARATION_ROOT_SWEEP_ID = 'species-separation:roots';

/** The `sweepId` the runs inside a set are derived under. */
export const SEPARATION_RUN_SWEEP_ID = 'species-separation:runs';

/**
 * Seeds per set, held at the six every published claim was taken at.
 *
 * **Do not raise this to "get more power".** The published statistic is
 * non-overlap of `[min, max]` over six seeds, and a range only grows with *n* —
 * so measuring at twelve would refute a six-seed claim for the wrong reason.
 * More data means more *sets*, never more seeds per set.
 */
export const SEEDS_PER_SET = 6;

/** Sets taken when a caller does not say. Twelve is about six minutes of runs. */
export const DEFAULT_SET_COUNT = 12;

/** The horizon every published time-to-tier reading was taken at: sixty years. */
export const SEPARATION_HORIZON_TICKS = 720;

/**
 * The seed list `reference-time-to-tier.test.ts` has always used, exported so
 * that a reader can check this instrument reproduces the published numbers
 * before believing anything else it says.
 *
 * It is one seed set among many, and it is not privileged — it is the *first*
 * one anybody happened to write down.
 */
export const LEGACY_SEED_SET: readonly number[] = Object.freeze([
  0x0009_0001, 0x0009_0002, 0x0009_0003, 0x0009_0004, 0x0009_0005, 0x0009_0006,
]);

/**
 * Standard errors a paired gap must clear before a separation is called
 * established.
 *
 * Three, not two. A two-sided 95 % interval at eleven degrees of freedom wants
 * about 2.2, and the extra margin is deliberate slack for the fact that this is
 * being asked of several pairs at once — six pairs at 5 % each is a one-in-four
 * chance that *something* looks separated. Anybody who wants the nominal
 * interval instead can read `standardErrors` off the report and judge for
 * themselves; the field is reported, not just the verdict.
 */
export const ESTABLISHED_STANDARD_ERRORS = 3;

/**
 * Standard errors a gap must clear **in the wrong direction** before a claimed
 * ordering is called refuted rather than merely unproven.
 *
 * Two, and lower than the bar for establishing, on purpose: the cost of leaving
 * a false ordering in the release notes is higher than the cost of saying "not
 * shown" about a true one.
 */
export const REFUTED_STANDARD_ERRORS = 2;

/**
 * Sets a design must carry before *"it never separated"* is allowed to refute a
 * claim rather than merely fail to support it.
 *
 * Four. Two sets that both overlap is exactly the evidence #127 had in the other
 * direction, and calling that a refutation would be repeating the mistake with
 * the sign flipped.
 */
export const MIN_SETS_FOR_REFUTATION = 4;

/**
 * The share of seed sets a claimed **chain** may hold in and still be called
 * refuted rather than merely unproven.
 *
 * A chain claim is a conjunction — *"these four separate"* — and a conjunction
 * can fail without any single link failing outright. #140's chain holds in one
 * of twelve independent seed sets while none of its three links is individually
 * refutable, and "inconclusive" would be a generous word for that. A quarter is
 * the line: a claim that survives a re-roll less often than one time in four is
 * a claim the re-roll has answered.
 */
export const CHAIN_REFUTED_FRACTION = 0.25;

/** One species' arrivals inside one seed set. */
export interface SpeciesSetSample {
  /** The species' content id, as `LongRunResult.speciesIds` orders them. */
  readonly speciesId: string;
  /** Arrival ticks, ascending by run, with censored runs dropped. */
  readonly observed: readonly number[];
  /** Runs in which the species never reached the tier inside the horizon. */
  readonly censored: number;
  /** `min(observed)`, absent when every run censored. */
  readonly low?: number;
  /** `max(observed)`, absent when every run censored. */
  readonly high?: number;
  /** Arithmetic mean of `observed`, absent when every run censored. */
  readonly mean?: number;
}

/** Everything one seed set produced. */
export interface SeedSetSample {
  /** A label a reader can find in the output. `set 0`, or `legacy`. */
  readonly label: string;
  /** The run seeds, in the order they were run. */
  readonly runSeeds: readonly number[];
  /** One entry per species, in `LongRunResult.speciesIds` order. */
  readonly species: readonly SpeciesSetSample[];
}

/** How one species' set-level statistic moves across seed sets. */
export interface SpeciesSpread {
  readonly speciesId: string;
  /** The per-set mean arrival, `undefined` for a set that censored it wholly. */
  readonly setMeans: readonly (number | undefined)[];
  /** Sets that contributed a mean. */
  readonly setsMeasured: number;
  /** Mean of the set means. `NaN` when no set contributed one. */
  readonly grandMean: number;
  /** Sample standard deviation of the set means, `NaN` below two sets. */
  readonly betweenSetSd: number;
  /** `betweenSetSd / √setsMeasured`. The spread on the published point estimate. */
  readonly standardError: number;
  /**
   * How far the six-seed `[min, max]` endpoints travel across sets, in ticks —
   * `max(low) − min(low)` and `max(high) − min(high)`.
   *
   * This is the number a published interval should be read against. #127's orc
   * moved its endpoints 7 and 11 ticks between two seed sets, and the claim it
   * carried was smaller than that.
   */
  readonly lowTravel: number;
  /** See {@link lowTravel}. */
  readonly highTravel: number;
  /** The narrowest and widest six-seed intervals seen, for the same reason. */
  readonly narrowestInterval?: readonly [number, number];
  /** See {@link narrowestInterval}. */
  readonly widestInterval?: readonly [number, number];
  /** Runs censored across every set. */
  readonly censored: number;
}

/** Whether one ordered pair separates, and by how much. */
export interface PairSeparation {
  /** The species claimed to arrive first. */
  readonly faster: string;
  /** The species claimed to arrive after it. */
  readonly slower: string;
  /**
   * Sets in which `faster.high < slower.low` — the published claim's own test,
   * applied to each set's own six seeds.
   */
  readonly strictSets: number;
  /** Sets in which both species were measurable at all. */
  readonly comparableSets: number;
  /** Per-set `slower.mean − faster.mean`, the paired difference. */
  readonly setGaps: readonly number[];
  /** Mean paired gap in ticks. Negative means the claimed order is backwards. */
  readonly meanGap: number;
  /** `sd(setGaps) / √comparableSets`. Zero when the gap never varied. */
  readonly gapStandardError: number;
  /**
   * `meanGap / gapStandardError`, the headline "separates by how many standard
   * errors". `Infinity` when the gap is positive and never varied, `-Infinity`
   * when it is negative and never varied, `NaN` when there is nothing to divide.
   */
  readonly standardErrors: number;
  /** Smallest and largest per-set endpoint gap, `slower.low − faster.high`. */
  readonly minEndpointGap: number;
  /** See {@link minEndpointGap}. A negative value is an overlap. */
  readonly maxEndpointGap: number;
}

/** What a claimed ordering is worth. */
export type SeparationVerdict = 'established' | 'refuted' | 'inconclusive';

/** A claimed strict ordering of three or more species, judged. */
export interface ChainVerdict {
  /** The ordering as claimed, fastest first. */
  readonly chain: readonly string[];
  /** Each adjacent link. */
  readonly links: readonly PairSeparation[];
  /** Sets in which **every** link separated strictly. */
  readonly setsHolding: number;
  /** Sets in which every member was measurable. */
  readonly comparableSets: number;
  /** See {@link SeparationVerdict} and {@link verdictOf}. */
  readonly verdict: SeparationVerdict;
  /** Why, in one sentence, so a reader never has to re-derive the rule. */
  readonly reason: string;
}

/** Everything a measurement run produced. */
export interface SeparationReport {
  /** The tier arrivals were measured at. */
  readonly tier: number;
  /** The horizon each run was given, in world ticks. */
  readonly ticks: number;
  /** Seeds per set. See {@link SEEDS_PER_SET}. */
  readonly seedsPerSet: number;
  /** Species ids, in the order every per-species array is indexed. */
  readonly speciesIds: readonly string[];
  /** The derived sets, in order. Does not include any calibration set. */
  readonly sets: readonly SeedSetSample[];
  /** One entry per species, in `speciesIds` order. */
  readonly spreads: readonly SpeciesSpread[];
  /** Runs executed. `sets.length * seedsPerSet`. */
  readonly runCount: number;
}

/** Sample standard deviation. `NaN` below two values, which is the honest answer. */
function sampleSd(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sumSquares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The root seed of set `index`, derived from {@link SEPARATION_BASE_SEED}.
 *
 * A set is a re-roll of the seeds, and a re-roll in `mc-harness`'s vocabulary is
 * a different root seed for the same sweep — so the sets differ in the one
 * coordinate that goes through `mix32`'s full avalanche and in nothing else.
 */
export function separationRootSeed(index: number): number {
  return deriveRunSeed({
    rootSeed: SEPARATION_BASE_SEED,
    sweepId: SEPARATION_ROOT_SWEEP_ID,
    cellIndex: 0,
    replicateIndex: index,
  });
}

/** The `seedsPerSet` run seeds belonging to one root seed. */
export function separationRunSeeds(rootSeed: number, seedsPerSet = SEEDS_PER_SET): readonly number[] {
  return Object.freeze(
    Array.from({ length: seedsPerSet }, (_unused, replicateIndex) =>
      deriveRunSeed({
        rootSeed,
        sweepId: SEPARATION_RUN_SWEEP_ID,
        cellIndex: 0,
        replicateIndex,
      }),
    ),
  );
}

/**
 * Species names in the order every per-species array here is indexed.
 *
 * `LongRunResult.speciesIds` carries the numeric `ContentId`s in the same order,
 * and a numeric id is unreadable in a report a human has to judge a claim from —
 * so the names come off the registry records at the same indices.
 * `timeToTierBySpecies` is indexed by `speciesId - 1` and the registry assigns
 * content ids `1..n` in its own order, so index *i* here is index *i* there.
 */
export function separationSpeciesIds(content: ReferenceContent): readonly string[] {
  return Object.freeze(content.registry.species.map((entry) => entry.record.id));
}

/** What {@link measureSeedSet} needs. */
export interface SeedSetInput {
  readonly label: string;
  readonly runSeeds: readonly number[];
  readonly tier: number;
  readonly ticks?: number;
  readonly content?: ReferenceContent;
  /** Called after each run, so a long measurement can say where it is. */
  readonly onRun?: (runSeed: number, index: number, total: number) => void;
}

/**
 * Runs one seed set and reduces it to per-species arrivals.
 *
 * The runs go through {@link runLongReference} with its default options, at the
 * horizon the published readings were taken at, and read
 * {@link timeToTierBySpecies}. Nothing here is a second path to the number: it
 * is the same call `reference-time-to-tier.test.ts` makes, made K times as often.
 */
export async function measureSeedSet(input: SeedSetInput): Promise<SeedSetSample> {
  const content = input.content ?? referenceContent();
  const ticks = input.ticks ?? SEPARATION_HORIZON_TICKS;

  const speciesIds = separationSpeciesIds(content);
  const columns: (number | undefined)[][] = [];

  for (const [index, runSeed] of input.runSeeds.entries()) {
    const result: LongRunResult = await runLongReference({ runSeed, ticks, content });
    columns.push([...timeToTierBySpecies(result, input.tier)]);
    input.onRun?.(runSeed, index, input.runSeeds.length);
  }

  const species = speciesIds.map((speciesId, index) => {
    const column = columns.map((row) => row[index]);
    const observed = column.filter((value): value is number => value !== undefined);
    return Object.freeze({
      speciesId,
      observed: Object.freeze(observed),
      censored: column.length - observed.length,
      ...(observed.length > 0
        ? { low: Math.min(...observed), high: Math.max(...observed), mean: mean(observed) }
        : {}),
    }) satisfies SpeciesSetSample;
  });

  return Object.freeze({
    label: input.label,
    runSeeds: Object.freeze([...input.runSeeds]),
    species: Object.freeze(species),
  });
}

/** What {@link measureSpeciesSeparation} may be told. */
export interface SeparationInput {
  /** Tier arrivals are measured at. Tier 3 is the tier `species-traits` names. */
  readonly tier?: number;
  /** Independent seed sets. See {@link DEFAULT_SET_COUNT}. */
  readonly sets?: number;
  /** Seeds per set. See {@link SEEDS_PER_SET} before raising it. */
  readonly seedsPerSet?: number;
  readonly ticks?: number;
  readonly content?: ReferenceContent;
  /** Called after each set, so a long measurement can say where it is. */
  readonly onSet?: (sample: SeedSetSample, index: number, total: number) => void;
}

/** Reduces the per-set samples of one species to its cross-set spread. */
function spreadOf(speciesId: string, sets: readonly SeedSetSample[]): SpeciesSpread {
  const samples = sets.map(
    (set) => set.species.find((entry) => entry.speciesId === speciesId),
  );
  const setMeans = samples.map((sample) => sample?.mean);
  const measured = setMeans.filter((value): value is number => value !== undefined);
  const lows = samples
    .map((sample) => sample?.low)
    .filter((value): value is number => value !== undefined);
  const highs = samples
    .map((sample) => sample?.high)
    .filter((value): value is number => value !== undefined);
  const intervals = samples
    .filter((sample): sample is SpeciesSetSample => sample?.low !== undefined)
    .map((sample) => [sample.low as number, sample.high as number] as const);
  const widths = intervals.map(([low, high]) => high - low);
  const narrowest = widths.length === 0 ? undefined : intervals[widths.indexOf(Math.min(...widths))];
  const widest = widths.length === 0 ? undefined : intervals[widths.indexOf(Math.max(...widths))];
  const sd = sampleSd(measured);

  return Object.freeze({
    speciesId,
    setMeans: Object.freeze(setMeans),
    setsMeasured: measured.length,
    grandMean: mean(measured),
    betweenSetSd: sd,
    standardError: Number.isNaN(sd) ? Number.NaN : sd / Math.sqrt(measured.length),
    lowTravel: lows.length === 0 ? Number.NaN : Math.max(...lows) - Math.min(...lows),
    highTravel: highs.length === 0 ? Number.NaN : Math.max(...highs) - Math.min(...highs),
    ...(narrowest === undefined ? {} : { narrowestInterval: narrowest }),
    ...(widest === undefined ? {} : { widestInterval: widest }),
    censored: samples.reduce((sum, sample) => sum + (sample?.censored ?? 0), 0),
  });
}

/**
 * Runs `sets × seedsPerSet` reference universes and reports the spread.
 *
 * Serial on purpose. A run is about three seconds and the default design is
 * seventy-two of them; a worker pool would buy six minutes back at the cost of
 * making a measurement about seed sets depend on a scheduler, which is the
 * defect `seed.ts` exists to avoid one layer up.
 */
export async function measureSpeciesSeparation(
  input: SeparationInput = {},
): Promise<SeparationReport> {
  const tier = input.tier ?? 3;
  const setCount = input.sets ?? DEFAULT_SET_COUNT;
  const seedsPerSet = input.seedsPerSet ?? SEEDS_PER_SET;
  const ticks = input.ticks ?? SEPARATION_HORIZON_TICKS;
  const content = input.content ?? referenceContent();

  const sets: SeedSetSample[] = [];
  for (let index = 0; index < setCount; index += 1) {
    const rootSeed = separationRootSeed(index);
    const sample = await measureSeedSet({
      label: `set ${String(index)} (root 0x${rootSeed.toString(16).padStart(8, '0')})`,
      runSeeds: separationRunSeeds(rootSeed, seedsPerSet),
      tier,
      ticks,
      content,
    });
    sets.push(sample);
    input.onSet?.(sample, index, setCount);
  }

  const speciesIds = sets[0]?.species.map((entry) => entry.speciesId) ?? [];

  return Object.freeze({
    tier,
    ticks,
    seedsPerSet,
    speciesIds: Object.freeze(speciesIds),
    sets: Object.freeze(sets),
    spreads: Object.freeze(speciesIds.map((speciesId) => spreadOf(speciesId, sets))),
    runCount: sets.length * seedsPerSet,
  });
}

/** Looks one species' entry up inside one set. */
function sampleIn(set: SeedSetSample, speciesId: string): SpeciesSetSample | undefined {
  return set.species.find((entry) => entry.speciesId === speciesId);
}

/**
 * Judges one ordered pair: does `faster` arrive before `slower`, and by how
 * many standard errors?
 *
 * The difference is taken **inside a set** before it is averaged across sets.
 * Both species come out of the same universe, so the pair shares whatever that
 * seed set happened to be like, and differencing first removes it. Doing it the
 * other way — two independent means, two independent standard errors — throws
 * that away and reports a spread several times too wide.
 */
export function separationOf(
  report: SeparationReport,
  faster: string,
  slower: string,
): PairSeparation {
  const setGaps: number[] = [];
  const endpointGaps: number[] = [];
  let strictSets = 0;

  for (const set of report.sets) {
    const left = sampleIn(set, faster);
    const right = sampleIn(set, slower);
    if (left?.mean === undefined || right?.mean === undefined) continue;
    setGaps.push(right.mean - left.mean);
    endpointGaps.push((right.low as number) - (left.high as number));
    if ((left.high as number) < (right.low as number)) strictSets += 1;
  }

  const gapMean = mean(setGaps);
  const sd = sampleSd(setGaps);
  const standardError = Number.isNaN(sd) ? Number.NaN : sd / Math.sqrt(setGaps.length);
  const standardErrors =
    standardError > 0
      ? gapMean / standardError
      : standardError === 0
        ? gapMean === 0
          ? Number.NaN
          : gapMean > 0
            ? Number.POSITIVE_INFINITY
            : Number.NEGATIVE_INFINITY
        : Number.NaN;

  return Object.freeze({
    faster,
    slower,
    strictSets,
    comparableSets: setGaps.length,
    setGaps: Object.freeze(setGaps),
    meanGap: gapMean,
    gapStandardError: standardError,
    standardErrors,
    minEndpointGap: endpointGaps.length === 0 ? Number.NaN : Math.min(...endpointGaps),
    maxEndpointGap: endpointGaps.length === 0 ? Number.NaN : Math.max(...endpointGaps),
  });
}

/**
 * The rule, in one place, so that no caller invents its own.
 *
 * - **established** — the ordering holds strictly in *every* seed set, judged by
 *   the published claim's own six-seed non-overlap test, **and** the paired gap
 *   clears {@link ESTABLISHED_STANDARD_ERRORS}. Both halves are required: a gap
 *   can be many standard errors wide and still overlap in every set if the
 *   within-set spread is large, and intervals can fail to overlap in six sets by
 *   luck if the gap is one tick.
 * - **refuted** — the paired gap runs the *wrong way* by more than
 *   {@link REFUTED_STANDARD_ERRORS}, or the ordering separates strictly in no set
 *   at all. Either is a positive statement that the claim is false, not an
 *   absence of evidence.
 * - **inconclusive** — everything else, which is where "held in five of six sets"
 *   lands, and where it belongs.
 */
export function verdictOf(pair: PairSeparation): { verdict: SeparationVerdict; reason: string } {
  const ses = pair.standardErrors;
  const rate = `${String(pair.strictSets)}/${String(pair.comparableSets)} sets`;
  const seText = Number.isFinite(ses) ? `${ses.toFixed(1)} SE` : `${String(ses)} SE`;

  if (pair.comparableSets === 0) {
    return { verdict: 'inconclusive', reason: 'no set measured both species' };
  }
  if (ses <= -REFUTED_STANDARD_ERRORS) {
    return {
      verdict: 'refuted',
      reason: `${pair.slower} arrives before ${pair.faster} by ${seText} — the claimed order is backwards`,
    };
  }
  if (pair.strictSets === 0 && pair.comparableSets >= MIN_SETS_FOR_REFUTATION) {
    return {
      verdict: 'refuted',
      reason: `the six-seed intervals overlap in every one of ${String(pair.comparableSets)} sets`,
    };
  }
  if (pair.strictSets === pair.comparableSets && ses >= ESTABLISHED_STANDARD_ERRORS) {
    return { verdict: 'established', reason: `strict in ${rate}, gap ${seText}` };
  }
  return {
    verdict: 'inconclusive',
    reason: `strict in ${rate}, gap ${seText} — inside the cross-seed spread`,
  };
}

/**
 * Judges a claimed strict chain — `gnome < dwarf < human < elf` and its like.
 *
 * A chain is only as good as its weakest link, and it is judged that way: the
 * chain is established when every link is, refuted when any link is, and
 * inconclusive otherwise. `setsHolding` counts sets in which *all* links held at
 * once, which is the number a reader should compare against a published "these
 * four separate" — the links are not independent and multiplying their rates
 * would be wrong.
 */
export function chainVerdictOf(report: SeparationReport, chain: readonly string[]): ChainVerdict {
  const links: PairSeparation[] = [];
  for (let index = 0; index + 1 < chain.length; index += 1) {
    links.push(separationOf(report, chain[index] as string, chain[index + 1] as string));
  }

  let comparableSets = 0;
  let setsHolding = 0;
  for (const set of report.sets) {
    const samples = chain.map((speciesId) => sampleIn(set, speciesId));
    if (samples.some((sample) => sample?.mean === undefined)) continue;
    comparableSets += 1;
    const holds = samples.every((sample, index) => {
      if (index + 1 >= samples.length) return true;
      return (sample?.high as number) < (samples[index + 1]?.low as number);
    });
    if (holds) setsHolding += 1;
  }

  const verdicts = links.map((link) => verdictOf(link));
  const weakest = verdicts.find((entry) => entry.verdict === 'refuted')
    ?? verdicts.find((entry) => entry.verdict === 'inconclusive');
  const linkVerdict: SeparationVerdict = weakest?.verdict ?? 'established';
  const failing = links.find((_link, index) => verdicts[index]?.verdict === linkVerdict);
  const linkReason =
    weakest === undefined
      ? `every link strict in all ${String(comparableSets)} sets`
      : `${String(failing?.faster)} < ${String(failing?.slower)}: ${weakest.reason}`;

  // The conjunction is judged separately from its links. See
  // {@link CHAIN_REFUTED_FRACTION}: a chain can be made of links that are each
  // merely unproven and still fail as a whole in eleven re-rolls out of twelve,
  // and calling that "inconclusive" would let the claim survive its own
  // refutation.
  const conjunctionRefuted =
    comparableSets >= MIN_SETS_FOR_REFUTATION &&
    setsHolding <= comparableSets * CHAIN_REFUTED_FRACTION;
  const verdict: SeparationVerdict = conjunctionRefuted ? 'refuted' : linkVerdict;
  const reason = conjunctionRefuted
    ? `the ${String(chain.length)}-species claim itself survives a re-roll in at most ` +
      `${String(Math.floor(comparableSets * CHAIN_REFUTED_FRACTION))} of ` +
      `${String(comparableSets)} sets; ${linkReason}`
    : linkReason;

  return Object.freeze({
    chain: Object.freeze([...chain]),
    links: Object.freeze(links),
    setsHolding,
    comparableSets,
    verdict,
    reason: `whole chain held in ${String(setsHolding)}/${String(comparableSets)} sets; ${reason}`,
  });
}

function pad(text: string, width: number): string {
  return text.padEnd(width);
}

function fixed(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

/**
 * The report as text, printed by the bin and by the guard test.
 *
 * The **full per-set matrix** is printed and not just the summary, because a
 * reader who watches an ordering wobble from set to set has understood the
 * finding, and a reader handed a standard error has been asked to trust one.
 */
export function formatSeparationReport(report: SeparationReport): readonly string[] {
  const lines: string[] = [];
  const width = Math.max(9, ...report.speciesIds.map((id) => id.length));

  lines.push(
    `tier ${String(report.tier)}, ${String(report.ticks)} ticks, ` +
      `${String(report.sets.length)} independent seed sets of ${String(report.seedsPerSet)} seeds ` +
      `(${String(report.runCount)} runs)`,
  );
  lines.push('');
  lines.push('per-set six-seed intervals — the statistic every published claim is read off:');
  lines.push(`  ${pad('set', 8)}${report.speciesIds.map((id) => pad(id, width + 2)).join('')}`);
  for (const [index, set] of report.sets.entries()) {
    const cells = report.speciesIds.map((speciesId) => {
      const sample = sampleIn(set, speciesId);
      if (sample?.low === undefined) return pad('censored', width + 2);
      const censored = sample.censored > 0 ? `*${String(sample.censored)}` : '';
      return pad(`[${String(sample.low)},${String(sample.high)}]${censored}`, width + 2);
    });
    lines.push(`  ${pad(String(index), 8)}${cells.join('')}`);
  }
  lines.push('  (* = runs censored at the horizon and dropped from that cell)');
  lines.push('');
  lines.push('cross-seed spread, per species:');
  for (const spread of report.spreads) {
    lines.push(
      `  ${pad(spread.speciesId, width)} mean ${fixed(spread.grandMean)} ` +
        `± ${fixed(spread.standardError)} SE (between-set sd ${fixed(spread.betweenSetSd)}), ` +
        `endpoints travel ${fixed(spread.lowTravel, 0)}/${fixed(spread.highTravel, 0)} ticks, ` +
        `censored ${String(spread.censored)}`,
    );
  }
  return Object.freeze(lines);
}

/** One pair rendered for a reader: the verdict, then the numbers behind it. */
export function formatPairSeparation(pair: PairSeparation): string {
  const { verdict } = verdictOf(pair);
  return (
    `${pad(`${pair.faster} < ${pair.slower}`, 22)} ${pad(verdict.toUpperCase(), 13)} ` +
    `strict in ${String(pair.strictSets)}/${String(pair.comparableSets)} sets, ` +
    `paired gap ${fixed(pair.meanGap)} ± ${fixed(pair.gapStandardError)} ticks ` +
    `= ${fixed(pair.standardErrors)} SE, ` +
    `per-set endpoint gap [${fixed(pair.minEndpointGap, 0)}, ${fixed(pair.maxEndpointGap, 0)}]`
  );
}
