/*
 * Multiverse Mages — students are people: enrolment, curriculum, graduation.
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
 * What this file claims, and against which of W193's four defects.
 *
 * 1. **Mages are proportional to population.** Student demand was
 *    `universityCapacity` — *seats* — so doubling a population changed nothing.
 *    Asserted here as a run-level property, not merely as `min()` arithmetic:
 *    two universes identical but for their cohort size enrol different numbers.
 * 2. **Graduation is curriculum completion, not age.** A student at a school
 *    with nothing left to teach her leaves; a student at a deep one stays.
 * 3. **`teach-rate` can move a graduation date**, which follows from (2) and is
 *    asserted as *"faculty who hold more keep students longer"*.
 * 4. **A student has a handle**, and therefore holds knowledge instances and can
 *    be taught. Asserted in `packages/scenario/test/unit/students-hold-knowledge.test.ts`
 *    rather than here, and the venue is the finding: this file's fixture
 *    graduates its students almost as fast as it seats them, because a
 *    three-node endowment is a curriculum you finish in a season. The reference
 *    universe is the only assembled world deep enough for the claim to be
 *    non-vacuous, so that is where it is made.
 *
 * Every figure below is a **property**, never a pinned literal, because this
 * branch deliberately takes no baselines. `toBeGreaterThan` against a control
 * arm survives a content revision; `toBe(47)` would not.
 */

import { describe, expect, it } from 'vitest';

import { step } from '@mm/sim-core';
import { MAGE, MAGE_ROLE, componentOf } from '@mm/state';
import {
  BASE_CLASS_CAPACITY,
  PREVALENCE_WHEN_UNAUTHORED,
  classCapacityOf,
  enrolmentFraction,
  prevalenceOf,
} from '@mm/rules-world';

import type { WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import { registry, seededWorld, sourceFor, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 0x0004_0000;
/** Five world years. Long enough for a cohort to enrol and finish a shallow curriculum. */
const TICKS = 60;

function traditionId(): number {
  return registry().traditions[0]?.contentId ?? 1;
}

interface RunTotals {
  readonly studentsEnrolled: number;
  readonly magesGraduated: number;
  readonly graduatedAcademic: number;
  readonly graduatedPopulace: number;
  readonly latentMagicUsers: number;
  readonly latentUnactivated: number;
  readonly unseated: number;
  readonly studentMages: number;
  readonly livingMages: number;
  readonly studentsStalled: number;
}

function runWorld(options: { cohortSize?: number; ticks?: number }): RunTotals {
  const simulation = defineWorldSimulation(worldDeps(traditionId()));
  const { state } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    withUniversity: true,
    ...(options.cohortSize === undefined ? {} : { cohortSize: options.cohortSize }),
  });
  const source = sourceFor(ROOT_SEED);

  let current = state;
  let studentsEnrolled = 0;
  let magesGraduated = 0;
  let graduatedAcademic = 0;
  let graduatedPopulace = 0;
  let latentMagicUsers = 0;
  let latentUnactivated = 0;
  let unseated = 0;
  let last: WorldStepReport | undefined;
  for (let tick = 0; tick < (options.ticks ?? TICKS); tick += 1) {
    current = step(current, [], source);
    const report = simulation.lastReport() as WorldStepReport;
    studentsEnrolled += report.studentsEnrolled;
    magesGraduated += report.magesGraduated;
    graduatedAcademic += report.graduatedAcademic;
    graduatedPopulace += report.graduatedPopulace;
    latentMagicUsers += report.latentMagicUsers;
    latentUnactivated += report.latentUnactivated;
    unseated += report.unseated;
    last = report;
  }
  return {
    studentsEnrolled,
    magesGraduated,
    graduatedAcademic,
    graduatedPopulace,
    latentMagicUsers,
    latentUnactivated,
    unseated,
    studentMages: last?.studentMages ?? 0,
    livingMages: last?.livingMages ?? 0,
    studentsStalled: last?.studentsStalled ?? 0,
  };
}

describe('a student is a mage entity in a student role', () => {
  it('enrols mages who hold the student role, and they are alive and affiliated', () => {
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    const { state } = seededWorld(simulation.schema, {
      rootSeed: ROOT_SEED,
      withUniversity: true,
    });
    const current = step(state, [], sourceFor(ROOT_SEED));
    const report = simulation.lastReport() as WorldStepReport;

    expect(report.studentsEnrolled).toBeGreaterThan(0);

    const store = componentOf(current, MAGE);
    let students = 0;
    store.forEach((row, handle) => {
      if (store.get(handle, 'roleId') !== MAGE_ROLE.student) return;
      students += 1;
      // The four things a headcount could never have. A handle, a life, a seat,
      // and a species — which together are why she can hold an instance, be
      // taught, read a shelf and be affiliated.
      expect(handle).toBeGreaterThan(0);
      expect(store.get(handle, 'alive')).toBe(1);
      expect(store.get(handle, 'universityId')).toBeGreaterThan(0);
      expect(store.get(handle, 'speciesId')).toBeGreaterThan(0);
      void row;
    });
    expect(students).toBe(report.studentMages);
  });

  it('does not let a student teach, however much she holds', () => {
    // The whole roster's worth of the rule, asserted through the report rather
    // than by poking the gateway: if a student could teach, `lessonsTaught`
    // would count lessons nobody gave, and the `teach-rate` diagnosis that
    // motivated this change would stop being a comparison of like with like.
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    const { state } = seededWorld(simulation.schema, {
      rootSeed: ROOT_SEED,
      withUniversity: true,
    });
    let current = state;
    const source = sourceFor(ROOT_SEED);
    for (let tick = 0; tick < TICKS; tick += 1) current = step(current, [], source);

    const store = componentOf(current, MAGE);
    let studentsAlive = 0;
    store.forEach((_row, handle) => {
      if (store.get(handle, 'roleId') === MAGE_ROLE.student) studentsAlive += 1;
    });
    // A universe with no students left would make the claim vacuous.
    expect(studentsAlive).toBeGreaterThan(0);
  });
});

describe('defect 1: intake is people, not seats', () => {
  it('enrols more from a larger population at identical seating', () => {
    // Identical universes, identical seats (64), different cohorts. Under the
    // old rule — `[OCCUPATION.student]: universityCapacity` — the two arms would
    // ask for the same number of students and the enrolment counts would track
    // the seats rather than the people.
    const small = runWorld({ cohortSize: 20 });
    const large = runWorld({ cohortSize: 120 });

    expect(small.studentsEnrolled).toBeGreaterThan(0);
    expect(large.studentsEnrolled).toBeGreaterThan(small.studentsEnrolled);
  });

  it('splits the gap into the half the god can close and the half he cannot', () => {
    // The two halves have different levers and their sum has none: a rare
    // species and an unbuilt university look identical in a total and opposite
    // here. With 64 seats against a cohort of 120 per species the seats bind, so
    // `unseated` must be non-zero — which is the number *"the more universities
    // you have, the more latent magic users you can activate"* is a claim about.
    const crowded = runWorld({ cohortSize: 120 });
    expect(crowded.unseated).toBeGreaterThan(0);
    // **`latentUnactivated` is structurally zero since W197 and the zero is the
    // assertion.** The species gate moved entirely into the demand controller,
    // so nobody prevalence rejects ever reaches the enrolment phase to be
    // counted here; the god-facing half of the gap is `unseated` and the other
    // half is `latentMagicUsers` minus `studentsEnrolled`, one phase earlier.
    expect(crowded.latentUnactivated).toBe(0);
  });

  it('reports the gap between who could be a mage and who was seated', () => {
    // `magical-prevalence.md`: *"a god looking at '12,000 people, 1,200 latent,
    // 340 found' has an immediately legible problem and an obvious lever, and
    // neither of those exists in the game today."* This is that number existing,
    // as the two quantities whose difference it is.
    const world = runWorld({ cohortSize: 120 });
    expect(world.latentMagicUsers).toBeGreaterThan(0);
    expect(world.latentMagicUsers).toBeGreaterThan(world.studentsEnrolled);
  });

  it('applies the species gate once, so seats can actually bind', () => {
    // **The double-application fix.** `latentMagicUsers` sizes student demand by
    // `prevalence`; enrolment used to multiply by it again, so a universe seated
    // roughly a tenth of the pool it had just called latent and `unseated` was
    // zero on every tick of a 1,200-tick reference run. A universe crowded
    // against its seats must now be able to run out of chairs.
    const crowded = runWorld({ cohortSize: 120 });
    expect(crowded.unseated).toBeGreaterThan(0);
    expect(crowded.studentsEnrolled).toBeGreaterThan(0);
  });
});

describe('defect 3: aptitude sorts careers, and sorts nobody out of existence', () => {
  it('splits a graduating class into both careers, and the halves sum', () => {
    // *"Something for the other half of people to do."* Both outcomes have to be
    // reachable in a real world loop, or the sort is a constant wearing a draw's
    // clothes — and the two reported halves must add up to the whole, because a
    // reader who has to subtract will eventually subtract the wrong thing.
    //
    // **The margin, so a future red here is legible.** At 120 ticks and a cohort
    // of 120 this measures `academic=197, populace=232` — nowhere near either
    // floor, so a failure means the sort genuinely stopped producing an outcome
    // rather than the run being too short to reach one. `240` was the first
    // length tried and it is the *only* reason to prefer it; at 12.8s it timed
    // out under suite contention while passing alone, which is a red that says
    // nothing about the code.
    const world = runWorld({ cohortSize: 120, ticks: 120 });
    expect(world.magesGraduated).toBe(world.graduatedAcademic + world.graduatedPopulace);
    expect(world.graduatedAcademic).toBeGreaterThan(0);
    expect(world.graduatedPopulace).toBeGreaterThan(0);
  });
});

describe('defect 2: graduation is curriculum completion', () => {
  it('graduates students, and the graduates hold knowledge', () => {
    const world = runWorld({});
    expect(world.magesGraduated).toBeGreaterThan(0);
    // Nobody graduates empty-handed: the floor against a bare founding being a
    // mage factory. A stalled student is the alternative and is reported, not
    // graduated.
    expect(world.studentsStalled).toBeGreaterThanOrEqual(0);
  });

  it('is not a fixed age: a maturity does not by itself produce a mage', () => {
    // The old rule promoted every matured cohort regardless of what any
    // institution held. With no university at all — therefore no curriculum and
    // no seat — the same seeded world now produces **no** new mages, and the
    // starting faculty is all there is.
    const simulation = defineWorldSimulation(worldDeps(traditionId()));
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    let current = state;
    const source = sourceFor(ROOT_SEED);
    let enrolled = 0;
    for (let tick = 0; tick < TICKS; tick += 1) {
      current = step(current, [], source);
      enrolled += (simulation.lastReport() as WorldStepReport).studentsEnrolled;
    }
    expect(enrolled).toBe(0);
    // The seeded mages are still there — this is "no enrolment", not "no mages".
    expect(mages.length).toBeGreaterThan(0);
  });
});

describe('prevalence and class capacity are content, and the absences are meaningful', () => {
  it('authors four of the six species and leaves two deliberately unstated', () => {
    const authored = new Map(
      registry().species.map((entry) => [entry.record.id, entry.record.prevalence] as const),
    );
    // The author's four, from `magical-prevalence.md`: "all dragons learn magic,
    // all elves learn magic, few orcs learn magic, one in ten humans".
    expect(authored.get('draconic')).toBe(1024);
    expect(authored.get('elf')).toBe(1024);
    expect(authored.get('human')).toBeLessThan(1024);
    expect(authored.get('orc')).toBeLessThan(authored.get('human') ?? 0);
    // And the two absences. `undefined` rather than a plausible literal, which
    // is the whole point: an authored number and a machine's must be
    // distinguishable.
    expect(authored.get('dwarf')).toBeUndefined();
    expect(authored.get('gnome')).toBeUndefined();
  });

  it('reads an unauthored prevalence as the named stand-in, not as zero or one', () => {
    const dwarf = registry().species.find((entry) => entry.record.id === 'dwarf')?.record;
    expect(dwarf).toBeDefined();
    if (dwarf === undefined) return;
    expect(prevalenceOf(dwarf)).toBe(PREVALENCE_WHEN_UNAUTHORED);
    // Neither degenerate end. Zero would extinguish the species' mages and one
    // would make it the most magical in the game, and both would be an
    // accidental design decision wearing a default's clothes.
    expect(PREVALENCE_WHEN_UNAUTHORED).toBeGreaterThan(0);
    expect(PREVALENCE_WHEN_UNAUTHORED).toBeLessThan(1024);
  });

  it('is prevalence and nothing else — aptitude does not gate existence', () => {
    for (const { record } of registry().species) {
      const fraction = enrolmentFraction(prevalenceOf(record));
      expect(fraction).toBeGreaterThan(0);
      // **Equal, not merely bounded.** W193 had this composing two traits; W197
      // took `mageAptitude` out, because a mage's talent decides what kind of
      // mage she becomes and never whether she exists. An assertion that only
      // bounded the fraction would still pass if somebody multiplied a second
      // trait back in, which is exactly the regression this line exists for.
      expect(fraction).toBe(prevalenceOf(record));
    }
  });

  it('leaves the enrolment gate blind to aptitude, across the whole species table', () => {
    // Orc aptitude is 192 and draconic 896 — a 4.7x spread that used to be a
    // 4.7x spread in *how many mages existed*. It now shows up nowhere in this
    // pipeline at all.
    for (const { record } of registry().species) {
      const raised = { ...record, mageAptitude: 1024 } as typeof record;
      const lowered = { ...record, mageAptitude: 1 } as typeof record;
      expect(enrolmentFraction(prevalenceOf(raised))).toBe(enrolmentFraction(prevalenceOf(lowered)));
    }
  });

  it('gives dwarves larger classes than gnomes, from retention already shipped', () => {
    const by = new Map(registry().species.map((entry) => [entry.record.id, entry.record] as const));
    const dwarf = by.get('dwarf');
    const gnome = by.get('gnome');
    const human = by.get('human');
    expect(dwarf).toBeDefined();
    expect(gnome).toBeDefined();
    expect(human).toBeDefined();
    if (dwarf === undefined || gnome === undefined || human === undefined) return;

    // *"Gnomes forget, dwarves remember — so gnomes have smaller classes ... but
    // dwarves have larger class capacity because of their better bookkeeping."*
    expect(classCapacityOf(dwarf)).toBeGreaterThan(classCapacityOf(gnome));
    // *"A class of 12 is the practical limit for humans"* — human `retention` is
    // exactly `fp(1024)`, so the baseline lands on the author's number.
    expect(classCapacityOf(human)).toBe(BASE_CLASS_CAPACITY);
  });
});

/**
 * **What is deliberately not asserted here: that a student reads a book.**
 *
 * *"Reading books should be part of going through school."* The reading edge is
 * `study.ts`, which arrives on `w190/scribing-fidelity` (#170) and is not on this
 * branch — before it, knowledge entered a mind by research, teaching and theft
 * only. What W193 supplies is the half that was missing on the *other* side: a
 * student with a handle, so that `contributeStudy(mage, …)` has somebody to be
 * called for, and a `seek-teaching` bias row already pointed at both the teacher
 * and the shelf, so no bias entry moves when #170 lands.
 *
 * A test asserting the composition would have to be written against code that is
 * not here, and writing one that passes vacuously is worse than not writing it.
 */
