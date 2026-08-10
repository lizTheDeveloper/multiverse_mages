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
 * One step forward: a pure function from a snapshot at version `N` to the same
 * snapshot at version `N + 1`.
 *
 * **Pure, and one version at a time.** Both halves are requirements from
 * `world-persistence`, and both exist for the same reason: a migration is code
 * that will be run years after it was written, against saves nobody still has
 * an example of. A pure function of an envelope can be unit-tested on a
 * hand-built envelope forever; one that reached for a file, a clock, or the
 * current content registry could only be tested against whatever the world
 * looked like the day it was written. And a chain of single-version steps means
 * a save from four versions ago exercises exactly the same four functions a
 * save from three versions ago exercises three of — rather than a combinatorial
 * set of "from 3 to 7" shortcuts, each of which is a separate thing to get
 * wrong and separately untested.
 *
 * A migration must return a *new* envelope rather than mutate its argument. The
 * registry checks the version it produced, not that it left the input alone, so
 * this is a convention rather than an enforcement — but every migration in the
 * repository is written as a spread, and a reviewer should insist on it.
 */
export type Migration = (envelope: SnapshotEnvelope) => SnapshotEnvelope;

/**
 * The registered path from old snapshots to the current one.
 *
 * Keyed by the version a migration reads, not the one it writes. That is the
 * key a loader actually has: it holds a snapshot at version `N` and needs to
 * ask "what turns an `N` into an `N + 1`?" — and it is what lets a missing step
 * be named precisely ("nothing is registered from 2 to 3") rather than reported
 * as a general failure to find a path.
 */
export class MigrationRegistry {
  readonly #migrations = new Map<number, Migration>();

  /**
   * Registers the step that reads version `fromVersion` and writes
   * `fromVersion + 1`.
   *
   * A second registration for the same version is refused rather than allowed
   * to win. Two migrations out of one version is not a configuration, it is a
   * merge that went wrong, and the version it silently picked would decide what
   * every old save turns into.
   */
  register(fromVersion: number, migration: Migration): void {
    if (!Number.isInteger(fromVersion) || fromVersion < 0) {
      throw new RangeError(
        `A migration's source version must be a non-negative integer, received ${String(fromVersion)}.`,
      );
    }
    if (this.#migrations.has(fromVersion)) {
      throw new Error(
        `A migration from snapshot version ${fromVersion} is already registered. Each version has ` +
          'exactly one successor.',
      );
    }
    this.#migrations.set(fromVersion, migration);
  }

  /** Whether a step out of `fromVersion` is registered. */
  has(fromVersion: number): boolean {
    return this.#migrations.has(fromVersion);
  }

  /** Registered source versions, ascending. */
  get versions(): readonly number[] {
    return [...this.#migrations.keys()].sort((a, b) => a - b);
  }

  /**
   * Brings a snapshot forward to `targetVersion`, one registered step at a time.
   *
   * Ascending order is not an implementation detail to be optimised away: each
   * migration is written knowing exactly what the envelope looked like the
   * version before, and applying them in any other order — or skipping one —
   * hands a migration an input it was never written against.
   *
   * Three refusals, each naming what it refused:
   *
   * - **Already newer than the target.** Migrations only run forward; a
   *   downgrade would have to invent the data the newer version added.
   * - **No step registered.** The missing link is named, because "migration
   *   failed" on a player's save file is not something anyone can act on.
   * - **A step that did not advance the version.** Caught rather than looped
   *   on: a migration returning its input unchanged would otherwise spin
   *   forever, which reads as a hang rather than as the bug it is.
   */
  migrate(envelope: SnapshotEnvelope, targetVersion: number): SnapshotEnvelope {
    if (!Number.isInteger(targetVersion) || targetVersion < 0) {
      throw new RangeError(
        `A migration target version must be a non-negative integer, received ${String(targetVersion)}.`,
      );
    }

    if (envelope.version > targetVersion) {
      throw new Error(
        `Snapshot is at schema version ${envelope.version}, which is newer than the target version ` +
          `${targetVersion}. Migrations only run forward.`,
      );
    }

    let current = envelope;
    while (current.version < targetVersion) {
      const from = current.version;
      const migration = this.#migrations.get(from);
      if (migration === undefined) {
        throw new Error(
          `No migration is registered from snapshot version ${from} to ${from + 1}, so a snapshot at ` +
            `version ${envelope.version} cannot be brought forward to version ${targetVersion}.`,
        );
      }

      const next = migration(current);
      if (next.version <= from) {
        throw new Error(
          `The migration from snapshot version ${from} returned a snapshot at version ` +
            `${next.version}, which does not move forward.`,
        );
      }
      if (next.version > targetVersion) {
        throw new Error(
          `The migration from snapshot version ${from} returned a snapshot at version ` +
            `${next.version}, past the target version ${targetVersion}.`,
        );
      }
      current = next;
    }

    return current;
  }
}
