/*
 * Multiverse Mages — proof that the reachability ratchet holds, slips, and
 * knows when it cannot tell.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the LICENSE
 * file at the repository root — GNU Affero General Public License v3.0 or later.
 * See <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `reachability-check.test.ts` next door proves the *check* fails for the right
 * reason. This proves the *gate* built on top of it does, and it has one extra
 * obligation the check does not: the gate's normal state is **green on a red
 * tree**, so its failing branch is the one that never runs in CI. A gate nobody
 * has watched fail is not a gate.
 *
 * CLAUDE.md states the rule these cases exist to satisfy — *when a check reports
 * the negative case, confirm the check works before believing it* — and the
 * repository has five recorded instances of the accident it guards against: an
 * aggregator that answered confidently about the wrong input. The last two cases
 * below are that specific control. A scan pointed at a nearly empty tree makes
 * every pinned finding vanish, and a ratchet without a floor would report the
 * whole backlog as repaired. It must exit 1 — *I cannot tell* — and never 42.
 *
 * Every case runs against a throwaway root with its own baseline file, as a
 * subprocess, so the exit code under test is the real exit code. Running any of
 * this against the real repository would fail the first time somebody
 * legitimately fixed a finding, which is the opposite of what a ratchet is for.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ratchetPath = fileURLToPath(
  new URL('../../../../scripts/check-reachability-ratchet.mjs', import.meta.url),
);
const checkPath = fileURLToPath(new URL('../../../../scripts/check-reachability.mjs', import.meta.url));

/** The three exits, named here so a case cannot assert a bare integer. */
const HELD = 0;
const BROKEN_PROBE = 1;
const SLIPPED = 42;

const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

/**
 * The examined package list, read from the check so the two cannot drift.
 *
 * Same reason as the sibling suite: the check fails outright when a rules-path
 * package is missing, so a root holding only the subject would fail for the
 * wrong reason and every case here would degrade into "the wrapper exits
 * non-zero", which it does for almost every input.
 */
function examinedPackages(): string[] {
  const source = readFileSync(checkPath, 'utf8');
  const match = /const RULES_PATH_PACKAGES = \[([^\]]*)\]/.exec(source);
  if (match === null) throw new Error('Could not read RULES_PATH_PACKAGES from the check.');
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((entry) => entry[1]!);
}

const SUBJECT = 'rules-world';

function rootWith(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'mm-ratchet-'));
  createdRoots.push(root);

  const names = examinedPackages();
  for (const name of names) {
    const dir = join(root, 'packages', name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    // Every package depends on every other, so none is reported as orphaned and
    // the only thing that varies between cases is the fixture.
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
    writeFileSync(join(dir, 'src', 'index.ts'), '', 'utf8');
  }

  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(root, 'packages', SUBJECT, 'src', name), contents, 'utf8');
  }
  return root;
}

/** An exported function nothing calls: one finding, by construction. */
function deadSymbol(name: string): string {
  return `export function ${name}(n: number): number {\n  return n + 1;\n}\n`;
}

/**
 * Eight dead symbols in eight files.
 *
 * Eight rather than one so that removing a single finding stays comfortably
 * above the 80% scan floor. A backlog small enough that fixing one finding
 * breaches the floor would make the "disappeared" case and the "broken probe"
 * case indistinguishable, and the whole point of the third exit is that they are
 * different answers.
 */
const BACKLOG = Object.fromEntries(
  Array.from({ length: 8 }, (_, index) => [`dead-${index}.ts`, deadSymbol(`deadThing${index}`)]),
);

function ratchet(root: string, baseline: string, ...extra: string[]): { status: number; output: string } {
  const result = spawnSync(process.execPath, [ratchetPath, root, '--baseline', baseline, ...extra], {
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

/** A root, pinned. Returns the baseline path, which lives outside the root. */
function pinned(root: string): string {
  const baseline = join(mkdtempSync(join(tmpdir(), 'mm-ratchet-pin-')), 'baseline.json');
  createdRoots.push(join(baseline, '..'));
  const { status, output } = ratchet(root, baseline, '--update');
  // Pinning that failed would make every case downstream assert against an
  // empty baseline and pass for the wrong reason.
  expect(output).toContain('Pinned');
  expect(status).toBe(HELD);
  return baseline;
}

describe('the reachability ratchet', () => {
  it('holds when the reported findings are exactly the pinned ones', () => {
    const root = rootWith(BACKLOG);
    const baseline = pinned(root);

    const { status, output } = ratchet(root, baseline);
    expect(output).toContain('Reachability ratchet HELD');
    expect(output).toContain('8 finding(s), all of them pinned');
    expect(status).toBe(HELD);
  });

  it('slips on a finding that is not in the baseline, and names it', () => {
    const root = rootWith(BACKLOG);
    const baseline = pinned(root);

    // The regression this whole thing exists to catch: one more symbol built
    // ahead of any caller, indistinguishable from the standing backlog in the
    // raw check's output.
    writeFileSync(join(root, 'packages', SUBJECT, 'src', 'newly-dead.ts'), deadSymbol('newlyDead'), 'utf8');

    const { status, output } = ratchet(root, baseline);
    expect(output).toContain('Reachability ratchet SLIPPED');
    expect(output).toContain('1 NEW finding(s)');
    expect(output).toContain('newlyDead');
    expect(status).toBe(SLIPPED);
  });

  it('slips when a pinned finding disappears, and says how to bank it', () => {
    const root = rootWith(BACKLOG);
    const baseline = pinned(root);

    // `deadThing3` acquires a caller: a repair, of exactly the shape wiring
    // `completeAffiliation` would be. The gate must still fail, because a
    // baseline nobody updates stops recording progress and starts pre-pinning
    // any re-introduction.
    writeFileSync(
      join(root, 'packages', SUBJECT, 'src', 'index.ts'),
      "import { deadThing3 } from './dead-3.js';\n\ndeadThing3(0);\n",
      'utf8',
    );

    const { status, output } = ratchet(root, baseline);
    expect(output).toContain('Reachability ratchet SLIPPED');
    expect(output).toContain('1 pinned finding(s) NO LONGER REPORTED');
    expect(output).toContain('deadThing3');
    // The one-command fix has to be discoverable from the failure itself, not
    // from a document somebody has to already know exists.
    expect(output).toContain('npm run reachability:pin');
    expect(status).toBe(SLIPPED);
  });

  it('reports a broken probe, not a clean tree, when the baseline is missing', () => {
    const root = rootWith(BACKLOG);
    const missing = join(mkdtempSync(join(tmpdir(), 'mm-ratchet-none-')), 'absent.json');
    createdRoots.push(join(missing, '..'));

    const { status, output } = ratchet(root, missing);
    expect(output).toContain('THE PROBE IS BROKEN');
    expect(status).toBe(BROKEN_PROBE);
    expect(status).not.toBe(SLIPPED);
  });

  it('reports a broken probe when the scan collapses, rather than 8 repairs', () => {
    // The positive control, and the reason the third exit exists. This is the
    // repository's recorded failure shape — an aggregator answering confidently
    // about the wrong input — in its purest form: point the check at a tree
    // whose rules-path packages resolve but hold almost nothing, and every
    // pinned finding "disappears". A ratchet with no floor reports a backlog
    // cleared. There is nothing in the diff to tell it otherwise; only the size
    // of the scan can.
    const full = rootWith(BACKLOG);
    const baseline = pinned(full);
    const nearlyEmpty = rootWith({ 'dead-0.ts': deadSymbol('deadThing0') });

    const { status, output } = ratchet(nearlyEmpty, baseline);
    expect(output).toContain('THE PROBE IS BROKEN');
    expect(output).toContain('scanned far less than the baseline records');
    expect(output).toContain('examinedSymbolCount');
    // Not 42. "I looked at the wrong tree" and "seven findings were fixed" are
    // different answers and the gate must not collapse them.
    expect(status).toBe(BROKEN_PROBE);
    expect(status).not.toBe(SLIPPED);
    expect(output).not.toContain('NO LONGER REPORTED');
  });

  it('reports a broken probe on a malformed baseline', () => {
    const root = rootWith(BACKLOG);
    const path = join(mkdtempSync(join(tmpdir(), 'mm-ratchet-bad-')), 'baseline.json');
    createdRoots.push(join(path, '..'));
    writeFileSync(path, '{ "findings": "not an array" }\n', 'utf8');

    const { status, output } = ratchet(root, path);
    expect(output).toContain('THE PROBE IS BROKEN');
    expect(status).toBe(BROKEN_PROBE);
  });

  it('keys findings on file and symbol, not on line number', () => {
    // A rotted line number is CLAUDE.md's cheapest signal that a documented row
    // is stale — which is an argument against making one load-bearing. If the
    // line were part of a finding's identity, every edit above a pinned symbol
    // would read as one repair plus one regression, and the baseline would get
    // regenerated on reflex until it meant nothing.
    const root = rootWith(BACKLOG);
    const baseline = pinned(root);

    const path = join(root, 'packages', SUBJECT, 'src', 'dead-0.ts');
    writeFileSync(path, `// eight\n// new\n// lines\n// above\n${readFileSync(path, 'utf8')}`, 'utf8');

    const { status, output } = ratchet(root, baseline);
    expect(output).toContain('Reachability ratchet HELD');
    expect(status).toBe(HELD);
  });
});
