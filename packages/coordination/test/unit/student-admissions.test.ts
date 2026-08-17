/*
 * Multiverse Mages — a university's capacity refuses, and the refusal is a
 * number somebody can read.
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
 * ## The defect this file measures
 *
 * `contracts.md` §1.4 gives a university a `capacity` and the `universities`
 * spec says what must happen at it: *"Admission beyond capacity MUST be refused
 * rather than silently truncated, and the refused demand MUST be observable."*
 * `admitStudents` and `AdmissionRefusals` implemented that rule and **had no
 * production caller** — the world loop instead passed the raw seat count in as
 * `demand[student]`, which is the silent truncation, and no series anywhere in
 * the report could tell a universe short of seats from a universe with no
 * appetite for study.
 *
 * The bound was binding the whole time. Measured on this tree at
 * `2026-08-16`, reference universe, seed `0x00090001`, `cohortSize 4`, 600
 * ticks: `student` pins to **exactly 64** — the one university's capacity —
 * from tick 480 onward while `idle` grows to 132, and every tick of that run
 * reported nothing about it.
 *
 * ## Every assertion here has a control that must fail it
 *
 * A refusal test whose fixture has no applicants passes for the wrong reason,
 * and so does one whose expected value is `undefined`. So each claim below is
 * paired:
 *
 * - **the gate binds** is paired with **ample seats refuse nobody**, on the
 *   same applicant pool, so a gate that refused unconditionally fails the
 *   second and a gate wired to nothing fails the first;
 * - every count is asserted to be an **integer** as well as a value, because
 *   `undefined > 0` and `undefined === 0` are both `false` and a missing field
 *   would otherwise sail through a one-sided comparison;
 * - the applicant pool itself is asserted non-zero before anything is concluded
 *   from a zero refusal.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { serializeState, snapshotHash, step } from '@mm/sim-core';
import {
  LIBRARY,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  loadWorldSnapshot,
} from '@mm/state';
import type { CohortDemography } from '@mm/rules-world';
import { RETIREMENT_NORMALIZED_AGE, createCohortStore } from '@mm/rules-world';

import type { WorldStepReport } from '../../src/index.js';
import { admitStudentBodies, defineWorldSimulation } from '../../src/index.js';

import { scribingTraditionId, seededWorld, sourceFor, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 0x0007_a000;

/** `fp(1.0)` — a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/** One species, long-lived and quick to mature, so ages are easy to reason about. */
const DEMOGRAPHY: CohortDemography = { lifespanMonths: 1000, maturityMonths: 100 };
const SPECIES: () => CohortDemography | undefined = () => DEMOGRAPHY;

/** A world with no universities at all, for the direct pass. */
function emptyWorld(): SimState {
  const traditionId = scribingTraditionId();
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  return seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    traditionId,
    cohortSize: 1,
    magesPerSpecies: 1,
  }).state;
}

/** Founds a university with an empty library. */
function found(state: SimState, capacity: number, buildProgress: number): EntityHandle {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, { libraryId: library, capacity, buildProgress });
  return university;
}

/**
 * An applicant pool: `idle` people of working age, plus optional sitting
 * students.
 *
 * A standalone store rather than the world's, because `admitStudentBodies` asks
 * the cohort store who wants a seat and the entity store who owns a building,
 * and keeping them apart is what lets one fixture vary the pool without
 * disturbing the buildings.
 */
function applicants(options: { idle: number; students?: number; worldTick: number }) {
  const cohorts = createCohortStore();
  if (options.idle > 0) {
    cohorts.add(
      { speciesId: 1, occupation: OCCUPATION.idle, birthTickBucket: options.worldTick - 200 },
      options.idle,
    );
  }
  if ((options.students ?? 0) > 0) {
    cohorts.add(
      { speciesId: 1, occupation: OCCUPATION.student, birthTickBucket: options.worldTick - 200 },
      options.students ?? 0,
    );
  }
  return cohorts;
}

const WORLD_TICK = 500;

describe('capacity refuses, and refusing is not truncating', () => {
  it('turns applicants away when the seats run out', () => {
    const state = emptyWorld();
    const university = found(state, 10, FP_ONE);
    const outcome = admitStudentBodies(state, applicants({ idle: 40, worldTick: WORLD_TICK }), {
      species: SPECIES,
      worldTick: WORLD_TICK,
    });

    expect(outcome.applicants).toBe(40);
    expect(outcome.granted).toBe(10);
    expect(outcome.refused).toBe(30);
    expect(outcome.byUniversity).toEqual([{ university, refused: 30 }]);
  });

  /**
   * The control for the test above. Same pool, same code path, seats enough for
   * everybody — so a gate that refused unconditionally, or one that reported a
   * constant, fails here rather than passing both.
   */
  it('refuses nobody when there are seats to spare', () => {
    const state = emptyWorld();
    found(state, 4096, FP_ONE);
    const outcome = admitStudentBodies(state, applicants({ idle: 40, worldTick: WORLD_TICK }), {
      species: SPECIES,
      worldTick: WORLD_TICK,
    });

    expect(outcome.applicants).toBe(40);
    expect(outcome.granted).toBe(40);
    expect(outcome.refused).toBe(0);
    // Empty rather than a zero row: a university that turned nobody away did
    // not refuse, and `AdmissionRefusals.record` treats zero as a no-op.
    expect(outcome.byUniversity).toEqual([]);
  });

  it('counts sitting students as applicants, because a seat they hold is a seat', () => {
    const state = emptyWorld();
    found(state, 10, FP_ONE);
    const outcome = admitStudentBodies(
      state,
      applicants({ idle: 6, students: 8, worldTick: WORLD_TICK }),
      { species: SPECIES, worldTick: WORLD_TICK },
    );

    // Fourteen want a desk and ten exist. Were the eight already studying not
    // counted, `granted` would be 6 and the loop would ask the labour market to
    // send six *more* people into a building holding eight.
    expect(outcome.applicants).toBe(14);
    expect(outcome.granted).toBe(10);
    expect(outcome.refused).toBe(4);
  });

  it('seats nobody in a half-built university, and records no refusal against it', () => {
    const state = emptyWorld();
    found(state, 64, FP_ONE / 2);
    const outcome = admitStudentBodies(state, applicants({ idle: 12, worldTick: WORLD_TICK }), {
      species: SPECIES,
      worldTick: WORLD_TICK,
    });

    expect(outcome.granted).toBe(0);
    expect(outcome.refused).toBe(12);
    // A building nobody could attend did not turn anybody away. `byUniversity`
    // is the per-institution figure, and listing a site under construction in
    // it would make "this university is short of seats" and "this university is
    // not open yet" the same reading.
    expect(outcome.byUniversity).toEqual([]);
  });

  it('spills into the next university, and both doors report what they turned away', () => {
    const state = emptyWorld();
    const first = found(state, 10, FP_ONE);
    const second = found(state, 5, FP_ONE);
    const outcome = admitStudentBodies(state, applicants({ idle: 40, worldTick: WORLD_TICK }), {
      species: SPECIES,
      worldTick: WORLD_TICK,
    });

    expect(outcome.granted).toBe(15);
    // Thirty were turned away by the first and twenty-five by the second, and
    // twenty-five studied nowhere. The two readings are different questions and
    // `admissions.ts` says which is which.
    expect(outcome.refused).toBe(25);
    expect(outcome.byUniversity).toEqual([
      { university: first, refused: 30 },
      { university: second, refused: 25 },
    ]);
  });

  it('does not count the retired among the applicants', () => {
    const state = emptyWorld();
    found(state, 4096, FP_ONE);
    const cohorts = createCohortStore();
    // Past `RETIREMENT_NORMALIZED_AGE` of a 1000-month life: `occupations.ts`
    // retires such a cohort into `idle` and forbids it every destination but
    // `idle`, so counting it here would invent a want the mover can never
    // satisfy — the same phantom demand this change removes.
    const retiredAge = Math.ceil((1000 * RETIREMENT_NORMALIZED_AGE) / FP_ONE) + 12;
    cohorts.add(
      { speciesId: 1, occupation: OCCUPATION.idle, birthTickBucket: WORLD_TICK - retiredAge },
      50,
    );
    const outcome = admitStudentBodies(state, cohorts, {
      species: SPECIES,
      worldTick: WORLD_TICK,
    });

    expect(outcome.applicants).toBe(0);
    expect(outcome.granted).toBe(0);
  });
});

/**
 * A run through `step`, because the direct pass above proves the arithmetic and
 * not the wire. `world-step.ts` is where `admitStudentBodies` has to be called
 * for any of it to reach the game.
 */
function runUniverse(options: { capacity: number; ticks: number }) {
  const traditionId = scribingTraditionId();
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  const { state } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    traditionId,
    cohortSize: 40,
    magesPerSpecies: 2,
  });
  found(state, options.capacity, FP_ONE);

  let current = state;
  const reports: WorldStepReport[] = [];
  for (let tick = 0; tick < options.ticks; tick += 1) {
    current = step(current, [], sourceFor(ROOT_SEED));
    const report = simulation.lastReport();
    if (report !== undefined) reports.push(report);
  }
  return { state: current, simulation, reports };
}

/** People in `idle` cohorts, for the applicant-pool sanity check. */
function idlePopulation(state: SimState): number {
  let total = 0;
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    if (row.occupation === OCCUPATION.idle) total += row.count;
  }
  return total;
}

describe('the loop asks, and reports the answer', () => {
  it('reports a refusal at a full university, and none at a spacious one', () => {
    const TICKS = 40;
    const tight = runUniverse({ capacity: 1, ticks: TICKS });
    const roomy = runUniverse({ capacity: 4096, ticks: TICKS });

    const peak = (reports: WorldStepReport[], field: keyof WorldStepReport): number =>
      reports.reduce((best, report) => Math.max(best, report[field] as number), 0);

    // The fixture has to have applicants at all, or every claim below is about
    // an empty pool. This is the assertion that would have caught an "it went
    // green because nobody applied" pass.
    expect(idlePopulation(tight.state)).toBeGreaterThan(0);
    expect(peak(tight.reports, 'studentApplicants')).toBeGreaterThan(1);

    // Integers, not truthiness: a missing field is `undefined`, and
    // `undefined > 0` is `false` — which reads as "no refusal" rather than as
    // "no such field".
    for (const report of tight.reports) {
      expect(Number.isInteger(report.studentApplicants)).toBe(true);
      expect(Number.isInteger(report.studentSeatsGranted)).toBe(true);
      expect(Number.isInteger(report.studentsRefused)).toBe(true);
    }

    expect(peak(tight.reports, 'studentsRefused')).toBeGreaterThan(0);
    // One seat, so the grant can never exceed one.
    expect(peak(tight.reports, 'studentSeatsGranted')).toBeLessThanOrEqual(1);

    // The control: same universe, four thousand seats, and the same applicants
    // are refused nowhere.
    expect(peak(roomy.reports, 'studentApplicants')).toBeGreaterThan(1);
    expect(peak(roomy.reports, 'studentsRefused')).toBe(0);
  });

  it('names the university that refused', () => {
    const run = runUniverse({ capacity: 1, ticks: 40 });
    const refusing = run.reports.filter((report) => report.studentRefusalsByUniversity.length > 0);
    expect(refusing.length).toBeGreaterThan(0);
    for (const report of refusing) {
      expect(report.studentRefusalsByUniversity).toHaveLength(1);
      const [entry] = report.studentRefusalsByUniversity;
      expect(entry?.refused).toBeGreaterThan(0);
      // Offers refused at the one door equal the people who studied nowhere,
      // because there is only one door. With two they diverge, which is the
      // spill test above.
      expect(entry?.refused).toBe(report.studentsRefused);
    }
  });

  /**
   * The durability claim, and the reason no component was added for it.
   *
   * Every input the admission pass reads is already in the snapshot — cohort
   * counts and keys, `UNIVERSITY.capacity`, `UNIVERSITY.buildProgress` — so the
   * refusal is *reproduced* by a restored universe rather than remembered by
   * it. A stored tally would be a projection inside the hashed snapshot, which
   * `world-step.ts` rejects for the desync it invites, and it would be a weaker
   * claim: a counter that survives a save says nothing about whether the rule
   * that wrote it still runs.
   */
  it('reproduces the same refusal after a save and a reload', () => {
    const run = runUniverse({ capacity: 1, ticks: 40 });

    // One more tick on the universe that never left memory.
    const continued = step(run.state, [], sourceFor(ROOT_SEED));
    const before = run.simulation.lastReport();

    // And the same tick on one that went through a save. A second simulation,
    // so the two reports cannot be the same closure's value read twice.
    const reloaded = defineWorldSimulation(worldDeps(scribingTraditionId()));
    const restored = loadWorldSnapshot(serializeState(run.state), reloaded.schema);
    expect(snapshotHash(restored)).toBe(snapshotHash(run.state));
    const resumed = step(restored, [], sourceFor(ROOT_SEED));
    expect(snapshotHash(resumed)).toBe(snapshotHash(continued));

    const after = reloaded.lastReport();
    expect(before).toBeDefined();
    expect(after).toBeDefined();

    // Non-zero first, or "they agree" is a statement about two zeros.
    expect(before?.studentsRefused).toBeGreaterThan(0);
    expect(after?.studentsRefused).toBe(before?.studentsRefused);
    expect(after?.studentApplicants).toBe(before?.studentApplicants);
    expect(after?.studentSeatsGranted).toBe(before?.studentSeatsGranted);
    expect(after?.studentRefusalsByUniversity).toEqual(before?.studentRefusalsByUniversity);
  });
});
