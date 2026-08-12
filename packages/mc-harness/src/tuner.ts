/*
 * Multiverse Mages — scoring a ruleset for band, variety and whether winning
 * measures play.
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
 * ## What this scores, and why a single number is not enough
 *
 * `contracts.md` §7 puts `ascensionRate` in a band of 0.05–0.20, and vision §8a
 * says the summit must be *"reachable but not routine"*. Both are statements
 * about an **aggregate**, and an aggregate is exactly what concealed the defect
 * this tuner exists to prevent recurring: a measured rate of 0.125 sat happily
 * inside the band while one strategy won ten runs out of ten and every other
 * won none. The band was green and the game had one strategy.
 *
 * So the score here is a band gate **plus** three things the band cannot see:
 *
 * - **variety** — are the wins spread across strategies, or concentrated?
 * - **correlation** — do the strategies that win know more magic than the ones
 *   that do not? If winning does not correlate with play, the win condition is
 *   a button and the ruleset is decoration.
 * - **exploit** — is the idle-then-declare probe beating the deliberate
 *   strategies? That probe is `uniform-random-legal`, which submits a legal
 *   action uniformly and therefore presses the declare button on average once
 *   every sixteen rounds while doing nothing else. If it out-performs the
 *   strategies that are trying, the summit is reachable without playing.
 *
 * A candidate that fails the band is scored below every candidate that passes
 * it, by construction, so the search reaches the band first and only then
 * optimises inside it. Within the band the three terms trade off, and their
 * weights are arguments rather than constants — the balance between them is a
 * design decision and hard-coding one would make this tool's opinion invisible.
 */

/** One strategy's outcome over a sweep's runs. */
export interface StrategyOutcome {
  readonly strategyId: string;
  readonly ascended: number;
  readonly runs: number;
  /** Mean nodes known at run end. The play proxy the correlation term uses. */
  readonly meanNodesKnown: number;
}

/** How the three in-band terms are weighted against each other. */
export interface ScoreWeights {
  readonly variety: number;
  readonly correlation: number;
  readonly exploit: number;
}

/** The §7 band, as a pair rather than as two literals scattered about. */
export interface Band {
  readonly min: number;
  readonly max: number;
}

/** A scored candidate, with every term kept so a report can explain the number. */
export interface BalanceScore {
  readonly ascensionRate: number;
  readonly inBand: boolean;
  /** Normalised Shannon entropy of win share across strategies, 0..1. */
  readonly variety: number;
  /** Pearson r between per-strategy ascension rate and mean nodes known, -1..1. */
  readonly correlation: number;
  /** Positive when the idle-then-declare probe is beaten by the pool mean. */
  readonly exploitMargin: number;
  /** Largest single strategy's share of all wins, 0..1. */
  readonly topShare: number;
  readonly score: number;
  /** Human-readable reasons, in the order they were applied. */
  readonly notes: readonly string[];
}

/**
 * The strategy that stands in for "idle until eligible, then press the button".
 *
 * Not `passive-control`: since the ascension stance landed, its stance is
 * `never`, so "passive-control does not win" is true by construction and
 * measures nothing. `uniform-random-legal` is the honest probe — it plays no
 * strategy at all and presses every button, so if the summit is reachable
 * without playing, it is the one that finds out.
 */
export const EXPLOIT_PROBE = 'uniform-random-legal';

/** Penalty applied per unit of distance outside the band. Steep on purpose. */
const OUT_OF_BAND_PENALTY = 1000;

/**
 * How much worse "nobody can win" is than merely missing the band.
 *
 * Large rather than merely larger: the search must never trade its way toward
 * an unwinnable ruleset, and no finite relative distance should be able to
 * reach this.
 */
const UNWINNABLE_MULTIPLIER = 100;

/** Share of all wins above which one strategy is "dominant". */
export const DOMINANCE_LIMIT = 0.6;

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * Pearson correlation. Returns 0 when either side has no variance, which is the
 * honest answer: "no relationship is detectable", not "they are unrelated".
 */
export function correlationOf(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = (xs[index] as number) - mx;
    const dy = (ys[index] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Normalised Shannon entropy of the win distribution, 0..1.
 *
 * 1 when every strategy wins equally often, 0 when one strategy takes every
 * win. Normalised by `log(k)` over the **whole pool**, not over the strategies
 * that happened to win, so that a ruleset in which six of eight strategies
 * never win cannot score a perfect variety by spreading wins evenly across the
 * remaining two.
 */
export function varietyOf(outcomes: readonly StrategyOutcome[]): number {
  const totalWins = outcomes.reduce((sum, entry) => sum + entry.ascended, 0);
  if (totalWins === 0 || outcomes.length < 2) return 0;
  let entropy = 0;
  for (const entry of outcomes) {
    if (entry.ascended === 0) continue;
    const share = entry.ascended / totalWins;
    entropy -= share * Math.log(share);
  }
  return entropy / Math.log(outcomes.length);
}

/**
 * Scores one candidate ruleset from a sweep's per-strategy outcomes.
 *
 * The band gate dominates: any candidate outside the band scores below any
 * candidate inside it, however varied it is. That ordering is deliberate. A
 * ruleset where everybody ascends is varied and is not a game.
 */
export function scoreBalance(
  outcomes: readonly StrategyOutcome[],
  weights: ScoreWeights,
  band: Band,
): BalanceScore {
  const notes: string[] = [];
  const runs = outcomes.reduce((sum, entry) => sum + entry.runs, 0);
  const wins = outcomes.reduce((sum, entry) => sum + entry.ascended, 0);
  const ascensionRate = runs === 0 ? 0 : wins / runs;

  const inBand = ascensionRate >= band.min && ascensionRate <= band.max;
  // Distance is *relative* to the edge it missed, not absolute. An absolute
  // distance makes the band's own asymmetry into a preference: the floor is
  // 0.05 and the ceiling 0.20, so a ruleset nobody can win sits 0.05 from the
  // band while one where 46% win sits 0.26 from it, and an absolute measure
  // ranks the unwinnable game higher. The first search run did exactly that and
  // converged on ascensionRate 0.000. Relative distance makes "ten times too
  // hard" and "ten times too easy" comparable, which is what the band means.
  const distance = inBand
    ? 0
    : ascensionRate < band.min
      ? (band.min - ascensionRate) / band.min
      : (ascensionRate - band.max) / band.max;

  const variety = varietyOf(outcomes);
  const rates = outcomes.map((entry) => (entry.runs === 0 ? 0 : entry.ascended / entry.runs));
  const correlation = correlationOf(
    rates,
    outcomes.map((entry) => entry.meanNodesKnown),
  );

  const topShare = wins === 0 ? 0 : Math.max(...outcomes.map((entry) => entry.ascended)) / wins;

  const probe = outcomes.find((entry) => entry.strategyId === EXPLOIT_PROBE);
  const probeRate = probe === undefined || probe.runs === 0 ? 0 : probe.ascended / probe.runs;
  const poolMean = mean(rates);
  // Positive when the pool out-performs the probe, which is the direction that
  // says "playing beats not playing".
  const exploitMargin = poolMean - probeRate;

  if (wins === 0) {
    // Unwinnable, and therefore not a candidate at all. Ranked below every
    // out-of-band ruleset rather than merely below the in-band ones, because
    // variety and correlation are not "zero" here — they are undefined, and a
    // search that treats an undefined objective as a low score will walk
    // straight into it. Vision §8a: "if almost none do, the meta-game never
    // starts."
    notes.push(
      'no run ascended: the ruleset is unwinnable, which ranks below every ' +
        'out-of-band candidate rather than merely below the in-band ones.',
    );
    return {
      ascensionRate,
      inBand: false,
      variety,
      correlation,
      exploitMargin,
      topShare,
      score: -OUT_OF_BAND_PENALTY * UNWINNABLE_MULTIPLIER,
      notes,
    };
  }

  if (!inBand) {
    notes.push(
      `ascensionRate ${ascensionRate.toFixed(3)} is outside the ${band.min}-${band.max} band by ` +
        `${(distance * 100).toFixed(0)}% of the edge it missed; every in-band candidate ` +
        'outranks this one.',
    );
    return {
      ascensionRate,
      inBand,
      variety,
      correlation,
      exploitMargin,
      topShare,
      score: -OUT_OF_BAND_PENALTY * (1 + distance),
      notes,
    };
  }

  notes.push(`ascensionRate ${ascensionRate.toFixed(3)} is in band.`);
  if (topShare > DOMINANCE_LIMIT) {
    notes.push(
      `one strategy holds ${(topShare * 100).toFixed(0)}% of wins, above the ` +
        `${(DOMINANCE_LIMIT * 100).toFixed(0)}% dominance limit.`,
    );
  }
  if (exploitMargin <= 0) {
    notes.push(
      `${EXPLOIT_PROBE} wins at ${probeRate.toFixed(3)} against a pool mean of ` +
        `${poolMean.toFixed(3)}: the summit is still reachable without playing.`,
    );
  }
  if (correlation <= 0) {
    notes.push(
      `correlation between winning and knowing magic is ${correlation.toFixed(2)}: ` +
        'winning does not measure play.',
    );
  }

  const dominancePenalty = topShare > DOMINANCE_LIMIT ? topShare - DOMINANCE_LIMIT : 0;
  const score =
    weights.variety * variety +
    weights.correlation * correlation +
    weights.exploit * exploitMargin -
    dominancePenalty;

  return { ascensionRate, inBand, variety, correlation, exploitMargin, topShare, score, notes };
}

/** One axis of the search: a constant, and the values it may take. */
export interface TuningAxis {
  readonly constantId: string;
  readonly levels: readonly number[];
}

/**
 * Coordinate descent over the axes, one pass at a time.
 *
 * Yields the candidate vectors to evaluate for one sweep of one axis, given the
 * best vector found so far. Kept pure and separate from anything that runs a
 * simulation so that the search order is testable without a sweep — the
 * property that matters, that every level of every axis is visited and the
 * incumbent is never re-evaluated, is a statement about this function alone.
 */
export function candidatesForAxis(
  incumbent: Readonly<Record<string, number>>,
  axis: TuningAxis,
): Array<Record<string, number>> {
  const out: Array<Record<string, number>> = [];
  for (const level of axis.levels) {
    if (incumbent[axis.constantId] === level) continue;
    out.push({ ...incumbent, [axis.constantId]: level });
  }
  return out;
}
