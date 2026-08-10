/*
 * Multiverse Mages — adversarial: the boundary scanner's blind spot.
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
 * `module-boundaries.test.ts`'s own design note names its failure mode:
 * *"this is a test whose failure mode is silence."* `importsOf` there parses
 * real syntax rather than text, specifically so a probe like the one
 * `purity-lint.test.ts` embeds — an import specifier that only appears inside
 * a string literal — is not mistaken for a real edge.
 *
 * That same parser has the mirror-image hole: `literalText()` returns
 * `undefined` for any module-specifier expression that is not a string
 * literal (or a no-substitution template). A dynamic `import()` or `require()`
 * whose argument is *computed* — string concatenation, a template literal
 * with a substitution, a variable — produces no entry in `found` at all, and
 * therefore no edge, and therefore no violation, no matter what package it
 * actually reaches at runtime. This is not a hypothetical: it is exactly the
 * class of hole `eslint.config.mjs`'s own `BAN_DYNAMIC_IMPORT` comment records
 * having been added *because* "an adversarial agent" found the sibling gap in
 * `no-restricted-imports` (which only visits static declarations).
 *
 * This file establishes two things:
 *
 * 1. (DEFECT) `importsOf`/`violationsOf` really do miss a computed specifier —
 *    demonstrated against the shipped functions, not a reimplementation.
 * 2. (established) for every package this scanner watches *except*
 *    `packages/content`, `eslint.config.mjs`'s `BAN_DYNAMIC_IMPORT` closes the
 *    hole at the syntax level regardless of whether the specifier is literal —
 *    so the practical exposure of finding 1 is confined to `content`, which
 *    has no dynamic-import ban at all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { edgesOf, importsOf, violationsOf } from '../unit/module-boundaries.test.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

describe('DEFECT: the scanner is blind to a dynamic import built from a non-literal specifier', () => {
  it('sees nothing in a require() built by string concatenation', () => {
    const source = [
      "const pkg = '@mm/' + 'agent-api';",
      'const forbidden = require(pkg);',
      'export { forbidden };',
    ].join('\n');

    // §5 rule 4: a rules package may never reach @mm/agent-api. This source
    // does exactly that at runtime. The parser-based scanner — the one
    // module-boundaries.test.ts trusts specifically *because* it is a real
    // parse rather than a regex — reports zero imports for it.
    const found = importsOf('probe.ts', source);
    expect(found).toEqual([]);
  });

  it('sees nothing in a dynamic import() through a template literal with a substitution', () => {
    const source = [
      "const name = 'server';",
      "const forbidden = await import(`@mm/${name}`);",
      'export { forbidden };',
    ].join('\n');

    const found = importsOf('probe.ts', source);
    expect(found).toEqual([]);
  });

  it('reports zero violations for a rules-magic file that reaches agent-api this way', () => {
    // The consequence, end to end: violationsOf sees this file's edges (there
    // are none, per the two probes above) and therefore reports the file as
    // compliant. A CI run over this exact file would go green.
    const source = "const forbidden = require('@mm/' + 'agent-api');";
    const edges = edgesOf([
      { pkg: 'rules-magic', area: 'src', path: 'packages/rules-magic/src/probe.ts', source },
    ]);

    expect(edges).toEqual([]);

    // What "the dependency-graph check would catch a violation" (the sibling
    // describe block in module-boundaries.test.ts) demands of a *literal*
    // version of this same import: a reported problem naming rule 4. A
    // scanner whose stated purpose is to make "boundaries that are only
    // documented" (§5 rule 5) into boundaries CI enforces should not answer
    // "no problems" to a file that imports @mm/agent-api from rules-magic —
    // even when it cannot name which package the specifier resolves to, it
    // can see that the specifier is unanalyzable, and an unanalyzable
    // specifier reaching outside the package is exactly the shape rule 5
    // exists to make visible rather than silent.
    const problems = violationsOf(edges, ['rules-magic']);
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('established: eslint closes this hole at the syntax level for every watched package except content', () => {
  const eslintConfigSource = readFileSync(`${repoRoot}eslint.config.mjs`, 'utf8');

  it('bans every dynamic import() outright in sim-core, state, primitives, and the rules-* packages', () => {
    // BAN_DYNAMIC_IMPORT's selector is `ImportExpression` with no argument
    // inspection at all — it fires on *every* dynamic import in a covered
    // file, literal specifier or not. So for the five packages it covers, the
    // parser-level blind spot demonstrated above is defence-in-depth, not an
    // open door: the file would fail to lint before it could ship.
    expect(eslintConfigSource).toContain('BAN_DYNAMIC_IMPORT');
    expect(eslintConfigSource).toContain("selector: 'ImportExpression'");

    const coveredGlobLists = ['CORE_SRC', 'RULES_SRC', 'PRIMITIVES_SRC'];
    for (const list of coveredGlobLists) {
      expect(eslintConfigSource).toContain(`const ${list}`);
    }
  });

  it('does not cover packages/content/src at all, in any glob', () => {
    // No occurrence of the literal path anywhere in the config — not in
    // CORE_SRC, RULES_SRC, or PRIMITIVES_SRC, and not in a fourth block
    // either. Grepped from the real file rather than asserted from memory.
    //
    // This assertion is a tripwire pointing at the gap, not a demand that the
    // gap stay open: it fails on purpose the day someone adds
    // `packages/content/src` to a dynamic-import-banning glob, which is the
    // fix. That is the point at which this whole test — this one and
    // "leaves content with no mechanical defence at all", below — should be
    // DELETED, not loosened to keep passing. Its replacement is a positive
    // assertion in the same shape as "bans every dynamic import() outright…"
    // above: that the covered-glob list now includes `packages/content/src`.
    // A red test whose only fix is deleting the assertion is meant to be read
    // as "this documents an open gap," never as "this repository wants the
    // gap kept open."
    expect(eslintConfigSource).not.toContain('packages/content');
  });

  it('leaves content with no mechanical defence at all against this class of import', () => {
    // check-purity.mjs (packages/sim-core/test/unit/dependency-purity.test.ts
    // exercises it) is the other mechanism guarding content's "zero runtime
    // dependencies" contract, and it only reads package.json manifests — it
    // never parses source, so a dynamic import reaching a forbidden package at
    // runtime is invisible to it by construction, literal specifier or not.
    // Combined with the two facts above: a computed-specifier dynamic import
    // in packages/content/src is caught by nothing in this repository. The
    // module-boundaries scanner is blind to it (finding 1), eslint has no
    // dynamic-import ban on this package (this describe block), and the
    // manifest checker never reads source at all.
    const purityScriptSource = readFileSync(`${repoRoot}scripts/check-purity.mjs`, 'utf8');
    expect(purityScriptSource).not.toMatch(/import\(|ImportExpression/);
  });
});
