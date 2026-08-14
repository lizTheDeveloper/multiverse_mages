/*
 * Multiverse Mages — the sentence about an institution, written as a test.
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
 * The question this file was written to answer: **can a test say "this
 * university admitted four students, completed construction on tick N, shelved
 * eleven distinct nodes, and its dominant cell is `intellego-mentem`"?**
 *
 * It can, and the first test below is that sentence. What matters is which of
 * its clauses are claims about the *simulation* and which are claims about the
 * harness, because the difference is the whole finding:
 *
 * - *completed construction on tick N* — the simulation's. `buildProgress` is
 *   state and `world-step.ts` advances it.
 * - *shelved eleven distinct nodes* — the simulation's. Instances are state.
 * - *its dominant cell is `intellego-mentem`* — the simulation's, but derived,
 *   and by nothing in production before this branch.
 * - *admitted four students* — **the harness's**. No component stores a hosted
 *   count, so this clause is true of a local variable in `runUniversity` and of
 *   nothing else. `admitStudentsHasNoStateToRead` below asserts that absence
 *   directly, so that the day someone gives admission state, a test fails and
 *   says why.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import { OCCUPATION, UNIVERSITY, WORLD_COMPONENTS } from '@mm/state';

import { runUniversity } from './university-harness.js';
import { buildRatePrimitive, scribeRatePrimitive, speciesNamed } from './universities-fixtures.js';

const registry = loadContent(shippedContentSource());

const nodeId = (id: string): number => registry.intern('node', id);
const cellId = (id: string): number => registry.intern('cell', id);

/** The shipped node graph's own answers, so the test is about the university. */
const tierOf = (node: number): number => registry.node(node)?.tier ?? 1;
const cellOf = (node: number): number => {
  const record = registry.node(node);
  return record === undefined ? 0 : cellId(record.cell);
};

/**
 * Eleven distinct nodes: all four of `intellego-mentem`, three of
 * `creo-corpus`, two of `rego-mentem`, two of `creo-animal`. Four beats three,
 * so the dominant cell is `intellego-mentem` — and it is dominant because of
 * what is on the shelves, which is the only way `profile.ts` allows a
 * university to be good at anything.
 */
const ELEVEN_NODES = [
  'im-weigh-the-attention',
  'im-follow-the-thought',
  'im-read-the-surface',
  'im-open-the-locked-room',
  'cc-close-the-wound',
  'cc-the-mended-decade',
  'cc-quicken-the-cohort',
  'rm-hold-the-attention',
  'rm-the-patient-lesson',
  'can-mend-the-beast',
  'can-quicken-the-herd',
] as const;

const human = speciesNamed('human');

function reference(overrides: Partial<Parameters<typeof runUniversity>[0]> = {}) {
  return runUniversity({
    capacity: 12,
    ticks: 120,
    buildRate: buildRatePrimitive(),
    scribeRate: scribeRatePrimitive(),
    tierOf,
    cellOf,
    economy: {
      materials: 4096,
      income: 64,
      laborMonths: 6,
      laborAffinity: human.laborAffinity,
      scribeAffinity: human.scribeAffinity,
    },
    roster: [
      { name: 'scribes', speciesId: registry.intern('species', 'human'), occupation: OCCUPATION.scribe, count: 40 },
    ],
    actions: [
      // The shelves fill while the walls go up: a library is not waiting on a
      // roof, and the eleven arrive early enough that upkeep is charged on all
      // of them for most of the run.
      ...ELEVEN_NODES.map((id, index) => ({
        tick: 2 + index,
        kind: 'shelve' as const,
        nodeId: nodeId(id),
      })),
      // Four students ask before the doors open and are refused, then four ask
      // after and are admitted. Same request, opposite answers, and the
      // difference is `effectiveCapacity`.
      { tick: 40, kind: 'apply' as const, count: 4 },
      { tick: 100, kind: 'apply' as const, count: 4 },
      { tick: 100, kind: 'staff' as const, cohort: 'scribes' },
    ],
    ...overrides,
  });
}

describe('a university, in isolation, for 120 ticks', () => {
  it('became a thing that can be described in one sentence', () => {
    const university = reference();

    expect(university.admittedTotal).toBe(4);
    // 1024 `fp` of building at twelve a tick. The tick is the simulation's
    // answer and not a chosen one, which is the property that makes the sentence
    // worth asserting: change `BUILD_PROGRESS_PER_LABOR_MONTH` and this number
    // moves, and a reviewer sees that a balance constant moved a completion date.
    expect(university.completedOnTick).toBe(86);
    expect(university.shelvedNodes).toBe(11);
    expect(registry.idOf('cell', university.dominantCell)).toBe('intellego-mentem');
  });

  it('refused the students who arrived before the roof was on', () => {
    const university = reference();
    // The clause that makes capacity a mechanism rather than a number: the
    // tick-40 cohort was refused because a building site has no seats, and the
    // refusal is on the record rather than silently truncated away.
    expect(university.refusedTotal).toBe(4);
    expect(university.log.find((entry) => entry.tick === 40)?.admitted).toBe(0);
    expect(university.log.find((entry) => entry.tick === 100)?.admitted).toBe(4);
  });

  it('was worth nothing as an institution until it was finished', () => {
    const early = reference({ ticks: 50 });
    expect(early.complete).toBe(false);
    expect(early.effectiveCapacity).toBe(0);
    expect(early.scribeMonthsTotal).toBe(0);
    // The shelves are real even though the university is not open, which is the
    // asymmetry `construction.ts` and `library.ts` between them describe: the
    // building gates capacity and staff, not the books.
    expect(early.shelvedNodes).toBe(11);
    expect(early.libraryContribution).toBeGreaterThan(0);
  });

  it('produced scribe-months only once it had both a roof and a staff', () => {
    const university = reference();
    // Completed on tick 90, staffed on tick 100. Ten ticks of a finished,
    // unstaffed university produce nothing at all — which on `main` was
    // impossible to express, because throughput was read off the universe's
    // whole scribe population and every university reported the same figure.
    expect(university.log.find((entry) => entry.tick === 95)?.scribeMonths).toBe(0);
    expect(university.log.find((entry) => entry.tick === 100)?.scribeMonths).toBeGreaterThan(0);
    expect(university.staffCohorts).toHaveLength(1);
  });

  it('is deterministic: the same options are the same institution', () => {
    const first = reference();
    const second = reference();
    expect(second.log).toEqual(first.log);
    expect(second.completedOnTick).toBe(first.completedOnTick);
    expect(second.dominantCell).toBe(first.dominantCell);
  });

  it('loses its identity with its library', () => {
    // `profile.ts`'s claim, exercised: a university with nothing shelved and no
    // residents is associated with no cell. Not "its old cell, weakly" — none.
    const empty = reference({ actions: [] });
    expect(empty.shelvedNodes).toBe(0);
    expect(empty.dominantCell).toBe(0);
    expect(empty.profile.cells).toHaveLength(0);
  });
});

describe('what the isolation harness had to supply itself', () => {
  it('finds no component anywhere that stores a hosted-student count', () => {
    // The finding, asserted rather than described. `Institution.hosted` is a
    // local in `runUniversity`; if this test ever fails, admission has acquired
    // state and the harness should stop carrying it.
    const fields = WORLD_COMPONENTS.flatMap((component) =>
      Object.keys(component.fields).map((field) => `${component.name}.${field}`),
    );
    const admissionish = fields.filter((name) =>
      /hosted|student|enrol|enroll|admitted|resident/iu.test(name),
    );
    expect(admissionish).toEqual([]);
  });

  it('finds no link from a student cohort to a university either', () => {
    // The other place admission state could live: a `universityId` on the
    // populace cohort. It is not there, which is why `admitStudents` cannot be
    // called by the world loop however much one would like it to be —
    // populace is counted in cohorts (`contracts.md` §1.3) and a student is an
    // occupation, not a member of an institution.
    const cohort = WORLD_COMPONENTS.find((component) => component.name === 'populace-cohort');
    expect(Object.keys(cohort?.fields ?? {})).not.toContain('universityId');

    // Exactly two components name a university, and they say different things.
    // `mage.universityId` is *affiliation* — an individual's, and the only one
    // that existed before this branch. `university-staff` is the institution's,
    // and it was declared in `WORLD_COMPONENTS` with no reader and no writer.
    // Neither of them is admission: a mage is not a student, and a staff cohort
    // is not one either.
    const links = WORLD_COMPONENTS.filter(
      (component) =>
        component.name !== UNIVERSITY.name &&
        Object.keys(component.fields).includes('universityId'),
    ).map((component) => component.name);
    expect(links).toEqual(['mage', 'university-staff']);
  });

  it('confirms the capacity a university was designed for outlives the seats it has', () => {
    const university = reference();
    expect(university.designedCapacity).toBe(12);
    expect(university.effectiveCapacity).toBe(12);
    expect(university.hosted).toBe(4);
    // Eight seats free and four students refused seventy ticks ago. The refusal
    // is not a shortage of seats; it is a shortage of *building*, and the two
    // are the same number until something separates them.
    expect(university.effectiveCapacity - university.hosted).toBe(8);
  });
});

describe('the economy the institution runs on', () => {
  it('charges upkeep per shelved instance, every tick, finished or not', () => {
    const rich = reference();
    const poor = reference({
      economy: {
        materials: 2600,
        income: 0,
        laborMonths: 6,
        laborAffinity: human.laborAffinity,
        scribeAffinity: human.scribeAffinity,
      },
    });
    expect(rich.upkeepShortfallTotal).toBe(0);
    expect(poor.upkeepShortfallTotal).toBeGreaterThan(0);

    // And a finding the harness surfaced by accident, which is the argument for
    // having one: **a small library can never lose a book to unpaid upkeep.**
    // `LIBRARY_UPKEEP_PER_INSTANCE` is 2 `fp` and `DEGRADATION_PER_SHORTFALL` is
    // 32, and the shortfall is floored per tick rather than banked, so a library
    // of fewer than sixteen instances owes less in a whole tick than one
    // instance's worth of shortfall. Eleven nodes is under that line: this
    // university is starved for eighty ticks, runs its stock to zero, and does
    // not lose a single book.
    //
    // Both magnitudes are marked **untuned**, so this is a note for 0.5.0 rather
    // than a defect — but it means library degradation is unreachable for every
    // young library, which is exactly when a universe is most fragile.
    expect(poor.materialsRemaining).toBe(0);
    expect(poor.degradedInstancesTotal).toBe(0);
    expect(rich.degradedInstancesTotal).toBe(0);
  });

  it('stalls construction rather than driving the stock negative', () => {
    const broke = reference({
      economy: {
        materials: 0,
        income: 0,
        laborMonths: 6,
        laborAffinity: human.laborAffinity,
        scribeAffinity: human.scribeAffinity,
      },
      actions: [],
    });
    expect(broke.buildProgress).toBe(0);
    expect(broke.materialsRemaining).toBe(0);
    expect(broke.log.every((entry) => entry.labourStalled === 6)).toBe(true);
  });

  it('never lets buildProgress pass fp(1.0)', () => {
    const flush = reference({
      economy: {
        materials: 1_000_000,
        income: 0,
        laborMonths: 400,
        laborAffinity: human.laborAffinity,
        scribeAffinity: human.scribeAffinity,
      },
    });
    expect(flush.buildProgress).toBe(FP_ONE);
    expect(flush.complete).toBe(true);
  });
});
