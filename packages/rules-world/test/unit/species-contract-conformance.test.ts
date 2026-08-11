/*
 * Multiverse Mages — the species schema and contracts.md §2.4 must agree.
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
 * `contracts.md` is normative: *"Where this document and a capability spec
 * disagree, this document wins."* A normative document that nothing compares
 * against is a document that drifts, and species are the place it drifts
 * fastest — the schema is edited when a field is needed and the contract is
 * edited when somebody remembers.
 *
 * This check reads the worked example in §2.4 and the shipped JSON Schema and
 * requires the two field sets to be identical. Reading the *example* rather
 * than a prose list is deliberate: the example is what an author copies when
 * adding content, so an example missing a required field is not a documentation
 * nit, it is a broken starting point that fails validation on first load.
 *
 * ## The two fields this check currently expects to be missing
 *
 * `mages-and-species` amends §2.4. Until that amendment is applied, the schema
 * requires two fields the example does not show — `name` and `tuningStatus` —
 * and this file names them in {@link AMENDMENT_PENDING} rather than pretending
 * the sets match.
 *
 * The constant is written to **delete itself**. Each entry is asserted to be
 * genuinely absent from §2.4 *and* genuinely present in the schema, so the
 * moment the amendment lands this test fails and says so, and the fix is to
 * empty the list. An allowance that stays green after the thing it allows for
 * is fixed is an allowance that becomes permanent.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot, speciesSchemaProperties, speciesSchemaRequired } from './species-fixtures.js';

/**
 * Fields the shipped schema requires that `contracts.md` §2.4's example does
 * not yet show. Empty this list when the amendment lands; the assertions below
 * will insist on it.
 */
const AMENDMENT_PENDING: string[] = [];

const contracts = readFileSync(join(repoRoot, 'docs', 'design', 'contracts.md'), 'utf8');

/**
 * The fenced example under a numbered heading.
 *
 * Anchored on the heading rather than on "the first jsonc block", because
 * `contracts.md` has seven of them and matching the wrong one would compare the
 * species schema against, say, `tradition.json` and fail for a reason that
 * reads as a contract violation.
 */
function exampleUnder(heading: string): string {
  const headingAt = contracts.indexOf(heading);
  if (headingAt === -1) throw new Error(`contracts.md has no heading ${JSON.stringify(heading)}`);
  const fenceAt = contracts.indexOf('```jsonc', headingAt);
  if (fenceAt === -1) throw new Error(`no jsonc example follows ${JSON.stringify(heading)}`);
  const bodyAt = contracts.indexOf('\n', fenceAt) + 1;
  const endAt = contracts.indexOf('```', bodyAt);
  if (endAt === -1) throw new Error(`unterminated jsonc example under ${JSON.stringify(heading)}`);
  return contracts.slice(bodyAt, endAt);
}

/**
 * Strips `//` comments that are not inside a string.
 *
 * Written as a scanner rather than a regex because §2.4's comments are the most
 * informative part of the example — they carry the direction of
 * `rediscoveryAffinity` and the reasoning behind the rediscovery floor — and a
 * regex that cut at the first `//` would also cut inside any string that
 * contained one. Wrong today, wrong silently, and wrong in a way that surfaces
 * as "the contract's example is not valid JSON".
 */
function stripLineComments(jsonc: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < jsonc.length; index += 1) {
    const character = jsonc[index] as string;
    if (inString) {
      out += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      out += character;
      continue;
    }
    if (character === '/' && jsonc[index + 1] === '/') {
      const lineEnd = jsonc.indexOf('\n', index);
      if (lineEnd === -1) break;
      index = lineEnd - 1;
      continue;
    }
    out += character;
  }
  return out;
}

/** Removes trailing commas the stripped comments leave behind. */
function parseExample(jsonc: string): Record<string, unknown> {
  const withoutComments = stripLineComments(jsonc).replace(/,(\s*[}\]])/gu, '$1');
  return JSON.parse(withoutComments) as Record<string, unknown>;
}

const documented = Object.keys(parseExample(exampleUnder('### 2.4 `species.json`')));
const schemaFields = Object.keys(speciesSchemaProperties());

describe('the species schema matches contracts.md §2.4', () => {
  it('parsed a real example, so the comparison below is not vacuous', () => {
    // Every assertion here is a set comparison. If the extractor returned an
    // empty object — a renamed heading, a changed fence — they would all pass
    // while comparing nothing at all.
    expect(documented.length).toBeGreaterThan(10);
    expect(documented).toContain('lifespanMonths');
    expect(schemaFields.length).toBeGreaterThan(10);
  });

  it('documents every field the schema declares', () => {
    const undocumented = schemaFields
      .filter((field) => !documented.includes(field))
      .filter((field) => !AMENDMENT_PENDING.includes(field))
      .sort();
    expect(
      undocumented,
      'the schema declares fields contracts.md §2.4 does not show. §2.4 is what an author copies ' +
        'when writing new species content, so a field missing from it is a content set that fails ' +
        'validation on first load.',
    ).toEqual([]);
  });

  it('declares every field contracts.md §2.4 documents', () => {
    expect(
      documented.filter((field) => !schemaFields.includes(field)).sort(),
      'contracts.md §2.4 documents a species field the schema does not accept. The contract is ' +
        'normative (§0), so the schema is the thing that gets fixed.',
    ).toEqual([]);
  });

  it('carries the three fields mages-and-species adds, in both places', () => {
    for (const field of ['maturityMonths', 'mageAptitude', 'laborAffinity']) {
      expect(documented, `contracts.md §2.4 does not document ${field}`).toContain(field);
      expect(schemaFields, `the schema does not declare ${field}`).toContain(field);
      expect(speciesSchemaRequired(), `${field} is optional in the schema`).toContain(field);
    }
  });

  it('states the direction of rediscoveryAffinity in the contract itself', () => {
    // The `species-traits` spec makes higher-is-better a requirement, and the
    // reading was genuinely ambiguous before this change: "multiplier against
    // rediscoveryMultiplier" does not say which way. The contract has to carry
    // the answer, or every implementer re-decides it.
    const example = exampleUnder('### 2.4 `species.json`');
    expect(example).toMatch(/rediscoveryAffinity/u);
    expect(example).toMatch(/DIVISOR/u);
    expect(example).toMatch(/[Hh]igher is better/u);
  });

  it('names no martial or soldier-effectiveness field', () => {
    expect(documented.filter((field) => /martial|soldier|combat/iu.test(field))).toEqual([]);
    expect(schemaFields.filter((field) => /martial|soldier|combat/iu.test(field))).toEqual([]);
  });
});

describe('the pending amendment allowance is honest about itself', () => {
  it('lists only fields that are genuinely still missing from §2.4', () => {
    // Fails the day the amendment lands. That is the point: the failure message
    // is the instruction to delete the constant, and an allowance nobody is
    // forced to revisit is an allowance that outlives its reason.
    for (const field of AMENDMENT_PENDING) {
      expect(
        documented,
        `contracts.md §2.4 now documents "${field}". The amendment has landed — remove it from ` +
          'AMENDMENT_PENDING so this check compares the two field sets for equality again.',
      ).not.toContain(field);
    }
  });

  it('lists only fields the schema really requires', () => {
    for (const field of AMENDMENT_PENDING) {
      expect(schemaFields).toContain(field);
      expect(speciesSchemaRequired()).toContain(field);
    }
  });
});
