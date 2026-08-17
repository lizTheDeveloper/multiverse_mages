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
  BAR_PHASE,
  ERA_EVALUATION,
  GOAL_COMMITMENT,
  GOD_STATE,
  GRANT_BUDGET,
  KNOWLEDGE_FIDELITY,
  MAGE,
  MATERIAL_GRADE,
  MATERIAL_STOCK,
  TERRITORY_HOLDING,
  UNIVERSE,
  UNIVERSITY_SITE,
  UPHEAVAL,
  WORLD_COMPONENTS,
  WORLD_SCHEMA_VERSION,
  addEffortProgress,
  addGoalCommitment,
  addGodAgencyState,
  addGrantBudget,
  addMidRaidChange,
  addTerritorySiting,
  addKnowledgeFidelity,
  addMaterialGrade,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  findUniverse,
  foundingGrantsRemaining,
  MID_RAID_CHANGE,
  loadWorldSnapshot,
  migrateWorldEnvelope,
  readRecord,
  splitMaterialsByKind,
  widenMaterialStock,
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
    envelopeWithout(GOAL_COMMITMENT.name, EFFORT_PROGRESS.name, MATERIAL_STOCK.name, ...GOD_SECTIONS, GRANT_BUDGET.name, BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name),
  );
}

/** The world as the build that added the goal commitment, and nothing after it, saw it. */
function revisionTwoEnvelope(): SnapshotEnvelope {
  return withLegacyMaterialsField(
    envelopeWithout(EFFORT_PROGRESS.name, MATERIAL_STOCK.name, ...GOD_SECTIONS, GRANT_BUDGET.name, BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name),
  );
}

/** The world as the last build before the god had verbs saw it. */
function revisionThreeEnvelope(): SnapshotEnvelope {
  return withLegacyMaterialsField(envelopeWithout(MATERIAL_STOCK.name, ...GOD_SECTIONS, GRANT_BUDGET.name, BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name));
}

/** The world as the last build before the economy differentiated into kinds saw it. */
function revisionFourEnvelope(materialsValue: number = LEGACY_MATERIALS_VALUE): SnapshotEnvelope {
  return withLegacyMaterialsField(envelopeWithout(MATERIAL_STOCK.name, GRANT_BUDGET.name, BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name), materialsValue);
}

/**
 * The three kinds `material-stock` carried at revisions 5 and 6, frozen.
 *
 * A literal rather than `Object.keys(MATERIAL_STOCK.fields)`, and the same
 * reason the migration itself freezes it: the live spec now names seven, so a
 * fixture reading the spec would build a **revision-7** section and call it a
 * revision-5 one.
 */
const REVISION_FIVE_KINDS = ['food', 'stone', 'vellum'] as const;

/** Rebuilds `material-stock` with only the columns revision 6 knew about. */
function withThreeKindStock(envelope: SnapshotEnvelope): SnapshotEnvelope {
  const stock = envelope.components.find((component) => component.name === MATERIAL_STOCK.name);
  if (stock === undefined) return envelope;

  const width = stock.fields.length;
  const rows = stock.slots.length;
  const keep = REVISION_FIVE_KINDS.map((kind) =>
    stock.fields.findIndex((field) => field.name === kind),
  );
  const values = new Uint32Array(rows * keep.length);
  for (let row = 0; row < rows; row += 1) {
    for (let index = 0; index < keep.length; index += 1) {
      values[row * keep.length + index] = stock.values[row * width + (keep[index] as number)] as number;
    }
  }
  const rewritten: SnapshotComponent = {
    name: stock.name,
    fields: REVISION_FIVE_KINDS.map((kind) => ({ name: kind, kind: 'i32' as const })),
    slots: stock.slots,
    values,
  };
  return {
    ...envelope,
    components: envelope.components.map((component) =>
      component.name === MATERIAL_STOCK.name ? rewritten : component,
    ),
  };
}

/** The world as the last build whose founding grants were unlimited saw it. */
function revisionFiveEnvelope(): SnapshotEnvelope {
  return withThreeKindStock(
    envelopeWithout(GRANT_BUDGET.name, BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name),
  );
}

/**
 * The world as the last build with only three material kinds saw it.
 *
 * `withThreeKindStock` is what makes this a revision **6** and not a revision 7:
 * every `revisionNEnvelope` above it drops the *sections* later revisions added,
 * and revision 7's marker is a `material-stock` **field**, so dropping sections
 * alone would leave a seven-column stock in an envelope claiming to be older
 * than the widening. That is the one revision in this walk a component test
 * cannot detect, and this is the only line that expresses it.
 */
function revisionSixEnvelope(): SnapshotEnvelope {
  return withThreeKindStock(
    envelopeWithout(BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name),
  );
}

/** The world as the last build before the god's law had a clock saw it. */
function revisionSevenEnvelope(): SnapshotEnvelope {
  return envelopeWithout(BAR_PHASE.name, MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name);
}

/** The world as the last build that believed a raid was frozen policy saw it. */
function revisionEightEnvelope(): SnapshotEnvelope {
  return envelopeWithout(MID_RAID_CHANGE.name, ...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name);
}

/** The world as the last build in which a university stood nowhere saw it. */
function revisionNineEnvelope(): SnapshotEnvelope {
  return envelopeWithout(...SITING_SECTIONS, KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name);
}

/** The world as the last build in which no rock had ever been improved saw it. */
function revisionElevenEnvelope(): SnapshotEnvelope {
  return envelopeWithout(MATERIAL_GRADE.name);
}

/** The world as the last build before scribing fidelity saw it. */
function revisionTenEnvelope(): SnapshotEnvelope {
  return envelopeWithout(KNOWLEDGE_FIDELITY.name, MATERIAL_GRADE.name);
}

describe('the world-schema revision is read off the snapshot itself', () => {
  it('reads each revision from the newest component it carries', () => {
    expect(worldSchemaVersionOf(revisionOneEnvelope())).toBe(1);
    expect(worldSchemaVersionOf(revisionTwoEnvelope())).toBe(2);
    expect(worldSchemaVersionOf(revisionThreeEnvelope())).toBe(3);
    expect(worldSchemaVersionOf(revisionFourEnvelope())).toBe(4);
    expect(worldSchemaVersionOf(revisionFiveEnvelope())).toBe(5);
    expect(worldSchemaVersionOf(revisionSixEnvelope())).toBe(6);
    // Revision 7 is the one arm that is not a component test: its marker is a
    // `material-stock` field. `revisionSevenEnvelope` differs from
    // `revisionSixEnvelope` by exactly that — same sections, seven columns
    // instead of three — which is what makes this pair a positive control for
    // the field arm rather than a restatement of the section arms.
    expect(worldSchemaVersionOf(revisionSevenEnvelope())).toBe(7);
    expect(worldSchemaVersionOf(revisionEightEnvelope())).toBe(8);
    expect(worldSchemaVersionOf(revisionNineEnvelope())).toBe(9);
    expect(worldSchemaVersionOf(revisionTenEnvelope())).toBe(10);
    expect(worldSchemaVersionOf(revisionElevenEnvelope())).toBe(11);
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
    expect(WORLD_SCHEMA_VERSION).toBe(12);
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
    expect(carried).toContain(BAR_PHASE.name);
    expect(carried).toContain(MATERIAL_STOCK.name);
    expect(carried).toContain(MID_RAID_CHANGE.name);

    // And the rewrite actually ran: `universe` no longer carries `materials`,
    // which is the one part of this walk that is not "append an empty
    // section" and therefore the one part a naive four-step loop could get
    // wrong without any test noticing.
    const universe = walked.components.find((component) => component.name === UNIVERSE.name);
    expect(universe?.fields.map((field) => field.name)).not.toContain('materials');

    for (const name of SITING_SECTIONS) expect(carried).toContain(name);
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
    // The frozen three, **not** `Object.keys(MATERIAL_STOCK.fields)`. Revision 5
    // produced three columns; the live spec now names seven, and a step that read
    // the spec would emit a revision-7 section from a revision-4 save — which
    // reads as revision 7 immediately, so the walk exits and `addGrantBudget`
    // never runs. See the walk test below.
    expect(stock?.fields.map((field) => field.name)).toEqual([...REVISION_FIVE_KINDS]);
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
    expect(row?.row).toEqual({
      food: 334,
      stone: 333,
      vellum: 333,
      labor: 0,
      essence: 0,
      insight: 0,
      passage: 0,
    });
  });
});

describe('migrating a revision-5 world snapshot forward', () => {
  it('appends grant-budget as an empty section, in last position', () => {
    const before = revisionFiveEnvelope();
    const after = addGrantBudget.migrate(before);

    const appended = after.components[after.components.length - 1];
    expect(appended?.name).toBe(GRANT_BUDGET.name);
    expect(appended?.slots.length).toBe(0);
    expect(appended?.values.length).toBe(0);
    expect(appended?.fields.map((field) => field.name)).toEqual(Object.keys(GRANT_BUDGET.fields));
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionFiveEnvelope();
    expect(addGrantBudget.migrate(before).version).toBe(before.version);
    expect(addGrantBudget.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionFiveEnvelope();
    const componentCount = before.components.length;
    addGrantBudget.migrate(before);
    expect(before.components).toHaveLength(componentCount);
  });

  it('restores a pre-budget save with no budget at all, which is unbounded', () => {
    // Empty, and here the emptiness is load-bearing in a way the appending steps
    // before it did not have to argue: an absent row means *no budget in force*,
    // so a save written when founding grants were unlimited keeps making them.
    // A synthesised row would be worse than merely wrong -- its `grantsUsed`
    // would read zero for a run that may have granted thirty times, handing a
    // restored save a fresh allowance, and its `cap` would come from this
    // build's content and impose a limit on a run measured without one.
    //
    // This is also the step that contrasts with `splitMaterialsByKind`, which
    // rewrites and is right to: a save that recorded a materials total did
    // record something. A save that predates the budget recorded nothing.
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionFiveEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, GRANT_BUDGET).size).toBe(0);
    expect(foundingGrantsRemaining(migrated, findUniverse(migrated))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('keeps the material stock a revision-5 save did record', () => {
    // The "must not disturb its predecessor" check, aimed one revision later:
    // material-stock is the section immediately before this one, and a repair
    // that appended in the wrong place would line it up against the wrong
    // layout.
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionFiveEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, MATERIAL_STOCK).size).toBeGreaterThan(0);
    expect(componentOf(migrated, GRANT_BUDGET).size).toBe(0);
  });
});

describe('migrating a revision-6 world snapshot forward (widenMaterialStock)', () => {
  it('appends the four new kinds at zero and leaves the three it found alone', () => {
    const before = revisionSixEnvelope();
    const beforeStock = before.components.find((c) => c.name === MATERIAL_STOCK.name);
    if (beforeStock === undefined) throw new Error('fixture must carry a material-stock section');

    const after = widenMaterialStock.migrate(before);
    expect(worldSchemaVersionOf(after)).toBe(7);

    const stock = after.components.find((c) => c.name === MATERIAL_STOCK.name);
    expect(stock?.fields.map((field) => field.name)).toEqual(Object.keys(MATERIAL_STOCK.fields));
    expect(stock?.slots).toEqual(beforeStock.slots);

    const width = stock?.fields.length ?? 0;
    for (let row = 0; row < beforeStock.slots.length; row += 1) {
      for (let index = 0; index < REVISION_FIVE_KINDS.length; index += 1) {
        expect(
          stock?.values[row * width + index],
          `${String(REVISION_FIVE_KINDS[index])} at row ${String(row)} moved across a migration ` +
            'documented to append columns and touch nothing',
        ).toBe(beforeStock.values[row * REVISION_FIVE_KINDS.length + index]);
      }
      // **An absent kind reads zero, never as a shortage.** This is the whole
      // requirement: a migrated save must not starve on a stock it was never
      // given the chance to accumulate.
      for (let index = REVISION_FIVE_KINDS.length; index < width; index += 1) {
        expect(
          stock?.values[row * width + index],
          `${String(stock?.fields[index]?.name)} at row ${String(row)} did not read zero`,
        ).toBe(0);
      }
    }
  });

  it('widens a section with no rows at all', () => {
    // A schema declared and never stepped. The columns still have to arrive, or
    // the component check refuses the restored state on the field list alone.
    const before = revisionSixEnvelope();
    const emptied: SnapshotEnvelope = {
      ...before,
      components: before.components.map((component) =>
        component.name === MATERIAL_STOCK.name
          ? { ...component, slots: new Uint32Array(0), values: new Uint32Array(0) }
          : component,
      ),
    };
    const stock = widenMaterialStock
      .migrate(emptied)
      .components.find((c) => c.name === MATERIAL_STOCK.name);
    expect(stock?.fields.map((field) => field.name)).toEqual(Object.keys(MATERIAL_STOCK.fields));
    expect(stock?.values.length).toBe(0);
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionSixEnvelope();
    expect(widenMaterialStock.migrate(before).version).toBe(before.version);
    expect(widenMaterialStock.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionSixEnvelope();
    const stock = before.components.find((c) => c.name === MATERIAL_STOCK.name);
    const width = stock?.fields.length;
    widenMaterialStock.migrate(before);
    expect(
      before.components.find((c) => c.name === MATERIAL_STOCK.name)?.fields.length,
    ).toBe(width);
  });

  it('walks a revision-4 save to 7 without skipping the grant budget', () => {
    // The regression test for the trap this revision very nearly shipped.
    //
    // `splitMaterialsByKind` used to build its field table from
    // `Object.keys(MATERIAL_STOCK.fields)` — the *live* spec. The moment the
    // spec named seven kinds, the 4 -> 5 step emitted a seven-column section, a
    // revision-4 save read as **revision 7** the instant it reached 5, and
    // `migrateWorldEnvelope`'s loop exited with `grant-budget` never appended:
    // a save silently missing a component, produced by a migration that threw
    // nothing.
    for (const envelope of [revisionOneEnvelope(), revisionFourEnvelope()]) {
      const walked = migrateWorldEnvelope(envelope);
      expect(worldSchemaVersionOf(walked)).toBe(WORLD_SCHEMA_VERSION);
      expect(walked.components.map((component) => component.name)).toContain(GRANT_BUDGET.name);
      const stock = walked.components.find((c) => c.name === MATERIAL_STOCK.name);
      expect(stock?.fields.map((field) => field.name)).toEqual(Object.keys(MATERIAL_STOCK.fields));
    }
  });

  it('restores a revision-6 save with the four new kinds at zero and nothing else moved', () => {
    // End to end, through the real loader, and the control is **the revision-7
    // save of the same world** rather than the current world.
    //
    // The branch this came from compared against `populatedWorld().state`
    // directly, and on that tree the two were the same thing: revision 7 was the
    // newest revision, so a save one step behind it differed only in the stock.
    // Four more revisions arrived between 6 and 11 on the combine — `bar-phase`,
    // `mid-raid-change`, the siting pair, `knowledge-fidelity` — and every one
    // of them appends a section a revision-6 save does not carry. So a revision-6
    // save walked to 11 is legitimately *not* byte-identical to the current
    // world, and asserting that it is would be asserting that four unrelated
    // migrations are no-ops.
    //
    // The claim being made is about `widenMaterialStock` and nothing else, so
    // the control is the envelope that differs from it in exactly one thing: the
    // same sections, seven stock columns instead of three. Both walk through the
    // same four appends, so those cancel, and what is left is the spec's *"an
    // absent kind is not a shortage"* stated as a hash.
    const { universe } = populatedWorld();
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionSixEnvelope()),
      defineWorldStateSchema(),
    );
    const control = loadWorldSnapshot(
      encodeSnapshot(revisionSevenEnvelope()),
      defineWorldStateSchema(),
    );

    const row = readRecord(migrated, MATERIAL_STOCK, universe);
    expect(row).toEqual(readRecord(control, MATERIAL_STOCK, universe));
    expect(row.labor).toBe(0);
    expect(row.essence).toBe(0);
    expect(row.insight).toBe(0);
    expect(row.passage).toBe(0);

    expect(snapshotHash(migrated)).toBe(snapshotHash(control));
    expect(Array.from(serializeState(migrated))).toEqual(Array.from(serializeState(control)));

    // The positive control on the control: the two envelopes really are a
    // revision apart, or the equality above would be a tautology over one
    // object.
    expect(worldSchemaVersionOf(revisionSixEnvelope())).toBe(6);
    expect(worldSchemaVersionOf(revisionSevenEnvelope())).toBe(7);
  });
});

describe('migrating a revision-6 world snapshot forward', () => {
  it('appends mid-raid-change as an empty section, in last position', () => {
    const before = revisionSixEnvelope();
    const after = addMidRaidChange.migrate(before);
    const appended = after.components.slice(before.components.length);

    expect(appended.map((component) => component.name)).toEqual([MID_RAID_CHANGE.name]);
    expect(appended[0]?.slots.length).toBe(0);
    expect(appended[0]?.values.length).toBe(0);
    expect(appended[0]?.fields.map((field) => field.name)).toEqual(
      Object.keys(MID_RAID_CHANGE.fields),
    );
  });
});

describe('migrating a revision-9 world snapshot forward', () => {
  it("appends university-siting's two sections, in WORLD_COMPONENTS order, both empty", () => {
    const before = revisionNineEnvelope();
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
    const before = revisionNineEnvelope();
    expect(addTerritorySiting.migrate(before).version).toBe(before.version);
    expect(addTerritorySiting.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('restores a pre-raid-engagement save owing no surcharge on anything', () => {
    // Empty rather than synthesised, and here the distinction is a bill. Before
    // this revision the rule was that a raid in progress was frozen policy, so
    // no save in existence holds a change this section could describe. A zeroed
    // row would charge a god four times over for an edict she issued in
    // peacetime.
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionSixEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, MID_RAID_CHANGE).size).toBe(0);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionNineEnvelope();
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
      encodeSnapshot(revisionNineEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, TERRITORY_HOLDING).size).toBe(0);
    expect(componentOf(migrated, UNIVERSITY_SITE).size).toBe(0);
  });

  it('keeps the god state a revision-4 save did record', () => {
    const { universe } = populatedWorld();
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionNineEnvelope()),
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
    const { state, universe, mage, effort, instance } = populatedWorld();
    componentOf(state, GOAL_COMMITMENT).remove(mage);
    // And the fidelity row, for the same reason as the god sections below: the
    // revision-1 envelope has no `knowledge-fidelity` section, so the fresh
    // save it is compared against must carry no `knowledge-fidelity` row.
    componentOf(state, KNOWLEDGE_FIDELITY).remove(instance);
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
      GRANT_BUDGET,
      GOD_STATE,
      BLESSING,
      UPHEAVAL,
      ERA_EVALUATION,
      BAR_PHASE,
      MID_RAID_CHANGE,
      TERRITORY_HOLDING,
      UNIVERSITY_SITE,
      // And `material-grade`. `addMaterialGrade` appends an **empty** section,
      // so a revision-1 save comes forward holding no refined material at all —
      // which is the absent-value reading working, not a loss. The fixture
      // seeds a row for its own reasons and it has to come off for the two
      // sides to be the same world.
      MATERIAL_GRADE,
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
    attachRecord(state, MATERIAL_STOCK, universe, {
      food: 334,
      stone: 333,
      vellum: 333,
      labor: 0,
      essence: 0,
      insight: 0,
      passage: 0,
    });

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
      [encodeSnapshot(revisionFiveEnvelope()), /grant-budget/],
      // Revisions 6 and 7 both name `bar-phase`, and that is measured rather
      // than assumed: the component check reports a **missing section** before
      // it reports a field-list mismatch, so a revision-6 envelope — which is
      // short both `bar-phase` and four stock columns — is refused on the
      // section. The two rows are not redundant even so; each asserts that its
      // own envelope loads through the migration and refuses without it, which
      // is the property, and the field arm is covered by
      // `worldSchemaVersionOf` above.
      [encodeSnapshot(revisionSixEnvelope()), /bar-phase/],
      [encodeSnapshot(revisionSevenEnvelope()), /bar-phase/],
      [encodeSnapshot(revisionEightEnvelope()), /mid-raid-change/],
      [encodeSnapshot(revisionNineEnvelope()), /territory-holding/],
      [encodeSnapshot(revisionTenEnvelope()), /knowledge-fidelity/],
    ] as const) {
      expect(() => loadWorldSnapshot(bytes, defineWorldStateSchema())).not.toThrow();
      expect(() => envelopeToState(decodeSnapshot(bytes), defineWorldStateSchema())).toThrow(
        missing,
      );
    }
  });
});

describe('migrating a revision-6 world snapshot forward', () => {
  it('appends knowledge-fidelity as an empty section, in last position', () => {
    const before = revisionSixEnvelope();
    const after = addKnowledgeFidelity.migrate(before);

    const appended = after.components[after.components.length - 1];
    expect(appended?.name).toBe(KNOWLEDGE_FIDELITY.name);
    expect(appended?.slots.length).toBe(0);
    expect(appended?.values.length).toBe(0);
    expect(appended?.fields.map((field) => field.name)).toEqual(
      Object.keys(KNOWLEDGE_FIDELITY.fields),
    );
  });

  it('appends it last, which is where WORLD_COMPONENTS puts it', () => {
    // The position, not merely the presence. Section order in an envelope is
    // `WORLD_COMPONENTS` order, so a component declared anywhere but last would
    // line every revision-6 save's sections up against the wrong layouts -- and
    // the failure would not be a refusal, it would be one component's values
    // read as another's. Asserted against the declaration itself rather than
    // against a literal index, so it keeps holding at revision 11.
    //
    // The second assertion named `grant-budget` because, on W190's own branch,
    // that *was* the component before this one. Four more have been appended
    // since (`bar-phase`, `mid-raid-change`, and siting's two), so the
    // predecessor is now `university-site`. Only the **last** position is a
    // property of this component; the identity of its predecessor is not, so
    // that half is dropped rather than re-pinned to a name the next append would
    // move again.
    //
    // And the same append has now happened again: revision 12's `material-grade`
    // sits last, so this assertion names *it*. That is the assertion doing its
    // job rather than rotting — what it pins is "the newest component is last",
    // which is the property section order depends on, and the name it carries is
    // whichever component most recently arrived.
    const declared = WORLD_COMPONENTS.map((spec) => spec.name);
    expect(declared[declared.length - 1]).toBe(MATERIAL_GRADE.name);
  });

  it('leaves the container format version exactly where it found it', () => {
    const before = revisionTenEnvelope();
    expect(addKnowledgeFidelity.migrate(before).version).toBe(before.version);
    expect(addKnowledgeFidelity.migrate(before).version).toBe(SNAPSHOT_VERSION);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionSixEnvelope();
    const componentCount = before.components.length;
    addKnowledgeFidelity.migrate(before);
    expect(before.components).toHaveLength(componentCount);
  });

  it('restores a pre-fidelity save with every book fresh and sound', () => {
    // Empty, and the emptiness is the whole repair. Every reader of this
    // component treats an absent row as copy generation zero and `sound`, which
    // is exactly what a save written before scribing fidelity recorded: nothing.
    //
    // Synthesising a distance from `acquiredTick` was the alternative and there
    // is no honest rule for it -- the old state does not record what a book was
    // copied *from*, so any number chosen would be a fidelity loss the save
    // never suffered, applied retroactively to a library the player already has.
    const migrated = loadWorldSnapshot(
      encodeSnapshot(revisionSixEnvelope()),
      defineWorldStateSchema(),
    );
    expect(componentOf(migrated, KNOWLEDGE_FIDELITY).size).toBe(0);
  });
});

describe('migrating a revision-11 world snapshot forward (addMaterialGrade)', () => {
  it('appends material-grade as an empty section, in last position', () => {
    const before = revisionElevenEnvelope();
    const after = addMaterialGrade.migrate(before);

    const appended = after.components[after.components.length - 1];
    expect(appended?.name).toBe(MATERIAL_GRADE.name);
    // Zero rows, not zeroed rows. A universe that never refined anything holds
    // no refined material, and a synthesised zero row would be a claim that
    // somebody looked.
    expect(appended?.slots.length).toBe(0);
    expect(appended?.values.length).toBe(0);
    expect(appended?.fields.map((field) => field.name)).toEqual(Object.keys(MATERIAL_GRADE.fields));
  });

  it('leaves the container format version and the raw stock exactly where it found them', () => {
    const before = revisionElevenEnvelope();
    const after = addMaterialGrade.migrate(before);
    expect(after.version).toBe(before.version);
    expect(after.version).toBe(SNAPSHOT_VERSION);
    // Grades are a second axis on the stock, not a re-partition of it: an
    // eleven-revision save must come forward holding every unit of raw stone it
    // went in with, or the migration has quietly spent a resource.
    const stockBefore = before.components.find((component) => component.name === MATERIAL_STOCK.name);
    const stockAfter = after.components.find((component) => component.name === MATERIAL_STOCK.name);
    expect(stockAfter).toEqual(stockBefore);
  });

  it('does not mutate the envelope it was given', () => {
    const before = revisionElevenEnvelope();
    const componentCount = before.components.length;
    addMaterialGrade.migrate(before);
    expect(before.components).toHaveLength(componentCount);
    expect(before.components.some((component) => component.name === MATERIAL_GRADE.name)).toBe(
      false,
    );
  });

  it('reads the migrated envelope as revision 12, so the walk terminates', () => {
    // The positive control on the step's own marker. `migrateWorldEnvelope`
    // throws if a step leaves behind no marker its target revision is
    // recognised by — this asserts the marker landed rather than trusting the
    // loop's error not to fire.
    expect(worldSchemaVersionOf(revisionElevenEnvelope())).toBe(11);
    expect(worldSchemaVersionOf(addMaterialGrade.migrate(revisionElevenEnvelope()))).toBe(12);
  });
});
