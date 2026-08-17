/*
 * Multiverse Mages — the university admission probe.
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
 * Prints the reference universe's student body beside the seats it has and the
 * applicants it turns away.
 *
 * The defect this exists to keep visible: `contracts.md` §1.4's `capacity` used
 * to bind through the *demand signal* — `world-step.ts` passed the raw seat
 * count into `computeOccupationDemand`, so `student` could never exceed it and
 * nobody was ever refused, which is the silent truncation the `universities`
 * spec forbids. The bound was binding hard and leaving no trace: measured on
 * `integration/all-branches` @ `8b454d5c` before `admissions.ts` existed,
 *
 *     tick 480  students=64  idle= 52  seats=64
 *     tick 600  students=64  idle=132  seats=64
 *
 * — pinned to the seat count for the last two centuries of the run, with no
 * series anywhere in the report saying so. `capacity.ts`: *"a bound that is
 * never observed to bind is a bound nobody can tune."*
 *
 * It is a probe and not a test. The assertions live in
 * `packages/coordination/test/unit/student-admissions.test.ts`; this is for
 * looking at a run and seeing the shape.
 *
 * **Run it from the repository root**, after `npm run typecheck` — this loads
 * `dist`, and Node resolves `@mm/*` from the *file's* directory upward, so a
 * copy of this script run from a scratch directory outside the checkout will
 * silently measure a different tree's build.
 *
 *     node scripts/admissions-probe.mjs [ticks]
 */

import { rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';
import { POPULACE_COHORT, UNIVERSITY, collectRecords } from '@mm/state';
import { LONG_RUN_OPTIONS, buildReferenceState, referenceContent } from '@mm/scenario';

const TICKS = Number(process.argv[2] ?? 600);
const SEED = 0x0009_0001;
const COHORT_SIZE = 4;

/** `fp(1.0)` — a completed university. */
const FP_ONE = 1024;

const content = referenceContent();
const simulation = defineWorldSimulation(content.deps);
let state = buildReferenceState({
  runSeed: SEED,
  options: { ...LONG_RUN_OPTIONS, cohortSize: COHORT_SIZE, foundingNodes: 4 },
  content,
  schema: simulation.schema,
});

/** Students, idle, and the seats that exist. */
function census(current) {
  let students = 0;
  let idle = 0;
  for (const { row } of collectRecords(current, POPULACE_COHORT)) {
    if (row.occupation === 2) students += row.count;
    if (row.occupation === 4) idle += row.count;
  }
  let seats = 0;
  for (const { row } of collectRecords(current, UNIVERSITY)) {
    if (row.buildProgress >= FP_ONE) seats += row.capacity;
  }
  return { students, idle, seats };
}

const MARKS = new Set([1, 6, 12, 24, 60, 120, 240, 360, 480, 600].filter((t) => t <= TICKS));
MARKS.add(TICKS);

console.log(
  `reference universe, cohortSize ${String(COHORT_SIZE)}, seed 0x${(SEED >>> 0).toString(16)}\n`,
);
console.log('tick  applicants  granted  refused  students   idle  seats   refused by');

let refusingTicks = 0;
for (let tick = 1; tick <= TICKS; tick += 1) {
  state = step(state, [], rngFromRootSeed(state.rootSeed));
  const report = simulation.lastReport();
  if (report === undefined) continue;
  if (report.studentsRefused > 0) refusingTicks += 1;
  if (!MARKS.has(tick)) continue;

  const sample = census(state);
  console.log(
    String(tick).padStart(4) +
      String(report.studentApplicants).padStart(12) +
      String(report.studentSeatsGranted).padStart(9) +
      String(report.studentsRefused).padStart(9) +
      String(sample.students).padStart(10) +
      String(sample.idle).padStart(7) +
      String(sample.seats).padStart(7) +
      '   ' +
      JSON.stringify(report.studentRefusalsByUniversity),
  );
}

console.log(
  `\nticks with a non-zero refusal: ${String(refusingTicks)} / ${String(TICKS)}\n` +
    'A run where that is zero while `idle` grows past `seats` is a run where the wire came out.',
);
