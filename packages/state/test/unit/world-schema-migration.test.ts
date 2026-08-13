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

import type { ComponentFields, ComponentSpec, SnapshotComponent, SnapshotEnvelope } from '@mm/sim-core';
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
  ERA_EVALUATION,
  GOAL_COMMITMENT,
  GOD_STATE,
  MAGE,
  MATERIAL_STOCK,
  UNIVERSE,
  UPHEAVAL,
  WORLD_SCHEMA_VERSION,
  addEffortProgress,
  addGoalCommitment,
  addGodAgencyState,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  loadWorldSnapshot,
  migrateWorldEnvelope,
  readRecord,
  splitMaterialsByKind,
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

/**
 * A `materials` value to give a synthetic pre-revision-5 `universe` section.
 * Not a multiple of three, so every fixture built from it exercises the
 * remainder-to-food rule rather than dividing evenly by coincidence.
 */
const LEGACY_MATERIALS_VALUE = 1000;

/**
 * Rebuilds `envelope`'s `universe` section with an extra `materials` field
 * appended, holding `value` in its one row.
 *
 * Every world-schema revision below 5 carried `materials` on `universe`. The
 * *current* `UNIVERSE` component no longer declares that field at all —
 * `components.ts` removed it rather than leaving it beside the three kinds
 * nothing spends — so a fixture built by filtering the current schema's
 * envelope, the way `envelopeWithout` does for every earlier revision, is a
 * save `splitMaterialsByKind` cannot read: there is no `materials` column left
 * for it to find. Revision 5 is the first step that rewrites a section instead
 * of only appending one, and this is the one place that matters for a test
 * fixture: it has to put the field back before the fixture can stand in for a
 * real pre-revision-5 save.
 */
function withLegacyMaterialsField(
  envelope: SnapshotEnvelope,
  value: number = LEGACY_MATERIALS_VALUE,
): SnapshotEnvelope {
  const universe = envelope.components.find((component) => component.name === UNIVERSE.name);
  if (universe === undefined) return envelope;

  const width = universe.fields.length;
  const rows = universe.slots.length;
  const fields = [...universe.fields, { name: 'materials', kind: 'i32' as const }];
  const values = new Uint32Array(rows * (width + 1));
  for (let row = 0; row < rows; row += 1) {
    for (let field = 0; field < width; field += 1) {
      values[row * (width + 1) + field] = universe.values[row * width + field] as number;
    }
    values[row * (width + 1) + width] = value >>> 0;
  }
  const rewritten: SnapshotComponent = { name: universe.name, fields, slots: universe.slots, values };

  return {
    ...envelope,
    components: envelope.components.map((component) =>
      component.name === UNIVERSE.name ? rewritten : component,
    ),
  };
}

/** The world as a build that had never heard of goal commitments saw it. */
function revisionOneEnvelope(): SnapshotEnvelope {
  return withLegacyMaterialsField(
    envelopeWithout(GOAL_COMMITMENT.name, EFFORT_PROGRESS.name, MATERIAL_STOCK.name, ...GOD_SECTIONS),
  );
}

/** The world as the build that added the goal commitment, and nothing after it, saw it. */
function revisionTwoEnvelope(): SnapshotEnvelope {
  return withLegacyMaterialsField(
    envelopeWithout(EFFORT_PROGRESS.name, MATERIAL_STOCK.name, ...GOD_SECTIONS),
  );
}

/** The world as the last build before the god had verbs saw it. */
function revisionThreeEnvelope(): SnapshotEnvelope {
  return withLegacyMaterialsField(envelopeWithout(MATERIAL_STOCK.name, ...GOD_SECTIONS));
}

/** The world as the last build before the economy differentiated into kinds saw it. */
function revisionFourEnvelope(materialsValue: number = LEGACY_MATERIALS_VALUE): SnapshotEnvelope {
  return withLegacyMaterialsField(envelopeWithout(MATERIAL_STOCK.name), materialsValue);
}

describe('the world-schema revision is read off the snapshot itself', () => {
  it('reads each revision from the newest component it carries', () => {
    expect(worldSchemaVersionOf(revisionOneEnvelope())).toBe(1);
    expect(worldSchemaVersionOf(revisionTwoEnvelope())).toBe(2);
    expect(worldSchemaVersionOf(revisionThreeEnvelope())).toBe(3);
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
    expect(SNAPSHOT_VERSION).toBe(1);
    expect(WORLD_SCHEMA_VERSION).toBe(5);
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
    // Four steps, not a shortcut: a revision-1 save has to pass through
    // revisions 2, 3 and 4 to reach 5, and the loop is what makes that true
    // without an extra code path only the oldest saves would ever exercise.
    const walked = migrateWorldEnvelope(revisionOneEnvelope());
    const carried = walked.components.map((component) => component.name);
    expect(worldSchemaVersionOf(walked)).toBe(WORLD_SCHEMA_VERSION);
    expect(carried).toContain(GOAL_COMMITMENT.name);
    expect(carried).toContain(EFFORT_PROGRESS.name);
    for (const name of GOD_SECTIONS) expect(carried).toContain(name);
    expect(carried).toContain(MATERIAL_STOCK.name);

    // And the rewrite actually ran: `universe` no longer carries `materials`,
    // which is the one part of this walk that is not "append an empty
    // section" and therefore the one part a naive four-step loop could get
    // wrong without any test noticing.
    const universe = walked.components.find((component) => component.name === UNIVERSE.name);
    expect(universe?.fields.map((field) => field.name)).not.toContain('materials');
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
    // And the walk did not stop at revision 4: this save also carries a
    // materials scalar the way every pre-revision-5 save did, and it is
    // expected to come out the other side split into material-stock.
    expect(componentOf(migrated, MATERIAL_STOCK).size).toBe(1);
  });
});

describe('migrating a revision-4 world snapshot forward (splitMaterialsByKind)', () => {
  it('splits the one stock into thirds, remainder to food, and drops materials from universe', () => {
    const before = revisionFourEnvelope();
    const after = splitMaterialsByKind.migrate(before);

    expect(worldSchemaVersionOf(after)).toBe(5);

    const universe = after.components.find((component) => component.name === UNIVERSE.name);
    expect(universe?.fields.map((field) => field.name)).toEqual(Object.keys(UNIVERSE.fields));
    expect(universe?.fields.map((field) => field.name)).not.toContain('materials');

    const stock = after.components.find((component) => component.name === MATERIAL_STOCK.name);
    expect(stock?.fields.map((field) => field.name)).toEqual(Object.keys(MATERIAL_STOCK.fields));
    expect(stock?.slots).toEqual(universe?.slots);
    // LEGACY_MATERIALS_VALUE is 1000, not a multiple of three: trunc(1000/3)
    // is 333, so stone and vellum get 333 each and food takes the remainder
    // -- 1000 - 333*2 = 334 -- per the field order MATERIAL_STOCK declares
    // (food, stone, vellum).
    expect(Array.from(stock?.values ?? [])).toEqual([334, 333, 333]);
  });

  it('leaves every other universe field exactly as the save had it, not merely correctly named', () => {
    // The column drop is a per-row splice, and a splice is exactly the kind of
    // arithmetic an off-by-one hides in silently: `fields` could be renamed
    // correctly while a *value* one column over had shifted into the gap.
    // Field names are checked above; this checks the numbers, row by row and
    // field by field, against the untouched fixture.
    const before = revisionFourEnvelope();
    const beforeUniverse = before.components.find((component) => component.name === UNIVERSE.name);
    if (beforeUniverse === undefined) throw new Error('fixture must carry a universe row');

    const after = splitMaterialsByKind.migrate(before);
    const afterUniverse = after.components.find((component) => component.name === UNIVERSE.name);
    if (afterUniverse === undefined) throw new Error('migration dropped the universe row entirely');

    // `withLegacyMaterialsField` always appends `materials` after the current
    // schema's fields, so it is the last column here -- the width comparison
    // below is what pins that down, rather than assuming it.
    const width = beforeUniverse.fields.length;
    expect(afterUniverse.fields.length).toBe(width - 1);

    for (let row = 0; row < beforeUniverse.slots.length; row += 1) {
      for (let field = 0; field < width - 1; field += 1) {
        expect(
          afterUniverse.values[row * (width - 1) + field],
          `universe field "${String(afterUniverse.fields[field]?.name)}" at row ${String(row)} ` +
            'changed value across a migration step that is documented to touch only `materials`',
        ).toBe(beforeUniverse.values[row * width + field]);
      }
    }
    expect(afterUniverse.slots).toEqual(beforeUniverse.slots);
  });

  it('splits a zero stock and a negative stock into non-negative thirds', () => {
    // Zero is the boundary the truncating division sits on, and negative is
    // the case `splitMaterialsByKind`'s own doc comment calls out: two's
    // complement bits read back unsigned would turn a debt into two billion
    // materials, so a negative stock has to clamp to zero rather than wrap.
    for (const value of [0, -1, -500]) {
      const after = splitMaterialsByKind.migrate(revisionFourEnvelope(value));
      const stock = after.components.find((component) => component.name === MATERIAL_STOCK.name);
      const [food, stone, vellum] = Array.from(stock?.values ?? []);
      expect(food, `food from a stock of ${String(value)}`).toBe(0);
      expect(stone, `stone from a stock of ${String(value)}`).toBe(0);
      expect(vellum, `vellum from a stock of ${String(value)}`).toBe(0);
    }
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionFourEnvelope();
    expect(splitMaterialsByKind.migrate(before).version).toBe(before.version);
    expect(splitMaterialsByKind.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionFourEnvelope();
    const componentCount = before.components.length;
    splitMaterialsByKind.migrate(before);
    expect(before.components).toHaveLength(componentCount);
    const universe = before.components.find((component) => component.name === UNIVERSE.name);
    expect(universe?.fields.map((field) => field.name)).toContain('materials');
  });

  it('appends an empty material-stock section when there is no universe row at all', () => {
    // The schema-declared-but-never-stepped case addGodAgencyState gives the
    // same answer for: a universe entity that was never created has nothing to
    // split, and the appended section is empty rather than synthesised.
    const before = revisionFourEnvelope();
    const withoutUniverse: SnapshotEnvelope = {
      ...before,
      components: before.components.filter((component) => component.name !== UNIVERSE.name),
    };

    const after = splitMaterialsByKind.migrate(withoutUniverse);
    const appended = after.components[after.components.length - 1];
    expect(appended?.name).toBe(MATERIAL_STOCK.name);
    expect(appended?.slots.length).toBe(0);
    expect(appended?.values.length).toBe(0);
  });

  it('refuses to migrate a universe section with no materials column', () => {
    // The refusal the migration's own doc comment names: guessing which
    // column held the economy is worse than refusing, because a wrong guess
    // corrupts a save silently and a refusal corrupts nothing. `envelopeWithout`
    // -- unlike every `revisionNEnvelope` helper above -- does *not* add the
    // legacy `materials` field back, so its `universe` section is exactly what
    // the current schema declares: no such column at all.
    const before = envelopeWithout(MATERIAL_STOCK.name);
    expect(() => splitMaterialsByKind.migrate(before)).toThrow(/must carry a "materials" field/u);

    // And the message names what it *did* find, so a reader debugging a
    // refused load sees the actual field list rather than only "not this
    // one" -- the same reason `componentOf`'s field-mismatch error names both
    // sides rather than only the one that failed.
    const universe = before.components.find((component) => component.name === UNIVERSE.name);
    for (const field of universe?.fields ?? []) {
      expect(() => splitMaterialsByKind.migrate(before)).toThrow(new RegExp(field.name, 'u'));
    }
  });

  it('carries a real save all the way through, via loadWorldSnapshot', () => {
    const bytes = encodeSnapshot(revisionFourEnvelope());
    const migrated = loadWorldSnapshot(bytes, defineWorldStateSchema());
    const [row] = collectRecords(migrated, MATERIAL_STOCK);
    expect(row?.row).toEqual({ food: 334, stone: 333, vellum: 333 });
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
    const { state, universe, mage, effort } = populatedWorld();
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
    ];
    for (const spec of godSpecs) {
      const store = componentOf(state, spec);
      for (const { handle } of collectRecords(state, spec)) store.remove(handle);
    }
    // And material-stock, to what the migration actually produces rather than
    // to whatever `fixtures.ts` seeded: the revision-1 envelope's universe
    // section carries `materials: LEGACY_MATERIALS_VALUE` (1000), and
    // splitMaterialsByKind divides that into thirds with the remainder on
    // food, not into the 500/250/150 split `populatedWorld()` seeds for its
    // own, unrelated reasons.
    attachRecord(state, MATERIAL_STOCK, universe, { food: 334, stone: 333, vellum: 333 });

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
      [encodeSnapshot(revisionFourEnvelope()), /material-stock/],
    ] as const) {
      expect(() => loadWorldSnapshot(bytes, defineWorldStateSchema())).not.toThrow();
      expect(() => envelopeToState(decodeSnapshot(bytes), defineWorldStateSchema())).toThrow(
        missing,
      );
    }
  });
});
