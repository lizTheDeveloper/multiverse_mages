/*
 * Multiverse Mages — W197: where `mageAptitude` sends a graduate.
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
 * Runs the reference universe and prints the career split, the living-mage
 * count, and whether seats ever bind.
 *
 * **It runs unchanged on `main` and on `w193/students-are-entities`.** Every
 * field W197 adds is read with `?? null` and the role histogram is taken from
 * `roleId` values that exist on every ref, so the same command against three
 * refs produces three comparable objects rather than a crash on two of them.
 *
 * Usage: node scripts/w197-career-probe.mjs [--ticks 1200] [--seed 589825]
 */

import { performance } from 'node:perf_hooks';

import { defineWorldSimulation } from '@mm/coordination';
import { MAGE, collectRecords } from '@mm/state';
import { rngFromRootSeed, serializeState, snapshotHash, step } from '@mm/sim-core';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '@mm/scenario';

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1 || at + 1 >= process.argv.length) return fallback;
  return Number(process.argv[at + 1]);
}

const ticks = flag('ticks', 1200);
const seed = flag('seed', LONG_RUN_SEED);

const content = referenceContent();
const simulation = defineWorldSimulation(content.deps);
let state = buildReferenceState({
  runSeed: seed,
  options: LONG_RUN_OPTIONS,
  content,
  schema: simulation.schema,
});

const totals = {
  studentsEnrolled: 0,
  magesGraduated: 0,
  graduatedAcademic: 0,
  graduatedPopulace: 0,
  latentUnactivated: 0,
  unseated: 0,
  studentsStalled: 0,
  lessonsTaught: 0,
  researchCompleted: 0,
  births: 0,
};

// `unseated` is reported per tick and the question is whether it *ever* binds,
// not what it sums to — a total of zero and a maximum of zero are the same
// number and different claims, and only the maximum answers "seats never bind".
let unseatedMaxTick = 0;
let unseatedTicks = 0;

const started = performance.now();
for (let index = 0; index < ticks; index += 1) {
  state = step(state, [], rngFromRootSeed(state.rootSeed));
  const report = simulation.lastReport();
  for (const key of Object.keys(totals)) totals[key] += report?.[key] ?? 0;
  const unseated = report?.unseated ?? 0;
  if (unseated > 0) unseatedTicks += 1;
  if (unseated > unseatedMaxTick) unseatedMaxTick = unseated;
}
const elapsedMs = performance.now() - started;

const ROLE_NAMES = ['researcher', 'warden', 'professor', 'raider', 'student', 'populace'];
const living = collectRecords(state, MAGE).filter((entry) => entry.row.alive === 1);
const byRole = {};
for (const name of ROLE_NAMES) byRole[name] = 0;
for (const entry of living) byRole[ROLE_NAMES[entry.row.roleId] ?? `role-${entry.row.roleId}`] += 1;

const graduates = totals.graduatedAcademic + totals.graduatedPopulace;

process.stdout.write(
  `${JSON.stringify(
    {
      ticks,
      seed,
      elapsedMs: Math.round(elapsedMs),
      snapshotBytes: serializeState(state).byteLength,
      livingMages: living.length,
      livingByRole: byRole,
      workingMages: living.length - byRole.student,
      populaceShareOfGraduates:
        graduates === 0 ? null : Number((totals.graduatedPopulace / graduates).toFixed(3)),
      seatsEverBound: unseatedMaxTick > 0,
      unseatedMaxTick,
      unseatedTicks,
      population: simulation.lastReport()?.population ?? null,
      totals,
      finalSnapshotHash: snapshotHash(state),
    },
    null,
    2,
  )}\n`,
);
