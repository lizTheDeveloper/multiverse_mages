/*
 * Multiverse Mages — the committed reference sweep, and the registries a sweep
 * file is validated against.
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
 * A sweep is *"declared in a committed file, not assembled by a script, because
 * the file is the experiment"* — `sweep-spec.ts` says so, and the reason it is
 * declared here in TypeScript rather than in JSON under `balance/sweeps/` is
 * that task 8.5 owns that directory and its format, and a JSON file that nobody
 * typechecks against {@link SweepSpec} is a sweep whose first typo is discovered
 * by a validator at dispatch time. This one is the *shakedown* sweep: it exists
 * to prove the harness runs a real universe end to end, not to produce a
 * baseline.
 *
 * **It is not a gate sweep and it may not produce a baseline.** `kind` is
 * `gate` because `SweepSpec` has only two kinds and this is the small one; that
 * word is about sample size, not about authority. `release-plan.md` forbids a
 * balance claim before 0.5.0, and every metric it collects is a vital sign
 * rather than a §7 metric — see `measures.ts`.
 */

import type { MetricDefinition, SweepRegistries, SweepSpec } from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  BOT_POOL_REGISTRY,
  METRIC_SCOPE,
  factorRegistry,
  metricRegistry,
} from '@mm/mc-harness';

import { REFERENCE_MEASURES, REFERENCE_METRIC_IDS } from './measures.js';
import { REFERENCE_FACTOR_IDS } from './reference-universe.js';

/**
 * The seven `per-run` metrics of `contracts.md` §7, as a sweep may declare them.
 *
 * Only the per-run half. The five arm-scoped metrics are properties of an arm's
 * runs, are computed by `runner.ts` for **any** arm that describes itself, and
 * already appear in every sweep summary without being named — so listing them
 * here would let a sweep declare a column that every record fills with
 * `{unavailable, per-arm-scope}` beside a summary that carries the real number.
 * One quantity reported twice, once as an absence, is the kind of thing a reader
 * two years from now has to reverse-engineer.
 *
 * Derived from the registry rather than typed out. A list of ids maintained
 * beside the registry is the two-lists failure `measures.ts` names: it is how a
 * metric comes to be declarable and uncollectable, or collected and
 * undeclarable.
 */
export const BALANCE_RUN_METRIC_DEFINITIONS: readonly MetricDefinition[] = Object.freeze(
  BALANCE_METRIC_REGISTRY.definitions.filter(
    (definition) => definition.scope === METRIC_SCOPE.perRun,
  ),
);

/** Every §7 per-run metric id, ascending. What a sweep file may now also name. */
export const BALANCE_RUN_METRIC_IDS: readonly string[] = Object.freeze(
  BALANCE_RUN_METRIC_DEFINITIONS.map((definition) => definition.id).sort(),
);

/**
 * The registries the reference sweep is validated against.
 *
 * The strategy registry is the real bot pool, not a list of names: a sweep that
 * named a strategy the pool cannot build would otherwise fail inside a worker,
 * once per run, rather than once before dispatch.
 *
 * **Two metric registries, joined.** The vital signs of `measures.ts` and §7's
 * per-run half, because `executor.ts` now collects both and a sweep can only
 * declare what it is validated against. Before this the §7 collectors were
 * unreachable from any sweep file — the validator would have rejected their ids
 * at expansion, which is why `collectRunMetrics` had no production caller and
 * seven metrics were structurally incapable of moving.
 */
export const REFERENCE_REGISTRIES: SweepRegistries = {
  metrics: metricRegistry([
    ...REFERENCE_MEASURES.map((entry) => entry.definition),
    ...BALANCE_RUN_METRIC_DEFINITIONS,
  ]),
  strategies: BOT_POOL_REGISTRY,
  factors: factorRegistry(REFERENCE_FACTOR_IDS),
};

/**
 * Two world years.
 *
 * Short, and deliberately so: this sweep's job is to show that forty-eight real
 * universes can be run, recorded, aggregated and reproduced. Task 9.2 of
 * `mages-and-species` owns the two-hundred-year run, and a two-hundred-year run
 * per cell is a different instrument with a different cost.
 */
const WORLD_TICK_CAP = 24;

/**
 * Wall-clock budget for one run.
 *
 * Two orders of magnitude above what a twenty-four-tick reference universe takes
 * on an idle machine, because this number bounds a *hang*, not a slow run: a
 * budget tight enough to catch a slow machine catches the machine, and the run
 * it abandons is recorded as `failed` and excluded from every rate.
 */
const PER_RUN_TIMEOUT_MS = 60_000;

/**
 * The shakedown sweep: four parameter cells, twelve replicates, forty-eight runs.
 *
 * The two factors are the two knobs that move what a universe *is* at tick zero
 * rather than how it is measured:
 *
 * - `cohortSize` scales the founding population, and with it the labour that
 *   feeds it and the student cohorts mages are promoted from.
 * - `foundingNodes` scales what the universe knows on day one. At this build it
 *   is the only lever on transmission at all: nothing raises mastery, so a node
 *   can only ever be taught if a god granted it at full mastery — see the module
 *   note in `reference-universe.ts`.
 *
 * `foundingMages` is a registered factor and is deliberately *not* varied here:
 * three factors would be eight cells and ninety-six runs for a sweep whose
 * purpose is to prove the plumbing.
 */
export const REFERENCE_SWEEP: SweepSpec = Object.freeze({
  sweepId: 'reference-universe-shakedown',
  // The date this sweep was authored, as an integer. Any fixed number would do;
  // a date is one nobody is tempted to "improve" into a different experiment.
  rootSeed: 20260811,
  factors: Object.freeze([
    Object.freeze({ id: 'cohortSize', levels: Object.freeze([4, 12]) }),
    Object.freeze({ id: 'foundingNodes', levels: Object.freeze([1, 4]) }),
  ]),
  replicates: 12,
  agentPool: Object.freeze({
    // The passive control, because no god action has any effect at this build:
    // no system reads `ctx.actions`. A pool of eight strategies would produce
    // eight identical universes and a pairwise matrix of ties, which reads as a
    // finding about the strategies rather than about the build. The suite
    // asserts that substitution directly instead.
    strategies: Object.freeze(['passive-control']),
    assignment: 'fixed',
    slots: 1,
  }),
  termination: Object.freeze({
    worldTickCap: WORLD_TICK_CAP,
    perRunTimeoutMs: PER_RUN_TIMEOUT_MS,
  }),
  metrics: REFERENCE_METRIC_IDS,
  ablation: Object.freeze({ mode: 'none', primitives: Object.freeze([]) }),
  kind: 'gate',
  // Zero: every run of a deterministic universe either completes or has found a
  // defect, and a threshold above zero is a threshold that hides one.
  failureThreshold: 0,
});
