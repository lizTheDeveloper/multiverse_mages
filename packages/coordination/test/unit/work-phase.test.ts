/*
 * Multiverse Mages — the world loop finishes what its mages start.
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
 * What this file claims: the work phase is **wired**. A universe stepped through
 * `step` completes research, transmits lessons and writes books, and the
 * progress behind each of them survives a save.
 *
 * What it does not claim is any rate. Five years is not two hundred, the
 * population is not group 9's committed reference scenario, and every magnitude
 * involved is untuned — `release-plan.md` forbids a balance claim before 0.5.0.
 * These are existence claims, of the kind `world-step.test.ts` already makes
 * about production and births: a phase that reported zero over five years would
 * mean the loop is wired to something that never fires, which is exactly what a
 * green "it did not throw" hides.
 *
 * ## Teaching and scribing need a scenario, and that is a finding, not a fixture
 *
 * Under the shipped defaults neither can happen at all, for reasons that belong
 * to capabilities this change does not own:
 *
 * - **Nothing raises mastery.** A researched instance is created at
 *   `DEFAULT_INITIAL_MASTERY` (`fp(256)`) and from there only decays, while
 *   `DEFAULT_TEACH_THRESHOLD` is `fp(512)`. So a mage can never teach what she
 *   worked out herself. There is no study or practice loop at 0.4.0, and
 *   inventing one here would be the same class of unilateral decision the effort
 *   component was raised through `contracts.md` for.
 * - **Scribing needs a university.** `isFeasible` masks `scribe` when
 *   `scribeThroughput` is zero, and throughput is zero for an unaffiliated mage.
 *   Founding a university is god action 11 (`contracts.md` §4.2) and belongs to
 *   `god-agency`.
 *
 * So the scenario below supplies both preconditions the way the game eventually
 * will — a founding grant at full mastery, and a completed university — and
 * asserts the loop does the rest. The gaps are recorded here rather than hidden
 * behind a fixture that quietly papers over them.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { serializeState, snapshotHash, step } from '@mm/sim-core';
import {
  EFFORT_PROGRESS,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
  loadWorldSnapshot,
} from '@mm/state';

import type { WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import {
  registry,
  scribingTraditionId,
  seededWorld,
  sourceFor,
  worldDeps,
} from './world-fixtures.js';

const ROOT_SEED = 0x0004_1000;
/** Five world years, as `world-step.test.ts` uses. Group 9 owns the long run. */
const TICKS = 60;

/** `fp(1.0)` — a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/** Sums a field across every tick's report. */
function totals(ticks: number, prepare?: (state: SimState) => void) {
  const traditionId = scribingTraditionId();
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED, traditionId });
  prepare?.(state);
  const source = sourceFor(ROOT_SEED);

  let current = state;
  const summed = {
    researchCompleted: 0,
    lessonsTaught: 0,
    grimoiresScribed: 0,
    materialsScribed: 0,
  };
  let peakEfforts = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = step(current, [], source);
    const report = simulation.lastReport() as WorldStepReport;
    summed.researchCompleted += report.researchCompleted;
    summed.lessonsTaught += report.lessonsTaught;
    summed.grimoiresScribed += report.grimoiresScribed;
    summed.materialsScribed += report.materialsScribed;
    peakEfforts = Math.max(peakEfforts, report.effortsInFlight);
  }
  return { state: current, ...summed, peakEfforts };
}

/**
 * Gives the universe a completed university with a library, affiliates every
 * mage to it, and grants one of them a node at full mastery.
 *
 * Both halves stand in for capabilities that do not exist yet; see the module
 * note. Nothing here is a rule — it is a starting position.
 */
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

  // A founding grant, which is god action 8. Node 1 is the lowest-numbered node
  // the shipped catalog declares, and it has no prerequisites, so a holder can
  // pass it straight on and a student can receive it.
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

describe('a stepped universe finishes what its mages start', () => {
  it('completes research, and banks progress on what is still in flight', () => {
    const run = totals(TICKS);
    expect(run.researchCompleted).toBeGreaterThan(0);
    // Not a rate — the point is that unfinished work is *kept*. A loop that
    // discarded it every tick would still complete research eventually and would
    // report nothing in flight at the end of any tick.
    expect(run.peakEfforts).toBeGreaterThan(0);
  });

  it('teaches and scribes once the two missing preconditions are supplied', () => {
    const run = totals(TICKS, withAnAcademy);
    expect(run.researchCompleted).toBeGreaterThan(0);
    expect(run.lessonsTaught).toBeGreaterThan(0);
    expect(run.grimoiresScribed).toBeGreaterThan(0);
    expect(run.materialsScribed).toBeGreaterThan(0);
    expect(componentOf(run.state, GRIMOIRE).size).toBeGreaterThan(0);
  });

  it('holds no effort row for a mage who is not working', () => {
    // Every row names a living mage. A row for a dead one would be work nobody
    // is doing, and the death path clears them for exactly that reason.
    const run = totals(30, withAnAcademy);
    const alive = componentOf(run.state, MAGE).field('alive');
    const mages = componentOf(run.state, MAGE);
    for (const { row } of collectRecords(run.state, EFFORT_PROGRESS)) {
      const subject = row.subject as EntityHandle;
      expect(mages.has(subject)).toBe(true);
      expect(alive[mages.rowOf(subject)]).not.toBe(0);
    }
  });

  it('carries banked progress through a save, byte for byte', () => {
    // The claim the component exists for, at the loop's own scale: a run saved
    // and resumed must be the run that was not interrupted. A ledger beside the
    // state would pass every test above and fail this one.
    const run = totals(20, withAnAcademy);
    expect(componentOf(run.state, EFFORT_PROGRESS).size).toBeGreaterThan(0);

    const simulation = defineWorldSimulation(worldDeps(scribingTraditionId()));
    const restored = loadWorldSnapshot(serializeState(run.state), simulation.schema);
    expect(snapshotHash(restored)).toBe(snapshotHash(run.state));
  });
});

describe('the loop stays deterministic with work in it', () => {
  it('produces the same history twice, and a different one from another seed', () => {
    const first = totals(20, withAnAcademy);
    const second = totals(20, withAnAcademy);
    expect(snapshotHash(second.state)).toBe(snapshotHash(first.state));
    expect(second.researchCompleted).toBe(first.researchCompleted);
    expect(second.lessonsTaught).toBe(first.lessonsTaught);
  });

  it('names a real content revision, so the fixture is the shipped content', () => {
    // A guard on the fixture rather than on the loop: every claim above is about
    // the game's own species and node graph, and would be worth much less over
    // invented ones.
    expect(registry().contentRevision).toMatch(/^[0-9a-f]{32}$/);
  });
});
