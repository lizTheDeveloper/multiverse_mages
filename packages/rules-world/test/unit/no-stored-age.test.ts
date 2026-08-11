/*
 * Multiverse Mages — no component stores an age, an age band, a death tick, or
 * an effective lifespan.
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
 * `docs/design/contracts.md` §1.2: *"age is derived, never stored"*. The
 * `mage-lifecycle` spec widens that to four quantities — an age, an age band, a
 * death tick, and an effective lifespan — and makes it a conformance check
 * rather than a review note.
 *
 * ## Why the check reads component *layouts* and not all identifiers
 *
 * The rule §1.2 states is about state, not about locals: `const age =
 * ageInMonths(...)` is the sanctioned way to use an age and appears all over
 * this package. What must not exist is a *field* — something a snapshot
 * serializes, a migration carries forward, and a second code path can forget to
 * update. So the scan looks for the one syntactic shape that creates one: a
 * property inside a `fields: { … }` object, which is what
 * `ComponentSpec` is.
 *
 * That is narrower than "no identifier mentions age" and much narrower than a
 * text search, and it is narrow *on purpose*. A conformance check that fires on
 * `ageInMonths` is a check that acquires a suppression comment within a week,
 * and thereafter enforces nothing at all.
 *
 * ## Why it also reads the shipped mage layout directly
 *
 * The scanner proves nothing if it happens to be looking at the wrong files, so
 * the spec's own scenario — *"the mage component layout contains `birthTick`
 * and no age, age-band, death-tick, or effective-lifespan field"* — is asserted
 * against the imported `MAGE` spec as well, where there is no parsing to be
 * wrong about.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAGE, POPULACE_COHORT } from '@mm/state';
import ts from 'typescript';

import { repoRoot, wordsIn } from './species-fixtures.js';

interface StoredAge {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/**
 * Field names that would make one of the four derived quantities into state.
 *
 * Matched on whole words rather than substrings, for the reason the species
 * scanner next door gives: `damage` contains "age", and a check that reported
 * it would be noise.
 */
function bannedFieldReason(name: string): string | undefined {
  const words = new Set(wordsIn(name));
  if (words.has('age')) return 'stores an age or an age band; age is derived from birthTick (§1.2)';
  if (words.has('lifespan')) {
    return 'stores a lifespan; the effective lifespan is recomputed at each hazard evaluation (§3)';
  }
  if (words.has('death') || words.has('died') || words.has('dies')) {
    return 'stores a death; mortality is a per-tick hazard, never a scheduled date';
  }
  if (words.has('senescence') || words.has('senescent')) {
    return 'stores an age band under another name; bands are derived from normalized age';
  }
  return undefined;
}

/**
 * Every component field in a source file whose name stores a derived quantity.
 *
 * Exported so the controls below can feed it synthetic source. A scanner that
 * can only run against the real tree is one whose "no violations" result is
 * indistinguishable from "returns nothing for every input".
 */
export function storedAgeFields(path: string, source: string): StoredAge[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: StoredAge[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'fields' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        const name = property.name;
        if (name === undefined) continue;
        const text = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
        if (text === undefined) continue;
        const reason = bannedFieldReason(text);
        if (reason !== undefined) {
          const { line } = parsed.getLineAndCharacterOfPosition(property.getStart(parsed));
          found.push({ path, line: line + 1, detail: `field "${text}" ${reason}` });
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

/** Every package that may declare a component: the state schema and the rules packages. */
const SCANNED = ['state', 'rules-world', 'rules-magic', 'rules-raid'];

const sourceFiles = SCANNED.flatMap((pkg) =>
  listTypeScript(join(repoRoot, 'packages', pkg, 'src')).map((full) => ({
    path: relative(repoRoot, full).split(sep).join('/'),
    source: readFileSync(full, 'utf8'),
  })),
);

describe('no component stores a derived age', () => {
  it('found source to scan, so the assertion below is not vacuous', () => {
    expect(sourceFiles.length).toBeGreaterThan(4);
    expect(sourceFiles.map((file) => file.path)).toContain('packages/state/src/components.ts');
  });

  it('finds no stored age, age band, death tick, or effective lifespan', () => {
    const violations = sourceFiles.flatMap((file) => storedAgeFields(file.path, file.source));
    expect(
      violations.map((v) => `${v.path}:${String(v.line)} ${v.detail}`),
      'contracts.md §1.2 derives age from birthTick and §3 recomputes lifespan effects at each ' +
        'hazard evaluation. A stored copy is a second source of truth that a snapshot preserves ' +
        'and a migration carries forward — use ageInMonths() and effectiveLifespan().',
    ).toEqual([]);
  });
});

describe('the shipped layouts say the same thing without any parsing', () => {
  it('gives a mage a birthTick and nothing derived from it', () => {
    const fields = Object.keys(MAGE.fields);
    expect(fields).toContain('birthTick');
    for (const field of fields) {
      expect(bannedFieldReason(field), `mage field "${field}"`).toBeUndefined();
    }
  });

  it('gives a populace cohort a birth bucket and no age', () => {
    const fields = Object.keys(POPULACE_COHORT.fields);
    expect(fields).toContain('birthTickBucket');
    for (const field of fields) {
      expect(bannedFieldReason(field), `cohort field "${field}"`).toBeUndefined();
    }
  });
});

describe('the stored-age check would catch a violation', () => {
  const probe = 'packages/rules-world/src/__probe__.ts';

  it('catches an age field on a component', () => {
    const violations = storedAgeFields(
      probe,
      "export const M = { name: 'm', fields: { birthTick: 'i32', age: 'i32' } } as const;\n",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain('"age"');
  });

  it('catches an age band under its own name', () => {
    const violations = storedAgeFields(
      probe,
      "export const M = { name: 'm', fields: { ageBand: 'u8' } } as const;\n",
    );
    expect(violations).toHaveLength(1);
  });

  it('catches a scheduled death tick', () => {
    const violations = storedAgeFields(
      probe,
      "export const M = { name: 'm', fields: { deathTick: 'i32' } } as const;\n",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain('per-tick hazard');
  });

  it('catches a cached effective lifespan', () => {
    const violations = storedAgeFields(
      probe,
      "export const M = { name: 'm', fields: { effectiveLifespanMonths: 'i32' } } as const;\n",
    );
    expect(violations).toHaveLength(1);
  });

  it('reports the file and the line', () => {
    const violations = storedAgeFields(
      probe,
      ['export const M = {', "  name: 'm',", '  fields: {', "    age: 'i32',", '  },', '};'].join(
        '\n',
      ),
    );
    expect(violations[0]?.path).toBe(probe);
    expect(violations[0]?.line).toBe(4);
  });

  it('ignores a local variable, a parameter, and a function that computes an age', () => {
    // The positive control that keeps this check usable. Deriving an age is the
    // sanctioned behaviour; the rule is about fields.
    const violations = storedAgeFields(
      probe,
      [
        'export function ageInMonths(worldTick: number, birthTick: number): number {',
        '  const age = worldTick - birthTick;',
        '  return age;',
        '}',
        'export interface HazardInput { effectiveLifespanMonths: number }',
      ].join('\n'),
    );
    expect(violations).toEqual([]);
  });

  it('does not fire on a field whose name merely contains the letters', () => {
    const violations = storedAgeFields(
      probe,
      "export const M = { name: 'm', fields: { damage: 'i32', storage: 'u8' } } as const;\n",
    );
    expect(violations).toEqual([]);
  });
});
