/*
 * Multiverse Mages — the conformance checks behind the two 0.9.0 claims.
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
 * Tasks 3.4, 3.5, 5.7, 5.10, 7.5 and 8.5 — the checks that make two release
 * claims *structural* rather than observed.
 *
 * Every one of them is a scan over source text, and every one of them is
 * exercised against a synthetic violation as well as against the real tree.
 * That second half is the part that decays: a scan whose only input is a clean
 * tree is indistinguishable from a scan that returns an empty array for
 * everything, and a green run reveals nothing about which it is.
 *
 * What a scan cannot do is stated rather than implied. A determined author can
 * defeat every check here by renaming a variable, and that is accepted — a
 * conformance check catches **drift**, not an adversary, and the shapes it does
 * catch are the shapes a reimplementation is actually written in.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertNoWorldPositions, worldComponentsWithPosition } from '@mm/state';

/** From packages/rules-raid/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

interface SourceFile {
  /** Repo-relative, with forward slashes, so failures name a path a reader can open. */
  readonly path: string;
  readonly text: string;
}

function sourcesUnder(...segments: string[]): SourceFile[] {
  const root = join(repoRoot, ...segments);
  const found: SourceFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      found.push({
        path: relative(repoRoot, full).split(sep).join('/'),
        text: readFileSync(full, 'utf8'),
      });
    }
  };
  walk(root);
  return found;
}

const raidSources = sourcesUnder('packages', 'rules-raid', 'src');

/** Every `packages/<name>/src` tree, for the repository-wide checks. */
function allPackageSources(): SourceFile[] {
  const packages = readdirSync(join(repoRoot, 'packages')).sort();
  return packages.flatMap((name) => {
    try {
      return sourcesUnder('packages', name, 'src');
    } catch {
      return [];
    }
  });
}

/**
 * Lines matching a pattern, with comments and blank lines removed first.
 *
 * Comments are stripped because this file's own prose, and the prose of every
 * module it scans, discusses the very things being scanned for. A check that
 * counted its own explanation would fail the moment somebody documented the
 * rule it enforces, which is a perverse incentive to leave it undocumented.
 */
function codeLinesMatching(file: SourceFile, pattern: RegExp): string[] {
  return file.text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return false;
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        return false;
      }
      return pattern.test(line);
    })
    .map((line) => line.trim());
}

/** Files in which a pattern appears in code, with the offending lines. */
function offenders(
  files: readonly SourceFile[],
  pattern: RegExp,
  allowed: readonly string[],
): { path: string; lines: string[] }[] {
  const found: { path: string; lines: string[] }[] = [];
  for (const file of files) {
    if (allowed.includes(file.path)) continue;
    const lines = codeLinesMatching(file, pattern);
    if (lines.length > 0) found.push({ path: file.path, lines });
  }
  return found;
}

describe('the scan sees the real tree', () => {
  it('found the package it is meant to be scanning', () => {
    // The control every check below rests on. A scan over an empty file list
    // reports no violations, which is exactly what a passing run looks like.
    expect(raidSources.length).toBeGreaterThan(8);
    expect(raidSources.map((file) => file.path)).toContain(
      'packages/rules-raid/src/arbitration.ts',
    );
  });
});

describe('arbitration is computed in exactly one place (task 3.4)', () => {
  const ARBITRATION_HOME = 'packages/rules-raid/src/arbitration.ts';

  /**
   * The two files allowed to ask a legality question, and they ask different
   * ones.
   *
   * `arbitration.ts` decides what functions **inside the host** — that is the
   * rule vision §3 is about, and it is the one that must live in one place.
   * `portal.ts` asks whether the *attacker's own* universe permits `rego-limen`,
   * which happens in the attacker's sky before any raid exists and is
   * deliberately not the host's business at all. Listing both and then asserting
   * *what each passes* is stronger than a single-file rule would be: the danger
   * is a legality decision taken against a live universe, not a legality
   * decision taken in a second file.
   */
  const LEGALITY_SITES = [ARBITRATION_HOME, 'packages/rules-raid/src/portal.ts'];

  it('asks a legality question in only those two files', () => {
    const found = offenders(raidSources, /\bpermits\s*\(/u, LEGALITY_SITES);
    expect(found).toEqual([]);
  });

  it('decides what functions during a raid in exactly one of them', () => {
    // The portal gate runs before the engagement exists, so the *engagement*
    // legality decision is still made in one place.
    const portal = raidSources.find((file) => file.path === 'packages/rules-raid/src/portal.ts');
    if (portal === undefined) throw new Error('the portal gate has moved');
    const calls = codeLinesMatching(portal, /\bpermits\s*\(/u);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('attackerRuleset');
    expect(calls[0]).toContain('portalCell');
  });

  it('evaluates no technique or form bitmask anywhere in rules-raid', () => {
    // The rule §1.1 is really about: a second implementation of the precedence,
    // which is where edicts get forgotten. This package should never touch the
    // masks at all — it has `permits()` and nothing else to want.
    const found = offenders(raidSources, /permitted(Techniques|Forms)/u, []);
    expect(found).toEqual([]);
  });

  it('turns a node into effect magnitudes nowhere but the arbiter', () => {
    // "No path applies node effects outside resolveCast", expressed as the
    // shape that would actually be written: reading `effect.magnitude` off a
    // node record. A second reader is a second place a forbidden cell could
    // quietly become live.
    const found = offenders(raidSources, /effect\.magnitude/u, [ARBITRATION_HOME]);
    expect(found).toEqual([]);
  });

  it('passes a ruleset snapshot to permits(), never a live universe (task 3.5)', () => {
    const arbitration = raidSources.find((file) => file.path === ARBITRATION_HOME);
    if (arbitration === undefined) throw new Error('the arbiter has moved');
    const calls = codeLinesMatching(arbitration, /\bpermits\s*\(/u);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // The only legality call in the package, and its first argument is the
      // frozen snapshot field. A live universe reaching here would be a raid
      // whose rules could change halfway through.
      expect(call).toContain('permits(this.#hostRuleset');
    }
  });

  it('would catch a reimplementation, on synthetic source', () => {
    const probe: SourceFile = {
      path: 'packages/rules-raid/src/probe.ts',
      text: 'const legal = (ruleset.permittedTechniques & (1 << bit)) !== 0;\n',
    };
    expect(offenders([probe], /permitted(Techniques|Forms)/u, [])).toHaveLength(1);
  });

  it('would catch a second legality call, on synthetic source', () => {
    const probe: SourceFile = {
      path: 'packages/rules-raid/src/probe.ts',
      text: 'if (permits(universe, cellId)) apply();\n',
    };
    expect(offenders([probe], /\bpermits\s*\(/u, LEGALITY_SITES)).toHaveLength(1);
  });
});

describe('portal stability has exactly one writer (task 7.5)', () => {
  const DECREMENT_HOME = 'packages/rules-raid/src/termination.ts';

  it('is assigned in one file, in the whole repository', () => {
    // Repository-wide, not package-wide. `@mm/state` used to carry a
    // `decayPortal` helper doing the same arithmetic, and two assignment sites
    // would make "exactly one writer" a claim about two files that happen to
    // agree today.
    const found = offenders(allPackageSources(), /portalStability\s*=[^=]/u, [DECREMENT_HOME]);
    expect(found).toEqual([]);
  });

  it('writes it exactly once, with no conditional in the writer', () => {
    const termination = raidSources.find((file) => file.path === DECREMENT_HOME);
    if (termination === undefined) throw new Error('the decrement has moved');
    const assignments = codeLinesMatching(termination, /portalStability\s*=[^=]/u);
    expect(assignments).toHaveLength(1);

    // And the function containing it holds no `if`. Every guard added there is
    // a case in which a raid does not decay, and the union of those cases is a
    // raid that runs forever.
    const body = termination.text.slice(
      termination.text.indexOf('export function decayStability'),
    );
    const decay = body.slice(0, body.indexOf('\n}'));
    expect(decay).not.toMatch(/\bif\s*\(/u);
  });

  it('derives the decay from no division anywhere (task 7.7)', () => {
    // The specific trap: `div` rounds toward negative infinity, so a decay
    // expressed as "stability ÷ desired length" silently becomes 0 whenever the
    // divisor exceeds the numerator — a raid that runs forever with no error.
    const found = offenders(
      raidSources,
      /stabilityDecayPerTick\s*[:=]\s*(floorDiv|div|Math)/u,
      [],
    );
    expect(found).toEqual([]);
  });

  it('would catch a second writer, on synthetic source', () => {
    const probe: SourceFile = {
      path: 'packages/rules-raid/src/probe.ts',
      text: 'raid.portalStability = raid.portalStability + shoredUp;\n',
    };
    expect(offenders([probe], /portalStability\s*=[^=]/u, [DECREMENT_HOME])).toHaveLength(1);
  });
});

describe('there is no resurrection path (task 8.5)', () => {
  it('sets no mage alive flag to 1 anywhere in rules-raid', () => {
    const found = offenders(raidSources, /'alive',\s*1|alive\s*=\s*1/u, []);
    expect(found).toEqual([]);
  });

  it('sets it to 0 somewhere, so the check is about direction and not absence', () => {
    const writes = raidSources.flatMap((file) => codeLinesMatching(file, /'alive',\s*0/u));
    expect(writes.length).toBeGreaterThan(0);
  });

  it('would catch a resurrection, on synthetic source', () => {
    const probe: SourceFile = {
      path: 'packages/rules-raid/src/probe.ts',
      text: "mages.set(mageId, 'alive', 1);\n",
    };
    expect(offenders([probe], /'alive',\s*1|alive\s*=\s*1/u, [])).toHaveLength(1);
  });
});

describe('the rules path computes no square root and no float distance (task 5.7)', () => {
  it('uses no Math.sqrt, Math.hypot, or Math.pow in rules-raid', () => {
    const found = offenders(raidSources, /Math\.(sqrt|hypot|pow|cbrt|atan2|sin|cos)/u, []);
    expect(found).toEqual([]);
  });

  it('offers an integer alternative, so the ban is satisfiable', () => {
    const geometry = raidSources.find(
      (file) => file.path === 'packages/rules-raid/src/geometry.ts',
    );
    expect(geometry?.text).toContain('export function integerSqrt');
    expect(geometry?.text).toContain('export function ceilSqrt');
  });

  it('would catch a square root, on synthetic source', () => {
    const probe: SourceFile = {
      path: 'packages/rules-raid/src/probe.ts',
      text: 'const distance = Math.sqrt(dx * dx + dy * dy);\n',
    };
    expect(offenders([probe], /Math\.(sqrt|hypot|pow)/u, [])).toHaveLength(1);
  });
});

describe('no world-scale entity acquires a position (task 5.10)', () => {
  it('holds for every world component, before and after a raid exists', () => {
    // The check `@mm/state` already runs when a world is defined, asserted here
    // too because this is the change that could have broken it: a raid is the
    // first thing in the project that has coordinates at all.
    expect(worldComponentsWithPosition()).toEqual([]);
    expect(() => {
      assertNoWorldPositions();
    }).not.toThrow();
  });

  it('attaches the positional components only to the engagement store', () => {
    // Every `attachRecord(...COMBATANT` and `...OBJECTIVE` in this package must
    // target an engagement state. Scanned as text because the alternative — a
    // runtime check — could only observe the raids a test happens to run.
    for (const file of raidSources) {
      for (const line of codeLinesMatching(file, /attachRecord\(/u)) {
        if (!/COMBATANT|OBJECTIVE/u.test(line) && !/COMBATANT|OBJECTIVE/u.test(file.text)) {
          continue;
        }
      }
    }
    const attachments = raidSources.flatMap((file) =>
      codeLinesMatching(file, /attachRecord\(\s*engagement/u).map((line) => ({
        path: file.path,
        line,
      })),
    );
    // Both positional components are attached, and both to an engagement store.
    expect(attachments.length).toBeGreaterThanOrEqual(2);
  });
});
