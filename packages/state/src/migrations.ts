/*
 * Multiverse Mages — forward migration of world snapshots across schema
 * revisions.
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
 * ## Two versions, and conflating them would have cost every golden fixture
 *
 * `@mm/sim-core` has a `SNAPSHOT_VERSION`, and the obvious reading of "adding a
 * component is a format change" is that adding one should bump it. It must not,
 * and the reason is checkable rather than stylistic: the format version is
 * written into the snapshot **header**, `snapshotHash` is defined as the digest
 * of the whole encoded buffer, and every golden fixture records a hash per tick.
 * Bumping `SNAPSHOT_VERSION` therefore changes every hash in the project at
 * once — the three committed fixtures stop replaying immediately, and they stop
 * replaying with a version error rather than a behaviour diff, so the
 * determinism gate reports a format bump where it is supposed to report a rules
 * change. Verified by doing it: with the constant set to 2 and nothing else
 * touched, all three fixtures fail in `deserializeState` before a single tick
 * runs.
 *
 * So the two questions are separated, because they are separate questions:
 *
 * - **`SNAPSHOT_VERSION` versions the container** — the header layout, the
 *   section framing, the field-kind codes. It belongs to `sim-core`, which knows
 *   nothing about magic, and only `sim-core` may move it.
 * - **{@link WORLD_SCHEMA_VERSION} versions the component set** — which §1
 *   components exist and in what order. It belongs here, because
 *   `WORLD_COMPONENTS` belongs here, and it moves when a capability adds a
 *   component.
 *
 * ## Why the schema version is inferred rather than stored
 *
 * There is no field in the envelope for a second version number, and adding one
 * would be a container change — the thing above says not to make. It is also
 * unnecessary: the snapshot format is **self-describing**. Every section carries
 * its component name and its full field table inline, and
 * `validateAgainstSchema` already treats that table as authoritative when it
 * decides whether a save can be loaded. So "which schema revision is this?" is
 * answerable from the snapshot itself, and {@link worldSchemaVersionOf} answers
 * it by looking for the components each revision introduced.
 *
 * A stored number would be a second source of truth for a fact the tables
 * already carry, and the two could disagree — a snapshot claiming revision 2
 * while carrying revision 1's twelve sections would then be migrated by nothing
 * and rejected by the schema check, with a message about a missing component and
 * no clue that a version field lied.
 *
 * ## Why this does not reuse `MigrationRegistry`
 *
 * `MigrationRegistry` keys steps on `envelope.version` and requires each step to
 * return a *higher* `envelope.version`. Both are correct for the container and
 * both are wrong here: a world-schema step must leave the container version
 * exactly where it found it. The properties that make `sim-core`'s migrations
 * testable are kept in full — a step is a pure `(envelope) => envelope`, it
 * returns a new envelope rather than mutating, and it can be exercised by
 * constructing an envelope and calling it, with no state, no schema and no
 * fixture file. That matters for the same reason it matters there: a migration
 * runs once per player per upgrade, and if it was wrong it has already destroyed
 * the save.
 */

import type {
  ComponentFields,
  ComponentSpec,
  SnapshotComponent,
  SnapshotEnvelope,
  SimState,
  WorldSchema,
} from '@mm/sim-core';
import { decodeSnapshot, envelopeToState, floorDiv } from '@mm/sim-core';

import {
  BLESSING,
  EFFORT_PROGRESS,
  ERA_EVALUATION,
  GOAL_COMMITMENT,
  GOD_STATE,
  GRANT_BUDGET,
  MATERIAL_STOCK,
  MID_RAID_CHANGE,
  UNIVERSE,
  UPHEAVAL,
} from './components.js';

/**
 * The revision of the §1 world component set this build declares.
 *
 * | Revision | Introduced by       | Change                                       |
 * | -------- | ------------------- | -------------------------------------------- |
 * | 1        | `core-contracts`    | the original twelve §1 components             |
 * | 2        | `mages-and-species` | adds `goal-commitment` (`contracts.md` §1.2)  |
 * | 3        | `mages-and-species` | adds `effort-progress` (`contracts.md` §1.2)  |
 * | 4        | `god-agency`        | adds `god-state`, `blessing`, `upheaval`, `era-evaluation` (§1.1) |
 * | 5        | `city-and-supply-chain` | adds `material-stock`; **removes** `universe.materials` |
 * | 6        | `god-agency`        | adds `grant-budget` (`contracts.md` §1.1)     |
 * | 7        | `raid-engagement`   | adds `mid-raid-change` (`raid-engagement.md` §1) |
 *
 * Revision 5 is the first step that does not only append. It splits the one
 * `materials` scalar into three kinds and takes the old field out of the
 * `universe` layout, because leaving it would leave a stock nothing spends
 * beside three stocks everything does. See {@link splitMaterialsByKind} for the
 * split rule and for why a section rewrite is safe here.
 *
 * Revision 7 appends `mid-raid-change`. It was written against revision 4 on
 * `w37/raid-playable` and renumbered on the merge — `material-stock` and
 * `grant-budget` had taken 5 and 6 in the meantime, and a revision number is
 * what a migration step is keyed on, so keeping the branch's 5 would have
 * silently applied a raid repair to a save that only needed the materials
 * split.
 *
 * Revision 4 adds four components in one step, where the two before it added
 * one each. That is not a loosening of the rule — it is what the rule is for.
 * The four arrive together because they are one capability's world state and no
 * build has ever carried a proper subset of them, so there is no snapshot in
 * existence that a finer-grained walk could describe. Splitting them into four
 * revisions would invent three intermediate versions nothing ever wrote, and
 * three migration steps that could only ever be exercised by a test.
 *
 * **Append; never renumber.** A revision number is what a migration step is
 * keyed on, so reusing one silently applies the wrong repair to a save.
 */
export const WORLD_SCHEMA_VERSION = 7;

/**
 * The world-schema revision an envelope was written by.
 *
 * Read from the component tables, newest marker first. Each revision is
 * identified by a component that revision introduced, so the test is "does this
 * snapshot know about X" rather than "does it claim to be version N" — which is
 * the property that makes the answer impossible to get wrong by writing the
 * wrong number somewhere.
 *
 * A snapshot carrying components from a *later* revision than this build knows
 * is not detected here and does not need to be: `envelopeToState` refuses a
 * snapshot carrying a component the world does not declare, with a message
 * naming it.
 */
export function worldSchemaVersionOf(envelope: SnapshotEnvelope): number {
  const carried = new Set(envelope.components.map((component) => component.name));
  // Revision 7's marker is `mid-raid-change`, checked first for the reason the
  // budget's is checked before the stock's: newest marker wins.
  if (carried.has(MID_RAID_CHANGE.name)) return 7;
  // Revision 6's marker is `grant-budget`, and it is checked before
  // `material-stock` because a revision-6 envelope also carries the stock — or
  // every save written since the budget landed would be walked through a
  // migration it has already had.
  if (carried.has(GRANT_BUDGET.name)) return 6;
  // Revision 5's marker is the presence of `material-stock`. The *absence* of
  // `universe.materials` would be an equally true test and a worse one: it asks
  // a question about a field table rather than about a section, and a save
  // half-way through an interrupted rewrite would answer it wrongly in the
  // direction that skips the migration.
  if (carried.has(MATERIAL_STOCK.name)) return 5;
  // `god-state` is revision 4's marker rather than one of the other three
  // because it is the one every stepped universe necessarily has a *section*
  // for — the section exists from the moment the schema declares it, whether or
  // not any row was written — and because it is the first of the four in
  // `WORLD_COMPONENTS`, so a partially-appended envelope reads as the older
  // revision and is completed rather than being read as current and left short.
  if (carried.has(GOD_STATE.name)) return 4;
  if (carried.has(EFFORT_PROGRESS.name)) return 3;
  if (carried.has(GOAL_COMMITMENT.name)) return 2;
  return 1;
}

/**
 * One step across one world-schema revision. Pure.
 *
 * Deliberately not `@mm/sim-core`'s `Migration`: that type's contract includes
 * "declare a higher version on its result", and a world-schema step must leave
 * the container version alone. The shape is otherwise identical, and so are the
 * obligations.
 */
export interface WorldSchemaMigration {
  /** The revision this step reads. */
  readonly from: number;
  /** The revision this step produces. Always `from + 1`. */
  readonly to: number;
  /** What it does. A new envelope out; the input is never mutated. */
  readonly migrate: (envelope: SnapshotEnvelope) => SnapshotEnvelope;
}

/**
 * An empty section for a component the snapshot predates.
 *
 * Zero rows, not zeroed rows, and both additions so far rely on that. A mage who
 * has never chosen a goal carries no `goal-commitment` row, and a mage with
 * nothing in flight carries no `effort-progress` row, so "nobody in a pre-0.4.0
 * save had either" is expressed by the sections being empty. Every one of those
 * mages re-evaluates on her next scheduled phase and starts her next project at
 * zero, which is exactly right for a save that never recorded one.
 *
 * Synthesising rows instead would be the wrong repair twice over: it would
 * invent an `adoptedTick` nobody ever adopted anything on, and it would hand
 * every restored mage a full commitment period of hysteresis protecting a goal
 * she was never observed to hold.
 */
function emptySection<F extends ComponentFields>(spec: ComponentSpec<F>): SnapshotComponent {
  return {
    name: spec.name,
    fields: Object.keys(spec.fields).map((name) => ({
      name,
      kind: spec.fields[name as keyof F],
    })),
    slots: new Uint32Array(0),
    values: new Uint32Array(0),
  };
}

/**
 * Revision 1 → 2: append an empty `goal-commitment` section.
 *
 * Appended, not inserted. Component order in the envelope must match
 * `WORLD_COMPONENTS` declaration order, and `goal-commitment` is declared last
 * there for exactly this reason — a component inserted in the middle would make
 * every older save's sections line up against the wrong layouts.
 */
export const addGoalCommitment: WorldSchemaMigration = {
  from: 1,
  to: 2,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(GOAL_COMMITMENT)],
    };
  },
};

/**
 * Revision 2 → 3: append an empty `effort-progress` section.
 *
 * Appended for the same reason `goal-commitment` was, and declared after it in
 * `WORLD_COMPONENTS` for the same reason: section order in an envelope is
 * declaration order, so a component inserted anywhere but the end would line
 * every older save's sections up against the wrong layouts.
 *
 * A revision-1 save reaches revision 3 by running both steps in turn, which is
 * what {@link migrateWorldEnvelope}'s loop is for. There is deliberately no
 * combined 1 → 3 shortcut: two steps that each do one thing can each be tested
 * for the one thing they do, and a shortcut is a third code path that only the
 * oldest saves in the wild ever exercise.
 */
export const addEffortProgress: WorldSchemaMigration = {
  from: 2,
  to: 3,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(EFFORT_PROGRESS)],
    };
  },
};

/**
 * Revision 6 → 7: append an empty `mid-raid-change` section.
 *
 * Empty is the correct repair and not merely the convenient one. A mark records
 * a ruleset change made **during a raid**, and no build before this one could
 * make one — the rule it descends from said a raid in progress was frozen
 * policy. So there is no save in existence holding a change this section should
 * describe, and synthesising rows would invent constitutional history: every
 * restored universe would owe a surcharge on edicts it issued in peacetime.
 */
export const addMidRaidChange: WorldSchemaMigration = {
  from: 6,
  to: 7,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(MID_RAID_CHANGE)],
    };
  },
};

/**
 * Revision 3 → 4: append `god-agency`'s four world-scale sections.
 *
 * Empty, like both steps before it, and for a sharper reason here. A god-state
 * row is *created lazily* by the god systems on their first tick, so "no row"
 * is the state a universe is in before it has been stepped — which is precisely
 * what a save written before `god-agency` existed describes. Synthesising one
 * would mean inventing a `favorWasted` nobody wasted and a `peakWorshipTier`
 * for a universe that never had worship, and the first stagnation check would
 * then read counters describing a run that never happened.
 *
 * The order below is `WORLD_COMPONENTS`' order and must stay that way: section
 * order in an envelope is declaration order, so appending these in a different
 * sequence would line every migrated save's sections up against the wrong
 * layouts.
 */
export const addGodAgencyState: WorldSchemaMigration = {
  from: 3,
  to: 4,
  migrate(envelope) {
    return {
      ...envelope,
      components: [
        ...envelope.components,
        emptySection(GOD_STATE),
        emptySection(BLESSING),
        emptySection(UPHEAVAL),
        emptySection(ERA_EVALUATION),
      ],
    };
  },
};

/**
 * Revision 4 → 5: split the one materials stock into three kinds, and take the
 * old field out of the universe layout.
 *
 * ## The first step that rewrites rather than appends
 *
 * Every step before this one adds an empty section and leaves the rest of the
 * envelope alone. This one cannot: `materials` was a field on `universe`, and a
 * field that has moved has to be taken out of the layout it moved from or the
 * component check refuses the restored state — {@link componentOf} compares the
 * declared field list against the stored one and throws naming both.
 *
 * The rewrite is a column drop on a row-major table, which is why it is safe to
 * do here at all. A `SnapshotComponent` carries its own field table inline, so
 * the migration reads the position of `materials` out of the envelope rather
 * than assuming one, and a save written by a build that ordered the fields
 * differently still migrates correctly.
 *
 * ## The split rule, and why it is thirds
 *
 * A save written before kinds existed **recorded no information about which
 * kind it held**. There is no honest way to recover a mix from a number that
 * never had one, so the split does not pretend to: the stock is divided into
 * equal thirds and the remainder — at most two `fp` units — goes to `food`,
 * because subsistence is first in the consumption order and a rounding crumb
 * should land where it is spent soonest.
 *
 * Two alternatives were considered and rejected for the same reason. Splitting
 * by the *shipped* territory mix would bake this build's content into a
 * migration, so a content retune would silently change what old saves are
 * worth. Putting the whole stock in `food` would restore a universe that can
 * eat forever and cannot write a page, which is a claim about a save nobody
 * made.
 *
 * A universe with no `universe` row — a schema that was declared and never
 * stepped — gets an empty `material-stock` section, which is the same answer
 * {@link addGodAgencyState} gives for the same situation.
 */
export const splitMaterialsByKind: WorldSchemaMigration = {
  from: 4,
  to: 5,
  migrate(envelope) {
    const universe = envelope.components.find((component) => component.name === UNIVERSE.name);
    const stockFields = Object.keys(MATERIAL_STOCK.fields).map((name) => ({
      name,
      kind: MATERIAL_STOCK.fields[name as keyof typeof MATERIAL_STOCK.fields],
    }));

    if (universe === undefined) {
      // No universe section at all. Nothing to split and nothing to rewrite;
      // the appended section is empty, as it is for every save that predates a
      // component it never wrote a row for.
      return { ...envelope, components: [...envelope.components, emptySection(MATERIAL_STOCK)] };
    }

    const column = universe.fields.findIndex((field) => field.name === 'materials');
    if (column < 0) {
      throw new Error(
        'a revision-4 snapshot must carry a "materials" field on its universe section, and this ' +
          `one carries [${universe.fields.map((field) => field.name).join(', ')}]. Refusing to ` +
          'migrate rather than guessing which column held the economy.',
      );
    }

    const width = universe.fields.length;
    const rows = universe.slots.length;
    const stockValues = new Uint32Array(rows * stockFields.length);
    const trimmed = new Uint32Array(rows * (width - 1));

    for (let row = 0; row < rows; row += 1) {
      // Two's-complement bits back into a signed magnitude: `i32` is how the
      // field was declared, and reading it unsigned would turn a debt into two
      // billion materials.
      const total = Math.max(0, (universe.values[row * width + column] as number) | 0);
      // Integer division. `Math.trunc(total / 3)` is float arithmetic, and this
      // repository bans it in the rules path without exception — a migration is
      // the last place to make one, because it runs once per player and its
      // output is the save.
      const each = floorDiv(total, 3);
      const food = total - each * 2;
      stockValues[row * 3] = food;
      stockValues[row * 3 + 1] = each;
      stockValues[row * 3 + 2] = each;

      let write = row * (width - 1);
      for (let field = 0; field < width; field += 1) {
        if (field === column) continue;
        trimmed[write] = universe.values[row * width + field] as number;
        write += 1;
      }
    }

    const rewritten: SnapshotComponent = {
      name: universe.name,
      fields: universe.fields.filter((_, index) => index !== column),
      slots: universe.slots,
      values: trimmed,
    };

    return {
      ...envelope,
      components: [
        ...envelope.components.map((component) =>
          component.name === UNIVERSE.name ? rewritten : component,
        ),
        {
          name: MATERIAL_STOCK.name,
          fields: stockFields,
          slots: universe.slots,
          values: stockValues,
        },
      ],
    };
  },
};

/**
 * Revision 5 → 6: append an empty `grant-budget` section.
 *
 * Empty is the whole repair, and it is not the "nobody had one yet" argument the
 * steps above make — it is a stronger one. `foundingGrantsRemaining` reads an
 * absent row as **unbounded**, so a revision-5 save restored into this build
 * keeps making founding grants exactly as it did when it was written.
 *
 * Synthesising a row would be the destructive choice here, and it is the one
 * place in this file where appending beats rewriting. `splitMaterialsByKind`
 * above rewrites, and is right to: a save that recorded a materials total did
 * record something, and the split is an honest reading of it. A save that
 * predates the budget recorded nothing about it at all.
 *
 * Whatever numbers a synthesised row carried would be a budget the god never
 * agreed to and never spent against: `grantsUsed` would read zero for a run that
 * may have made thirty grants, so a restored save would be handed a fresh
 * allowance, and a `cap` filled from *this build's* content would impose a limit
 * on a run measured without one. A save that predates the budget has no budget,
 * and that is representable.
 */
export const addGrantBudget: WorldSchemaMigration = {
  from: 5,
  to: 6,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(GRANT_BUDGET)],
    };
  },
};

/** Every step this build knows, ascending by source revision. */
export const WORLD_SCHEMA_MIGRATIONS: readonly WorldSchemaMigration[] = [
  addGoalCommitment,
  addEffortProgress,
  addGodAgencyState,
  splitMaterialsByKind,
  addGrantBudget,
  addMidRaidChange,
];

/**
 * Walks an envelope forward to {@link WORLD_SCHEMA_VERSION}.
 *
 * Forward only, and an envelope already current is returned as-is — the same
 * object, because there is nothing to change and a copy would only invite a
 * caller to believe the two could differ. Both rules are `sim-core`'s, kept
 * because the argument for them does not change with the version being walked.
 */
export function migrateWorldEnvelope(envelope: SnapshotEnvelope): SnapshotEnvelope {
  let current = envelope;
  let revision = worldSchemaVersionOf(current);

  if (revision > WORLD_SCHEMA_VERSION) {
    throw new Error(
      `This snapshot was written against world-schema revision ${revision}, which is newer than ` +
        `the revision ${WORLD_SCHEMA_VERSION} this build declares. Migrations only run forward: ` +
        'this build does not know what a later revision moved, so reading it anyway would mean ' +
        'reading some values as other values.',
    );
  }

  while (revision < WORLD_SCHEMA_VERSION) {
    const step = WORLD_SCHEMA_MIGRATIONS.find((candidate) => candidate.from === revision);
    if (step === undefined) {
      throw new Error(
        `No world-schema migration is registered from revision ${revision}, so revision ` +
          `${WORLD_SCHEMA_VERSION} cannot be reached from ${worldSchemaVersionOf(envelope)}.`,
      );
    }
    current = step.migrate(current);
    const reached = worldSchemaVersionOf(current);
    if (reached <= revision) {
      throw new Error(
        `The world-schema migration from revision ${revision} produced a snapshot that still ` +
          `reads as revision ${reached}. A step must leave behind the marker its target revision ` +
          'is recognised by, or the walk below it never terminates.',
      );
    }
    revision = reached;
  }

  return current;
}

/**
 * Loads a world snapshot, bringing an older schema revision forward first.
 *
 * The world-scale counterpart to `deserializeState`, and it deliberately does
 * not call it: `deserializeState` applies *container* version policy, and this
 * change does not move the container version, so routing through it would only
 * offer somewhere for the two versions to be confused. `decodeSnapshot` accepts
 * any container version for the same reason it always did — an old snapshot has
 * to become data before anyone can reason about it.
 */
export function loadWorldSnapshot(buffer: Uint8Array, schema: WorldSchema): SimState {
  return envelopeToState(migrateWorldEnvelope(decodeSnapshot(buffer)), schema);
}
