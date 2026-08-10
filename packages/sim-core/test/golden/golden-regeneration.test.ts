/*
 * Multiverse Mages — what the regeneration command writes, and what it refuses
 * to write, measured in bytes against a temporary directory.
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
 * Covers `deterministic-replay` → "Explicit regeneration is reviewable":
 *
 * > **WHEN** the regeneration command runs against a fixture whose recorded
 * > scenario has changed
 * > **THEN** that fixture's bytes are rewritten and the command names it as
 * > updated
 * > **AND WHEN** no scenario has changed
 * > **THEN** no fixture file's bytes change and the command reports that
 * > nothing changed
 *
 * ## Why a subprocess, and why `--fixtures`
 *
 * The reviewability of a regenerated fixture rests on two facts about this
 * command that nothing was checking: it writes when — and only when — behaviour
 * changed, and it says which file it rewrote. Both are only observable on a run
 * that writes, so the command has to actually run. It is spawned as a real
 * process, against a **temporary directory**, so that the committed fixtures are
 * never a possible destination: the rule that tests never regenerate the
 * repository's fixtures is not weakened by testing the regenerator, it is the
 * reason the destination is a parameter at all.
 *
 * Assertions are on bytes and file timestamps first, printed text second. What
 * the command *says* is worth checking; what it *did* is what matters.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderFixture } from './fixture-format.js';
import { DEFAULT_FIXTURES_DIR, copyFixturesInto, readFixture } from './harness.js';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/regen-goldens.mjs', import.meta.url));

/** The fixture the "something changed" case damages. */
const CHANGED = 'entity-churn.json';

/** Spawning Node and stripping types on three scenarios is not instant. */
const SPAWN_BUDGET_MS = 60_000;

interface RegenRun {
  readonly status: number | null;
  readonly stdout: string;
}

/**
 * Runs the real command against `directory`.
 *
 * Only stdout is asserted on. Node prints an `ExperimentalWarning` for
 * `--experimental-strip-types` on stderr, so requiring stderr to be empty would
 * make this suite fail on a Node upgrade for a reason unrelated to fixtures.
 */
function regenerateInto(directory: string): RegenRun {
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', SCRIPT, '--fixtures', directory],
    { encoding: 'utf8' },
  );
  return { status: run.status, stdout: run.stdout ?? '' };
}

function bytesIn(directory: string, file: string): Buffer {
  return readFileSync(join(directory, file));
}

function mtimeOf(directory: string, file: string): number {
  return statSync(join(directory, file)).mtimeMs;
}

describe('the regeneration command', () => {
  let directory = '';
  let files: string[] = [];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mm-golden-regen-'));
    files = copyFixturesInto(directory);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    directory = '';
    files = [];
  });

  it('rewrites a fixture whose recorded content no longer matches its scenario, and names it', () => {
    // "The recorded scenario has changed" and "the recording no longer matches
    // the scenario" are the same condition seen from opposite ends, and only
    // one of them can be staged without editing `scenarios.ts` at runtime.
    // Damaging the recording is that one.
    const original = readFixture(CHANGED, directory);
    writeFileSync(
      join(directory, CHANGED),
      renderFixture({ ...original, rootSeed: original.rootSeed + 1 }),
      'utf8',
    );
    const damaged = bytesIn(directory, CHANGED);
    expect(damaged.equals(bytesIn(DEFAULT_FIXTURES_DIR, CHANGED))).toBe(false);

    const untouchedBefore = files
      .filter((file) => file !== CHANGED)
      .map((file) => ({ file, bytes: bytesIn(directory, file), mtime: mtimeOf(directory, file) }));

    const run = regenerateInto(directory);
    expect(run.status, run.stdout).toBe(0);

    // The bytes, first. Regeneration re-records the scenario, so the rewritten
    // file must come back to exactly the committed recording — which is also
    // the strongest available statement that the canonical rendering is stable
    // and a fixture diff is a behaviour diff rather than formatting noise.
    expect(bytesIn(directory, CHANGED).equals(bytesIn(DEFAULT_FIXTURES_DIR, CHANGED))).toBe(true);

    // And it said so, naming the file. A command that silently repaired a
    // fixture would satisfy the byte assertion above and still be useless in
    // review.
    expect(run.stdout).toContain(`UPDATED   ${CHANGED}`);
    expect(run.stdout).toContain('1 updated');
    expect(run.stdout).toContain('CLAIM THAT BEHAVIOUR CHANGED ON PURPOSE');

    // Everything else was left completely alone — not merely left equal.
    for (const { file, bytes, mtime } of untouchedBefore) {
      expect(bytesIn(directory, file).equals(bytes), `${file} was rewritten`).toBe(true);
      expect(mtimeOf(directory, file), `${file} was written with identical bytes`).toBe(mtime);
      expect(run.stdout).toContain(`unchanged ${file}`);
    }
  }, SPAWN_BUDGET_MS);

  it('writes nothing at all when no scenario has changed, and says nothing changed', () => {
    const before = files.map((file) => ({
      file,
      bytes: bytesIn(directory, file),
      mtime: mtimeOf(directory, file),
    }));

    const run = regenerateInto(directory);
    expect(run.status, run.stdout).toBe(0);

    for (const { file, bytes, mtime } of before) {
      expect(bytesIn(directory, file).equals(bytes), `${file} changed`).toBe(true);
      // The load-bearing half. Identical bytes would also be true of a command
      // that rewrote every file with the same content, and that command would
      // churn mtimes, trip file watchers, and — the reason it matters here —
      // make "nothing changed" a claim nobody could check.
      expect(mtimeOf(directory, file), `${file} was rewritten with identical bytes`).toBe(mtime);
    }

    expect(run.stdout).toContain(`${before.length} scenario(s): 0 added, 0 updated,`);
    expect(run.stdout).toContain(`${before.length} unchanged.`);
    expect(run.stdout).toContain('No fixture changed');
    expect(run.stdout).not.toContain('UPDATED');
  }, SPAWN_BUDGET_MS);

  it('leaves the committed fixtures untouched while doing either', () => {
    // The whole reason `--fixtures` exists. If this ever fails, the tests are
    // regenerating the determinism gate they are supposed to be guarding.
    const before = files.map((file) => ({ file, bytes: bytesIn(DEFAULT_FIXTURES_DIR, file) }));

    writeFileSync(
      join(directory, CHANGED),
      renderFixture({ ...readFixture(CHANGED, directory), rootSeed: 1 }),
      'utf8',
    );
    expect(regenerateInto(directory).status).toBe(0);

    for (const { file, bytes } of before) {
      expect(bytesIn(DEFAULT_FIXTURES_DIR, file).equals(bytes), `${file} was modified`).toBe(true);
    }
  }, SPAWN_BUDGET_MS);
});
