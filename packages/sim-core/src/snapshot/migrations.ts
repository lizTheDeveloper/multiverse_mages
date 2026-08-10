/*
 * Multiverse Mages — forward migration of older snapshots.
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

import type { SnapshotEnvelope } from './snapshot.js';

/**
 * ## Why migrations operate on envelopes, never on states
 *
 * A migration exists precisely for the snapshots a build can no longer make
 * sense of. If it took a `SimState`, it could not run at all in the case it was
 * written for: constructing a state requires a `WorldSchema`, the schema is
 * validated against the snapshot, and a snapshot old enough to need migrating
 * is exactly one that fails that validation. The chicken would eat the egg.
 *
 * So the unit of migration is the `SnapshotEnvelope` — decoded structure, no
 * schema attached, no invariants beyond its own internal shape. `decodeSnapshot`
 * deliberately accepts *any* version for the same reason: an old snapshot has to
 * become data before anyone can reason about it.
 *
 * ## Why they are pure functions
 *
 * `world-persistence` requires migrations to be pure and individually testable,
 * and both properties come from the same restriction: a migration is
 * `(envelope) => envelope` with nothing else in scope. That makes a migration
 * testable by constructing an envelope and calling it — no state, no schema, no
 * fixture file — which matters because a migration is code that runs once per
 * player per upgrade and then, if it was wrong, has already destroyed the save.
 * It is the least testable code in a codebase by nature, so the type signature
 * is what makes it testable by force.
 *
 * A migration returns a *new* envelope rather than mutating: the caller may
 * still hold the original (a failed chain is worth reporting against the input
 * it started from), and a chain that mutated in place could not be retried.
 *
 * ## Why the returned envelope declares its own version
 *
 * The registry keys a step by the version it migrates *from*, but does not
 * decide what it produces — the migration sets `version` on its result. That
 * lets one step cross several versions at once, which is what happens when
 * three format bumps land in a release nobody shipped: one migration handles
 * 4 -> 7 and the intermediate steps never need to exist. The loop below reads
 * the result's version to decide where it now is, so the registry never has to
 * be told.
 */

/** One step: an older envelope in, a newer envelope out. Pure. */
export type Migration = (envelope: SnapshotEnvelope) => SnapshotEnvelope;

/**
 * The set of migration steps a build knows, and the walk that applies them.
 *
 * Deliberately not a module-level singleton. A registry is passed in to
 * `deserializeState`, so a test can register a throwaway step without
 * contaminating any other test, and a tool that has to load a save at an
 * intermediate version can build its own.
 */
export class MigrationRegistry {
  /** Keyed by the version each step migrates *from*. */
  readonly #steps = new Map<number, Migration>();

  /**
   * Registers the step that carries `fromVersion` forward.
   *
   * Rejects a duplicate rather than overwriting. Two migrations claiming the
   * same starting version means one of them is dead code, and which one runs
   * would depend on module evaluation order — an unreproducible answer to a
   * question about save compatibility.
   */
  register(fromVersion: number, migration: Migration): void {
    if (!Number.isInteger(fromVersion) || fromVersion < 0) {
      throw new RangeError(
        `A migration's source version must be a non-negative integer, received ${String(fromVersion)}.`,
      );
    }
    if (this.#steps.has(fromVersion)) {
      throw new Error(
        `A migration from snapshot version ${fromVersion} is already registered. Two steps from ` +
          'the same version would make save compatibility depend on module evaluation order.',
      );
    }
    this.#steps.set(fromVersion, migration);
  }

  /** Whether a step starting at this version is registered. */
  has(fromVersion: number): boolean {
    return this.#steps.has(fromVersion);
  }

  /**
   * Walks an envelope forward to `targetVersion`, in ascending version order.
   *
   * Forward only. A snapshot newer than the target is refused rather than
   * downgraded: this build does not know what a future version moved, so
   * "reading it anyway" means reading some values as other values, and a save
   * that loads with the wrong numbers is worse than one that refuses to load
   * because the player keeps playing it.
   *
   * An envelope already at the target is returned as-is — the same object, not
   * a copy, because there is nothing to change and a copy would only invite a
   * caller to believe the two could differ.
   */
  migrate(envelope: SnapshotEnvelope, targetVersion: number): SnapshotEnvelope {
    if (!Number.isInteger(targetVersion) || targetVersion < 0) {
      throw new RangeError(
        `A migration target version must be a non-negative integer, received ${String(targetVersion)}.`,
      );
    }
    if (envelope.version > targetVersion) {
      throw new Error(
        `Snapshot is at format version ${envelope.version}, which is newer than the requested ` +
          `target version ${targetVersion}. Migrations only run forward.`,
      );
    }

    let current = envelope;
    while (current.version < targetVersion) {
      const from = current.version;
      const step = this.#steps.get(from);
      if (step === undefined) {
        throw new Error(
          `No migration registered from snapshot version ${from} to ${from + 1}, so version ` +
            `${targetVersion} cannot be reached from ${envelope.version}.`,
        );
      }

      const next = step(current);
      // A step that did not advance would loop forever, and one that overshot
      // would leave the envelope at a version this build never validated. Both
      // are bugs in the step, and both are cheap to catch here and expensive to
      // diagnose from a hung or wrong load.
      if (next.version <= from) {
        throw new Error(
          `The migration from snapshot version ${from} returned version ${next.version}, which ` +
            'does not advance. A migration must declare a higher version on its result.',
        );
      }
      if (next.version > targetVersion) {
        throw new Error(
          `The migration from snapshot version ${from} produced version ${next.version}, ` +
            `overshooting the target version ${targetVersion}.`,
        );
      }
      current = next;
    }

    return current;
  }
}
