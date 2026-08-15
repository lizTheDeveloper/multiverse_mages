/*
 * Multiverse Mages — the world step loop runs, and runs the same way twice.
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
 * What this file claims, and what it does not.
 *
 * It claims the loop **runs** — a seeded universe of six species advances five
 * world years through every phase without throwing — and that it is
 * **deterministic**: two runs from the same seed produce byte-identical
 * snapshots at every tick, not merely at the end.
 *
 * It does not claim any of group 9's balance properties. Five years is not two
 * hundred, this population is not the committed reference scenario, and every
 * magnitude in the content is untuned. `release-plan.md` forbids a balance claim
 * before 0.5.0 and there is nothing here that could support one.
 */

import { describe, expect, it } from 'vitest';

import { CORE_ACTION, snapshotHash, step } from '@mm/sim-core';
import {
  MAGE,
  MATERIAL_STOCK,
  POPULACE_COHORT,
  UNIVERSE,
  componentOf,
  findUniverse,
  readRecord,
} from '@mm/state';

import { defineWorldSimulation } from '../../src/index.js';

import { seededWorld, sourceFor, worldDeps, registry } from './world-fixtures.js';

const ROOT_SEED = 0x0004_0000;
/** Five world years. A modest span, deliberately: group 9 owns the long run. */
const TICKS = 60;

function traditionId(): number {
  return registry().traditions[0]?.contentId ?? 1;
}

/** Steps a fresh universe for `ticks`, returning the hash after every tick. */
function run(rootSeed: number, ticks: number): { hashes: string[]; final: string } {
  const simulation = defineWorldSimulation(worldDeps(traditionId()));
  const { state } = seededWorld(simulation.schema, { rootSeed });
  const source = sourceFor(rootSeed);

  let current = state;
  const hashes: string[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    current = step(current, [], source);
    hashes.push(snapshotHash(current));
  }
  return { hashes, final: snapshotHash(current) };
}

describe('a seeded universe advances through every phase', () => {
  it('runs five world years without throwing', () => {
    expect(() => run(ROOT_SEED, TICKS)).not.toThrow();
  });

  it('advances the world clock by one month per step and no more', () => {
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    const source = sourceFor(ROOT_SEED);

    const after = step(step(state, [], source), [], source);
    expect(after.clock.worldTick).toBe(2);
  });

  it('reports work in every phase it claims to run', () => {
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    // `withUniversity`, because W193 made enrolment require a seat at a school
    // that has something to teach. Without one this test asserted that mages
    // appear from nowhere, which was true before the change and is a defect
    // rather than a property.
    const { state } = seededWorld(simulation.schema, {
      rootSeed: ROOT_SEED,
      withUniversity: true,
    });
    const source = sourceFor(ROOT_SEED);

    let current = state;
    let promoted = 0;
    let born = 0;
    let produced = 0;
    for (let tick = 0; tick < TICKS; tick += 1) {
      current = step(current, [], source);
      const report = simulation.lastReport();
      expect(report?.worldTick).toBe(tick);
      promoted += report?.magesPromoted ?? 0;
      born += report?.births ?? 0;
      produced += report?.materialsProduced ?? 0;
    }

    // Not balance claims — existence claims. A phase that reported zero over
    // five years would mean the loop is wired to something that never fires,
    // which is exactly the failure a green "it did not throw" test hides.
    expect(produced).toBeGreaterThan(0);
    expect(promoted).toBeGreaterThan(0);
    expect(born).toBeGreaterThan(0);
    expect(componentOf(current, MAGE).size).toBeGreaterThan(0);
    expect(componentOf(current, POPULACE_COHORT).size).toBeGreaterThan(0);
  });

  it('never drives any of the three material stocks negative', () => {
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    const source = sourceFor(ROOT_SEED);

    let current = state;
    for (let tick = 0; tick < TICKS; tick += 1) {
      current = step(current, [], source);
      const universe = findUniverse(current);
      // `materials` was one field on `UNIVERSE`; it is now three on
      // `MATERIAL_STOCK` (`components.ts`), and `assertMaterialsNonNegative`
      // (`materials.ts`) is a per-kind invariant — so the honest port of this
      // test checks all three, not their sum. A universe could in principle
      // have a negative `stone` stock and a large enough `food` surplus to
      // keep the sum non-negative, and that is exactly the defect this test
      // exists to catch.
      const stocks = componentOf(current, MATERIAL_STOCK);
      expect(stocks.has(universe)).toBe(true);
      expect(stocks.get(universe, 'food')).toBeGreaterThanOrEqual(0);
      expect(stocks.get(universe, 'stone')).toBeGreaterThanOrEqual(0);
      expect(stocks.get(universe, 'vellum')).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the loop is deterministic', () => {
  it('produces the same snapshot hash at every tick across two runs', () => {
    // Tick by tick, not only at the end. A final-hash comparison would leave an
    // engineer bisecting a whole simulation by hand on the day it fails, and a
    // determinism gate that is expensive to act on is one people disable.
    const first = run(ROOT_SEED, TICKS);
    const second = run(ROOT_SEED, TICKS);
    expect(second.hashes).toEqual(first.hashes);
    expect(second.final).toBe(first.final);
  });

  it('produces a different history from a different root seed', () => {
    // The control. Without it, "the hashes matched" would also pass for a loop
    // that does nothing at all.
    const first = run(ROOT_SEED, TICKS);
    const other = run(ROOT_SEED + 1, TICKS);
    expect(other.final).not.toBe(first.final);
  });
});

describe('the loop respects the clock it is given', () => {
  it('does nothing at all while the universe is in an engagement', () => {
    // §0: entering an engagement freezes world time for the participants. The
    // only thing that may change across the transition is the clock.
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    const source = sourceFor(ROOT_SEED);

    const inEngagement = step(state, [{ kind: CORE_ACTION.enterEngagement }], source);
    const beforeTick = readRecord(inEngagement, UNIVERSE, findUniverse(inEngagement));
    const mageCount = componentOf(inEngagement, MAGE).size;

    const later = step(inEngagement, [], source);
    expect(later.clock.worldTick).toBe(inEngagement.clock.worldTick);
    expect(readRecord(later, UNIVERSE, findUniverse(later))).toEqual(beforeTick);
    expect(componentOf(later, MAGE).size).toBe(mageCount);
  });
});
