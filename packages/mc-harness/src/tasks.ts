/*
 * Multiverse Mages — turning an expanded sweep into the tasks a pool dispatches.
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
 * Twenty-odd lines in a file of their own, and the reason is a cycle rather
 * than taste.
 *
 * `buildTasks` used to live in `runner.ts`. Task group 7's `ablation.ts` needs
 * it — an arm's tasks must be built exactly the way a sweep's are, or the two
 * are not the same experiment — and `runner.ts` in turn needs the §7 metric
 * registry, which reaches `ablation.ts` through the collectors. The cycle
 * `runner -> metrics-registry -> metrics-collectors -> ablation -> runner`
 * type-checks, links, and then fails at *module initialization*: the first
 * module in the cycle to be evaluated reads a `const` from the last one before
 * it has been assigned, and the symptom is `Cannot convert undefined or null to
 * object` inside a frozen table, thrown from an import statement.
 *
 * Moving the leaf out is the fix that leaves no ambiguity about which module
 * owns task construction — there is still exactly one construction site, which
 * is the property the original doc comment was protecting.
 */

import type { RunTask } from './protocol.js';
import { deriveRunSeed } from './seed.js';
import type { SweepPlan, SweepSpec } from './sweep-spec.js';
import { assignStrategies } from './sweep-spec.js';

/**
 * Builds every task of a sweep, in canonical order, with seeds already derived.
 *
 * Exported because the reproduction path and the ablation scheduler both build
 * these and must build them the same way — a second construction site for tasks
 * is a second opinion about what a run is.
 *
 * @param options.ablatedSlotIndex - The agent slot carrying the neutralized
 * ruleset on a mirrored ablation arm. Absent everywhere else, including on the
 * control arm, so that a non-ablation sweep produces byte-identical tasks to the
 * ones it produced before task group 7 existed.
 */
export function buildTasks(
  spec: SweepSpec,
  plan: SweepPlan,
  options: { readonly ablatedSlotIndex?: number } = {},
): Map<number, RunTask> {
  const tasks = new Map<number, RunTask>();
  for (const cell of plan.cells) {
    for (let replicateIndex = 0; replicateIndex < spec.replicates; replicateIndex += 1) {
      const coordinates = {
        rootSeed: spec.rootSeed,
        sweepId: spec.sweepId,
        cellIndex: cell.cellIndex,
        replicateIndex,
      };
      const taskId = cell.cellIndex * spec.replicates + replicateIndex;
      tasks.set(taskId, {
        coordinates,
        runSeed: deriveRunSeed(coordinates),
        levels: cell.levels,
        strategies: assignStrategies(spec.agentPool, cell.cellIndex, replicateIndex),
        worldTickCap: spec.termination.worldTickCap,
        metrics: [...spec.metrics].sort(),
        ablatedPrimitives: [...spec.ablation.primitives].sort(),
        ...(options.ablatedSlotIndex === undefined
          ? {}
          : { ablatedSlotIndex: options.ablatedSlotIndex }),
      });
    }
  }
  return tasks;
}
