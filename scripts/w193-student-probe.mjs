/*
 * Multiverse Mages — W193: what students-as-entities cost, and what they do.
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
 * Runs the reference universe for `--ticks` at `--seed` and prints what W193 has
 * to report: entity count, serialized snapshot bytes, step time, and the
 * enrolment/graduation series.
 *
 * **It runs unchanged on `main`.** Every field W193 adds to the report is read
 * with `?? null`, so the same command against the two refs produces two
 * comparable objects rather than a crash on one of them. That is the point — a
 * probe that only runs on the branch cannot produce a before.
 *
 * Usage: node scripts/w193-student-probe.mjs [--ticks 600] [--seed 20268733]
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

const ticks = flag('ticks', 600);
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
  magesPromoted: 0,
  studentsEnrolled: 0,
  magesGraduated: 0,
  latentUnactivated: 0,
  unseated: 0,
  lessonsTaught: 0,
  researchCompleted: 0,
  births: 0,
};

const started = performance.now();
for (let index = 0; index < ticks; index += 1) {
  state = step(state, [], rngFromRootSeed(state.rootSeed));
  const report = simulation.lastReport();
  for (const key of Object.keys(totals)) totals[key] += report?.[key] ?? 0;
}
const elapsedMs = performance.now() - started;

const bytes = serializeState(state).byteLength;
const living = collectRecords(state, MAGE).filter((entry) => entry.row.alive === 1);
const students = living.filter((entry) => entry.row.roleId === 4);
const last = simulation.lastReport();

process.stdout.write(
  `${JSON.stringify(
    {
      ticks,
      seed,
      elapsedMs: Math.round(elapsedMs),
      msPerTick: Number((elapsedMs / ticks).toFixed(3)),
      snapshotBytes: bytes,
      entityCount: state.entities.liveCount ?? null,
      mageRows: collectRecords(state, MAGE).length,
      livingMages: living.length,
      studentMages: students.length,
      workingMages: living.length - students.length,
      population: last?.population ?? null,
      studentsStalled: last?.studentsStalled ?? null,
      totals,
      finalSnapshotHash: snapshotHash(state),
    },
    null,
    2,
  )}\n`,
);
