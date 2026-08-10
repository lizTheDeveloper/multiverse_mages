/*
 * Multiverse Mages — proof that the dependency-purity check actually fails.
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
 * Task 10.4 — the "Runtime dependency rejected" scenario.
 *
 * `scripts/check-purity.mjs` runs on every `npm run verify` and has never once
 * been observed to fail, because the only manifest it could read was the real
 * one and the real one is clean. A check that has only ever taken its passing
 * branch is an untested check: the loop could be iterating over an empty list,
 * the field names could be misspelled, `process.exit(1)` could have been lost
 * in an edit, and `npm run verify` would stay green through all of it.
 *
 * This runs the script as a subprocess — the same way CI runs it, so the exit
 * code under test is the real exit code and not a return value — against
 * temporary directories laid out like the repository. Both branches are
 * covered: a manifest that declares a runtime dependency must fail and say
 * which one, and a clean manifest must pass. Without the second half the first
 * half would also pass if the script failed unconditionally.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

/** From packages/sim-core/test/unit/ to the script under test. */
const scriptPath = fileURLToPath(new URL('../../../../scripts/check-purity.mjs', import.meta.url));

/** The package path the script hard-codes as needing to be pure. */
const PURE_PACKAGE_DIR = join('packages', 'sim-core');

const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Writes a throwaway repository root, puts `manifest` at `packages/sim-core`,
 * and gives every *other* guarded package a clean manifest.
 *
 * The filler matters. The script guards a list of packages and fails if any is
 * missing — correctly, since a guarded package that vanished is exactly what
 * the guard is for. So a temp root holding only `sim-core` fails for the wrong
 * reason, and this test would have quietly become "the script exits non-zero",
 * which it does for every input. Reading the list from the script keeps the two
 * in step when a package is added, instead of leaving a trap for whoever adds
 * the next one.
 */
function rootWithManifest(manifest: unknown): { root: string; manifestPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'mm-purity-'));
  createdRoots.push(root);

  for (const dir of guardedPackageDirs()) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(
      join(root, dir, 'package.json'),
      `${JSON.stringify(dir === PURE_PACKAGE_DIR ? manifest : CLEAN_MANIFEST, null, 2)}\n`,
      'utf8',
    );
  }

  return { root, manifestPath: join(root, PURE_PACKAGE_DIR, 'package.json') };
}

/** The guarded package list, read from the script so the two cannot drift. */
function guardedPackageDirs(): string[] {
  const source = readFileSync(scriptPath, 'utf8');
  const match = /const PURE_PACKAGES = \[([^\]]*)\]/.exec(source);
  if (match === null) {
    throw new Error('Could not read PURE_PACKAGES from the dependency-purity script.');
  }
  const dirs = [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  if (!dirs.includes(PURE_PACKAGE_DIR)) {
    throw new Error(`The purity script no longer guards ${PURE_PACKAGE_DIR}.`);
  }
  return dirs;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the check the way CI does: a subprocess, judged by its exit code. */
function runCheck(args: readonly string[]): Run {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A manifest that should pass: no runtime deps, correct licence. */
const CLEAN_MANIFEST = {
  name: '@mm/sim-core',
  version: '0.0.0',
  private: true,
  license: 'AGPL-3.0-or-later',
  type: 'module',
  devDependencies: { typescript: '^5.9.3' },
};

describe('the dependency-purity check rejects runtime dependencies', () => {
  it('exits non-zero and names both the dependency and the manifest', () => {
    const { root, manifestPath } = rootWithManifest({
      ...CLEAN_MANIFEST,
      dependencies: { 'a-runtime-dependency': '^1.2.3' },
    });

    const run = runCheck([root]);

    // Exit code first: everything else is diagnostics, but this is the bit CI
    // reads. A check that printed a complaint and exited 0 would be decorative.
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('a-runtime-dependency');
    expect(run.stderr).toContain(manifestPath);
    expect(run.stderr).toContain('dependencies');
    expect(run.stdout).not.toContain('passed');
  });

  it('names every offending dependency, not just the first', () => {
    // A loop that reported one entry and stopped would hide the rest, and the
    // fix-one-rerun cycle is exactly what makes a purity check get disabled.
    const { root } = rootWithManifest({
      ...CLEAN_MANIFEST,
      dependencies: { 'first-offender': '^1.0.0', 'second-offender': '^2.0.0' },
    });

    const run = runCheck([root]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('first-offender');
    expect(run.stderr).toContain('second-offender');
  });

  it('rejects the other runtime fields, not only "dependencies"', () => {
    // peerDependencies and optionalDependencies are installed for consumers
    // just as surely. Banning only the obvious field would leave two doors open.
    for (const field of ['peerDependencies', 'optionalDependencies']) {
      const { root } = rootWithManifest({
        ...CLEAN_MANIFEST,
        [field]: { 'a-runtime-dependency': '^1.2.3' },
      });

      const run = runCheck([root]);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(field);
      expect(run.stderr).toContain('a-runtime-dependency');
    }
  });

  it('rejects bundledDependencies given as an array', () => {
    // This field is a list of names, not a name-to-range map. Reading it with
    // Object.keys would report the indices "0" and "1" instead of the packages.
    const { root } = rootWithManifest({
      ...CLEAN_MANIFEST,
      bundledDependencies: ['bundled-offender'],
    });

    const run = runCheck([root]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('bundled-offender');
  });

  it('rejects a manifest whose licence is not the project licence', () => {
    const { root } = rootWithManifest({ ...CLEAN_MANIFEST, license: 'MIT' });

    const run = runCheck([root]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('AGPL-3.0-or-later');
  });

  it('rejects a root with no manifest at all rather than passing vacuously', () => {
    // The failure mode that would quietly disable this check forever: point it
    // somewhere the manifest is missing and have it find nothing to complain
    // about. Absence must be an error, not a pass.
    const root = mkdtempSync(join(tmpdir(), 'mm-purity-empty-'));
    createdRoots.push(root);

    const run = runCheck([root]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('could not be read or parsed');
  });
});

describe('the dependency-purity check passes a clean manifest', () => {
  it('exits zero on a manifest with no runtime dependencies', () => {
    // The control. Every assertion above is that the script failed; if it
    // failed unconditionally they would all still pass and prove nothing.
    const { root } = rootWithManifest(CLEAN_MANIFEST);

    const run = runCheck([root]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('passed');
    expect(run.stderr).toBe('');
  });

  it('treats devDependencies as permitted, since the core is built with tools', () => {
    const { root } = rootWithManifest({
      ...CLEAN_MANIFEST,
      devDependencies: { typescript: '^5.9.3', vitest: '^3.2.4' },
    });

    expect(runCheck([root]).status).toBe(0);
  });

  it('checks this repository when given no argument, which is what CI runs', () => {
    // The default path must keep working unchanged now that the script takes an
    // argument. This is the invocation behind `npm run check:purity`.
    const run = runCheck([]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(PURE_PACKAGE_DIR.replace(/\\/g, '/'));
  });
});
