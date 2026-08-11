/*
 * Multiverse Mages — the utility-AI accesses no position and computes no
 * distance.
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
 * `mages-and-species/design.md` says why this is a check rather than a
 * convention: *"a utility-AI is precisely the system whose author reaches for
 * 'how far away is it' without noticing that the answer would require giving
 * every mage a coordinate. The prohibition is specified as a conformance check,
 * not a convention."*
 *
 * ## What is scanned, and what deliberately is not
 *
 * The scan walks parsed syntax, like its two neighbours (`no-species-literals`
 * and `no-stored-age`), so comments and doc prose are invisible to it. That
 * matters here more than it does next door: half of `outlook.ts` is an argument
 * about why there is no position in it, and a text search would report the
 * argument as the violation.
 *
 * It reports on:
 *
 * - **property access and property names** — `something.x`, `{ y: … }`,
 *   `distance`, `travelTime`. This is the shape a position enters through.
 * - **identifiers naming a distance or a journey** — `distanceTo`, `travel`,
 *   `nearest`, `proximity`. `nearest` is included because "the nearest
 *   available teacher" is the sentence the design note predicts, and it can be
 *   written without the word "distance" appearing anywhere.
 *
 * It does **not** report on `Math.sqrt` or arithmetic shapes, because a
 * conformance check that fires on arithmetic is one that acquires a suppression
 * comment within a week and thereafter enforces nothing.
 *
 * ## And it is asserted against the structure too
 *
 * A scanner proves nothing if it is pointed at the wrong directory, so the
 * spec's own claim — that the record the scoring path reads has no coordinate —
 * is asserted directly against a constructed `MageOutlook`, where there is no
 * parsing to be wrong about.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSITION_FIELD_NAMES } from '@mm/state';
import ts from 'typescript';

import { richOutlook } from './autonomy-fixtures.js';
import { repoRoot, wordsIn } from './species-fixtures.js';

interface Violation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/** Whole words that mean a place, a gap between places, or a trip between them. */
const POSITIONAL_WORDS = new Set([
  ...POSITION_FIELD_NAMES,
  'position',
  'coordinate',
  'coordinates',
  'distance',
  'distances',
  'nearest',
  'nearby',
  'proximity',
  'travel',
  'journey',
  'adjacency',
  'metres',
  'meters',
]);

/**
 * The positional words a name uses, as whole words.
 *
 * Whole words for the reason the species scanner gives: `maxVigor` contains no
 * position and `context` contains no coordinate, but a substring scan on "x"
 * would report every identifier in the directory. `POSITION_FIELD_NAMES` — the
 * two single letters §0 names — are only ever matched as complete words.
 */
function positionalWordsIn(text: string): string[] {
  return wordsIn(text).filter((word) => POSITIONAL_WORDS.has(word));
}

/**
 * Every place a source file reaches for a position, outside a comment.
 *
 * Exported so the controls below can feed it synthetic source: a scanner that
 * can only run against the real tree has a "no violations" result that is
 * indistinguishable from one that returns nothing for every input.
 */
export function positionalReferences(path: string, source: string): Violation[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Violation[] = [];

  const report = (node: ts.Node, text: string, kind: string): void => {
    for (const word of positionalWordsIn(text)) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
      found.push({ path, line: line + 1, detail: `${kind} "${text}" names "${word}"` });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) report(node.name, node.name.text, 'property access');
    else if (ts.isPropertySignature(node) && ts.isIdentifier(node.name)) {
      report(node.name, node.name.text, 'property');
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      report(node.name, node.name.text, 'property');
    } else if (ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node.parent)) {
      report(node, node.text, 'identifier');
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

const autonomyDirectory = join(repoRoot, 'packages', 'rules-world', 'src', 'autonomy');
const sourceFiles = listTypeScript(autonomyDirectory).map((full) => ({
  path: relative(repoRoot, full).split(sep).join('/'),
  source: readFileSync(full, 'utf8'),
}));

describe('the autonomy module is position-free', () => {
  it('has files to scan, so a pass is not an empty walk', () => {
    expect(sourceFiles.length).toBeGreaterThan(5);
  });

  it('names no position, distance, or travel anywhere in the directory', () => {
    const violations = sourceFiles.flatMap((file) => positionalReferences(file.path, file.source));
    expect(
      violations.map((violation) => `${violation.path}:${String(violation.line)} ${violation.detail}`),
    ).toEqual([]);
  });

  it('ignores the prose, which argues about positions at length', () => {
    const commented = `
      /** A mage does not travel; the distance to a university is not a thing. */
      // nearest, proximity, x, y
      export const NOTHING = 1;
    `;
    expect(positionalReferences('synthetic.ts', commented)).toEqual([]);
  });

  it('catches a coordinate read, a distance helper, and a travel field', () => {
    const offending = `
      interface Bad { travelTime: number }
      export function pick(a: { x: number }, b: { x: number }): number {
        return a.x - b.x;
      }
      export const nearestTeacher = 3;
    `;
    const found = positionalReferences('synthetic.ts', offending);
    const details = found.map((violation) => violation.detail).join(' | ');
    expect(details).toContain('travelTime');
    expect(details).toContain('"x"');
    expect(details).toContain('nearestTeacher');
  });
});

describe('the record the scoring path reads has no coordinate', () => {
  it('carries neither of the two field names §0 names', () => {
    const fields = Object.keys(richOutlook());
    for (const positional of POSITION_FIELD_NAMES) {
      expect(fields).not.toContain(positional);
    }
  });

  it('carries nothing whose name means a place or a gap between places', () => {
    for (const field of Object.keys(richOutlook())) {
      expect(positionalWordsIn(field)).toEqual([]);
    }
  });
});
