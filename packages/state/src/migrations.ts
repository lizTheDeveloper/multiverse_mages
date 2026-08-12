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
import { decodeSnapshot, envelopeToState } from '@mm/sim-core';

import {
  BAR_PHASE,
  BLESSING,
  EFFORT_PROGRESS,
  ERA_EVALUATION,
  GOAL_COMMITMENT,
  GOD_STATE,
  TERRITORY_HOLDING,
  UNIVERSITY_SITE,
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
 * | 5        | `university-siting` | adds `territory-holding` (§1.1) and `university-site` (§1.4) |
 * | 6        | W21 timing          | adds `bar-phase` — sound-design §5.2's eight-bar unease |
 *
 * Revision 4 adds four components in one step, where the two before it added
 * one each. That is not a loosening of the rule — it is what the rule is for.
 * The four arrive together because they are one capability's world state and no
 * build has ever carried a proper subset of them, so there is no snapshot in
 * existence that a finer-grained walk could describe. Splitting them into four
 * revisions would invent three intermediate versions nothing ever wrote, and
 * three migration steps that could only ever be exercised by a test.
 *
 * Revision 5 adds two for the same reason: a university's site is meaningless
 * without a holding to stand in, and no build has ever shipped one without the
 * other.
 *
 * Revision 6 adds `bar-phase` alone. It arrived on `w21/timing-and-envelopes`
 * numbered 5, because that branch and `university-siting` were both cut from a
 * tree whose newest revision was 4 and neither could see the other. **Two
 * different revision 5s cannot both exist** — the number is what a step is keyed
 * on — so integration renumbered this one to 6 rather than merging two
 * incompatible definitions of the same revision. That is a renumbering *before*
 * either shipped, which the rule below permits and is the only moment it is
 * safe: no snapshot in existence carries `bar-phase`, so no save can be keyed to
 * the revision it used to claim.
 *
 * **Append; never renumber.** A revision number is what a migration step is
 * keyed on, so reusing one silently applies the wrong repair to a save.
 */
export const WORLD_SCHEMA_VERSION = 6;

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
  // Newest marker first, which is what makes this readable top-down and is why
  // `bar-phase` sits above `territory-holding` rather than where the merge put
  // it: a revision-6 envelope carries both, so testing for revision 5's marker
  // first would report every current snapshot as one revision behind and run a
  // migration over a save that is already up to date.
  if (carried.has(BAR_PHASE.name)) return 6;
  // `territory-holding` is revision 5's marker on the same grounds `god-state`
  // is revision 4's: it is the first of the pair in `WORLD_COMPONENTS`, so an
  // envelope that somehow carried only the second reads as the older revision
  // and is completed, rather than reading as current and being left short.
  if (carried.has(TERRITORY_HOLDING.name)) return 5;
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
 * Revision 4 → 5: append empty `territory-holding` and `university-site`
 * sections.
 *
 * Empty, like every step before it, and the reasoning is the sharpest here yet
 * because the obvious alternative is *wrong in a way that would not be noticed*.
 *
 * A revision-4 save's carrying capacity was derived from `territory.json`'s
 * `landUnits`, summed once at the composition root. Restoring it into a build
 * that reads holdings from state, with no holding rows, would give it a `K` of
 * zero and starve it — so the tempting repair is to synthesize the five shipped
 * rows here. It is refused, twice over:
 *
 * - **A migration may not read content, and could not be right if it did.** This
 *   package takes only *types* from `@mm/content` (`contracts.md` §5), and a
 *   table of literals frozen at this revision could only describe the *shipped*
 *   `territory.json`. A revision-4 save written against a scenario's own content
 *   set meant *its* endowment, and no constant here can say so.
 * - **Absent rows already mean something, and it is the right something.** They
 *   mean *"this universe has not been stepped by a build that knows about
 *   holdings"*, which is exactly what a revision-4 save is. The world step
 *   materializes the endowment on the first tick that finds none — `god-state`'s
 *   lazy creation, applied to the one other piece of §1.1 state that has a
 *   content-derived starting value.
 *
 * The consequence is a rule the component notes state and colonization depends
 * on: **a universe that holds no ground carries rows saying `landUnits: 0`, not
 * no rows.** Those are different states and only one of them is repairable.
 *
 * An unsited university needs no such argument. It behaves neutrally in every
 * rate that reads a site, so a restored save's universities stand exactly where
 * they did before the concept existed: nowhere in particular.
 */
export const addTerritorySiting: WorldSchemaMigration = {
  from: 4,
  to: 5,
  migrate(envelope) {
    return {
      ...envelope,
      components: [
        ...envelope.components,
        emptySection(TERRITORY_HOLDING),
        emptySection(UNIVERSITY_SITE),
      ],
    };
  },
};

/**
 * Revision 5 → 6: append an empty `bar-phase` section.
 *
 * `sound-design.md` §5.2's eight-bar unease needs one integer per universe, and
 * §1.1's note on `god-state` says plainly which shape to give it: an added
 * component is an appended empty section, an added *field* reshapes a section
 * and rewrites every older save column by column.
 *
 * Empty, for the reason the four steps before it were. No row means the
 * universe has never changed its own law, which is true of every save written
 * before the rule existed — and a synthesised row would hand a restored
 * universe a decaying unease over an act nobody ever committed, which is the
 * cost surcharge equivalent of inventing a `favorWasted` nobody wasted.
 *
 * **This step was authored as 4 → 5** on `w21/timing-and-envelopes`, which was
 * cut from the same revision-4 tree as `university-siting` and could not see it.
 * Integration renumbered it rather than collapsing two unrelated component sets
 * into one revision, which would have made a revision-5 save ambiguous about
 * what it carried. A revision-4 envelope now walks 4 → 5 → 6 and gains all three
 * sections; the two steps stay independently exercisable, which is the property
 * that made splitting them worth the renumber.
 */
export const addBarPhase: WorldSchemaMigration = {
  from: 5,
  to: 6,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(BAR_PHASE)],
    };
  },
};

/** Every step this build knows, ascending by source revision. */
export const WORLD_SCHEMA_MIGRATIONS: readonly WorldSchemaMigration[] = [
  addGoalCommitment,
  addEffortProgress,
  addGodAgencyState,
  addTerritorySiting,
  addBarPhase,
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
