/*
 * Multiverse Mages — every division by a lifespan is accounted for.
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
 * `docs/design/contracts.md` §3: *"Any rate of the form `X / lifespanMonths`
 * computes at extended scale before narrowing."* `mages-and-species` task 4.5
 * turns the second half of that sentence into an obligation — the helper must
 * be **required** wherever such a rate is computed, not merely available — and
 * an obligation with no mechanism is a comment.
 *
 * ## Why this is an allowlist and not a ban
 *
 * The tempting check is "no `floorDiv` whose denominator is a lifespan". It is
 * wrong, and wrong in a way that would have quietly forced the code into a
 * worse shape: `normalizedAge` divides an age by a lifespan and is *supposed*
 * to, because a ratio is not a per-tick rate. A dragon seventeen months old
 * genuinely is at normalized age zero, and there is nothing to widen.
 *
 * So the check reports **every** division by a lifespan and compares the set
 * against a committed allowlist, each entry carrying the reason it is exempt. A
 * new one fails the build with the reason it needs to supply; the two entries
 * that exist today say, in the file, why they are not the defect. That is the
 * form that survives the next task group adding cohort mortality (task 3.8),
 * which divides by a lifespan too and must use the helper.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import ts from 'typescript';

import { repoRoot, wordsIn } from './species-fixtures.js';

/** Division helpers whose denominator this check inspects. */
const DIVIDERS = new Set(['floorDiv', 'div']);

/** The one call that is the sanctioned way to divide by a lifespan. */
const SANCTIONED = 'perLifespanRate';

interface Division {
  readonly path: string;
  readonly line: number;
  /** The nearest enclosing named function, or `<module>`. */
  readonly inFunction: string;
  readonly text: string;
}

/** Whether an expression mentions a lifespan as a whole word. */
function mentionsLifespan(node: ts.Node, source: ts.SourceFile): boolean {
  return wordsIn(node.getText(source)).includes('lifespan');
}

/**
 * Every division by a lifespan-named denominator, outside {@link SANCTIONED}.
 *
 * Exported so the controls below can feed it synthetic source.
 */
export function lifespanDivisions(path: string, source: string): Division[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Division[] = [];
  const scope: string[] = [];

  const visit = (node: ts.Node): void => {
    let pushed = false;
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      scope.push(node.name === undefined ? '<anonymous>' : node.name.getText(parsed));
      pushed = true;
    } else if (ts.isVariableDeclaration(node) && node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      scope.push(node.name.getText(parsed));
      pushed = true;
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const denominator = node.arguments[1];
      if (DIVIDERS.has(callee) && denominator !== undefined && mentionsLifespan(denominator, parsed)) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        found.push({
          path,
          line: line + 1,
          inFunction: scope[scope.length - 1] ?? '<module>',
          text: node.getText(parsed).replace(/\s+/gu, ' '),
        });
      }
    }

    // `a / b` written out, which no rules-path file should contain at all but
    // which is the obvious way to reintroduce the defect past a call-shaped
    // check.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.SlashToken &&
      mentionsLifespan(node.right, parsed)
    ) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
      found.push({
        path,
        line: line + 1,
        inFunction: scope[scope.length - 1] ?? '<module>',
        text: node.getText(parsed).replace(/\s+/gu, ' '),
      });
    }

    ts.forEachChild(node, visit);
    if (pushed) scope.pop();
  };

  visit(parsed);
  return found;
}

/**
 * The divisions by a lifespan that are known and justified.
 *
 * Keyed on `path::function`, because a file-level exemption would let a second,
 * unrelated division hide behind the first one's reason.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'packages/rules-world/src/lifespan-rate.ts::perLifespanRate':
    'The helper itself. Its numerator is pre-shifted by 2^10 before this division, which is the ' +
    'whole point.',
  'packages/rules-world/src/lifespan-rate.ts::naivePerLifespanRate':
    'The named defect, kept in the repository so a test can demonstrate it rather than describe ' +
    'it. Nothing on the rules path may call it.',
  'packages/rules-world/src/lifespan-rate.ts::narrowToFixed':
    'Divides by the scale constant LIFESPAN_RATE_SHIFT, not by a lifespan — the scan matches on ' +
    'the name and cannot tell the two apart. Kept as an entry rather than tuned out of the ' +
    'matcher, because narrowing an extended-scale rate back to fp *is* the operation that ' +
    'reintroduces the defect, and a reader who lands here should find it named rather than ' +
    'silently filtered.',
  'packages/rules-world/src/mages/age.ts::normalizedAge':
    'A dimensionless ratio, not a per-tick rate. Flooring is correct here: a dragon seventeen ' +
    'months into an 18,000-month life really is at normalized age zero.',
};

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

describe('every division by a lifespan is accounted for', () => {
  it('found source to scan, so the assertion below is not vacuous', () => {
    expect(sourceFiles.map((file) => file.path)).toContain(
      'packages/rules-world/src/lifespan-rate.ts',
    );
    expect(sourceFiles.map((file) => file.path)).toContain('packages/rules-world/src/mages/age.ts');
  });

  it('finds the allowlisted call sites, so the allowlist is not stale', () => {
    const observed = new Set(
      sourceFiles
        .flatMap((file) => lifespanDivisions(file.path, file.source))
        .map((division) => `${division.path}::${division.inFunction}`),
    );
    for (const key of Object.keys(ALLOWED)) {
      expect(observed, `${key} is allowlisted but no longer exists`).toContain(key);
    }
  });

  it('finds no unjustified division by a lifespan', () => {
    const violations = sourceFiles
      .flatMap((file) => lifespanDivisions(file.path, file.source))
      .filter((division) => ALLOWED[`${division.path}::${division.inFunction}`] === undefined);
    expect(
      violations.map((v) => `${v.path}:${String(v.line)} in ${v.inFunction}: ${v.text}`),
      `contracts.md §3 requires any per-tick rate of the form X / lifespanMonths to be computed ` +
        `through ${SANCTIONED}(), at extended scale. At fp scale the same division floors to zero ` +
        'for four of the six shipped species and they become silently immortal. If this division ' +
        'is a ratio rather than a rate, add it to ALLOWED in this file with the reason.',
    ).toEqual([]);
  });
});

describe('the lifespan-division check would catch a violation', () => {
  const probe = 'packages/rules-world/src/__probe__.ts';

  it('catches the naive shape, which is the defect', () => {
    const divisions = lifespanDivisions(
      probe,
      [
        'export function hazard(h: number, lifespanMonths: number): number {',
        '  return floorDiv(h, lifespanMonths);',
        '}',
      ].join('\n'),
    );
    expect(divisions).toHaveLength(1);
    expect(divisions[0]?.inFunction).toBe('hazard');
  });

  it('catches it through the fixed-point helper too', () => {
    const divisions = lifespanDivisions(
      probe,
      'export const r = (h: number, effectiveLifespan: number) => div(h, effectiveLifespan);\n',
    );
    expect(divisions).toHaveLength(1);
    expect(divisions[0]?.inFunction).toBe('r');
  });

  it('catches a bare slash, which a call-shaped check would miss', () => {
    const divisions = lifespanDivisions(
      probe,
      'export const r = (h: number, lifespanMonths: number) => h / lifespanMonths;\n',
    );
    expect(divisions).toHaveLength(1);
  });

  it('does not fire on the sanctioned helper', () => {
    const divisions = lifespanDivisions(
      probe,
      [
        'export function hazard(h: number, lifespanMonths: number): number {',
        `  return ${SANCTIONED}(h, lifespanMonths);`,
        '}',
      ].join('\n'),
    );
    expect(divisions).toEqual([]);
  });

  it('does not fire on a division by something that is not a lifespan', () => {
    const divisions = lifespanDivisions(
      probe,
      'export const half = (x: number) => floorDiv(x, 2);\n',
    );
    expect(divisions).toEqual([]);
  });

  it('does not fire on prose mentioning a lifespan', () => {
    const divisions = lifespanDivisions(
      probe,
      [
        '/** A draconic lifespan of 18,000 months floors to zero at fp scale. */',
        'export const half = (x: number) => floorDiv(x, 2);',
      ].join('\n'),
    );
    expect(divisions).toEqual([]);
  });
});
