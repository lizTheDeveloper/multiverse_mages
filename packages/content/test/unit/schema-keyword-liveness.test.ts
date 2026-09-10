/*
 * Multiverse Mages — verifier 1: every keyword the schemas use is enforced.
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
 * `json-schema.ts` promises that the interpreter "cannot silently fall behind
 * the schemas". That promise is worth exactly as much as the thing checking it.
 *
 * Three failure modes are covered here, and they are different:
 *
 *  1. **A keyword the interpreter does not recognise.** The interpreter throws
 *     at compile time — but only at positions its own `#compileCheck` descends
 *     into. This file walks the seven shipped schemas independently, and injects
 *     an unimplemented keyword at *every* position it finds, so a position the
 *     compile check never visits is a test failure rather than a blind spot.
 *  2. **A keyword the interpreter recognises and then does not act on.** Set
 *     membership is not enforcement: a keyword can sit in `ASSERTION_KEYWORDS`
 *     while nothing in `validate` reads it. Every keyword the schemas use gets a
 *     behavioural probe — an instance that violates it must be reported, an
 *     instance that satisfies it must not be, and deleting the keyword from the
 *     probe schema must make the violating instance clean. The third assertion
 *     is what stops a probe passing because of a sibling keyword.
 *  3. **A keyword the interpreter recognises but silently drops in context.**
 *     A sibling of `$ref`, a `$ref` chained through a second `$ref`, a
 *     mistyped keyword value: each compiles clean and asserts nothing. These
 *     are dead constraints that no shipped schema contains *today*, which is
 *     the only reason they are hardening rather than defects.
 *
 * A keyword used by a schema with no probe registered below fails the suite. A
 * verifier that quietly covers the keywords somebody remembered is the problem,
 * not the fix.
 */

import { describe, expect, it } from 'vitest';

import { CONTENT_FILES, CompiledSchema, SchemaCompileError } from '@mm/content';

import type { KeywordOccurrence, SchemaObject } from './schema-verifier-support.js';
import {
  isPlainObject,
  keywordOccurrences,
  schemaFileFor,
  shippedSchemaDocuments,
  subschemaPositions,
} from './schema-verifier-support.js';

const schemas = shippedSchemaDocuments();

const occurrences: KeywordOccurrence[] = [...schemas].flatMap(([contentFile, document]) =>
  keywordOccurrences(contentFile, document),
);

/** Keywords the schemas use, in code-unit order. Derived, never listed. */
const usedKeywords = [...new Set(occurrences.map((o) => o.keyword))].sort();

/** Keywords that are documentation and are permitted to assert nothing. */
const ANNOTATION_KEYWORDS = ['$comment', '$id', '$schema', 'description', 'title'];

/**
 * One behavioural probe: a minimal schema, an instance that violates the
 * keyword, an instance that satisfies it, and the same schema with the keyword
 * removed.
 *
 * `without` is written out rather than computed so that the removal is visible
 * and unambiguous — several probes remove a keyword from a *nested* position,
 * and a computed removal would need a pointer, which is one more thing to get
 * quietly wrong.
 */
interface KeywordProbe {
  readonly note: string;
  readonly schema: SchemaObject;
  readonly violating: unknown;
  readonly satisfying: unknown;
  readonly without: SchemaObject;
}

const PROBES: Readonly<Record<string, readonly KeywordProbe[]>> = {
  type: [
    {
      note: 'an integer field rejects a string',
      schema: { type: 'integer' },
      violating: 'not an integer',
      satisfying: 1,
      without: {},
    },
  ],
  enum: [
    {
      note: 'a closed set rejects a value outside it',
      schema: { type: 'string', enum: ['tuned', 'untuned'] },
      violating: 'partially-tuned',
      satisfying: 'tuned',
      without: { type: 'string' },
    },
  ],
  const: [
    {
      note: 'a fixed value rejects any other',
      schema: { const: 7 },
      violating: 8,
      satisfying: 7,
      without: {},
    },
  ],
  required: [
    {
      note: 'a required field missing is reported',
      schema: { type: 'object', required: ['tier'] },
      violating: {},
      satisfying: { tier: 1 },
      without: { type: 'object' },
    },
  ],
  properties: [
    {
      note: 'a declared property is validated against its subschema',
      schema: { type: 'object', properties: { tier: { type: 'integer' } } },
      violating: { tier: 'three' },
      satisfying: { tier: 3 },
      without: { type: 'object' },
    },
  ],
  additionalProperties: [
    {
      note: 'additionalProperties:false rejects an undeclared property',
      schema: { type: 'object', properties: { tier: { type: 'integer' } }, additionalProperties: false },
      violating: { tier: 1, martialAffinity: 512 },
      satisfying: { tier: 1 },
      without: { type: 'object', properties: { tier: { type: 'integer' } } },
    },
    {
      note: 'additionalProperties as a schema validates every undeclared value',
      schema: { type: 'object', additionalProperties: { type: 'integer' } },
      violating: { terram: 'a lot' },
      satisfying: { terram: 1536 },
      without: { type: 'object' },
    },
  ],
  propertyNames: [
    {
      note: 'a malformed key is reported even when its value is fine',
      schema: {
        type: 'object',
        propertyNames: { type: 'string', pattern: '^[a-z]+$' },
        additionalProperties: { type: 'integer' },
      },
      violating: { Terram: 1536 },
      satisfying: { terram: 1536 },
      without: { type: 'object', additionalProperties: { type: 'integer' } },
    },
  ],
  items: [
    {
      note: 'each element is validated against the item subschema',
      schema: { type: 'array', items: { type: 'integer' } },
      violating: [1, 'two'],
      satisfying: [1, 2],
      without: { type: 'array' },
    },
  ],
  minItems: [
    {
      note: 'too few elements are reported',
      schema: { type: 'array', minItems: 2 },
      violating: [1],
      satisfying: [1, 2],
      without: { type: 'array' },
    },
  ],
  maxItems: [
    {
      note: 'too many elements are reported',
      schema: { type: 'array', maxItems: 1 },
      violating: [1, 2],
      satisfying: [1],
      without: { type: 'array' },
    },
  ],
  uniqueItems: [
    {
      note: 'a repeated element is reported',
      schema: { type: 'array', uniqueItems: true },
      violating: ['rego', 'rego'],
      satisfying: ['rego', 'creo'],
      without: { type: 'array' },
    },
  ],
  minLength: [
    {
      note: 'a short string is reported',
      schema: { type: 'string', minLength: 2 },
      violating: 'a',
      satisfying: 'ab',
      without: { type: 'string' },
    },
  ],
  maxLength: [
    {
      note: 'a long string is reported',
      schema: { type: 'string', maxLength: 1 },
      violating: 'ab',
      satisfying: 'a',
      without: { type: 'string' },
    },
  ],
  pattern: [
    {
      note: 'a string outside the pattern is reported',
      schema: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
      violating: 'Rego Limen',
      satisfying: 'rego-limen',
      without: { type: 'string' },
    },
  ],
  minimum: [
    {
      note: 'a value below the minimum is reported',
      schema: { type: 'integer', minimum: 2 },
      violating: 1,
      satisfying: 2,
      without: { type: 'integer' },
    },
  ],
  maximum: [
    {
      note: 'a value above the maximum is reported',
      schema: { type: 'integer', maximum: 1 },
      violating: 2,
      satisfying: 1,
      without: { type: 'integer' },
    },
  ],
  // `$ref` and `$defs` are one mechanism and are probed as one: the definition's
  // constraint has to reach the referencing position, or every `$defs` in every
  // shipped schema is decoration.
  $ref: [
    {
      note: 'the referenced definition constrains the referencing position',
      schema: { $defs: { fp: { type: 'integer' } }, type: 'array', items: { $ref: '#/$defs/fp' } },
      violating: ['not fixed point'],
      satisfying: [1024],
      without: { $defs: { fp: { type: 'integer' } }, type: 'array', items: {} },
    },
  ],
  $defs: [
    {
      note: 'a definition body is what a $ref enforces',
      schema: { $defs: { fp: { type: 'integer' } }, type: 'array', items: { $ref: '#/$defs/fp' } },
      violating: ['not fixed point'],
      satisfying: [1024],
      without: { $defs: { fp: {} }, type: 'array', items: { $ref: '#/$defs/fp' } },
    },
  ],
  minProperties: [
    {
      note: 'too few properties are reported',
      schema: { type: 'object', minProperties: 1 },
      violating: {},
      satisfying: { a: 1 },
      without: { type: 'object' },
    },
  ],
  oneOf: [
    {
      note: 'the branch matching the discriminator is checked in full, not merely the least-wrong one',
      schema: {
        oneOf: [
          { properties: { kind: { const: 'a' } }, required: ['kind'] },
          {
            properties: { kind: { const: 'b' }, x: { type: 'integer' } },
            required: ['kind', 'x'],
          },
        ],
      },
      // Matches the second branch's discriminator (`kind: "b"`) but omits the
      // field that branch additionally requires — proving the branch is
      // chosen by its `const` and then checked in full, rather than the
      // instance merely being tried against every branch until one is
      // cheapest to report.
      violating: { kind: 'b' },
      satisfying: { kind: 'b', x: 5 },
      without: {},
    },
  ],
};

function diagnosticsFor(schema: SchemaObject, instance: unknown): number {
  return new CompiledSchema(schema, 'probe').validate(instance, 'probe.json').length;
}

describe('the keyword walk sees what it claims to see', () => {
  it('walked every shipped schema and found keywords in each', () => {
    // Every assertion below is over `occurrences`. If the walker returned
    // nothing — a renamed directory, a broken parse — they would all pass while
    // checking nothing at all.
    expect(schemas.size).toBe(CONTENT_FILES.length);
    for (const contentFile of schemas.keys()) {
      const forFile = occurrences.filter((o) => o.contentFile === contentFile);
      expect(forFile.length, `no keywords found in ${schemaFileFor(contentFile)}`).toBeGreaterThan(10);
    }
    expect(occurrences.length).toBeGreaterThan(200);
  });

  it('found the keywords the schemas visibly contain', () => {
    for (const keyword of [
      '$defs',
      '$ref',
      'additionalProperties',
      'enum',
      'items',
      'maxItems',
      'maxLength',
      'maximum',
      'minItems',
      'minLength',
      'minimum',
      'pattern',
      'properties',
      'propertyNames',
      'required',
      'type',
      'uniqueItems',
    ]) {
      expect(usedKeywords, `the walk missed ${keyword}`).toContain(keyword);
    }
  });

  it('does not mistake a property name for a keyword', () => {
    // `species.json` declares a property called `curiosity` and another called
    // `personality`; a walker that stringified the document and grepped would
    // report both as keywords. Property names must never appear here.
    expect(usedKeywords).not.toContain('curiosity');
    expect(usedKeywords).not.toContain('personality');
    expect(usedKeywords).not.toContain('rediscoveryMultiplier');
    // Nor may an enum *member* be read as a keyword.
    expect(usedKeywords).not.toContain('untuned');
    expect(usedKeywords).not.toContain('summed-then-single-ward');
  });
});

describe('every keyword a schema uses is recognised by the interpreter', () => {
  it('rejects no shipped keyword as unimplemented', () => {
    const unrecognised: string[] = [];
    for (const occurrence of occurrences) {
      const positions = subschemaPositions(schemas.get(occurrence.contentFile) as SchemaObject);
      const schema = positions.get(occurrence.pointer) as SchemaObject;
      let message = '';
      try {
        new CompiledSchema({ [occurrence.keyword]: schema[occurrence.keyword] }, 'probe');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      if (message.includes(`unsupported JSON Schema keyword "${occurrence.keyword}"`)) {
        unrecognised.push(
          `${occurrence.schemaFile}${occurrence.pointer}: "${occurrence.keyword}"`,
        );
      }
    }
    expect(
      [...new Set(unrecognised)].sort(),
      'a shipped schema uses a keyword the interpreter does not implement. It is not enforced, so ' +
        'it is decoration: either implement it in json-schema.ts or delete it from the schema.',
    ).toEqual([]);
  });

  it('would have named the schema, the pointer and the keyword if one were unimplemented', () => {
    // The control for the check above. Without it, an extractor returning an
    // empty list would report "all keywords implemented" forever.
    const document = structuredClone(schemas.get('node.json') as SchemaObject);
    const defs = document['$defs'] as SchemaObject;
    const node = defs['node'] as SchemaObject;
    const properties = node['properties'] as SchemaObject;
    (properties['tier'] as SchemaObject)['multipleOf'] = 2;

    const found = keywordOccurrences('node.json', document).filter((o) => o.keyword === 'multipleOf');
    expect(found).toHaveLength(1);
    expect(found[0]?.pointer).toBe('#/$defs/node/properties/tier');
    expect(found[0]?.schemaFile).toBe('node.schema.json');
    expect(() => new CompiledSchema(document, 'schema/node.schema.json')).toThrow(
      /unsupported JSON Schema keyword "multipleOf"/u,
    );
  });
});

describe('the compile check reaches every position the schemas actually have', () => {
  // The gap this closes: the interpreter throws on an unknown keyword, but only
  // where `#compileCheck` descends. A subschema position it never visits is a
  // position where `multipleOf` — or anything else — is silently ignored.
  for (const [contentFile, document] of schemas) {
    const positions = [...subschemaPositions(document).keys()];

    it(`rejects an unimplemented keyword at all ${String(positions.length)} positions of ${schemaFileFor(contentFile)}`, () => {
      const unreached: string[] = [];
      for (const pointer of positions) {
        const copy = structuredClone(document);
        let cursor: unknown = copy;
        for (const segment of pointer.split('/').slice(1)) {
          cursor = isPlainObject(cursor) ? cursor[segment] : undefined;
        }
        if (!isPlainObject(cursor)) throw new Error(`${pointer} did not resolve`);
        cursor['multipleOf'] = 2;

        let threw = false;
        try {
          new CompiledSchema(copy, `schema/${schemaFileFor(contentFile)}`);
        } catch (error) {
          threw = error instanceof SchemaCompileError;
        }
        if (!threw) unreached.push(`${schemaFileFor(contentFile)}${pointer}`);
      }
      expect(
        unreached,
        'the interpreter compiled a schema carrying an unimplemented keyword at these positions. ' +
          'Any constraint written there would be silently ignored.',
      ).toEqual([]);
    });
  }
});

describe('every keyword a schema uses is acted on, not merely recognised', () => {
  it('has a probe for every keyword in use', () => {
    const unprobed = usedKeywords.filter(
      (keyword) => !ANNOTATION_KEYWORDS.includes(keyword) && !Object.hasOwn(PROBES, keyword),
    );
    expect(
      unprobed,
      'a shipped schema uses a keyword with no behavioural probe in this file. Being in the ' +
        "interpreter's keyword set is not evidence that validate() reads it — add a probe.",
    ).toEqual([]);
  });

  const probeCases = Object.entries(PROBES).flatMap(([keyword, probes]) =>
    probes.map((probe, index) => ({ keyword, index, probe })),
  );

  it.each(probeCases)('$keyword probe $index: $probe.note', ({ keyword, probe }) => {
    expect(
      diagnosticsFor(probe.schema, probe.violating),
      `"${keyword}" reported nothing for an instance that violates it`,
    ).toBeGreaterThan(0);

    expect(
      diagnosticsFor(probe.schema, probe.satisfying),
      `"${keyword}" reported a violation for an instance that satisfies it`,
    ).toBe(0);

    // Without this, a probe passes whenever any *sibling* keyword happens to
    // reject the violating instance, and the keyword under test could be dead.
    expect(
      diagnosticsFor(probe.without, probe.violating),
      `removing "${keyword}" from the probe schema still rejected the instance, so the ` +
        'diagnostic came from something else and this probe proves nothing',
    ).toBe(0);
  });

  it('treats annotation keywords as annotations, and only those', () => {
    for (const keyword of ANNOTATION_KEYWORDS) {
      const schema = new CompiledSchema({ [keyword]: 'anything at all' }, 'probe');
      expect(schema.validate({ whatever: [1, 'two'] }, 'probe.json')).toEqual([]);
    }
  });

  it('names the keywords it covers, so the count is not taken on trust', () => {
    expect(Object.keys(PROBES).sort()).toEqual([
      '$defs',
      '$ref',
      'additionalProperties',
      'const',
      'enum',
      'items',
      'maxItems',
      'maxLength',
      'maximum',
      'minItems',
      'minLength',
      'minProperties',
      'minimum',
      'oneOf',
      'pattern',
      'properties',
      'propertyNames',
      'required',
      'type',
      'uniqueItems',
    ]);
    // `const` is implemented and used by no shipped schema. It is probed anyway
    // so that the first schema to use it inherits a live check.
    expect(usedKeywords).not.toContain('const');
  });
});

describe('a constraint cannot be smuggled into a position the interpreter drops', () => {
  // None of these appear in a shipped schema. Each compiles clean and enforces
  // nothing, which makes them exactly the shape of defect this repository has
  // shipped three times — so the interpreter refuses them at compile time.

  it('refuses a $ref carrying sibling assertions, which resolution would discard', () => {
    expect(
      () =>
        new CompiledSchema(
          { $defs: { fp: { type: 'integer' } }, $ref: '#/$defs/fp', minimum: 1024 },
          'probe',
        ),
      'a sibling of $ref is dropped by resolution and enforces nothing',
    ).toThrow(SchemaCompileError);
  });

  it('still allows $defs and annotations beside a $ref, which are not assertions', () => {
    // The control. A ban that also rejected `$defs` next to a root `$ref` would
    // make the legitimate form unwritable.
    expect(
      () =>
        new CompiledSchema(
          { $defs: { fp: { type: 'integer' } }, $ref: '#/$defs/fp', title: 'a fixed-point value' },
          'probe',
        ),
    ).not.toThrow();
  });

  it('refuses a $ref chained through another $ref, whose target is never resolved', () => {
    expect(
      () =>
        new CompiledSchema(
          {
            $defs: { fp: { type: 'integer' }, cost: { $ref: '#/$defs/fp' } },
            $ref: '#/$defs/cost',
          },
          'probe',
        ),
      'resolution is a single lookup, so the second hop never happens and the type is not enforced',
    ).toThrow(SchemaCompileError);
  });

  it('refuses $defs anywhere but the document root, where no $ref can reach it', () => {
    expect(
      () =>
        new CompiledSchema(
          { type: 'object', properties: { cost: { $defs: { fp: { type: 'integer' } } } } },
          'probe',
        ),
    ).toThrow(SchemaCompileError);
  });

  it.each([
    ['minimum', { type: 'integer', minimum: '1024' }],
    ['maximum', { type: 'integer', maximum: null }],
    ['minLength', { type: 'string', minLength: '1' }],
    ['maxLength', { type: 'string', maxLength: 64.5 }],
    ['minItems', { type: 'array', minItems: '5' }],
    ['maxItems', { type: 'array', maxItems: -1 }],
    ['uniqueItems', { type: 'array', uniqueItems: 'true' }],
    ['enum', { type: 'string', enum: 'tuned' }],
    ['enum', { type: 'string', enum: [] }],
    ['required', { type: 'object', required: 'tier' }],
    ['required', { type: 'object', required: [1] }],
  ])('refuses a mistyped %s, which validate() would skip in silence', (keyword, schema) => {
    expect(
      () => new CompiledSchema(schema, 'probe'),
      `a mistyped "${String(keyword)}" is skipped by validate()'s typeof guard, so the constraint ` +
        'is dead while the schema still reads as though it were enforced',
    ).toThrow(SchemaCompileError);
  });

  it('refuses a pattern that is not a regular expression', () => {
    // Otherwise the failure is a RegExp SyntaxError thrown from inside
    // validation, on whichever record happened to be checked first.
    expect(() => new CompiledSchema({ type: 'string', pattern: '^[a-z' }, 'probe')).toThrow(
      SchemaCompileError,
    );
  });

  it('still compiles all seven shipped schemas, so the hardening bans nothing in use', () => {
    for (const [contentFile, document] of schemas) {
      expect(
        () => new CompiledSchema(document, `schema/${schemaFileFor(contentFile)}`),
        `${schemaFileFor(contentFile)} no longer compiles`,
      ).not.toThrow();
    }
  });
});
