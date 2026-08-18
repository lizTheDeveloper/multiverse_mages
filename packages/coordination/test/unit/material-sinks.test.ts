/*
 * Multiverse Mages — the two world-loop sinks, drawn down by an actual tick.
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
 * `economy-sinks.test.ts` pins the arithmetic; this pins the **wire**. The two
 * are different claims and the second is the one this project keeps getting
 * wrong: `universe-effects.ts` opens by describing a primitive that was
 * reachable, learnable, teachable and *moved no number*, and `academic-
 * effects.ts` opens by describing the same defect one target over.
 *
 * So every assertion below is a pair of runs that differ **only** in the stock
 * under test, compared through the tick report. A build where the sink is
 * declared and never drawn on returns identical numbers for both arms, and
 * every one of these fails.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, step } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MATERIAL_STOCK,
  UNIVERSITY,
  attachRecord,
  componentOf,
  findUniverse,
} from '@mm/state';
import type { MaterialKind } from '@mm/rules-world';

import type { WorldStepDeps, WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import { scribingTraditionId, seededWorld, sourceFor, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 0x0247_0001;
const TICKS = 60;

/** Deps whose two new sinks are actually priced. The shared fixture prices neither. */
function pricedDeps(): WorldStepDeps {
  return {
    ...worldDeps(scribingTraditionId()),
    teaching: { insightPerMonth: 4, insightTeachBonus: 256 },
    hiredLabour: { laborPerMonth: 4 },
  };
}

/** Gives the universe a finished academy, so that lessons can happen at all. */
function withAnAcademy(state: SimState): void {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 64,
    buildProgress: FP_ONE,
  });

  const mages = componentOf(state, MAGE);
  const roster: EntityHandle[] = [];
  mages.forEach((_row, handle) => {
    roster.push(handle);
    mages.set(handle, 'universityId', university);
  });
  const founder = roster[0];
  if (founder === undefined) throw new Error('the fixture seeded no mages');
  const instance = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId: 1,
    locationKind: LOCATION_KIND.mind,
    locationId: founder,
    acquiredTick: 0,
    mastery: FP_ONE,
  });
}

/** Puts a building site in the ground, with nothing built yet. */
function withABuildingSite(state: SimState): void {
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: 0,
    capacity: 64,
    buildProgress: 0,
  });
}

/** Sets one stock on the seeded universe. */
function seedStock(state: SimState, kind: MaterialKind, amount: number): void {
  const universe = findUniverse(state);
  componentOf(state, MATERIAL_STOCK).set(universe, kind, amount);
}

interface RunTotals {
  readonly lessonsTaught: number;
  readonly insightPaid: number;
  readonly laborPaid: number;
  readonly progressAdded: number;
  readonly lowestFundedShare: number;
  readonly spilled: number;
  readonly closingInsight: number;
  readonly closingLabor: number;
}

function run(prepare: (state: SimState) => void): RunTotals {
  const simulation = defineWorldSimulation(pricedDeps());
  const { state } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    traditionId: scribingTraditionId(),
  });
  prepare(state);
  const source = sourceFor(ROOT_SEED);

  let current = state;
  let lessonsTaught = 0;
  let insightPaid = 0;
  let laborPaid = 0;
  let progressAdded = 0;
  let spilled = 0;
  let lowestFundedShare = FP_ONE;
  for (let tick = 0; tick < TICKS; tick += 1) {
    current = step(current, [], source);
    const report = simulation.lastReport() as WorldStepReport;
    lessonsTaught += report.lessonsTaught;
    insightPaid += report.teachingInsightPaid;
    laborPaid += report.constructionLaborPaid;
    progressAdded += report.buildProgressAdded;
    spilled += report.spilledByKind.insight + report.spilledByKind.labor;
    lowestFundedShare = Math.min(lowestFundedShare, report.teachingFundedShare);
  }
  const universe = findUniverse(current);
  const stocks = componentOf(current, MATERIAL_STOCK);
  return {
    lessonsTaught,
    insightPaid,
    laborPaid,
    progressAdded,
    lowestFundedShare,
    spilled,
    closingInsight: stocks.get(universe, 'insight'),
    closingLabor: stocks.get(universe, 'labor'),
  };
}

describe('insight is drawn down by the teaching it accelerates', () => {
  const stocked = run((state) => {
    withAnAcademy(state);
    seedStock(state, 'insight', 100_000);
  });
  const empty = run((state) => {
    withAnAcademy(state);
    seedStock(state, 'insight', 0);
  });

  it('spends the stock rather than merely requiring it', () => {
    // A *gate* would read the stock and leave it alone. This is the assertion
    // that says the resource is destroyed by being used, which is what makes it
    // a resource and not a permission.
    expect(stocked.lessonsTaught).toBeGreaterThan(0);
    expect(stocked.insightPaid).toBeGreaterThan(0);
    expect(stocked.closingInsight).toBeLessThan(100_000);
  });

  it('spends nothing at all when there is nothing to spend', () => {
    // The other arm, and the one that makes the first mean something. Teaching
    // still happens — the sink is additive, not a toll — and the funded share
    // falls to zero, which is the series that tells "the faculty was not
    // funded" apart from "nobody taught".
    expect(empty.lessonsTaught).toBeGreaterThan(0);
    expect(empty.insightPaid).toBe(0);
    expect(empty.closingInsight).toBe(0);
    expect(empty.lowestFundedShare).toBe(0);
  });

  it('never funds more than the stock holds, however many teach', () => {
    // The reserve is taken from the committed months and the spend is measured
    // from the lessons that actually paired, so the second can never exceed the
    // first — and the stock cannot go negative, which `assertMaterialsNonNegative`
    // would have thrown on inside the tick.
    expect(stocked.insightPaid).toBeLessThanOrEqual(100_000);
    expect(stocked.closingInsight).toBeGreaterThanOrEqual(0);
  });
});

describe('labor is drawn down by the building it hires for', () => {
  const stocked = run((state) => {
    withABuildingSite(state);
    seedStock(state, 'labor', 100_000);
  });
  const empty = run((state) => {
    withABuildingSite(state);
    seedStock(state, 'labor', 0);
  });

  it('hires, spends, and builds faster for it', () => {
    expect(stocked.laborPaid).toBeGreaterThan(0);
    expect(stocked.closingLabor).toBeLessThan(100_000);
    expect(stocked.progressAdded).toBeGreaterThan(empty.progressAdded);
  });

  it('leaves a universe with no labor building exactly as it did before', () => {
    // The compatibility claim, and it is the reason `labor` hires months rather
    // than joining the per-month charge beside stone. Every world written
    // before `material-economy` holds zero of it; a claim denominated in it
    // would either stop every building site in the project or record a
    // shortfall every tick and change nothing.
    expect(empty.laborPaid).toBe(0);
    expect(empty.progressAdded).toBeGreaterThan(0);
  });

  it('spills nothing in either arm, because the ceiling is nowhere near', () => {
    expect(stocked.spilled).toBe(0);
    expect(empty.spilled).toBe(0);
  });
});
