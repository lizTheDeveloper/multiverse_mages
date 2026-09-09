/*
 * Multiverse Mages — W257: does a university refill its seats after a cohort
 * graduates, or is it a one-time conversion?
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
 * ## The question
 *
 * `packages/coordination/test/unit/student-enrolment.test.ts` builds a world in
 * which all 64 seats fill at t0, sixty enrol at t3, and **nothing enrols for the
 * remaining fifty-seven ticks** while hundreds of applicants stand unseated.
 * `sourcePriorityFor(student)` is `[idle]` and nothing else
 * (`packages/rules-world/src/populace/reallocation.ts`), and that fixture seeds
 * no idle cohort, so its `student` occupation can never be refilled.
 *
 * If that were also true of the *reference* universe, a university would be a
 * one-time conversion rather than an institution, and *"the more universities
 * you have, the more latent magic users you can activate"* would be a claim
 * about tick 0 only.
 *
 * The fixture is not the reference universe. This probe asks the reference
 * universe directly.
 *
 * ## Both arms, because a zero is the answer that has been wrong all campaign
 *
 * A counter that reports "no re-enrolment" is worthless until it has been shown
 * reporting one. So the probe runs the identical counter over two worlds:
 *
 * - **`open`** — the reference universe as shipped. The positive arm: if the
 *   counter cannot see a re-enrolment here, the counter is broken.
 * - **`sealed`** — the same universe with every academy's `capacity` set to
 *   zero before the first step, so `effectiveCapacity` is zero, `demand[student]`
 *   is zero, and no idle cohort can ever be moved into a seat. The negative arm:
 *   if the counter reports re-enrolments *here*, the counter is broken the other
 *   way.
 *
 * `capacity` rather than `buildProgress`, because construction would re-complete
 * a building whose progress was reset and the arm would quietly heal.
 *
 * **Run it from the repository root**, after `npx tsc --build`. Node resolves
 * `@mm/*` from *this file's* directory upward, so a copy run from a scratch
 * directory measures a different tree's build and says nothing about this one.
 *
 *     node scripts/w257-university-refill-probe.mjs [--ticks 900] [--cohort 4]
 */

import { rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';
import { OCCUPATION, POPULACE_COHORT, UNIVERSITY, collectRecords, componentOf } from '@mm/state';
import { enrolmentFraction, prevalenceOf } from '@mm/rules-world';
import { LONG_RUN_OPTIONS, buildReferenceState, referenceContent } from '@mm/scenario';

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1 || at + 1 >= process.argv.length) return fallback;
  return Number(process.argv[at + 1]);
}

const TICKS = flag('ticks', 900);
const COHORT_SIZE = flag('cohort', 4);
const SEED = 0x0009_0001;

/** `fp(1.0)` — a completed university. */
const FP_ONE = 1024;

const content = referenceContent();

/** Headcount per occupation, plus the seats that are actually open. */
function census(current) {
  const byOccupation = [0, 0, 0, 0, 0];
  for (const { row } of collectRecords(current, POPULACE_COHORT)) {
    byOccupation[row.occupation] += row.count;
  }
  let seats = 0;
  for (const { row } of collectRecords(current, UNIVERSITY)) {
    if (row.buildProgress >= FP_ONE) seats += row.capacity;
  }
  return {
    laborer: byOccupation[OCCUPATION.laborer],
    scribe: byOccupation[OCCUPATION.scribe],
    student: byOccupation[OCCUPATION.student],
    soldier: byOccupation[OCCUPATION.soldier],
    idle: byOccupation[OCCUPATION.idle],
    seats,
  };
}

function run(arm) {
  const simulation = defineWorldSimulation(content.deps);
  let state = buildReferenceState({
    runSeed: SEED,
    options: { ...LONG_RUN_OPTIONS, cohortSize: COHORT_SIZE, foundingNodes: 4 },
    content,
    schema: simulation.schema,
  });

  if (arm === 'sealed') {
    const universities = componentOf(state, UNIVERSITY);
    for (const { handle } of collectRecords(state, UNIVERSITY)) {
      universities.set(handle, 'capacity', 0);
    }
  }

  const series = [];
  const totals = {
    studentsEnrolled: 0,
    magesGraduated: 0,
    unseated: 0,
    latentUnactivated: 0,
    studentsRefused: 0,
    births: 0,
    populaceRetired: 0,
  };
  // The cadence question: how many ticks after the first enrolment does the
  // student occupation come back from zero, and how often does it happen again?
  let ticksWithEnrolment = 0;
  let ticksWithStudents = 0;
  let firstEnrolmentTick = -1;
  let lastEnrolmentTick = -1;
  let previous = census(state);

  for (let tick = 1; tick <= TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    const sample = census(state);

    for (const key of Object.keys(totals)) totals[key] += report[key] ?? 0;
    if (report.studentsEnrolled > 0) {
      ticksWithEnrolment += 1;
      if (firstEnrolmentTick === -1) firstEnrolmentTick = tick;
      lastEnrolmentTick = tick;
    }
    if (sample.student > 0) ticksWithStudents += 1;

    series.push({
      tick,
      ...sample,
      // The idle→student valve, as a net. `reallocateOccupations` is the only
      // thing that raises the student headcount, and `enrolMaturedStudents` is
      // the only thing that lowers it (plus mortality), so a positive delta on
      // a tick that also enrolled somebody is a seat being refilled.
      studentDelta: sample.student - previous.student,
      enrolled: report.studentsEnrolled,
      graduated: report.magesGraduated,
      unseated: report.unseated,
      latentUnactivated: report.latentUnactivated,
      applicants: report.studentApplicants,
      granted: report.studentSeatsGranted,
      refused: report.studentsRefused,
      latent: report.latentMagicUsers,
      // Seats are physically occupied by *student mages*, not by the populace
      // `student` occupation — `freeSeatsByUniversity` counts `MAGE_ROLE.student`
      // rows against `UNIVERSITY.capacity`. So this is the number that decides
      // whether a chair is empty while the admission pass reports a refusal.
      studentMages: report.studentMages,
      births: report.births,
      livingMages: report.livingMages,
      population: report.population,
    });
    previous = sample;
  }

  return {
    arm,
    totals,
    // The demand controller's own arithmetic, re-run on the final state.
    // `latentMagicUsers` sums `floorDiv(count × prevalence, 1024)` **per
    // cohort**, over a cohort space fragmented by species × occupation × birth
    // decade — the shape `reallocation.ts` calls a one-way valve, in the
    // controller rather than in the mover. Summing the same fraction once over
    // the same people says how much the per-cohort floor throws away.
    latentAccounting: latentAccounting(state, worldTickOf(TICKS)),
    ticksWithEnrolment,
    ticksWithStudents,
    firstEnrolmentTick,
    lastEnrolmentTick,
    series,
  };
}

/** The world tick a run of `ticks` steps ends on. */
function worldTickOf(ticks) {
  return ticks;
}

/**
 * `Σ floor(count × prevalence)` against `floor(Σ count × prevalence)`, over
 * every school-age cohort — the demand controller's number beside the number it
 * is approximating.
 */
function latentAccounting(current, worldTick) {
  let perCohortFloor = 0;
  let unfloored = 0;
  let schoolAgeHeads = 0;
  let cohorts = 0;
  let contributing = 0;
  for (const { row } of collectRecords(current, POPULACE_COHORT)) {
    if (row.count === 0) continue;
    const species = content.deps.speciesOf(row.speciesId);
    if (species === undefined) continue;
    if (worldTick - row.birthTickBucket < species.maturityMonths) continue;
    const fraction = enrolmentFraction(prevalenceOf(species));
    cohorts += 1;
    schoolAgeHeads += row.count;
    const floored = Math.floor((row.count * fraction) / FP_ONE);
    if (floored > 0) contributing += 1;
    perCohortFloor += floored;
    unfloored += (row.count * fraction) / FP_ONE;
  }
  return {
    schoolAgeCohorts: cohorts,
    cohortsContributing: contributing,
    schoolAgeHeads,
    perCohortFloor,
    unflooredSum: Math.floor(unfloored),
  };
}

/** Enrolments summed inside each window, so a decay is visible as a shape. */
function windows(series, width) {
  const rows = [];
  for (let start = 0; start < series.length; start += width) {
    const slice = series.slice(start, start + width);
    if (slice.length === 0) continue;
    rows.push({
      from: slice[0].tick,
      to: slice[slice.length - 1].tick,
      enrolled: slice.reduce((sum, row) => sum + row.enrolled, 0),
      graduated: slice.reduce((sum, row) => sum + row.graduated, 0),
      refused: slice.reduce((sum, row) => sum + row.refused, 0),
      unseated: slice.reduce((sum, row) => sum + row.unseated, 0),
      enrolTicks: slice.filter((row) => row.enrolled > 0).length,
      latentMin: Math.min(...slice.map((row) => row.latent)),
      latentMax: Math.max(...slice.map((row) => row.latent)),
      studentMin: Math.min(...slice.map((row) => row.student)),
      studentMax: Math.max(...slice.map((row) => row.student)),
      idleEnd: slice[slice.length - 1].idle,
      laborerEnd: slice[slice.length - 1].laborer,
      seats: slice[slice.length - 1].seats,
    });
  }
  return rows;
}

const results = { open: run('open'), sealed: run('sealed') };

console.log(
  `reference universe, cohortSize ${String(COHORT_SIZE)}, seed 0x${(SEED >>> 0).toString(16)}, ` +
    `${String(TICKS)} ticks\n`,
);

for (const arm of ['open', 'sealed']) {
  const result = results[arm];
  console.log(`── arm: ${arm} ──`);
  console.log(
    `  ticks that enrolled somebody: ${String(result.ticksWithEnrolment)} / ${String(TICKS)}` +
      `   first ${String(result.firstEnrolmentTick)}  last ${String(result.lastEnrolmentTick)}`,
  );
  console.log(`  ticks with a non-empty student occupation: ${String(result.ticksWithStudents)}`);
  console.log(`  totals: ${JSON.stringify(result.totals)}`);
  console.log(
    '  from    to  enrol  gradu  enrolTicks  student(min..max)  latent(min..max)  idle  laborer  seats',
  );
  for (const row of windows(result.series, 100)) {
    console.log(
      '  ' +
        String(row.from).padStart(4) +
        String(row.to).padStart(6) +
        String(row.enrolled).padStart(7) +
        String(row.graduated).padStart(7) +
        String(row.enrolTicks).padStart(12) +
        `  ${String(row.studentMin)}..${String(row.studentMax)}`.padStart(19) +
        `  ${String(row.latentMin)}..${String(row.latentMax)}`.padStart(18) +
        String(row.idleEnd).padStart(6) +
        String(row.laborerEnd).padStart(9) +
        String(row.seats).padStart(7),
    );
  }
  // The cadence, tick by tick, for every tick that enrolled somebody — plus the
  // two ticks around it, because "does the seat come back" is a question about
  // what the student headcount does *after* a cohort leaves.
  const marked = new Set();
  for (const row of result.series) {
    if (row.enrolled > 0) {
      for (let offset = -1; offset <= 2; offset += 1) marked.add(row.tick + offset);
    }
  }
  if (marked.size > 0) {
    console.log('  enrolment events (± 2 ticks)');
    console.log(
    '  tick  student  latent  stuMage  free  enrol  gradu  applic  grant  refus  idle  laborer',
  );
    for (const row of result.series) {
      if (!marked.has(row.tick)) continue;
      console.log(
        '  ' +
          String(row.tick).padStart(4) +
          String(row.student).padStart(9) +
          String(row.latent).padStart(8) +
          String(row.studentMages).padStart(9) +
          String(row.seats - row.studentMages).padStart(6) +
          String(row.enrolled).padStart(7) +
          String(row.graduated).padStart(7) +
          String(row.applicants).padStart(8) +
          String(row.granted).padStart(7) +
          String(row.refused).padStart(7) +
          String(row.idle).padStart(6) +
          String(row.laborer).padStart(9),
      );
    }
  }
  // A lower bound on what the idle→student valve moved across the whole run:
  // the student headcount only rises when `reallocateOccupations` moves
  // somebody into a seat, so the positive deltas sum to at least that.
  const movedIn = result.series.reduce((sum, row) => sum + Math.max(0, row.studentDelta), 0);
  console.log(`  idle→student, summed positive deltas: ${String(movedIn)}`);
  // Who else is spending the same 6.25% pool. `sourcePriorityFor` draws `idle`
  // first for every target, and `OCCUPATIONS_IN_ORDER` visits `laborer` and
  // `scribe` *before* `student`, so a rise in either is a seat the university
  // did not get offered. Summed positive deltas, which for `laborer` and
  // `scribe` can only come from a transfer — nobody is born into one.
  const rises = {};
  for (const occupation of ['laborer', 'scribe', 'soldier', 'student']) {
    let sum = 0;
    let previousRow;
    for (const row of result.series) {
      if (previousRow !== undefined) sum += Math.max(0, row[occupation] - previousRow[occupation]);
      previousRow = row;
    }
    rises[occupation] = sum;
  }
  console.log(`  summed positive deltas by occupation: ${JSON.stringify(rises)}`);
  console.log(`  latent accounting at the final tick: ${JSON.stringify(result.latentAccounting)}`);
  console.log('');
}

const open = results.open;
const sealed = results.sealed;
const verdict =
  open.totals.studentsEnrolled > 0 && open.lastEnrolmentTick > TICKS / 2 && sealed.ticksWithEnrolment === 0
    ? 'REFILLS — and the counter reports zero on a universe whose seats were taken away.'
    : sealed.ticksWithEnrolment > 0
      ? 'PROBE BROKEN — the sealed arm enrolled somebody, so the counter is not measuring seats.'
      : 'DOES NOT REFILL — the open arm stopped enrolling too, and the sealed arm agrees.';
console.log(`verdict: ${verdict}`);
