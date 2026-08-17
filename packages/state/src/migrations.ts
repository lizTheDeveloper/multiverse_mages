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
  BAR_PHASE,
  BLESSING,
  EFFORT_PROGRESS,
  ERA_EVALUATION,
  GOAL_COMMITMENT,
  GOD_STATE,
  GRANT_BUDGET,
  KNOWLEDGE_FIDELITY,
  MATERIAL_GRADE,
  MATERIAL_STOCK,
  MID_RAID_CHANGE,
  STANDING_WORKING,
  TERRITORY_HOLDING,
  UNIVERSE,
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
 * | 5        | `city-and-supply-chain` | adds `material-stock`; **removes** `universe.materials` |
 * | 6        | `god-agency`        | adds `grant-budget` (`contracts.md` §1.1)     |
 * | 7        | `material-economy`  | **widens** `material-stock` from three kinds to seven |
 * | 8        | W21 timing          | adds `bar-phase` — sound-design §5.2's eight-bar unease |
 * | 9        | `raid-engagement`   | adds `mid-raid-change` (`raid-engagement.md` §1) |
 * | 10       | `university-siting` | adds `territory-holding` (§1.1) and `university-site` (§1.4) |
 * | 11       | `scribing-fidelity` | adds `knowledge-fidelity` (`docs/design/scribing-fidelity.md`) |
 * | 12       | `material-grade`    | adds `material-grade` — **not in this tree**; see the note below |
 * | 13       | `working-duration`  | adds `standing-working` — an effect that expires unless renewed |
 *
 * The table above is the walk, in order, and it is the only place the order is
 * stated. It was rewritten on the `material-economy` combine because four
 * branches in a row had authored a step as revision 7 and been renumbered, and
 * the rows had been edited into the prose below rather than into the table —
 * leaving a table that named 7 twice and never named 8, 9 or 10. Two of those
 * rows contradicted each other in the same comment. Keep the rows in the table.
 *
 * Revision 5 is the first step that does not only append. It splits the one
 * `materials` scalar into three kinds and takes the old field out of the
 * `universe` layout, because leaving it would leave a stock nothing spends
 * beside three stocks everything does. See {@link splitMaterialsByKind} for the
 * split rule and for why a section rewrite is safe here.
 *
 * Revision 7 is the first step that adds *fields* rather than a section, and
 * that is why it needs a different kind of marker — see
 * {@link worldSchemaVersionOf}. It is also why revisions 5 and 7 both freeze
 * their field lists as literals rather than reading {@link MATERIAL_STOCK}: a
 * step that derives its output shape from the live spec stops describing the
 * revision it is keyed on the moment the spec moves, and a revision-4 save would
 * then arrive at 5 already looking like a 7.
 *
 * Revision 9 appends `mid-raid-change`. It was written against revision 4 on
 * `w37/raid-playable` and renumbered twice — `material-stock` and `grant-budget`
 * had taken 5 and 6 in the meantime, `material-economy` held 7 and `bar-phase`
 * took 8 — and a revision number is what a migration step is keyed on, so
 * keeping the branch's 5 would have silently applied a raid repair to a save
 * that only needed the materials split.
 *
 * Revision 10 is W24's, renumbered three times: to 6 on its own branch, to 7 on
 * its own merge, and to 10 here, because 7 belongs to `material-economy` and 8
 * and 9 were taken by `bar-phase` and `mid-raid-change` while this branch was
 * out. Nothing else about it changed: it still appends two empty sections and
 * reads an absent row the way every append step here does.
 *
 * Revision 4 adds four components in one step, where the two before it added
 * one each. That is not a loosening of the rule — it is what the rule is for.
 * The four arrive together because they are one capability's world state and no
 * build has ever carried a proper subset of them, so there is no snapshot in
 * existence that a finer-grained walk could describe. Splitting them into four
 * revisions would invent three intermediate versions nothing ever wrote, and
 * three migration steps that could only ever be exercised by a test.
 *
 * Revision 10 adds two for the same reason: a university's site is meaningless
 * without a holding to stand in, and no build has ever shipped one without the
 * other.
 *
 * **Revision 12 is a reserved hole, and revision 13 spans it.** `w/exp-grades`
 * took 12 with a `material-grade` component off this same base; both branches
 * checked every ref in the repository and both found 12 free, six hours apart.
 * `docs/design/sim-rigor-2026-08-15.md` §4.4 settles it by **arrival**, and this
 * one arrived second, so `standing-working` is 13. It is the fifth step in this
 * walk to be renumbered and the reason is the one CLAUDE.md gives: *a migration's
 * number is its position in a walk, not a name.*
 *
 * The hole cannot simply be left open. `migrateWorldEnvelope` walks by `from`,
 * so a `{ from: 12 }` step with nothing beneath it throws for **every save on
 * disk** — the failure `w/exp-grades` hit from the other side. So
 * {@link addStandingWorking} is authored `{ from: 11, to: 13 }`, exactly the
 * bridge `addBarPhase` carried as `{ from: 6, to: 8 }` while `material-economy`
 * was unmerged. **On the merge with `material-grade` it becomes
 * `{ from: 12, to: 13 }`** and that branch's `{ from: 11, to: 12 }` step takes
 * its place beneath — the same reconciliation, in the same four steps, that
 * §4.4 spells out.
 *
 * Revision 13 appends `standing-working`, and it is the first step whose
 * *absent* section had to be argued about rather than assumed. Every step
 * above appends a component whose missing row means a benign zero — no goal
 * adopted, no project in flight, generation zero and sound. A missing
 * `standing-working` row could be read two ways, and one of them is a
 * catastrophe: *never lit* (nothing reverts) or *expired* (every working in
 * the universe lapses on the first tick of a restored save). It means the
 * first. `components.ts` states the rule at the component and
 * `standing-working-migrates-empty.test.ts` pins it from the other end, by
 * migrating a revision-11 save and asserting the tick reports **zero** lapses
 * rather than by asserting the section is empty — an empty section that some
 * later reader treated as a shortage would satisfy the second test and fail
 * the first.
 *
 * **Append; never renumber.** A revision number is what a migration step is
 * keyed on, so reusing one silently applies the wrong repair to a save.
 */
export const WORLD_SCHEMA_VERSION = 13;

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
  // **Revision 13's marker is `standing-working`, and it leads the chain** —
  // `docs/design/sim-rigor-2026-08-15.md` §4.4 step 3, newest marker first. A
  // revision-13 envelope also carries `knowledge-fidelity` and every marker
  // below, so asking about any of them first would walk every current save
  // through migrations it has already had.
  //
  // **`material-grade`'s arm is directly below, and that placement is the whole
  // of what this merge had to get right.** That marker is a component like this
  // one, not a field like revision 7's, so the two are ordered by revision
  // alone: `material-grade` is checked **after** this line and **before**
  // `knowledge-fidelity`'s. Getting that order wrong throws nothing — a
  // revision-13 envelope carries both components, so testing 12 first would
  // read every current save as a 12 and walk it through a migration it has
  // already had, silently.
  if (carried.has(STANDING_WORKING.name)) return 13;
  // **Revision 12's marker is `material-grade`.** It led the chain until
  // revision 13 arrived one merge later, and it now sits directly beneath
  // `standing-working`'s arm and above `knowledge-fidelity`'s — §4.4 step 3,
  // newest marker first. A revision-12 envelope also carries
  // `knowledge-fidelity` and every marker below it, so asking about any of them
  // first would walk every current save through migrations it has already had.
  //
  // **A collision was open when this was authored. It is now closed, and the
  // account is kept because the closing is the interesting part.** `w/exp-duration` took revision 12 for `standing-working`
  // off the same base commit (`4621db1a`, which declares 11), at the same time.
  // Both branches are correct against their base and **neither could take 13
  // instead**: `migrateWorldEnvelope` walks by `from`, so a step `{ from: 12 }`
  // with no `{ from: 11 }` beneath it throws *"No world-schema migration is
  // registered from revision 11"* for every save on disk. Authoring around a
  // collision would have produced a hole in the walk to avoid a merge conflict
  // the project already has a written procedure for.
  //
  // §4.4's four steps were done on `integration/all-branches`, 2026-08-17, in
  // the commit that merged `w/exp-duration`. They are not optional — getting (2)
  // or (3) wrong does not throw, it migrates an older save through the wrong
  // steps and lands it holding the wrong sections:
  //
  //   1. `WORLD_SCHEMA_VERSION = 13`. Done.
  //   2. `addStandingWorking` became `{ from: 12, to: 13 }`, narrowed from the
  //      `{ from: 11, to: 13 }` bridge it carried while 12 was a hole. Done, in
  //      the same commit that added `addMaterialGrade` beneath it.
  //   3. `standing-working`'s marker check moved to the **front** of this
  //      chain, ahead of this line. Done.
  //   4. `standing-working` is **last** in `WORLD_COMPONENTS`, this component
  //      second-last. Done.
  //
  // This is the fifth such renumber in this file — `bar-phase` three times, the
  // siting pair three times, `knowledge-fidelity` once — and CLAUDE.md's rule
  // is the whole reason it is cheap: a migration's number is its position in a
  // walk, not a name.
  if (carried.has(MATERIAL_GRADE.name)) return 12;
  // Revision 11's marker is `knowledge-fidelity`, and it led the chain until
  // revision 12 arrived —
  // §4.4 step 3, newest marker first. A revision-11 envelope also carries
  // `grant-budget` and the widened `material-stock`, so asking about either
  // first would walk every current save through migrations it has already had.
  // Authored as 7 — the fourth branch in this group to find that number taken.
  if (carried.has(KNOWLEDGE_FIDELITY.name)) return 11;
  // Revision 10's marker is `territory-holding`, and it leads the rest because
  // newest marker wins. It is the first of its own pair in `WORLD_COMPONENTS`,
  // so an envelope that somehow carried only `university-site` reads as the
  // older revision and is completed rather than left short.
  if (carried.has(TERRITORY_HOLDING.name)) return 10;
  // Revision 9's marker is `mid-raid-change`. Authored as revision 7; 7 belongs
  // to `w247/material-economy-build` and 8 was taken by `bar-phase` one merge
  // earlier, so this is the third renumber in arrival order.
  if (carried.has(MID_RAID_CHANGE.name)) return 9;
  // Revision 8's marker is `bar-phase`.
  if (carried.has(BAR_PHASE.name)) return 8;
  // **Revision 7's marker is a field, not a section**, and it is the only one
  // that is. `material-economy` widened `material-stock` from three kinds to
  // seven; an appended section is detectable by name and an appended field is
  // not, so the test is "does the stock section carry a `labor` column".
  //
  // It sits *below* the four component tests above and *above* revision 6's,
  // and both halves of that placement are load-bearing. Below, because every
  // revision-8-and-later envelope carries the widened stock too and would
  // otherwise read as 7 and be walked forward from the wrong place. Above,
  // because a revision-7 envelope carries `grant-budget` as well, and the newest
  // marker has to win or every save written since the widening would be walked
  // through a migration it has already had.
  //
  // This arm is what `addBarPhase`'s note called for: it existed as a reserved
  // hole on the combined base, with no `from: 7` or `to: 7` anywhere, and the
  // combine that brought `material-economy` in filled it and removed the 6 → 8
  // bridge in the same change.
  const stock = envelope.components.find((component) => component.name === MATERIAL_STOCK.name);
  if (stock?.fields.some((field) => field.name === REVISION_SEVEN_KINDS[3]) === true) return 7;
  // Revision 6's marker is `grant-budget`, checked after 7's because a
  // revision-7 envelope also carries it — newest marker wins, or every save
  // written since the budget landed would be walked through a
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
  // Authored as `{ from: 6, to: 7 }`. Renumbered on the `integration/group-e`
  // merge: 7 went to `w247/material-economy-build` (a **field** marker
  // on `material-stock`, not a component — see {@link widenMaterialStock}), and 8 was
  // taken by `bar-phase` one merge before this one. Arrival order, which is what
  // §4.4 says settles a revision number.
  from: 8,
  to: 9,
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
 * The three kinds `material-stock` was born with, frozen at revision 5.
 *
 * **A migration step must not read the live component spec for its output
 * shape.** `splitMaterialsByKind` did, via `Object.keys(MATERIAL_STOCK.fields)`,
 * and it was correct for exactly as long as the spec had three fields. The
 * moment `material-economy` widened it to seven, that step would have emitted a
 * seven-column section from a revision-4 save — which {@link worldSchemaVersionOf}
 * reads as **revision 7**, so {@link migrateWorldEnvelope}'s loop would exit at
 * once and `grant-budget` would never be appended. A save silently missing a
 * component, out of a migration that throws nothing.
 *
 * So each step names the shape it produces, and the shapes are frozen. Revision
 * 8 will need its own list rather than inheriting this hazard.
 */
const REVISION_FIVE_KINDS = ['food', 'stone', 'vellum'] as const;

/**
 * The seven kinds as of revision 7, frozen for the reason above.
 *
 * Order matters and is `MATERIAL_STOCK`'s declaration order: section field order
 * in an envelope is what a restored row is read against, so a step that emitted
 * these in a different sequence would line every migrated save's stocks up
 * against the wrong columns.
 */
const REVISION_SEVEN_KINDS = [
  'food',
  'stone',
  'vellum',
  'labor',
  'essence',
  'insight',
  'passage',
] as const;

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
    // The three kinds revision 5 invented, frozen — **not**
    // `Object.keys(MATERIAL_STOCK.fields)`, which this used to read. See
    // {@link REVISION_FIVE_KINDS}.
    const stockFields = REVISION_FIVE_KINDS.map((name) => ({ name, kind: 'i32' as const }));

    if (universe === undefined) {
      // No universe section at all. Nothing to split and nothing to rewrite;
      // the appended section is empty, as it is for every save that predates a
      // component it never wrote a row for.
      return {
        ...envelope,
        components: [
          ...envelope.components,
          { name: MATERIAL_STOCK.name, fields: stockFields, slots: new Uint32Array(0), values: new Uint32Array(0) },
        ],
      };
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

/**
 * Revision 6 → 7: append the four new material kinds to `material-stock`, at
 * zero.
 *
 * ## An absent kind reads zero, and zero is not a shortage
 *
 * This is the whole repair, and the argument for it is the one
 * {@link addGrantBudget} makes and not the one {@link splitMaterialsByKind}
 * makes. The split *rewrote*, and was right to: a save that recorded a materials
 * total had recorded something, and dividing it was an honest reading of a
 * number that existed. A save written before `labor`, `essence`, `insight` and
 * `passage` existed recorded **nothing at all** about them — no form yielded
 * them, no sink spent them, and no tick of that run could have accumulated one.
 * Zero is not a guess here; it is the only value the save supports.
 *
 * What must not happen is the reading that zero is a *shortage*. Nothing in this
 * step may make a restored universe behave as though it had run out of
 * something: the sinks arrive with the faucets, in the same change, so a save
 * carrying four zeroes plays exactly as it did when it was written. The
 * end-to-end test asserts that as a snapshot hash rather than as a promise.
 *
 * ## A column append, not a section append
 *
 * Every step before this one adds a section, and `worldSchemaVersionOf` finds a
 * revision by asking which sections exist. A field is invisible to that test —
 * the note in `components.ts` says so — so revision 7's marker is the `labor`
 * *column*, and it is checked before revision 6's section marker so the newest
 * marker wins.
 *
 * The append reads the incoming column positions **by name** rather than
 * assuming an order, exactly as the column *drop* in `splitMaterialsByKind`
 * does. A save written by a build that ordered `food`, `stone` and `vellum`
 * differently still migrates correctly, and the output is always
 * {@link REVISION_SEVEN_KINDS}' order because that is what the current layout
 * reads against.
 */
export const widenMaterialStock: WorldSchemaMigration = {
  from: 6,
  to: 7,
  migrate(envelope) {
    const stock = envelope.components.find((component) => component.name === MATERIAL_STOCK.name);
    const fields = REVISION_SEVEN_KINDS.map((name) => ({ name, kind: 'i32' as const }));

    if (stock === undefined) {
      // No stock section at all — a revision-6 save cannot be in this state,
      // since revision 5 appends the section unconditionally. Handled anyway,
      // and handled as an empty section rather than as a throw, because the
      // alternative is a migration that refuses a save over a component it is
      // about to create.
      return {
        ...envelope,
        components: [
          ...envelope.components,
          { name: MATERIAL_STOCK.name, fields, slots: new Uint32Array(0), values: new Uint32Array(0) },
        ],
      };
    }

    const oldWidth = stock.fields.length;
    const rows = stock.slots.length;
    const source = REVISION_SEVEN_KINDS.map((name) =>
      stock.fields.findIndex((field) => field.name === name),
    );
    const values = new Uint32Array(rows * fields.length);
    for (let row = 0; row < rows; row += 1) {
      for (let index = 0; index < fields.length; index += 1) {
        const column = source[index] as number;
        // A kind the save never had reads zero — the `Uint32Array` is already
        // zeroed, so the absent case is expressed by writing nothing rather than
        // by writing a value that would have to be chosen.
        if (column < 0) continue;
        values[row * fields.length + index] = stock.values[row * oldWidth + column] as number;
      }
    }

    const widened: SnapshotComponent = { name: stock.name, fields, slots: stock.slots, values };
    return {
      ...envelope,
      components: envelope.components.map((component) =>
        component.name === MATERIAL_STOCK.name ? widened : component,
      ),
    };
  },
};

/**
 * Revision 7 → 8: append an empty `bar-phase` section.
 *
 * `sound-design.md` §5.2's eight-bar unease needs one integer per universe, and
 * §1.1's note on `god-state` says plainly which shape to give it: an added
 * component is an appended empty section, an added *field* reshapes a section
 * and rewrites every older save column by column.
 *
 * Empty, for the reason the four steps before it were. No row means the universe
 * has never changed its own law, which is true of every save written before the
 * rule existed — and a synthesised row would hand a restored universe a decaying
 * unease over an act nobody ever committed, which is the cost surcharge
 * equivalent of inventing a `favorWasted` nobody wasted.
 *
 * ## This step used to span two revisions, and no longer does
 *
 * W21 authored it as `{ from: 4, to: 5 }` against a `main` at revision 4. By the
 * time it merged, `main` was at 6 and **revision 7 was already spoken for** by
 * `w247/material-economy-build`, which widens `material-stock` from three kinds
 * to seven and marks the revision with a **field** rather than a component. That
 * branch was not in the tree, and the hole could not be filled with a
 * placeholder — {@link migrateWorldEnvelope} refuses a step whose result does
 * not read as a higher revision than its input, and no marker for 7 existed to
 * leave behind, so a no-op 6 → 7 step would have thrown rather than passed
 * through. So the step bridged **6 → 8**, which reserved 7 and still left a
 * revision-6 save migratable.
 *
 * `material-economy` is now in the tree. {@link widenMaterialStock} is the
 * `{ from: 6, to: 7 }` step the note called for, this step's `from` is **7**,
 * and the bridge is gone: the walk from a revision-6 save is 6 → 7 → 8, and the
 * widening runs on it exactly once. The caveat that went with the bridge — that
 * no snapshot serialized from the bridging build may be persisted across the
 * combine — is spent, because there is no longer a build that writes an 8
 * without a 7 underneath it. Nothing in this repository ever wrote one.
 */
export const addBarPhase: WorldSchemaMigration = {
  from: 7,
  to: 8,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(BAR_PHASE)],
    };
  },
};

/**
 * Revision 9 → 10: append empty `territory-holding` and `university-site`
 * sections.
 *
 * An append, and empty is the whole repair. A save written before a universe
 * held ground has no holdings to recover, and the world step materializes the
 * content endowment into an empty section on its first tick — `god-state`'s
 * lazy-creation rule, for the same reason. A university with no site row is
 * unsited, which is representable and is what every save before W24 describes.
 *
 * Renumbered 4 → 5, then 6 → 7, then 9 → 10; see the table above and the note at
 * the step itself.
 */
export const addTerritorySiting: WorldSchemaMigration = {
  // Authored as `{ from: 5, to: 6 }`, renumbered to `{ from: 6, to: 7 }` on W24's
  // own merge, and renumbered again here to `{ from: 9, to: 10 }`: 7 went to
  // `w247/material-economy-build`, and `bar-phase` and `mid-raid-change`
  // took 8 and 9 while this branch was out. Third assignment for one step, and
  // the reason §4.4 says a revision number is settled by arrival rather than by
  // authoring.
  from: 9,
  to: 10,
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
 * Revision 10 → 11: append an empty `knowledge-fidelity` section.
 *
 * Empty, and for the strongest version of the argument the steps above make:
 * every reader of this component treats an **absent row as generation zero and
 * sound**, which is exactly what a save written before scribing fidelity existed
 * recorded. A revision-6 save restored into this build therefore holds a library
 * of books that are all fresh from a living holder and none of them corrupted —
 * the only reading of the old state that is not an invention.
 *
 * The alternative would be to synthesise a generation for every written
 * instance from its `acquiredTick`, and there is no honest rule for it: the old
 * state does not record what a book was copied from, so any number chosen would
 * be a fidelity loss the save never suffered, applied retroactively to a library
 * the player already has.
 */
/**
 * Revision 11 → 12: append an empty `material-grade` section.
 *
 * **Zero rows, not zeroed rows**, and the distinction is the whole migration.
 * A universe that has never refined anything holds no refined material, and
 * that is expressed by the section being empty — not by a row of zeroes, which
 * would be a claim that somebody looked and found nothing. Downstream, an
 * absent row reads as **grade zero and never as a shortage**, so a pre-grades
 * save keeps exactly the economy it was written against: nothing gates on a
 * grade it has, and the raw stock in `material-stock` is untouched and
 * unmoved.
 *
 * Synthesising rows would be the wrong repair for the reason `goal-commitment`
 * gives next door — it invents a history nobody played — and here it would be
 * worse than inert. `cig-the-standing-furnace`'s yield is gated on holding ore;
 * a synthesised nonzero row would hand every restored universe a foundry it
 * never built the industry for, and a synthesised *zero* row is only a louder
 * way of writing the empty section.
 */
export const addMaterialGrade: WorldSchemaMigration = {
  from: 11,
  to: 12,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(MATERIAL_GRADE)],
    };
  },
};

export const addKnowledgeFidelity: WorldSchemaMigration = {
  // Authored as `{ from: 6, to: 7 }`. Renumbered to `{ from: 10, to: 11 }` on
  // the `integration/group-e` merge — the fourth and last renumber in this
  // group. 7 went to `material-economy`; 8, 9 and 10 went to
  // `bar-phase`, `mid-raid-change` and `university-siting` ahead of it.
  from: 10,
  to: 11,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(KNOWLEDGE_FIDELITY)],
    };
  },
};

/**
 * Revision 11 → 12: append an empty `standing-working` section.
 *
 * Empty, and this is the one append in the walk where empty is a *decision*
 * rather than the obvious repair.
 *
 * A save written before this component was written by a build in which a node's
 * effects applied for as long as anybody knew the node. Every one of those
 * standing effects is, under this build, an unlit working. There are exactly
 * three things this step could do about that and only one of them is honest:
 *
 * - **Synthesise a live row per contributing instance**, so nothing changes on
 *   the load. That invents a `litTick` nobody ever cast on and a renewal history
 *   nobody ever paid for, and it is the repair `addTerritorySiting` refuses for
 *   the same reason. It would also make the load itself the last free month in
 *   the universe's history.
 * - **Synthesise a row per instance at `expiresTick: 0`**, which reads as
 *   *expired* and fires the whole universe's lapse on the first tick of a
 *   restored save. That is the failure this component's own note is about: it
 *   throws nothing, it looks exactly like the rule functioning, and the player
 *   watches every wall fall down at once.
 * - **Append nothing**, which says *no working has ever been established in this
 *   universe* — which is true, because none ever was. Nothing reverts, nothing
 *   is reported as lapsed, and a mage who wants the effect back spends the month
 *   the design says it costs.
 *
 * The third. The consequence is real and is not hidden: a duration-bearing
 * effect that a revision-11 save was getting for free stops arriving until
 * somebody lights it. That is the change, applied to old saves and new ones
 * alike, rather than a grandfather clause that would make one save's physics
 * differ from another's.
 */
export const addStandingWorking: WorldSchemaMigration = {
  // **A step again, and no longer a bridge.** Authored `{ from: 11, to: 12 }`
  // on `w/exp-duration`, then widened there to `{ from: 11, to: 13 }` because
  // revision 12 belonged to `material-grade` on `w/exp-grades` and that branch
  // was not in that tree: with no `{ from: 11, to: 12 }` beneath it, a
  // `{ from: 12, to: 13 }` could not be reached and the walk threw for every
  // save on disk. The precedent was `addBarPhase`, which carried
  // `{ from: 6, to: 8 }` for exactly as long as `material-economy` was unmerged.
  //
  // `integration/all-branches`, 2026-08-17: `material-grade` merged one commit
  // earlier, {@link addMaterialGrade} supplies the `{ from: 11, to: 12 }` this
  // now stands on, and the bridge is **narrowed in the same commit** — leaving
  // it at `{ from: 11, to: 13 }` would have skipped `material-grade`'s step on
  // every revision-11 save, silently and without an error. The walk is dense
  // 1 → 13 and no step in it spans more than one revision.
  from: 12,
  to: 13,
  migrate(envelope) {
    return {
      ...envelope,
      components: [...envelope.components, emptySection(STANDING_WORKING)],
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
  widenMaterialStock,
  addBarPhase,
  addMidRaidChange,
  addTerritorySiting,
  addKnowledgeFidelity,
  addMaterialGrade,
  addStandingWorking,
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
