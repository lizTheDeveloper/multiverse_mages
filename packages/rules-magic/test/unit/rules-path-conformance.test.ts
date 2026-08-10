/*
 * Multiverse Mages — the conformance check that the rules path reads neither
 * the ruleset's raw fields nor a cell's classical labels.
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
 * `magic-grid` asks for two scans, and this file is both of them:
 *
 * > **WHEN** the conformance check scans `packages/rules-magic` for direct reads
 * > of `permittedTechniques`, `permittedForms`, or `edicts` **THEN** it finds
 * > zero occurrences outside the call to `permits`.
 *
 * > **WHEN** the conformance check scans the rules path for reads of
 * > `classicalLabels` **THEN** it finds zero occurrences.
 *
 * ## Why these four names, and why a read is enough
 *
 * The first three are the inputs to `contracts.md` §1.1's arbitration formula.
 * `packages/state/test/unit/arbitration-conformance.test.ts` already catches the
 * formula being *reimplemented* — a bitwise evaluation of an axis mask against a
 * cell — and deliberately clears axis-scoped reads, because `@mm/agent-api`
 * legitimately needs two of them. That exemption is right for `agent-api` and
 * wrong here: nothing in the rules path has any business reading a ruleset's raw
 * fields at all, for any purpose, since every question it could be asking is
 * "may this cell be used", and that question has an answer function. So this
 * check is stricter and narrower — no scope analysis, no bitwise requirement,
 * just: did a rules package touch the field.
 *
 * `edicts` is included for the reason `permits()`'s own header gives: the edict
 * precedence is the part every reimplementation forgets, and a reimplementation
 * that forgets it usually starts by iterating the list.
 *
 * `classicalLabels` is different in kind. §2.2 marks it *"display only, never
 * mechanical"*, and `vision.md` §4 keeps the mapping as flavour — evocation,
 * necromancy, abjuration. The failure it prevents is not a wrong answer but a
 * *hidden* rule: a legality or cost that keys on a label is a rule no content
 * author can see, because the label looks like documentation. It would also
 * quietly make relabelling a cell a balance change.
 *
 * ## What is scanned, and what is not
 *
 * The rules path: every `packages/rules-*&#47;src`. Not `@mm/state`, which is where
 * `permits()` and `captureRuleset()` live and where reading those fields is the
 * entire job; not `@mm/agent-api`, which §4.1 requires to project the raw bits
 * into the observation; not `test/`, which contains hand-built rulesets and the
 * synthetic violations this file feeds its own classifier.
 *
 * ## What this cannot see
 *
 * A rules package that received a pre-extracted `number[]` of edicts from
 * somewhere else, or that read the field under a computed key, walks past this.
 * That is accepted, on the same terms `arbitration-conformance.test.ts` accepts
 * it: a conformance check catches **drift**, not an adversary, and the shapes it
 * does catch — a dotted read, a bracketed read, a destructure — are the shapes
 * the mistake is actually written in. Where it can, it fails closed: the
 * classifier is exercised against synthetic violations below, so a classifier
 * that quietly stopped recognising a read fails rather than passing everything.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** From packages/rules-magic/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * The packages that decide rules. Listed rather than globbed on `rules-*` so
 * that adding a fourth rules package is a decision somebody makes here, with
 * this header in front of them.
 */
const RULES_PATH = ['rules-magic', 'rules-world', 'rules-raid'];

/** The §1.1 ruleset fields, plus §2.2's display-only labels. */
const FORBIDDEN_READS: ReadonlyMap<string, string> = new Map([
  [
    'permittedTechniques',
    'contracts.md §1.1 gives ruleset legality exactly one implementation, permits() in ' +
      '@mm/state. A rules package that reads the technique bitmask is either reimplementing ' +
      'that formula without the edict precedence, or asking a question it should be asking ' +
      'permits() instead.',
  ],
  [
    'permittedForms',
    'contracts.md §1.1 gives ruleset legality exactly one implementation, permits() in ' +
      '@mm/state. A rules package that reads the form bitmask is either reimplementing that ' +
      'formula without the edict precedence, or asking a question it should be asking ' +
      'permits() instead.',
  ],
  [
    'edicts',
    'Edict precedence — interdiction beats dispensation, both beat the axis bits — is the part ' +
      'every reimplementation of contracts.md §1.1 forgets, and iterating the list is how one ' +
      'starts. Call permits().',
  ],
  [
    'classicalLabels',
    'contracts.md §2.2: classicalLabels is display only, never mechanical. A rule that keys on ' +
      'a label is a rule content authors cannot see, and it turns relabelling a cell into a ' +
      'balance change.',
  ],
]);

/** One read of a forbidden field, as the scanner sees it. */
export interface ForbiddenRead {
  /** Repo-relative, so the failure message names the file. */
  readonly path: string;
  /** 1-based, so it can be pasted into an editor. */
  readonly line: number;
  readonly field: string;
  /** The expression as written, collapsed to one line. */
  readonly text: string;
}

/**
 * Every forbidden field read in one file.
 *
 * Three shapes, because a field can be reached three ways and a check that knew
 * only the first would be satisfied by a formatter:
 *
 * - `ruleset.edicts` — property access.
 * - `ruleset['edicts']` — element access with a literal key.
 * - `const { edicts } = ruleset` — a destructuring binding, which is a read that
 *   contains no member expression at all.
 *
 * Object *declarations* are reads too under this rule and are meant to be:
 * a rules package building a `{ permittedTechniques, ... }` literal is a rules
 * package constructing a ruleset, which is `@mm/state`'s `captureRuleset`.
 */
export function forbiddenReadsOf(path: string, source: string): ForbiddenRead[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: ForbiddenRead[] = [];

  const record = (node: ts.Node, field: string): void => {
    const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    found.push({
      path,
      line: line + 1,
      field,
      text: node.getText(parsed).replace(/\s+/gu, ' '),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && FORBIDDEN_READS.has(node.name.text)) {
      record(node, node.name.text);
    } else if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if (ts.isStringLiteralLike(argument) && FORBIDDEN_READS.has(argument.text)) {
        record(node, argument.text);
      }
    } else if (ts.isBindingElement(node)) {
      // `const { edicts } = r` has no propertyName; `const { edicts: e } = r`
      // carries the field in propertyName and the local in name. Both read it.
      const source_ = node.propertyName ?? node.name;
      if (ts.isIdentifier(source_) && FORBIDDEN_READS.has(source_.text)) {
        record(node, source_.text);
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      FORBIDDEN_READS.has(node.name.text)
    ) {
      record(node, node.name.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

/**
 * The reads, as human-readable failures.
 *
 * A list rather than a throw on the first, for `module-boundaries.test.ts`'s
 * reason: a check that reports one site per run turns a change that added three
 * into three CI cycles, and the third is where somebody deletes the check.
 */
export function conformanceViolations(reads: readonly ForbiddenRead[]): string[] {
  return reads
    .map(
      (read) =>
        `${read.path}:${String(read.line)} reads \`${read.field}\` — \`${read.text}\`. ` +
        (FORBIDDEN_READS.get(read.field) as string),
    )
    .sort();
}

// ---------------------------------------------------------------------------
// Reading the real workspace.
// ---------------------------------------------------------------------------

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

function scanRulesPath(): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  for (const pkg of RULES_PATH) {
    for (const full of listTypeScript(join(repoRoot, 'packages', pkg, 'src'))) {
      files.push({
        path: relative(repoRoot, full).split(sep).join('/'),
        source: readFileSync(full, 'utf8'),
      });
    }
  }
  return files;
}

const rulesPathFiles = scanRulesPath();
const rulesPathReads = rulesPathFiles.flatMap((file) => forbiddenReadsOf(file.path, file.source));

describe('the rules path never reads the ruleset’s fields or a cell’s labels', () => {
  it('found source to analyse, so the assertion below is not vacuous', () => {
    // "No violations" and "the scanner read nothing" are the same green run
    // otherwise — a renamed directory, a moved package, a glob that stopped
    // matching.
    expect(rulesPathFiles.length).toBeGreaterThan(0);
    expect(rulesPathFiles.map((file) => file.path)).toContain(
      'packages/rules-magic/src/dormancy.ts',
    );
  });

  it('decides availability through permits() and reads no ruleset field', () => {
    expect(conformanceViolations(rulesPathReads)).toEqual([]);
  });

  it('reaches permits() from the package that decides availability', () => {
    // The other half of the claim. Finding no forbidden read would also be true
    // of a package that never asked about legality at all — which is what this
    // package would be if `permits` were quietly replaced by a local predicate.
    const dormancy = rulesPathFiles.find(
      (file) => file.path === 'packages/rules-magic/src/dormancy.ts',
    );
    expect(dormancy?.source).toContain("from '@mm/state'");
    expect(dormancy?.source).toContain('permits(');
  });
});

describe('the conformance check would catch a violation', () => {
  const probe = 'packages/rules-magic/src/probe.ts';

  it('catches a dotted read of each forbidden field', () => {
    for (const field of FORBIDDEN_READS.keys()) {
      const reads = forbiddenReadsOf(probe, `export const x = subject.${field};\n`);
      expect(reads).toHaveLength(1);
      expect(reads[0]?.field).toBe(field);
      const problems = conformanceViolations(reads);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(probe);
    }
  });

  it('catches a bracketed read, which is the same read differently spelled', () => {
    const reads = forbiddenReadsOf(probe, "export const x = subject['edicts'];\n");
    expect(reads).toHaveLength(1);
    expect(reads[0]?.field).toBe('edicts');
  });

  it('catches a destructure, which contains no member expression at all', () => {
    const reads = forbiddenReadsOf(
      probe,
      [
        'export function legal(ruleset: Ruleset): boolean {',
        '  const { permittedTechniques, edicts: issued } = ruleset;',
        '  return permittedTechniques !== 0 && issued.length === 0;',
        '}',
      ].join('\n'),
    );
    expect(reads.map((read) => read.field).sort()).toEqual(['edicts', 'permittedTechniques']);
  });

  it('catches a rules package assembling a ruleset literal', () => {
    const reads = forbiddenReadsOf(
      probe,
      [
        'export function capture(record: UniverseRecord): Ruleset {',
        '  return { permittedTechniques: 1, permittedForms: 2, edicts: [] };',
        '}',
      ].join('\n'),
    );
    expect(reads).toHaveLength(3);
  });

  it('catches a legality rule keyed on a classical label', () => {
    const reads = forbiddenReadsOf(
      probe,
      "export const forbidden = cell.classicalLabels.includes('necromancy');\n",
    );
    expect(conformanceViolations(reads)).toHaveLength(1);
    expect(conformanceViolations(reads)[0]).toContain('display only');
  });
});

describe('the scanner reads real syntax, not text that looks like it', () => {
  const probe = 'packages/rules-magic/src/probe.ts';

  it('ignores the forbidden names in comments and string literals', () => {
    // This file, `dormancy.ts`, and `index.ts` all discuss these fields at
    // length. A regex-based check would report every sentence about the rule as
    // a violation of it, and would then be weakened until it meant nothing.
    const reads = forbiddenReadsOf(
      probe,
      [
        '// Availability never reads permittedTechniques or edicts.',
        '/* classicalLabels is display only. */',
        "const note = 'ruleset.permittedForms is not read here';",
        'export { note };',
      ].join('\n'),
    );
    expect(reads).toEqual([]);
  });

  it('accepts the shape the rule prescribes — a call to permits()', () => {
    const reads = forbiddenReadsOf(
      probe,
      [
        "import { permits } from '@mm/state';",
        'export function available(ruleset: Ruleset, cellId: number): boolean {',
        '  return permits(ruleset, cellId);',
        '}',
      ].join('\n'),
    );
    expect(reads).toEqual([]);
  });

  it('accepts a type-only reference to the ruleset shape', () => {
    const reads = forbiddenReadsOf(
      probe,
      ["import type { Ruleset } from '@mm/state';", 'export type R = Ruleset;'].join('\n'),
    );
    expect(reads).toEqual([]);
  });
});
