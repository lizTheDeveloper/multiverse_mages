/*
 * Multiverse Mages — the academy projection, and the positive controls for it.
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
 * `./academy.ts` is four joins over a world, and every one of them can be wrong
 * in a way that still renders: a roster that silently includes the dead, a
 * shelf attributed to somebody else's library, a lesson filed under a college
 * neither party belongs to, a permitted-cell list that forgot the edicts.
 *
 * So each assertion here is paired with the mutation that must move it.
 * `expect(x).toEqual([])` and `expect(n).toBe(0)` are the shapes that pass when
 * the code under them does nothing at all, and this file does not use them
 * without a control beside them.
 *
 * The fixture world is deliberate about all four: four mages of whom **one is
 * dead**, two copies of one node on the shelf and one of another, an
 * **interdiction** on a populated cell, and a technique axis that closes a
 * third. A fixture where every mage were alive and every cell open would let
 * three of the four joins be absent and every number still look right.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle } from '@mm/sim-core';
import {
  EFFORT_KIND,
  EFFORT_PROGRESS,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  POPULACE_COHORT,
  OCCUPATION,
  UNIVERSE,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  attachRecord,
  cellIdAt,
  componentOf,
} from '@mm/state';

import { describeAcademy } from '@mm/agent-api';

import { FIXTURE_CATALOGUE, FP, addInstance, firstUniverse, secondUniverse } from './fixtures.js';

/** The fixture's one college, projected. */
const project = (world: ReturnType<typeof firstUniverse>) =>
  describeAcademy({ state: world.state, catalogue: FIXTURE_CATALOGUE });

const only = (world: ReturnType<typeof firstUniverse>) => {
  const academy = project(world);
  const dossier = academy.universities.get(world.university);
  if (dossier === undefined) throw new Error('the fixture college is missing from the projection');
  return { academy, dossier };
};

describe('the roster', () => {
  it('is the living mages whose universityId is this college', () => {
    const world = firstUniverse();
    const { dossier } = only(world);
    // Four mages are attached and the fourth has `alive: 0`.
    expect(componentOf(world.state, MAGE).size).toBe(4);
    expect(dossier.roster.map((r) => r.handle)).toEqual([
      world.mages[0],
      world.mages[1],
      world.mages[2],
    ]);
    // The summary and the list are two passes over one store, and a page prints
    // both. They must not be able to disagree.
    expect(dossier.college.affiliatedMages).toBe(dossier.roster.length);
  });

  /**
   * The control the assertion above needs. Without it, a `describeAcademy` that
   * returned an empty roster for everybody would fail — but one that ignored
   * `alive` entirely would pass three of the four expectations and be caught
   * only by the exact-array match, which is easy to relax later.
   */
  it('drops a mage the moment she dies, and picks one up the moment she affiliates', () => {
    const world = firstUniverse();
    const store = componentOf(world.state, MAGE);

    store.set(world.mages[0] as EntityHandle, 'alive', 0);
    expect(only(world).dossier.roster.map((r) => r.handle)).not.toContain(world.mages[0]);

    const stranger = world.state.entities.create();
    attachRecord(world.state, MAGE, stranger, {
      speciesId: 1,
      birthTick: -10,
      roleId: MAGE_ROLE.researcher,
      universityId: 0,
      curiosity: 0,
      ambition: 0,
      caution: 0,
      vigor: FP,
      maxVigor: FP,
      alive: 1,
    });
    const before = only(world);
    expect(before.academy.unaffiliated).toBe(1);
    expect(before.dossier.roster.map((r) => r.handle)).not.toContain(stranger);

    componentOf(world.state, MAGE).set(stranger, 'universityId', world.university);
    const after = only(world);
    expect(after.dossier.roster.map((r) => r.handle)).toContain(stranger);
    expect(after.academy.unaffiliated).toBe(0);
  });

  it('carries what she holds in her own head and not what is on the shelf beside her', () => {
    const world = firstUniverse();
    const { dossier } = only(world);
    const held = new Map(dossier.roster.map((r) => [r.handle, [...r.nodeIds]]));
    // Mage 0 knows nodes 1 and 3; mage 1 knows nothing; mage 2 knows node 4.
    expect(held.get(world.mages[0] as EntityHandle)).toEqual([1, 2]);
    expect(held.get(world.mages[1] as EntityHandle)).toEqual([]);
    expect(held.get(world.mages[2] as EntityHandle)).toEqual([4]);

    // Node 3 is on the library shelf and in nobody's head. If the pass ever
    // conflated `library` with `mind` this is the assertion that moves, and it
    // is the difference between a scholar and a librarian.
    for (const entry of dossier.roster) expect(entry.nodeIds).not.toContain(3);

    addInstance(world.state, 5, LOCATION_KIND.palace, world.mages[1] as EntityHandle);
    const after = only(world);
    expect(after.dossier.roster.find((r) => r.handle === world.mages[1])?.nodeIds).toEqual([5]);
  });
});

describe('the shelf', () => {
  it('counts copies of a node rather than listing it twice', () => {
    const world = firstUniverse();
    const { dossier } = only(world);
    expect(dossier.shelf).toEqual([
      { nodeId: 1, copies: 2, bestMastery: FP },
      { nodeId: 3, copies: 1, bestMastery: FP },
    ]);
    // `libraryNodes` on the summary is the distinct count. A page shows the
    // number at the head and the list underneath.
    expect(dossier.college.libraryNodes).toBe(dossier.shelf.length);
  });

  it('attributes a book to the library that holds it, and to no other', () => {
    // The control for the join. A shelf pass keyed on nothing would hand this
    // second library's book to the first college.
    const world = firstUniverse();
    const otherLibrary = world.state.entities.create();
    addInstance(world.state, 5, LOCATION_KIND.library, otherLibrary);
    expect(only(world).dossier.shelf.map((e) => e.nodeId)).toEqual([1, 3]);

    // And a college with no library shelves nothing at all, rather than
    // inheriting whatever `locationId 0` happens to name.
    const empty = firstUniverse();
    componentOf(empty.state, UNIVERSITY).set(empty.university, 'libraryId', 0);
    const { dossier } = only(empty);
    expect(dossier.college.hasLibrary).toBe(false);
    expect(dossier.shelf).toEqual([]);
  });
});

describe('the lessons', () => {
  const teach = (
    world: ReturnType<typeof firstUniverse>,
    subject: EntityHandle,
    counterparty: EntityHandle,
    kind: number = EFFORT_KIND.teaching,
  ): EntityHandle => {
    const effort = world.state.entities.create();
    attachRecord(world.state, EFFORT_PROGRESS, effort, {
      subject,
      kind,
      nodeId: 2,
      counterparty,
      progress: 3 * FP,
    });
    return effort;
  };

  it('places a lesson by the affiliation of its two parties, and says which half is here', () => {
    const world = firstUniverse();
    const outsider = world.state.entities.create();
    attachRecord(world.state, MAGE, outsider, {
      speciesId: 1,
      birthTick: -10,
      roleId: MAGE_ROLE.researcher,
      universityId: 0,
      curiosity: 0,
      ambition: 0,
      caution: 0,
      vigor: FP,
      maxVigor: FP,
      alive: 1,
    });
    teach(world, world.mages[0] as EntityHandle, outsider);

    const { dossier } = only(world);
    expect(dossier.teaching).toEqual([
      {
        teacher: world.mages[0],
        student: outsider,
        nodeId: 2,
        progress: 3 * FP,
        teacherHere: true,
        studentHere: false,
      },
    ]);
    // Both parties are described, or the row draws a blank name it cannot
    // explain. The student is at no college and must still be in the table.
    expect(dossier.college.affiliatedMages).toBe(3);
    expect(only(world).academy.mages.has(outsider)).toBe(true);
  });

  it('ignores research and scribing, which are not lessons', () => {
    // The `kind` discriminator is the whole reason `EFFORT_KIND` exists — §1.2:
    // a mage can be part-way through teaching a node *and* part-way through
    // writing it down, against different costs. A projection that dropped the
    // filter would report a woman at her writing desk as somebody's teacher.
    const world = firstUniverse();
    teach(world, world.mages[0] as EntityHandle, 0 as EntityHandle, EFFORT_KIND.research);
    teach(world, world.mages[0] as EntityHandle, 0 as EntityHandle, EFFORT_KIND.scribing);
    expect(only(world).dossier.teaching).toEqual([]);

    teach(world, world.mages[0] as EntityHandle, world.mages[1] as EntityHandle);
    const rows = only(world).dossier.teaching;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.teacherHere).toBe(true);
    expect(rows[0]?.studentHere).toBe(true);
  });
});

describe('the staff', () => {
  it('counts the people in the cohorts linked here, and not every cohort in the world', () => {
    const world = firstUniverse();
    // The fixture has three cohorts and no `UNIVERSITY_STAFF` link, so the
    // honest answer is zero — and the control below is what makes that zero
    // evidence of a join rather than of an unwritten one.
    expect(only(world).dossier.staffHeadcount).toBe(0);
    expect(componentOf(world.state, POPULACE_COHORT).size).toBe(3);

    const cohort = world.state.entities.create();
    attachRecord(world.state, POPULACE_COHORT, cohort, {
      speciesId: 1,
      occupation: OCCUPATION.scribe,
      count: 37,
      birthTickBucket: 0,
    });
    const link = world.state.entities.create();
    attachRecord(world.state, UNIVERSITY_STAFF, link, {
      universityId: world.university,
      cohortId: cohort,
    });

    const { dossier } = only(world);
    expect(dossier.staffHeadcount).toBe(37);
    expect(dossier.college.staffCohorts).toBe(1);
  });
});

describe('the permitted cells', () => {
  it('are permits() over the cells content populates, edicts and all', () => {
    const world = firstUniverse();
    const { academy } = only(world);
    // The fixture permits techniques 0..2 and forms 0..5, and interdicts
    // (1, 2). The catalogue populates four cells: (0,0), (2,5), (4,13), (1,2).
    // So (4,13) falls to the technique axis and (1,2) to the edict, and the
    // two survivors are the answer.
    expect(academy.permittedCells).toEqual([cellIdAt(0, 0), cellIdAt(2, 5)]);
  });

  it('narrows when an axis closes, so the list is a reading and not a constant', () => {
    // Without this, the assertion above would pass against a projection that
    // returned the four populated cells minus a hardcoded pair.
    const world = firstUniverse();
    componentOf(world.state, UNIVERSE).set(world.universe, 'permittedForms', 0b1);
    // Form bit 5 is gone, so (2, 5) goes with it and only (0, 0) is left.
    expect(only(world).academy.permittedCells).toEqual([cellIdAt(0, 0)]);
  });

  it('is empty, not wrong, for a world with no universe', () => {
    // `secondUniverse` has no institutions at all, which is the shape a fresh
    // world has and the one a projection is likeliest to divide by zero on.
    const world = secondUniverse();
    const academy = describeAcademy({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect([...academy.universities.keys()]).toEqual([]);
    expect(academy.unaffiliated).toBe(1);
  });
});
