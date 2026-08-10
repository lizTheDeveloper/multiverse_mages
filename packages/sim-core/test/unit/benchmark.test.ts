/*
 * Multiverse Mages — the benchmark harness is deterministic.
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
 * Task 9.3: the benchmark's *simulated* results must be identical across runs
 * at the same seed, with only the timing differing.
 *
 * The split between `bench/population.ts` and `scripts/bench.mjs` is what makes
 * that testable at all. The workload returns no duration, so everything it
 * returns is something two runs must agree on exactly — and this file can
 * assert that with `toEqual` rather than with a tolerance. Timing is not
 * measured here and must not be: a test that timed anything would be flaky on a
 * loaded CI machine and would be telling us about the runner, not the core.
 *
 * Kept deliberately small — a few hundred entities over a few hundred ticks.
 * This runs on every `npm test`; the real measurement is `npm run bench`.
 */

import { describe, expect, it } from 'vitest';

import { runPopulationBenchmark } from '../../bench/population.js';

/** Small enough for the unit suite, large enough to churn and reuse slots. */
const CONFIG = { entityCount: 300, ticks: 200, seed: 20260810 } as const;

describe('population benchmark determinism', () => {
  it('produces identical simulated results from two runs at the same seed', () => {
    const first = runPopulationBenchmark(CONFIG);
    const second = runPopulationBenchmark(CONFIG);

    // Whole-object equality, not a field-by-field spot check: the point of the
    // result type carrying no timing is that the entire thing is comparable.
    expect(second).toEqual(first);
    expect(second.finalSnapshotHash).toBe(first.finalSnapshotHash);
    expect(second.entityUpdates).toBe(first.entityUpdates);
  });

  it('actually did work, so the equality above is not vacuous', () => {
    const result = runPopulationBenchmark(CONFIG);

    // Two runs of a world that silently did nothing would also match. These
    // bounds are what separate "deterministic" from "inert".
    expect(result.entityUpdates).toBeGreaterThan(0);
    expect(result.created).toBe(result.churnPerTick * CONFIG.ticks);
    expect(result.destroyed).toBe(result.churnPerTick * CONFIG.ticks);
    expect(result.finalLiveCount).toBe(CONFIG.entityCount);
    expect(result.finalWorldTick).toBe(CONFIG.ticks);
    expect(result.finalSnapshotHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('churns hard enough that slots are reused, not merely appended', () => {
    // Slot reuse is the expensive path — free list, generation bump, component
    // swap-removal. If the workload only ever appended, the benchmark would be
    // measuring a world the game never reaches.
    const result = runPopulationBenchmark(CONFIG);
    expect(result.destroyed).toBeGreaterThan(CONFIG.entityCount);
  });

  it('separates runs by seed, so a number is attributable to its config', () => {
    const a = runPopulationBenchmark(CONFIG);
    const b = runPopulationBenchmark({ ...CONFIG, seed: CONFIG.seed + 1 });

    // Same amount of work either way — churn is fixed, not drawn — so the
    // throughput number stays comparable across seeds even though the state
    // does not.
    expect(b.finalSnapshotHash).not.toBe(a.finalSnapshotHash);
    expect(b.created).toBe(a.created);
    expect(b.destroyed).toBe(a.destroyed);
  });

  it('scales the reported work with the population it was asked for', () => {
    const small = runPopulationBenchmark({ entityCount: 100, ticks: 20, seed: 3 });
    const large = runPopulationBenchmark({ entityCount: 400, ticks: 20, seed: 3 });

    // entity-updates per second only means something if entity-updates track
    // the population. A harness whose work was flat in entityCount would report
    // a throughput that improved as the world got bigger.
    expect(large.entityUpdates).toBeGreaterThan(small.entityUpdates * 3);
  });

  it('rejects a configuration it cannot measure', () => {
    expect(() => runPopulationBenchmark({ entityCount: 0, ticks: 10, seed: 1 })).toThrow(
      /entityCount/,
    );
    expect(() => runPopulationBenchmark({ entityCount: 10, ticks: 0, seed: 1 })).toThrow(/ticks/);
    expect(() => runPopulationBenchmark({ entityCount: 10, ticks: 10, seed: -1 })).toThrow(/seed/);
  });
});
