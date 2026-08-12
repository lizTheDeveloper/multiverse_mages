/*
 * Multiverse Mages — the knowledge census, taken every 12 world ticks from
 * tick 0. Task 6.4.
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
 * ## The interval is a pinned constant, not a tuning knob
 *
 * `contracts.md` §7 defines `knowledgeHalfLife` and `libraryDependence` in one
 * line each and leaves the sampling rate unstated. This change pins it at **12
 * world ticks — one world year** (§1.1's `ERA_TICKS` neighbourhood; a world year
 * is twelve world months), beginning at **world tick 0** and continuing to run
 * termination.
 *
 * Both consequences of that pin are consequences a reader of a baseline needs to
 * know about, so both are written down here rather than discovered later:
 *
 * 1. **Loss times are observed at census resolution.** A node whose last
 *    instance burns at tick 305 is recorded as lost at the tick-312 census. The
 *    survival curve is therefore a step function on a 12-tick lattice, and
 *    `knowledgeHalfLife` is always a multiple of 12. Halving the interval would
 *    move every reported half-life, which is precisely why the interval is
 *    covered by `definitionVersion` and not by a config file.
 * 2. **A node lost and rediscovered between two censuses is invisible.** The
 *    census sees existence, not events. This is a deliberate accepted loss of
 *    resolution: an event stream would see every flicker, and would also make
 *    the metric a function of how many times a node was rediscovered rather than
 *    of how long knowledge survives.
 *
 * ## Why the recorder decides, and not the caller
 *
 * The executor calls {@link KnowledgeCensus.offer} every world tick and this
 * module decides whether that tick is a census tick. The alternative — the
 * executor computing `tick % 12 === 0` itself — puts the pinned constant in the
 * caller, where a second caller would eventually write `% 10` and no conformance
 * check anywhere would notice two sweeps sampling at different rates under one
 * metric name.
 */

import type { CensusSample } from './metrics-telemetry.js';

/**
 * One world year. Pinned by this change; covered by `knowledgeHalfLife`'s and
 * `libraryDependence`'s `definitionVersion`.
 */
export const KNOWLEDGE_CENSUS_INTERVAL_TICKS = 12;

/** The census tick at or below `worldTick`. */
export function isCensusTick(worldTick: number): boolean {
  if (!Number.isInteger(worldTick) || worldTick < 0) {
    throw new RangeError(`A census tick must be a non-negative integer, received ${String(worldTick)}.`);
  }
  return worldTick % KNOWLEDGE_CENSUS_INTERVAL_TICKS === 0;
}

/**
 * Every census tick a run of `ticksRun` world ticks would sample, ascending.
 *
 * Inclusive of tick 0 and inclusive of `ticksRun` when it lands on the lattice.
 * A run that stopped at tick 24 was *at* tick 24, and the census taken there is
 * the one that observes whatever the final step destroyed.
 */
export function censusTicks(ticksRun: number): number[] {
  if (!Number.isInteger(ticksRun) || ticksRun < 0) {
    throw new RangeError(`ticksRun must be a non-negative integer, received ${String(ticksRun)}.`);
  }
  const ticks: number[] = [];
  for (let tick = 0; tick <= ticksRun; tick += KNOWLEDGE_CENSUS_INTERVAL_TICKS) ticks.push(tick);
  return ticks;
}

/**
 * Accumulates a run's census samples.
 *
 * One instance per run, never shared: two runs sharing an accumulator is the
 * defect the harness's "no shared mutable state between runs" requirement names,
 * and it would show up as one universe's knowledge appearing in another's
 * half-life.
 */
export class KnowledgeCensus {
  readonly #samples: CensusSample[] = [];

  /**
   * Offers a tick. Records a sample if it is a census tick; ignores it otherwise.
   *
   * @param existingNodeIds - Nodes with instance count ≥ 1, ascending.
   * @param singleInstanceNodeIds - Nodes with instance count exactly 1, ascending.
   * @returns whether a sample was taken, so a caller can skip the work of
   * building the two lists on the eleven ticks in twelve that discard them.
   *
   * @throws RangeError on a tick that is not strictly greater than the last one
   * sampled. A census taken twice at one tick doubles that cohort's weight in
   * the pooled survival estimate, and a census taken out of order makes elapsed
   * times negative — both produce a number rather than an error.
   */
  offer(
    worldTick: number,
    existingNodeIds: readonly number[],
    singleInstanceNodeIds: readonly number[],
  ): boolean {
    if (!isCensusTick(worldTick)) return false;
    const last = this.#samples.at(-1);
    if (last !== undefined && worldTick <= last.worldTick) {
      throw new RangeError(
        `Census offered tick ${String(worldTick)} after tick ${String(last.worldTick)}. Samples ` +
          'must advance: a repeated tick double-counts a cohort and an earlier one makes elapsed ' +
          'survival times negative.',
      );
    }
    this.#samples.push({
      worldTick,
      existingNodeIds: [...existingNodeIds],
      singleInstanceNodeIds: [...singleInstanceNodeIds],
    });
    return true;
  }

  /** The samples taken, in tick order. */
  samples(): readonly CensusSample[] {
    return this.#samples;
  }
}

/**
 * Checks a census the harness did not build — an offline re-aggregation, or a
 * telemetry record that crossed a worker boundary.
 *
 * Returns the problems rather than throwing, because a re-aggregation reading
 * ten thousand records wants to name every bad one rather than stop at the first.
 */
export function censusProblems(samples: readonly CensusSample[]): string[] {
  const problems: string[] = [];
  let previous = -1;
  for (const [index, sample] of samples.entries()) {
    if (!Number.isInteger(sample.worldTick) || sample.worldTick < 0) {
      problems.push(`sample ${String(index)}: worldTick ${String(sample.worldTick)} is not a tick.`);
      continue;
    }
    if (sample.worldTick % KNOWLEDGE_CENSUS_INTERVAL_TICKS !== 0) {
      problems.push(
        `sample ${String(index)}: worldTick ${String(sample.worldTick)} is not a multiple of ` +
          `${String(KNOWLEDGE_CENSUS_INTERVAL_TICKS)}, the pinned census interval.`,
      );
    }
    if (sample.worldTick <= previous) {
      problems.push(
        `sample ${String(index)}: worldTick ${String(sample.worldTick)} does not advance past ` +
          `${String(previous)}.`,
      );
    }
    previous = sample.worldTick;
    const existing = new Set(sample.existingNodeIds);
    if (existing.size !== sample.existingNodeIds.length) {
      problems.push(`sample ${String(index)}: existingNodeIds lists a node twice.`);
    }
    for (const nodeId of sample.singleInstanceNodeIds) {
      if (!existing.has(nodeId)) {
        problems.push(
          `sample ${String(index)}: node ${String(nodeId)} has exactly one instance but is not ` +
            'listed as existing. A node with one instance exists by definition (§1.5), so the two ' +
            'lists were built from different moments.',
        );
      }
    }
  }
  return problems;
}
