/*
 * Multiverse Mages — task 10.5: every capability-spec scenario is mapped to a
 * test, and the mapping cannot rot.
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
 * Task 10.5 asks someone to *confirm* every scenario has a passing test. A
 * confirmation nobody can re-run is an opinion with a date on it, and the two
 * ways it goes stale are both silent: a scenario is added to a spec and nobody
 * writes the test, or a test file is renamed and the claim that covered it now
 * points at nothing.
 *
 * So the confirmation is a committed manifest — `scenario-coverage.md` beside
 * the specs — and this file checks it:
 *
 * - the manifest's scenario set **equals** the specs' scenario set, both ways;
 * - every file it names exists, and is a file `vitest` actually collects.
 *
 * ## What this deliberately does not check
 *
 * That a named file contains an assertion *about* that scenario. Nothing
 * mechanical can, short of writing scenario ids into every `it`, which converts
 * a design document into a test-naming convention and makes the specs harder to
 * read in order to make a checker easier to write. The mapping is a reviewed
 * claim. This check is what stops the claim from decaying between reviews, which
 * is the part a human is worst at.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');

const SPEC_DIR = 'openspec/changes/agent-interface/specs';
const MANIFEST_PATH = 'openspec/changes/agent-interface/scenario-coverage.md';

/** The three capability specs this change adds. Read from disk, not listed. */
const specNames = readdirSync(join(repoRoot, SPEC_DIR)).sort();

/** `Requirement > Scenario` for every scenario in one spec, in document order. */
function specScenarios(markdown: string): string[] {
  const keys: string[] = [];
  let requirement = '';
  for (const line of markdown.split('\n')) {
    const heading = /^### Requirement:\s*(.+?)\s*$/.exec(line);
    if (heading !== null) {
      requirement = heading[1] as string;
      continue;
    }
    const scenario = /^#### Scenario:\s*(.+?)\s*$/.exec(line);
    if (scenario !== null) {
      keys.push(`${requirement} > ${scenario[1] as string}`);
    }
  }
  return keys;
}

/** `Requirement > Scenario` and the test file claimed for it. */
function manifestRows(markdown: string): { key: string; file: string }[] {
  const rows: { key: string; file: string }[] = [];
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*(.+?)\s*>\s*(.+?)\s*\|\s*`(.+?)`\s*\|$/.exec(line);
    if (match === null) continue;
    // The header row of each table is `| requirement > scenario | test |` and
    // has no backticked path, so it cannot match. Belt and braces anyway.
    if (!(match[3] as string).endsWith('.test.ts')) continue;
    rows.push({ key: `${match[1] as string} > ${match[2] as string}`, file: match[3] as string });
  }
  return rows;
}

const manifest = read(MANIFEST_PATH);
const rows = manifestRows(manifest);

const declared: string[] = specNames.flatMap((name) =>
  specScenarios(read(join(SPEC_DIR, name, 'spec.md'))),
);

describe('the coverage manifest is a manifest of the specs that exist', () => {
  it('found the three capability specs', () => {
    expect(specNames).toEqual(['agent-api', 'balance-metrics', 'mc-harness']);
  });

  it('parsed a manifest and a spec set worth comparing', () => {
    // Guards the two regexes. Without this, a parser that matched nothing would
    // make the equality below trivially true in both directions.
    expect(declared.length).toBeGreaterThan(100);
    expect(rows.length).toBe(declared.length);
  });

  it('maps every scenario the specs declare, and nothing they do not', () => {
    expect(rows.map((row) => row.key).sort()).toEqual([...declared].sort());
  });

  it('maps each scenario exactly once', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const row of rows) {
      if (seen.has(row.key)) duplicates.push(row.key);
      seen.add(row.key);
    }
    expect(duplicates).toEqual([]);
  });
});

describe('every test the manifest names is a test that runs', () => {
  it('names files that exist', () => {
    const missing = [...new Set(rows.map((row) => row.file))]
      .filter((file) => !existsSync(join(repoRoot, file)))
      .sort();
    expect(missing).toEqual([]);
  });

  it('names files vitest collects', () => {
    // `vitest.config.ts` collects `**/test/**/*.test.ts`. A claim pointing at a
    // helper module would be a claim covered by nothing.
    const wrong = [...new Set(rows.map((row) => row.file))]
      .filter((file) => !/packages\/[a-z-]+\/test\/[a-z-]+\/[a-z0-9-]+\.test\.ts$/.test(file))
      .sort();
    expect(wrong).toEqual([]);
  });
});
