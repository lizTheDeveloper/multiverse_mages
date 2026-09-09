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
 * the file is the experiment"* (`sweep-spec.ts`). TypeScript here rather than
 * JSON under `balance/sweeps/` because task 8.5 owns that directory and its
 * format, and a JSON file nobody typechecks against {@link SweepSpec} is a sweep
 * whose first typo surfaces at dispatch. This is the *shakedown* sweep: proof
 * the harness runs a real universe end to end, not a baseline.
 *
 * **Not a gate sweep, and it may not produce a baseline.** `kind` is `gate`
 * because `SweepSpec` has two kinds and this is the small one — sample size, not
 * authority. `release-plan.md` forbids a balance claim before 0.5.0, and every
 * metric here is a vital sign rather than a §7 metric (`measures.ts`).
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
 * runs, computed by `runner.ts` for **any** arm that describes itself, and
 * already in every sweep summary unnamed — listing them here would let a sweep
 * declare a column every record fills with `{unavailable, per-arm-scope}` beside
 * a summary carrying the real number. One quantity reported twice, once as an
 * absence, is what a reader two years on has to reverse-engineer.
 *
 * Derived from the registry, not typed out: a list of ids maintained beside the
 * registry is the two-lists failure `measures.ts` names, and how a metric comes
 * to be declarable and uncollectable, or collected and undeclarable.
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
 * The strategy registry is the real bot pool, not a list of names: a sweep
 * naming a strategy the pool cannot build would otherwise fail inside a worker,
 * once per run, instead of once before dispatch.
 *
 * **Two metric registries, joined** — `measures.ts`'s vital signs and §7's
 * per-run half, because `executor.ts` collects both and a sweep can only declare
 * what it is validated against. Before this the §7 collectors were unreachable
 * from any sweep file: the validator rejected their ids at expansion, which is
 * why `collectRunMetrics` had no production caller and seven metrics were
 * structurally incapable of moving.
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
 * Short on purpose: this sweep shows that forty-eight real universes can be run,
 * recorded, aggregated and reproduced. `mages-and-species` task 9.2 owns the
 * two-hundred-year run — a different instrument at a different cost.
 */
const WORLD_TICK_CAP = 24;

/**
 * Wall-clock budget for one run.
 *
 * Two orders of magnitude above what a twenty-four-tick reference universe takes
 * on an idle machine, because this bounds a *hang*, not a slow run: a budget
 * tight enough to catch a slow machine catches the machine, and the run it
 * abandons is recorded `failed` and excluded from every rate.
 */
const PER_RUN_TIMEOUT_MS = 60_000;

/**
 * The shakedown sweep: four parameter cells, twelve replicates, forty-eight runs.
 *
 * Two factors, both moving what a universe *is* at tick zero rather than how it
 * is measured:
 *
 * - `cohortSize` scales the founding population, and with it the labour feeding
 *   it and the student cohorts mages are promoted from.
 * - `foundingNodes` scales what the universe knows on day one — at this build
 *   the only lever on transmission at all, since nothing raises mastery and a
 *   node is teachable only if a god granted it at full mastery
 *   (`reference-universe.ts`).
 *
 * `foundingMages` is a registered factor, deliberately *not* varied: three
 * factors would be eight cells and ninety-six runs to prove plumbing.
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
    // no system reads `ctx.actions`. Eight strategies would produce eight
    // identical universes and a pairwise matrix of ties, which reads as a
    // finding about the strategies rather than the build. The suite asserts that
    // substitution directly instead.
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
