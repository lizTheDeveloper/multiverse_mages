/*
 * Multiverse Mages — the strategy arm as a scope on a metric.
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
 * ## The design factor that was smuggled in through the agent pool
 *
 * A sweep's runs are drawn from *cells*, and `standard-error.ts` stratifies on
 * `cellIndex` for a stated reason: "Cell membership is not random. Seeds are."
 * A deliberate difference between two cells is not noise, so folding it into the
 * spread would make the tolerance grow every time a sweep author added a factor
 * level.
 *
 * The strategy a run plays is exactly as deliberate. `assignStrategies` is a
 * pure function of `(pool, cellIndex, replicateIndex)`, and round-robin assigns
 * `strategies[replicateIndex % size]` — chosen, reproducible, and no more random
 * than `cohortSize`. But it arrives through `agentPool` rather than through
 * `factors`, so `cellIndex` never saw it, and the estimator therefore called the
 * whole between-strategy spread "noise".
 *
 * On the committed 200-year gate that spread reaches **294×** between the
 * narrowest and widest arm, which is how `referenceGrimoires` ended up with a
 * tolerance of 117.7 % of its own mean. The tolerance was measuring how
 * differently eight strategies play, when the only thing a regression gate can
 * usefully hold constant is how one build differs from the next.
 *
 * ## Two consequences, and this module serves both
 *
 * 1. **Strategy is a stratum.** {@link strategyKeyOf} is the key
 *    `standard-error.ts` adds to `cellIndex`, which removes between-arm variance
 *    from every tolerance derived from a multi-strategy sweep.
 * 2. **Strategy is a scope.** A mean over eight arms that differ by 294×
 *    describes no universe, and a change confined to one arm is diluted by the
 *    arm count before the gate ever sees it — measured on the committed gate,
 *    *all eighty* (metric, strategy) arms could fall to zero inside tolerance.
 *    So the arms are gated individually, under the metric ids
 *    {@link armScopedMetricId} builds.
 *
 * ## Why a compound id rather than a new baseline field
 *
 * A per-arm line is a metric id, an aggregation, a value, a standard error and a
 * tolerance — the same five things a sweep-level line is. Giving it a separate
 * array in the baseline would mean a second copy of every rule in
 * `baselineProblems`, a second comparison path in `gate.ts`, and a
 * `baselineFormatVersion` bump that invalidates the two passive-control
 * baselines for a change that does not touch them.
 *
 * `referenceGrimoires@archivist` instead flows through the machinery that
 * already exists: it sorts beside its siblings, it diffs as one line, the gate
 * reports it by name, and a sweep that grows an arm the baseline has never heard
 * of is caught by the same check that catches a sweep growing a metric. The
 * separator is `@` because no metric id or strategy id may contain one — see
 * {@link assertScopableId}.
 */

/** Separates a metric id from the strategy arm it was measured over. */
export const ARM_SCOPE_SEPARATOR = '@';

/** One run's arm: its strategy ids in slot order. */
export interface ArmScopedRun {
  readonly strategies: readonly string[];
}

/**
 * The arm key of one run: its slot assignment, joined in slot order.
 *
 * Slot order rather than sorted, because a two-slot sweep in which `archivist`
 * holds slot 0 and `denial-warden` slot 1 is a different experiment from its
 * mirror, and `mirrored` assignment produces both on purpose so that side bias
 * cancels. Sorting here would fold the pair together and lose exactly the
 * asymmetry it was scheduled to measure.
 */
export function strategyKeyOf(run: ArmScopedRun): string {
  return run.strategies.join('+');
}

/** Every distinct arm in a set of runs, sorted, so the fold is canonical. */
export function distinctStrategyKeys(runs: readonly ArmScopedRun[]): string[] {
  return [...new Set(runs.map((run) => strategyKeyOf(run)))].sort();
}

/**
 * Rejects an id that would make a compound id ambiguous.
 *
 * @throws Error naming the id. A strategy called `a@b` would produce a metric id
 * that parses back to something else, and the failure would surface as a gate
 * comparing two metrics that are not the same quantity — which is the one thing
 * `gate.ts` is built to refuse.
 */
export function assertScopableId(id: string, what: string): void {
  if (id.includes(ARM_SCOPE_SEPARATOR)) {
    throw new Error(
      `The ${what} ${JSON.stringify(id)} contains ${ARM_SCOPE_SEPARATOR}, which separates a ` +
        'metric id from its strategy arm. An id carrying the separator parses back to a different ' +
        'pair, so the gate would compare two quantities under one name.',
    );
  }
}

/** The metric id under which one arm's measurement of `baseMetricId` is gated. */
export function armScopedMetricId(baseMetricId: string, strategyKey: string): string {
  assertScopableId(baseMetricId, 'metric id');
  assertScopableId(strategyKey, 'strategy key');
  return `${baseMetricId}${ARM_SCOPE_SEPARATOR}${strategyKey}`;
}

/**
 * What a metric id names: a whole sweep, or one strategy arm of one.
 *
 * Deliberately not `MetricScope` — `metrics.ts` already owns that name for
 * `contracts.md` §7's per-run/per-arm distinction, where "arm" means the whole
 * sweep. Two different questions, and one name for both would make the import
 * list the only place the difference showed.
 */
export interface ScopedMetricId {
  readonly baseMetricId: string;
  /** `null` for a sweep-level metric. */
  readonly strategyKey: string | null;
}

/** Splits a possibly arm-scoped metric id back into its parts. */
export function parseMetricScope(metricId: string): ScopedMetricId {
  const at = metricId.indexOf(ARM_SCOPE_SEPARATOR);
  if (at < 0) return { baseMetricId: metricId, strategyKey: null };
  return {
    baseMetricId: metricId.slice(0, at),
    strategyKey: metricId.slice(at + ARM_SCOPE_SEPARATOR.length),
  };
}
