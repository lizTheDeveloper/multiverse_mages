/*
 * Multiverse Mages — the defect that had no workaround: a student with a handle.
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
 * **W193's fourth defect, and the only one whose fix cannot be faked.**
 *
 * Before this change a student was a *count* inside a populace cohort. Every
 * operation that puts knowledge in a mind — `study()`, `contributeTeaching()`,
 * `contributeResearch()` — is keyed on a **mage handle**, and a number in a
 * `count` field has none. So no student, in any universe, at any tick, could
 * hold a knowledge instance: not because a rule forbade it but because there was
 * nothing for `locationId` to name.
 *
 * A row in `KNOWLEDGE_INSTANCE` whose `locationKind` is `mind` and whose
 * `locationId` is a mage in the `student` role is the entire proof, and it is
 * **unobtainable on `main` by construction** rather than merely absent from it.
 *
 * ## Why this test lives in `scenario` and not beside the other student tests
 *
 * It was written first in `packages/coordination`, against that package's
 * seeded fixture, and it failed — correctly. That fixture endows its faculty
 * with three tier-1 nodes, which is a curriculum a student finishes in about a
 * season, so students graduate almost as fast as they are seated and the
 * population of enrolled-and-still-learning mages is one or zero at any moment.
 * The claim was true and the venue could not show it.
 *
 * The reference universe can: 3,060 student-tick observations of a student
 * holding at least one node over 600 ticks, and one student reaching 48. That
 * is a **finding about how shallow the coordination fixture is**, not a
 * weakening of the claim, and moving the test is the honest response to it.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE, MAGE_ROLE, componentOf } from '@mm/state';
import { defineWorldSimulation } from '@mm/coordination';

import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '../../src/index.js';

/**
 * Fifty world years. Long enough that founding grants have been taught out and
 * a second generation has enrolled, short enough that this stays an existence
 * check rather than becoming a balance measurement.
 */
const TICKS = 600;

interface StudentKnowledgeCensus {
  /** Student-ticks on which some student held at least one node. */
  readonly observations: number;
  /** The most nodes any one student was ever seen holding. */
  readonly deepestStudent: number;
  /** Ticks on which at least one student held something. */
  readonly ticksWithAHolder: number;
  /** Ticks on which at least one student existed at all — the control. */
  readonly ticksWithAStudent: number;
}

function census(): StudentKnowledgeCensus {
  const content = referenceContent();
  const simulation = defineWorldSimulation(content.deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });

  let observations = 0;
  let deepestStudent = 0;
  let ticksWithAHolder = 0;
  let ticksWithAStudent = 0;

  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));

    const instances = componentOf(state, KNOWLEDGE_INSTANCE);
    const kinds = instances.field('locationKind');
    const holders = instances.field('locationId');
    const heldByHandle = new Map<number, number>();
    instances.forEach((row) => {
      if ((kinds[row] as number) !== LOCATION_KIND.mind) return;
      const holder = holders[row] as number;
      heldByHandle.set(holder, (heldByHandle.get(holder) ?? 0) + 1);
    });

    const mages = componentOf(state, MAGE);
    let studentsThisTick = 0;
    let holdersThisTick = 0;
    mages.forEach((_row, handle) => {
      if (mages.get(handle, 'roleId') !== MAGE_ROLE.student) return;
      studentsThisTick += 1;
      const held = heldByHandle.get(handle) ?? 0;
      if (held === 0) return;
      holdersThisTick += 1;
      observations += 1;
      if (held > deepestStudent) deepestStudent = held;
    });
    if (studentsThisTick > 0) ticksWithAStudent += 1;
    if (holdersThisTick > 0) ticksWithAHolder += 1;
  }

  return { observations, deepestStudent, ticksWithAHolder, ticksWithAStudent };
}

describe('defect 4: a student is a handle, so knowledge can be in her head', () => {
  it('records knowledge instances located in the minds of enrolled students', () => {
    const seen = census();

    // The control first. A run with no students would pass the main assertion
    // vacuously for the same reason `main` would: nothing to look at. This is
    // the "confirm the check works before believing it" third exit.
    expect(seen.ticksWithAStudent).toBeGreaterThan(0);

    // The claim. Not a threshold — an existence: `locationId` naming a student.
    expect(seen.observations).toBeGreaterThan(0);
    expect(seen.deepestStudent).toBeGreaterThan(0);
    expect(seen.ticksWithAHolder).toBeGreaterThan(0);
  }, 300_000);
});

/**
 * **What is still not asserted: that a student reads a *book*.**
 *
 * *"Reading books should be part of going through school. That's how you learn.
 * It's not just in your class."* Half of that is here — a student's month is
 * spent in `seek-teaching`, and what she acquires above arrives by lesson. The
 * other half is `study.ts`, which is on `w190/scribing-fidelity` (#170) and not
 * on this branch; before it, knowledge entered a mind by research, teaching and
 * theft only, and a library was research *capital* rather than something anyone
 * opened.
 *
 * W193 supplies the side that was missing from #170's other end: a student with
 * a handle for `contributeStudy(mage, …)` to be called for, and a
 * `seek-teaching` bias row already pointed at both the teacher and the shelf, so
 * no bias entry moves when the two compose. **When #170 lands, the assertion to
 * add here is that `deepestStudent` rises in a universe whose library is deep
 * and whose faculty are dead** — which is exactly the case this branch cannot
 * construct.
 */
