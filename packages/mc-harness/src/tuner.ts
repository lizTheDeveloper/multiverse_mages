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
 * - **exploit** — are the idle probes beating the deliberate strategies? If a
 *   bot that plays nothing out-performs the bots that are trying, the summit is
 *   reachable without playing.
 *
 * A candidate that fails the band is scored below every candidate that passes
 * it, by construction, so the search reaches the band first and only then
 * optimises inside it. Within the band the three terms trade off, and their
 * weights are arguments rather than constants — the balance between them is a
 * design decision and hard-coding one would make this tool's opinion invisible.
 *
 * ## What W18 repaired, and why each repair was needed
 *
 * Adversarial verification found three of the four terms were not measuring
 * what their names claimed. Recorded here rather than in a changelog because
 * each is a way a scoring term can look informative and not be, and the shapes
 * recur.
 *
 * 1. **The exploit margin restated the band.** `poolMean` averaged the rates of
 *    *every* strategy including the probe, so with equal run counts
 *    `exploitMargin ≡ ascensionRate − probeRate` exactly — and
 *    `EXPLOIT_MARGIN_MIN` happened to equal `band.min`. Two constraints, one
 *    number: measured 0.1250 and 0.1250. Repaired by excluding every probe from
 *    the mean it is compared against, which is the only way the comparison is
 *    a comparison at all, and by moving the threshold off the band edge. See
 *    {@link EXPLOIT_MARGIN_MIN}.
 *
 * 2. **The correlation was one point against a cluster.** +0.955 over eight
 *    strategies, seven of them at rate 0. Drop the single winner and the rate
 *    vector has no variance, so Pearson is undefined. Spearman on the same data
 *    is +0.615 — *also* comfortably positive, which is the finding: **no
 *    magnitude threshold on either coefficient can separate a real relationship
 *    from a single outlier.** Only the support count can. So the term now
 *    reports Pearson, Spearman and {@link BalanceScore.nonZeroStrategies}, and
 *    contributes to the score only above {@link CORRELATION_MIN_SUPPORT}.
 *
 * 3. **The probe was one crippled bot.** `uniform-random-legal` submits actions
 *    1–7 bare and has them refused, so a margin measured against it can say
 *    "that bot is broken" rather than "playing beats not playing". Every probe
 *    the pool declares is now used and the **worst case** — the highest probe
 *    rate — is the one the pool must beat.
 *
 * Every term above is paired with a negative and a positive control in
 * `scoring-controls.ts`, and a term that cannot separate its own controls fails
 * the suite. That machinery, not this comment, is what keeps the list honest.
 *
 * ## The first reading from the repaired instrument
 *
 * The shipped constants, on the committed ascension sweep, 32 runs at 2400
 * ticks, all eight strategies covered evenly:
 *
 *     FEASIBLE score -0.2571 | rate 0.125 variety 0.000 pearson 0.96
 *     spearman 0.60 winners 1 exploit 0.143 (deliberate 0.143 vs probe 0.000)
 *     top 1.00
 *
 * Two things to read off it.
 *
 * **The exploit margin is no longer the band.** It reads 0.143 — the mean over
 * the seven non-probe strategies — where the old formula returned 0.125, the
 * `ascensionRate` exactly. One number became two, which is what W18 claimed and
 * this is the measurement of it.
 *
 * **The same ruleset that scored +0.685 now scores −0.257**, and every point of
 * the difference is the correlation term. Pearson +0.96 and Spearman +0.60 over
 * **one** winner are not evidence of anything, so the term contributes zero and
 * the note says so. `ascension-summit-cells = 13` was chosen by a search that
 * counted that +0.96 as a point in its favour — and did so on a six-strategy
 * pool. Neither is true of this reading.
 *
 * The candidate is still `FEASIBLE`, because feasibility is the band and the
 * exploit margin and both hold. It is feasible and badly scored, which is the
 * correct description of a ruleset exactly one strategy can win.
 */

/** One strategy's outcome over a sweep's runs. */
export interface StrategyOutcome {
  readonly strategyId: string;
  readonly ascended: number;
  readonly runs: number;
  /** Mean nodes known at run end. The play proxy the correlation term uses. */
  readonly meanNodesKnown: number;
}

/**
 * Why the outcomes a sweep produced do not cover the pool it declared, or
 * `undefined`.
 *
 * The spec-level guard is {@link roundRobinCoverageProblem} in `sweep-spec.ts`,
 * and it refuses before a run is dispatched. This is the **observed** check,
 * made after the records come back: a spec can validate and still lose a
 * strategy to a run that failed, a worker that died, or an executor that
 * silently declined a strategy it did not recognise. Coverage that was argued
 * for and coverage that happened are two claims, and this instrument has
 * already published a number for which only the first was true.
 *
 * Uneven coverage is refused as well as missing coverage, for the reason
 * `roundRobinCoverageProblem` gives: the run-weighted `ascensionRate` and the
 * unweighted per-strategy pool mean stop being the same quantity the moment
 * strategies get different run counts.
 */
export function coverageProblem(
  outcomes: readonly StrategyOutcome[],
  expected: readonly string[],
): string | undefined {
  const observed = new Map(outcomes.map((entry) => [entry.strategyId, entry.runs]));
  const missing = expected.filter((id) => (observed.get(id) ?? 0) === 0).sort();
  if (missing.length > 0) {
    return (
      `the sweep declared ${String(expected.length)} strategies and produced runs for ` +
      `${String(expected.length - missing.length)}: ${missing.join(', ')} never ran. Every ` +
      'statistic below normalises by the strategies that appear, so a partial pool is scored ' +
      'as if it were the whole one.'
    );
  }
  const extra = outcomes
    .map((entry) => entry.strategyId)
    .filter((id) => !expected.includes(id))
    .sort();
  if (extra.length > 0) {
    return (
      `the sweep produced runs for ${extra.join(', ')}, which the pool does not declare. An ` +
      'unexpected strategy in the fold is a record whose provenance nobody can state.'
    );
  }
  const counts = [...new Set(expected.map((id) => observed.get(id) ?? 0))];
  if (counts.length > 1) {
    const detail = expected
      .map((id) => `${id}=${String(observed.get(id) ?? 0)}`)
      .sort()
      .join(' ');
    return (
      'the pool is covered but unevenly, so the run-weighted ascension rate and the unweighted ' +
      `per-strategy pool mean measure different things: ${detail}.`
    );
  }
  return undefined;
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
  /**
   * Pearson r between per-strategy ascension rate and mean nodes known, -1..1.
   *
   * Read it beside {@link BalanceScore.spearman} and
   * {@link BalanceScore.nonZeroStrategies} or not at all: the historical +0.955
   * was one winner and seven ties, and Pearson cannot tell that apart from
   * eight strategies on a line.
   */
  readonly correlation: number;
  /**
   * Spearman rank correlation over the same two vectors, with average ranks for
   * ties.
   *
   * Reported because it is the coefficient that does not assume linearity, and
   * because the gap between the two is itself readable — a large Pearson beside
   * a small Spearman is a single leveraged point.
   */
  readonly spearman: number;
  /**
   * How many strategies ascended at all.
   *
   * The support behind both coefficients, and the only number in this record
   * that can distinguish "a relationship" from "an outlier". Below
   * {@link CORRELATION_MIN_SUPPORT} the correlation term contributes nothing to
   * `score`, whatever the coefficients read.
   */
  readonly nonZeroStrategies: number;
  /**
   * Mean ascension rate over the **non-probe** strategies, minus the highest
   * probe rate.
   *
   * The probes are excluded from the mean. Including them made this quantity
   * identically `ascensionRate − probeRate`, so a candidate passed two
   * constraints by satisfying one. See {@link EXPLOIT_PROBES}.
   *
   * `NaN` when the pool declares no probe at all, and a pool with no probe is
   * infeasible rather than exploit-free — a measurement nobody took is not a
   * measurement that passed.
   */
  readonly exploitMargin: number;
  /** The highest rate any declared probe achieved, or `NaN` when none ran. */
  readonly probeRate: number;
  /** Mean rate over the non-probe strategies. The thing the probes are compared to. */
  readonly deliberateMean: number;
  /**
   * Whether every hard constraint holds: winnable, in band, and the probes
   * beaten by at least {@link EXPLOIT_MARGIN_MIN}.
   *
   * Separate from `score` because the band and the exploit are **constraints,
   * not preferences**. A weighted penalty lets a candidate buy its way out of
   * the band with variety, which is how the first version of this scorer came
   * to prefer a ruleset nobody could win. Feasibility is checked first and a
   * feasible candidate beats every infeasible one regardless of score.
   */
  readonly feasible: boolean;
  /** Largest single strategy's share of all wins, 0..1. */
  readonly topShare: number;
  readonly score: number;
  /** Human-readable reasons, in the order they were applied. */
  readonly notes: readonly string[];
}

/**
 * The strategies that stand in for "do not play, and take the summit anyway".
 *
 * Not `passive-control`: its stance is `never`, so "passive-control does not
 * win" is true by construction and measures nothing.
 *
 * Three rather than one, and the pool must beat the **worst** of them:
 *
 * - `uniform-random-legal` is the noise floor, but it is a *crippled* probe
 *   rather than an idle one — it submits actions 1–7 bare and `CANDIDATE_SLOTS`
 *   covers only 8–14, so those submissions are refused. A margin measured
 *   against it alone can say "this bot is broken" rather than "playing beats
 *   not playing".
 * - `idle-then-declare` plays nothing at all and declares on the first legal
 *   round. Its rate *is* the rate at which the summit is reachable without
 *   playing.
 * - `permit-then-idle` permits the grid for 140 of 2400 ticks and then submits
 *   nothing for the remaining 2260. It measured 12/12 and 231 nodes — the best
 *   strategy's profile — which is why "the god permitted an axis" is not by
 *   itself an achievement. A scorer blind to it reports a win condition that
 *   reads the ruleset rather than the play.
 *
 * A pool naming none of these has no exploit measurement, and
 * {@link scoreBalance} says so rather than scoring 0.
 */
export const EXPLOIT_PROBES: readonly string[] = Object.freeze([
  'uniform-random-legal',
  'idle-then-declare',
  'permit-then-idle',
]);

/**
 * The first entry of {@link EXPLOIT_PROBES}, kept so callers that named one
 * probe still compile.
 *
 * @deprecated Read {@link EXPLOIT_PROBES}. One probe was the defect.
 */
export const EXPLOIT_PROBE = EXPLOIT_PROBES[0] as string;

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

/**
 * How far the deliberate strategies must out-win the best probe before the
 * summit counts as something you have to play for.
 *
 * **0.10, and deliberately not 0.05.** It was 0.05, which is exactly
 * `band.min`, and combined with a pool mean that included the probe it made the
 * exploit constraint a restatement of the band constraint: the campaign
 * reported 0.1250 for `ascensionRate` and 0.1250 for `exploitMargin` and read
 * them as two independent passes. Two constants that coincide are two
 * constraints one number can satisfy.
 *
 * The magnitude has an argument of its own as well. The campaign's sweep is 96
 * runs over eight strategies, so a per-strategy rate moves in steps of 1/12 =
 * 0.083 and the pool mean in steps of 1/(12·7) — a margin below one
 * per-strategy step is a difference the instrument cannot resolve. 0.10 is the
 * first round number above that step.
 *
 * Numeric distinctness is not the real guard, though: the real guard is
 * `scoring-controls.ts`'s restatement test, which fails if any two terms are
 * affine functions of each other across the control corpus. That is what would
 * have caught the original defect, and it would have caught it whatever the
 * constants were.
 */
export const EXPLOIT_MARGIN_MIN = 0.1;

/**
 * How many strategies must ascend before the correlation term is allowed to
 * mean anything.
 *
 * A correlation is a claim about a relationship, and a relationship needs more
 * than one point. The measured +0.955 came from eight strategies of which
 * **seven sat at exactly rate 0**: the coefficient is then a statement about a
 * single leveraged observation, and dropping it leaves the rate vector with no
 * variance at all, so Pearson is not merely weak but undefined.
 *
 * Three is the smallest support at which the coefficient survives dropping any
 * one strategy. Below it the term contributes zero to `score` and a note says
 * why — the coefficients are still *reported*, because hiding them would make
 * the degeneracy invisible rather than legible.
 */
export const CORRELATION_MIN_SUPPORT = 3;

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
 * Average ranks, ties sharing the mean of the ranks they span.
 *
 * Average rather than ordinal, because the vector this is used on is mostly
 * ties — seven strategies at rate 0 — and ordinal ranks would invent an order
 * among them out of array position, which is the sweep's strategy list and not
 * a measurement.
 */
function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index }));
  order.sort((left, right) => left.value - right.value);
  const ranks = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (
      end + 1 < order.length &&
      (order[end + 1] as { value: number }).value === (order[start] as { value: number }).value
    ) {
      end += 1;
    }
    // Ranks are 1-based; the shared rank is the mean of the span.
    const shared = (start + end) / 2 + 1;
    for (let index = start; index <= end; index += 1) {
      ranks[(order[index] as { index: number }).index] = shared;
    }
    start = end + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation, with average ranks for ties.
 *
 * Reported beside {@link correlationOf} rather than instead of it. Neither is
 * the honest number on its own: on the measured pool — one winner, seven ties —
 * Pearson reads +0.955 and Spearman +0.615, and **both are positive**, so the
 * shape of the evidence is invisible in either coefficient. It is visible in
 * `nonZeroStrategies`, which is why that is reported too.
 */
export function spearmanOf(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  return correlationOf(averageRanks(xs), averageRanks(ys));
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
  const nodes = outcomes.map((entry) => entry.meanNodesKnown);
  const correlation = correlationOf(rates, nodes);
  const spearman = spearmanOf(rates, nodes);
  const nonZeroStrategies = outcomes.filter((entry) => entry.ascended > 0).length;
  // The scored term is the weaker of the two readings, and it is zero without
  // support. Taking the minimum rather than Pearson alone is the direct
  // consequence of the two disagreeing by 0.34 on the one pool anyone has
  // measured: a term should be worth what the less flattering coefficient says.
  const correlationSupported = nonZeroStrategies >= CORRELATION_MIN_SUPPORT;
  const scoredCorrelation = correlationSupported ? Math.min(correlation, spearman) : 0;

  const topShare = wins === 0 ? 0 : Math.max(...outcomes.map((entry) => entry.ascended)) / wins;

  // The probes are removed from the mean they are compared against. Leaving
  // them in made the margin identically `ascensionRate - probeRate`, so the
  // exploit constraint was the band constraint wearing a second name.
  const probes = outcomes.filter((entry) => EXPLOIT_PROBES.includes(entry.strategyId));
  const deliberate = outcomes.filter((entry) => !EXPLOIT_PROBES.includes(entry.strategyId));
  const probeRates = probes.map((entry) => (entry.runs === 0 ? 0 : entry.ascended / entry.runs));
  // The worst case, not the average: a pool that beats two probes and loses to
  // the third is a pool with an exploit in it.
  const probeRate = probeRates.length === 0 ? Number.NaN : Math.max(...probeRates);
  const deliberateMean = mean(
    deliberate.map((entry) => (entry.runs === 0 ? 0 : entry.ascended / entry.runs)),
  );
  const exploitMargin = probes.length === 0 ? Number.NaN : deliberateMean - probeRate;
  const exploitMeasured = Number.isFinite(exploitMargin);

  const shape = (): BalanceScore => ({
    ascensionRate,
    inBand,
    variety,
    correlation,
    spearman,
    nonZeroStrategies,
    exploitMargin,
    probeRate,
    deliberateMean,
    topShare,
    feasible: false,
    score: 0,
    notes,
  });

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
      ...shape(),
      inBand: false,
      score: -OUT_OF_BAND_PENALTY * UNWINNABLE_MULTIPLIER,
    };
  }

  if (!inBand) {
    notes.push(
      `ascensionRate ${ascensionRate.toFixed(3)} is outside the ${band.min}-${band.max} band by ` +
        `${(distance * 100).toFixed(0)}% of the edge it missed; every in-band candidate ` +
        'outranks this one.',
    );
    return { ...shape(), score: -OUT_OF_BAND_PENALTY * (1 + distance) };
  }

  notes.push(`ascensionRate ${ascensionRate.toFixed(3)} is in band.`);
  if (topShare > DOMINANCE_LIMIT) {
    notes.push(
      `one strategy holds ${(topShare * 100).toFixed(0)}% of wins, above the ` +
        `${(DOMINANCE_LIMIT * 100).toFixed(0)}% dominance limit.`,
    );
  }
  if (!exploitMeasured) {
    notes.push(
      `the pool declares none of ${EXPLOIT_PROBES.join(', ')}, so nothing measured whether the ` +
        'summit is reachable without playing. That is an unmeasured constraint, not a satisfied ' +
        'one, and this candidate is infeasible until a probe runs.',
    );
  } else if (exploitMargin <= 0) {
    const worst = probes[probeRates.indexOf(probeRate)];
    notes.push(
      `${worst?.strategyId ?? 'a probe'} wins at ${probeRate.toFixed(3)} against a deliberate ` +
        `mean of ${deliberateMean.toFixed(3)}: the summit is still reachable without playing.`,
    );
  }
  if (!correlationSupported) {
    notes.push(
      `only ${String(nonZeroStrategies)} of ${String(outcomes.length)} strategies ascended, below ` +
        `the ${String(CORRELATION_MIN_SUPPORT)} this term needs: Pearson ${correlation.toFixed(3)} ` +
        `and Spearman ${spearman.toFixed(3)} are both statements about one leveraged point, so ` +
        'the correlation term contributes nothing.',
    );
  } else if (scoredCorrelation <= 0) {
    notes.push(
      `correlation between winning and knowing magic is Pearson ${correlation.toFixed(2)}, ` +
        `Spearman ${spearman.toFixed(2)} over ${String(nonZeroStrategies)} winners: winning does ` +
        'not measure play.',
    );
  }

  const dominancePenalty = topShare > DOMINANCE_LIMIT ? topShare - DOMINANCE_LIMIT : 0;
  const score =
    weights.variety * variety +
    weights.correlation * scoredCorrelation +
    weights.exploit * (exploitMeasured ? exploitMargin : 0) -
    dominancePenalty;

  const feasible = exploitMeasured && exploitMargin >= EXPLOIT_MARGIN_MIN;
  if (exploitMeasured && !feasible) {
    notes.push(
      `exploit margin ${exploitMargin.toFixed(3)} is below the required ` +
        `${String(EXPLOIT_MARGIN_MIN)}: infeasible whatever its variety.`,
    );
  }

  return { ...shape(), feasible, score };
}

/**
 * One line naming every term, for a trial log a human reads.
 *
 * Pearson, Spearman and the support count appear together and always: the whole
 * lesson of the +0.955 is that one coefficient printed alone is a number nobody
 * can check.
 */
export function describeScore(score: BalanceScore): string {
  const probe = Number.isFinite(score.probeRate) ? score.probeRate.toFixed(3) : 'none';
  const margin = Number.isFinite(score.exploitMargin)
    ? score.exploitMargin.toFixed(3)
    : 'unmeasured';
  return (
    `rate ${score.ascensionRate.toFixed(3)}` +
    ` variety ${score.variety.toFixed(3)}` +
    ` pearson ${score.correlation.toFixed(2)}` +
    ` spearman ${score.spearman.toFixed(2)}` +
    ` winners ${String(score.nonZeroStrategies)}` +
    ` exploit ${margin}` +
    ` (deliberate ${score.deliberateMean.toFixed(3)} vs probe ${probe})` +
    ` top ${score.topShare.toFixed(2)}`
  );
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
