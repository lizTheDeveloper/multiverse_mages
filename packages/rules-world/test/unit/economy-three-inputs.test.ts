/*
 * Multiverse Mages — three tracked inputs, no fourth resource, and no worship
 * computed here.
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
 * Two checks that are really one boundary. The economy tracks populace,
 * materials, and knowledge-as-capital; `favor` and `worship` are `god-agency`'s
 * currency, and `contracts.md` §1.1 already gives the universe both fields —
 * which is exactly why a write from this package would look so ordinary.
 *
 * The scan is for **writes**, not mentions. Reading `favor` is legitimate (a
 * later capability may want to observe it), and the prose in `counts.ts` argues
 * about worship at length. What must not exist is an assignment.
 *
 * The position check reuses the shared scanner in `positional-scan.ts` rather
 * than growing a second one: two scanners for one prohibition drift, and the
 * `economy` spec's ban ("no economic computation MAY reference a position, a
 * distance, or a travel time") is word for word the `mage-autonomy` ban
 * applied to a different directory.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POPULACE_COHORT, POSITION_FIELD_NAMES, UNIVERSE } from '@mm/state';
import ts from 'typescript';

import { ECONOMIC_INPUTS, worshipInputs } from '../../src/index.js';

import { positionalReferences } from './positional-scan.js';
import { repoRoot } from './species-fixtures.js';
import { makeLibrary, worldState } from './universities-fixtures.js';

interface Violation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/** The two fields this package may read and must never write. */
const GOD_CURRENCY = new Set(['favor', 'worship', 'worshipTier', 'favorCap']);

/**
 * Every assignment to a god-currency field in one file.
 *
 * Exported so the controls below can feed it synthetic source — the failure
 * mode a scanner has is returning nothing for every input, and a check that
 * only ever runs against a clean tree cannot tell that apart from success.
 */
export function godCurrencyWrites(path: string, source: string): Violation[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Violation[] = [];

  const report = (node: ts.Node, name: string): void => {
    const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    found.push({ path, line: line + 1, detail: `writes "${name}", which is god-agency's` });
  };

  const visit = (node: ts.Node): void => {
    // `universe.favor = x`, and its compound forms.
    if (
      ts.isBinaryExpression(node) &&
      ts.isPropertyAccessExpression(node.left) &&
      GOD_CURRENCY.has(node.left.name.text) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      report(node, node.left.name.text);
    }
    // `set(handle, 'favor', x)` -- the component-store path.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'set'
    ) {
      for (const argument of node.arguments) {
        if (ts.isStringLiteralLike(argument) && GOD_CURRENCY.has(argument.text)) {
          report(node, argument.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

function listTypeScript(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort()) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...listTypeScript(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

const packageSources = listTypeScript(join(repoRoot, 'packages', 'rules-world', 'src')).map(
  (full) => ({
    path: relative(repoRoot, full).split(sep).join('/'),
    source: readFileSync(full, 'utf8'),
  }),
);

const economySources = packageSources.filter((file) =>
  file.path.startsWith('packages/rules-world/src/economy/'),
);

describe('the economy tracks exactly three inputs', () => {
  it('names them, so "exactly three" is countable rather than asserted in prose', () => {
    expect([...ECONOMIC_INPUTS]).toEqual(['populace', 'materials', 'knowledge-as-capital']);
    expect(ECONOMIC_INPUTS).toHaveLength(3);
  });

  it('leaves favor and worship as universe fields it never writes', () => {
    expect(Object.keys(UNIVERSE.fields)).toContain('favor');
    expect(Object.keys(UNIVERSE.fields)).toContain('worship');

    const violations = packageSources.flatMap((file) => godCurrencyWrites(file.path, file.source));
    expect(
      violations.map((violation) => `${violation.path}:${String(violation.line)} ${violation.detail}`),
    ).toEqual([]);
  });

  it('catches both shapes a write would take', () => {
    const direct = `export function pay(universe) { universe.favor = 10; }`;
    const store = `export function pay(store, handle) { store.set(handle, 'worship', 10); }`;
    expect(godCurrencyWrites('synthetic.ts', direct)).toHaveLength(1);
    expect(godCurrencyWrites('synthetic.ts', store)).toHaveLength(1);
  });

  it('leaves a read alone', () => {
    const read = `export const spendable = (universe) => universe.favor;`;
    expect(godCurrencyWrites('synthetic.ts', read)).toEqual([]);
  });
});

describe('worship inputs are exposed, not computed', () => {
  it('reports mage, university, and populace counts from an empty world', () => {
    const state = worldState();
    expect(worshipInputs(state)).toEqual({
      mages: 0,
      universities: 0,
      completedCapacity: 0,
      populace: 0,
      cohorts: 0,
    });
  });

  it('counts what is there, and produces no worship value', () => {
    const state = worldState();
    makeLibrary(state);
    const counts = worshipInputs(state);
    expect(Object.keys(counts).sort()).toEqual([
      'cohorts',
      'completedCapacity',
      'mages',
      'populace',
      'universities',
    ]);
    // The point of the assertion: no `worship` key, and no `favor` key.
    expect(Object.keys(counts)).not.toContain('worship');
    expect(Object.keys(counts)).not.toContain('favor');
  });
});

describe('the economy is position-free', () => {
  it('has files to scan', () => {
    expect(economySources.length).toBeGreaterThan(2);
  });

  it('references no position, distance, or travel time', () => {
    const violations = economySources.flatMap((file) =>
      positionalReferences(file.path, file.source),
    );
    expect(
      violations.map((violation) => `${violation.path}:${String(violation.line)} ${violation.detail}`),
    ).toEqual([]);
  });

  it('leaves the populace cohort layout without a coordinate', () => {
    for (const positional of POSITION_FIELD_NAMES) {
      expect(Object.keys(POPULACE_COHORT.fields)).not.toContain(positional);
    }
    expect(Object.keys(POPULACE_COHORT.fields)).toEqual([
      'speciesId',
      'occupation',
      'count',
      'birthTickBucket',
    ]);
  });
});
