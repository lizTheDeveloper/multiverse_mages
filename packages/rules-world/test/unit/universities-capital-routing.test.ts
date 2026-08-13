/*
 * Multiverse Mages — the library contribution reaches a rate through the shared
 * stacking, or it does not reach one at all.
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
 * `mages-and-species/design.md` states the failure this check exists for:
 *
 * > the tempting implementation is a separate `libraryMultiplier` applied after
 * > the primitives — and that implementation would silently escape the cap that
 * > `contracts.md` §3 says exists specifically to contain this loop.
 *
 * "Silently" is the operative word. A bespoke multiplier produces plausible
 * numbers, passes every unit test written about it, and is only visible as a
 * balance finding nobody can explain some thousands of Monte Carlo runs later.
 * The `universities` spec therefore makes it a conformance check: *"the
 * conformance check scans for a library multiplier applied outside the shared
 * stacking implementation → it finds none, and any occurrence fails CI and
 * names the file."*
 *
 * ## What the scan asserts
 *
 * Two things, and the second is the one that has teeth:
 *
 * 1. **`libraryContribution` and `contributionFor` are called in exactly one
 *    module** inside `packages/rules-world/src` — `universities/capital.ts`.
 *    A second caller is a second opinion about what a library is worth.
 * 2. **Inside that module, the contribution is never an operand of `mul` or
 *    `div`.** That is what "applied as a multiplier" looks like in this
 *    codebase's fixed-point vocabulary, and it is the shape a well-meaning
 *    optimisation would take.
 *
 * The scan walks parsed syntax, so the prose above — which uses the word
 * `libraryMultiplier` freely — is invisible to it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import ts from 'typescript';

import { repoRoot } from './species-fixtures.js';

/** The functions that produce a library's worth. */
const CONTRIBUTION_PRODUCERS = new Set(['libraryContribution', 'contributionFor']);

/** Fixed-point operators that would make the contribution a bespoke multiplier. */
const MULTIPLICATIVE = new Set(['mul', 'div']);

interface CallSite {
  readonly path: string;
  readonly line: number;
  readonly callee: string;
}

/** Every call to a contribution producer in one file. */
export function contributionCalls(path: string, source: string): CallSite[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: CallSite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (CONTRIBUTION_PRODUCERS.has(callee)) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        found.push({ path, line: line + 1, callee });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

/**
 * Every place a `mul` or `div` takes a contribution as an operand.
 *
 * Matches the producing call directly and the local names it is bound to, since
 * `const bonus = libraryContribution(n); return mul(rate, bonus);` is the same
 * defect written over two lines and is the more likely of the two to be written.
 */
export function multiplicativeUses(path: string, source: string): CallSite[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const bound = new Set<string>(['contribution']);
  const found: CallSite[] = [];

  const collectBindings = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      CONTRIBUTION_PRODUCERS.has(node.initializer.expression.text)
    ) {
      bound.add(node.name.text);
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(parsed);

  const isContribution = (argument: ts.Node): boolean => {
    if (ts.isIdentifier(argument)) return bound.has(argument.text);
    if (ts.isCallExpression(argument) && ts.isIdentifier(argument.expression)) {
      return CONTRIBUTION_PRODUCERS.has(argument.expression.text);
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      MULTIPLICATIVE.has(node.expression.text) &&
      node.arguments.some(isContribution)
    ) {
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
      found.push({ path, line: line + 1, callee: node.expression.text });
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

const ROUTING_MODULE = 'packages/rules-world/src/universities/capital.ts';

/**
 * Both packages the contribution could reach a rate from.
 *
 * `coordination` joined the scan when vision §6a's loop was wired: it is the
 * layer that holds a library's depth and a mage's affiliation at the same time,
 * so it is the one place outside this package where a bespoke multiplier could
 * be written — and it is the *only* consumer, through
 * `libraryRateMultiplier`, which keeps the lookup itself inside
 * {@link ROUTING_MODULE}. Scanning only `rules-world` would have made this
 * check pass by looking away from the code it exists to constrain.
 */
const SCANNED_PACKAGES = ['rules-world', 'coordination'];

const sourceFiles = SCANNED_PACKAGES.flatMap((pkg) =>
  listTypeScript(join(repoRoot, 'packages', pkg, 'src')).map((full) => ({
    path: relative(repoRoot, full).split(sep).join('/'),
    source: readFileSync(full, 'utf8'),
  })),
);

describe('the library contribution has exactly one consumer', () => {
  it('has files to scan, so a pass is not an empty walk', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it('is computed only inside the module that routes it', () => {
    const strays = sourceFiles
      .flatMap((file) => contributionCalls(file.path, file.source))
      .filter((call) => call.path !== ROUTING_MODULE);
    expect(
      strays.map((call) => `${call.path}:${String(call.line)} calls ${call.callee}`),
      'a second caller of the library contribution is a second opinion about what a library is ' +
        'worth, and only one of them goes through the capped accumulator',
    ).toEqual([]);
  });

  it('is computed at all, so the check is not passing on absence', () => {
    const inside = sourceFiles
      .filter((file) => file.path === ROUTING_MODULE)
      .flatMap((file) => contributionCalls(file.path, file.source));
    expect(inside.length).toBeGreaterThan(0);
  });
});

describe('the contribution is never applied as a multiplier', () => {
  it('is not an operand of mul or div anywhere in the package', () => {
    const violations = sourceFiles.flatMap((file) => multiplicativeUses(file.path, file.source));
    expect(
      violations.map((call) => `${call.path}:${String(call.line)} passes it to ${call.callee}`),
    ).toEqual([]);
  });

  it('catches the direct form and the two-line form', () => {
    // The control, both ways it would actually be written.
    const direct = `
      import { mul } from '@mm/sim-core';
      export const rate = (base, n) => mul(base, libraryContribution(n));
    `;
    const indirect = `
      import { mul } from '@mm/sim-core';
      export function rate(base, depth, ceiling) {
        const bonus = contributionFor(depth, ceiling);
        return mul(base, bonus);
      }
    `;
    expect(multiplicativeUses('synthetic.ts', direct)).toHaveLength(1);
    expect(multiplicativeUses('synthetic.ts', indirect)).toHaveLength(1);
  });

  it('leaves an unrelated mul alone', () => {
    const fine = `
      import { mul } from '@mm/sim-core';
      export const scale = (a, b) => mul(a, b);
    `;
    expect(multiplicativeUses('synthetic.ts', fine)).toEqual([]);
  });
});
