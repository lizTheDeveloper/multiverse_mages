/*
 * Multiverse Mages — every scoring term, paired with a system known to be
 * broken and a system known to be working.
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
 * # The control discipline, as machinery rather than as a paragraph
 *
 * The campaign adopted this rule from an external review after four separate
 * scoring terms turned out not to measure what their names claimed:
 *
 * > *"Before you use a metric to evaluate a fix, you must demonstrate that the
 * > metric can distinguish between a system you **know** is broken and a system
 * > you **know** is working. If you cannot produce both a negative control and
 * > a positive control, the metric is not ready to be used."*
 * >
 * > *"You were treating the metric as a **definition** rather than as a
 * > **claim**. Definitions don't need testing. Claims do."*
 *
 * A rule written down is a rule that decays. So it is executable here:
 *
 * - Every numeric field of {@link BalanceScore} is either a {@link ScoringTerm}
 *   in {@link SCORING_TERMS}, carrying a negative control, a positive control
 *   and a minimum separation — or it is named in
 *   {@link TERMS_WITHOUT_CONTROLS} with a written reason. `scoring-controls.test.ts`
 *   enumerates the fields of a real score and fails on anything in neither list,
 *   so **adding a term without controls breaks the suite** rather than being
 *   noticed by a reviewer who happens to be paying attention.
 * - A term whose controls do not separate by its declared minimum fails.
 * - No term may be an affine restatement of another across the whole control
 *   corpus. That is the shape of the exploit-margin defect — `exploitMargin`
 *   was identically `ascensionRate − probeRate`, so two constraints were
 *   satisfied by one number and the campaign read them as two passes.
 *
 * ## The third kind of control, and why it had to exist
 *
 * A negative and a positive control demonstrate that a term *can* separate. They
 * do not demonstrate that it separates the cases you will actually meet. The
 * correlation term passes its negative and positive controls comfortably and is
 * still unable to tell a real relationship from a single leveraged point — so
 * {@link ScoringTerm.falseFriend} names a system that **is** broken and that the
 * term reports as healthy, and the suite asserts two things about it: that the
 * term indeed fails to separate it, and that **some other registered term
 * does**. A blindness that is declared and compensated is a known limit; a
 * blindness that is undeclared is the +0.955 this workstream exists to explain.
 *
 * ## Where the numbers come from
 *
 * The per-strategy node means in {@link MEASURED_NODES} are the campaign board's
 * measured figures. The **win counts** in each control are constructed, because
 * a control is by definition a system whose answer you already know, and no
 * committed sweep has ever produced a pool with four winners. That is recorded
 * on each control rather than smoothed over, and one term —
 * {@link SCORING_TERMS} `variety` — has a positive control that has never been
 * observed in any real configuration at all.
 */

import type { Band, BalanceScore, ScoreWeights, StrategyOutcome } from './tuner.js';
import { scoreBalance } from './tuner.js';

/**
 * Mean nodes known per strategy, from the campaign board.
 *
 * Five strategies sit at the passive ceiling of 51 — the whole of the v1
 * rectangle, which an unattended universe learns on its own. `permissive-breadth`
 * reaches 262 by permitting cells the universe did not start with, and
 * `permit-then-idle` reaches 231 by permitting them and then doing nothing for
 * 2260 ticks, which is the measurement that says the predicates read the ruleset
 * rather than the play.
 */
export const MEASURED_NODES: Readonly<Record<string, number>> = Object.freeze({
  'passive-control': 51,
  'uniform-random-legal': 51,
  'permissive-breadth': 262,
  'narrow-depth': 9,
  'denial-warden': 5,
  archivist: 51,
  'portal-rush': 51,
  'worship-maximizer': 51,
  'idle-then-declare': 51,
  'permit-then-idle': 231,
});

/** The strategy ids a control pool covers, in the pool's registration order. */
export const CONTROL_POOL: readonly string[] = Object.freeze(Object.keys(MEASURED_NODES));

/** Runs per strategy in every control pool. The campaign's n=96 over eight. */
export const CONTROL_RUNS = 12;

/**
 * A control pool: the measured node means, and the win counts you are asserting.
 *
 * Every strategy gets {@link CONTROL_RUNS} runs, so coverage is full and even
 * and the two headline statistics are the same quantity — which is the
 * condition `coverageProblem` enforces on a real sweep.
 */
export function controlPool(wins: Readonly<Record<string, number>>): StrategyOutcome[] {
  for (const id of Object.keys(wins)) {
    if (!(id in MEASURED_NODES)) {
      throw new Error(
        `${id} is not in MEASURED_NODES, so a control naming it would be asserting a node count ` +
          'nobody measured.',
      );
    }
  }
  return CONTROL_POOL.map((strategyId) => ({
    strategyId,
    ascended: wins[strategyId] ?? 0,
    runs: CONTROL_RUNS,
    meanNodesKnown: MEASURED_NODES[strategyId] as number,
  }));
}

/**
 * A control pool with **constructed** node means as well as constructed wins.
 *
 * Needed, and the reason it is needed is a finding rather than a convenience.
 *
 * The correlation terms claim *"the strategies that win are the ones that know
 * more magic"*, and a positive control for that claim is a pool where win rate
 * and knowledge are monotone together. **No assignment of wins over
 * {@link MEASURED_NODES} produces one.** Five of the ten strategies finish on
 * exactly 51 nodes — the whole of the v1 rectangle, which an unattended universe
 * learns on its own — so any pool built from the measured vector has five
 * strategies tied in knowledge and necessarily untied in wins, and its rank
 * correlation is capped well below 1 whatever anybody does. The measured
 * `permit-then-idle` makes it worse rather than better: it reaches 231 nodes, the
 * second-highest count in the pool, while correctly never being allowed to win.
 *
 * That is the campaign's content-exhaustion finding restated as a property of
 * this instrument: **the game as measured cannot supply a positive control for
 * D4.** So the control is built rather than found, and it is labelled
 * `constructed` so nobody reads it as evidence about the game.
 */
export function constructedPool(
  spec: Readonly<Record<string, readonly [number, number]>>,
): StrategyOutcome[] {
  return CONTROL_POOL.map((strategyId) => {
    const row = spec[strategyId] ?? ([0, 40] as const);
    return {
      strategyId,
      ascended: row[0],
      runs: CONTROL_RUNS,
      meanNodesKnown: row[1],
    };
  });
}

/** One system whose verdict is known before the term is applied to it. */
export interface ScoringControl {
  /** Short name, used in failure messages. */
  readonly label: string;
  /**
   * **Why the verdict is known independently of this term.**
   *
   * The load-bearing field. A control justified by the term's own reading is
   * not a control, it is a tautology, and this is where that shows.
   */
  readonly why: string;
  /** Whether the win counts are measured or constructed. Honesty, made a field. */
  readonly provenance: 'measured' | 'constructed';
  readonly outcomes: readonly StrategyOutcome[];
}

/** Which direction of a term's reading is the healthy one. */
export const BETTER_WHEN = {
  higher: 'higher',
  lower: 'lower',
  /** The healthy reading is inside the §7 band; both edges are failures. */
  inBand: 'in-band',
} as const;

/** Any direction from {@link BETTER_WHEN}. */
export type BetterWhen = (typeof BETTER_WHEN)[keyof typeof BETTER_WHEN];

/** One scoring term, and the two systems that decide whether it works. */
export interface ScoringTerm {
  /** The {@link BalanceScore} field this term is. */
  readonly field: keyof BalanceScore & string;
  /**
   * **The falsifiable claim the term makes.**
   *
   * Not a description of the arithmetic — a sentence a measurement could come
   * back and contradict. "Normalised entropy of win share" is a definition;
   * "the wins are spread across strategies rather than concentrated" is a claim.
   */
  readonly claim: string;
  readonly betterWhen: BetterWhen;
  readonly negative: ScoringControl;
  readonly positive: ScoringControl;
  /**
   * How far apart the two controls must read.
   *
   * Declared per term rather than shared, because the terms are on different
   * scales — a rate, an entropy, a correlation and a count — and one global
   * epsilon would be meaningless on at least three of them.
   */
  readonly minimumSeparation: number;
  /**
   * A system that **is** broken and that this term reports as healthy.
   *
   * Optional, and every one present is a declared limit of the instrument. The
   * suite asserts that the term fails to separate it *and* that another
   * registered term catches it.
   */
  readonly falseFriend?: ScoringControl;
}

// ---------------------------------------------------------------------------
// The control pools. Each is named for the system it is a control *for*.
// ---------------------------------------------------------------------------

/**
 * Everyone wins, including the bot that plays nothing.
 *
 * The measured pre-W6 state: `ascensionRate` 0.79 against a band of 0.05–0.20,
 * and the idle probe winning 100% of runs in every cell of a 24-cell scan. Known
 * broken without reading any term, because a win condition that a bot which
 * submits nothing satisfies in every run is not a win condition.
 */
const EVERYONE_WINS = controlPool({
  'passive-control': 12,
  'uniform-random-legal': 12,
  'permissive-breadth': 12,
  'narrow-depth': 8,
  'denial-warden': 8,
  archivist: 12,
  'portal-rush': 12,
  'worship-maximizer': 12,
  'idle-then-declare': 12,
  'permit-then-idle': 12,
});

/**
 * Four strategies win at materially different rates and none of them is a probe.
 *
 * Known working because it is D3 and D2 satisfied simultaneously by
 * construction: the wins are spread, the top share is under the dominance limit,
 * and every probe is at zero.
 */
const FOUR_DELIBERATE_WINNERS = controlPool({
  'permissive-breadth': 4,
  archivist: 3,
  'narrow-depth': 3,
  'denial-warden': 2,
});

/**
 * One winner, seven ties. The measured W6 pool.
 *
 * `permissive-breadth` takes all twelve of its runs and every other strategy
 * takes none. Known broken because D3 names it: a game with one viable line is
 * a game with no decisions in it, and the campaign said so before measuring it
 * by showing the pool's Pareto front is a single point.
 */
const ONE_WINNER = controlPool({ 'permissive-breadth': 12 });

/**
 * The ruleset-only winner: `permit-then-idle` wins as often as the pool.
 *
 * Known broken independently of any term, because the strategy's own definition
 * is the evidence: it submits `permitTechnique` and `permitForm` for 140 of 2400
 * ticks and **an empty preference list for the remaining 2260**. It funds
 * nothing, teaches nothing, blesses nobody. A win condition it satisfies is
 * reading what the god permitted, not what the universe did.
 */
const RULESET_ONLY_WINNER = controlPool({
  'permit-then-idle': 6,
  'permissive-breadth': 3,
  archivist: 2,
  'narrow-depth': 1,
});

/**
 * The idle probe takes the summit and nobody else does.
 *
 * Known broken by the same argument as {@link EVERYONE_WINS} and sharper: the
 * only strategy winning is the one whose entire policy is "submit nothing, and
 * declare on the first legal round".
 */
const PROBE_ONLY_WINNER = controlPool({ 'idle-then-declare': 6, 'uniform-random-legal': 3 });

/**
 * Winners sit at the passive knowledge baseline and the strategy that knows most
 * never wins.
 *
 * Known broken because it is D6 inverted: `archivist`, `portal-rush` and
 * `worship-maximizer` all finish on the same 51 nodes an unattended universe
 * reaches, while `permissive-breadth` at 262 nodes takes nothing. Winning is
 * anti-correlated with knowing magic.
 */
const WINNERS_AT_THE_BASELINE = controlPool({
  archivist: 4,
  'portal-rush': 4,
  'worship-maximizer': 4,
});

/**
 * Winners ordered by how much magic they know.
 *
 * Known working because the ordering is imposed by construction: four deliberate
 * strategies win at descending rates and hold descending node counts, every
 * loser holds the same lower count, and no probe wins at all. Win rate and
 * knowledge are monotone together and tied together, which is exactly what the
 * correlation terms claim to detect.
 *
 * The node means are constructed rather than measured, and {@link constructedPool}
 * explains why that was forced: the measured vector has five strategies tied at
 * 51 nodes, so it cannot express a system in which knowledge tracks winning.
 */
const WINNERS_ORDERED_BY_KNOWLEDGE = constructedPool({
  'permissive-breadth': [6, 300],
  archivist: [4, 200],
  'narrow-depth': [3, 120],
  'denial-warden': [2, 80],
});

// ---------------------------------------------------------------------------
// The registry.
// ---------------------------------------------------------------------------

const SPREAD_CONTROL: ScoringControl = {
  label: 'four deliberate winners',
  why:
    'Wins are spread over four strategies at materially different rates with the top share at ' +
    '33%, and every probe is at zero. That is D3 and D2 satisfied by construction, so the ' +
    'verdict does not depend on reading any term.',
  provenance: 'constructed',
  outcomes: FOUR_DELIBERATE_WINNERS,
};

const ONE_WINNER_CONTROL: ScoringControl = {
  label: 'one winner, seven ties',
  why:
    'The measured W6 pool. permissive-breadth takes all twelve of its runs and nothing else wins ' +
    'once. D3 calls a single-winner pool broken, and the campaign demonstrated it before ' +
    'measuring it by showing the pool\'s Pareto front is one point.',
  provenance: 'measured',
  outcomes: ONE_WINNER,
};

/**
 * Every scoring term, with its controls.
 *
 * The order is the order {@link BalanceScore} declares the fields in, so a
 * reader can hold the two side by side.
 */
export const SCORING_TERMS: readonly ScoringTerm[] = Object.freeze([
  {
    field: 'ascensionRate',
    claim:
      'The summit is reachable but not routine: somewhere between one run in twenty and one in ' +
      'five ends in an ascension (contracts.md §7, vision §8a).',
    betterWhen: BETTER_WHEN.inBand,
    negative: {
      label: 'everyone wins, including the bot that plays nothing',
      why:
        'Measured at 0.79 against a band of 0.05-0.20 before the positive-achievement predicates ' +
        'landed, with the idle probe winning 100% of runs in every cell of a 24-cell scan. A win ' +
        'condition satisfied by submitting nothing is not one.',
      provenance: 'measured',
      outcomes: EVERYONE_WINS,
    },
    positive: SPREAD_CONTROL,
    minimumSeparation: 0.4,
  },
  {
    field: 'variety',
    claim: 'The wins are spread across strategies rather than concentrated in one.',
    betterWhen: BETTER_WHEN.higher,
    negative: ONE_WINNER_CONTROL,
    positive: {
      ...SPREAD_CONTROL,
      why:
        SPREAD_CONTROL.why +
        ' **This configuration has never been observed.** Measured variety has been 0.000 in ' +
        'every committed sweep since the win condition changed, because exactly one strategy ' +
        'qualifies. So this control demonstrates that the arithmetic can separate, and it is not ' +
        'evidence about the game.',
    },
    minimumSeparation: 0.5,
  },
  {
    field: 'correlation',
    claim: 'The strategies that win are the ones that know more magic (campaign D4).',
    betterWhen: BETTER_WHEN.higher,
    negative: {
      label: 'winners sit at the passive baseline',
      why:
        'archivist, portal-rush and worship-maximizer all finish on the same 51 nodes an idle ' +
        'universe reaches, and permissive-breadth at 262 nodes never wins. D6 says no strategy ' +
        'may win at the passive knowledge baseline; here every winner does.',
      provenance: 'measured',
      outcomes: WINNERS_AT_THE_BASELINE,
    },
    positive: {
      label: 'winners ordered by knowledge',
      why:
        'The win counts are imposed in the order of the measured node means: 262 nodes wins six ' +
        'times, 51 nodes three times, 9 nodes once, and no probe wins. The relationship is in the ' +
        'construction, not in the reading.',
      provenance: 'constructed',
      outcomes: WINNERS_ORDERED_BY_KNOWLEDGE,
    },
    minimumSeparation: 0.8,
    falseFriend: ONE_WINNER_CONTROL,
  },
  {
    field: 'spearman',
    claim:
      'The rank order of win rate follows the rank order of magic known, without assuming the ' +
      'relationship is linear.',
    betterWhen: BETTER_WHEN.higher,
    negative: {
      label: 'winners sit at the passive baseline',
      why:
        'The same system as the Pearson term\'s negative control, and deliberately so: two ' +
        'coefficients over one pair of vectors must agree about a system that is broken in the ' +
        'ordering, or one of them is not reading the ordering.',
      provenance: 'measured',
      outcomes: WINNERS_AT_THE_BASELINE,
    },
    positive: {
      label: 'winners ordered by knowledge',
      why: 'Monotone by construction, which is exactly what a rank correlation claims to detect.',
      provenance: 'constructed',
      outcomes: WINNERS_ORDERED_BY_KNOWLEDGE,
    },
    minimumSeparation: 0.5,
    falseFriend: ONE_WINNER_CONTROL,
  },
  {
    field: 'nonZeroStrategies',
    claim:
      'Enough strategies win that a correlation over them is a statement about a relationship ' +
      'rather than about one leveraged point.',
    betterWhen: BETTER_WHEN.higher,
    negative: ONE_WINNER_CONTROL,
    positive: SPREAD_CONTROL,
    minimumSeparation: 2,
  },
  {
    field: 'exploitMargin',
    claim:
      'Playing beats not playing: the deliberate strategies out-win the best of the idle probes ' +
      '(campaign D2).',
    betterWhen: BETTER_WHEN.higher,
    negative: {
      label: 'the ruleset-only winner takes half its runs',
      why:
        'permit-then-idle permits the grid for 140 ticks and submits an empty preference list for ' +
        'the remaining 2260, and it measured 12/12 and 231 nodes — the best strategy\'s profile. ' +
        'Its policy is the evidence; no term has to be consulted to know this pool is broken.',
      provenance: 'measured',
      outcomes: RULESET_ONLY_WINNER,
    },
    positive: SPREAD_CONTROL,
    minimumSeparation: 0.3,
  },
  {
    field: 'probeRate',
    claim: 'The bots that play nothing do not reach the summit.',
    betterWhen: BETTER_WHEN.lower,
    negative: {
      label: 'only the probes win',
      why:
        'idle-then-declare and uniform-random-legal take every win in the pool and no deliberate ' +
        'strategy takes one. Known broken from the strategies\' own definitions.',
      provenance: 'constructed',
      outcomes: PROBE_ONLY_WINNER,
    },
    positive: SPREAD_CONTROL,
    minimumSeparation: 0.4,
  },
  {
    field: 'deliberateMean',
    claim: 'The strategies that are trying can reach the summit at all.',
    betterWhen: BETTER_WHEN.higher,
    negative: {
      label: 'only the probes win',
      why:
        'Every deliberate strategy is at zero by construction, so the mean over them is zero and ' +
        'the game is unwinnable by play.',
      provenance: 'constructed',
      outcomes: PROBE_ONLY_WINNER,
    },
    positive: SPREAD_CONTROL,
    minimumSeparation: 0.1,
  },
  {
    field: 'topShare',
    claim: 'No single strategy holds most of the wins (campaign D3, none above 60%).',
    betterWhen: BETTER_WHEN.lower,
    negative: ONE_WINNER_CONTROL,
    positive: SPREAD_CONTROL,
    minimumSeparation: 0.4,
  },
]);

/**
 * Numeric fields of {@link BalanceScore} that carry no controls, and why.
 *
 * Exemption is a **deliberate, written act**, which is the point: the
 * enumeration test fails on any numeric field that is in neither this record nor
 * {@link SCORING_TERMS}, so the cheapest way to add a term is to give it
 * controls.
 */
export const TERMS_WITHOUT_CONTROLS: Readonly<Record<string, string>> = Object.freeze({
  score:
    'The weighted aggregate of the terms above. It makes no claim of its own — controlling it ' +
    'would be controlling the weights, which are an argument rather than a measurement, and a ' +
    'control on it would pass or fail for reasons belonging to its components.',
});

/** What a term read on its two controls, and whether it told them apart. */
export interface Separation {
  readonly field: string;
  readonly negative: number;
  readonly positive: number;
  /** Signed in the direction the term declares healthy; negative means inverted. */
  readonly separation: number;
  readonly separates: boolean;
  /** Present only for an `in-band` term: whether each control landed in band. */
  readonly negativeInBand?: boolean;
  readonly positiveInBand?: boolean;
}

function readField(score: BalanceScore, field: string): number {
  const value = (score as unknown as Record<string, unknown>)[field];
  if (typeof value !== 'number') {
    throw new Error(`BalanceScore.${field} is not a number, so it cannot be a scoring term.`);
  }
  return value;
}

/**
 * Scores one term's two controls and reports whether it separated them.
 *
 * Pure and exported so the numbers can be printed in a report rather than only
 * asserted — a separation that only ever appears as a green tick is a claim
 * nobody read.
 */
export function separationOf(term: ScoringTerm, weights: ScoreWeights, band: Band): Separation {
  const negative = readField(scoreBalance(term.negative.outcomes, weights, band), term.field);
  const positive = readField(scoreBalance(term.positive.outcomes, weights, band), term.field);
  if (term.betterWhen === BETTER_WHEN.inBand) {
    const negativeInBand = negative >= band.min && negative <= band.max;
    const positiveInBand = positive >= band.min && positive <= band.max;
    // Distance from the broken system to the band edge it missed. A term whose
    // negative control lands *inside* the band separated nothing, whatever the
    // arithmetic difference.
    const distance = negativeInBand
      ? 0
      : negative < band.min
        ? band.min - negative
        : negative - band.max;
    return {
      field: term.field,
      negative,
      positive,
      separation: distance,
      separates: !negativeInBand && positiveInBand && distance >= term.minimumSeparation,
      negativeInBand,
      positiveInBand,
    };
  }
  const separation =
    term.betterWhen === BETTER_WHEN.higher ? positive - negative : negative - positive;
  return {
    field: term.field,
    negative,
    positive,
    separation,
    separates: separation >= term.minimumSeparation,
  };
}

/**
 * How a term reads a system it is known to be blind to.
 *
 * `separates` is `false` when the term reports the broken system as healthy —
 * i.e. when it reads *at least as well* as the term's own positive control.
 * That is the blindness being asserted, not an accident.
 */
export function falseFriendReading(
  term: ScoringTerm,
  weights: ScoreWeights,
  band: Band,
): { readonly reading: number; readonly positive: number; readonly separates: boolean } {
  const friend = term.falseFriend;
  if (friend === undefined) {
    throw new Error(`${term.field} declares no false friend.`);
  }
  const reading = readField(scoreBalance(friend.outcomes, weights, band), term.field);
  const positive = readField(scoreBalance(term.positive.outcomes, weights, band), term.field);
  const gap = term.betterWhen === BETTER_WHEN.lower ? reading - positive : positive - reading;
  return { reading, positive, separates: gap >= term.minimumSeparation };
}

/**
 * Every control pool in the registry, deduplicated by identity.
 *
 * The corpus the restatement test runs over. Two terms that read the same on
 * every one of these are two names for one measurement, which is the defect
 * `exploitMargin` had against the band.
 */
export function controlCorpus(): readonly (readonly StrategyOutcome[])[] {
  const seen = new Set<readonly StrategyOutcome[]>();
  for (const term of SCORING_TERMS) {
    seen.add(term.negative.outcomes);
    seen.add(term.positive.outcomes);
    if (term.falseFriend !== undefined) seen.add(term.falseFriend.outcomes);
  }
  return [...seen];
}

/**
 * Whether `b` is an exact affine function of `a` across the corpus — `b = k·a +
 * c` with the residual at floating-point noise.
 *
 * Exact rather than "highly correlated": the claim being refused is *"this term
 * restates that one"*, and two terms that happen to move together on a small
 * corpus are not restatements. A false positive here would be a test nobody
 * could act on.
 */
export function isAffineRestatement(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length || a.length < 3) return false;
  const n = a.length;
  const meanA = a.reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.reduce((sum, value) => sum + value, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let index = 0; index < n; index += 1) {
    const da = (a[index] as number) - meanA;
    const db = (b[index] as number) - meanB;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  // A term that never varies across the corpus carries no information here
  // either way; the corpus is the wrong instrument for that and the enumeration
  // test is the right one.
  if (saa === 0 || sbb === 0) return false;
  const slope = sab / saa;
  const intercept = meanB - slope * meanA;
  const scale = Math.max(...b.map((value) => Math.abs(value)), 1);
  for (let index = 0; index < n; index += 1) {
    const predicted = slope * (a[index] as number) + intercept;
    if (Math.abs(predicted - (b[index] as number)) > 1e-9 * scale) return false;
  }
  return true;
}
