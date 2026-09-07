/*
 * Multiverse Mages — universe persistence: the storage contract and a
 * file-system backend.
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
 * Universe persistence — task 7.1 of `pvp-server`.
 *
 * ## What is persisted, and what is not
 *
 * A stored universe is its **identity and accrued prestige**, not its full
 * simulation state. The simulation is deterministic, so the state is fully
 * determined by the scenario, the seed, and the action log — but replaying a
 * long history to restore a universe is a `universe-persistence` concern, and
 * that change is not this one.
 *
 * What this layer does for v1:
 *
 * 1. A universe that participates in a match gains prestige. That prestige
 *    must survive the process restarting, or it is decorative.
 * 2. A universe's `bubbleId` determines who it can challenge. Persistence
 *    makes that assignment durable — a respawned universe that lands in a
 *    different bubble (the anti-farming property `UniverseRef` documents)
 *    must stay there.
 * 3. The `lastSnapshotHash` is a consistency check: a universe that loads
 *    into a different state than it was saved from is a desync that happened
 *    across a restart rather than across a network, and the hash names it.
 *
 * ## Why JSON files
 *
 * One universe, one file, named by its id. No database, no third-party
 * dependency, and a stranger who reads the source can inspect the data
 * directory with `cat`. The AGPL compliance argument `index.ts` makes about
 * the transport applies here too: the persistence layer a source offer
 * includes should be one a stranger can operate.
 *
 * ## File naming
 *
 * Universe ids may contain characters that are hostile to file systems
 * (slashes, colons, NUL). The id is percent-encoded for the filename, and
 * the id itself travels inside the JSON so that no information is lost.
 * The encoding is deterministic and injective — two distinct ids always
 * produce two distinct filenames — so no collision is possible.
 *
 * ## Why not `createHash`
 *
 * `package-boundaries.test.ts` enforces that this package defines no digest
 * of its own. The wire carries `snapshotHash` from sim-core; the filename
 * is a storage concern and needs no cryptographic property, only injectivity
 * and filesystem safety.
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { UniverseRef } from './protocol.js';

// ---------------------------------------------------------------------------
// The stored record.
// ---------------------------------------------------------------------------

/**
 * What the storage layer writes for one universe.
 *
 * Every field is a fact about the universe or about the save, never about the
 * process that wrote it. A reader — this process after a restart, a stranger
 * inspecting the data directory, a migration tool — can interpret the file
 * without knowing who wrote it.
 */
export interface StoredUniverse {
  /** Stable across runs. The key. */
  readonly universeId: string;
  /** The group of multiverses this universe is in. */
  readonly bubbleId: string;
  /** §8a's carry-forward. The authoritative copy — not the advisory wire value. */
  readonly prestige: number;
  /** Which scenario this universe was playing. */
  readonly scenarioId: string;
  /**
   * `snapshotHash` at the moment of save.
   *
   * A consistency seal, not a restoration key. If the universe is rebuilt from
   * seed + actions and the resulting hash differs, the save is stale or the
   * content changed — either way, a mismatch that should be reported rather
   * than silently absorbed.
   */
  readonly lastSnapshotHash: string;
  /** ISO 8601 timestamp. When, not who. */
  readonly savedAt: string;
}

// ---------------------------------------------------------------------------
// The contract.
// ---------------------------------------------------------------------------

/**
 * The storage contract for universe persistence.
 *
 * Async throughout: even the in-memory implementation used in tests returns
 * promises, so a caller that works against the interface cannot accidentally
 * depend on synchronous resolution.
 */
export interface Storage {
  /** Writes or overwrites a universe record. */
  saveUniverse(universe: StoredUniverse): Promise<void>;
  /** Loads a universe by id, or `undefined` if it has never been saved. */
  loadUniverse(universeId: string): Promise<StoredUniverse | undefined>;
  /** Every stored universe. Order is not guaranteed. */
  listUniverses(): Promise<readonly StoredUniverse[]>;
  /** Deletes a universe. Returns `true` if it existed. */
  deleteUniverse(universeId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// File-system backend.
// ---------------------------------------------------------------------------

/**
 * Deterministic, injective, filesystem-safe filename from an arbitrary id.
 *
 * Alphanumerics, hyphens and underscores pass through; everything else is
 * percent-encoded byte by byte. The result is safe on every OS (no slashes,
 * no colons, no NUL, no reserved Windows names) and reversible, though nothing
 * needs to reverse it — the id lives inside the JSON.
 */
function fileNameFor(universeId: string): string {
  const encoded = Array.from(Buffer.from(universeId, 'utf-8'))
    .map((b) => {
      const ch = String.fromCharCode(b);
      if (/[a-zA-Z0-9_-]/.test(ch)) return ch;
      return '%' + b.toString(16).padStart(2, '0');
    })
    .join('');
  return encoded + '.json';
}

/**
 * Persists universes as one-JSON-file-per-universe in a directory.
 *
 * Writes are atomic: content goes to a temporary file first, then is renamed
 * into place, so a crash mid-write leaves either the old file or the new one,
 * never a truncated one. Reads tolerate a missing or unparseable file —
 * returning `undefined` rather than throwing — because the data directory is
 * user-visible and a hand-edit that breaks JSON should not crash the server.
 */
export class FsStorage implements Storage {
  private readonly dir: string;
  private ready: Promise<void> | undefined;

  constructor(dataDir: string) {
    this.dir = dataDir;
  }

  /** Creates the data directory if it does not exist. Idempotent. */
  private ensure(): Promise<void> {
    if (this.ready === undefined) {
      this.ready = mkdir(this.dir, { recursive: true }).then(() => {});
    }
    return this.ready;
  }

  async saveUniverse(universe: StoredUniverse): Promise<void> {
    await this.ensure();
    const target = join(this.dir, fileNameFor(universe.universeId));
    const tmp = target + '.tmp';
    // Two-space indent for human readability — the data directory is inspectable.
    await writeFile(tmp, JSON.stringify(universe, null, 2) + '\n', 'utf-8');
    await rename(tmp, target);
  }

  async loadUniverse(universeId: string): Promise<StoredUniverse | undefined> {
    await this.ensure();
    const path = join(this.dir, fileNameFor(universeId));
    try {
      const text = await readFile(path, 'utf-8');
      return JSON.parse(text) as StoredUniverse;
    } catch {
      return undefined;
    }
  }

  async listUniverses(): Promise<readonly StoredUniverse[]> {
    await this.ensure();
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: StoredUniverse[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const text = await readFile(join(this.dir, entry), 'utf-8');
        out.push(JSON.parse(text) as StoredUniverse);
      } catch {
        // Corrupted or non-universe file — skip it.
      }
    }
    return out;
  }

  async deleteUniverse(universeId: string): Promise<boolean> {
    await this.ensure();
    const path = join(this.dir, fileNameFor(universeId));
    try {
      await rm(path);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory backend (tests, and any process that does not need durability).
// ---------------------------------------------------------------------------

/**
 * A storage backend that lives in memory. Useful for tests that exercise the
 * host's persistence wiring without touching the file system.
 */
export class MemoryStorage implements Storage {
  private readonly store = new Map<string, StoredUniverse>();

  async saveUniverse(universe: StoredUniverse): Promise<void> {
    this.store.set(universe.universeId, universe);
  }

  async loadUniverse(universeId: string): Promise<StoredUniverse | undefined> {
    return this.store.get(universeId);
  }

  async listUniverses(): Promise<readonly StoredUniverse[]> {
    return [...this.store.values()];
  }

  async deleteUniverse(universeId: string): Promise<boolean> {
    return this.store.delete(universeId);
  }

  /** How many universes are stored. For assertions. */
  get size(): number {
    return this.store.size;
  }

  /** Clears all stored universes. For test isolation. */
  clear(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers for the host to build a StoredUniverse from what it knows.
// ---------------------------------------------------------------------------

/**
 * Builds a {@link StoredUniverse} from the pieces the host has at match end.
 *
 * The host knows the `UniverseRef`, the scenario id, and the snapshot hash
 * from the session. This helper assembles those into the record the storage
 * layer writes, timestamped with the current wall-clock time.
 */
export function buildStoredUniverse(
  ref: UniverseRef,
  scenarioId: string,
  snapshotHash: string,
): StoredUniverse {
  return {
    universeId: ref.universeId,
    bubbleId: ref.bubbleId,
    prestige: ref.prestige ?? 0,
    scenarioId,
    lastSnapshotHash: snapshotHash,
    savedAt: new Date().toISOString(),
  };
}
