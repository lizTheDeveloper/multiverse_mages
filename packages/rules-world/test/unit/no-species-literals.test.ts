/*
 * Multiverse Mages — species magnitudes are content, never code.
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
 * `CLAUDE.md`: *"Content — grid cells, nodes, species, primitives, traditions —
 * lives in validated data files, never hardcoded."* The `species-traits` spec
 * sharpens that to a check: *"a source file in `packages/rules-world/src`
 * contains a numeric literal keyed to a named species → the conformance check
 * fails and names the file."*
 *
 * ## Why the rule enforced here is the stricter one
 *
 * The checked rule is not "no species-keyed numeric literal" but **"no species
 * named in code at all"** inside this package's `src`. The narrow rule is the
 * one that is easy to walk around without meaning to: `if (id === 'orc') return
 * ORC_APTITUDE;` contains no numeric literal beside a species name and is
 * exactly the shape the rule exists to stop. So is a `SPECIES_TUNING` table
 * keyed by name whose values are imported constants. Once a species is nameable
 * in code, a magnitude keyed to it is one refactor away, and every one of them
 * is a number the balance harness cannot reach by editing data.
 *
 * The stricter rule also has a clean positive story: species reach the rules
 * path as interned ids and `SpeciesRecord` fields, which is how every magnitude
 * stays a data edit. A file that needs to say "dwarf" is a file that has stopped
 * being generic over species.
 *
 * **Comments are exempt, and that is not a loophole.** The trait registry
 * explains itself by naming gnomes and dwarves — the reasoning is the reason
 * anyone can review the direction of `rediscoveryAffinity`. The scan walks
 * parsed syntax rather than text, so prose is invisible to it and a species
 * mentioned in a string literal is not.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import ts from 'typescript';

import { repoRoot, wordsIn } from './species-fixtures.js';

const SPECIES_IDS = loadContent(shippedContentSource()).species.map((entry) => entry.record.id);
const SPECIES_SET = new Set(SPECIES_IDS);

interface Violation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/**
 * The species a name mentions as a **whole word**.
 *
 * Whole words rather than substrings is what keeps this check quiet enough to
 * survive. `orchestrate` contains "orc" and `elfin` contains "elf"; a substring
 * scan reports both, and a conformance check that cries wolf is one that
 * acquires a suppression comment and then means nothing.
 */
function speciesWordsIn(text: string): string[] {
  return wordsIn(text).filter((word) => SPECIES_SET.has(word));
}

/**
 * Every place a source file names a species outside a comment.
 *
 * Exported so the controls below can feed it synthetic source. A scanner that
 * can only be run against the real tree is a scanner whose "no violations"
 * result is indistinguishable from "returns nothing for every input" — the
 * failure mode `module-boundaries.test.ts` documents next door, and the reason
 * this file has as many controls as assertions.
 */
export function speciesMentions(path: string, source: string): Violation[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Violation[] = [];

  const report = (node: ts.Node, text: string, kind: string): void => {
    for (const species of speciesWordsIn(text)) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
      found.push({
        path,
        line: line + 1,
        detail: `${kind} "${text}" names the species "${species}"`,
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) report(node, node.text, 'identifier');
    else if (ts.isStringLiteralLike(node)) report(node, node.text, 'string literal');
    else if (ts.isPrivateIdentifier(node)) report(node, node.text, 'identifier');
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

const sourceFiles = listTypeScript(join(repoRoot, 'packages', 'rules-world', 'src')).map((full) => ({
  path: relative(repoRoot, full).split(sep).join('/'),
  source: readFileSync(full, 'utf8'),
}));

describe('packages/rules-world/src names no species', () => {
  it('found source to scan, so the assertion below is not vacuous', () => {
    expect(sourceFiles.length).toBeGreaterThan(2);
    expect(SPECIES_IDS).toContain('draconic');
    expect(sourceFiles.map((file) => file.path)).toContain('packages/rules-world/src/traits.ts');
  });

  it('carries no species-keyed value anywhere in the rules path', () => {
    const violations = sourceFiles.flatMap((file) => speciesMentions(file.path, file.source));
    expect(
      violations.map((violation) => `${violation.path}:${String(violation.line)} ${violation.detail}`),
      'Species magnitudes and species-specific branches belong in packages/content/data/species.json, ' +
        'which the balance harness can tune without a code change. Read the trait off SpeciesRecord ' +
        'instead of naming the species.',
    ).toEqual([]);
  });
});

describe('the species-literal check would catch a violation', () => {
  it('catches a numeric literal keyed to a named species — the spec scenario', () => {
    const violations = speciesMentions(
      'packages/rules-world/src/__probe__.ts',
      'export const APTITUDE = { dwarf: 448, orc: 192 };\n',
    );
    expect(violations.map((violation) => violation.detail)).toEqual([
      'identifier "dwarf" names the species "dwarf"',
      'identifier "orc" names the species "orc"',
    ]);
  });

  it('catches a species named in a string comparison, which carries no literal at all', () => {
    // The shape the narrow reading of the rule misses entirely.
    const violations = speciesMentions(
      'packages/rules-world/src/__probe__.ts',
      "export const isDragon = (id: string): boolean => id === 'draconic';\n",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain('draconic');
  });

  it('catches a species spelled into an identifier', () => {
    const violations = speciesMentions(
      'packages/rules-world/src/__probe__.ts',
      'export const gnomeRediscoveryBonus = 1792;\n',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain('gnome');
  });

  it('reports the file and line, as the spec requires', () => {
    const violations = speciesMentions(
      'packages/rules-world/src/__probe__.ts',
      ['export const a = 1;', 'export const b = 2;', "export const c = 'elf';"].join('\n'),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe('packages/rules-world/src/__probe__.ts');
    expect(violations[0]?.line).toBe(3);
  });

  it('ignores a species named only in prose', () => {
    // The positive control. A check that also rejected the comments explaining
    // why `rediscoveryAffinity` divides would be a check someone deletes rather
    // than satisfies — and the explanation is the more valuable artefact.
    const violations = speciesMentions(
      'packages/rules-world/src/__probe__.ts',
      [
        '/** Gnomes lead on rediscovery (vision §5); dwarves scribe. */',
        '// A dragon lives 18,000 months, which is where the hazard floors.',
        'export const NEUTRAL = 1024;',
      ].join('\n'),
    );
    expect(violations).toEqual([]);
  });

  it('does not fire on a word that merely contains a species name', () => {
    // `orchestrate` contains "orc". A check that reported it would be noise,
    // and noise is how a conformance check gets an eslint-disable.
    const violations = speciesMentions(
      'packages/rules-world/src/__probe__.ts',
      'export function orchestrate(elfin: number): number { return elfin; }\n',
    );
    expect(violations).toEqual([]);
  });
});
