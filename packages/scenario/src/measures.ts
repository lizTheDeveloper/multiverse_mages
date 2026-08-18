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
  /**
   * World ticks on which the material ledger did **not** balance.
   *
   * `economy-flow-models.md` §3.4 asks for the conservation check to be
   * *reported*, not only asserted, and this is that half. A check that can only
   * throw gives no evidence while it is passing: a run that reconciled every
   * tick and a run where nobody looked produce the same silence. As a series it
   * says the question was asked and answered on every tick of every run in a
   * sweep.
   *
   * **Always zero on a correct build.** It is a tripwire rather than a dial —
   * `referenceConservationBreaches` reports it, and a non-zero mean is not a
   * balance finding but a defect.
   */
  readonly conservationBreachTicks: number;
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

/**
 * The tail fraction of a run {@link referenceNodesGainedFinalQuarter} reads.
 *
 * Four, so the window is the final quarter. Named rather than inlined because it
 * is an invented constant of the same kind `metrics-registry.ts` insists on
 * declaring: a later change that made it a third would be measuring a different
 * quantity under the same id.
 */
export const FINAL_WINDOW_DENOMINATOR = 4;

/**
 * The census reading the final-window measures count forward from.
 *
 * The window is defined in **world ticks** — `ticksRun / 4` back from the last
 * reading — and then widened to the census grid, because a census taken every
 * twelve ticks cannot answer a question asked between two of them. So the anchor
 * is the *latest* reading at or before the boundary, which makes the measured
 * window the smallest grid-aligned window that contains the final quarter. At a
 * tick cap that is a multiple of four census intervals — 240, which is what
 * `balance-gate-horizon.sweep.json` runs — the two coincide exactly and no
 * widening happens.
 */
function finalWindowAnchor(run: RunMeasurement): CensusSample {
  const boundary = run.last.worldTick - Math.floor(run.ticksRun / FINAL_WINDOW_DENOMINATOR);
  let anchor = run.samples[0] ?? run.last;
  for (const sample of run.samples) {
    if (sample.worldTick > boundary) break;
    anchor = sample;
  }
  return anchor;
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
  /**
   * World ticks whose material ledger did not balance. **Always zero.**
   *
   * The reported half of `material-economy` group 6, and the only metric in this
   * list whose interesting value is a constant. `economy-flow-models.md` §5.2
   * names the gap it fills: every other measure here is a level at a checkpoint,
   * and a level cannot tell material that was spent from material that was lost.
   *
   * `sum` rather than `mean`, deliberately: one breaching tick in one run of a
   * two-hundred-run sweep is a defect, and a mean would report it as 0.005 and
   * round out of sight in a summary.
   */
  measure(
    'referenceConservationBreaches',
    'ticks',
    'sum',
    (run) => run.conservationBreachTicks,
  ),
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
  /**
   * Distinct nodes the universe gained over the **final quarter** of the run.
   *
   * A shape statistic, and the only measure here that is a derivative rather
   * than a level. It exists because of a specific thing the level metrics cannot
   * do, which was measured rather than imagined.
   *
   * `referenceNodesKnown` at the five-year gate reads 32.65 on this build. The
   * build that shipped `researchFrontier` as a prefix window over interned node
   * ids — a third of v1 content unreachable, an entire technique among it —
   * plateaued at 32–33 nodes and stayed there for the rest of a twenty-year run.
   * The healthy universe's *year-five level* and the broken universe's
   * *permanent ceiling* are the same number. A level metric read at the end of a
   * five-year window therefore cannot tell a universe that is still learning
   * from one that has stopped, and a defect that caps discovery anywhere at or
   * above the level the reference reaches by year five passes it in silence.
   *
   * A plateau is a derivative going to zero. This measure reads the derivative
   * directly: near zero means the universe stopped learning before the run
   * ended, whatever level it stopped at, and no comparison against a
   * remembered level is needed to see it.
   *
   * Zero is a real answer and is not special-cased. A run that advanced no ticks
   * gained nothing over its final quarter, which is both what this returns and
   * what is true.
   */
  measure(
    'referenceNodesGainedFinalQuarter',
    'nodes',
    'mean',
    (run) => run.last.nodesKnown - finalWindowAnchor(run).nodesKnown,
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
