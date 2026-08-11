/*
 * Multiverse Mages — the world-schema migration that carries a pre-0.4.0 save
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
 * revision-1 snapshot all the way into a live 0.4.0 world.
 *
 * The revision-1 envelope here is **derived from the current one** by dropping
 * the section this change added, rather than transcribed as a literal. A
 * transcribed one would be a copy of the schema that stops matching the moment
 * anything else moves, and would then be testing a save nobody ever wrote.
 */

import { describe, expect, it } from 'vitest';

import type { SnapshotEnvelope } from '@mm/sim-core';
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
  GOAL_COMMITMENT,
  MAGE,
  WORLD_SCHEMA_VERSION,
  addGoalCommitment,
  componentOf,
  defineWorldStateSchema,
  loadWorldSnapshot,
  migrateWorldEnvelope,
  readRecord,
  worldSchemaVersionOf,
} from '@mm/state';

import { populatedWorld } from './fixtures.js';

/** The same world, as a build that had never heard of goal commitments saw it. */
function revisionOneEnvelope(): SnapshotEnvelope {
  const { state } = populatedWorld();
  const envelope = stateToEnvelope(state);
  return {
    ...envelope,
    components: envelope.components.filter((component) => component.name !== GOAL_COMMITMENT.name),
  };
}

describe('the world-schema revision is read off the snapshot itself', () => {
  it('calls a snapshot without goal-commitment revision 1, and one with it revision 2', () => {
    expect(worldSchemaVersionOf(revisionOneEnvelope())).toBe(1);
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
    expect(WORLD_SCHEMA_VERSION).toBe(2);
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

  it('walks a revision-1 envelope to the current revision', () => {
    expect(worldSchemaVersionOf(migrateWorldEnvelope(revisionOneEnvelope()))).toBe(
      WORLD_SCHEMA_VERSION,
    );
  });

  it('returns an already-current envelope untouched, as the same object', () => {
    // The same object, not a copy: there is nothing to change, and handing back
    // a copy would invite a caller to believe the two could differ.
    const current = stateToEnvelope(populatedWorld().state);
    expect(migrateWorldEnvelope(current)).toBe(current);
  });
});

describe('a revision-1 save loads into a 0.4.0 world', () => {
  it('loads, and every mage in it reads as having never chosen a goal', () => {
    const bytes = encodeSnapshot(revisionOneEnvelope());
    const restored = loadWorldSnapshot(bytes, defineWorldStateSchema());

    // The repair is an empty section, not zeroed rows. A mage restored with a
    // synthesised commitment would carry an `adoptedTick` nobody adopted
    // anything on, and a full commitment period of hysteresis protecting a goal
    // she was never observed to hold.
    expect(componentOf(restored, GOAL_COMMITMENT).size).toBe(0);
  });

  it('re-serializes to exactly the bytes a fresh save with no commitments makes', () => {
    const { state, mage } = populatedWorld();
    componentOf(state, GOAL_COMMITMENT).remove(mage);

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
    // be asserting nothing about the migration at all.
    const bytes = encodeSnapshot(revisionOneEnvelope());
    expect(() => loadWorldSnapshot(bytes, defineWorldStateSchema())).not.toThrow();
    expect(() => envelopeToState(decodeSnapshot(bytes), defineWorldStateSchema())).toThrow(
      /goal-commitment/,
    );
  });
});
