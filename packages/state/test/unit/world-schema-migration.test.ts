/*
 * Multiverse Mages — the world-schema migrations that carry an older save
 * forward.
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
 * A migration runs once per player per upgrade and, if it was wrong, has already
 * destroyed the save. So it is tested the way `sim-core`'s migration note asks
 * for: by constructing an envelope and calling the step, with no state, no
 * schema and no fixture file — plus one end-to-end pass that takes a genuine
 * older snapshot all the way into a live world.
 *
 * The older envelopes here are **derived from the current one** by dropping the
 * sections each revision added, rather than transcribed as literals. A
 * transcribed one would be a copy of the schema that stops matching the moment
 * anything else moves, and would then be testing a save nobody ever wrote.
 */

import { describe, expect, it } from 'vitest';

import type { ComponentFields, ComponentSpec, SnapshotEnvelope } from '@mm/sim-core';
import {
  SNAPSHOT_VERSION,
  decodeSnapshot,
  encodeSnapshot,
  envelopeToState,
  serializeState,
  snapshotHash,
  stateToEnvelope,
} from '@mm/sim-core';
import {
  BLESSING,
  EFFORT_PROGRESS,
  BAR_PHASE,
  ERA_EVALUATION,
  GOAL_COMMITMENT,
  GOD_STATE,
  MAGE,
  TERRITORY_HOLDING,
  UNIVERSITY_SITE,
  UPHEAVAL,
  WORLD_SCHEMA_VERSION,
  addEffortProgress,
  addGoalCommitment,
  addGodAgencyState,
  addTerritorySiting,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  loadWorldSnapshot,
  migrateWorldEnvelope,
  readRecord,
  worldSchemaVersionOf,
} from '@mm/state';

import { populatedWorld } from './fixtures.js';

/** The same world without the sections a given revision had not invented yet. */
function envelopeWithout(...names: readonly string[]): SnapshotEnvelope {
  const { state } = populatedWorld();
  const envelope = stateToEnvelope(state);
  return {
    ...envelope,
    components: envelope.components.filter((component) => !names.includes(component.name)),
  };
}

/** The four sections `god-agency` appended, named once. */
const GOD_SECTIONS = [GOD_STATE.name, BLESSING.name, UPHEAVAL.name, ERA_EVALUATION.name];

/** The two sections `university-siting` appended, named once. */
const SITING_SECTIONS = [TERRITORY_HOLDING.name, UNIVERSITY_SITE.name];

/** The world as a build that had never heard of goal commitments saw it. */
function revisionOneEnvelope(): SnapshotEnvelope {
  return envelopeWithout(
    GOAL_COMMITMENT.name,
    EFFORT_PROGRESS.name,
    ...GOD_SECTIONS,
    ...SITING_SECTIONS,
    BAR_PHASE.name,
  );
}

/** The world as the build that added the goal commitment, and nothing after it, saw it. */
function revisionTwoEnvelope(): SnapshotEnvelope {
  return envelopeWithout(
    EFFORT_PROGRESS.name,
    ...GOD_SECTIONS,
    ...SITING_SECTIONS,
    BAR_PHASE.name,
  );
}

/** The world as the last build before the god had verbs saw it. */
function revisionThreeEnvelope(): SnapshotEnvelope {
  return envelopeWithout(...GOD_SECTIONS, ...SITING_SECTIONS, BAR_PHASE.name);
}

/** The world as the last build in which a university stood nowhere saw it. */
function revisionFourEnvelope(): SnapshotEnvelope {
  return envelopeWithout(...SITING_SECTIONS, BAR_PHASE.name);
}

/** The world as the last build before the god's law had a clock saw it. */
function revisionFiveEnvelope(): SnapshotEnvelope {
  return envelopeWithout(BAR_PHASE.name);
}

describe('the world-schema revision is read off the snapshot itself', () => {
  it('reads each revision from the newest component it carries', () => {
    expect(worldSchemaVersionOf(revisionOneEnvelope())).toBe(1);
    expect(worldSchemaVersionOf(revisionTwoEnvelope())).toBe(2);
    expect(worldSchemaVersionOf(revisionThreeEnvelope())).toBe(3);
    expect(worldSchemaVersionOf(revisionFourEnvelope())).toBe(4);
    expect(worldSchemaVersionOf(stateToEnvelope(populatedWorld().state))).toBe(
      WORLD_SCHEMA_VERSION,
    );
  });

  it('is a different number from the container format version', () => {
    // Asserted because the two are easy to conflate and the cost of conflating
    // them is every golden fixture: SNAPSHOT_VERSION is inside the hashed
    // header, so bumping it for a component addition rewrites every recorded
    // hash in the project and fails the fixtures with a version error rather
    // than a behaviour diff.
    // The two have now diverged by five, which is the clearest possible
    // statement of the distinction: six world-schema revisions have shipped and
    // the container format has never moved. Integration round 3 added the sixth,
    // `bar-phase`, and the golden fixtures are byte-identical across it.
    expect(SNAPSHOT_VERSION).toBe(1);
    expect(WORLD_SCHEMA_VERSION).toBe(6);
  });
});

describe('migrating a revision-1 world snapshot forward', () => {
  it('appends goal-commitment as an empty section, in last position', () => {
    const before = revisionOneEnvelope();
    const after = addGoalCommitment.migrate(before);

    const appended = after.components[after.components.length - 1];
    expect(appended?.name).toBe(GOAL_COMMITMENT.name);
    expect(appended?.slots.length).toBe(0);
    expect(appended?.values.length).toBe(0);
    expect(appended?.fields.map((field) => field.name)).toEqual(Object.keys(GOAL_COMMITMENT.fields));
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionOneEnvelope();
    expect(addGoalCommitment.migrate(before).version).toBe(before.version);
    expect(addGoalCommitment.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionOneEnvelope();
    const componentCount = before.components.length;
    addGoalCommitment.migrate(before);
    expect(before.components).toHaveLength(componentCount);
    expect(before.components.some((component) => component.name === GOAL_COMMITMENT.name)).toBe(
      false,
    );
  });

  it('walks a revision-1 envelope to the current revision, one step at a time', () => {
    // Five steps, not a shortcut: a revision-1 save has to pass through
    // revisions 2, 3, 4 and 5 to reach 6, and the loop is what makes that true
    // without an extra code path only the oldest saves would ever exercise.
    const walked = migrateWorldEnvelope(revisionOneEnvelope());
    const carried = walked.components.map((component) => component.name);
    expect(worldSchemaVersionOf(walked)).toBe(WORLD_SCHEMA_VERSION);
    expect(carried).toContain(GOAL_COMMITMENT.name);
    expect(carried).toContain(EFFORT_PROGRESS.name);
    for (const name of GOD_SECTIONS) expect(carried).toContain(name);
    for (const name of SITING_SECTIONS) expect(carried).toContain(name);
    expect(carried).toContain(BAR_PHASE.name);
  });

  it('returns an already-current envelope untouched, as the same object', () => {
    // The same object, not a copy: there is nothing to change, and handing back
    // a copy would invite a caller to believe the two could differ.
    const current = stateToEnvelope(populatedWorld().state);
    expect(migrateWorldEnvelope(current)).toBe(current);
  });
});

describe('migrating a revision-2 world snapshot forward', () => {
  it('appends effort-progress as an empty section, in last position', () => {
    const before = revisionTwoEnvelope();
    const after = addEffortProgress.migrate(before);

    const appended = after.components[after.components.length - 1];
    expect(appended?.name).toBe(EFFORT_PROGRESS.name);
    expect(appended?.slots.length).toBe(0);
    expect(appended?.values.length).toBe(0);
    expect(appended?.fields.map((field) => field.name)).toEqual(Object.keys(EFFORT_PROGRESS.fields));
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionTwoEnvelope();
    expect(addEffortProgress.migrate(before).version).toBe(before.version);
    expect(addEffortProgress.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionTwoEnvelope();
    const componentCount = before.components.length;
    addEffortProgress.migrate(before);
    expect(before.components).toHaveLength(componentCount);
    expect(before.components.some((component) => component.name === EFFORT_PROGRESS.name)).toBe(
      false,
    );
  });

  it('keeps the commitments a revision-2 save did record', () => {
    // The half of the repair that is easy to get wrong in the other direction:
    // adding a section must not disturb the one the previous revision added, or
    // a save written yesterday loses every mage's goal on upgrade.
    const { mage } = populatedWorld();
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionTwoEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, GOAL_COMMITMENT).has(mage)).toBe(true);
    expect(componentOf(migrated, EFFORT_PROGRESS).size).toBe(0);
  });
});

describe('migrating a revision-3 world snapshot forward', () => {
  it("appends god-agency's four sections, in WORLD_COMPONENTS order, all empty", () => {
    const before = revisionThreeEnvelope();
    const after = addGodAgencyState.migrate(before);
    const appended = after.components.slice(before.components.length);

    expect(appended.map((component) => component.name)).toEqual(GOD_SECTIONS);
    for (const component of appended) {
      expect(component.slots.length).toBe(0);
      expect(component.values.length).toBe(0);
    }
    expect(appended[0]?.fields.map((field) => field.name)).toEqual(Object.keys(GOD_STATE.fields));
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionThreeEnvelope();
    expect(addGodAgencyState.migrate(before).version).toBe(before.version);
    expect(addGodAgencyState.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionThreeEnvelope();
    const componentCount = before.components.length;
    addGodAgencyState.migrate(before);
    expect(before.components).toHaveLength(componentCount);
  });

  it('restores a pre-god-agency save with no god state at all', () => {
    // Empty sections rather than a synthesised singleton, and the distinction
    // is the whole repair: "no god-state row" is the state a universe is in
    // before it has ever been stepped, which is exactly what a save written
    // before this capability existed describes. A zeroed row would hand the
    // stagnation check counters describing a run that never happened.
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionThreeEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, GOD_STATE).size).toBe(0);
    expect(componentOf(migrated, BLESSING).size).toBe(0);
    expect(componentOf(migrated, UPHEAVAL).size).toBe(0);
    expect(componentOf(migrated, ERA_EVALUATION).size).toBe(0);
  });
});

describe('migrating a revision-4 world snapshot forward', () => {
  it("appends university-siting's two sections, in WORLD_COMPONENTS order, both empty", () => {
    const before = revisionFourEnvelope();
    const after = addTerritorySiting.migrate(before);
    const appended = after.components.slice(before.components.length);

    expect(appended.map((component) => component.name)).toEqual(SITING_SECTIONS);
    for (const component of appended) {
      expect(component.slots.length).toBe(0);
      expect(component.values.length).toBe(0);
    }
    expect(appended[0]?.fields.map((field) => field.name)).toEqual(
      Object.keys(TERRITORY_HOLDING.fields),
    );
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionFourEnvelope();
    expect(addTerritorySiting.migrate(before).version).toBe(before.version);
    expect(addTerritorySiting.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionFourEnvelope();
    const componentCount = before.components.length;
    addTerritorySiting.migrate(before);
    expect(before.components).toHaveLength(componentCount);
  });

  it('restores a pre-siting save holding no ground and standing nowhere', () => {
    // Empty sections, and for `territory-holding` that is the *load-bearing*
    // choice rather than the obvious one. A revision-4 save's `K` came from
    // `territory.json`, so "no holding rows" would starve it if it were read as
    // "holds nothing" -- and the repair is deliberately not to synthesise the
    // shipped rows here, because this package takes only types from `content`
    // and a frozen table could not describe a save written against a different
    // content set. Absent rows mean "not yet materialized", the world step
    // materializes the endowment on the first tick that finds none, and a
    // universe that has genuinely lost its ground carries rows saying zero.
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionFourEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, TERRITORY_HOLDING).size).toBe(0);
    expect(componentOf(migrated, UNIVERSITY_SITE).size).toBe(0);
  });

  it('keeps the god state a revision-4 save did record', () => {
    const { universe } = populatedWorld();
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionFourEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, GOD_STATE).has(universe)).toBe(true);
  });
});

describe('an older save loads into a current world', () => {
  it('loads, and nobody in it is committed to anything or part-way through anything', () => {
    const bytes = encodeSnapshot(revisionOneEnvelope());
    const restored = loadWorldSnapshot(bytes, defineWorldStateSchema());

    // The repair is empty sections, not zeroed rows. A mage restored with a
    // synthesised commitment would carry an `adoptedTick` nobody adopted
    // anything on, and a synthesised effort would be a project she is credited
    // with having half-finished and never started.
    expect(componentOf(restored, GOAL_COMMITMENT).size).toBe(0);
    expect(componentOf(restored, EFFORT_PROGRESS).size).toBe(0);
  });

  it('re-serializes to exactly the bytes a fresh save with neither makes', () => {
    const { state, mage, effort } = populatedWorld();
    componentOf(state, GOAL_COMMITMENT).remove(mage);
    // The row, not the entity. Both sides of the comparison come from the same
    // fixture and therefore from the same entity table; destroying one here
    // would be comparing two different allocation histories.
    componentOf(state, EFFORT_PROGRESS).remove(effort);
    // And every row of everything revision 4 added, for the same reason: the
    // revision-1 envelope carries none of those sections, so the fresh save it
    // is compared against must carry none of those rows.
    // Widened to the base spec type on purpose, the way `fixtures.ts` widens
    // `WORLD_COMPONENTS`: a `const` tuple's element type is a union of four
    // distinct layouts, and `componentOf` would try to infer one of them for
    // all four.
    const godSpecs: readonly ComponentSpec<ComponentFields>[] = [
      GOD_STATE,
      BLESSING,
      UPHEAVAL,
      ERA_EVALUATION,
      TERRITORY_HOLDING,
      UNIVERSITY_SITE,
      BAR_PHASE,
    ];
    for (const spec of godSpecs) {
      const store = componentOf(state, spec);
      for (const { handle } of collectRecords(state, spec)) store.remove(handle);
    }

    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionOneEnvelope()),
      defineWorldStateSchema(),
    );

    expect(snapshotHash(migrated)).toBe(snapshotHash(state));
    expect(Array.from(serializeState(migrated))).toEqual(Array.from(serializeState(state)));
  });

  it('carries the other components across unchanged', () => {
    // Not a hash comparison: a hash would agree if both sides had lost the same
    // rows. This reads one back.
    const { state, mage, university } = populatedWorld();
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionOneEnvelope()),
      defineWorldStateSchema(),
    );

    expect(readRecord(migrated, MAGE, mage).universityId).toBe(university);
    expect(readRecord(migrated, MAGE, mage)).toEqual(readRecord(state, MAGE, mage));
  });

  it('refuses the same snapshot when the migration is skipped', () => {
    // The control. Without it, "the migration loaded it" would be
    // indistinguishable from "it would have loaded anyway", and this test would
    // be asserting nothing about the migration at all. Both revisions are
    // checked, because a step that is registered but never reached would still
    // pass the revision-1 half.
    for (const [bytes, missing] of [
      [encodeSnapshot(revisionOneEnvelope()), /goal-commitment/],
      [encodeSnapshot(revisionTwoEnvelope()), /effort-progress/],
      [encodeSnapshot(revisionThreeEnvelope()), /god-state/],
      [encodeSnapshot(revisionFourEnvelope()), /territory-holding/],
      [encodeSnapshot(revisionFiveEnvelope()), /bar-phase/],
    ] as const) {
      expect(() => loadWorldSnapshot(bytes, defineWorldStateSchema())).not.toThrow();
      expect(() => envelopeToState(decodeSnapshot(bytes), defineWorldStateSchema())).toThrow(
        missing,
      );
    }
  });
});
