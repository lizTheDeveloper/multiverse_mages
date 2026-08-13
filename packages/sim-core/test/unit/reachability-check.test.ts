/*
 * Multiverse Mages — proof that the reachability check fails, and fails for the
 * right reason.
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
 * `scripts/check-reachability.mjs` is red on the real tree, so its failing
 * branch is exercised on every run and its *passing* branch is not — the mirror
 * image of `dependency-purity.test.ts`'s problem, and just as bad. A check that
 * fails unconditionally reports exactly as much information as one that passes
 * unconditionally.
 *
 * More importantly, the check makes three claims that its output on the real
 * tree cannot demonstrate, because the real tree has no controlled case:
 *
 * 1. **A mention in a comment is not a caller.** This is the whole reason the
 *    script parses TypeScript instead of grepping. This repository names
 *    symbols in prose constantly — `world-step.ts` discussed
 *    `advanceConstruction` before anything called it — so a grep-based check
 *    would have reported the flagship W85 finding as reached.
 * 2. **A name inside a string literal is not a caller.** `mc-harness`'s
 *    `strategies.ts` quotes the W85 finding, symbol names and all, in a string.
 * 3. **A re-export is not a caller.** An index barrel that counted would make
 *    every export of every package reachable by construction.
 *
 * Each gets a case below, run against a throwaway repository root, as a
 * subprocess, so the exit code under test is the real exit code.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

/** From packages/sim-core/test/unit/ to the script under test. */
const scriptPath = fileURLToPath(new URL('../../../../scripts/check-reachability.mjs', import.meta.url));

const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

/**
 * The examined package list, read from the script so the two cannot drift.
 *
 * The script fails when a rules-path package is missing — deliberately, since a
 * guarded package that vanished is what the guard is for — so a temp root
 * holding only the package under test would fail for the wrong reason and this
 * suite would quietly become "the script exits non-zero", which it does for
 * almost every input.
 */
function examinedPackages(): string[] {
  const source = readFileSync(scriptPath, 'utf8');
  const match = /const RULES_PATH_PACKAGES = \[([^\]]*)\]/.exec(source);
  if (match === null) throw new Error('Could not read RULES_PATH_PACKAGES from the check.');
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((entry) => entry[1]!);
}

/** The package the cases put their fixture sources in. Any examined one would do. */
const SUBJECT = 'rules-world';

/**
 * A throwaway root laid out like the repository, with `files` written under
 * `packages/<SUBJECT>/src/`.
 *
 * Every other examined package gets an empty `src/` and a manifest, so the only
 * thing that varies between cases is the fixture.
 */
function rootWith(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'mm-reachability-'));
  createdRoots.push(root);

  const names = examinedPackages();
  for (const name of names) {
    const dir = join(root, 'packages', name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    // Every package depends on every other, so none is reported as orphaned and
    // the cases below vary exactly one thing: the fixture.
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name: `@mm/${name}`,
          license: 'AGPL-3.0-or-later',
          dependencies: Object.fromEntries(
            names.filter((other) => other !== name).map((other) => [`@mm/${other}`, '*']),
          ),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    // Empty rather than filler. An exported filler symbol would itself have no
    // caller, and every case would then pass or fail for a reason it did not set up.
    writeFileSync(join(dir, 'src', 'index.ts'), '', 'utf8');
  }

  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(root, 'packages', SUBJECT, 'src', name), contents, 'utf8');
  }
  return root;
}

function run(root: string): { status: number; output: string } {
  const result = spawnSync(process.execPath, [scriptPath, root], { encoding: 'utf8' });
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

describe('the reachability check', () => {
  it('passes when an exported symbol is called from another file', () => {
    const root = rootWith({
      'mechanic.ts': 'export function advanceThing(n: number): number {\n  return n + 1;\n}\n',
      'loop.ts':
        "import { advanceThing } from './mechanic.js';\n\n" +
        'export function tick(n: number): number {\n  return advanceThing(n);\n}\n',
      // A bare module-level call, not an export: module-level code always runs,
      // so what it names is reached, and it declares no symbol of its own.
      'index.ts': "import { tick } from './loop.js';\n\ntick(0);\n",
    });

    const { status, output } = run(root);
    expect(output).toContain('Reachability check PASSED');
    expect(status).toBe(0);
  });

  it('fails, and names the symbol, when nothing calls it', () => {
    const root = rootWith({
      'mechanic.ts': 'export function advanceThing(n: number): number {\n  return n + 1;\n}\n',
    });

    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('Exported values with no production caller');
    expect(output).toContain('advanceThing');
    expect(output).toContain('packages/rules-world/src/mechanic.ts');
  });

  it('does not count a mention in a comment as a caller', () => {
    // The claim that justifies parsing instead of grepping. `world-step.ts`
    // discussed `advanceConstruction` in a comment for a whole release while
    // nothing called it.
    const root = rootWith({
      'mechanic.ts': 'export function advanceThing(n: number): number {\n  return n + 1;\n}\n',
      'loop.ts':
        '/**\n * The build phase will call `advanceThing` once the crew exists.\n' +
        ' * See advanceThing in mechanic.ts.\n */\n',
    });

    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('advanceThing');
  });

  it('does not count a name inside a string literal as a caller', () => {
    const root = rootWith({
      'mechanic.ts': 'export function advanceThing(n: number): number {\n  return n + 1;\n}\n',
      'loop.ts': "export const finding = 'advanceThing in rules-world has no caller';\n",
    });

    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('advanceThing');
  });

  it('does not count a re-export as a caller', () => {
    const root = rootWith({
      'mechanic.ts': 'export function advanceThing(n: number): number {\n  return n + 1;\n}\n',
      'index.ts': "export { advanceThing } from './mechanic.js';\n",
    });

    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('advanceThing');
  });

  it('counts a caller in the same file, so the loop of the game is not a finding', () => {
    // `worldSystem` is called only by `defineWorldSimulation`, thirty lines
    // above it in the same file. An earlier draft required a cross-file caller
    // and reported the entire world tick as unreached.
    const root = rootWith({
      'mechanic.ts':
        'export function advanceThing(n: number): number {\n  return n + 1;\n}\n\n' +
        'export function install(n: number): number {\n  return advanceThing(n);\n}\n',
      'index.ts': "import { install } from './mechanic.js';\n\ninstall(0);\n",
    });

    const { status, output } = run(root);
    expect(output).not.toContain('advanceThing');
    expect(status).toBe(0);
  });

  it('does not count a `typeof` reference, which runs nothing', () => {
    // How `UNIVERSITY_STAFF` looked used: a `KeysMatch<Record, typeof SPEC>`
    // assertion names the symbol, is checked by `tsc`, and emits nothing.
    const root = rootWith({
      'mechanic.ts': "export const SPEC = { name: 'thing' } as const;\n",
      'index.ts':
        "import { SPEC } from './mechanic.js';\n\n" +
        'export type SpecShape = typeof SPEC;\n',
    });

    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('SPEC');
  });

  it('refuses a root that is missing a rules-path package rather than examining less', () => {
    const root = rootWith({});
    rmSync(join(root, 'packages', 'primitives'), { recursive: true, force: true });

    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('could not find these rules-path packages');
    expect(output).toContain('packages/primitives/src');
  });
});
