/*
 * Multiverse Mages — verifier 3: the schemas and contracts.md §2 must agree.
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
 * `contracts.md` §2's worked examples are what an author copies when writing new
 * content. An example that omits a required field, or shows a value the schema
 * rejects, is not a documentation nit — it is a broken starting point that fails
 * validation on first load.
 *
 * `packages/rules-world/test/unit/species-contract-conformance.test.ts` does
 * this for §2.4 and found two real defects that way (`name` and `tuningStatus`
 * were required by the schema and absent from the example). This file
 * generalises it to all eight content files, and asserts two things per section
 * rather than one:
 *
 *  - **Field sets match in both directions.** A field in the schema and not the
 *    example is an author copying an invalid record. A field in the example and
 *    not the schema is content that fails to load.
 *  - **The example actually validates.** Field names matching is not the same as
 *    the example being loadable: §2.2's `nodes` list ends in a `"..."` elision,
 *    which is a perfectly clear thing for a human to read and not a `contentId`.
 *
 * Every known mismatch is listed in {@link PENDING_DOC_AMENDMENTS}, which is
 * written to delete itself: each entry is asserted to be *genuinely* still
 * wrong, so the day the documentation is amended this suite fails and the
 * failure message is the instruction to remove the entry. An allowance nobody is
 * forced to revisit is an allowance that becomes permanent.
 *
 * This suite reads `contracts.md`; it never writes it. The amendments it is
 * waiting for are recorded here, in the code, where they are visible.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { ContentFileName } from '@mm/content';
import { CompiledSchema } from '@mm/content';

import type { SchemaObject } from './schema-verifier-support.js';
import { isPlainObject, schemaFileFor, shippedSchemaDocuments } from './schema-verifier-support.js';

/** From packages/content/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const contracts = readFileSync(`${repoRoot}docs/design/contracts.md`, 'utf8');

const schemas = shippedSchemaDocuments();

// ---------------------------------------------------------------------------
// Reading the worked examples out of contracts.md

/**
 * The fenced example under a numbered heading.
 *
 * Anchored on the heading rather than on "the nth jsonc block": §2 has seven of
 * them, and matching the wrong one would compare, say, the species schema
 * against `tradition.json` and fail for a reason that reads as a contract
 * violation.
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
 * A scanner rather than a regex because §2's comments are the most informative
 * part of the examples — they carry the direction of `rediscoveryAffinity` and
 * the reasoning behind the rediscovery floor — and a regex cutting at the first
 * `//` would also cut inside any string containing one. Wrong silently, and
 * wrong in a way that surfaces as "the contract's example is not valid JSON".
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

function parseExample(jsonc: string): Record<string, unknown> {
  const withoutComments = stripLineComments(jsonc).replace(/,(\s*[}\]])/gu, '$1');
  const parsed: unknown = JSON.parse(withoutComments);
  if (!isPlainObject(parsed)) throw new Error('a §2 example did not parse to an object');
  return parsed;
}

/**
 * §2.1's single fence holds *two* standalone objects, one technique and one
 * form, rather than one array. Splitting on the brace-then-newline boundary is
 * what lets each be compared against its own schema.
 */
function parseExampleRecords(jsonc: string): Record<string, unknown>[] {
  const cleaned = stripLineComments(jsonc).trim();
  if (!cleaned.startsWith('{')) throw new Error('a §2 example does not begin with an object');
  const chunks: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) chunks.push(cleaned.slice(start, index + 1));
    }
  }
  return chunks.map((chunk) => parseExample(chunk));
}

// ---------------------------------------------------------------------------
// Which section documents which content file

interface DocumentedSection {
  readonly contentFile: ContentFileName;
  readonly heading: string;
  /** Index of the record within the fence, for §2.1's two-record example. */
  readonly recordIndex: number;
}

const SECTIONS: readonly DocumentedSection[] = [
  { contentFile: 'technique.json', heading: '### 2.1 `technique.json` / `form.json`', recordIndex: 0 },
  { contentFile: 'form.json', heading: '### 2.1 `technique.json` / `form.json`', recordIndex: 1 },
  { contentFile: 'cell.json', heading: '### 2.2 `cell.json`', recordIndex: 0 },
  { contentFile: 'node.json', heading: '### 2.3 `node.json`', recordIndex: 0 },
  { contentFile: 'species.json', heading: '### 2.4 `species.json`', recordIndex: 0 },
  { contentFile: 'tradition.json', heading: '### 2.5 `tradition.json`', recordIndex: 0 },
  { contentFile: 'territory.json', heading: '### 2.7 `territory.json`', recordIndex: 0 },
  { contentFile: 'god-cost.json', heading: '### 2.8 `god-cost.json`', recordIndex: 0 },
  { contentFile: 'god-constant.json', heading: '### 2.9 `god-constant.json`', recordIndex: 0 },
];

/**
 * `primitive.json` has a §2.6 and no worked example in it, so there is nothing
 * for the checks below to compare against. This is named rather than skipped.
 *
 * It is a genuine gap and the report says so, but it is the least consequential
 * of the eight: §3's normative table *is* compared against the shipped registry,
 * field for field, by `primitive-contract.test.ts`. What is missing is the
 * copyable record shape, not the semantics.
 */
const SECTION_WITHOUT_EXAMPLE: ContentFileName = 'primitive.json';

// ---------------------------------------------------------------------------
// Known disagreements, each asserted to be genuinely still present

interface PendingAmendment {
  readonly contentFile: ContentFileName;
  /** `'undocumented'`: schema declares it, the example does not show it. */
  readonly kind: 'undocumented' | 'invalid-example';
  /** Field name for `undocumented`; JSON pointer for `invalid-example`. */
  readonly at: string;
  readonly why: string;
}

/**
 * Empty this list as the amendments land. Each entry is checked below to be a
 * real, current disagreement — the moment `contracts.md` is fixed, the entry
 * fails and the failure says to delete it.
 */
const PENDING_DOC_AMENDMENTS: readonly PendingAmendment[] = [
];

function pendingFor(contentFile: ContentFileName, kind: PendingAmendment['kind']): string[] {
  return PENDING_DOC_AMENDMENTS.filter(
    (entry) => entry.contentFile === contentFile && entry.kind === kind,
  ).map((entry) => entry.at);
}

// ---------------------------------------------------------------------------
// Schema helpers

/** The `$defs` name of the record type a content file is an array of. */
function recordDefName(document: SchemaObject): string {
  const items = document['items'];
  const ref = isPlainObject(items) ? items['$ref'] : undefined;
  if (typeof ref !== 'string') throw new Error('the schema root is not an array of $ref records');
  return ref.slice('#/$defs/'.length);
}

function recordProperties(document: SchemaObject): SchemaObject {
  const defs = document['$defs'];
  const record = isPlainObject(defs) ? defs[recordDefName(document)] : undefined;
  const properties = isPlainObject(record) ? record['properties'] : undefined;
  if (!isPlainObject(properties)) throw new Error('the record definition declares no properties');
  return properties;
}

/** A compiled schema for one record, so a §2 example can be validated alone. */
function recordSchema(document: SchemaObject, contentFile: ContentFileName): CompiledSchema {
  return new CompiledSchema(
    { $defs: document['$defs'], $ref: `#/$defs/${recordDefName(document)}` },
    `record/${schemaFileFor(contentFile)}`,
  );
}

const examples = new Map<ContentFileName, Record<string, unknown>>();
for (const section of SECTIONS) {
  const records = parseExampleRecords(exampleUnder(section.heading));
  const record = records[section.recordIndex];
  if (record === undefined) {
    throw new Error(`${section.heading} has no record at index ${String(section.recordIndex)}`);
  }
  examples.set(section.contentFile, record);
}

// ---------------------------------------------------------------------------
// The suite

describe('the §2 examples were really extracted, so the comparisons are not vacuous', () => {
  it('found one example per documented section', () => {
    expect(examples.size).toBe(SECTIONS.length);
    expect(SECTIONS.length + 1).toBe(schemas.size);
  });

  it('split §2.1 into a technique and a form, not one blurred record', () => {
    expect(examples.get('technique.json')?.['id']).toBe('rego');
    expect(examples.get('form.json')?.['id']).toBe('corpus');
  });

  it('parsed examples with real fields in them', () => {
    for (const [contentFile, example] of examples) {
      expect(
        Object.keys(example).length,
        `the §2 example for ${contentFile} parsed to an empty object`,
      ).toBeGreaterThan(2);
      expect(example['id'], `the §2 example for ${contentFile} has no id`).toBeTypeOf('string');
    }
  });

  it('kept the comments, which are where §2 does most of its explaining', () => {
    const species = exampleUnder('### 2.4 `species.json`');
    expect(species).toMatch(/DIVISOR/u);
    expect(species).toMatch(/[Hh]igher is better/u);
  });
});

describe('every schema field is shown by the example an author copies', () => {
  it.each([...examples.keys()])('%s', (contentFile) => {
    const schemaFields = Object.keys(recordProperties(schemas.get(contentFile) as SchemaObject));
    const documented = Object.keys(examples.get(contentFile) as Record<string, unknown>);
    const allowed = pendingFor(contentFile, 'undocumented');

    expect(
      schemaFields.filter((field) => !documented.includes(field) && !allowed.includes(field)).sort(),
      `the ${schemaFileFor(contentFile)} schema declares fields contracts.md §2 does not show. §2 ` +
        'is what an author copies when writing new content, so a field missing from it is a ' +
        'content set that fails validation on first load.',
    ).toEqual([]);
  });
});

describe('every field the example shows is one the schema accepts', () => {
  it.each([...examples.keys()])('%s', (contentFile) => {
    const schemaFields = Object.keys(recordProperties(schemas.get(contentFile) as SchemaObject));
    const documented = Object.keys(examples.get(contentFile) as Record<string, unknown>);

    expect(
      documented.filter((field) => !schemaFields.includes(field)).sort(),
      `contracts.md §2 documents a ${contentFile} field the schema does not accept. The contract ` +
        'is normative (§0), so the schema is the thing that gets fixed.',
    ).toEqual([]);
  });
});

describe('every §2 example is content the loader would accept', () => {
  it.each([...examples.keys()])('%s', (contentFile) => {
    const document = schemas.get(contentFile) as SchemaObject;
    const diagnostics = recordSchema(document, contentFile).validate(
      examples.get(contentFile),
      contentFile,
    );
    const allowed = pendingFor(contentFile, 'invalid-example');

    expect(
      diagnostics.filter((diagnostic) => !allowed.includes(diagnostic.pointer)).map(
        (diagnostic) => `${diagnostic.pointer} ${diagnostic.message}`,
      ),
      `the §2 example for ${contentFile} is not valid content. Copying it produces a hard load ` +
        'failure, which is the one thing a worked example must never do.',
    ).toEqual([]);
  });
});

describe('the section with no example is named rather than passed over', () => {
  it('records that §2.6 shows no primitive record', () => {
    const headingAt = contracts.indexOf('### 2.6 `primitive.json`');
    expect(headingAt).toBeGreaterThan(-1);
    // Bounded by the *next heading* as well as by the horizontal rule. §2.6 is
    // no longer the last subsection of §2 — §2.7 `territory.json` follows it and
    // carries an example — so slicing to `\n---` alone would read §2.7's fence
    // as §2.6's and report a worked example that is not there.
    const bodyEnd = Math.min(
      ...['\n---', '\n### '].map((marker) => {
        const at = contracts.indexOf(marker, headingAt + 1);
        return at === -1 ? contracts.length : at;
      }),
    );
    const body = contracts.slice(headingAt, bodyEnd);

    // If §2.6 gains an example, this fails, and the fix is to move
    // primitive.json into SECTIONS so it is checked like the other six.
    expect(
      body.includes('```jsonc'),
      '§2.6 now carries a worked example. Add primitive.json to SECTIONS so the field-set and ' +
        'validity checks cover it, and delete this test.',
    ).toBe(false);
    expect(SECTIONS.map((section) => section.contentFile)).not.toContain(SECTION_WITHOUT_EXAMPLE);
    // The semantics are covered even though the record shape is not.
    expect(body).toMatch(/See §3/u);
  });
});

describe('the pending amendments are honest about themselves', () => {
  it('names only fields §2 genuinely still omits', () => {
    for (const entry of PENDING_DOC_AMENDMENTS) {
      if (entry.kind !== 'undocumented') continue;
      const documented = Object.keys(examples.get(entry.contentFile) as Record<string, unknown>);
      expect(
        documented,
        `contracts.md §2 now documents "${entry.at}" for ${entry.contentFile}. The amendment has ` +
          'landed — remove it from PENDING_DOC_AMENDMENTS so the field sets are compared for ' +
          'equality again.',
      ).not.toContain(entry.at);
    }
  });

  it('names only fields the schema genuinely declares', () => {
    for (const entry of PENDING_DOC_AMENDMENTS) {
      if (entry.kind !== 'undocumented') continue;
      const schemaFields = Object.keys(recordProperties(schemas.get(entry.contentFile) as SchemaObject));
      expect(
        schemaFields,
        `PENDING_DOC_AMENDMENTS claims the ${entry.contentFile} schema declares "${entry.at}", ` +
          'and it does not. The allowance is stale.',
      ).toContain(entry.at);
    }
  });

  it('names only example defects that are genuinely still there', () => {
    for (const entry of PENDING_DOC_AMENDMENTS) {
      if (entry.kind !== 'invalid-example') continue;
      const document = schemas.get(entry.contentFile) as SchemaObject;
      const diagnostics = recordSchema(document, entry.contentFile).validate(
        examples.get(entry.contentFile),
        entry.contentFile,
      );
      expect(
        diagnostics.map((diagnostic) => diagnostic.pointer),
        `the §2 example for ${entry.contentFile} is now valid at ${JSON.stringify(entry.at)}. ` +
          'Remove the entry so the example is checked whole.',
      ).toContain(entry.at);
    }
  });

  it('reports what it is still waiting for, so the gap is not silent', () => {
    const lines = PENDING_DOC_AMENDMENTS.map(
      (entry) => `${entry.contentFile} [${entry.kind}] ${JSON.stringify(entry.at)}: ${entry.why}`,
    );
    process.stdout.write(`\n  contracts.md §2 amendments outstanding: ${String(lines.length)}\n`);
    for (const line of lines) process.stdout.write(`    ${line}\n`);

    // An empty list is the goal state, not a failure. This assertion used to
    // require at least one outstanding amendment, which quietly encoded "there
    // will always be documentation debt" as an invariant — so clearing the last
    // one broke the suite. What matters is that the list is honest, and the two
    // tests above already enforce that: every entry must name a field the schema
    // genuinely declares and the document genuinely still omits.
    expect(lines.length).toBeGreaterThanOrEqual(0);
  });
});
