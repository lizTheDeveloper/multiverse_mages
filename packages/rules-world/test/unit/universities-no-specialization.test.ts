/*
 * Multiverse Mages — no university carries a specialization, a focus, or a
 * preferred cell.
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
 * Vision §13 asked whether universities should declare a specialization and
 * assigned the answer to this change. The answer is no, and
 * `mages-and-species/design.md` gives the decisive reason: `contracts.md` §4.1
 * fixes the `institutions` observation block at **four slots**, so a declared
 * specialization over seventy cells would need seventy more, and resizing a
 * fixed observation vector invalidates every trained agent.
 *
 * A decision of that shape needs a check rather than a comment, because the
 * field that would break it is a small, plausible, well-meant addition — a
 * `focusCellId` "for the UI", a `preferredCell` "as a hint". Both would be
 * caching a fact the library already holds, which is the second reason the
 * design gives: *"a class of incoherent state that only exists if you store the
 * same fact twice."*
 *
 * The scan is the same shape as `no-stored-age.test.ts` next door — parsed
 * syntax, component-field positions only, whole-word matching — and for the
 * same reasons. Prose is exempt; this very file's neighbours discuss
 * specialization at length.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { UNIVERSITY, WORLD_COMPONENTS } from '@mm/state';
import ts from 'typescript';

import { repoRoot, wordsIn } from './species-fixtures.js';

interface Violation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/** Why a field name would be a declared specialization. */
function bannedFieldReason(name: string): string | undefined {
  const words = new Set(wordsIn(name));
  if (words.has('specialization') || words.has('specialisation') || words.has('speciality')) {
    return 'declares a specialization; what a university is good at is derived from its library';
  }
  if (words.has('focus')) {
    return 'declares a focus, which is a specialization under another name';
  }
  if (words.has('preferred') || words.has('favoured') || words.has('favored')) {
    return 'declares a preference over cells; the institutions block has four slots, not seventy';
  }
  return undefined;
}

/**
 * Every component field in a source file that would declare a specialization.
 *
 * Exported so the controls below can feed it synthetic source — a scanner whose
 * "no violations" result is indistinguishable from "returns nothing for every
 * input" is not a check.
 */
export function specializationFields(path: string, source: string): Violation[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Violation[] = [];

  const visitFields = (fields: ts.ObjectLiteralExpression): void => {
    for (const property of fields.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = ts.isIdentifier(property.name)
        ? property.name.text
        : ts.isStringLiteralLike(property.name)
          ? property.name.text
          : undefined;
      if (name === undefined) continue;
      const reason = bannedFieldReason(name);
      if (reason === undefined) continue;
      const { line } = parsed.getLineAndCharacterOfPosition(property.getStart(parsed));
      found.push({ path, line: line + 1, detail: `field "${name}" ${reason}` });
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'fields' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      visitFields(node.initializer);
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

const scanned = [
  join(repoRoot, 'packages', 'state', 'src'),
  join(repoRoot, 'packages', 'rules-world', 'src'),
].flatMap((dir) =>
  listTypeScript(dir).map((full) => ({
    path: relative(repoRoot, full).split(sep).join('/'),
    source: readFileSync(full, 'utf8'),
  })),
);

describe('no component declares a specialization', () => {
  it('has files to scan, so a pass is not an empty walk', () => {
    expect(scanned.length).toBeGreaterThan(10);
  });

  it('finds none in the state or world-rules layouts', () => {
    const violations = scanned.flatMap((file) => specializationFields(file.path, file.source));
    expect(
      violations.map((violation) => `${violation.path}:${String(violation.line)} ${violation.detail}`),
    ).toEqual([]);
  });

  it('catches each of the three shapes it exists for', () => {
    const offending = `
      export const BAD = {
        name: 'university',
        fields: {
          specializationCellId: 'u16',
          focusCellId: 'u16',
          preferredCell: 'u16',
        },
      } as const;
    `;
    const found = specializationFields('synthetic.ts', offending).map((v) => v.detail).join(' | ');
    expect(found).toContain('specializationCellId');
    expect(found).toContain('focusCellId');
    expect(found).toContain('preferredCell');
  });

  it('leaves prose about specialization alone', () => {
    const commented = `
      /** A university has no specialization, no focus, and no preferred cell. */
      export const FINE = { name: 'university', fields: { capacity: 'u16' } } as const;
    `;
    expect(specializationFields('synthetic.ts', commented)).toEqual([]);
  });
});

describe('the shipped university layout is exactly contracts.md §1.4', () => {
  it('carries libraryId, capacity and buildProgress, and nothing else', () => {
    expect(Object.keys(UNIVERSITY.fields)).toEqual(['libraryId', 'capacity', 'buildProgress']);
  });

  it('is still one of the world components, so the scan covers the shipped layout', () => {
    expect(WORLD_COMPONENTS.map((spec) => spec.name)).toContain('university');
  });
});
