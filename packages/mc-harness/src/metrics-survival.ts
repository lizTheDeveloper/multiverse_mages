/*
 * Multiverse Mages — the Kaplan–Meier survival estimator with right-censoring.
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
 * Task 6.5's estimator, and task 6.7's censoring, in one place.
 *
 * ## Why an estimator rather than a mean of observed lifetimes
 *
 * The naive `knowledgeHalfLife` is "average the lifetimes of the nodes that were
 * lost". It is wrong in a direction that flatters the game: nodes still alive at
 * run end are exactly the long-lived ones, and dropping them computes the mean
 * lifetime of the *short-lived subset* while calling it the mean lifetime. A
 * 2400-tick run of a universe that never loses anything would report a half-life
 * of `NaN` or, worse, of whatever the one unlucky node did.
 *
 * Kaplan–Meier is the standard answer: a node still alive at run end is
 * **right-censored**, contributing to the risk set for as long as it was
 * observed and never contributing a death. The estimator is
 *
 *     S(τ) = Π over event times t ≤ τ of (1 − d(t) / n(t))
 *
 * where `d(t)` is deaths at `t` and `n(t)` is the number still at risk just
 * before `t`. Censored observations leave the risk set without an event, which
 * is the whole mechanism.
 *
 * ## Pooling across cohorts understates variance, on purpose
 *
 * The capability spec pools cohorts: every census tick starts a new cohort of
 * every node then existing, and one long-lived node appears in every cohort it
 * survived. Those observations are not independent, so the *confidence interval*
 * a textbook would put on this curve would be too narrow. That is accepted and
 * recorded here rather than papered over: the metric is a point estimate used
 * for release-over-release comparison at a fixed definition, not a population
 * inference, and the gate's tolerance comes from the observed spread across runs
 * (task 8.3) rather than from a within-run standard error.
 *
 * ## Floating point
 *
 * Everything below divides. `mc-harness` is host-side tooling and sits outside
 * the `contracts.md` §4.1 rules-path float ban by construction — it is not in
 * `scripts/check-purity.mjs`'s `PURE_PACKAGES`, it never runs inside `step`, and
 * nothing it computes flows back into the simulation. What it owes instead is
 * *reproducibility*: the fold order here is fixed by sorting event times
 * ascending and multiplying in that order, so two executions over the same
 * observations produce bit-identical curves.
 */

/** One subject's observation: how long it was watched, and how the watch ended. */
export interface SurvivalObservation {
  /** Elapsed time under observation. Never negative. */
  readonly elapsed: number;
  /** `true` when the event happened, `false` when the watch was cut short. */
  readonly event: boolean;
}

/** One step of the estimated curve. */
export interface SurvivalStep {
  readonly time: number;
  /** Events at this time. */
  readonly events: number;
  /** Subjects at risk immediately before this time. */
  readonly atRisk: number;
  /** `S(t)` after applying this step. */
  readonly survival: number;
}

/** The estimated curve and what can be read off it. */
export interface SurvivalCurve {
  readonly steps: readonly SurvivalStep[];
  /** Observations that contributed, events and censorings together. */
  readonly observations: number;
  readonly events: number;
  readonly censored: number;
  /** The largest elapsed time any subject was observed for. */
  readonly longestObserved: number;
  /** The lowest survival the curve reaches. `1` when nothing was ever lost. */
  readonly lowestSurvival: number;
}

/**
 * Estimates `S(t)` from pooled observations.
 *
 * Event times are collected, sorted ascending, and folded in that order — the
 * one ordering rule this file has, and the reason two executions agree bit for
 * bit. Ties are handled the standard way: all deaths at one time are applied in
 * a single step against the risk set as it stood before that time, so the answer
 * does not depend on which tied subject was listed first.
 *
 * @throws RangeError on a negative or non-finite elapsed time, which is a caller
 * bug that would otherwise produce a curve that decreases before it starts.
 */
export function kaplanMeier(observations: readonly SurvivalObservation[]): SurvivalCurve {
  for (const observation of observations) {
    if (!Number.isFinite(observation.elapsed) || observation.elapsed < 0) {
      throw new RangeError(
        `Survival observation has elapsed ${String(observation.elapsed)}. Elapsed time must be ` +
          'finite and non-negative; a negative one means a loss was dated before the cohort it ' +
          'belonged to was sampled.',
      );
    }
  }

  const events = observations.filter((observation) => observation.event);
  const censored = observations.length - events.length;

  const eventTimes = [...new Set(events.map((observation) => observation.elapsed))].sort(
    (a, b) => a - b,
  );

  const steps: SurvivalStep[] = [];
  let survival = 1;
  for (const time of eventTimes) {
    // At risk just before `time`: everyone observed for at least this long.
    const atRisk = observations.filter((observation) => observation.elapsed >= time).length;
    const deaths = events.filter((observation) => observation.elapsed === time).length;
    if (atRisk === 0) continue;
    survival *= 1 - deaths / atRisk;
    steps.push({ time, events: deaths, atRisk, survival });
  }

  let longestObserved = 0;
  for (const observation of observations) {
    if (observation.elapsed > longestObserved) longestObserved = observation.elapsed;
  }

  return {
    steps,
    observations: observations.length,
    events: events.length,
    censored,
    longestObserved,
    lowestSurvival: steps.length === 0 ? 1 : (steps[steps.length - 1] as SurvivalStep).survival,
  };
}

/**
 * The smallest time at which the curve has fallen to or below `quantile`.
 *
 * `null` when it never does — which is not a failure of the estimator but a fact
 * about the run, and the caller's job to report as `censored` with
 * {@link SurvivalCurve.longestObserved} as a lower bound. Returning the longest
 * observed time instead would be the tempting shortcut and would silently
 * convert "we never saw half of it lost" into "half of it was lost at exactly
 * the moment we stopped looking".
 */
export function survivalQuantile(curve: SurvivalCurve, quantile: number): number | null {
  if (!(quantile > 0 && quantile < 1)) {
    throw new RangeError(`Quantile must be strictly between 0 and 1, received ${String(quantile)}.`);
  }
  for (const step of curve.steps) {
    if (step.survival <= quantile) return step.time;
  }
  return null;
}
