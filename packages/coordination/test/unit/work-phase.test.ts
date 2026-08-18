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

/**
 * Per-test budget, raised from vitest's 5 s default.
 *
 * Every test here steps a real universe for tens of world ticks, and there are
 * thirteen of them in one file. Measured in isolation on a loaded machine the
 * whole file takes about 110 s and individual tests 30-55 s, which is over the
 * default by an order of magnitude — so what a default-budget failure reports is
 * the machine's scheduler, not the loop.
 *
 * `knowledge-capital.test.ts` and `reference-time-to-tier.test.ts` both carry
 * the same constant for the same reason, and both say the same thing about it:
 * a timeout under load is a scheduling fact reported as a behaviour failure.
 * This file had no budget at all until W116 added four affiliation tests to it
 * and the two oldest ones began timing out — which is the shape that argument
 * predicts, arriving in the file that had not yet taken the lesson.
 */
const TIMEOUT_MS = 120_000;
/** Five world years, as `world-step.test.ts` uses. Group 9 owns the long run. */
const TICKS = 60;

/** `fp(1.0)` — a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/**
 * Sums a field across every tick's report.
 *
 * `async`, and the yield inside is load-bearing rather than stylistic. A vitest
 * worker answers its runner over an RPC channel, and a runner that has not heard
 * from one in a while treats it as dead — `[vitest-worker]: Timeout calling
 * "onTaskUpdate"`, which fails the whole run *while reporting every test as
 * passed*. CI saw exactly that with 4,617 of 4,617 green.
 *
 * Sixty ticks of real simulation is a long synchronous block and this file runs
 * thirteen of them. Yielding once a world year is the cadence
 * `assembled-run-values.test.ts` and `runLongReference` already use, for the
 * reason they state: it changes no number, because the simulation between yields
 * is unchanged and entirely synchronous.
 */
async function totals(ticks: number, prepare?: (state: SimState) => void) {
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
    magesAffiliated: 0,
    affiliationsRefused: 0,
  };
  let peakEfforts = 0;
  let peakHosted = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = step(current, [], source);
    const report = simulation.lastReport() as WorldStepReport;
    summed.researchCompleted += report.researchCompleted;
    summed.lessonsTaught += report.lessonsTaught;
    summed.grimoiresScribed += report.grimoiresScribed;
    summed.materialsScribed += report.materialsScribed;
    summed.magesAffiliated += report.magesAffiliated;
    summed.affiliationsRefused += report.affiliationsRefused;
    peakEfforts = Math.max(peakEfforts, report.effortsInFlight);
    peakHosted = Math.max(peakHosted, mostCrowded(current));
    if (tick % 12 === 11) await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return { state: current, ...summed, peakEfforts, peakHosted };
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

/**
 * The same academy, with **nobody in it**.
 *
 * `withAnAcademy` affiliates every mage by hand, which was the only way any
 * mage was ever affiliated: `completeAffiliation` had no production caller, so
 * the `affiliate` goal completed nothing and a universe's own promotions stayed
 * unaffiliated for life. This fixture is that one line removed, so the loop has
 * to do it — and an unaffiliated mage may not scribe, so the shelves are the
 * measurement.
 */
function withAnEmptyAcademy(state: SimState): void {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 64,
    buildProgress: FP_ONE,
  });

  const roster: EntityHandle[] = [];
  componentOf(state, MAGE).forEach((_row, handle) => {
    roster.push(handle);
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

/** The largest number of living mages any one university holds. */
function mostCrowded(state: SimState): number {
  const hosted = new Map<number, number>();
  let most = 0;
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive === 0 || row.universityId === 0) continue;
    const count = (hosted.get(row.universityId) ?? 0) + 1;
    hosted.set(row.universityId, count);
    if (count > most) most = count;
  }
  return most;
}

/**
 * One academy with **two seats**, and nobody in it.
 *
 * The positive control for `contracts.md` §1.4's `capacity`. On every shipped
 * position the bound is slack — the founding academy seats 64 against tens of
 * mages, and a god-founded one seats 32 — so `affiliationsRefused` is zero in
 * every run anybody will take, and a zero from a bound that never binds is
 * indistinguishable from a bound nobody wired. Two seats makes it bind on the
 * first tick anyone applies.
 */
function withTwoSeats(state: SimState): void {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: SEATS,
    buildProgress: FP_ONE,
  });
}

/** Seats in the {@link withTwoSeats} academy. */
const SEATS = 2;

/** How many living mages belong to a university, and how many there are. */
function affiliation(state: SimState): { living: number; affiliated: number } {
  let living = 0;
  let affiliated = 0;
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    living += 1;
    if (row.universityId !== 0) affiliated += 1;
  }
  return { living, affiliated };
}

describe('mages join the institution nobody put them in', () => {
  it('affiliates a population that started unaffiliated', async () => {
    const before = await totals(0, withAnEmptyAcademy);
    expect(affiliation(before.state).affiliated).toBe(0);

    const run = await totals(TICKS, withAnEmptyAcademy);
    const { living, affiliated } = affiliation(run.state);
    expect(living).toBeGreaterThan(0);
    expect(affiliated).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('writes books it could not have written, because scribing needs a university', async () => {
    // The whole point of the goal, stated as the thing it unlocks. Before the
    // call was wired this run produced zero grimoires and zero scribed
    // materials, because `scribeThroughputFor` returns zero for
    // `universityId === 0` and `isFeasible` masks `scribe` on it.
    const run = await totals(TICKS, withAnEmptyAcademy);
    expect(run.grimoiresScribed).toBeGreaterThan(0);
    expect(componentOf(run.state, GRIMOIRE).size).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('refuses the third applicant rather than seating her, and says so', async () => {
    // Both halves of `contracts.md` §1.4's bound, which is one bound and two
    // observations. `capacity.ts`: *"Admission beyond capacity MUST be refused
    // rather than silently truncated, and the refused demand MUST be
    // observable."* A run that reported no refusal and also never overfilled
    // would be a run where nobody ever applied.
    const run = await totals(TICKS, withTwoSeats);
    expect(run.affiliationsRefused).toBeGreaterThan(0);
    expect(run.peakHosted).toBeLessThanOrEqual(SEATS);
    expect(affiliation(run.state).affiliated).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('does not leave the refused queueing outside it for the rest of the run', async () => {
    // The livelock this bound could have introduced, asserted against. A mage
    // refused a seat must stop *wanting* one — `universityPreference` filters a
    // full university out of her options, so `betterAffiliationAvailable` goes
    // false and `affiliate` is masked — or she would re-adopt the goal every
    // evaluation and spend her life applying to a building that is full.
    //
    // The measurement is the universe's *work*: a universe whose unaffiliated
    // majority is queueing does no research, because `affiliate` accrues
    // nothing. Two seats out of a whole population, and it still researches.
    const run = await totals(TICKS, withTwoSeats);
    expect(run.researchCompleted).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('stays deterministic with affiliation in it', async () => {
    const first = await totals(20, withAnEmptyAcademy);
    const second = await totals(20, withAnEmptyAcademy);
    expect(snapshotHash(second.state)).toBe(snapshotHash(first.state));
  }, TIMEOUT_MS);
});

describe('a stepped universe finishes what its mages start', () => {
  it('completes research, and banks progress on what is still in flight', async () => {
    const run = await totals(TICKS);
    expect(run.researchCompleted).toBeGreaterThan(0);
    // Not a rate — the point is that unfinished work is *kept*. A loop that
    // discarded it every tick would still complete research eventually and would
    // report nothing in flight at the end of any tick.
    expect(run.peakEfforts).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('teaches and scribes once the two missing preconditions are supplied', async () => {
    const run = await totals(TICKS, withAnAcademy);
    expect(run.researchCompleted).toBeGreaterThan(0);
    expect(run.lessonsTaught).toBeGreaterThan(0);
    expect(run.grimoiresScribed).toBeGreaterThan(0);
    expect(run.materialsScribed).toBeGreaterThan(0);
    expect(componentOf(run.state, GRIMOIRE).size).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('holds no effort row for a mage who is not working', async () => {
    // Every row names a living mage. A row for a dead one would be work nobody
    // is doing, and the death path clears them for exactly that reason.
    const run = await totals(30, withAnAcademy);
    const alive = componentOf(run.state, MAGE).field('alive');
    const mages = componentOf(run.state, MAGE);
    for (const { row } of collectRecords(run.state, EFFORT_PROGRESS)) {
      const subject = row.subject as EntityHandle;
      expect(mages.has(subject)).toBe(true);
      expect(alive[mages.rowOf(subject)]).not.toBe(0);
    }
  }, TIMEOUT_MS);

  it('carries banked progress through a save, byte for byte', async () => {
    // The claim the component exists for, at the loop's own scale: a run saved
    // and resumed must be the run that was not interrupted. A ledger beside the
    // state would pass every test above and fail this one.
    const run = await totals(20, withAnAcademy);
    expect(componentOf(run.state, EFFORT_PROGRESS).size).toBeGreaterThan(0);

    const simulation = defineWorldSimulation(worldDeps(scribingTraditionId()));
    const restored = loadWorldSnapshot(serializeState(run.state), simulation.schema);
    expect(snapshotHash(restored)).toBe(snapshotHash(run.state));
  }, TIMEOUT_MS);
});

describe('the loop stays deterministic with work in it', () => {
  it('produces the same history twice, and a different one from another seed', async () => {
    const first = await totals(20, withAnAcademy);
    const second = await totals(20, withAnAcademy);
    expect(snapshotHash(second.state)).toBe(snapshotHash(first.state));
    expect(second.researchCompleted).toBe(first.researchCompleted);
    expect(second.lessonsTaught).toBe(first.lessonsTaught);
  }, TIMEOUT_MS);

  it('names a real content revision, so the fixture is the shipped content', () => {
    // A guard on the fixture rather than on the loop: every claim above is about
    // the game's own species and node graph, and would be worth much less over
    // invented ones.
    expect(registry().contentRevision).toMatch(/^[0-9a-f]{32}$/);
  }, TIMEOUT_MS);
});
