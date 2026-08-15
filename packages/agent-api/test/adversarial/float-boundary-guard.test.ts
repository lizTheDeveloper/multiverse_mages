/*
 * Multiverse Mages — adversarial: how wide the float exemption actually is.
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
 * # DEFECT 6 — the "one file wide" guard catches two float shapes out of four
 *
 * One test here **fails on purpose**. The package's *source* is clean today;
 * what is broken is the thing that keeps it clean.
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `packages/agent-api` is exempt from the rules-path float ban as a whole —
 * `eslint.config.mjs` applies `CORE_SRC` and `RULES_SRC` rules and this package
 * is in neither list. `test/unit/float-boundary.test.ts` is the only thing that
 * narrows the exemption back down to `normalize.ts`, and it does so with two AST
 * predicates: a non-integer *numeric literal*, and a `/` or `/=` *binary
 * expression*.
 *
 * The rules-path ban rejects four shapes, not two. From `eslint.config.mjs`:
 *
 * - `Literal[raw=/^[0-9_]*\.[0-9_]*([eE][-+]?[0-9_]+)?$/]` — decimal literals.
 *   **Covered** by the scan.
 * - `Literal[raw=/^[0-9_]+[eE]-[0-9_]+$/]` — negative-exponent literals such as
 *   `1e-9`, which have no `.` and so do not match the scan's regex.
 *   **Not covered.**
 * - `MemberExpression[object.name='Math']:not([property.name=/^(abs|min|max|sign|imul|clz32)$/])`
 *   — every non-integer-safe member of `Math`. **Not covered.**
 * - `MemberExpression[object.name='Math'][property.name='random']`.
 *   **Not covered** (subsumed by the previous one for the ban, but the scan sees
 *   neither).
 *
 * So `const EPS = 1e-9;`, `Math.PI`, `Math.sqrt(x)` and `Math.random()` can all
 * be written into `observation.ts`, `digest.ts`, `session.ts` or `gate.ts` and
 * no tool in this repository will say a word.
 *
 * ## (b) What says otherwise
 *
 * `test/unit/float-boundary.test.ts`, stating the property it exists to
 * establish:
 *
 * > **That the exemption is one file wide.** Because the whole package is
 * > exempt, `observation.ts` — the file whose entire job is emitting integers —
 * > could grow a `0.5` and no tool anywhere would object. `normalize.ts` argues
 * > at length that it is *"the only floating-point arithmetic in the
 * > simulation"*; this is that sentence, checked. **The integer half is scanned
 * > for the same shapes the rules-path ban rejects.**
 *
 * `src/observation.ts`:
 *
 * > **This half emits integers and nothing else.**
 *
 * `src/normalize.ts`, whose whole argument rests on being the only one:
 *
 * > **# This file contains the only floating-point arithmetic in the
 * > simulation.**
 *
 * ## (c) Why the asserted value is right
 *
 * "The same shapes the rules-path ban rejects" is a checkable claim and it is
 * false as written: two of the four shapes pass. The test below states the claim
 * as a property — *some* tool in this repository objects to each of the four
 * probe sources when it appears on the integer side — and lets each probe report
 * itself. `0.5` and a `/` expression are included as controls, so a failure
 * cannot be an artefact of a scanner that reports nothing.
 *
 * The AST predicates below are transcribed from `float-boundary.test.ts` rather
 * than imported, because that file exports nothing. The two controls are what
 * verify the transcription is faithful: if either drifted, `0.5` or `a / b`
 * would stop being caught and the control would fail loudly rather than the
 * probes failing quietly.
 *
 * `Math.random` deserves separate emphasis. `CLAUDE.md`'s first constraint names
 * it by name, `sim-core`'s purity lint probes for it by name, and in this
 * package a call to it inside `candidates.ts` — which ranks the slots an agent
 * chooses between — would make every Monte Carlo run irreproducible while every
 * test in the repository stayed green.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));

const eslint = new ESLint({ cwd: repoRoot });

/** The integer side, transcribed from `test/unit/float-boundary.test.ts`. */
const INTEGER_SIDE = [
  'actions.ts',
  'agent-rng.ts',
  'candidates.ts',
  'catalogue.ts',
  'digest.ts',
  'entitlement.ts',
  'explain.ts',
  'gate.ts',
  'index.ts',
  'knowledge-census.ts',
  'layout.ts',
  'mask.ts',
  'observation.ts',
  'outcome.ts',
  'player-state.ts',
  'session.ts',
  'view.ts',
] as const;

const FLOAT_SIDE = ['normalize.ts'] as const;

function parse(name: string, source: string): ts.SourceFile {
  return ts.createSourceFile(name, source, ts.ScriptTarget.ES2022, true);
}

function nodesWhere(source: string, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parse('probe.ts', source));
  return found;
}

/** Transcribed: a non-integer numeric literal. */
function hasDecimalLiteral(source: string): boolean {
  return (
    nodesWhere(
      source,
      (node) =>
        ts.isNumericLiteral(node) &&
        /^[0-9_]*\.[0-9_]*([eE][-+]?[0-9_]+)?$/.test(node.getText()),
    ).length > 0
  );
}

/** Transcribed: a `/` or `/=` binary expression. */
function hasDivision(source: string): boolean {
  return (
    nodesWhere(
      source,
      (node) =>
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.SlashToken ||
          node.operatorToken.kind === ts.SyntaxKind.SlashEqualsToken),
    ).length > 0
  );
}

/** Every `.ts` file directly in `src/`, as `float-boundary.test.ts` discovers them. */
function flatSourceNames(): string[] {
  return readdirSync(srcDir)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

/** Every TypeScript file under `src/`, at any depth and any TS extension. */
function allTypeScriptSources(directory = srcDir, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...allTypeScriptSources(`${directory}${entry.name}/`, `${name}/`));
      continue;
    }
    if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) found.push(name);
  }
  return found.sort();
}

/** Four probes, and the two controls that prove the scanner is looking. */
const PROBES: readonly { readonly label: string; readonly source: string }[] = Object.freeze([
  { label: 'control: a decimal literal', source: 'export const chance = 0.5;\n' },
  { label: 'control: a division', source: 'export const half = (a: number) => a / 2;\n' },
  { label: 'a negative-exponent literal', source: 'export const epsilon = 1e-9;\n' },
  { label: 'a floating-point Math constant', source: 'export const turn = Math.PI;\n' },
  {
    label: 'a floating-point Math call',
    source: 'export const root = (a: number) => Math.sqrt(a);\n',
  },
  { label: 'Math.random', source: 'export const roll = () => Math.random();\n' },
]);

describe('DEFECT 6 — the integer side is only half-guarded', () => {
  it('HOLDS: eslint really does exempt this package, so the scan is the only guard', async () => {
    // The premise, checked. If eslint objected, the gap below would be closed by
    // the linter and there would be nothing to report.
    const [result] = await eslint.lintText('export const chance = 0.5;\n', {
      filePath: 'packages/agent-api/src/__adversarial-probe__.ts',
    });
    expect(result?.errorCount ?? 0).toBe(0);
  });

  it('FAILS ON PURPOSE: some tool objects to each float shape on the integer side', async () => {
    const unguarded: string[] = [];
    for (const probe of PROBES) {
      const [linted] = await eslint.lintText(probe.source, {
        // An integer-side file, by name. This is the path a real addition would
        // take, not a synthetic one.
        filePath: 'packages/agent-api/src/observation.ts',
      });
      const flagged =
        (linted?.errorCount ?? 0) > 0 || hasDecimalLiteral(probe.source) || hasDivision(probe.source);
      if (!flagged) unguarded.push(probe.label);
    }
    expect(unguarded).toEqual([]);
  });

  it('HOLDS: the controls are caught, so the scanner above is not returning nothing', () => {
    expect(hasDecimalLiteral('export const chance = 0.5;\n')).toBe(true);
    expect(hasDivision('export const half = (a: number) => a / 2;\n')).toBe(true);
    expect(hasDecimalLiteral('export const eight = 8;\n')).toBe(false);
    expect(hasDivision('export const eight = 8;\n')).toBe(false);
  });

  it('HOLDS: the rules-path ban rejects every shape the scan misses', async () => {
    // The other half of the case. "The same shapes the rules-path ban rejects"
    // is only a fair standard if the ban really rejects them, so each probe is
    // put to the linter on a rules-path filename. Division is excluded: no
    // eslint rule bans `/` anywhere — it is the AST scan's own addition, and the
    // scan does catch it, which is why it appears above only as a control.
    for (const probe of PROBES.filter((entry) => !entry.label.endsWith('a division'))) {
      const [result] = await eslint.lintText(probe.source, {
        filePath: 'packages/state/src/__adversarial-probe__.ts',
      });
      expect(result?.errorCount ?? 0, probe.label).toBeGreaterThan(0);
    }
  });
});

describe('the file enumeration held, but only because src/ happens to be flat', () => {
  it('HOLDS: every TypeScript source is accounted for at any depth and any extension', () => {
    // `float-boundary.test.ts` discovers files with a non-recursive `readdirSync`
    // filtered on `.ts`. That is correct for the tree as it stands and would
    // silently miss `src/observe/encode.ts` or `src/encode.mts`. This assertion
    // is the recursive, all-extension version of the same claim: it passes today
    // and would fail the day a subdirectory or a `.mts` appeared, which is the
    // day the original stops meaning what it says.
    expect(allTypeScriptSources()).toEqual([...INTEGER_SIDE, ...FLOAT_SIDE].sort());
  });

  it('HOLDS: the flat enumeration and the recursive one agree today', () => {
    expect(flatSourceNames()).toEqual(allTypeScriptSources());
  });

  it('HOLDS: no integer-side file contains an unguarded float shape today', () => {
    // The regression test the gap above deserves: the source is clean, and this
    // is what would notice if it stopped being. Written over the shapes the scan
    // misses, so it is additive to `float-boundary.test.ts` rather than a copy.
    const offenders: string[] = [];
    for (const basename of INTEGER_SIDE) {
      const source = readFileSync(`${srcDir}${basename}`, 'utf8');
      const exponentLiterals = nodesWhere(
        source,
        (node) => ts.isNumericLiteral(node) && /^[0-9_]+[eE]-[0-9_]+$/.test(node.getText()),
      );
      const floatingMath = nodesWhere(
        source,
        (node) =>
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'Math' &&
          !/^(?:abs|min|max|sign|imul|clz32)$/.test(node.name.text),
      );
      const computedMath = nodesWhere(
        source,
        (node) =>
          ts.isElementAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'Math',
      );
      const exponentiation = nodesWhere(
        source,
        (node) =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken,
      );
      const parseFloats = nodesWhere(
        source,
        (node) =>
          ts.isIdentifier(node) && (node.text === 'parseFloat' || node.text === 'EPSILON'),
      );
      for (const [shape, hits] of [
        ['negative-exponent literal', exponentLiterals],
        ['floating-point Math member', floatingMath],
        ['computed Math access', computedMath],
        ['** operator', exponentiation],
        ['parseFloat / Number.EPSILON', parseFloats],
      ] as const) {
        if (hits.length > 0) offenders.push(`${basename}: ${shape}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
