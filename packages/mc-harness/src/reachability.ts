/*
 * Multiverse Mages — metric reachability: whether a registered metric can be
 * made to move at all, and the three verdicts that answer it.
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
 * ## The guard, and why it comes before anything is optimised
 *
 * **An autonomous optimiser pointed at a metric that cannot move will run
 * forever and report progress.** `docs/design/self-evolving-search.md` calls
 * this "the lesson of the entire campaign" and makes it stage 0 of everything
 * that follows:
 *
 * > Before a metric may be optimised, it must be shown to move. Ablate the
 * > mechanism it names, run the paired arms, and require a delta outside the
 * > noise. A metric that cannot be made to move is **quarantined**, not
 * > optimised — and the quarantine list is published, because a silently-skipped
 * > metric is how this failure returns.
 *
 * This module is that stage's arithmetic. It is `winRateByPrimitive`'s ablation
 * generalised from primitives to metrics — same shape, same paired arms under
 * common random numbers, same refusal to report a number when the experiment did
 * not run — with two changes the generalisation forces:
 *
 * 1. **The outcome is continuous, not binary.** A win rate is a proportion and
 *    takes a Wilson score interval; `referencePopulation` is a count of people
 *    and does not. The interval here is a **paired** mean-difference interval
 *    over per-seed deltas, which is the estimator common random numbers were
 *    chosen for: pairing removes the between-seed variance that dominates every
 *    one of these quantities.
 * 2. **The lever is a factor level, not an ablation mask.** See
 *    {@link REACHABILITY_REASON.leverDidNotReach} — as of this commit the
 *    primitive ablation mask reaches no subsystem at all, which is precisely the
 *    condition this module's third verdict exists to name.
 *
 * ## Three verdicts, and the third is the load-bearing one
 *
 * `moves` and `inert` are the two a reader expects. **`not-measurable` is the
 * one that retires the campaign's modal defect**, because it says *the
 * experiment could not be run* — no producer, no arm, no observation, or a lever
 * that never reached the simulation — which is a different statement from *the
 * mechanism does nothing*. Collapsing the two is how ten instruments came to be
 * green while touching nothing they named.
 *
 * The vocabulary is deliberately the design-language register's own:
 * `not-measurable` reads across to `ablation.ts`'s `not-attributable` and
 * `metrics.ts`'s `mechanic-absent` without colliding with either, because those
 * two are statements about *one* metric's mechanic and this is a statement about
 * *the experiment*.
 *
 * ## What "quarantined" costs, and why it is not "failed"
 *
 * A quarantined metric is not a defect and this module never says it is. It is a
 * metric an optimiser **may not be pointed at**, and it stays that way until
 * somebody either wires its producer or shows a lever that moves it. Reporting
 * it as a failure would create pressure to make the list shorter, which is the
 * one pressure guaranteed to bring the original failure back — the check that
 * produced this list is non-blocking for that reason.
 */

/** What a reachability experiment concluded about one metric. */
export const REACHABILITY_VERDICT = {
  /**
   * The paired arms differ by more than the paired interval covers. The metric
   * responds to at least one lever, so an optimiser pointed at it has a gradient
   * to follow.
   */
  moves: 'moves',
  /**
   * The experiment ran, the lever demonstrably reached the simulation, and the
   * metric did not respond. **This is a finding about the metric**, and a strong
   * one: under common random numbers a deterministic simulation gives a zero
   * delta only when the quantity genuinely does not depend on the lever.
   */
  inert: 'inert',
  /**
   * The experiment could not be run. Never a claim about the mechanism — see
   * {@link REACHABILITY_REASON} for which of the four ways it failed.
   */
  notMeasurable: 'not-measurable',
} as const;

/** Any verdict from {@link REACHABILITY_VERDICT}. */
export type ReachabilityVerdict =
  (typeof REACHABILITY_VERDICT)[keyof typeof REACHABILITY_VERDICT];

/**
 * Why a `not-measurable` verdict is `not-measurable`, or why an `inert` one is
 * inert.
 *
 * Reason codes rather than prose because the published list is read by machine
 * as well as by a person: the quarantine list is a filter an optimiser applies,
 * and a filter cannot match on a sentence. The prose goes in `detail` beside it.
 */
export const REACHABILITY_REASON = {
  /**
   * Nothing in the production pipeline produces a value for this metric. The
   * collector exists, the definition exists, and no run record and no arm
   * summary ever carries an entry for it.
   *
   * The strongest of the four, because it is decided *before* any simulation
   * runs: a sweep that declares the metric is rejected by `validateSweep`
   * against the scenario's own registry, which is the mechanical form of "the
   * pipeline cannot even be asked for this number".
   */
  noProducer: 'no-producer',
  /**
   * The arms ran, the metric has a producer, and every run reported
   * `unavailable`. Distinct from {@link noProducer}: the pipeline asked, and the
   * answer was "not on this build" or "not in this run".
   */
  noObservations: 'no-observations',
  /**
   * **Every metric in the probe was byte-identical across every pair.** The
   * lever the probe declares did not reach the simulation at all, so nothing the
   * probe reports is evidence about any mechanism.
   *
   * This is not hypothetical and it is not rare. `winRateByPrimitive`'s own
   * `disprovedBy` names exactly this — *"a control arm and an ablation arm
   * producing byte-identical run records — the neutralization did not reach the
   * simulation"* — and as of this commit `RunTask.ablatedPrimitives` has no
   * production consumer anywhere in the tree: `ablationMaskFor` is exported from
   * `@mm/primitives` and called only by its own unit test. A primitive-ablation
   * probe therefore lands here by construction, which is why the probe table
   * keeps one: a verdict that never fires is a verdict nobody has tested.
   *
   * Decided per *probe*, never per metric. One metric moving and another not,
   * under the same lever, is the lever reaching and the second metric being
   * genuinely {@link REACHABILITY_VERDICT.inert}.
   */
  leverDidNotReach: 'lever-did-not-reach',
  /**
   * Fewer than one complete pair. An unpaired arm has no delta to estimate, and
   * an estimate from the two arms' unpaired means would carry the between-seed
   * variance that pairing exists to remove.
   */
  noPairs: 'no-pairs',
  /** The interval covers zero. Reported with the point estimate, never instead of it. */
  intervalCoversZero: 'interval-covers-zero',
  /**
   * The interval excludes zero. Present on `moves` so that every result carries
   * a reason and a reader never has to infer one from a missing field.
   */
  intervalExcludesZero: 'interval-excludes-zero',
} as const;

/** Any reason from {@link REACHABILITY_REASON}. */
export type ReachabilityReason =
  (typeof REACHABILITY_REASON)[keyof typeof REACHABILITY_REASON];

/* ------------------------------------------------------------------------- *
 * The paired interval
 * ------------------------------------------------------------------------- */

/**
 * *t* at 97.5% for degrees of freedom 1 through 30, then *z*.
 *
 * Pinned as a table rather than computed, for the reason `ablation.ts` pins
 * {@link WILSON_Z_95}: the quantile is part of the definition of the interval,
 * and an inverse-CDF implementation is a second thing that can drift. Thirty
 * rows because that is where *t* and *z* agree to two decimal places, and every
 * probe worth running has more replicates than that.
 *
 * The alternative — using *z* at every sample size — is the same mistake the
 * Wald interval makes at small *n*: it reports more confidence than the sample
 * supports, and it reports it exactly where a reachability result is most
 * interesting, on the cheap probe somebody ran with eight replicates.
 */
const T_QUANTILE_975: readonly number[] = Object.freeze([
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048,
  2.045, 2.042,
]);

/** *z* for a two-sided 95% interval, for degrees of freedom past the table. */
export const REACHABILITY_Z_95 = 1.959963984540054;

/** The 97.5% quantile this module uses at `df` degrees of freedom. */
export function quantile975(df: number): number {
  if (df < 1) return Number.POSITIVE_INFINITY;
  return T_QUANTILE_975[df - 1] ?? REACHABILITY_Z_95;
}

/** One pair: the same derived run seed, played on both arms. */
export interface ReachabilityPair {
  /** The seed both arms ran. Carried so a failure names a reproducible run. */
  readonly runSeed: number;
  readonly control: number;
  readonly ablated: number;
}

/** A paired mean-difference estimate, `ablated − control`. */
export interface PairedDifference {
  readonly pairs: number;
  /** Mean of the per-pair deltas. The point estimate, always reported. */
  readonly meanDifference: number;
  /** Sample standard deviation of the deltas. Zero is a real answer. */
  readonly standardDeviation: number;
  readonly standardError: number;
  readonly low: number;
  readonly high: number;
  /** The quantile used, so a reader can tell a *t* interval from a *z* one. */
  readonly quantile: number;
  /** The control arm's mean, for scale. A delta of 3 means nothing alone. */
  readonly controlMean: number;
  readonly ablatedMean: number;
}

/**
 * The paired mean-difference interval over per-seed deltas.
 *
 * ## Why paired, and why it is not optional
 *
 * The two arms share derived run seeds by construction — the whole reason
 * `ablation.ts` executes each arm as its own sweep over the same `sweepId` and
 * `rootSeed`. Pairing is what that construction buys: the per-pair delta removes
 * the founder draw, the personality draw and every other between-seed source of
 * variance, leaving only the lever. An unpaired two-sample interval on the same
 * data throws that away and typically widens by an order of magnitude, which
 * turns a real effect into `inert` — a false quarantine, which is the *safe*
 * direction of error but still a wrong answer.
 *
 * ## A zero standard deviation is not degenerate here
 *
 * Every delta being identical gives `standardDeviation = 0`, an interval of
 * `[d, d]`, and a verdict of `moves` when `d ≠ 0`. That is correct rather than
 * over-confident, and `standard-error.ts` already argues the case for the gate's
 * tolerances: *"a sweep is deterministic at a fixed root seed, so a metric that
 * has never varied cannot move by chance; if it moves, something changed."*
 * Every delta being zero gives `[0, 0]`, which covers zero, and the verdict is
 * `inert` — or, if it holds for every metric in the probe,
 * {@link REACHABILITY_REASON.leverDidNotReach}.
 *
 * Zero pairs returns an all-zero estimate with an infinite interval, which
 * covers zero and can never be read as a measurement. {@link classifyPaired}
 * refuses to report it at all.
 */
export function pairedDifference(pairs: readonly ReachabilityPair[]): PairedDifference {
  const n = pairs.length;
  if (n === 0) {
    return {
      pairs: 0,
      meanDifference: 0,
      standardDeviation: 0,
      standardError: 0,
      low: Number.NEGATIVE_INFINITY,
      high: Number.POSITIVE_INFINITY,
      quantile: Number.POSITIVE_INFINITY,
      controlMean: 0,
      ablatedMean: 0,
    };
  }

  // Folded in the order the caller supplied, which the script sorts canonically
  // by run seed first. Floating-point addition is not associative and a fold
  // over worker-completion order is a fold nobody can reproduce.
  let deltaSum = 0;
  let controlSum = 0;
  let ablatedSum = 0;
  for (const pair of pairs) {
    deltaSum += pair.ablated - pair.control;
    controlSum += pair.control;
    ablatedSum += pair.ablated;
  }
  const meanDifference = deltaSum / n;

  let squares = 0;
  for (const pair of pairs) {
    const centred = pair.ablated - pair.control - meanDifference;
    squares += centred * centred;
  }
  // Bessel's correction, and `n === 1` has no spread to estimate rather than a
  // spread of zero — but a single paired observation of a deterministic
  // simulation is still a real delta, so the interval collapses onto it rather
  // than opening to infinity. One pair is a thin experiment and `pairs` is
  // reported so a reader can see that it was one.
  const variance = n < 2 ? 0 : squares / (n - 1);
  const standardDeviation = Math.sqrt(variance);
  const standardError = n < 2 ? 0 : standardDeviation / Math.sqrt(n);
  const quantile = n < 2 ? 1 : quantile975(n - 1);
  const halfWidth = quantile * standardError;

  return {
    pairs: n,
    meanDifference,
    standardDeviation,
    standardError,
    low: meanDifference - halfWidth,
    high: meanDifference + halfWidth,
    quantile,
    controlMean: controlSum / n,
    ablatedMean: ablatedSum / n,
  };
}

/* ------------------------------------------------------------------------- *
 * The verdict
 * ------------------------------------------------------------------------- */

/** One metric's reachability under one probe. */
export interface MetricReachability {
  readonly metricId: string;
  /** The probe that produced this verdict. `null` on a merged result. */
  readonly probeId: string | null;
  readonly verdict: ReachabilityVerdict;
  readonly reason: ReachabilityReason;
  /** The mechanism the probe neutralises, in one sentence. */
  readonly mechanism: string;
  /** `null` whenever the experiment did not produce a delta. */
  readonly estimate: PairedDifference | null;
  /** Prose a person reads. Always present; never the machine-readable answer. */
  readonly detail: string;
}

/** What {@link classifyPaired} needs to know that the pairs cannot say. */
export interface ReachabilityInput {
  readonly metricId: string;
  readonly probeId: string;
  readonly mechanism: string;
  /**
   * `false` when the pipeline produces no value for this metric at all — the
   * scenario's metric registry does not carry it, so a sweep declaring it is
   * rejected before a run is scheduled. Decided without running anything.
   */
  readonly hasProducer: boolean;
  /**
   * `false` when *every* metric this probe observed was identical across every
   * pair, i.e. the probe's lever changed nothing whatsoever. Decided per probe;
   * see {@link REACHABILITY_REASON.leverDidNotReach}.
   */
  readonly leverReached: boolean;
  /** Pairs in canonical run-seed order. Empty when nothing was observed. */
  readonly pairs: readonly ReachabilityPair[];
  /**
   * Runs that reported the metric `unavailable` on either arm, and why. Used
   * only to distinguish {@link REACHABILITY_REASON.noObservations} from
   * {@link REACHABILITY_REASON.noPairs} — "the pipeline answered `unavailable`"
   * is a different sentence from "the pipeline was never asked".
   */
  readonly unavailableRuns?: number;
}

/**
 * The verdict for one metric under one probe.
 *
 * The order of the refusals is the order of the claims, weakest precondition
 * first, and each one is a different sentence:
 *
 * 1. **No producer** — decided statically. Checked first because a metric with
 *    no producer would otherwise reach the pair logic with zero pairs and be
 *    reported as `no-pairs`, which reads as "the probe was too small" and is a
 *    much weaker and much less actionable claim than "nothing produces this".
 * 2. **The lever did not reach** — decided per probe. Checked before the delta,
 *    because a probe whose lever changed nothing produces a zero delta for every
 *    metric it names, and reporting eleven `inert` verdicts from one dead lever
 *    is precisely the confident-noise failure this module exists to prevent.
 * 3. **No pairs / no observations** — the arms ran and this metric was not
 *    measured on both sides of any pair.
 * 4. **The interval** — and only now is a number reported.
 */
export function classifyPaired(input: ReachabilityInput): MetricReachability {
  const base = {
    metricId: input.metricId,
    probeId: input.probeId,
    mechanism: input.mechanism,
  } as const;

  if (!input.hasProducer) {
    return {
      ...base,
      verdict: REACHABILITY_VERDICT.notMeasurable,
      reason: REACHABILITY_REASON.noProducer,
      estimate: null,
      detail:
        `nothing in the production pipeline produces ${input.metricId}. Its collector and its ` +
        'definition exist; no run record and no arm summary carries an entry for it, and a sweep ' +
        'declaring it is rejected before dispatch. The experiment was not run because there is ' +
        'no observation for it to compare — this is not a claim that the mechanism does nothing.',
    };
  }

  if (!input.leverReached) {
    return {
      ...base,
      verdict: REACHABILITY_VERDICT.notMeasurable,
      reason: REACHABILITY_REASON.leverDidNotReach,
      estimate: input.pairs.length === 0 ? null : pairedDifference(input.pairs),
      detail:
        `probe ${input.probeId} produced identical values for every metric it observed, on every ` +
        'pair. Its lever did not reach the simulation, so its zero delta is evidence about the ' +
        `lever and not about ${input.metricId}. A verdict of inert here would be the ablation-` +
        'mask failure repeated: an instrument reporting green while touching nothing it names.',
    };
  }

  if (input.pairs.length === 0) {
    const unavailable = input.unavailableRuns ?? 0;
    return {
      ...base,
      verdict: REACHABILITY_VERDICT.notMeasurable,
      reason:
        unavailable > 0 ? REACHABILITY_REASON.noObservations : REACHABILITY_REASON.noPairs,
      estimate: null,
      detail:
        unavailable > 0
          ? `${input.metricId} has a producer and every one of ${String(unavailable)} runs ` +
            'reported it unavailable, so no pair carries a value on both arms. The pipeline ' +
            'asked and the answer was "not on this build".'
          : `probe ${input.probeId} completed no pair in which ${input.metricId} was measured on ` +
            'both arms. The arms were scheduled; nothing was paired.',
    };
  }

  const estimate = pairedDifference(input.pairs);
  // An arm-scoped metric is one number folded over a whole arm, so it yields
  // exactly one pair. Saying "1 pairs" in a published record is how a reader
  // learns to stop trusting the record.
  const pairCount = `${String(estimate.pairs)} pair${estimate.pairs === 1 ? '' : 's'}`;
  const coversZero = estimate.low <= 0 && estimate.high >= 0;
  if (coversZero) {
    return {
      ...base,
      verdict: REACHABILITY_VERDICT.inert,
      reason: REACHABILITY_REASON.intervalCoversZero,
      estimate,
      detail:
        `over ${pairCount} the mean paired difference is ` +
        `${estimate.meanDifference.toFixed(4)} with a 95% interval of ` +
        `[${estimate.low.toFixed(4)}, ${estimate.high.toFixed(4)}], which covers zero. The ` +
        `probe's lever moved other metrics, so ${input.metricId} does not depend on ` +
        `${input.mechanism}. Reported with its point estimate, not instead of it.`,
    };
  }

  return {
    ...base,
    verdict: REACHABILITY_VERDICT.moves,
    reason: REACHABILITY_REASON.intervalExcludesZero,
    estimate,
    detail:
      `over ${pairCount} the mean paired difference is ` +
      `${estimate.meanDifference.toFixed(4)} with a 95% interval of ` +
      `[${estimate.low.toFixed(4)}, ${estimate.high.toFixed(4)}], which excludes zero. Control ` +
      `mean ${estimate.controlMean.toFixed(4)}, ablated mean ${estimate.ablatedMean.toFixed(4)}.`,
  };
}

/* ------------------------------------------------------------------------- *
 * The precondition: arms that share seeds
 * ------------------------------------------------------------------------- */

/** The two fields of a task this check reads. */
export interface SeededCoordinates {
  readonly coordinates: { readonly cellIndex: number; readonly replicateIndex: number };
  readonly runSeed: number;
}

/** One arm's tasks, keyed as {@link buildTasks} keys them. */
export interface SeededArm {
  readonly armId: string;
  readonly tasks: ReadonlyMap<number, SeededCoordinates>;
}

/**
 * Names every way a set of arms fails "identical derived seeds".
 *
 * ## Why this is not `ablation.ts`'s `pairedSeedProblems`
 *
 * It very nearly is, and the difference is exactly one rule.
 * `pairedSeedProblems` additionally requires that every arm run each cell at
 * **identical factor levels**, which is correct for the experiment it guards: an
 * ablation arm differs from its control only in which primitive is neutralized,
 * so a level that moved is a scheduling bug.
 *
 * A reachability probe's lever *is* a factor level. Running
 * `pairedSeedProblems` over these arms reports sixteen level disagreements per
 * probe, every one of them the treatment working as designed. Reusing it here
 * would mean either weakening it — which would blind the ablation path to a real
 * bug — or ignoring its output, which is worse.
 *
 * So this is the level-agnostic half, and it keeps the half that matters:
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` and **never of the levels**, which is precisely what makes a
 * level lever pairable at all. If that ever stops being true, every reachability
 * delta becomes sampling noise wearing a mechanism's name, and this is where it
 * is caught — before dispatch, rather than in a plausible-looking number.
 */
export function pairedRunSeedProblems(arms: readonly SeededArm[]): string[] {
  const control = arms[0];
  if (control === undefined) return [];
  const problems: string[] = [];

  const key = (task: SeededCoordinates): string =>
    `${String(task.coordinates.cellIndex)}:${String(task.coordinates.replicateIndex)}`;
  const reference = new Map<string, SeededCoordinates>();
  for (const task of control.tasks.values()) reference.set(key(task), task);

  for (const arm of arms.slice(1)) {
    const seen = new Set<string>();
    for (const task of arm.tasks.values()) {
      const coordinates = key(task);
      seen.add(coordinates);
      const paired = reference.get(coordinates);
      if (paired === undefined) {
        problems.push(
          `arm ${arm.armId} holds a run at cell/replicate ${coordinates} that the control arm ` +
            `${control.armId} does not. Arms must expand to the same cells.`,
        );
        continue;
      }
      if (paired.runSeed !== task.runSeed) {
        problems.push(
          `arm ${arm.armId} derives run seed ${String(task.runSeed)} at cell/replicate ` +
            `${coordinates} where the control arm derives ${String(paired.runSeed)}. Paired arms ` +
            'must share seeds, or the measured difference between them is mostly sampling noise.',
        );
      }
    }
    for (const coordinates of reference.keys()) {
      if (!seen.has(coordinates)) {
        problems.push(
          `arm ${arm.armId} is missing the run at cell/replicate ${coordinates} that the control ` +
            'arm holds.',
        );
      }
    }
  }
  return problems.sort();
}

/**
 * Whether a probe's lever reached the simulation at all.
 *
 * True when **any** observed value differs on **any** pair. Deliberately the
 * weakest possible bar: the question is not whether the lever mattered but
 * whether it was connected, and one changed number anywhere answers it.
 *
 * Taken over every metric the probe observed rather than over the one being
 * classified, because a lever that moves population and not grimoires has
 * reached the simulation and the grimoire result is a real `inert`.
 */
export function leverReached(observations: readonly ReachabilityPair[]): boolean {
  return observations.some((pair) => pair.ablated !== pair.control);
}

/**
 * One metric's verdict across every probe that named it.
 *
 * **`moves` wins.** A metric shown to move by any lever is reachable, whatever
 * the other probes found — an optimiser pointed at it has a gradient, which is
 * the only question this stage asks. `inert` beats `not-measurable` for the
 * mirror-image reason: an experiment that ran and found nothing is a stronger
 * statement than one that could not run, and merging them the other way would
 * let a single unrunnable probe hide a real finding.
 *
 * The merged result keeps the winning probe's estimate and detail, and its
 * `probeId` names which probe won so the claim stays traceable to one run.
 *
 * @throws Error when handed no results for a metric, which would otherwise
 * produce a verdict with no experiment behind it.
 */
export function mergeReachability(
  results: readonly MetricReachability[],
): MetricReachability {
  const first = results[0];
  if (first === undefined) {
    throw new Error(
      'mergeReachability was handed no results. A metric with no probe has no verdict, and ' +
        'returning one would invent an experiment.',
    );
  }
  const rank: Record<ReachabilityVerdict, number> = {
    [REACHABILITY_VERDICT.moves]: 2,
    [REACHABILITY_VERDICT.inert]: 1,
    [REACHABILITY_VERDICT.notMeasurable]: 0,
  };
  let best = first;
  for (const candidate of results.slice(1)) {
    if (rank[candidate.verdict] > rank[best.verdict]) best = candidate;
  }
  return best;
}

/**
 * The quarantine list: every metric an optimiser may not be pointed at.
 *
 * `inert ∪ not-measurable`, sorted, because the two are different findings with
 * the same consequence. Published rather than applied silently — the whole point
 * of the guard is that *"a silently-skipped metric is how this failure
 * returns"*, and a list nobody can read is a silent skip with extra steps.
 */
export function quarantineList(
  results: readonly MetricReachability[],
): readonly string[] {
  return results
    .filter((result) => result.verdict !== REACHABILITY_VERDICT.moves)
    .map((result) => result.metricId)
    .sort();
}

/**
 * Names every way a reachability report is not safe to publish.
 *
 * One rule, and it is the one that would otherwise be discovered by a reader in
 * 2031: **every registered metric must carry a verdict.** A report covering
 * sixteen of twenty-nine metrics and saying so nowhere is exactly the
 * silently-skipped metric the guard forbids, and it is the easiest possible
 * regression to introduce — add a metric to the registry, forget the probe
 * table, publish a list that no longer means what its title says.
 */
export function reachabilityReportProblems(input: {
  readonly registeredMetricIds: readonly string[];
  readonly results: readonly MetricReachability[];
}): string[] {
  const covered = new Set(input.results.map((result) => result.metricId));
  const problems: string[] = [];
  for (const metricId of input.registeredMetricIds) {
    if (!covered.has(metricId)) {
      problems.push(
        `${metricId} is a registered metric with no reachability verdict. Every metric must be ` +
          'classified — including as not-measurable — because a metric missing from the ' +
          'quarantine list reads as one that was cleared.',
      );
    }
  }
  for (const metricId of covered) {
    if (!input.registeredMetricIds.includes(metricId)) {
      problems.push(
        `${metricId} carries a reachability verdict but is in no registry. The report would name ` +
          'a metric nobody can look up.',
      );
    }
  }
  return problems.sort();
}
