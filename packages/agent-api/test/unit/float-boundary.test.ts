/*
 * Multiverse Mages — the float boundary, asserted from both of its sides.
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
 * `agent-interface` task 1.9: *"Verify the float-ban lint still passes over
 * `sim-core` and the rules packages after `agent-api` lands."*
 *
 * Half of that is already covered next door — `sim-core/test/unit/purity-lint.
 * test.ts` probes every rules-path package by name and asserts a decimal
 * literal, `Math.random` and floating-point `Math` are all rejected in each. Two
 * things it does not cover, both of which this change makes newly load-bearing:
 *
 * 1. **That the exemption is real.** `agent-api` is outside `RULES_SRC` so that
 *    §4.1's `Float64Array` export can exist at all. Nothing asserted that, so a
 *    tightening of the glob that swept this package into the ban would have
 *    broken the observation export with a lint error nobody expected — or, far
 *    worse, an exemption accidentally *widened* to a rules package would look
 *    exactly like this one and nothing would say so. The boundary is only a
 *    boundary if both sides of it are checked.
 *
 * 2. **That the exemption is one file wide.** Because the whole package is
 *    exempt, `observation.ts` — the file whose entire job is emitting integers —
 *    could grow a `0.5` and no tool anywhere would object. `normalize.ts` argues
 *    at length that it is *"the only floating-point arithmetic in the
 *    simulation"*; this is that sentence, checked. The integer half is scanned
 *    for the same shapes the rules-path ban rejects.
 *
 * The scan is over syntax, not text, for the reason `module-boundaries.test.ts`
 * gives: this very file contains the string `0.5` inside a lint probe, and a
 * regex would report itself.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** From packages/agent-api/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const eslint = new ESLint({ cwd: repoRoot });

/**
 * Files in this package that must stay integer-only, and the one that must not.
 *
 * Enumerated rather than globbed. A new source file is a deliberate decision
 * about which side of the boundary it sits on, and a glob would silently put it
 * on whichever side the pattern happened to catch. The assertion below fails on
 * a file that is in neither list, which is what forces the decision to be made.
 */
const INTEGER_SIDE = [
  'actions.ts',
  'candidates.ts',
  'catalogue.ts',
  'digest.ts',
  'explain.ts',
  'gate.ts',
  'index.ts',
  'layout.ts',
  'mask.ts',
  'observation.ts',
  'outcome.ts',
  'view.ts',
] as const;

/** The one file §4.1 licenses to divide. */
const FLOAT_SIDE = ['normalize.ts'] as const;

/** Every `.ts` file in `packages/agent-api/src`, by basename. */
function sourceFileNames(): string[] {
  return readdirSync(fileURLToPath(new URL('../../src/', import.meta.url)))
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

function sourceOf(basename: string): string {
  return readFileSync(fileURLToPath(new URL(`../../src/${basename}`, import.meta.url)), 'utf8');
}

/** Non-integer numeric literals in a file, as `line:text`. */
function decimalLiterals(basename: string): string[] {
  const source = sourceOf(basename);
  const parsed = ts.createSourceFile(basename, source, ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node) && /^[0-9_]*\.[0-9_]*([eE][-+]?[0-9_]+)?$/.test(node.getText())) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${basename}:${String(line + 1)} ${node.getText()}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/** Divisions in a file, as `line:text`. Fixed-point division is `div()`. */
function divisions(basename: string): string[] {
  const source = sourceOf(basename);
  const parsed = ts.createSourceFile(basename, source, ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.SlashToken ||
        node.operatorToken.kind === ts.SyntaxKind.SlashEqualsToken)
    ) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${basename}:${String(line + 1)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

describe('the float ban still holds everywhere it is supposed to', () => {
  it('rejects a decimal literal in a rules-path package', async () => {
    // The control for the exemption below: the ban is live, so an accepted
    // float in agent-api means "exempt", not "the linter is off".
    const [result] = await eslint.lintText('export const chance = 0.5;\n', {
      filePath: 'packages/state/src/__lint-probe__.ts',
    });
    expect(result?.errorCount ?? 0).toBeGreaterThan(0);
  });

  it('rejects a decimal literal in sim-core', async () => {
    const [result] = await eslint.lintText('export const chance = 0.5;\n', {
      filePath: 'packages/sim-core/src/__lint-probe__.ts',
    });
    expect(result?.errorCount ?? 0).toBeGreaterThan(0);
  });

  it('accepts one in agent-api, because §4.1 makes this the export boundary', async () => {
    const [result] = await eslint.lintText('export const unity = 1.0;\n', {
      filePath: 'packages/agent-api/src/__lint-probe__.ts',
    });
    expect(result?.errorCount ?? 0).toBe(0);
  });

  it('lints the real source of this package clean', async () => {
    const results = await eslint.lintFiles(['packages/agent-api/src/**/*.ts']);
    expect(results.length).toBeGreaterThan(0);
    expect(results.flatMap((result) => result.messages.map((m) => m.message))).toEqual([]);
  });
});

describe('the exemption is one file wide', () => {
  it('accounts for every source file as integer-side or float-side', () => {
    // A new file lands in neither list until somebody decides. That decision is
    // the whole content of §4.1's boundary, and it is not one to make by
    // pattern-matching a filename.
    expect(sourceFileNames().sort()).toEqual([...INTEGER_SIDE, ...FLOAT_SIDE].sort());
  });

  it.each(INTEGER_SIDE)('keeps %s free of non-integer literals', (basename) => {
    expect(decimalLiterals(basename)).toEqual([]);
  });

  it.each(INTEGER_SIDE)('keeps %s free of division', (basename) => {
    // `/` on integers truncates toward zero in neither direction usefully and,
    // on anything else, is the float. The rules path has `floorDiv` and `div`;
    // this side of the boundary should be reaching for those or for nothing.
    expect(divisions(basename)).toEqual([]);
  });

  it('finds the float in normalize.ts, so the scan is not looking at nothing', () => {
    // The positive control. Without it, a scanner that returned an empty array
    // for every file would pass every assertion above.
    expect(divisions('normalize.ts').length).toBeGreaterThan(0);
  });
});
