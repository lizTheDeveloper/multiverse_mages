/*
 * Multiverse Mages — what a reference run records about itself.
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
 * **These are not `contracts.md` §7's balance metrics and they are not
 * baselines.** §7's registry — `knowledgeHalfLife`, `libraryDependence`,
 * `timeToTierBySpecies`, the two snowball metrics, `ascensionRate` — belongs to
 * the `agent-interface` change's task group 6, with pinned estimators,
 * censoring rules and `definitionVersion` conformance behind each one.
 * `release-plan.md` forbids a balance claim before 0.5.0 and there is nothing
 * here that could support one.
 *
 * What these are: **vital signs**. A sweep over a real universe is worth running
 * only if a reader can tell afterwards whether the universe did anything, and
 * "the sweep was green" cannot tell them. Every id below answers one question of
 * the form *did this quantity move, and to what* — population, living mages,
 * distinct nodes known, instances, shelves, books — so that a degenerate run
 * (everybody dies, nothing is ever learned, the population flatlines) is visible
 * in the record rather than inferred from its absence.
 *
 * Each id is prefixed `reference` for a reason that is not cosmetic: a metric
 * registry whose ids collide with §7's would let a sweep declare `nodesKnown`
 * and be validated against a definition nobody wrote.
 *
 * ## The collector table is the registry
 *
 * One array holds both the {@link MetricDefinition} a sweep is validated against
 * and the function that produces the value. Two lists — one of names, one of
 * collectors — is how a metric comes to be declared and never measured, which
 * `records.ts` then rejects at the end of a long sweep instead of at its start.
 */

import type { MetricDefinition, MetricEntry } from '@mm/mc-harness';

import type { CensusSample } from './census.js';

/** What a finished run offers a collector. Census samples, in tick order. */
export interface RunMeasurement {
  /** The reading taken before the first tick. */
  readonly first: CensusSample;
  /** The reading taken after the last tick. */
  readonly last: CensusSample;
  /** Every reading kept, ascending by world tick, including the two above. */
  readonly samples: readonly CensusSample[];
  /** World ticks the episode actually advanced. */
  readonly ticksRun: number;
}

/** A metric definition and the collector behind it. */
export interface ReferenceMeasure {
  readonly definition: MetricDefinition;
  collect(run: RunMeasurement): MetricEntry;
}

/** A measured entry. Every measure here always measures — none is mechanic-gated. */
function measured(value: number): MetricEntry {
  return { status: 'measured', value };
}

const measure = (
  id: string,
  unit: string,
  aggregation: MetricDefinition['aggregation'],
  of: (run: RunMeasurement) => number,
): ReferenceMeasure => ({
  definition: { id, definitionVersion: 1, aggregation, unit },
  collect: (run) => measured(of(run)),
});

/**
 * The vital signs a reference run records, in registration order.
 *
 * `sum` appears nowhere: every quantity here is a per-universe state, and the
 * sum of forty-eight universes' populations is not a population of anything.
 */
export const REFERENCE_MEASURES: readonly ReferenceMeasure[] = Object.freeze([
  measure('referencePopulation', 'people', 'mean', (run) => run.last.population),
  measure('referenceLivingMages', 'mages', 'mean', (run) => run.last.livingMages),
  measure('referenceNodesKnown', 'nodes', 'mean', (run) => run.last.nodesKnown),
  measure('referenceKnowledgeInstances', 'instances', 'mean', (run) => run.last.knowledgeInstances),
  measure('referenceLibraryDepth', 'nodes', 'mean', (run) => run.last.libraryDepth),
  measure('referenceGrimoires', 'grimoires', 'mean', (run) => run.last.grimoires),
  /**
   * Distinct nodes the universe gained over the run.
   *
   * The one number that says whether anything was learned. Negative is a real
   * answer and is not clamped: a universe that lost more than it found is
   * exactly the finding this measure exists to make visible.
   */
  measure(
    'referenceNodesGained',
    'nodes',
    'mean',
    (run) => run.last.nodesKnown - run.first.nodesKnown,
  ),
  measure(
    'referencePopulationChange',
    'people',
    'mean',
    (run) => run.last.population - run.first.population,
  ),
  /** `max`, not `mean`: a peak is a worst case and the mean of peaks is not one. */
  measure('referencePeakPopulation', 'people', 'max', (run) =>
    run.samples.reduce((peak, sample) => Math.max(peak, sample.population), 0),
  ),
]);

/** Every reference metric id, ascending. What a sweep file may name. */
export const REFERENCE_METRIC_IDS: readonly string[] = Object.freeze(
  REFERENCE_MEASURES.map((entry) => entry.definition.id).sort(),
);

/** Metric id to `definitionVersion`, for the provenance block (task 4.2). */
export const REFERENCE_METRIC_VERSIONS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    REFERENCE_MEASURES.map((entry) => [entry.definition.id, entry.definition.definitionVersion]),
  ),
);

/**
 * Collects the metrics a task asked for.
 *
 * Asked-for rather than all, because the record builder requires an entry per
 * *declared* metric and permits no extras; a sweep that declares three of these
 * gets three columns, not nine.
 *
 * @throws Error naming a requested metric this package does not define. The
 * sweep validator rejects that before dispatch, so reaching here means a task
 * was built by hand — and a silently missing column is what
 * `buildRunRecord` would otherwise report much later, in different words.
 */
export function collectReferenceMetrics(
  requested: readonly string[],
  run: RunMeasurement,
): Record<string, MetricEntry> {
  const byId = new Map(REFERENCE_MEASURES.map((entry) => [entry.definition.id, entry]));
  const entries: Record<string, MetricEntry> = {};
  for (const metricId of requested) {
    const measureEntry = byId.get(metricId);
    if (measureEntry === undefined) {
      throw new Error(
        `The reference scenario defines no metric ${metricId}. Defined: ` +
          `${REFERENCE_METRIC_IDS.join(', ')}.`,
      );
    }
    entries[metricId] = measureEntry.collect(run);
  }
  return entries;
}
