/*
 * Multiverse Mages — the fixture-immutability guarantee, exercised while a
 * fixture is actually failing.
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
 * Covers `deterministic-replay` → "Tests never rewrite fixtures":
 *
 * > **WHEN** the golden suite runs against a temporary fixtures directory in
 * > which one fixture's expected hash has been altered
 * > **THEN** every file in that directory is byte-identical afterward, and the
 * > run reports failure
 *
 * The guarantee is about what happens to the files **while a fixture is
 * failing**, because that is the only run on which a regenerate-on-failure
 * repair would fire. `golden.test.ts` can only ever check it on a green run, in
 * a repository where nothing is failing — which is to say, on the path the
 * guarantee is not about. A temporary directory with one hash deliberately
 * broken makes the real path reachable on every CI run.
 *
 * The committed fixtures are copied, never touched. This file asserts that too.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderFixture } from './fixture-format.js';
import {
  DEFAULT_FIXTURES_DIR,
  copyFixturesInto,
  fixtureFiles,
  readFixture,
  snapshotDirectoryBytes,
  verifyFixture,
} from './harness.js';

/** The fixture whose expected hash is broken. Any one would do. */
const BROKEN = 'world-time-only.json';

/** Flips one hex digit: still a legal 16-character hash, no longer the right one. */
function flipOneDigit(hash: string): string {
  const first = hash.slice(0, 1);
  return `${first === '0' ? '1' : '0'}${hash.slice(1)}`;
}

describe('a temporary fixtures directory with one expected hash altered', () => {
  let directory = '';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mm-golden-immutability-'));
    copyFixturesInto(directory);

    const fixture = readFixture(BROKEN, directory);
    // Rendered through the canonical writer so the file stays a *valid*
    // fixture. A file that failed to parse would exercise the parser's error
    // path, not the divergence path, and the guarantee under test is about what
    // happens when a run legitimately disagrees with a recording.
    writeFileSync(
      join(directory, BROKEN),
      renderFixture({ ...fixture, finalHash: flipOneDigit(fixture.finalHash) }),
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    directory = '';
  });

  it('reports failure, and names the fixture that failed', () => {
    let message = '';
    try {
      verifyFixture(BROKEN, { fixturesDir: directory });
      expect.unreachable('a fixture with an altered expected hash must not verify');
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain(BROKEN);
  });

  it('leaves every file in that directory byte-identical, altered one included', () => {
    const before = snapshotDirectoryBytes(directory);
    const files = [...before.keys()];
    expect(files).toContain(BROKEN);

    const failed: string[] = [];
    for (const file of files) {
      try {
        verifyFixture(file, { fixturesDir: directory });
      } catch {
        failed.push(file);
      }
    }

    // The run really did fail, and only where it was made to. If nothing failed
    // the byte comparison below would be checking the green path again, which
    // is the gap this file exists to close.
    expect(failed).toEqual([BROKEN]);

    expect(fixtureFiles(directory), 'the run added or removed a fixture file').toEqual(files);
    for (const [file, bytes] of before) {
      const after = readFileSync(join(directory, file));
      expect(after.equals(bytes), `${file} was rewritten by a failing run`).toBe(true);
    }

    // Specifically: the broken hash is *still broken*. A harness that repaired
    // on failure would have written the true hash back, every file would still
    // be "valid", and the determinism gate would have silently absorbed the very
    // regression it exists to catch.
    expect(readFixture(BROKEN, directory).finalHash).not.toBe(readFixture(BROKEN).finalHash);
  });

  it('never touches the committed fixtures while doing any of it', () => {
    const before = snapshotDirectoryBytes(DEFAULT_FIXTURES_DIR);

    for (const file of fixtureFiles(directory)) {
      try {
        verifyFixture(file, { fixturesDir: directory });
      } catch {
        // Whether it failed is the previous test's question.
      }
    }

    const after = snapshotDirectoryBytes(DEFAULT_FIXTURES_DIR);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [file, bytes] of before) {
      expect((after.get(file) as Buffer).equals(bytes), `${file} was modified`).toBe(true);
    }
  });
});
