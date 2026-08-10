/*
 * Multiverse Mages — the four-hook cap, enforced against this package's source.
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
 * Task 6.14, and the reason it is a scan rather than a convention.
 *
 * `vision.md` §4a caps a tradition at four hooks because bespoke tradition code
 * defeats primitive-level Monte Carlo balancing. The enumeration in
 * `@mm/content` closes the *data* half of that. This closes the code half: the
 * moment any module in the rules path can ask "which tradition is this?" and
 * branch on the answer, a fifth hook exists — nameless, undeclared, invisible
 * to the harness, and impossible to enumerate. The whole cap becomes a comment.
 *
 * So `traditionId` is readable in exactly one file, arbitration happens there,
 * and everything downstream receives a *resolved hook* it cannot trace back to
 * a tradition. This test is the thing that makes that sentence true rather than
 * aspirational.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * The one file permitted to turn an id into behaviour.
 *
 * `contracts.md` §2.5 names it, and the spec's phrase is "the four hook
 * dispatch points and `hookFor`". The dispatch points turn out to need no
 * exemption at all — they take a `ResolvedHook` — which is a stronger result
 * than the task asked for and is asserted separately below.
 */
const ARBITRATION_FILE = 'traditions/hook-for.ts';

/** `traditionId` as a whole identifier or property, in any access form. */
const TRADITION_ID_READ = /(?<![A-Za-z0-9_$])traditionId(?![A-Za-z0-9_$])|\['traditionId'\]/g;

/** Every `.ts` file under `packages/rules-magic/src`, path-relative, sorted. */
function sourceFiles(directory = '', out: string[] = []): string[] {
  for (const entry of readdirSync(SRC_ROOT + directory).sort()) {
    const relative = directory === '' ? entry : `${directory}/${entry}`;
    if (statSync(SRC_ROOT + relative).isDirectory()) {
      sourceFiles(relative, out);
      continue;
    }
    if (relative.endsWith('.ts')) out.push(relative);
  }
  return out;
}

/**
 * Source with comments and string literals removed.
 *
 * Prose about `traditionId` is not a read of it — this file's own header would
 * fail its own check otherwise, and a scanner that forces its documentation to
 * avoid naming the thing it documents teaches people to write worse comments.
 */
function code(relative: string): string {
  return readFileSync(SRC_ROOT + relative, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/\/\/[^\n]*/g, ' ')
    .replaceAll(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replaceAll(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('traditionId is readable in exactly one place', () => {
  const files = sourceFiles();

  it('finds source to scan at all', () => {
    // A scanner over an empty directory passes for the wrong reason, silently,
    // and would keep passing after a refactor moved every file.
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain(ARBITRATION_FILE);
  });

  it.each(sourceFiles().filter((file) => file !== ARBITRATION_FILE))(
    '%s does not read traditionId',
    (file) => {
      const found = code(file).match(TRADITION_ID_READ) ?? [];
      expect(
        found,
        `${file} reads traditionId. Arbitration belongs in ${ARBITRATION_FILE}; everything ` +
          'downstream takes a ResolvedHook, so that a tradition cannot influence behaviour at a ' +
          'fifth, undeclared point (vision.md §4a).',
      ).toEqual([]);
    },
  );

  it('still reads it in the arbitration file, so the check is not vacuous', () => {
    expect(code(ARBITRATION_FILE).match(TRADITION_ID_READ)?.length ?? 0).toBeGreaterThan(0);
  });

  it('would catch the read it exists to catch', () => {
    // The staged failure: a dispatch reaching for the id it is not given.
    const smuggled = "if (universe.traditionId === 3) { return 'free'; }";
    expect(smuggled.match(TRADITION_ID_READ)).toHaveLength(1);
    expect("state['traditionId']".match(TRADITION_ID_READ)).toHaveLength(1);
    // And the things it must not mistake for one.
    expect('homeTraditionId, hostTraditionId, myTraditionIdx'.match(TRADITION_ID_READ)).toBeNull();
  });
});

describe('the four dispatch points take a resolved hook, not an identity', () => {
  const DISPATCH = [
    'traditions/acquire.ts',
    'traditions/store.ts',
    'traditions/cast.ts',
    'traditions/cost.ts',
  ];

  it.each(DISPATCH)('%s never names a tradition in any casing', (file) => {
    // Stronger than 6.14 asks for and worth keeping: a dispatch that cannot
    // spell "tradition id" cannot branch on one, so the four hooks stay
    // interchangeable parts that the balance harness can enumerate.
    expect(code(file)).not.toMatch(/traditionid/i);
  });

  it.each(DISPATCH)('%s branches only on a hook kind', (file) => {
    // Each dispatch is a switch over `hook.kind`, which is drawn from the closed
    // enumeration. If one grows a second axis to branch on, this is where the
    // review conversation starts.
    expect(code(file)).toMatch(/switch \(\w+\.kind\)|\.kind ===|\.paidAtPreparation/);
  });
});

describe('every rules-magic source file carries the licence header', () => {
  it.each(sourceFiles())('%s', (file) => {
    const head = readFileSync(SRC_ROOT + file, 'utf8').slice(0, 800);
    expect(head).toContain('SPDX-License-Identifier: AGPL-3.0-or-later');
    expect(head).toContain('Copyright (C) 2026 Ann Kelner');
  });
});
