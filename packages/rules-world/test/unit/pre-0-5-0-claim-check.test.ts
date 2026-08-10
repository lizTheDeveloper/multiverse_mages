/*
 * Multiverse Mages — no test may claim a species magnitude is balanced yet.
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
 * `docs/design/release-plan.md` pivots on one rule: **releases 0.1.0 through
 * 0.4.0 can only make mechanical claims**, because there is no balance harness
 * until 0.5.0 and no measurement to disprove a balance claim with. The
 * `species-traits` spec turns that into a check: *"a test asserts a target win
 * rate, fairness property, or balance band over species traits → the pre-0.5.0
 * claim check fails."*
 *
 * ## Why a test that fails other tests
 *
 * Every species magnitude in this change is a placeholder somebody guessed. The
 * failure mode is not that a guess is wrong — it is that a guess acquires a
 * green test around it, and a green test reads as evidence. Six months later
 * the number is load-bearing for a suite nobody wants to break, and the balance
 * harness arrives to find its conclusions pre-committed. `release-plan.md`'s
 * whole point is that a claim needs a measurement that could disprove it, and
 * before 0.5.0 that measurement does not exist.
 *
 * The check is deliberately narrow: it fires only where a *balance* vocabulary
 * and a *species* vocabulary meet inside one assertion. Differentiation
 * assertions — "these two species differ", "this trait is higher than that one"
 * — are mechanical and explicitly permitted; they are the 0.4.0 claim. Balance
 * vocabulary elsewhere is fine too, and there is plenty of it: the repository is
 * full of comments and diagnostics that explain what a balance baseline is.
 * Requiring the two to co-occur inside a single `expect()` is what separates
 * "this test asserts species are fair" from "this test mentions fairness".
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import ts from 'typescript';

import { repoRoot, wordsIn } from './species-fixtures.js';

const SPECIES_IDS = loadContent(shippedContentSource()).species.map((entry) => entry.record.id);

/**
 * Words that name a property only the balance harness can measure.
 *
 * Every one is either a metric from `contracts.md` §7 or the vocabulary
 * `release-plan.md` uses for the claims it forbids before 0.5.0. Deliberately
 * not "differ", "greater", or "ordering", all of which describe the mechanical
 * claims 0.4.0 *is* allowed to make.
 */
const BALANCE_TERMS = [
  'balanced',
  'balance',
  'fair',
  'fairness',
  'winrate',
  'wins',
  'snowball',
  'ascensionrate',
  'targetband',
  'gini',
  'overpowered',
  'underpowered',
];

/** Words that mean "this is about a species". */
const SPECIES_TERMS = [...SPECIES_IDS, 'species'];

interface Claim {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Assertions that pair a balance term with a species term.
 *
 * Exported so the controls can feed it synthetic source. The scan reads parsed
 * syntax and only inside an `expect(...)` call, so a comment explaining balance
 * methodology is invisible to it — which matters, because the alternative is a
 * check that fires on this file's own docstring.
 */
export function balanceClaims(path: string, source: string): Claim[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Claim[] = [];

  const namesIn = (node: ts.Node): string[] => {
    const collected: string[] = [];
    const walk = (child: ts.Node): void => {
      // `expect(actual, message)`: the second argument is prose explaining what
      // a failure would mean, not part of the claim. Excluding it is
      // load-bearing rather than tidy — the most careful assertions in this
      // repository explain themselves at length, and the first two files this
      // check ever ran against were caught by their own messages saying that
      // species magnitudes are not balanced. A conformance check that fails on
      // the sentence describing the rule is a check that gets deleted.
      if (
        ts.isCallExpression(child) &&
        ts.isIdentifier(child.expression) &&
        child.expression.text === 'expect' &&
        child.arguments.length > 1
      ) {
        collected.push(child.expression.text);
        const actual = child.arguments[0];
        if (actual !== undefined) walk(actual);
        return;
      }
      if (ts.isIdentifier(child) || ts.isPrivateIdentifier(child)) collected.push(child.text);
      else if (ts.isStringLiteralLike(child)) collected.push(child.text);
      ts.forEachChild(child, walk);
    };
    walk(node);
    return collected;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && rootCalleeName(node) === 'expect') {
      const names = namesIn(node);
      // Balance terms match as substrings of a name, because the vocabulary
      // arrives welded into identifiers — `winRateOf`, `speciesFairnessIndex`,
      // `isBalanced` — and each of them is distinctive enough that a substring
      // hit is not a coincidence. Species terms match as whole words for the
      // opposite reason: "orc" is a substring of "orchestrate".
      const compact = names.map((name) => name.toLowerCase().replace(/[^a-z]/gu, ''));
      const balance = BALANCE_TERMS.filter((term) =>
        compact.some((name) => name.includes(term)),
      );
      const wordSet = new Set(names.flatMap(wordsIn));
      const species = SPECIES_TERMS.filter((term) => wordSet.has(term));
      if (balance.length > 0 && species.length > 0) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        found.push({
          path,
          line: line + 1,
          text: `asserts ${balance.join('/')} over ${species.join('/')}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);

  // `expect(a).toBe(b)` is two nested call expressions that both root at
  // `expect`, so a matching assertion is found twice — once for the whole chain
  // and once for the bare `expect(a)` inside it. Traversal reaches the outer
  // one first and it carries the more complete vocabulary, so the first hit per
  // line is the one worth reporting.
  const seen = new Set<string>();
  return found.filter((claim) => {
    const key = `${claim.path}:${String(claim.line)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** `expect(x).toBe(y)` roots at `expect`; this walks back down the member chain. */
function rootCalleeName(node: ts.CallExpression): string | undefined {
  let current: ts.Expression = node.expression;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

function listTests(dir: string): string[] {
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
    if (statSync(full).isDirectory()) found.push(...listTests(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

const testFiles = readdirSync(join(repoRoot, 'packages'))
  .filter((entry) => statSync(join(repoRoot, 'packages', entry)).isDirectory())
  .sort()
  .flatMap((pkg) => listTests(join(repoRoot, 'packages', pkg, 'test')))
  .map((full) => ({
    path: relative(repoRoot, full).split(sep).join('/'),
    source: readFileSync(full, 'utf8'),
  }));

describe('no test asserts a balance property over species magnitudes', () => {
  it('found tests to scan, so the assertion below is not vacuous', () => {
    expect(testFiles.length).toBeGreaterThan(20);
    expect(testFiles.map((file) => file.path)).toContain(
      'packages/rules-world/test/unit/species-traits.test.ts',
    );
  });

  it('finds no pre-0.5.0 balance claim anywhere in the workspace suite', () => {
    const claims = testFiles.flatMap((file) => balanceClaims(file.path, file.source));
    expect(
      claims.map((claim) => `${claim.path}:${String(claim.line)} ${claim.text}`),
      'No balance measurement exists before agent-interface at 0.5.0, so no test may assert that a ' +
        'species magnitude is balanced, fair, or on target. Every species number is an untuned ' +
        'placeholder (release-plan.md). Assert differentiation, ordering, or arithmetic instead.',
    ).toEqual([]);
  });
});

describe('the pre-0.5.0 claim check would catch a violation', () => {
  it('catches a target win rate over a named species', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(winRateOf('dwarf')).toBeGreaterThan(400);\n",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('dwarf');
  });

  it('catches a fairness assertion over species', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      'expect(speciesFairnessIndex).toBeLessThan(350);\n',
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('fairness');
  });

  it('catches a claim that species magnitudes are balanced', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(speciesTable.balanced).toBe(true);\n",
    );
    expect(claims).toHaveLength(1);
  });

  it('permits the differentiation assertion 0.4.0 is allowed to make', () => {
    // The positive control, and the one that matters most: the 0.4.0 release
    // claim *is* that species differ measurably. A check that also rejected
    // this would forbid the release's own evidence.
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      [
        "expect(timeToTier('gnome')).not.toBe(timeToTier('orc'));",
        'expect(new Set(speciesValues).size).toBeGreaterThan(1);',
      ].join('\n'),
    );
    expect(claims).toEqual([]);
  });

  it("permits an assertion whose failure message explains the balance rule", () => {
    // The control for the message exclusion. Both conformance checks in this
    // package explain, in the message a reader sees on failure, that species
    // magnitudes are untuned and unbalanced — and without this exclusion the
    // check reported both of them as balance claims about species.
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(values, 'no species magnitude is balanced before 0.5.0').toEqual([]);\n",
    );
    expect(claims).toEqual([]);
  });

  it('still reads the actual value when a message is present', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(speciesWinRate, 'a harmless note').toBe(512);\n",
    );
    expect(claims).toHaveLength(1);
  });

  it('permits balance vocabulary that is not an assertion about species', () => {
    // The repository is full of it — diagnostics and messages explaining what a
    // committed balance baseline is. Only the co-occurrence inside one
    // assertion is a claim.
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      [
        "expect(problems[0]).toContain('balance baseline');",
        'expect(speciesIds).toHaveLength(6);',
      ].join('\n'),
    );
    expect(claims).toEqual([]);
  });
});
