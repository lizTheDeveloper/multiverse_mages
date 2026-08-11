/*
 * Multiverse Mages — the shared scanner for positional references.
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
 * `contracts.md` §0 and vision §7a: world-scale entities have no coordinates.
 * Two capabilities restate that ban for their own directories in almost the
 * same words — `mage-autonomy`'s *"Autonomy is position-free"* and `economy`'s
 * *"No distance in the economy path"* — so they share one scanner.
 *
 * Sharing it is the point. Two scanners for one prohibition drift: one acquires
 * a word the other lacks, and thereafter the two directories are held to
 * different standards for a rule that is written once.
 *
 * It lives in a fixture rather than in one of the two test files because
 * importing a test module to reuse a helper re-runs that module's suites, which
 * inflates every count and hides which file a failure came from.
 */

import { POSITION_FIELD_NAMES } from '@mm/state';
import ts from 'typescript';

import { wordsIn } from './species-fixtures.js';

export interface PositionalViolation {
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
export function positionalWordsIn(text: string): string[] {
  return wordsIn(text).filter((word) => POSITIONAL_WORDS.has(word));
}

/**
 * Every place a source file reaches for a position, outside a comment.
 *
 * Exported so the controls below can feed it synthetic source: a scanner that
 * can only run against the real tree has a "no violations" result that is
 * indistinguishable from one that returns nothing for every input.
 */
export function positionalReferences(path: string, source: string): PositionalViolation[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: PositionalViolation[] = [];

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

