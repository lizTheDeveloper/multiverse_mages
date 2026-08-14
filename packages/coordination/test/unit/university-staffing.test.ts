/*
 * Multiverse Mages — a university owns its scribes, and a thousand of them
 * cannot own the same ones.
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
 * `UNIVERSITY_STAFF` shipped in `WORLD_COMPONENTS` with no reader and no
 * writer, and `world-step.ts` said what that cost in as many words:
 *
 * > The scribe cohorts are the universe's, not the university's … Taking the
 * > whole scribe population is the honest placeholder.
 *
 * Honest, and much larger than it sounds. Over-supply *per university* is
 * over-supply multiplied by the number of universities, so under the
 * placeholder a universe with one scribe cohort and twelve universities
 * reported that cohort twelve times — every institution fully staffed, and
 * founding the thirteenth as productive as founding the first. Which is the
 * arithmetic behind `archivist` building roughly 1,300 universities and
 * reaching the fifty-one nodes that building none reaches.
 *
 * ## What is asserted, and what deliberately is not
 *
 * Directions and identities, never magnitudes — `release-plan.md` forbids a
 * balance claim before 0.5.0 and every constant in the scribing path is marked
 * untuned. The claims here are: a cohort is counted **once**; an unstaffed
 * university produces **nothing**; the count of unstaffed institutions is
 * **visible**; and a link **outlives the tick that made it**.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import {
  LIBRARY,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  attachRecord,
  collectRecords,
  componentOf,
} from '@mm/state';
import { staffCohortsOf, staffLinks, universityOf } from '@mm/rules-world';

import { defineWorldSimulation } from '../../src/index.js';

import { scribingTraditionId, seededWorld, sourceFor, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 0x0006_c000;

/** `fp(1.0)` — a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/** A university, finished or not, with an empty library. */
function found(state: SimState, buildProgress: number): EntityHandle {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 64,
    buildProgress,
  });
  return university;
}

interface RunOptions {
  readonly completed: number;
  readonly unfinished?: number;
  readonly ticks?: number;
}

function run(options: RunOptions) {
  const traditionId = scribingTraditionId();
  const deps = worldDeps(traditionId);
  const simulation = defineWorldSimulation(deps);
  const { state, mages } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    traditionId,
    cohortSize: 40,
    magesPerSpecies: 2,
  });

  const universities: EntityHandle[] = [];
  for (let index = 0; index < options.completed; index += 1) {
    universities.push(found(state, FP_ONE));
  }
  const unfinished: EntityHandle[] = [];
  for (let index = 0; index < (options.unfinished ?? 0); index += 1) {
    unfinished.push(found(state, FP_ONE / 2));
  }

  // Every mage at the first university, so affiliation is not what varies.
  const mageStore = componentOf(state, MAGE);
  for (const mage of mages) mageStore.set(mage, 'universityId', universities[0] ?? 0);

  let current = state;
  for (let tick = 0; tick < (options.ticks ?? 4); tick += 1) {
    current = step(current, [], sourceFor(ROOT_SEED));
  }
  return { state: current, simulation, universities, unfinished };
}

/** Scribe cohorts in the universe, and how many people are in them. */
function scribePopulation(state: SimState): { cohorts: number; people: number } {
  let cohorts = 0;
  let people = 0;
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    if (row.occupation !== OCCUPATION.scribe) continue;
    cohorts += 1;
    people += row.count;
  }
  return { cohorts, people };
}

describe('a scribe cohort is counted once, however many universities exist', () => {
  it('assigns each cohort to exactly one university', () => {
    const { state } = run({ completed: 12 });
    const links = staffLinks(state);
    const cohortsSeen = links.map((link) => link.cohort);

    // The injectivity that makes the whole thing mean something. The link row
    // has no count field, so a cohort on two staffs is that cohort's scribes
    // counted twice — the global pool again, reached the long way round.
    expect(new Set(cohortsSeen).size).toBe(cohortsSeen.length);
    for (const link of links) expect(universityOf(state, link.cohort)).toBe(link.university);
  });

  it('leaves the universities it has no cohort for visibly empty', () => {
    const { state, simulation, universities } = run({ completed: 12 });
    const scribes = scribePopulation(state);
    const report = simulation.lastReport();

    // Twelve institutions, six species' worth of scribe cohorts. Six get one
    // each and six get nothing, and the report says so — the number that under
    // the global pool was structurally unobservable, because every university
    // reported itself fully staffed.
    expect(scribes.cohorts).toBeLessThan(universities.length);
    expect(report?.universitiesUnstaffed).toBe(universities.length - scribes.cohorts);

    const staffed = universities.filter((handle) => staffCohortsOf(state, handle).length > 0);
    expect(staffed).toHaveLength(scribes.cohorts);
  });

  it('spreads cohorts rather than piling them on the lowest handle', () => {
    const { state, universities } = run({ completed: 3 });
    const loads = universities.map((handle) => staffCohortsOf(state, handle).length);
    // Round-robin by least load. Construction deliberately does the opposite
    // with its stone; both choices are stated where they are made.
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it('does not staff a building site', () => {
    const { state, unfinished } = run({ completed: 2, unfinished: 4 });
    // `construction.ts`: a university "MUST NOT admit students, host staff, or
    // contribute library capital" before `fp(1024)`. The "host staff" half of
    // that sentence had nothing to enforce it until there was staff to host.
    for (const handle of unfinished) expect(staffCohortsOf(state, handle)).toEqual([]);
    for (const link of staffLinks(state)) expect(unfinished).not.toContain(link.university);
  });
});

describe('the staff outlive the tick that hired them', () => {
  it('does not re-assign a cohort that is already employed', () => {
    const short = run({ completed: 6, ticks: 2 });
    const long = run({ completed: 6, ticks: 12 });

    // A link is state, not a per-tick recomputation. If the phase re-hired
    // every tick, the link count would track the tick count; it tracks the
    // cohort count instead.
    expect(short.simulation.lastReport()?.staffAssigned).toBe(0);
    expect(long.simulation.lastReport()?.staffAssigned).toBe(0);
    expect(staffLinks(long.state).length).toBe(scribePopulation(long.state).cohorts);
  });

  it('never leaves a link pointing at a cohort that no longer exists', () => {
    // Cohorts merge and empty in the populace phase, and the staffing phase runs
    // straight after it for that reason. Over twelve ticks of mortality and
    // reallocation, no surviving link may name a dead cohort.
    const { state } = run({ completed: 6, ticks: 12 });
    const cohortStore = componentOf(state, POPULACE_COHORT);
    for (const { row } of collectRecords(state, UNIVERSITY_STAFF)) {
      expect(cohortStore.has(row.cohortId as EntityHandle)).toBe(true);
      expect(componentOf(state, UNIVERSITY).has(row.universityId as EntityHandle)).toBe(true);
    }
  });

  it('is deterministic: the same seed staffs the same universities', () => {
    const first = run({ completed: 9, ticks: 8 });
    const second = run({ completed: 9, ticks: 8 });
    expect(staffLinks(second.state)).toEqual(staffLinks(first.state));
  });
});
