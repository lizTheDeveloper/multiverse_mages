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
 *
 * ## What this scan covers, and what `eslint.config.mjs` covers
 *
 * Claim 2 was false as written for as long as it stood. The scan looked for two
 * shapes — a decimal literal and a `/` — and the rules-path ban rejects four:
 * `1e-9` has no `.` and matched neither regex, and floating-point `Math`,
 * including `Math.random`, was invisible to both. An adversarial pass probed the
 * claim instead of reading it and found `Math.random()` could have been written
 * into `candidates.ts` — which ranks the slots an agent chooses between — with
 * every test in the repository staying green.
 *
 * The guard is now two tools, and the split is not arbitrary:
 *
 * - **`eslint.config.mjs`** carries the shapes that are wrong under any
 *   filename: floating-point `Math`, `Math.random`, `Number`'s float members,
 *   and negative-exponent literals. eslint sees a path and nothing else, so
 *   these are what a glob can express.
 * - **This file** carries decimal literals and `/`, which are *legal in
 *   `normalize.ts`* and illegal beside it. Telling those apart needs the
 *   enumeration below, which is a list of real source files rather than a
 *   pattern — and it is what lets the lint probes above use synthetic filenames
 *   without exempting the real ones.
 *
 * Both halves are scanned here regardless, so this file fails on its own if the
 * lint block is deleted or narrowed.
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
  // Counts, sums and set membership over integer component fields; the one
  // comparison is `mastery > best`. No division anywhere — a shelf's redundancy
  // is a count and a mage's frontier is set arithmetic, and both stay integers
  // all the way to the client, which is the only place a percentage is made.
  'academy.ts',
  'actions.ts',
  // Reads integer component fields and hands them on unchanged. The only
  // arithmetic is a subtraction (`worldTick - birthTick`) and a comparison; a
  // client turns months into years and vigor into a percentage, on its own side
  // of the boundary.
  'candidate-detail.ts',
  'candidates.ts',
  'catalogue.ts',
  'digest.ts',
  'entitlement.ts',
  'explain.ts',
  // The flow ledger, and it is integer-side for a reason worth stating rather
  // than assuming from the absence of a decimal point: every quantity in a
  // ledger is `fp` and the identity it exists to express —
  // `closing - opening == faucet - sink` — is asserted **exactly**, with no
  // tolerance, because a tolerance would hide the one-unit-per-tick leak the
  // conservation check exists to find. A division here would introduce exactly
  // the rounding that assertion refuses. The client divides by 1024; this side
  // does not.
  'flow.ts',
  'gate.ts',
  'index.ts',
  'knowledge-census.ts',
  'layout.ts',
  'mask.ts',
  'observation.ts',
  'outcome.ts',
  'player-state.ts',
  'agent-rng.ts',
  'session.ts',
  'view.ts',
] as const;

/** The one file §4.1 licenses to divide. */
const FLOAT_SIDE = ['normalize.ts'] as const;

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * Every TypeScript source under `packages/agent-api/src`, at any depth.
 *
 * Recursive, and matching every TypeScript extension rather than `.ts` alone.
 * The flat `readdirSync(...).filter(endsWith('.ts'))` this replaces was correct
 * for the tree as it stands and silently wrong for the tree of the first day
 * somebody adds `src/observe/encode.ts` or `src/encode.mts` — a file in neither
 * list is the whole point of the assertion below, and a file the enumeration
 * never saw is in neither list without anybody deciding.
 */
function sourceFileNames(directory = SRC_DIR, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...sourceFileNames(`${directory}${entry.name}/`, `${name}/`));
      continue;
    }
    if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) found.push(name);
  }
  return found.sort();
}

function sourceOf(basename: string): string {
  return readFileSync(`${SRC_DIR}${basename}`, 'utf8');
}

/** Every node in a file's AST satisfying `predicate`, as `basename:line`. */
function nodesWhere(basename: string, predicate: (node: ts.Node) => boolean): string[] {
  const parsed = ts.createSourceFile(basename, sourceOf(basename), ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${basename}:${String(line + 1)} ${node.getText()}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/**
 * The float shapes the rules-path ban rejects that a decimal-literal regex does
 * not see, transcribed from `eslint.config.mjs` selector by selector.
 *
 * Duplicated with the lint block on purpose. The lint block is what stops a bad
 * commit; this is what notices if the lint block stops matching this package,
 * which a lint block cannot report about itself.
 */
const UNSEEN_FLOAT_SHAPES: readonly (readonly [string, (node: ts.Node) => boolean])[] = [
  [
    'negative-exponent literal',
    (node) => ts.isNumericLiteral(node) && /^[0-9_]+[eE]-[0-9_]+$/.test(node.getText()),
  ],
  [
    'floating-point Math member',
    (node) =>
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Math' &&
      !/^(?:abs|min|max|sign|imul|clz32)$/.test(node.name.text),
  ],
  [
    'computed Math access',
    (node) =>
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Math',
  ],
  [
    '** operator',
    (node) =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken,
  ],
  [
    'parseFloat or Number.EPSILON',
    (node) => ts.isIdentifier(node) && (node.text === 'parseFloat' || node.text === 'EPSILON'),
  ],
];

/** Non-integer numeric literals in a file, as `basename:line text`. */
function decimalLiterals(basename: string): string[] {
  return nodesWhere(
    basename,
    (node) =>
      ts.isNumericLiteral(node) && /^[0-9_]*\.[0-9_]*([eE][-+]?[0-9_]+)?$/.test(node.getText()),
  );
}

/** Divisions in a file. Fixed-point division is `div()`. */
function divisions(basename: string): string[] {
  return nodesWhere(
    basename,
    (node) =>
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.SlashToken ||
        node.operatorToken.kind === ts.SyntaxKind.SlashEqualsToken),
  );
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

  it.each(INTEGER_SIDE)('keeps %s free of the float shapes a decimal regex misses', (basename) => {
    // `1e-9`, `Math.PI`, `Math[name]`, `**` and `parseFloat` are all rejected by
    // the rules-path ban and all invisible to the two scans above. The claim
    // this file makes is *"the same shapes the rules-path ban rejects"*, and for
    // a long time it checked half of them.
    for (const [shape, predicate] of UNSEEN_FLOAT_SHAPES) {
      expect(nodesWhere(basename, predicate), `${basename}: ${shape}`).toEqual([]);
    }
  });

  it('finds each unseen shape when it is there, so this scan is not looking at nothing', () => {
    // The positive control for the scan above, on synthetic sources rather than
    // on a real file — the real files are clean, which is what makes a control
    // necessary.
    const probes = [
      'export const epsilon = 1e-9;\n',
      'export const turn = Math.PI;\n',
      'export const pick = (k: string) => Math[k];\n',
      'export const square = (a: number) => a ** 2;\n',
      'export const read = (s: string) => parseFloat(s);\n',
    ];
    for (const [index, [shape, predicate]] of UNSEEN_FLOAT_SHAPES.entries()) {
      const source = probes[index] as string;
      const parsed = ts.createSourceFile('probe.ts', source, ts.ScriptTarget.ES2022, true);
      let hits = 0;
      const visit = (node: ts.Node): void => {
        if (predicate(node)) hits += 1;
        ts.forEachChild(node, visit);
      };
      visit(parsed);
      expect(hits, shape).toBeGreaterThan(0);
    }
  });

  it('has eslint reject every one of those shapes on an integer-side file', async () => {
    // The other half of the guard, asserted from this side so that narrowing the
    // agent-api block in eslint.config.mjs fails a test here rather than
    // silently re-opening the hole. Decimal literals and `/` are excluded: they
    // are legal in normalize.ts, eslint sees only a path, and the scans above
    // are what tell the two apart.
    for (const source of [
      'export const epsilon = 1e-9;\n',
      'export const turn = Math.PI;\n',
      'export const root = (a: number) => Math.sqrt(a);\n',
      'export const roll = () => Math.random();\n',
      'export const tiny = Number.EPSILON;\n',
    ]) {
      const [result] = await eslint.lintText(source, {
        filePath: 'packages/agent-api/src/observation.ts',
      });
      expect(result?.errorCount ?? 0, source.trim()).toBeGreaterThan(0);
    }
  });

  it('still lets normalize.ts divide, and still refuses it a random draw', async () => {
    const [dividing] = await eslint.lintText('export const half = (a: number) => a / 2;\n', {
      filePath: 'packages/agent-api/src/normalize.ts',
    });
    expect(dividing?.errorCount ?? 0).toBe(0);

    const [rolling] = await eslint.lintText('export const roll = () => Math.random();\n', {
      filePath: 'packages/agent-api/src/normalize.ts',
    });
    // §4.1 licenses the division, not the nondeterminism: an observation drawn
    // from a random number is irreproducible whichever side of the boundary the
    // draw happens on.
    expect(rolling?.errorCount ?? 0).toBeGreaterThan(0);
  });
});
